/**
 * google_places_match — Supabase Edge Function
 *
 * Processes a single async Google Places matching job:
 *  1. Marks job as 'running'
 *  2. Fetches all tncera_locations where geocode_status = 'pending'
 *     AND the row has not been flagged as a skip_matching duplicate
 *  3. For each row: calls Google Places Text Search (New API) with a
 *     minimal field mask (no rating/photo fields to stay on Pro tier)
 *  4. Confidence gates the result — auto-accept if name similarity ≥ 0.8
 *     AND place is in the same PIN-code area; otherwise routes to needs_review
 *  5. Zero results → leaves row as 'pending' for Nominatim fallback
 *  6. Updates the job row with final counts
 *
 * GOOGLE_PLACES_API_KEY must be set as a Supabase secret:
 *   supabase secrets set GOOGLE_PLACES_API_KEY=<your-key>
 *
 * Called by the Admin Panel "Match via Google Places" button.
 * Fire-and-forget pattern: client does not poll; Admin Panel reads job
 * status on the next page load/refresh.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PLACES_API_BASE = 'https://places.googleapis.com/v1/places:searchText'
// Minimal field mask — stays on Pro tier ($32/1k), avoids reviews/photos
const FIELD_MASK = 'places.displayName,places.formattedAddress,places.location,places.id'

// Name similarity threshold for auto-accept (0–1, Dice coefficient)
const NAME_SIMILARITY_THRESHOLD = 0.8

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Dice coefficient: bigram-based string similarity (0 = no match, 1 = identical) */
function diceSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 1
  if (na.length < 2 || nb.length < 2) return 0

  const getBigrams = (s: string): Map<string, number> => {
    const map = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2)
      map.set(bg, (map.get(bg) ?? 0) + 1)
    }
    return map
  }

  const bigramsA = getBigrams(na)
  const bigramsB = getBigrams(nb)
  let intersection = 0
  for (const [bg, count] of bigramsA) {
    const bCount = bigramsB.get(bg) ?? 0
    intersection += Math.min(count, bCount)
  }
  return (2 * intersection) / (na.length - 1 + nb.length - 1)
}

/** Extract 6-digit PIN code from an address string, or null */
function extractPin(address: string): string | null {
  const m = address.match(/\b(\d{6})\b/)
  return m ? m[1] : null
}

/** Call Google Places Text Search (New) for one query */
async function searchPlaces(query: string, apiKey: string): Promise<any[]> {
  const res = await fetch(PLACES_API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 3 }),
  })

  if (!res.ok) return []

  const data = await res.json()
  return data.places ?? []
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Only POST
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  // ── 1. Parse request body for optional job_id (or create a new job) ──────
  let body: any = {}
  try { body = await req.json() } catch {}

  let jobId: string = body.job_id

  if (!jobId) {
    // Create a new job row
    const { data: newJob, error: jobErr } = await supabase
      .from('google_places_match_jobs')
      .insert({ status: 'queued' })
      .select('id')
      .single()

    if (jobErr) {
      return new Response(JSON.stringify({ error: jobErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    jobId = newJob.id
  }

  // ── 2. Mark job as running ────────────────────────────────────────────────
  await supabase
    .from('google_places_match_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', jobId)

  try {
    // ── 3. Fetch rows eligible for matching ─────────────────────────────────
    // Eligible: pending AND not resolved as 'skip_matching' in any duplicate pair
    const { data: pendingRows, error: fetchErr } = await supabase
      .from('tncera_locations')
      .select('id, facility_name, address_text, query_text')
      .eq('geocode_status', 'pending')

    if (fetchErr) throw new Error(fetchErr.message)

    const rows = pendingRows ?? []

    // Fetch all skip_matching resolutions to exclude flagged rows
    const { data: skipped } = await supabase
      .from('tncera_duplicate_resolutions')
      .select('row_a_id, row_b_id')
      .eq('resolution', 'skip_matching')

    const skippedIds = new Set<string>()
    for (const s of skipped ?? []) {
      skippedIds.add(s.row_a_id)
      skippedIds.add(s.row_b_id)
    }

    const eligible = rows.filter((r: any) => !skippedIds.has(r.id))

    // Update job total
    await supabase
      .from('google_places_match_jobs')
      .update({ total_rows: eligible.length })
      .eq('id', jobId)

    let matched = 0
    let needsReview = 0
    let noMatch = 0

    // ── 4. Process each row ─────────────────────────────────────────────────
    for (let i = 0; i < eligible.length; i++) {
      const row: any = eligible[i]

      // Build a rich search query: facility name + address
      const searchQuery = `${row.facility_name} ${row.address_text}`
      const places = await searchPlaces(searchQuery, apiKey)

      if (places.length === 0) {
        // No Google results — leave as pending for Nominatim fallback
        noMatch++
      } else {
        const best = places[0]
        const placeName: string = best.displayName?.text ?? ''
        const placeAddress: string = best.formattedAddress ?? ''
        const similarity = diceSimilarity(row.facility_name, placeName)
        const rowPin = extractPin(row.address_text)
        const placePin = extractPin(placeAddress)
        const pinMatch = rowPin !== null && placePin !== null && rowPin === placePin

        const candidate = {
          place_id: best.id,
          name: placeName,
          address: placeAddress,
          lat: best.location?.latitude,
          lng: best.location?.longitude,
          similarity,
          pin_match: pinMatch,
        }

        if (similarity >= NAME_SIMILARITY_THRESHOLD && pinMatch) {
          // High confidence — auto-accept
          await supabase
            .from('tncera_locations')
            .update({
              lat: best.location?.latitude,
              lng: best.location?.longitude,
              geocode_status: 'geocoded',
              geocode_source: 'google_places',
              google_place_id: best.id,
            })
            .eq('id', row.id)

          matched++
        } else {
          // Low confidence — route to needs_review
          await supabase
            .from('tncera_locations')
            .update({
              geocode_status: 'needs_review',
              review_candidate: candidate,
            })
            .eq('id', row.id)

          needsReview++
        }
      }

      // Update progress periodically (every 10 rows)
      if ((i + 1) % 10 === 0 || i === eligible.length - 1) {
        await supabase
          .from('google_places_match_jobs')
          .update({ processed_rows: i + 1 })
          .eq('id', jobId)
      }
    }

    // ── 5. Mark job done ────────────────────────────────────────────────────
    await supabase
      .from('google_places_match_jobs')
      .update({
        status: 'done',
        processed_rows: eligible.length,
        matched_count: matched,
        needs_review_count: needsReview,
        no_match_count: noMatch,
        finished_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    return new Response(
      JSON.stringify({ job_id: jobId, matched, needs_review: needsReview, no_match: noMatch }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    await supabase
      .from('google_places_match_jobs')
      .update({
        status: 'failed',
        error_message: err.message,
        finished_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

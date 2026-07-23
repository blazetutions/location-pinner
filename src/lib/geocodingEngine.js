/**
 * GeocodingEngine — client-side Nominatim geocoding helpers.
 *
 * Responsibilities:
 *   - Build Nominatim search URLs with properly encoded query strings.
 *   - Send requests with the required User-Agent header.
 *   - Return { lat, lng } on success, null on empty results or exhausted retries.
 *   - Never throw — all errors are caught internally.
 *   - runGeocodingPass: fetch all ungeocoded rows from Supabase and geocode them.
 *
 * Nominatim usage policy requirements satisfied here:
 *   - URL encoding via encodeURIComponent  (Requirement 14.2)
 *   - User-Agent: ChennaiHealthMap/1.0      (Requirement 14.3)
 *   - Retry once after 2 s on network error or HTTP 429 (Requirements 13.1, 13.2)
 *
 * runGeocodingPass satisfies:
 *   - Requirements 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 2.8, 2.9
 *   - Requirements 13.3, 13.4, 13.5
 */

import { applyJitter } from './applyJitter.js'
import { supabase } from '../supabaseClient.js'

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'ChennaiHealthMap/1.0'
const RETRY_DELAY_MS = 2000
const RATE_LIMIT_MS = 1000

/**
 * Resolves after `ms` milliseconds.
 * Exported so the geocoding pass (task 5.4) can reuse it for rate-limiting.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Attempts a single Nominatim HTTP request for `queryText`.
 *
 * @param {string} queryText
 * @returns {Promise<{ lat: number, lng: number } | null | 'retry'>}
 *   - `{ lat, lng }` on a successful non-empty response
 *   - `null`          on an empty result array (address not resolvable — no retry)
 *   - `'retry'`       on a network error or HTTP 429 (caller should retry)
 */
async function attemptGeocode(queryText) {
  const url =
    `${NOMINATIM_BASE}?q=${encodeURIComponent(queryText)}&format=json&limit=1`

  let response
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    })
  } catch {
    // Network error (DNS failure, timeout, CORS block, etc.)
    return 'retry'
  }

  if (response.status === 429) {
    return 'retry'
  }

  // For any other non-OK status treat as a retryable failure so the row can
  // be attempted again in a future pass, consistent with Requirement 13.4.
  if (!response.ok) {
    return 'retry'
  }

  let data
  try {
    data = await response.json()
  } catch {
    return 'retry'
  }

  if (!Array.isArray(data) || data.length === 0) {
    // Empty result — address is genuinely unresolvable; do not retry.
    return null
  }

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
  }
}

/**
 * Geocodes `queryText` via Nominatim, retrying once on network errors or 429s.
 *
 * @param {string} queryText  - The address string to geocode.
 * @param {number} [maxRetries=1] - How many retries are allowed on transient failures.
 * @returns {Promise<{ lat: number, lng: number } | null>}
 */
export async function geocodeWithRetry(queryText, maxRetries = 1) {
  try {
    const firstResult = await attemptGeocode(queryText)

    if (firstResult !== 'retry') {
      // Either a valid coordinate pair or null (empty results — don't retry).
      return firstResult
    }

    // Transient failure — retry up to maxRetries times.
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      await sleep(RETRY_DELAY_MS)
      const retryResult = await attemptGeocode(queryText)
      if (retryResult !== 'retry') {
        return retryResult
      }
    }

    // All retries exhausted.
    return null
  } catch {
    // Belt-and-suspenders: never let an unexpected error escape.
    return null
  }
}

/**
 * Runs a full geocoding pass over all rows in the Supabase `locations` table
 * where `lat IS NULL`, processing PHC rows before HSC rows so parent
 * coordinates are available for the PHC-fallback strategy.
 *
 * For each row:
 *  - Calls geocodeWithRetry. On success: saves lat/lng with geocode_level = 'geocoded'.
 *  - On null result for an HSC row: looks up the parent PHC's coordinates.
 *    If available: applies jitter and stores with geocode_level = 'phc-fallback'.
 *    If parent coords are also null (or parent_phc_id is missing): increments failed.
 *  - Enforces a 1000 ms sleep after every Nominatim request (rate limiting).
 *  - Invokes onProgress(current, total) after processing each row.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 2.8, 2.9, 13.3, 13.4, 13.5
 *
 * @param {(current: number, total: number) => void} onProgress
 * @returns {Promise<{ geocoded: number, fallback: number, failed: number }>}
 */
export async function runGeocodingPass(onProgress) {
  // Step 1: Fetch all ungeocoded rows — PHC rows first (Requirement 2.1)
  const { data: phcRows = [] } = await supabase
    .from('locations')
    .select('*')
    .eq('level', 'phc')
    .is('lat', null)

  const { data: hscRows = [] } = await supabase
    .from('locations')
    .select('*')
    .eq('level', 'hsc')
    .is('lat', null)

  const allRows = [...(phcRows ?? []), ...(hscRows ?? [])]
  const total = allRows.length
  const counts = { geocoded: 0, fallback: 0, failed: 0 }

  // Step 2: Process each row with 1 req/sec throttling (Requirement 2.2)
  for (let i = 0; i < total; i++) {
    const row = allRows[i]

    // Geocode via Nominatim (with built-in retry logic for 429 / network errors)
    const result = await geocodeWithRetry(row.query_text)

    if (result !== null) {
      // Success: store coordinates with geocode_level = 'geocoded' (Requirement 2.3)
      await supabase
        .from('locations')
        .update({ lat: result.lat, lng: result.lng, geocode_level: 'geocoded' })
        .eq('id', row.id)
      counts.geocoded++
    } else if (row.level === 'hsc') {
      // Empty Nominatim result for an HSC row — attempt PHC fallback (Requirement 2.4)
      if (row.parent_phc_id == null) {
        // No parent reference — can't do fallback (Requirement 2.6)
        counts.failed++
      } else {
        const { data: parent } = await supabase
          .from('locations')
          .select('lat, lng')
          .eq('id', row.parent_phc_id)
          .single()

        if (parent && parent.lat != null) {
          // Parent is geocoded — apply jitter and save (Requirement 2.4)
          const jittered = applyJitter(parent.lat, parent.lng)
          await supabase
            .from('locations')
            .update({ lat: jittered.lat, lng: jittered.lng, geocode_level: 'phc-fallback' })
            .eq('id', row.id)
          counts.fallback++
        } else {
          // Parent not yet geocoded — leave row for future pass (Requirement 2.6)
          counts.failed++
        }
      }
    } else {
      // PHC row that Nominatim couldn't resolve — increment failed (Requirement 13.3, 13.4)
      counts.failed++
    }

    // Enforce 1000 ms between every Nominatim request (Requirement 2.2)
    await sleep(RATE_LIMIT_MS)

    // Notify caller of progress (Requirement 2.7)
    onProgress(i + 1, total)
  }

  // Return summary — geocoded + fallback + failed === total (Requirement 2.8, 13.5)
  return counts
}

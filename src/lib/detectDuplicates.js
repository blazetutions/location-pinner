/**
 * detectDuplicates.js
 *
 * Client-side utility to find potential duplicate pairs in tncera_locations
 * before a Google Places matching job is triggered.
 *
 * Scan scope: entire dataset (existing rows + newly uploaded batch) so that
 * re-uploads of already-pinned clinics with typo'd addresses are caught.
 *
 * A pair is flagged when:
 *  - Both rows share the same 6-digit PIN code in their address_text, AND
 *  - Their facility names are similar (Dice coefficient ≥ 0.7), AND
 *  - Their full address texts are NOT identical (avoids flagging true duplicates
 *    that were legitimately upserted via the conflict key)
 *
 * Returns an array of { rowA, rowB, similarity } groups for admin review.
 * Already-resolved pairs (from tncera_duplicate_resolutions) are excluded.
 */

import { supabase } from '../supabaseClient.js'

const SIMILARITY_THRESHOLD = 0.7

/** Dice coefficient bigram similarity (0–1) */
function diceSimilarity(a, b) {
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 1
  if (na.length < 2 || nb.length < 2) return 0

  const getBigrams = s => {
    const map = new Map()
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

/** Extract 6-digit PIN from an address string, or null */
function extractPin(address) {
  const m = (address ?? '').match(/\b(\d{6})\b/)
  return m ? m[1] : null
}

/**
 * Fetch all pending rows + any already-resolved pairs, then return
 * unresolved duplicate groups for admin review.
 *
 * @returns {Promise<{
 *   pairs: Array<{ rowA: object, rowB: object, similarity: number }>,
 *   error: string | null
 * }>}
 */
export async function detectDuplicates() {
  // Fetch all rows (entire dataset — see scope decision in Phase 5 notes)
  const { data: rows, error: rowErr } = await supabase
    .from('tncera_locations')
    .select('id, facility_name, address_text, geocode_status')

  if (rowErr) return { pairs: [], error: rowErr.message }

  // Fetch already-resolved pairs so we don't re-prompt them
  const { data: resolutions, error: resErr } = await supabase
    .from('tncera_duplicate_resolutions')
    .select('row_a_id, row_b_id')

  if (resErr) return { pairs: [], error: resErr.message }

  const resolvedPairs = new Set(
    (resolutions ?? []).map(r => `${r.row_a_id}:${r.row_b_id}`)
  )

  // Group rows by PIN for O(n) within-PIN comparisons instead of O(n²) global
  const byPin = new Map()
  for (const row of rows ?? []) {
    const pin = extractPin(row.address_text)
    if (!pin) continue
    if (!byPin.has(pin)) byPin.set(pin, [])
    byPin.get(pin).push(row)
  }

  const pairs = []

  for (const group of byPin.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]
        const b = group[j]

        // Skip if already resolved
        const [idA, idB] = [a.id, b.id].sort()
        if (resolvedPairs.has(`${idA}:${idB}`)) continue

        // Skip if addresses are identical (same row uploaded twice via upsert — not a problem)
        if (a.address_text === b.address_text) continue

        const similarity = diceSimilarity(a.facility_name, b.facility_name)
        if (similarity >= SIMILARITY_THRESHOLD) {
          pairs.push({ rowA: a, rowB: b, similarity })
        }
      }
    }
  }

  // Sort by similarity descending so the most likely duplicates come first
  pairs.sort((x, y) => y.similarity - x.similarity)

  return { pairs, error: null }
}

/**
 * Persist an admin resolution for a duplicate pair.
 *
 * @param {string} rowAId
 * @param {string} rowBId
 * @param {'skip_matching' | 'not_duplicate'} resolution
 * @returns {Promise<{ success: boolean, error: string | null }>}
 */
export async function resolveDuplicatePair(rowAId, rowBId, resolution) {
  // Canonical ordering: always store smaller UUID as row_a
  const [a, b] = [rowAId, rowBId].sort()

  const { error } = await supabase
    .from('tncera_duplicate_resolutions')
    .upsert(
      { row_a_id: a, row_b_id: b, resolution },
      { onConflict: 'row_a_id,row_b_id' }
    )

  if (error) return { success: false, error: error.message }
  return { success: true, error: null }
}

/**
 * Bulk-resolve multiple pairs with the same resolution.
 *
 * @param {Array<{ rowAId: string, rowBId: string }>} pairs
 * @param {'skip_matching' | 'not_duplicate'} resolution
 * @returns {Promise<{ success: boolean, error: string | null }>}
 */
export async function bulkResolvePairs(pairs, resolution) {
  const rows = pairs.map(({ rowAId, rowBId }) => {
    const [a, b] = [rowAId, rowBId].sort()
    return { row_a_id: a, row_b_id: b, resolution }
  })

  const { error } = await supabase
    .from('tncera_duplicate_resolutions')
    .upsert(rows, { onConflict: 'row_a_id,row_b_id' })

  if (error) return { success: false, error: error.message }
  return { success: true, error: null }
}

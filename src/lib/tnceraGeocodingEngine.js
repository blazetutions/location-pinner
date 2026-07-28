/**
 * TNCERAGeocodingEngine — client-side geocoding pass for TNCERA locations.
 *
 * Responsibilities:
 *   - Fetch all `tncera_locations` rows where `geocode_status = 'pending'`.
 *   - Notify the UI of the estimated duration before starting (onEstimate).
 *   - Geocode each row via the existing geocodeWithRetry helper.
 *   - On success: persist lat, lng, geocode_status = 'geocoded'.
 *   - On null result: set geocode_status = 'failed', collect in failedRows.
 *   - NEVER apply PHC-fallback coordinates (Requirement 4.7).
 *   - Enforce 1000 ms sleep between every Nominatim request (Requirement 4.2).
 *   - Invoke onProgress(current, total) after each row (Requirement 4.4).
 *   - Return { geocoded, failed, failedRows } (Requirement 4.8).
 *
 * Reuses `sleep` and `geocodeWithRetry` from geocodingEngine.js without
 * modifying that file, satisfying Requirement 11.5.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 11.2, 11.3, 11.5
 */

import { supabase } from '../supabaseClient.js'
import { sleep, geocodeWithRetry } from './geocodingEngine.js'

const BASE_RATE_LIMIT_MS = 1000  // initial delay between requests
const MAX_RATE_LIMIT_MS = 5000   // cap for adaptive slowdown on 429s

/**
 * Runs a full geocoding pass over all rows in `tncera_locations` where
 * `geocode_status = 'pending'`.
 *
 * Because only pending rows are fetched, previously geocoded rows are never
 * reprocessed, making the pass fully resumable (Requirement 11.3, 4.9).
 *
 * The pass executes entirely with async/await and sleep(), keeping the browser
 * UI thread non-blocking (Requirement 11.2).
 *
 * @param {{ onEstimate: (count: number) => void, onProgress: (current: number, total: number) => void }} callbacks
 * @returns {Promise<{ geocoded: number, failed: number, failedRows: Array<{ facility_name: string, address_text: string }> }>}
 */
export async function runTnceraGeocodingPass({ onEstimate, onProgress }) {
  // Step 1: Fetch all pending rows (Requirements 4.1, 4.9)
  const { data: rows = [] } = await supabase
    .from('tncera_locations')
    .select('*')
    .eq('geocode_status', 'pending')

  const pendingRows = rows ?? []
  const total = pendingRows.length

  // Step 2: Notify UI of estimated duration before starting (Requirement 4.3)
  onEstimate(total)

  const result = {
    geocoded: 0,
    failed: 0,
    /** @type {Array<{ facility_name: string, address_text: string }>} */
    failedRows: [],
  }

  // Adaptive rate limit — starts at 1 s, doubles on 429 up to 5 s
  let currentRateLimitMs = BASE_RATE_LIMIT_MS

  // Step 3: Process each row with rate limiting (Requirements 4.2, 4.4, 4.5, 4.6, 4.7)
  for (let i = 0; i < total; i++) {
    const row = pendingRows[i]

    // Geocode via Nominatim with exponential backoff for 429 / network errors
    const coords = await geocodeWithRetry(row.query_text)

    if (coords === 'rate-limited') {
      // 429 exhausted all retries — slow down the overall pass rate and mark failed
      currentRateLimitMs = Math.min(currentRateLimitMs * 2, MAX_RATE_LIMIT_MS)

      await supabase
        .from('tncera_locations')
        .update({ geocode_status: 'failed' })
        .eq('id', row.id)

      result.failed++
      result.failedRows.push({ facility_name: row.facility_name, address_text: row.address_text })
    } else if (coords !== null) {
      // Success (Requirement 4.5)
      await supabase
        .from('tncera_locations')
        .update({ lat: coords.lat, lng: coords.lng, geocode_status: 'geocoded' })
        .eq('id', row.id)

      result.geocoded++
    } else {
      // Genuine empty result — mark failed, no PHC-fallback (Requirement 4.7)
      await supabase
        .from('tncera_locations')
        .update({ geocode_status: 'failed' })
        .eq('id', row.id)

      result.failed++
      result.failedRows.push({ facility_name: row.facility_name, address_text: row.address_text })
    }

    // Adaptive delay between requests
    await sleep(currentRateLimitMs)

    // Notify caller of progress (Requirement 4.4)
    onProgress(i + 1, total)
  }

  return result
}

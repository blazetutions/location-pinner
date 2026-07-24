import { supabase } from '../supabaseClient.js'

/**
 * Export all status rows for a given userId from both user_location_status and
 * user_tncera_status in parallel, and trigger a browser download of the
 * combined JSON file.
 *
 * The exported JSON always uses the combined structure:
 *   { "phc_hsc": [...], "tncera": [...] }
 *
 * If there are no TNCERA rows the "tncera" key is an empty array.
 *
 * Requirements: 9.1, 9.2
 *
 * @param {string} userId
 * @returns {Promise<string>} The JSON string of the exported data
 */
export async function exportUserData(userId) {
  const [phcResult, tnceraResult] = await Promise.all([
    supabase
      .from('user_location_status')
      .select('location_id, status, note, updated_at')
      .eq('user_id', userId),
    supabase
      .from('user_tncera_status')
      .select('location_id, status, note, updated_at')
      .eq('user_id', userId),
  ])

  if (phcResult.error) {
    throw new Error(phcResult.error.message)
  }
  if (tnceraResult.error) {
    throw new Error(tnceraResult.error.message)
  }

  const payload = {
    phc_hsc: phcResult.data ?? [],
    tncera: tnceraResult.data ?? [],
  }

  const jsonString = JSON.stringify(payload, null, 2)

  // Trigger browser file download
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const date = new Date().toISOString().slice(0, 10)
  const filename = `tn-health-statuses-${date}.json`

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)

  return jsonString
}

/**
 * Validate that every element in an array has a non-null location_id and a
 * non-empty status string.
 *
 * @param {unknown[]} arr
 * @returns {boolean}
 */
function isValidStatusArray(arr) {
  return (
    Array.isArray(arr) &&
    arr.every((row) => row != null && row.location_id != null && row.status)
  )
}

/**
 * Import user status data from a JSON string, upserting rows into the
 * appropriate Supabase tables for the given userId.
 *
 * Two accepted formats:
 *
 * 1. Legacy plain array  — treated as PHC/HSC data only; no writes to
 *    user_tncera_status (backward-compatibility path).
 *
 * 2. Combined object     — { phc_hsc: [...], tncera: [...] }
 *    Both arrays are validated before any DB write; an invalid element in
 *    either array aborts the entire import with an error.
 *
 * Return shape (always):
 *   { upsertedPhcHsc: number, upsertedTncera: number, errors: string[] }
 *
 * Requirements: 9.3, 9.4, 9.5, 9.6, 9.7
 *
 * @param {string} userId
 * @param {string} jsonString
 * @returns {Promise<{ upsertedPhcHsc: number, upsertedTncera: number, errors: string[] }>}
 */
export async function importUserData(userId, jsonString) {
  // ── 1. Parse ──────────────────────────────────────────────────────────────
  let parsed
  try {
    parsed = JSON.parse(jsonString)
  } catch {
    return { upsertedPhcHsc: 0, upsertedTncera: 0, errors: ['Invalid import file: could not parse JSON'] }
  }

  // ── 2. Legacy plain-array path (Requirement 9.5) ─────────────────────────
  if (Array.isArray(parsed)) {
    if (!isValidStatusArray(parsed)) {
      return {
        upsertedPhcHsc: 0,
        upsertedTncera: 0,
        errors: ['Invalid import file: must be an array where every element has location_id and status'],
      }
    }

    const { error } = await supabase
      .from('user_location_status')
      .upsert(
        parsed.map((r) => ({ ...r, user_id: userId })),
        { onConflict: 'location_id,user_id' }
      )

    if (error) {
      return { upsertedPhcHsc: 0, upsertedTncera: 0, errors: [error.message] }
    }

    return { upsertedPhcHsc: parsed.length, upsertedTncera: 0, errors: [] }
  }

  // ── 3. Combined object path (Requirement 9.3, 9.4) ───────────────────────
  if (parsed !== null && typeof parsed === 'object') {
    const phcHscRows = parsed.phc_hsc ?? []
    const tnceraRows = parsed.tncera ?? []

    // Validate both arrays before any DB write (Requirement 9.3)
    if (!isValidStatusArray(phcHscRows)) {
      return {
        upsertedPhcHsc: 0,
        upsertedTncera: 0,
        errors: ['Invalid import file: phc_hsc array contains elements missing location_id or status'],
      }
    }
    if (!isValidStatusArray(tnceraRows)) {
      return {
        upsertedPhcHsc: 0,
        upsertedTncera: 0,
        errors: ['Invalid import file: tncera array contains elements missing location_id or status'],
      }
    }

    // Upsert both tables in parallel (Requirement 9.4)
    const [phcResult, tnceraResult] = await Promise.all([
      phcHscRows.length > 0
        ? supabase
            .from('user_location_status')
            .upsert(
              phcHscRows.map((r) => ({ ...r, user_id: userId })),
              { onConflict: 'location_id,user_id' }
            )
        : Promise.resolve({ error: null }),
      tnceraRows.length > 0
        ? supabase
            .from('user_tncera_status')
            .upsert(
              tnceraRows.map((r) => ({ ...r, user_id: userId })),
              { onConflict: 'location_id,user_id' }
            )
        : Promise.resolve({ error: null }),
    ])

    const errors = []
    if (phcResult.error) errors.push(phcResult.error.message)
    if (tnceraResult.error) errors.push(tnceraResult.error.message)

    if (errors.length > 0) {
      return { upsertedPhcHsc: 0, upsertedTncera: 0, errors }
    }

    return {
      upsertedPhcHsc: phcHscRows.length,
      upsertedTncera: tnceraRows.length,
      errors: [],
    }
  }

  // ── 4. Unrecognised format ────────────────────────────────────────────────
  return {
    upsertedPhcHsc: 0,
    upsertedTncera: 0,
    errors: ['Invalid import file: unrecognised format (expected an array or an object with phc_hsc/tncera keys)'],
  }
}

import { supabase } from '../supabaseClient.js'

/**
 * Export user status rows from both user_location_status and user_tncera_status
 * and trigger a browser download of the combined JSON file.
 *
 * Output format: { phc_hsc: [...], tncera: [...] }
 *
 * @param {string} userId
 * @returns {Promise<string>} JSON string of the exported data
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

  if (phcResult.error) throw new Error(phcResult.error.message)
  if (tnceraResult.error) throw new Error(tnceraResult.error.message)

  const payload = {
    phc_hsc: phcResult.data ?? [],
    tncera: tnceraResult.data ?? [],
  }

  const jsonString = JSON.stringify(payload, null, 2)

  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const date = new Date().toISOString().slice(0, 10)

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `tn-health-statuses-${date}.json`
  anchor.click()
  URL.revokeObjectURL(url)

  return jsonString
}

function isValidStatusArray(arr) {
  return (
    Array.isArray(arr) &&
    arr.every(r => r != null && r.location_id != null && r.status)
  )
}

/**
 * Import user status data from a JSON string.
 *
 * Accepted formats:
 *  1. Plain array (legacy) → treated as phc_hsc only, no tncera writes
 *  2. Combined object { phc_hsc, tncera } → upserts both tables
 *
 * @param {string} userId
 * @param {string} jsonString
 * @returns {Promise<{ upsertedPhcHsc: number, upsertedTncera: number, errors: string[] }>}
 */
export async function importUserData(userId, jsonString) {
  let parsed
  try {
    parsed = JSON.parse(jsonString)
  } catch {
    return { upsertedPhcHsc: 0, upsertedTncera: 0, errors: ['Invalid import file: could not parse JSON'] }
  }

  // ── Legacy plain-array path ────────────────────────────────────────────────
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
        parsed.map(r => ({ ...r, user_id: userId })),
        { onConflict: 'location_id,user_id' }
      )
    if (error) return { upsertedPhcHsc: 0, upsertedTncera: 0, errors: [error.message] }
    return { upsertedPhcHsc: parsed.length, upsertedTncera: 0, errors: [] }
  }

  // ── Combined object path ───────────────────────────────────────────────────
  if (parsed !== null && typeof parsed === 'object') {
    const phcHscRows = parsed.phc_hsc ?? []
    const tnceraRows = parsed.tncera ?? []

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

    const [phcResult, tnceraResult] = await Promise.all([
      phcHscRows.length > 0
        ? supabase
            .from('user_location_status')
            .upsert(phcHscRows.map(r => ({ ...r, user_id: userId })), { onConflict: 'location_id,user_id' })
        : Promise.resolve({ error: null }),
      tnceraRows.length > 0
        ? supabase
            .from('user_tncera_status')
            .upsert(tnceraRows.map(r => ({ ...r, user_id: userId })), { onConflict: 'location_id,user_id' })
        : Promise.resolve({ error: null }),
    ])

    const errors = []
    if (phcResult.error) errors.push(phcResult.error.message)
    if (tnceraResult.error) errors.push(tnceraResult.error.message)
    if (errors.length > 0) return { upsertedPhcHsc: 0, upsertedTncera: 0, errors }

    return { upsertedPhcHsc: phcHscRows.length, upsertedTncera: tnceraRows.length, errors: [] }
  }

  // ── Unrecognised format ────────────────────────────────────────────────────
  return {
    upsertedPhcHsc: 0,
    upsertedTncera: 0,
    errors: ['Invalid import file: unrecognised format (expected an array or an object with phc_hsc/tncera keys)'],
  }
}

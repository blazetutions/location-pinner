import { supabase } from '../supabaseClient.js'

/**
 * Export all user_tncera_status rows for a given userId and trigger a
 * browser download of the JSON file.
 *
 * @param {string} userId
 * @returns {Promise<string>} The JSON string of the exported data
 */
export async function exportUserData(userId) {
  const { data, error } = await supabase
    .from('user_tncera_status')
    .select('location_id, status, note, updated_at')
    .eq('user_id', userId)

  if (error) {
    throw new Error(error.message)
  }

  const jsonString = JSON.stringify(data ?? [], null, 2)

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

/**
 * Import user_tncera_status rows from a JSON string.
 * Accepts a plain array where every element has location_id and status.
 *
 * @param {string} userId
 * @param {string} jsonString
 * @returns {Promise<{ upserted: number, errors: string[] }>}
 */
export async function importUserData(userId, jsonString) {
  let rows
  try {
    rows = JSON.parse(jsonString)
  } catch {
    return { upserted: 0, errors: ['Invalid import file: could not parse JSON'] }
  }

  if (!Array.isArray(rows) || !rows.every(r => r != null && r.location_id != null && r.status)) {
    return {
      upserted: 0,
      errors: ['Invalid import file: must be an array where every element has location_id and status'],
    }
  }

  const { error } = await supabase
    .from('user_tncera_status')
    .upsert(
      rows.map(r => ({ ...r, user_id: userId })),
      { onConflict: 'location_id,user_id' }
    )

  if (error) {
    return { upserted: 0, errors: [error.message] }
  }

  return { upserted: rows.length, errors: [] }
}

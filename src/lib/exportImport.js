import { supabase } from '../supabaseClient.js'

/**
 * Export all user_location_status rows for a given userId to a JSON file
 * download and return the serialized JSON string.
 *
 * Requirements: 11.1, 11.2
 *
 * @param {string} userId
 * @returns {Promise<string>} The JSON string of the exported data
 */
export async function exportUserData(userId) {
  const { data, error } = await supabase
    .from('user_location_status')
    .select('location_id, status, note, updated_at')
    .eq('user_id', userId)

  if (error) {
    throw new Error(error.message)
  }

  const jsonString = JSON.stringify(data, null, 2)

  // Trigger browser file download
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const date = new Date().toISOString().slice(0, 10)
  const filename = `chennai-health-statuses-${date}.json`

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)

  return jsonString
}

/**
 * Import user status data from a JSON string, upserting rows into
 * user_location_status for the given userId.
 *
 * Requirements: 11.3, 11.4, 11.6, 11.7
 *
 * @param {string} userId
 * @param {string} jsonString
 * @returns {Promise<{ upserted: number, errors: string[] }>}
 */
export async function importUserData(userId, jsonString) {
  // Parse and validate
  let rows
  try {
    rows = JSON.parse(jsonString)
  } catch {
    return { upserted: 0, errors: ['Invalid import file: could not parse JSON'] }
  }

  const isValid =
    Array.isArray(rows) &&
    rows.every((row) => row.location_id != null && row.status)

  if (!isValid) {
    return {
      upserted: 0,
      errors: ['Invalid import file: must be an array where every element has location_id and status'],
    }
  }

  // Upsert rows, injecting the current userId
  const { error } = await supabase
    .from('user_location_status')
    .upsert(
      rows.map((r) => ({ ...r, user_id: userId })),
      { onConflict: 'location_id,user_id' }
    )

  if (error) {
    return { upserted: 0, errors: [error.message] }
  }

  return { upserted: rows.length, errors: [] }
}

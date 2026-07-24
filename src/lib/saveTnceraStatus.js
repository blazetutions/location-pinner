import { supabase } from '../supabaseClient.js'

export const VALID_TNCERA_STATUSES = ['Visited', 'Converted', 'Pending']

/**
 * Upsert a user's TNCERA visit status for a location.
 *
 * @param {string} locationId  - UUID of the TNCERA location
 * @param {string} userId      - UUID of the authenticated user
 * @param {string} status      - One of VALID_TNCERA_STATUSES
 * @param {string|null} note   - Free-text note; empty string is stored as null
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
export async function saveTnceraStatus(locationId, userId, status, note) {
  // Requirements 6.8, 8.1 — reject status values not in the allowed set
  if (!VALID_TNCERA_STATUSES.includes(status)) {
    return { success: false, error: 'Invalid status value' }
  }

  // Requirement 6.5 — coerce empty string to null
  const normalizedNote = note === '' ? null : note

  const { data, error } = await supabase
    .from('user_tncera_status')
    .upsert(
      {
        location_id: locationId,
        user_id: userId,
        status,
        note: normalizedNote,
      },
      { onConflict: 'location_id,user_id' }
    )
    .select()
    .single()

  if (error) {
    // Requirement 6.7 — surface a readable error message
    return { success: false, error: error.message }
  }

  return { success: true, data }
}

import { supabase } from '../supabaseClient.js'

export const VALID_STATUSES = ['Visited', 'Not Visited', 'Follow-up Needed']

/**
 * Upsert a user's visit status for a location.
 *
 * @param {number} locationId
 * @param {string} userId      - UUID of the authenticated user
 * @param {string} status      - One of VALID_STATUSES
 * @param {string|null} note   - Free-text note; empty string is stored as null
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
export async function saveStatus(locationId, userId, status, note) {
  // Requirement 8.4 — reject unknown status values
  if (!VALID_STATUSES.includes(status)) {
    return { success: false, error: 'Invalid status value' }
  }

  // Requirement 8.3 — coerce empty string to null
  const normalizedNote = note === '' ? null : note

  const { data, error } = await supabase
    .from('user_location_status')
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
    // Requirement 8.6 — surface a readable error message
    return { success: false, error: error.message }
  }

  return { success: true, data }
}

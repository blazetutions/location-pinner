/**
 * Handles a Supabase error object by logging it and returning a safe
 * user-facing message.
 *
 * Requirement 9.5 — never expose raw Supabase error details to the user.
 * - If the error relates to RLS / permissions, return "Permission denied".
 * - Otherwise return a generic fallback message.
 *
 * @param {object} error - The error object returned by a Supabase query.
 * @returns {string} A user-safe error message.
 */
export function handleSupabaseError(error) {
  console.error('[Supabase Error]', error)

  const msg = error?.message?.toLowerCase() ?? ''

  const isRls =
    msg.includes('row-level security') ||
    msg.includes('policy') ||
    msg.includes('permission denied') ||
    msg.includes('violates row-level')

  return isRls ? 'Permission denied' : 'An error occurred. Please try again.'
}

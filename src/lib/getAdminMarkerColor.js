/**
 * Returns the aggregate CSS hex color for an admin map marker based on all
 * users' statuses for a single location.
 *
 * Priority: Visited > Follow-up Needed > Not Visited / empty
 *
 * @param {Array<{ status: string }>} statusRows — all users' status rows for one location
 * @returns {string} CSS hex color — always a non-empty string
 */
export function getAdminMarkerColor(statusRows) {
  if (!statusRows || statusRows.length === 0) {
    return '#94a3b8' // grey — no data
  }

  if (statusRows.some((row) => row.status === 'Visited')) {
    return '#22c55e' // green
  }

  if (statusRows.some((row) => row.status === 'Follow-up Needed')) {
    return '#f97316' // orange
  }

  return '#94a3b8' // grey — all Not Visited or unrecognised
}

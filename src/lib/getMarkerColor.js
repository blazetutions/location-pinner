/**
 * Returns the CSS hex color string for a facility marker based on visit status.
 *
 * @param {'Visited' | 'Not Visited' | 'Follow-up Needed' | undefined} status
 * @returns {string} CSS hex color — always a non-empty string
 */
export function getMarkerColor(status) {
  switch (status) {
    case 'Visited':
      return '#22c55e'
    case 'Follow-up Needed':
      return '#f97316'
    case 'Not Visited':
    case undefined:
    default:
      return '#94a3b8'
  }
}

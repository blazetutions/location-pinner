/**
 * Returns the CSS hex color string for a TNCERA marker based on the user's
 * visit status for that location.
 *
 * @param {'Visited' | 'Converted' | 'Pending' | undefined} status
 * @returns {string} CSS hex color — always a non-empty string
 */
export function getTnceraMarkerColor(status) {
  switch (status) {
    case 'Visited':
      return '#0891b2'
    case 'Converted':
      return '#059669'
    case 'Pending':
    case undefined:
    default:
      return '#7c3aed'
  }
}

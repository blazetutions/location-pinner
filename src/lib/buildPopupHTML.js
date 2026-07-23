/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string|null|undefined} text
 * @returns {string}
 */
function escapeHtml(text) {
  if (text == null) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Builds the HTML string for a Leaflet marker popup.
 *
 * @param {Object} location - LocationRow { id, district, zone, block, phc, hsc, level, ... }
 * @param {Object|null|undefined} statusRow - { status: string, note: string|null } or null/undefined
 * @returns {string} HTML markup for the popup
 */
export function buildPopupHTML(location, statusRow) {
  // Determine facility name: HSC Name if available, otherwise PHC Name
  const facilityName = location.hsc || location.phc

  // Extract status and note from statusRow, with defaults
  const currentStatus = statusRow?.status || 'Not Visited'
  const currentNote = statusRow?.note || ''

  // Escape all user-facing text
  const safeFacilityName = escapeHtml(facilityName)
  const safePHC = escapeHtml(location.phc)
  const safeBlock = escapeHtml(location.block)
  const safeZone = escapeHtml(location.zone)
  const safeNote = escapeHtml(currentNote)

  // Build status dropdown with three options
  const statusOptions = ['Visited', 'Not Visited', 'Follow-up Needed']
  const optionsHTML = statusOptions
    .map(status => {
      const selected = status === currentStatus ? ' selected' : ''
      return `<option value="${escapeHtml(status)}"${selected}>${escapeHtml(status)}</option>`
    })
    .join('')

  return `
    <div class="popup-content">
      <h3>${safeFacilityName}</h3>
      <div class="popup-info">
        <p><strong>PHC:</strong> ${safePHC}</p>
        <p><strong>Block:</strong> ${safeBlock}</p>
        <p><strong>Zone:</strong> ${safeZone}</p>
      </div>
      <div class="popup-form">
        <label>
          <strong>Status:</strong>
          <select class="popup-status">${optionsHTML}</select>
        </label>
        <label>
          <strong>Note:</strong>
          <textarea class="popup-note" rows="3">${safeNote}</textarea>
        </label>
        <button class="popup-save-btn" data-location-id="${escapeHtml(location.id)}">Save</button>
      </div>
    </div>
  `.trim()
}

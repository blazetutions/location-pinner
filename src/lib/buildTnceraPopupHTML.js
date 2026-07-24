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
 * Builds the HTML string for a TNCERA Leaflet marker popup.
 *
 * @param {Object} loc - TNCERALocationRow { id, facility_name, address_text, establishment_type, tncera_no, validity_from, validity_to }
 * @param {Object|null|undefined} statusRow - { status: string, note: string|null } or null/undefined
 * @returns {string} HTML markup for the popup
 */
export function buildTnceraPopupHTML(loc, statusRow) {
  // Extract status and note from statusRow, with defaults
  const currentStatus = statusRow?.status || 'Pending'
  const currentNote = statusRow?.note || ''

  // Escape all user-facing text
  const safeFacilityName = escapeHtml(loc.facility_name)
  const safeAddress = escapeHtml(loc.address_text)
  const safeEstablishmentType = escapeHtml(loc.establishment_type)
  const safeTnceraNo = escapeHtml(loc.tncera_no)
  const safeValidityFrom = escapeHtml(loc.validity_from)
  const safeValidityTo = escapeHtml(loc.validity_to)
  const safeNote = escapeHtml(currentNote)

  // Build status dropdown with three options
  const statusOptions = ['Pending', 'Visited', 'Converted']
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
        <p><strong>Address:</strong> ${safeAddress}</p>
        <p><strong>Type of Establishment:</strong> ${safeEstablishmentType}</p>
        <p><strong>TNCERA No.:</strong> ${safeTnceraNo}</p>
        <p><strong>Validity From:</strong> ${safeValidityFrom}</p>
        <p><strong>Validity To:</strong> ${safeValidityTo}</p>
      </div>
      <div class="popup-form">
        <label>
          <strong>Status:</strong>
          <select class="tncera-popup-status">${optionsHTML}</select>
        </label>
        <label>
          <strong>Note:</strong>
          <textarea class="tncera-popup-note" rows="3">${safeNote}</textarea>
        </label>
        <button class="tncera-popup-save-btn" data-location-id="${escapeHtml(loc.id)}">Save</button>
      </div>
    </div>
  `.trim()
}

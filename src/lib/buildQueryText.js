/**
 * Builds the Nominatim geocoding query string for a facility row.
 *
 * @param {'phc' | 'hsc'} level - The facility level.
 * @param {Object} row - An ExcelRow parsed from the uploaded spreadsheet.
 * @param {string} row['Phc Name']  - Primary Health Centre name (required).
 * @param {string} row['Block Name'] - Block name (required).
 * @param {string} [row['Hsc Name']] - Health Sub-Centre name (required when level === 'hsc').
 * @returns {string} The query text suitable for a Nominatim /search request.
 *
 * PHC format: "{Phc Name}, {Block Name}, Chennai, Tamil Nadu, India"
 * HSC format: "{Hsc Name}, {Phc Name}, {Block Name}, Chennai, Tamil Nadu, India"
 */
export function buildQueryText(level, row) {
  const phc = row['Phc Name'];
  const block = row['Block Name'];

  if (level === 'phc') {
    return `${phc}, ${block}, Chennai, Tamil Nadu, India`;
  }

  // level === 'hsc'
  const hsc = row['Hsc Name'];
  return `${hsc}, ${phc}, ${block}, Chennai, Tamil Nadu, India`;
}

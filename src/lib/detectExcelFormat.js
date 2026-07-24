/**
 * Detects whether a parsed SheetJS rows array is from a TNCERA file or a PHC/HSC file.
 *
 * The detection key is the presence of a column named exactly
 * `Name and Address of Clinical Establishment` in the first row.
 *
 * @param {Object[]} rows - Parsed rows array from the first/default sheet of the workbook
 *                          (as produced by SheetJS `sheet_to_json`).
 * @returns {'tncera' | 'phc_hsc'} Format identifier — never throws, never produces side effects.
 */
export function detectExcelFormat(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 'phc_hsc'
  return Object.prototype.hasOwnProperty.call(
    rows[0],
    'Name and Address of Clinical Establishment'
  )
    ? 'tncera'
    : 'phc_hsc'
}

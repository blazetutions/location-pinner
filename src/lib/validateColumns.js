/**
 * Validates that all required columns are present in the parsed Excel rows.
 *
 * @param {Array<Object>} rows - Array of ExcelRow objects parsed from the spreadsheet.
 * @returns {{ valid: boolean, missingColumns: string[] }}
 *
 * Required columns: ['S.No', 'District', 'Hud Name', 'Block Name', 'Phc Name', 'Hsc Name']
 *
 * If rows is empty, infers no columns are present → all 6 are missing.
 */
export function validateColumns(rows) {
  const REQUIRED_COLUMNS = [
    'S.No',
    'District',
    'Hud Name',
    'Block Name',
    'Phc Name',
    'Hsc Name'
  ];

  // If rows array is empty, no columns are present
  if (!rows || rows.length === 0) {
    return {
      valid: false,
      missingColumns: [...REQUIRED_COLUMNS]
    };
  }

  // Get actual columns from the first row
  const actualColumns = Object.keys(rows[0]);
  
  // Find missing columns
  const missingColumns = REQUIRED_COLUMNS.filter(
    col => !actualColumns.includes(col)
  );

  return {
    valid: missingColumns.length === 0,
    missingColumns
  };
}

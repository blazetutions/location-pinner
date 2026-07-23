import * as XLSX from 'xlsx'

/**
 * Generates and triggers a download of a sample Excel file with realistic
 * Chennai health facility data. Uses the same column structure required by
 * the ExcelUploader so the file passes column validation on re-upload.
 *
 * Satisfies Requirements 15.2, 15.3, 15.4, 15.5
 */
export function downloadSampleExcel() {
  const header = ['S.No', 'District', 'Hud Name', 'Block Name', 'Phc Name', 'Hsc Name']

  const dataRows = [
    [1, 'Chennai', 'Chennai North', 'Manali', 'Manali PHC', 'Athipet UPHC'],
    [2, 'Chennai', 'Chennai North', 'Manali', 'Manali PHC', 'Moolakothalam HSC'],
    [3, 'Chennai', 'Chennai North', 'Madhavaram', 'Madhavaram PHC', 'Retteri HSC'],
    [4, 'Chennai', 'Chennai Central', 'Ambattur', 'Ambattur PHC', 'Kolathur HSC'],
    [5, 'Chennai', 'Chennai South', 'Sholinganallur', 'Sholinganallur PHC', 'Perungudi HSC'],
  ]

  const rows = [header, ...dataRows]

  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Chennai')
  XLSX.writeFile(wb, 'sample-chennai-health-facilities.xlsx')
}

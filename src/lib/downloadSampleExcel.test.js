import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as XLSX from 'xlsx'

// ---------------------------------------------------------------------------
// Mock XLSX.writeFile — it is a side-effect only call (triggers browser
// download). We don't want actual file I/O in tests; all other XLSX utilities
// (aoa_to_sheet, book_new, book_append_sheet, utils.sheet_to_json) run for real.
// ---------------------------------------------------------------------------
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    writeFile: vi.fn(), // no-op in tests
  }
})

// Import AFTER the mock is established
import { downloadSampleExcel } from './downloadSampleExcel.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calls downloadSampleExcel(), intercepts the workbook passed to writeFile,
 * and returns the first sheet parsed as an array of arrays (aoa).
 */
function captureSheetAoa() {
  // Reset call history so each test starts clean
  XLSX.writeFile.mockClear()

  downloadSampleExcel()

  expect(XLSX.writeFile).toHaveBeenCalledOnce()
  const [wb, filename] = XLSX.writeFile.mock.calls[0]

  return { wb, filename }
}

// ---------------------------------------------------------------------------
// Tests covering Requirements 15.3, 15.4, 15.5, 15.6
// ---------------------------------------------------------------------------

describe('downloadSampleExcel', () => {
  const REQUIRED_HEADERS = ['S.No', 'District', 'Hud Name', 'Block Name', 'Phc Name', 'Hsc Name']

  it('calls XLSX.writeFile exactly once (Req 15.2)', () => {
    XLSX.writeFile.mockClear()
    downloadSampleExcel()
    expect(XLSX.writeFile).toHaveBeenCalledOnce()
  })

  it('names the file sample-chennai-health-facilities.xlsx (Req 15.5)', () => {
    const { filename } = captureSheetAoa()
    expect(filename).toBe('sample-chennai-health-facilities.xlsx')
  })

  it('workbook contains a sheet named "Chennai"', () => {
    const { wb } = captureSheetAoa()
    expect(wb.SheetNames).toContain('Chennai')
  })

  describe('header row (Req 15.3)', () => {
    it('first row equals the 6 required headers in the correct order', () => {
      const { wb } = captureSheetAoa()
      const ws = wb.Sheets[wb.SheetNames[0]]
      // Read back as aoa so we can inspect row by row
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 })

      expect(aoa[0]).toEqual(REQUIRED_HEADERS)
    })

    it('all 6 required headers are present (Req 15.3)', () => {
      const { wb } = captureSheetAoa()
      const ws = wb.Sheets[wb.SheetNames[0]]
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 })
      const headerRow = aoa[0]

      for (const col of REQUIRED_HEADERS) {
        expect(headerRow).toContain(col)
      }
    })
  })

  describe('data rows (Req 15.4)', () => {
    it('has between 3 and 5 data rows (excluding the header)', () => {
      const { wb } = captureSheetAoa()
      const ws = wb.Sheets[wb.SheetNames[0]]
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 })
      const dataRows = aoa.slice(1) // strip header

      expect(dataRows.length).toBeGreaterThanOrEqual(3)
      expect(dataRows.length).toBeLessThanOrEqual(5)
    })

    it('every data row has exactly 6 cells', () => {
      const { wb } = captureSheetAoa()
      const ws = wb.Sheets[wb.SheetNames[0]]
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 })
      const dataRows = aoa.slice(1)

      for (const row of dataRows) {
        expect(row).toHaveLength(6)
      }
    })

    it('first data row contains Chennai North / Manali / Athipet UPHC', () => {
      const { wb } = captureSheetAoa()
      const ws = wb.Sheets[wb.SheetNames[0]]
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 })
      const firstData = aoa[1]

      expect(firstData[1]).toBe('Chennai')
      expect(firstData[2]).toBe('Chennai North')
      expect(firstData[3]).toBe('Manali')
      expect(firstData[5]).toBe('Athipet UPHC')
    })
  })

  describe('round-trip compatibility (Req 15.6)', () => {
    it('re-parsing the sheet as objects produces rows with all 6 required column keys', () => {
      const { wb } = captureSheetAoa()
      const ws = wb.Sheets[wb.SheetNames[0]]
      // sheet_to_json without header:1 uses the first row as keys — this is
      // exactly what the ExcelUploader does, so it exercises the round-trip.
      const parsed = XLSX.utils.sheet_to_json(ws)

      expect(parsed.length).toBeGreaterThanOrEqual(3)

      for (const row of parsed) {
        for (const col of REQUIRED_HEADERS) {
          expect(row).toHaveProperty(col)
        }
      }
    })

    it('S.No values are sequential numbers starting from 1', () => {
      const { wb } = captureSheetAoa()
      const ws = wb.Sheets[wb.SheetNames[0]]
      const parsed = XLSX.utils.sheet_to_json(ws)

      parsed.forEach((row, idx) => {
        expect(row['S.No']).toBe(idx + 1)
      })
    })
  })
})

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'
import { validateColumns } from '../lib/validateColumns'
import { buildQueryText } from '../lib/buildQueryText'
import { downloadSampleExcel } from '../lib/downloadSampleExcel'
import { detectExcelFormat } from '../lib/detectExcelFormat'
import { tnceraUploader } from '../lib/tnceraUploader'

/**
 * ExcelUploader component
 *
 * Accepts .xlsx/.xls file input, parses with SheetJS, auto-detects format
 * (TNCERA or PHC/HSC), and routes to the appropriate upload path.
 *
 * For TNCERA files: calls tnceraUploader(workbook) and onTnceraUploadComplete(rows).
 * For PHC/HSC files: continues with the existing validation + upsert flow and
 * calls onUploadComplete(locationRows).
 *
 * @param {{
 *   onUploadComplete: (rows: object[]) => void,
 *   onTnceraUploadComplete?: (rows: object[]) => void
 * }} props
 */
function ExcelUploader({ onUploadComplete, onTnceraUploadComplete }) {
  const [parseError, setParseError] = useState(null)
  const [uploadStatus, setUploadStatus] = useState(null) // { inserted, skipped } | null
  const [isProcessing, setIsProcessing] = useState(false)
  const [detectedFormat, setDetectedFormat] = useState(null) // 'tncera' | 'phc_hsc' | null

  async function handleFileChange(event) {
    const file = event.target.files[0]
    if (!file) return

    // Reset previous state
    setParseError(null)
    setUploadStatus(null)
    setDetectedFormat(null)
    setIsProcessing(true)

    try {
      // Step 1: Parse the Excel file
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })

      // Extract first sheet rows for format detection
      const firstSheetName = workbook.SheetNames[0]
      const firstSheet = workbook.Sheets[firstSheetName]
      const firstSheetRows = XLSX.utils.sheet_to_json(firstSheet)

      // Step 2: Detect format
      const format = detectExcelFormat(firstSheetRows)
      setDetectedFormat(format)

      // ── TNCERA path ────────────────────────────────────────────────────────
      if (format === 'tncera') {
        const result = await tnceraUploader(workbook)

        if (result.error) {
          setParseError(result.error)
          setIsProcessing(false)
          return
        }

        setUploadStatus({ inserted: result.inserted, skipped: result.skipped })

        if (typeof onTnceraUploadComplete === 'function') {
          onTnceraUploadComplete(result.rows)
        }

        setIsProcessing(false)
        return
      }

      // ── PHC/HSC path (existing flow — unchanged) ───────────────────────────

      // Extract "Chennai" sheet or fall back to the first sheet
      const sheetName = workbook.SheetNames.includes('Chennai')
        ? 'Chennai'
        : workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(sheet)

      // Step 3: Validate columns
      const { valid, missingColumns } = validateColumns(rows)
      if (!valid) {
        setParseError(
          `Missing required columns: ${missingColumns.join(', ')}`
        )
        setIsProcessing(false)
        return
      }

      // Step 4: Build location records
      const phcRecords = []
      const hscRecords = []
      const seenPhcKeys = new Set()

      for (const row of rows) {
        const phcQueryText = buildQueryText('phc', row)

        // Deduplicate PHC rows by query_text
        if (!seenPhcKeys.has(phcQueryText)) {
          seenPhcKeys.add(phcQueryText)
          phcRecords.push({
            district: row['District'],
            zone: row['Hud Name'],
            block: row['Block Name'],
            phc: row['Phc Name'],
            hsc: null,
            level: 'phc',
            query_text: phcQueryText,
            lat: null,
            lng: null,
          })
        }

        // Every row produces one HSC record
        hscRecords.push({
          district: row['District'],
          zone: row['Hud Name'],
          block: row['Block Name'],
          phc: row['Phc Name'],
          hsc: row['Hsc Name'],
          level: 'hsc',
          query_text: buildQueryText('hsc', row),
          lat: null,
          lng: null,
        })
      }

      // Step 5: Upsert PHC rows first, then fetch their IDs to fill parent_phc_id
      const { data: phcData, error: phcError } = await supabase
        .from('locations')
        .upsert(phcRecords, { onConflict: 'query_text', ignoreDuplicates: true })
        .select()

      if (phcError) {
        setParseError(`Error upserting PHC records: ${phcError.message}`)
        setIsProcessing(false)
        return
      }

      // Fetch all PHC rows (including pre-existing ones) to build query_text → id map
      const phcQueryTexts = phcRecords.map((r) => r.query_text)
      const { data: allPhcRows, error: fetchPhcError } = await supabase
        .from('locations')
        .select('id, query_text')
        .in('query_text', phcQueryTexts)

      if (fetchPhcError) {
        setParseError(`Error fetching PHC IDs: ${fetchPhcError.message}`)
        setIsProcessing(false)
        return
      }

      // Build lookup: query_text → id
      const phcIdByQueryText = {}
      for (const phcRow of allPhcRows) {
        phcIdByQueryText[phcRow.query_text] = phcRow.id
      }

      // Attach parent_phc_id to each HSC record
      const hscRecordsWithParent = hscRecords.map((hsc) => {
        const parentQueryText = buildQueryText('phc', {
          'Phc Name': hsc.phc,
          'Block Name': hsc.block,
        })
        return {
          ...hsc,
          parent_phc_id: phcIdByQueryText[parentQueryText] ?? null,
        }
      })

      // Step 6: Upsert HSC rows
      const { data: hscData, error: hscError } = await supabase
        .from('locations')
        .upsert(hscRecordsWithParent, { onConflict: 'query_text', ignoreDuplicates: true })
        .select()

      if (hscError) {
        setParseError(`Error upserting HSC records: ${hscError.message}`)
        setIsProcessing(false)
        return
      }

      // Step 6: Count inserted vs skipped
      // ignoreDuplicates=true means the returned data contains only newly inserted rows
      const insertedPhc = phcData ? phcData.length : 0
      const insertedHsc = hscData ? hscData.length : 0
      const totalInserted = insertedPhc + insertedHsc
      const totalSent = phcRecords.length + hscRecordsWithParent.length
      const totalSkipped = totalSent - totalInserted

      setUploadStatus({ inserted: totalInserted, skipped: totalSkipped })

      // Step 7: Fetch the full set of upserted location rows for the caller
      const allQueryTexts = [
        ...phcRecords.map((r) => r.query_text),
        ...hscRecordsWithParent.map((r) => r.query_text),
      ]
      const { data: locationRows, error: fetchAllError } = await supabase
        .from('locations')
        .select('*')
        .in('query_text', allQueryTexts)

      if (fetchAllError) {
        // Non-fatal: we still report success, just can't pass rows to parent
        console.error('Failed to fetch location rows after upsert:', fetchAllError.message)
        onUploadComplete([])
      } else {
        onUploadComplete(locationRows ?? [])
      }
    } catch (err) {
      setParseError(`Unexpected error: ${err.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="excel-uploader" role="region" aria-label="Excel file uploader">
      <div className="excel-uploader__actions">
        <label htmlFor="excel-file-input" className="excel-uploader__label">
          Upload Excel file (.xlsx / .xls)
        </label>
        <button
          type="button"
          className="excel-uploader__sample-btn"
          aria-label="Download sample Excel template"
          onClick={downloadSampleExcel}
        >
          Download Sample Excel
        </button>
      </div>
      <input
        id="excel-file-input"
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileChange}
        disabled={isProcessing}
        aria-describedby={
          parseError
            ? 'excel-uploader-error'
            : uploadStatus
            ? 'excel-uploader-status'
            : undefined
        }
      />

      {isProcessing && (
        <p className="excel-uploader__processing" aria-live="polite">
          Processing file, please wait…
        </p>
      )}

      {detectedFormat && !isProcessing && (
        <p className="excel-uploader__format-label" aria-live="polite">
          {detectedFormat === 'tncera'
            ? 'Detected: TNCERA format'
            : 'Detected: PHC/HSC format'}
        </p>
      )}

      {parseError && (
        <p
          id="excel-uploader-error"
          className="excel-uploader__error"
          role="alert"
          aria-live="assertive"
        >
          {parseError}
        </p>
      )}

      {uploadStatus && !parseError && (
        <p
          id="excel-uploader-status"
          className="excel-uploader__success"
          role="status"
          aria-live="polite"
        >
          {detectedFormat === 'tncera'
            ? `Upload complete — ${uploadStatus.inserted} inserted, ${uploadStatus.skipped} skipped`
            : `Upload complete — ${uploadStatus.inserted} record${uploadStatus.inserted !== 1 ? 's' : ''} inserted, ${uploadStatus.skipped} skipped (already existed).`}
        </p>
      )}
    </div>
  )
}

export default ExcelUploader

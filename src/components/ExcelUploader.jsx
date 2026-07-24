import { useState } from 'react'
import * as XLSX from 'xlsx'
import { tnceraUploader } from '../lib/tnceraUploader'

/**
 * ExcelUploader — accepts a TNCERA .xlsx/.xls file, parses it with SheetJS,
 * upserts records to `tncera_locations`, and calls onTnceraUploadComplete(rows).
 *
 * @param {{ onTnceraUploadComplete?: (rows: object[]) => void }} props
 */
function ExcelUploader({ onTnceraUploadComplete }) {
  const [parseError, setParseError] = useState(null)
  const [uploadStatus, setUploadStatus] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)

  async function handleFileChange(event) {
    const file = event.target.files[0]
    if (!file) return

    setParseError(null)
    setUploadStatus(null)
    setIsProcessing(true)

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })

      const result = await tnceraUploader(workbook)

      if (result.error) {
        setParseError(result.error)
        return
      }

      setUploadStatus({ inserted: result.inserted, skipped: result.skipped })

      if (typeof onTnceraUploadComplete === 'function') {
        onTnceraUploadComplete(result.rows)
      }
    } catch (err) {
      setParseError(`Unexpected error: ${err.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="excel-uploader" role="region" aria-label="Excel file uploader">
      <label htmlFor="excel-file-input" className="excel-uploader__label">
        Upload TNCERA Excel file (.xlsx / .xls)
      </label>
      <input
        id="excel-file-input"
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileChange}
        disabled={isProcessing}
        aria-describedby={
          parseError ? 'excel-uploader-error' : uploadStatus ? 'excel-uploader-status' : undefined
        }
      />

      {isProcessing && (
        <p className="excel-uploader__processing" aria-live="polite">
          Processing file, please wait…
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
          Upload complete — {uploadStatus.inserted} inserted, {uploadStatus.skipped} skipped
        </p>
      )}
    </div>
  )
}

export default ExcelUploader

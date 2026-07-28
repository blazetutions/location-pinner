import { useState } from 'react'
import * as XLSX from 'xlsx'
import { tnceraUploader } from '../lib/tnceraUploader'

/**
 * ExcelUploader — styled dropzone for TNCERA Excel files.
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
      <div className="excel-uploader__dropzone">
        {/* Upload icon */}
        <div className="excel-uploader__icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </div>
        <label htmlFor="excel-file-input" className="excel-uploader__label">
          Upload TNCERA Excel file (.xlsx / .xls)
        </label>
        <p className="excel-uploader__hint">Click to browse or drag and drop</p>
        <input
          id="excel-file-input"
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          disabled={isProcessing}
          className="excel-uploader__input"
          aria-describedby={
            parseError ? 'excel-uploader-error' : uploadStatus ? 'excel-uploader-status' : undefined
          }
        />
      </div>

      {isProcessing && (
        <p className="excel-uploader__processing" aria-live="polite">
          <span className="excel-uploader__spinner" aria-hidden="true" />
          Processing file, please wait…
        </p>
      )}

      {parseError && (
        <p id="excel-uploader-error" className="excel-uploader__error" role="alert" aria-live="assertive">
          {parseError}
        </p>
      )}

      {uploadStatus && !parseError && (
        <p id="excel-uploader-status" className="excel-uploader__success" role="status" aria-live="polite">
          Upload complete — {uploadStatus.inserted} inserted, {uploadStatus.skipped} skipped
        </p>
      )}
    </div>
  )
}

export default ExcelUploader

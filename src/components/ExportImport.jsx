import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { exportUserData, importUserData } from '../lib/exportImport'

export default function ExportImport() {
  const [userId, setUserId] = useState(null)
  const [exportStatus, setExportStatus] = useState(null)
  const [importStatus, setImportStatus] = useState(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null)
    })
  }, [])

  async function handleExport() {
    if (!userId) return
    setExportStatus(null)
    setExportLoading(true)
    try {
      await exportUserData(userId)
      setExportStatus({ type: 'success', message: 'Exported successfully' })
    } catch (err) {
      setExportStatus({ type: 'error', message: err.message || 'Export failed' })
    } finally {
      setExportLoading(false)
    }
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setImportStatus(null)
    setImportLoading(true)
    try {
      const text = await file.text()
      const result = await importUserData(userId, text)
      if (result.errors && result.errors.length > 0) {
        setImportStatus({ type: 'error', message: result.errors.join('; ') })
      } else {
        // Handle both simple { upserted } and combined { upsertedPhcHsc, upsertedTncera } shapes
        const phcN = result.upsertedPhcHsc ?? result.upserted ?? 0
        const tnN = result.upsertedTncera ?? 0
        const parts = []
        if (tnN > 0) {
          parts.push(`${phcN} PHC/HSC record${phcN !== 1 ? 's' : ''}`)
          parts.push(`${tnN} TNCERA record${tnN !== 1 ? 's' : ''}`)
        } else if (result.upsertedPhcHsc !== undefined) {
          parts.push(`${phcN} PHC/HSC record${phcN !== 1 ? 's' : ''}`)
        } else {
          parts.push(`${phcN} record${phcN !== 1 ? 's' : ''}`)
        }
        setImportStatus({ type: 'success', message: `Imported ${parts.join(', ')}` })
      }
    } catch (err) {
      setImportStatus({ type: 'error', message: err.message || 'Import failed' })
    } finally {
      setImportLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <section aria-labelledby="export-import-heading" className="export-import__container">
      <span className="export-import__label" id="export-import-heading">Data:</span>

      <div className="export-import__group">
        <button
          type="button"
          className="export-import__btn export-import__btn--primary"
          onClick={handleExport}
          disabled={exportLoading || !userId}
          aria-busy={exportLoading}
        >
          {exportLoading ? 'Exporting…' : 'Export'}
        </button>
        {exportStatus && (
          <p
            role={exportStatus.type === 'error' ? 'alert' : 'status'}
            aria-live="polite"
            className={`export-import__status export-import__status--${exportStatus.type}`}
          >
            {exportStatus.message}
          </p>
        )}
      </div>

      <div className="export-import__group">
        <label htmlFor="import-file-input" className="export-import__btn export-import__btn--secondary" style={{ cursor: 'pointer' }}>
          Import JSON file
        </label>
        <input
          id="import-file-input"
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          disabled={importLoading || !userId}
          aria-busy={importLoading}
          className="export-import__file-input"
        />
        {importLoading && (
          <p role="status" aria-live="polite" className="export-import__status">Importing…</p>
        )}
        {importStatus && (
          <p
            role={importStatus.type === 'error' ? 'alert' : 'status'}
            aria-live="polite"
            className={`export-import__status export-import__status--${importStatus.type}`}
          >
            {importStatus.message}
          </p>
        )}
      </div>
    </section>
  )
}

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { exportUserData, importUserData } from '../lib/exportImport'

/**
 * ExportImport — UI component for exporting and importing user status data.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
 *
 * Behaviour:
 * - On mount, fetches the current authenticated user's ID from Supabase.
 * - Export button: calls exportUserData(userId) and shows a success message.
 *   The exported file contains both PHC/HSC and TNCERA statuses in a combined
 *   JSON object { phc_hsc: [...], tncera: [...] }.
 * - Import file input: reads the selected .json file as text and calls
 *   importUserData(userId, text), then shows the count of upserted records
 *   per table (PHC/HSC and TNCERA) or a descriptive error message.
 * - Both operations show a loading state while in progress.
 */
export default function ExportImport() {
  const [userId, setUserId] = useState(null)
  const [exportStatus, setExportStatus] = useState(null) // { type: 'success'|'error', message: string }
  const [importStatus, setImportStatus] = useState(null) // { type: 'success'|'error', message: string }
  const [exportLoading, setExportLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const fileInputRef = useRef(null)

  // Fetch the authenticated user's ID on mount (Requirement 11.1, 11.4)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null)
    })
  }, [])

  // ---------------------------------------------------------------------------
  // Export handler
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Import handler
  // ---------------------------------------------------------------------------
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
        // Display per-table counts (Requirement 9.7)
        const parts = []
        if (result.upsertedPhcHsc > 0 || result.upsertedTncera === 0) {
          parts.push(`${result.upsertedPhcHsc} PHC/HSC record${result.upsertedPhcHsc !== 1 ? 's' : ''}`)
        }
        if (result.upsertedTncera > 0) {
          parts.push(`${result.upsertedTncera} TNCERA record${result.upsertedTncera !== 1 ? 's' : ''}`)
        }
        const summary = parts.length > 0 ? parts.join(', ') : '0 records'
        setImportStatus({ type: 'success', message: `Imported ${summary}` })
      }
    } catch (err) {
      setImportStatus({ type: 'error', message: err.message || 'Import failed' })
    } finally {
      setImportLoading(false)
      // Reset the file input so the same file can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <section aria-labelledby="export-import-heading" style={{ fontFamily: 'sans-serif' }}>
      <h2 id="export-import-heading" style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>
        Export / Import Status Data
      </h2>

      {/* Export */}
      <div style={{ marginBottom: '1rem' }}>
        <button
          type="button"
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
            style={{ color: exportStatus.type === 'error' ? '#dc2626' : '#16a34a', marginTop: '0.25rem' }}
          >
            {exportStatus.message}
          </p>
        )}
      </div>

      {/* Import */}
      <div>
        <label htmlFor="import-file-input" style={{ display: 'block', marginBottom: '0.25rem' }}>
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
        />

        {importLoading && (
          <p role="status" aria-live="polite" style={{ marginTop: '0.25rem', color: '#64748b' }}>
            Importing…
          </p>
        )}

        {importStatus && (
          <p
            role={importStatus.type === 'error' ? 'alert' : 'status'}
            aria-live="polite"
            style={{ color: importStatus.type === 'error' ? '#dc2626' : '#16a34a', marginTop: '0.25rem' }}
          >
            {importStatus.message}
          </p>
        )}
      </div>
    </section>
  )
}

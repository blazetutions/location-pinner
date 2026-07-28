import { useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import AuthGate from './components/AuthGate'
import AdminPanel from './components/AdminPanel'
import ExcelUploader from './components/ExcelUploader'
import TnceraGeocodingProgress from './components/TnceraGeocodingProgress'
import MapDisplay from './components/MapDisplay'
import TnceraFiltersSidebar from './components/TnceraFiltersSidebar'
import ExportImport from './components/ExportImport'
import { useRole } from './hooks/useRole'
import { TnceraGeocodingProvider, useTnceraGeocoding } from './hooks/useTnceraGeocoding.jsx'
import './index.css'

// ── Persistent geocoding indicator shown in the header ────────────────────────
function GeocodingHeaderIndicator({ onOpenPanel }) {
  const { status, current, total, counts } = useTnceraGeocoding()

  if (status === 'idle') return null

  if (status === 'running') {
    return (
      <button
        type="button"
        className="geocoding-indicator geocoding-indicator--running"
        onClick={onOpenPanel}
        aria-label={`Geocoding in progress: ${current} of ${total}. Click to view details.`}
      >
        <span className="geocoding-indicator__spinner" aria-hidden="true" />
        <span aria-live="polite" aria-atomic="true">
          {total > 0 ? `Geocoding… ${current}/${total}` : 'Geocoding…'}
        </span>
      </button>
    )
  }

  if (status === 'done' && total > 0) {
    return (
      <span
        className="geocoding-indicator geocoding-indicator--done"
        role="status"
        aria-live="polite"
      >
        ✓ {counts.geocoded} geocoded{counts.failed > 0 ? `, ${counts.failed} failed` : ''}
      </span>
    )
  }

  return null
}

// ── Main app content ──────────────────────────────────────────────────────────
function AppContent() {
  const { isAdmin, loading: roleLoading } = useRole()
  const { startGeocoding } = useTnceraGeocoding()

  const [showUploader, setShowUploader] = useState(false)
  const [tnceraRows, setTnceraRows] = useState([])
  const [tnceraFilters, setTnceraFilters] = useState({ districts: [], types: [], statuses: [] })

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  // Stable callback — useCallback so it never changes reference between renders
  const handleTnceraUploadComplete = useCallback((rows) => {
    setTnceraRows(rows)
    // Start geocoding immediately after upload — the hook guards against duplicates
    startGeocoding()
  }, [startGeocoding])

  function openPanel() {
    setShowUploader(true)
    // Scroll to top so the upload panel is visible
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="app-header">
        <h1>TN Clinical Establishments Map</h1>

        {roleLoading ? (
          <span className="role-loading" aria-live="polite">Loading…</span>
        ) : (
          isAdmin && <span className="admin-badge" aria-label="You have admin access">Admin</span>
        )}

        {/* Persistent geocoding indicator — visible regardless of panel state */}
        <GeocodingHeaderIndicator onOpenPanel={openPanel} />

        <nav className="app-nav" aria-label="Main navigation">
          <button
            type="button"
            className="nav-link"
            onClick={() => setShowUploader(v => !v)}
            aria-expanded={showUploader}
          >
            {showUploader ? 'Hide Upload' : 'Upload Excel'}
          </button>
          {isAdmin && (
            <a href="#admin" className="nav-link nav-link--admin">Admin Panel</a>
          )}
        </nav>

        <button onClick={handleLogout} className="logout-btn" aria-label="Log out">
          Logout
        </button>
      </header>

      {/* ── Upload panel (collapsible) ── */}
      {/* Collapsing this panel never stops the geocoding pass — the pass lives in the hook */}
      {showUploader && (
        <div className="upload-panel">
          <ExcelUploader onTnceraUploadComplete={handleTnceraUploadComplete} />
          {/* TnceraGeocodingProgress is purely presentational — safe to mount/unmount */}
          <TnceraGeocodingProgress />
        </div>
      )}

      {/* ── Main layout: sidebar + map ── */}
      <div className="app-body">
        <TnceraFiltersSidebar
          locations={tnceraRows}
          onFilterChange={setTnceraFilters}
        />
        <div className="map-wrapper">
          <MapDisplay tnceraFilters={tnceraFilters} />
        </div>
      </div>

      {/* ── Export / Import bar ── */}
      <div className="export-bar">
        <ExportImport />
      </div>

      {/* ── Admin panel ── */}
      {isAdmin && (
        <div id="admin" className="admin-section">
          <AdminPanel />
        </div>
      )}
    </div>
  )
}

// ── Root: wrap with provider so hook state outlives any child re-renders ──────
function App() {
  return (
    <AuthGate>
      <TnceraGeocodingProvider>
        <AppContent />
      </TnceraGeocodingProvider>
    </AuthGate>
  )
}

export default App

import { useState } from 'react'
import { supabase } from './supabaseClient'
import AuthGate from './components/AuthGate'
import AdminPanel from './components/AdminPanel'
import ExcelUploader from './components/ExcelUploader'
import TnceraGeocodingProgress from './components/TnceraGeocodingProgress'
import MapDisplay from './components/MapDisplay'
import TnceraFiltersSidebar from './components/TnceraFiltersSidebar'
import ExportImport from './components/ExportImport'
import { useRole } from './hooks/useRole'
import './index.css'

function AppContent() {
  const { isAdmin, loading: roleLoading } = useRole()

  const [showUploader, setShowUploader] = useState(false)
  const [tnceraRows, setTnceraRows] = useState([])
  const [tnceraFilters, setTnceraFilters] = useState({ districts: [], types: [], statuses: [] })

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  function handleTnceraUploadComplete(rows) {
    setTnceraRows(rows)
  }

  function handleTnceraGeocodingComplete() {
    setTnceraRows(prev => [...prev])
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
      {showUploader && (
        <div className="upload-panel">
          <ExcelUploader onTnceraUploadComplete={handleTnceraUploadComplete} />
          {tnceraRows.length > 0 && (
            <TnceraGeocodingProgress
              tnceraRows={tnceraRows}
              onGeocodingComplete={handleTnceraGeocodingComplete}
            />
          )}
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

function App() {
  return (
    <AuthGate>
      <AppContent />
    </AuthGate>
  )
}

export default App

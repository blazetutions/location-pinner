import { useState } from 'react'
import { supabase } from './supabaseClient'
import AuthGate from './components/AuthGate'
import AdminPanel from './components/AdminPanel'
import ExcelUploader from './components/ExcelUploader'
import GeocodingProgress from './components/GeocodingProgress'
import MapDisplay from './components/MapDisplay'
import FiltersSidebar from './components/FiltersSidebar'
import ExportImport from './components/ExportImport'
import { useRole } from './hooks/useRole'
import './index.css'

function AppContent() {
  const { isAdmin, loading: roleLoading } = useRole()

  // State shared between upload, geocoding, map, and filters
  const [locationRows, setLocationRows] = useState([])
  const [activeFilters, setActiveFilters] = useState({
    zone: null, block: null, phc: null, statuses: [],
  })
  const [showUploader, setShowUploader] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  function handleUploadComplete(rows) {
    setLocationRows(rows)
  }

  function handleGeocodingComplete() {
    // Trigger a map refresh by re-setting locationRows
    setLocationRows(prev => [...prev])
  }

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="app-header">
        <h1>TN Health Map</h1>

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
          <ExcelUploader onUploadComplete={handleUploadComplete} />
          <GeocodingProgress
            locationRows={locationRows}
            onGeocodingComplete={handleGeocodingComplete}
          />
        </div>
      )}

      {/* ── Main layout: sidebar + map ── */}
      <div className="app-body">
        <FiltersSidebar
          locations={locationRows}
          userStatuses={new Map()}
          onFilterChange={setActiveFilters}
        />
        <div className="map-wrapper">
          <MapDisplay
            activeFilters={activeFilters}
            isAdmin={isAdmin}
          />
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

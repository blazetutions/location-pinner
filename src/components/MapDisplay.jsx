import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { supabase } from '../supabaseClient'
import { getMarkerColor } from '../lib/getMarkerColor'
import { getAdminMarkerColor } from '../lib/getAdminMarkerColor'
import { buildPopupHTML } from '../lib/buildPopupHTML'
import { applyFilters } from '../lib/applyFilters'
import { saveStatus } from '../lib/saveStatus'
import { handleSupabaseError } from '../lib/handleSupabaseError'

// Chennai coordinates
const CHENNAI_LAT = 13.0827
const CHENNAI_LNG = 80.2707
const DEFAULT_ZOOM = 11

// Empty filter sentinel — used when activeFilters is null/undefined
const EMPTY_FILTER = { zone: null, block: null, phc: null, statuses: [] }

// ── Popup error helpers ───────────────────────────────────────────────────
/**
 * Display an inline error message inside a popup container.
 * Creates a `.popup-error` element if one doesn't already exist.
 *
 * @param {Element} container
 * @param {string} message
 */
function showPopupError(container, message) {
  let errorEl = container.querySelector('.popup-error')
  if (!errorEl) {
    errorEl = document.createElement('div')
    errorEl.className = 'popup-error'
    errorEl.style.cssText = 'color:#dc2626;font-size:0.875rem;margin-top:0.25rem;'
    const saveBtn = container.querySelector('.popup-save-btn')
    if (saveBtn && saveBtn.parentNode) {
      saveBtn.parentNode.insertBefore(errorEl, saveBtn.nextSibling)
    } else {
      container.appendChild(errorEl)
    }
  }
  errorEl.textContent = message
}

/**
 * Remove any existing inline error from the popup container.
 * @param {Element} container
 */
function clearPopupError(container) {
  const errorEl = container.querySelector('.popup-error')
  if (errorEl) errorEl.textContent = ''
}

/**
 * MapDisplay — renders an interactive Leaflet map of Chennai health facilities.
 *
 * @param {Object} props
 * @param {{ zone: string|null, block: string|null, phc: string|null, statuses: string[] }} props.activeFilters
 *   — active filter state; drives which markers are shown
 * @param {Map<number, { status: string, note: string }>} [props.userStatuses]
 *   — optional external userStatuses Map; if provided, takes precedence for filter evaluation
 * @param {(locationId: string, status: string, note: string) => void} props.onStatusChange
 *   — called when a popup Save is clicked; wired in task 9.2
 * @param {boolean} [props.isAdmin]
 *   — when true, markers are coloured by aggregate status across all users (Requirement 16.6)
 */
export default function MapDisplay({ activeFilters, userStatuses: userStatusesProp, onStatusChange, isAdmin }) {
  // Refs: the container div and the Leaflet map instance
  const containerRef = useRef(null)
  const mapRef = useRef(null)

  // Refs for cross-effect access to cluster group, individual markers, and HSC markers
  const clusterGroupRef = useRef(null)
  const markersRef = useRef(new Map())       // Map<loc.id, L.CircleMarker>
  const hscMarkersRef = useRef([])           // L.CircleMarker[] for HSC-level locations
  const updateHscVisibilityRef = useRef(null) // stable reference to zoom handler fn
  const locsByMarkerIdRef = useRef(new Map()) // Map<marker._leaflet_id, loc>
  const userIdRef = useRef(null)             // authenticated user's UUID
  // Keep a ref to the latest userStatusesInternal so the popupopen handler always
  // reads the current value without needing to be re-registered every render.
  const userStatusesInternalRef = useRef(new Map())

  // Admin mode refs (Requirement 16.6)
  const isAdminRef = useRef(false)
  const allUserStatusesRef = useRef(new Map()) // Map<locationId, UserStatusRow[]>

  // Keep isAdminRef in sync with the prop on every render
  isAdminRef.current = isAdmin ?? false

  // State: locations + per-user statuses loaded from Supabase
  const [locations, setLocations] = useState([])
  const [userStatusesInternal, setUserStatusesInternal] = useState(new Map())
  // Error banner shown when a Supabase load fails (Requirement 9.5)
  const [loadError, setLoadError] = useState(null)
  // Admin user-selector state (Requirement 16.7)
  const [selectedAdminUser, setSelectedAdminUser] = useState(null) // null = all users
  const [adminUserIds, setAdminUserIds] = useState([])             // unique user_ids from allUserStatuses
  const selectedAdminUserRef = useRef(null)
  selectedAdminUserRef.current = selectedAdminUser

  // Resolve which statuses map to use: external prop wins if provided
  const userStatuses = userStatusesProp instanceof Map ? userStatusesProp : userStatusesInternal

  // Keep the ref in sync so the popupopen handler always sees the latest statuses
  userStatusesInternalRef.current = userStatusesInternal

  /**
   * Returns the correct marker colour for a location.
   * In admin mode: aggregate colour across all users via getAdminMarkerColor.
   * In normal mode: single-user colour via getMarkerColor.
   *
   * @param {number} locId
   * @returns {string} CSS hex colour
   */
  function resolveMarkerColor(locId) {
    if (isAdminRef.current) {
      const allRows = allUserStatusesRef.current.get(locId) ?? []
      if (selectedAdminUserRef.current) {
        // Filter to selected user's row only, use single-user colour
        const userRow = allRows.find(r => r.user_id === selectedAdminUserRef.current)
        return getMarkerColor(userRow?.status)
      }
      // All users: aggregate colour
      return getAdminMarkerColor(allRows)
    }
    return getMarkerColor(userStatusesInternalRef.current.get(locId)?.status)
  }

  // ── Initialise map once on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const map = L.map(containerRef.current).setView(
      [CHENNAI_LAT, CHENNAI_LNG],
      DEFAULT_ZOOM
    )
    mapRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)

    // Fetch the current user's id once and store for later popup saves
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.id) {
        userIdRef.current = data.user.id
      }
    })

    // Fetch locations and user statuses in parallel
    Promise.all([
      supabase.from('locations').select('*').not('lat', 'is', null),
      supabase.from('user_location_status').select('*'),
    ])
      .then(async ([locResult, statusResult]) => {
        if (locResult.error) {
          const msg = handleSupabaseError(locResult.error)
          setLoadError(msg)
          return
        }
        if (statusResult.error) {
          const msg = handleSupabaseError(statusResult.error)
          setLoadError(msg)
          return
        }

        const locs = locResult.data ?? []
        const statuses = statusResult.data ?? []

        // Build a Map keyed by location_id for O(1) lookup
        const statusMap = new Map(statuses.map(s => [s.location_id, s]))

        // Store in state for later reactive updates
        setLocations(locs)
        setUserStatusesInternal(statusMap)
        userStatusesInternalRef.current = statusMap

        // ── Admin overlay: fetch all users' statuses (Requirement 16.6) ──────
        if (isAdminRef.current) {
          const { data: allStatuses } = await supabase.rpc('export_all_statuses')
          const grouped = new Map()
          allStatuses?.forEach(row => {
            const list = grouped.get(row.location_id) ?? []
            list.push(row)
            grouped.set(row.location_id, list)
          })
          allUserStatusesRef.current = grouped
          // Extract unique user_ids for the selector dropdown (Requirement 16.7)
          const uniqueUserIds = [...new Set(allStatuses?.map(r => r.user_id) ?? [])]
          setAdminUserIds(uniqueUserIds)
        }

        // Build cluster group
        const clusterGroup = L.markerClusterGroup({ maxClusterRadius: 60 })
        clusterGroupRef.current = clusterGroup

        // Build all markers upfront and store in markersRef
        const markersMap = new Map()
        const hscMarkers = []
        const locsByMarkerId = new Map()

        locs.forEach(loc => {
          const color = resolveMarkerColor(loc.id)

          const marker = L.circleMarker([loc.lat, loc.lng], {
            color,
            fillColor: color,
            fillOpacity: 0.8,
            radius: 8,
          })

          // Lazily-evaluated popup — only built when the user opens it
          marker.bindPopup(() => buildPopupHTML(loc, userStatusesInternalRef.current.get(loc.id)))

          markersMap.set(loc.id, marker)
          // Register after Leaflet assigns _leaflet_id (happens on bindPopup/addTo)
          locsByMarkerId.set(marker._leaflet_id, loc)

          if (loc.level === 'hsc') {
            hscMarkers.push(marker)
          }
        })

        markersRef.current = markersMap
        hscMarkersRef.current = hscMarkers
        locsByMarkerIdRef.current = locsByMarkerId

        // Add all markers to cluster group initially (no active filters on load)
        locs.forEach(loc => {
          const marker = markersMap.get(loc.id)
          if (marker) clusterGroup.addLayer(marker)
        })

        // Guard: map may have been removed before the async work completed
        if (mapRef.current) {
          clusterGroup.addTo(mapRef.current)

          // Show/hide HSC markers based on current zoom level
          function updateHscVisibility() {
            const zoom = map.getZoom()
            const cg = clusterGroupRef.current
            if (!cg) return
            if (zoom < 13) {
              hscMarkersRef.current.forEach(m => cg.removeLayer(m))
            } else {
              hscMarkersRef.current.forEach(m => {
                if (!cg.hasLayer(m)) cg.addLayer(m)
              })
            }
          }

          // Store stable reference so the filter effect can call it
          updateHscVisibilityRef.current = updateHscVisibility

          map.on('zoomend', updateHscVisibility)

          // Apply immediately at the initial zoom level (11 < 13, so HSC hidden on load)
          updateHscVisibility()

          // ── Popup Save button wiring ───────────────────────────────────────
          map.on('popupopen', (e) => {
            const container = e.popup.getElement()
            if (!container) return

            const saveBtn = container.querySelector('.popup-save-btn')
            if (!saveBtn) return

            // Use a named handler so we can cleanly replace it if the popup
            // is reused (Leaflet recycles the element).
            const handleSave = async () => {
              const statusSelect = container.querySelector('.popup-status')
              const noteTextarea = container.querySelector('.popup-note')
              const locationId = Number(saveBtn.dataset.locationId)

              const status = statusSelect ? statusSelect.value : null
              const note = noteTextarea ? noteTextarea.value : ''
              const userId = userIdRef.current

              if (!userId) {
                showPopupError(container, 'Not authenticated — please reload.')
                return
              }

              // Disable button while saving
              saveBtn.disabled = true
              saveBtn.textContent = 'Saving…'
              clearPopupError(container)

              const result = await saveStatus(locationId, userId, status, note)

              saveBtn.disabled = false
              saveBtn.textContent = 'Save'

              if (!result.success) {
                // Requirement 8.6 — show readable error inline
                showPopupError(container, result.error ?? 'Save failed.')
                return
              }

              // Update internal status map (immutable update)
              setUserStatusesInternal(prev => {
                const next = new Map(prev)
                next.set(locationId, result.data)
                return next
              })
              userStatusesInternalRef.current = new Map(userStatusesInternalRef.current)
              userStatusesInternalRef.current.set(locationId, result.data)

              // Update marker colour immediately (Req 4.6)
              // In admin mode use resolveMarkerColor; in normal mode use single-user colour
              const marker = markersRef.current.get(locationId)
              if (marker) {
                const newColor = isAdminRef.current
                  ? resolveMarkerColor(locationId)
                  : getMarkerColor(status)
                marker.setStyle({ color: newColor, fillColor: newColor })
              }

              // Notify parent (App.jsx wires filter counts etc.)
              if (typeof onStatusChange === 'function') {
                onStatusChange(locationId, status, note)
              }

              // Close the popup on success
              map.closePopup()
            }

            // Remove any previously attached handler to avoid duplicates
            saveBtn.removeEventListener('click', saveBtn._kiroSaveHandler)
            saveBtn._kiroSaveHandler = handleSave
            saveBtn.addEventListener('click', handleSave)
          })
        }
      })
      .catch(err => {
        console.error('Unexpected error loading map data:', err)
      })

    // Cleanup: remove map on unmount
    return () => {
      map.remove()
      mapRef.current = null
      clusterGroupRef.current = null
      markersRef.current = new Map()
      hscMarkersRef.current = []
      updateHscVisibilityRef.current = null
      locsByMarkerIdRef.current = new Map()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — intentionally runs once

  // ── Reactive filter effect ────────────────────────────────────────────────
  // Re-runs whenever activeFilters, locations, or userStatuses changes.
  // Client-side only — no new Supabase calls.
  useEffect(() => {
    const clusterGroup = clusterGroupRef.current
    if (!clusterGroup || locations.length === 0) return

    const filters = activeFilters ?? EMPTY_FILTER
    const filteredLocs = applyFilters(locations, userStatuses, filters)
    const filteredIds = new Set(filteredLocs.map(loc => loc.id))

    // Rebuild the cluster group with only the filtered markers
    clusterGroup.clearLayers()

    locations.forEach(loc => {
      if (!filteredIds.has(loc.id)) return
      const marker = markersRef.current.get(loc.id)
      if (!marker) return

      // Re-colour every visible marker in case status changed or mode switched
      const newColor = resolveMarkerColor(loc.id)
      marker.setStyle({ color: newColor, fillColor: newColor })

      clusterGroup.addLayer(marker)
    })

    // Re-apply zoom-based HSC visibility after repopulating the cluster group
    if (updateHscVisibilityRef.current) {
      updateHscVisibilityRef.current()
    }
  }, [activeFilters, locations, userStatuses])

  // ── Re-colour markers when admin switches the selected user ──────────────
  useEffect(() => {
    if (!isAdminRef.current) return
    const clusterGroup = clusterGroupRef.current
    if (!clusterGroup) return
    markersRef.current.forEach((marker, locId) => {
      if (!clusterGroup.hasLayer(marker)) return
      const newColor = resolveMarkerColor(locId)
      marker.setStyle({ color: newColor, fillColor: newColor })
    })
  }, [selectedAdminUser]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {loadError && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            background: '#fee2e2',
            color: '#991b1b',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            borderBottom: '1px solid #fca5a5',
          }}
        >
          {loadError}
        </div>
      )}

      {isAdmin && (
        <div
          className="admin-user-selector"
          style={{ padding: '0.5rem 1rem', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <label htmlFor="admin-user-select" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
            Viewing as:
          </label>
          <select
            id="admin-user-select"
            value={selectedAdminUser ?? ''}
            onChange={e => setSelectedAdminUser(e.target.value || null)}
            aria-label="Select user to view statuses for"
            style={{ fontSize: '0.875rem' }}
          >
            <option value="">All Users</option>
            {adminUserIds.map(uid => (
              <option key={uid} value={uid}>{uid.slice(0, 8)}…</option>
            ))}
          </select>
        </div>
      )}

      <div
        ref={containerRef}
        style={{ height: '100%', width: '100%' }}
        aria-label="Interactive map of Chennai health facilities"
        role="application"
      />
    </>
  )
}

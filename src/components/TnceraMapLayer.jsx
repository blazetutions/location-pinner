import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet.markercluster'
import { supabase } from '../supabaseClient'
import { getTnceraMarkerColor } from '../lib/getTnceraMarkerColor.js'
import { buildTnceraPopupHTML } from '../lib/buildTnceraPopupHTML.js'
import { saveTnceraStatus } from '../lib/saveTnceraStatus.js'

// ── Popup error helpers ───────────────────────────────────────────────────

/**
 * Display an inline error message inside a TNCERA popup container.
 * Creates a `.tncera-popup-error` element if one doesn't already exist.
 *
 * @param {Element} container
 * @param {string} message
 */
function showPopupError(container, message) {
  let errorEl = container.querySelector('.tncera-popup-error')
  if (!errorEl) {
    errorEl = document.createElement('div')
    errorEl.className = 'tncera-popup-error'
    errorEl.style.cssText = 'color:#dc2626;font-size:0.875rem;margin-top:0.25rem;'
    const saveBtn = container.querySelector('.tncera-popup-save-btn')
    if (saveBtn && saveBtn.parentNode) {
      saveBtn.parentNode.insertBefore(errorEl, saveBtn.nextSibling)
    } else {
      container.appendChild(errorEl)
    }
  }
  errorEl.textContent = message
}

/**
 * Remove any existing inline error from the TNCERA popup container.
 * @param {Element} container
 */
function clearPopupError(container) {
  const errorEl = container.querySelector('.tncera-popup-error')
  if (errorEl) errorEl.textContent = ''
}

// ── Filter helper ─────────────────────────────────────────────────────────

/**
 * Client-side filter for TNCERA locations.
 * Returns only those locations matching all active filter conditions (AND logic).
 *
 * @param {Object[]} locations - Full array of geocoded TNCERALocationRows
 * @param {Map<string, { status: string, note: string|null }>} userStatuses
 * @param {{ types?: string[], statuses?: string[] }} tnceraFilters
 * @returns {Object[]} filtered subset of locations
 */
function applyTnceraFilters(locations, userStatuses, tnceraFilters) {
  const { types = [], statuses = [] } = tnceraFilters || {}
  return locations.filter(loc => {
    if (types.length > 0 && !types.includes(loc.establishment_type)) return false
    if (statuses.length > 0) {
      const userStatus = userStatuses.get(loc.id)?.status ?? 'Pending'
      if (!statuses.includes(userStatus)) return false
    }
    return true
  })
}

/**
 * TnceraMapLayer — a render-less React component that manages the TNCERA
 * Leaflet marker layer on the map passed via props.
 *
 * Responsibilities:
 *  - On mount: fetch geocoded TNCERA locations + current user's statuses,
 *    build an L.MarkerClusterGroup with circle markers, and add it to the map.
 *  - On `isVisible` change: add/remove the cluster group from the map.
 *  - On `tnceraFilters` change: repopulate the cluster group via client-side filter.
 *  - On popup open: wire the Save button to persist status and recolour the marker.
 *  - On unmount: clean up event listeners and layers without destroying the map.
 *
 * @param {Object}   props
 * @param {L.Map}    props.map              - Leaflet map instance (created by parent)
 * @param {boolean}  props.isVisible        - Layer visibility toggle
 * @param {{ types: string[], statuses: string[] }} props.tnceraFilters - Active filters
 * @param {(locationId: string, status: string, note: string) => void} props.onStatusChange
 */
export default function TnceraMapLayer({ map, isVisible, tnceraFilters, onStatusChange }) {
  // Ref to the L.MarkerClusterGroup managed by this component
  const clusterGroupRef = useRef(null)

  // Map<locationId, L.CircleMarker>
  const markersRef = useRef(new Map())

  // Map<locationId, { status, note }> — O(1) lookup in the popupopen handler
  const userStatusesRef = useRef(new Map())

  // Full array of geocoded locations — needed for filter re-application
  const locationsRef = useRef([])

  // Authenticated user's UUID
  const userIdRef = useRef(null)

  // Whether data has been loaded (guards the filter effect from running early)
  const loadedRef = useRef(false)

  // ── Mount: fetch data, build markers, add to map ─────────────────────────
  useEffect(() => {
    if (!map) return

    // Fetch current user id
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.id) {
        userIdRef.current = data.user.id
      }
    })

    // Fetch locations + user statuses in parallel
    Promise.all([
      supabase
        .from('tncera_locations')
        .select('*')
        .eq('geocode_status', 'geocoded'),
      supabase
        .from('user_tncera_status')
        .select('*'),
    ])
      .then(([locResult, statusResult]) => {
        if (locResult.error) {
          console.error('TnceraMapLayer: failed to load locations', locResult.error)
          return
        }
        if (statusResult.error) {
          console.error('TnceraMapLayer: failed to load user statuses', statusResult.error)
          return
        }

        const locs = locResult.data ?? []
        const statuses = statusResult.data ?? []

        // Build userStatuses map keyed by location_id
        const statusMap = new Map(statuses.map(s => [s.location_id, s]))
        userStatusesRef.current = statusMap

        // Store full locations list for later filter re-application
        locationsRef.current = locs

        // Build cluster group
        const clusterGroup = L.markerClusterGroup({ maxClusterRadius: 60 })
        clusterGroupRef.current = clusterGroup

        // Create circle markers
        const markersMap = new Map()
        locs.forEach(loc => {
          const userStatus = statusMap.get(loc.id)?.status
          const color = getTnceraMarkerColor(userStatus)

          const marker = L.circleMarker([loc.lat, loc.lng], {
            color,
            fillColor: color,
            fillOpacity: 0.8,
            radius: 8,
          })

          // Lazily-evaluated popup — only built when the user opens it
          marker.bindPopup(() =>
            buildTnceraPopupHTML(loc, userStatusesRef.current.get(loc.id))
          )

          markersMap.set(loc.id, marker)
          clusterGroup.addLayer(marker)
        })

        markersRef.current = markersMap
        loadedRef.current = true

        // Guard: only add to map if still mounted and layer is visible
        if (isVisible !== false) {
          clusterGroup.addTo(map)
        }

        // ── Popup Save button wiring (Task 11.3) ─────────────────────────
        const handlePopupOpen = (e) => {
          const container = e.popup.getElement()
          if (!container) return

          const saveBtn = container.querySelector('.tncera-popup-save-btn')
          if (!saveBtn) return

          const handleSave = async () => {
            const statusSelect = container.querySelector('.tncera-popup-status')
            const noteTextarea = container.querySelector('.tncera-popup-note')
            const locationId = saveBtn.dataset.locationId

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

            const result = await saveTnceraStatus(locationId, userId, status, note)

            saveBtn.disabled = false
            saveBtn.textContent = 'Save'

            if (!result.success) {
              // Requirements 6.7, 6.8 — show readable error inline
              showPopupError(container, result.error ?? 'Save failed.')
              return
            }

            // Update internal userStatuses map (Requirement 6.6)
            userStatusesRef.current = new Map(userStatusesRef.current)
            userStatusesRef.current.set(locationId, result.data)

            // Recolour the marker immediately (Requirement 6.6)
            const marker = markersRef.current.get(locationId)
            if (marker) {
              const newColor = getTnceraMarkerColor(status)
              marker.setStyle({ color: newColor, fillColor: newColor })
            }

            // Notify parent
            if (typeof onStatusChange === 'function') {
              onStatusChange(locationId, status, note)
            }

            // Close the popup on success
            map.closePopup()
          }

          // Replace any previously attached handler to avoid duplicates
          saveBtn.removeEventListener('click', saveBtn._tnceraKiroSaveHandler)
          saveBtn._tnceraKiroSaveHandler = handleSave
          saveBtn.addEventListener('click', handleSave)
        }

        map.on('popupopen', handlePopupOpen)

        // Store the handler reference so we can remove it on unmount
        map._tnceraPopupOpenHandler = handlePopupOpen
      })
      .catch(err => {
        console.error('TnceraMapLayer: unexpected error during data load', err)
      })

    // Cleanup on unmount — do NOT call map.remove() (map is owned by parent)
    return () => {
      const clusterGroup = clusterGroupRef.current
      if (clusterGroup && map) {
        map.removeLayer(clusterGroup)
      }
      if (map && map._tnceraPopupOpenHandler) {
        map.off('popupopen', map._tnceraPopupOpenHandler)
        delete map._tnceraPopupOpenHandler
      }
      clusterGroupRef.current = null
      markersRef.current = new Map()
      userStatusesRef.current = new Map()
      locationsRef.current = []
      loadedRef.current = false
    }
  }, [map]) // eslint-disable-line react-hooks/exhaustive-deps — intentionally runs once per map instance

  // ── Layer visibility toggle (Task 11.2) ──────────────────────────────────
  useEffect(() => {
    const clusterGroup = clusterGroupRef.current
    if (!clusterGroup || !map || !loadedRef.current) return

    if (isVisible === false) {
      // Remove TNCERA layer from map without affecting PHC/HSC layer
      if (map.hasLayer(clusterGroup)) {
        map.removeLayer(clusterGroup)
      }
    } else {
      // Add back and re-apply current filters
      if (!map.hasLayer(clusterGroup)) {
        clusterGroup.addTo(map)
      }
      // Re-apply filters so only matching markers are visible
      const filtered = applyTnceraFilters(
        locationsRef.current,
        userStatusesRef.current,
        tnceraFilters
      )
      const filteredIds = new Set(filtered.map(loc => loc.id))

      clusterGroup.clearLayers()
      locationsRef.current.forEach(loc => {
        if (!filteredIds.has(loc.id)) return
        const marker = markersRef.current.get(loc.id)
        if (marker) clusterGroup.addLayer(marker)
      })
    }
  }, [isVisible]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter reactivity (Task 11.2) ────────────────────────────────────────
  useEffect(() => {
    const clusterGroup = clusterGroupRef.current
    if (!clusterGroup || !map || !loadedRef.current) return

    // Skip if layer is not visible — filters will be applied when it becomes visible
    if (isVisible === false) return

    const filtered = applyTnceraFilters(
      locationsRef.current,
      userStatusesRef.current,
      tnceraFilters
    )
    const filteredIds = new Set(filtered.map(loc => loc.id))

    // Rebuild cluster group with only matching markers (no extra Supabase calls)
    clusterGroup.clearLayers()
    locationsRef.current.forEach(loc => {
      if (!filteredIds.has(loc.id)) return
      const marker = markersRef.current.get(loc.id)
      if (marker) clusterGroup.addLayer(marker)
    })
  }, [tnceraFilters]) // eslint-disable-line react-hooks/exhaustive-deps

  // This component renders nothing — it only manipulates the Leaflet map
  return null
}

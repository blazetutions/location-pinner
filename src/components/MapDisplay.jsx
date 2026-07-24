import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import TnceraMapLayer from './TnceraMapLayer'

// Tamil Nadu centre coordinates
const TN_LAT = 11.1271
const TN_LNG = 78.6569
const DEFAULT_ZOOM = 7

/**
 * MapDisplay — renders the Leaflet map and hosts the TNCERA layer.
 *
 * @param {{ tnceraFilters: { districts: string[], types: string[], statuses: string[] } }} props
 */
export default function MapDisplay({ tnceraFilters = {} }) {
  const containerRef = useRef(null)
  const [mapInstance, setMapInstance] = useState(null)

  // Initialise the Leaflet map once on mount
  useEffect(() => {
    if (!containerRef.current) return

    const map = L.map(containerRef.current).setView([TN_LAT, TN_LNG], DEFAULT_ZOOM)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)

    setMapInstance(map)

    return () => {
      map.remove()
      setMapInstance(null)
    }
  }, [])

  return (
    <>
      <div
        ref={containerRef}
        style={{ height: '100%', width: '100%' }}
        aria-label="Interactive map of Tamil Nadu clinical establishments"
        role="application"
      />
      {mapInstance && (
        <TnceraMapLayer
          map={mapInstance}
          isVisible={true}
          tnceraFilters={tnceraFilters}
        />
      )}
    </>
  )
}

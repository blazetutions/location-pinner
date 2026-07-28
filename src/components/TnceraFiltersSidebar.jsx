import { useEffect, useState } from 'react'

/**
 * TnceraFiltersSidebar — filters for District, Type of Establishment, and Status.
 * Includes mobile drawer pattern (toggle button + overlay + slide-in panel).
 *
 * @param {{ locations: object[], onFilterChange: Function }} props
 */
export default function TnceraFiltersSidebar({ locations = [], onFilterChange }) {
  const [selectedDistricts, setSelectedDistricts] = useState([])
  const [selectedTypes, setSelectedTypes] = useState([])
  const [selectedStatuses, setSelectedStatuses] = useState([])
  const [drawerOpen, setDrawerOpen] = useState(false)

  const districts = [...new Set(locations.map(l => l.district).filter(Boolean))].sort()
  const establishmentTypes = [...new Set(locations.map(l => l.establishment_type).filter(Boolean))].sort()
  const STATUS_OPTIONS = ['Visited', 'Converted', 'Pending']

  useEffect(() => {
    if (typeof onFilterChange === 'function') {
      onFilterChange({ districts: selectedDistricts, types: selectedTypes, statuses: selectedStatuses })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDistricts, selectedTypes, selectedStatuses])

  function toggle(setter, value) {
    setter(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])
  }

  function handleClear() {
    setSelectedDistricts([])
    setSelectedTypes([])
    setSelectedStatuses([])
  }

  const content = (
    <div className="tncera-filters-sidebar__content">
      <div className="tncera-filters-sidebar__header">
        <h2 className="tncera-filters-sidebar__title">Filters</h2>
        <button
          className="tncera-filters-sidebar__close"
          aria-label="Close filters"
          onClick={() => setDrawerOpen(false)}
        >✕</button>
      </div>

      <div className="tncera-filters-sidebar__group">
        <fieldset className="tncera-filters-sidebar__fieldset">
          <legend className="tncera-filters-sidebar__label">District</legend>
          <div className="tncera-filters-sidebar__scroll">
            {districts.length === 0 ? (
              <p className="tncera-filters-sidebar__empty">No data loaded</p>
            ) : districts.map(d => (
              <label key={d} className="tncera-filters-sidebar__checkbox-label">
                <input type="checkbox" className="tncera-filters-sidebar__checkbox"
                  checked={selectedDistricts.includes(d)}
                  onChange={() => toggle(setSelectedDistricts, d)}
                  aria-label={d} />
                {d}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="tncera-filters-sidebar__group">
        <fieldset className="tncera-filters-sidebar__fieldset">
          <legend className="tncera-filters-sidebar__label">Type of Establishment</legend>
          <div className="tncera-filters-sidebar__scroll">
            {establishmentTypes.length === 0 ? (
              <p className="tncera-filters-sidebar__empty">No data loaded</p>
            ) : establishmentTypes.map(type => (
              <label key={type} className="tncera-filters-sidebar__checkbox-label">
                <input type="checkbox" className="tncera-filters-sidebar__checkbox"
                  checked={selectedTypes.includes(type)}
                  onChange={() => toggle(setSelectedTypes, type)}
                  aria-label={type} />
                {type}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="tncera-filters-sidebar__group">
        <fieldset className="tncera-filters-sidebar__fieldset">
          <legend className="tncera-filters-sidebar__label">Status</legend>
          {STATUS_OPTIONS.map(status => (
            <label key={status} className="tncera-filters-sidebar__checkbox-label">
              <input type="checkbox" className="tncera-filters-sidebar__checkbox"
                checked={selectedStatuses.includes(status)}
                onChange={() => toggle(setSelectedStatuses, status)}
                aria-label={status} />
              {status}
            </label>
          ))}
        </fieldset>
      </div>

      <button className="tncera-filters-sidebar__clear" onClick={handleClear} aria-label="Clear all filters">
        Clear Filters
      </button>
    </div>
  )

  return (
    <>
      <button
        className="tncera-filters-sidebar__toggle"
        aria-label="Open filters"
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen(true)}
      >Filters</button>

      <aside className="tncera-filters-sidebar" aria-label="Filters">
        {content}
      </aside>

      {drawerOpen && (
        <div className="tncera-filters-sidebar__overlay" role="dialog" aria-modal="true" aria-label="Filters drawer">
          <div className="tncera-filters-sidebar__drawer">
            {content}
          </div>
        </div>
      )}
    </>
  )
}

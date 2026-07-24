import { useEffect, useState } from 'react'

/**
 * TnceraFiltersSidebar
 *
 * Sidebar filters for the TNCERA clinical establishments layer.
 * Provides:
 *  - District multi-select (derived from loaded locations)
 *  - Type of Establishment multi-select (derived from loaded locations)
 *  - Visit Status multi-select (fixed: Visited, Converted, Pending)
 *
 * @param {Object}   props
 * @param {Array}    props.locations       - TNCERALocationRow[] (geocoded rows)
 * @param {Function} props.onFilterChange  - ({ districts, types, statuses }) => void
 */
export default function TnceraFiltersSidebar({ locations = [], onFilterChange }) {
  const [selectedDistricts, setSelectedDistricts] = useState([])
  const [selectedTypes, setSelectedTypes] = useState([])
  const [selectedStatuses, setSelectedStatuses] = useState([])

  // Derived options — distinct, non-empty, sorted
  const districts = [...new Set(locations.map(l => l.district).filter(Boolean))].sort()
  const establishmentTypes = [...new Set(locations.map(l => l.establishment_type).filter(Boolean))].sort()

  // Emit filter changes whenever any selection changes
  useEffect(() => {
    if (typeof onFilterChange === 'function') {
      onFilterChange({
        districts: selectedDistricts,
        types: selectedTypes,
        statuses: selectedStatuses,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDistricts, selectedTypes, selectedStatuses])

  function toggle(setter, value) {
    setter(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    )
  }

  function handleClear() {
    setSelectedDistricts([])
    setSelectedTypes([])
    setSelectedStatuses([])
  }

  const STATUS_OPTIONS = ['Visited', 'Converted', 'Pending']

  return (
    <aside className="tncera-filters-sidebar" aria-label="Filters">
      <div className="tncera-filters-sidebar__content">
        <div className="tncera-filters-sidebar__header">
          <h2 className="tncera-filters-sidebar__title">Filters</h2>
        </div>

        {/* District */}
        <div className="tncera-filters-sidebar__group">
          <fieldset className="tncera-filters-sidebar__fieldset">
            <legend className="tncera-filters-sidebar__label">District</legend>
            {districts.length === 0 ? (
              <p className="tncera-filters-sidebar__empty">No data loaded</p>
            ) : (
              districts.map(d => (
                <label key={d} className="tncera-filters-sidebar__checkbox-label">
                  <input
                    type="checkbox"
                    className="tncera-filters-sidebar__checkbox"
                    checked={selectedDistricts.includes(d)}
                    onChange={() => toggle(setSelectedDistricts, d)}
                    aria-label={d}
                  />
                  {d}
                </label>
              ))
            )}
          </fieldset>
        </div>

        {/* Type of Establishment */}
        <div className="tncera-filters-sidebar__group">
          <fieldset className="tncera-filters-sidebar__fieldset">
            <legend className="tncera-filters-sidebar__label">Type of Establishment</legend>
            {establishmentTypes.length === 0 ? (
              <p className="tncera-filters-sidebar__empty">No data loaded</p>
            ) : (
              establishmentTypes.map(type => (
                <label key={type} className="tncera-filters-sidebar__checkbox-label">
                  <input
                    type="checkbox"
                    className="tncera-filters-sidebar__checkbox"
                    checked={selectedTypes.includes(type)}
                    onChange={() => toggle(setSelectedTypes, type)}
                    aria-label={type}
                  />
                  {type}
                </label>
              ))
            )}
          </fieldset>
        </div>

        {/* Visit Status */}
        <div className="tncera-filters-sidebar__group">
          <fieldset className="tncera-filters-sidebar__fieldset">
            <legend className="tncera-filters-sidebar__label">Status</legend>
            {STATUS_OPTIONS.map(status => (
              <label key={status} className="tncera-filters-sidebar__checkbox-label">
                <input
                  type="checkbox"
                  className="tncera-filters-sidebar__checkbox"
                  checked={selectedStatuses.includes(status)}
                  onChange={() => toggle(setSelectedStatuses, status)}
                  aria-label={status}
                />
                {status}
              </label>
            ))}
          </fieldset>
        </div>

        <button
          className="tncera-filters-sidebar__clear"
          onClick={handleClear}
          aria-label="Clear all filters"
        >
          Clear Filters
        </button>
      </div>
    </aside>
  )
}

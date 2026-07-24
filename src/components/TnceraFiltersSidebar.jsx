import { useEffect, useState } from 'react'

/**
 * TnceraFiltersSidebar
 *
 * Independent filter sidebar for the TNCERA clinical establishments layer.
 * Derives establishment type options dynamically from loaded location rows,
 * and provides a fixed Status multi-select. Emits filter state changes via
 * `onFilterChange` — does NOT manage map state directly.
 *
 * @param {Object}   props
 * @param {Array}    props.locations       - TNCERALocationRow[] (geocoded rows)
 * @param {Function} props.onFilterChange  - ({ types: string[], statuses: string[] }) => void
 */
export default function TnceraFiltersSidebar({ locations = [], onFilterChange }) {
  const [selectedTypes, setSelectedTypes] = useState([])
  const [selectedStatuses, setSelectedStatuses] = useState([])

  // ---------------------------------------------------------------------------
  // Derived establishment type options (Req 7.1)
  // Distinct, non-empty values sorted alphabetically
  // ---------------------------------------------------------------------------
  const establishmentTypes = [
    ...new Set(
      locations
        .map(l => l.establishment_type)
        .filter(Boolean)
    ),
  ].sort()

  // ---------------------------------------------------------------------------
  // Emit filter changes on every state change (Req 7.3, 7.4)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (typeof onFilterChange === 'function') {
      onFilterChange({ types: selectedTypes, statuses: selectedStatuses })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTypes, selectedStatuses])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleTypeToggle(type) {
    setSelectedTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    )
  }

  function handleStatusToggle(status) {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    )
  }

  /** Req 7.7, 7.8 — reset both fields and restore full marker visibility */
  function handleClearFilters() {
    setSelectedTypes([])
    setSelectedStatuses([])
    // useEffect will fire and call onFilterChange({ types: [], statuses: [] })
  }

  // ---------------------------------------------------------------------------
  // Fixed status options (Req 7.2)
  // ---------------------------------------------------------------------------
  const STATUS_OPTIONS = ['Visited', 'Converted', 'Pending']

  return (
    <aside className="tncera-filters-sidebar" aria-label="TNCERA Filters sidebar">
      <div className="tncera-filters-sidebar__content">
        <div className="tncera-filters-sidebar__header">
          <h2 className="tncera-filters-sidebar__title">TNCERA Filters</h2>
        </div>

        {/* Type of Establishment checkboxes (Req 7.1) */}
        <div className="tncera-filters-sidebar__group">
          <fieldset className="tncera-filters-sidebar__fieldset">
            <legend className="tncera-filters-sidebar__label">Type of Establishment</legend>
            {establishmentTypes.length === 0 ? (
              <p className="tncera-filters-sidebar__empty">No types loaded</p>
            ) : (
              establishmentTypes.map(type => (
                <label key={type} className="tncera-filters-sidebar__checkbox-label">
                  <input
                    type="checkbox"
                    className="tncera-filters-sidebar__checkbox"
                    checked={selectedTypes.includes(type)}
                    onChange={() => handleTypeToggle(type)}
                    aria-label={type}
                  />
                  {type}
                </label>
              ))
            )}
          </fieldset>
        </div>

        {/* Status checkboxes (Req 7.2) */}
        <div className="tncera-filters-sidebar__group">
          <fieldset className="tncera-filters-sidebar__fieldset">
            <legend className="tncera-filters-sidebar__label">Status</legend>
            {STATUS_OPTIONS.map(status => (
              <label key={status} className="tncera-filters-sidebar__checkbox-label">
                <input
                  type="checkbox"
                  className="tncera-filters-sidebar__checkbox"
                  checked={selectedStatuses.includes(status)}
                  onChange={() => handleStatusToggle(status)}
                  aria-label={status}
                />
                {status}
              </label>
            ))}
          </fieldset>
        </div>

        {/* Clear TNCERA Filters button (Req 7.7) */}
        <button
          className="tncera-filters-sidebar__clear"
          onClick={handleClearFilters}
          aria-label="Clear TNCERA filters"
        >
          Clear TNCERA Filters
        </button>
      </div>
    </aside>
  )
}

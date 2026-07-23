import { useEffect, useState } from 'react'
import { applyFilters } from '../lib/applyFilters'

/**
 * FiltersSidebar
 *
 * Cascading zone → block → PHC dropdowns, multi-select status checkboxes,
 * a summary count of the filtered set, and a Clear Filters button.
 *
 * On viewports narrower than 768 px the sidebar renders as a fixed overlay
 * (mobile drawer) toggled by a "Filters" button (Requirement 6.9).
 *
 * @param {Object}   props
 * @param {Array}    props.locations      - Full LocationRow[] list
 * @param {Map}      props.userStatuses   - Map<locationId, { status: string }>
 * @param {Function} props.onFilterChange - (FilterState) => void
 */
export default function FiltersSidebar({ locations = [], userStatuses = new Map(), onFilterChange }) {
  // --- filter state ---
  const [selectedZone, setSelectedZone] = useState(null)
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [selectedPhc, setSelectedPhc] = useState(null)
  const [selectedStatuses, setSelectedStatuses] = useState([])

  // --- mobile drawer state ---
  const [drawerOpen, setDrawerOpen] = useState(false)

  // ---------------------------------------------------------------------------
  // Derived cascading options
  // ---------------------------------------------------------------------------

  const zoneOptions = [...new Set(locations.map(l => l.zone))].sort()

  const blockOptions = selectedZone
    ? [...new Set(
        locations
          .filter(l => l.zone === selectedZone)
          .map(l => l.block)
      )].sort()
    : []

  const phcOptions = selectedZone && selectedBlock
    ? [...new Set(
        locations
          .filter(l => l.zone === selectedZone && l.block === selectedBlock)
          .map(l => l.phc)
      )].sort()
    : []

  // ---------------------------------------------------------------------------
  // Summary counts for the currently filtered result set
  // ---------------------------------------------------------------------------

  const filteredLocations = applyFilters(locations, userStatuses, {
    zone: selectedZone,
    block: selectedBlock,
    phc: selectedPhc,
    statuses: selectedStatuses,
  })

  const visitedCount = filteredLocations.filter(
    loc => (userStatuses.get(loc.id)?.status ?? 'Not Visited') === 'Visited'
  ).length

  const followUpCount = filteredLocations.filter(
    loc => (userStatuses.get(loc.id)?.status ?? 'Not Visited') === 'Follow-up Needed'
  ).length

  const notVisitedCount = filteredLocations.filter(
    loc => (userStatuses.get(loc.id)?.status ?? 'Not Visited') === 'Not Visited'
  ).length

  // ---------------------------------------------------------------------------
  // Emit filter changes via useEffect (Requirement 6.4)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (typeof onFilterChange === 'function') {
      onFilterChange({
        zone: selectedZone,
        block: selectedBlock,
        phc: selectedPhc,
        statuses: selectedStatuses,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedZone, selectedBlock, selectedPhc, selectedStatuses])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleZoneChange(e) {
    const value = e.target.value || null
    setSelectedZone(value)
    setSelectedBlock(null) // cascade reset
    setSelectedPhc(null)   // cascade reset
  }

  function handleBlockChange(e) {
    const value = e.target.value || null
    setSelectedBlock(value)
    setSelectedPhc(null) // cascade reset
  }

  function handlePhcChange(e) {
    setSelectedPhc(e.target.value || null)
  }

  function handleStatusToggle(status) {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    )
  }

  function handleClearFilters() {
    setSelectedZone(null)
    setSelectedBlock(null)
    setSelectedPhc(null)
    setSelectedStatuses([])
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const STATUS_OPTIONS = ['Visited', 'Not Visited', 'Follow-up Needed']

  const sidebarContent = (
    <div className="filters-sidebar__content">
      <div className="filters-sidebar__header">
        <h2 className="filters-sidebar__title">Filters</h2>
        {/* Close button for mobile drawer */}
        <button
          className="filters-sidebar__close"
          aria-label="Close filters"
          onClick={() => setDrawerOpen(false)}
        >
          ✕
        </button>
      </div>

      {/* Zone dropdown */}
      <div className="filters-sidebar__group">
        <label htmlFor="filter-zone" className="filters-sidebar__label">Zone</label>
        <select
          id="filter-zone"
          className="filters-sidebar__select"
          value={selectedZone ?? ''}
          onChange={handleZoneChange}
          aria-label="Select zone"
        >
          <option value="">All Zones</option>
          {zoneOptions.map(zone => (
            <option key={zone} value={zone}>{zone}</option>
          ))}
        </select>
      </div>

      {/* Block dropdown — only enabled when a zone is selected */}
      <div className="filters-sidebar__group">
        <label htmlFor="filter-block" className="filters-sidebar__label">Block</label>
        <select
          id="filter-block"
          className="filters-sidebar__select"
          value={selectedBlock ?? ''}
          onChange={handleBlockChange}
          disabled={!selectedZone}
          aria-label="Select block"
        >
          <option value="">All Blocks</option>
          {blockOptions.map(block => (
            <option key={block} value={block}>{block}</option>
          ))}
        </select>
      </div>

      {/* PHC dropdown — only enabled when a block is selected */}
      <div className="filters-sidebar__group">
        <label htmlFor="filter-phc" className="filters-sidebar__label">PHC</label>
        <select
          id="filter-phc"
          className="filters-sidebar__select"
          value={selectedPhc ?? ''}
          onChange={handlePhcChange}
          disabled={!selectedBlock}
          aria-label="Select PHC"
        >
          <option value="">All PHCs</option>
          {phcOptions.map(phc => (
            <option key={phc} value={phc}>{phc}</option>
          ))}
        </select>
      </div>

      {/* Status checkboxes */}
      <div className="filters-sidebar__group">
        <fieldset className="filters-sidebar__fieldset">
          <legend className="filters-sidebar__label">Status</legend>
          {STATUS_OPTIONS.map(status => (
            <label key={status} className="filters-sidebar__checkbox-label">
              <input
                type="checkbox"
                className="filters-sidebar__checkbox"
                checked={selectedStatuses.includes(status)}
                onChange={() => handleStatusToggle(status)}
                aria-label={status}
              />
              {status}
            </label>
          ))}
        </fieldset>
      </div>

      {/* Summary counts (Requirement 6.7) */}
      <div className="filters-sidebar__summary" aria-live="polite" data-testid="filter-summary">
        <span className="filters-sidebar__summary-visited">{visitedCount} Visited</span>
        {' / '}
        <span className="filters-sidebar__summary-followup">{followUpCount} Follow-up Needed</span>
        {' / '}
        <span className="filters-sidebar__summary-notvisited">{notVisitedCount} Not Visited</span>
      </div>

      {/* Clear Filters button (Requirement 6.8) */}
      <button
        className="filters-sidebar__clear"
        onClick={handleClearFilters}
        aria-label="Clear all filters"
      >
        Clear Filters
      </button>
    </div>
  )

  return (
    <>
      {/* Mobile toggle button — visible only on narrow viewports via CSS */}
      <button
        className="filters-sidebar__toggle"
        aria-label="Open filters"
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen(true)}
      >
        Filters
      </button>

      {/* Desktop sidebar (always visible on wide screens) */}
      <aside className="filters-sidebar filters-sidebar--desktop" aria-label="Filters sidebar">
        {sidebarContent}
      </aside>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="filters-sidebar__overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Filters drawer"
        >
          <div className="filters-sidebar filters-sidebar--drawer">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  )
}

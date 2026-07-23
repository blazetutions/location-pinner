import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import FiltersSidebar from './FiltersSidebar'

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

/** A minimal LocationRow shape used across tests. */
const makeLocation = (id, zone, block, phc) => ({ id, zone, block, phc })

const LOCATIONS = [
  makeLocation('loc-1', 'North', 'Block A', 'PHC 1'),
  makeLocation('loc-2', 'North', 'Block A', 'PHC 2'),
  makeLocation('loc-3', 'North', 'Block B', 'PHC 3'),
  makeLocation('loc-4', 'South', 'Block C', 'PHC 4'),
  makeLocation('loc-5', 'South', 'Block C', 'PHC 5'),
  makeLocation('loc-6', 'East',  'Block D', 'PHC 6'),
]

/** Default empty status map — all locations are implicitly "Not Visited". */
const EMPTY_STATUSES = new Map()

/** Helper to build a status map from an array of [id, status] pairs. */
function makeStatuses(pairs) {
  return new Map(pairs.map(([id, status]) => [id, { status }]))
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderSidebar(props = {}) {
  const onFilterChange = props.onFilterChange ?? vi.fn()
  const { rerender, ...rest } = render(
    <FiltersSidebar
      locations={props.locations ?? LOCATIONS}
      userStatuses={props.userStatuses ?? EMPTY_STATUSES}
      onFilterChange={onFilterChange}
    />
  )
  return { onFilterChange, rerender, ...rest }
}

// ---------------------------------------------------------------------------
// 1. Zone options rendered (Requirement 6.1)
// ---------------------------------------------------------------------------

describe('Zone options', () => {
  it('renders all distinct zones sorted alphabetically', () => {
    renderSidebar()
    const zoneSelect = screen.getByLabelText('Select zone')
    const options = within(zoneSelect).getAllByRole('option')
    // First option is the placeholder; then sorted zones
    const values = options.slice(1).map(o => o.textContent)
    expect(values).toEqual(['East', 'North', 'South'])
  })

  it('shows an "All Zones" placeholder option by default', () => {
    renderSidebar()
    const zoneSelect = screen.getByLabelText('Select zone')
    expect(zoneSelect.value).toBe('')
  })
})

// ---------------------------------------------------------------------------
// 2. Block cascades from zone (Requirement 6.2)
// ---------------------------------------------------------------------------

describe('Block cascading from zone', () => {
  it('block dropdown is disabled when no zone is selected', () => {
    renderSidebar()
    expect(screen.getByLabelText('Select block')).toBeDisabled()
  })

  it('shows only blocks belonging to the selected zone', () => {
    renderSidebar()
    fireEvent.change(screen.getByLabelText('Select zone'), { target: { value: 'North' } })

    const blockSelect = screen.getByLabelText('Select block')
    expect(blockSelect).not.toBeDisabled()
    const options = within(blockSelect).getAllByRole('option')
    const values = options.slice(1).map(o => o.textContent)
    expect(values).toEqual(['Block A', 'Block B'])
    // Block C and Block D are not in "North"
    expect(values).not.toContain('Block C')
    expect(values).not.toContain('Block D')
  })

  it('resets block and PHC to null when zone changes', async () => {
    const onFilterChange = vi.fn()
    renderSidebar({ onFilterChange })

    // Select zone → select block
    fireEvent.change(screen.getByLabelText('Select zone'), { target: { value: 'North' } })
    fireEvent.change(screen.getByLabelText('Select block'), { target: { value: 'Block A' } })

    // Now change zone — block and PHC should reset
    fireEvent.change(screen.getByLabelText('Select zone'), { target: { value: 'South' } })

    await waitFor(() => {
      const lastCall = onFilterChange.mock.calls.at(-1)[0]
      expect(lastCall.block).toBeNull()
      expect(lastCall.phc).toBeNull()
      expect(lastCall.zone).toBe('South')
    })
  })
})

// ---------------------------------------------------------------------------
// 3. PHC cascades from block (Requirement 6.3)
// ---------------------------------------------------------------------------

describe('PHC cascading from block', () => {
  it('PHC dropdown is disabled when no block is selected', () => {
    renderSidebar()
    expect(screen.getByLabelText('Select PHC')).toBeDisabled()
  })

  it('shows only PHCs belonging to the selected zone+block', () => {
    renderSidebar()
    fireEvent.change(screen.getByLabelText('Select zone'), { target: { value: 'North' } })
    fireEvent.change(screen.getByLabelText('Select block'), { target: { value: 'Block A' } })

    const phcSelect = screen.getByLabelText('Select PHC')
    expect(phcSelect).not.toBeDisabled()
    const options = within(phcSelect).getAllByRole('option')
    const values = options.slice(1).map(o => o.textContent)
    expect(values).toEqual(['PHC 1', 'PHC 2'])
    expect(values).not.toContain('PHC 3')
  })

  it('resets PHC to null when block changes', async () => {
    const onFilterChange = vi.fn()
    renderSidebar({ onFilterChange })

    fireEvent.change(screen.getByLabelText('Select zone'), { target: { value: 'North' } })
    fireEvent.change(screen.getByLabelText('Select block'), { target: { value: 'Block A' } })
    fireEvent.change(screen.getByLabelText('Select PHC'), { target: { value: 'PHC 1' } })

    // Change block → PHC should reset
    fireEvent.change(screen.getByLabelText('Select block'), { target: { value: 'Block B' } })

    await waitFor(() => {
      const lastCall = onFilterChange.mock.calls.at(-1)[0]
      expect(lastCall.phc).toBeNull()
      expect(lastCall.block).toBe('Block B')
    })
  })
})

// ---------------------------------------------------------------------------
// 4. Clear Filters resets all state (Requirement 6.8)
// ---------------------------------------------------------------------------

describe('Clear Filters', () => {
  it('resets zone, block, PHC and statuses to initial empty values', async () => {
    const onFilterChange = vi.fn()
    renderSidebar({ onFilterChange })

    // Apply some filters first
    fireEvent.change(screen.getByLabelText('Select zone'), { target: { value: 'North' } })
    fireEvent.change(screen.getByLabelText('Select block'), { target: { value: 'Block A' } })
    fireEvent.click(screen.getByLabelText('Visited'))

    // Click Clear Filters
    fireEvent.click(screen.getByRole('button', { name: /Clear all filters/i }))

    await waitFor(() => {
      const lastCall = onFilterChange.mock.calls.at(-1)[0]
      expect(lastCall).toEqual({ zone: null, block: null, phc: null, statuses: [] })
    })

    // UI state should also be reset
    expect(screen.getByLabelText('Select zone').value).toBe('')
    expect(screen.getByLabelText('Select block').value).toBe('')
    expect(screen.getByLabelText('Visited')).not.toBeChecked()
  })
})

// ---------------------------------------------------------------------------
// 5. Summary count accuracy (Requirement 6.7)
// ---------------------------------------------------------------------------

describe('Summary counts', () => {
  it('shows correct counts with no filters applied', () => {
    const statuses = makeStatuses([
      ['loc-1', 'Visited'],
      ['loc-2', 'Follow-up Needed'],
      // loc-3 through loc-6 → implicit "Not Visited"
    ])
    renderSidebar({ userStatuses: statuses })

    const summary = screen.getByTestId('filter-summary')
    expect(within(summary).getByText('1 Visited')).toBeInTheDocument()
    expect(within(summary).getByText('1 Follow-up Needed')).toBeInTheDocument()
    expect(within(summary).getByText('4 Not Visited')).toBeInTheDocument()
  })

  it('updates counts when zone filter reduces the result set', async () => {
    const statuses = makeStatuses([
      ['loc-1', 'Visited'],   // North
      ['loc-4', 'Visited'],   // South
    ])
    renderSidebar({ userStatuses: statuses })

    // Select "North" — only loc-1, loc-2, loc-3 remain
    fireEvent.change(screen.getByLabelText('Select zone'), { target: { value: 'North' } })

    await waitFor(() => {
      const summary = screen.getByTestId('filter-summary')
      expect(within(summary).getByText('1 Visited')).toBeInTheDocument()
      // loc-2 and loc-3 are Not Visited
      expect(within(summary).getByText('2 Not Visited')).toBeInTheDocument()
      expect(within(summary).getByText('0 Follow-up Needed')).toBeInTheDocument()
    })
  })

  it('shows all zeros for an empty locations list', () => {
    renderSidebar({ locations: [], userStatuses: EMPTY_STATUSES })
    const summary = screen.getByTestId('filter-summary')
    expect(within(summary).getByText('0 Visited')).toBeInTheDocument()
    expect(within(summary).getByText('0 Follow-up Needed')).toBeInTheDocument()
    expect(within(summary).getByText('0 Not Visited')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 6. onFilterChange called on every change (Requirement 6.4)
// ---------------------------------------------------------------------------

describe('onFilterChange callback', () => {
  it('is called on mount with empty FilterState', async () => {
    const onFilterChange = vi.fn()
    renderSidebar({ onFilterChange })

    await waitFor(() => {
      expect(onFilterChange).toHaveBeenCalledWith({
        zone: null, block: null, phc: null, statuses: [],
      })
    })
  })

  it('is called with updated zone when zone selection changes', async () => {
    const onFilterChange = vi.fn()
    renderSidebar({ onFilterChange })

    fireEvent.change(screen.getByLabelText('Select zone'), { target: { value: 'East' } })

    await waitFor(() => {
      const calls = onFilterChange.mock.calls.map(c => c[0])
      const zoneCall = calls.find(c => c.zone === 'East')
      expect(zoneCall).toBeDefined()
      expect(zoneCall).toMatchObject({ zone: 'East', block: null, phc: null, statuses: [] })
    })
  })

  it('is called with updated statuses when a status checkbox is toggled', async () => {
    const onFilterChange = vi.fn()
    renderSidebar({ onFilterChange })

    fireEvent.click(screen.getByLabelText('Follow-up Needed'))

    await waitFor(() => {
      const calls = onFilterChange.mock.calls.map(c => c[0])
      const statusCall = calls.find(c => c.statuses.includes('Follow-up Needed'))
      expect(statusCall).toBeDefined()
    })
  })

  it('emits a full FilterState on every individual field change', async () => {
    const onFilterChange = vi.fn()
    renderSidebar({ onFilterChange })

    fireEvent.change(screen.getByLabelText('Select zone'), { target: { value: 'North' } })
    fireEvent.change(screen.getByLabelText('Select block'), { target: { value: 'Block A' } })
    fireEvent.change(screen.getByLabelText('Select PHC'), { target: { value: 'PHC 1' } })

    await waitFor(() => {
      const calls = onFilterChange.mock.calls.map(c => c[0])
      const fullCall = calls.find(c => c.zone === 'North' && c.block === 'Block A' && c.phc === 'PHC 1')
      expect(fullCall).toBeDefined()
    })
  })
})

// ---------------------------------------------------------------------------
// 7. Status checkbox multi-select behaviour (Requirement 6.5)
// ---------------------------------------------------------------------------

describe('Status checkboxes', () => {
  it('renders all three status options as unchecked by default', () => {
    renderSidebar()
    expect(screen.getByLabelText('Visited')).not.toBeChecked()
    expect(screen.getByLabelText('Not Visited')).not.toBeChecked()
    expect(screen.getByLabelText('Follow-up Needed')).not.toBeChecked()
  })

  it('toggles a status on when clicked', () => {
    renderSidebar()
    fireEvent.click(screen.getByLabelText('Visited'))
    expect(screen.getByLabelText('Visited')).toBeChecked()
  })

  it('allows multiple statuses to be selected simultaneously', () => {
    renderSidebar()
    fireEvent.click(screen.getByLabelText('Visited'))
    fireEvent.click(screen.getByLabelText('Follow-up Needed'))
    expect(screen.getByLabelText('Visited')).toBeChecked()
    expect(screen.getByLabelText('Follow-up Needed')).toBeChecked()
  })

  it('deselects a status when clicked again', () => {
    renderSidebar()
    fireEvent.click(screen.getByLabelText('Visited'))
    fireEvent.click(screen.getByLabelText('Visited'))
    expect(screen.getByLabelText('Visited')).not.toBeChecked()
  })
})

// ---------------------------------------------------------------------------
// 8. Mobile drawer (Requirement 6.9)
// ---------------------------------------------------------------------------

describe('Mobile drawer toggle', () => {
  it('renders the Filters toggle button', () => {
    renderSidebar()
    expect(screen.getByRole('button', { name: /Open filters/i })).toBeInTheDocument()
  })

  it('the overlay is not rendered initially', () => {
    renderSidebar()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the drawer when the toggle button is clicked', () => {
    renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: /Open filters/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes the drawer when the close button inside the drawer is clicked', () => {
    renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: /Open filters/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // There are multiple close buttons (desktop + drawer); click the one inside the dialog
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Close filters/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

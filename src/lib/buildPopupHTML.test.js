import { describe, it, expect } from 'vitest'
import { buildPopupHTML } from './buildPopupHTML.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a full LocationRow for testing. */
function makeLocation(overrides = {}) {
  return {
    id: 'loc-001',
    district: 'Chennai',
    zone: 'North Zone',
    block: 'Tondiarpet',
    phc: 'Tondiarpet PHC',
    hsc: 'Royapuram HSC',
    level: 'hsc',
    ...overrides,
  }
}

/** Creates a statusRow for testing. */
function makeStatusRow(overrides = {}) {
  return {
    status: 'Visited',
    note: 'Follow up next month',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Facility name display
// ---------------------------------------------------------------------------

describe('buildPopupHTML – facility name display', () => {
  it('shows HSC name when hsc is non-null', () => {
    const location = makeLocation({ hsc: 'Royapuram HSC', phc: 'Tondiarpet PHC' })
    const html = buildPopupHTML(location, null)
    expect(html).toContain('Royapuram HSC')
  })

  it('shows PHC name when hsc is null', () => {
    const location = makeLocation({ hsc: null, phc: 'Tondiarpet PHC', level: 'phc' })
    const html = buildPopupHTML(location, null)
    expect(html).toContain('Tondiarpet PHC')
  })

  it('shows PHC name when hsc is undefined', () => {
    const location = makeLocation({ hsc: undefined, phc: 'Tondiarpet PHC' })
    const html = buildPopupHTML(location, null)
    expect(html).toContain('Tondiarpet PHC')
  })

  it('shows PHC name, Block, and Zone info', () => {
    const location = makeLocation({
      phc: 'Test PHC',
      block: 'Test Block',
      zone: 'South Zone',
    })
    const html = buildPopupHTML(location, null)
    expect(html).toContain('Test PHC')
    expect(html).toContain('Test Block')
    expect(html).toContain('South Zone')
  })
})

// ---------------------------------------------------------------------------
// Pre-filled status and note
// ---------------------------------------------------------------------------

describe('buildPopupHTML – pre-filled status and note', () => {
  it('selects the current status in the dropdown', () => {
    const html = buildPopupHTML(makeLocation(), makeStatusRow({ status: 'Visited' }))
    expect(html).toContain('<option value="Visited" selected>Visited</option>')
  })

  it('selects Follow-up Needed in the dropdown', () => {
    const html = buildPopupHTML(makeLocation(), makeStatusRow({ status: 'Follow-up Needed' }))
    expect(html).toContain('<option value="Follow-up Needed" selected>Follow-up Needed</option>')
  })

  it('selects Not Visited in the dropdown', () => {
    const html = buildPopupHTML(makeLocation(), makeStatusRow({ status: 'Not Visited' }))
    expect(html).toContain('<option value="Not Visited" selected>Not Visited</option>')
  })

  it('pre-fills the note textarea with existing note', () => {
    const html = buildPopupHTML(makeLocation(), makeStatusRow({ note: 'Visit scheduled' }))
    expect(html).toContain('Visit scheduled')
    expect(html).toContain('<textarea')
  })

  it('textarea is empty when note is null', () => {
    const html = buildPopupHTML(makeLocation(), makeStatusRow({ note: null }))
    expect(html).toContain('<textarea')
    // The textarea should not have meaningful text content
    expect(html).toMatch(/<textarea[^>]*><\/textarea>/)
  })

  it('textarea is empty when note is empty string', () => {
    const html = buildPopupHTML(makeLocation(), makeStatusRow({ note: '' }))
    expect(html).toMatch(/<textarea[^>]*><\/textarea>/)
  })
})

// ---------------------------------------------------------------------------
// Default status when no statusRow
// ---------------------------------------------------------------------------

describe('buildPopupHTML – default status when no statusRow', () => {
  it('defaults to Not Visited when statusRow is null', () => {
    const html = buildPopupHTML(makeLocation(), null)
    expect(html).toContain('<option value="Not Visited" selected>Not Visited</option>')
  })

  it('defaults to Not Visited when statusRow is undefined', () => {
    const html = buildPopupHTML(makeLocation(), undefined)
    expect(html).toContain('<option value="Not Visited" selected>Not Visited</option>')
  })

  it('does not select Visited when statusRow is null', () => {
    const html = buildPopupHTML(makeLocation(), null)
    expect(html).not.toContain('<option value="Visited" selected>')
  })

  it('does not select Follow-up Needed when statusRow is null', () => {
    const html = buildPopupHTML(makeLocation(), null)
    expect(html).not.toContain('<option value="Follow-up Needed" selected>')
  })
})

// ---------------------------------------------------------------------------
// Save button with data-location-id
// ---------------------------------------------------------------------------

describe('buildPopupHTML – save button', () => {
  it('includes a Save button with data-location-id attribute', () => {
    const location = makeLocation({ id: 'loc-42' })
    const html = buildPopupHTML(location, null)
    expect(html).toContain('data-location-id="loc-42"')
    expect(html).toContain('Save')
  })

  it('save button has the popup-save-btn class', () => {
    const html = buildPopupHTML(makeLocation(), null)
    expect(html).toContain('class="popup-save-btn"')
  })

  it('data-location-id matches the location id', () => {
    const location = makeLocation({ id: 'unique-id-999' })
    const html = buildPopupHTML(location, null)
    expect(html).toContain('data-location-id="unique-id-999"')
  })
})

// ---------------------------------------------------------------------------
// HTML structure
// ---------------------------------------------------------------------------

describe('buildPopupHTML – HTML structure', () => {
  it('returns a non-empty string', () => {
    const html = buildPopupHTML(makeLocation(), null)
    expect(typeof html).toBe('string')
    expect(html.length).toBeGreaterThan(0)
  })

  it('includes all three status options', () => {
    const html = buildPopupHTML(makeLocation(), null)
    expect(html).toContain('Visited')
    expect(html).toContain('Not Visited')
    expect(html).toContain('Follow-up Needed')
  })

  it('contains a <select> element', () => {
    const html = buildPopupHTML(makeLocation(), null)
    expect(html).toContain('<select')
    expect(html).toContain('</select>')
  })

  it('contains a <textarea> element', () => {
    const html = buildPopupHTML(makeLocation(), null)
    expect(html).toContain('<textarea')
    expect(html).toContain('</textarea>')
  })

  it('contains a <button> element', () => {
    const html = buildPopupHTML(makeLocation(), null)
    expect(html).toContain('<button')
    expect(html).toContain('</button>')
  })
})

// ---------------------------------------------------------------------------
// XSS escaping
// ---------------------------------------------------------------------------

describe('buildPopupHTML – XSS escaping', () => {
  it('escapes HTML special characters in facility name', () => {
    const location = makeLocation({ hsc: '<script>alert("xss")</script>' })
    const html = buildPopupHTML(location, null)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes HTML in note content', () => {
    const html = buildPopupHTML(
      makeLocation(),
      makeStatusRow({ note: '<b>bold note</b>' })
    )
    expect(html).not.toContain('<b>bold note</b>')
    expect(html).toContain('&lt;b&gt;bold note&lt;/b&gt;')
  })

  it('escapes double quotes in location id for attribute safety', () => {
    const location = makeLocation({ id: 'id-with-"quotes"' })
    const html = buildPopupHTML(location, null)
    expect(html).not.toContain('id-with-"quotes"')
    expect(html).toContain('&quot;')
  })

  it('escapes ampersands in field values', () => {
    const location = makeLocation({ phc: 'North & South PHC' })
    const html = buildPopupHTML(location, null)
    expect(html).toContain('North &amp; South PHC')
  })
})

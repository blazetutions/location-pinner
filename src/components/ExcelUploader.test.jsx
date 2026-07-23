import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as XLSX from 'xlsx'
import ExcelUploader from './ExcelUploader'

// ---------------------------------------------------------------------------
// Mock the Supabase client
// ---------------------------------------------------------------------------

const mockFrom = vi.fn()

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
  },
}))

// ---------------------------------------------------------------------------
// Mock XLSX — we don't need real Excel parsing in unit tests
// ---------------------------------------------------------------------------

vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    read: vi.fn(),
    utils: {
      ...actual.utils,
      sheet_to_json: vi.fn(),
    },
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_ROWS = [
  {
    'S.No': 1,
    District: 'Chennai',
    'Hud Name': 'Chennai North',
    'Block Name': 'Ambattur',
    'Phc Name': 'PHC Ambattur',
    'Hsc Name': 'HSC Ambattur East',
  },
  {
    'S.No': 2,
    District: 'Chennai',
    'Hud Name': 'Chennai North',
    'Block Name': 'Ambattur',
    'Phc Name': 'PHC Ambattur',
    'Hsc Name': 'HSC Ambattur West',
  },
  {
    'S.No': 3,
    District: 'Chennai',
    'Hud Name': 'Chennai South',
    'Block Name': 'Sholinganallur',
    'Phc Name': 'PHC Sholinganallur',
    'Hsc Name': 'HSC Sholinganallur A',
  },
]

/**
 * Create a fake File-like object whose arrayBuffer() returns a resolved
 * promise. jsdom's File doesn't implement arrayBuffer() so we must stub it.
 */
function makeFakeFile(name = 'test.xlsx') {
  const fakeBuffer = new ArrayBuffer(8)
  return {
    name,
    arrayBuffer: vi.fn().mockResolvedValue(fakeBuffer),
  }
}

/**
 * Configure XLSX mocks to simulate a workbook containing `sheetName` with
 * `rows` as parsed data.
 */
function setupXlsxMock(rows, sheetName = 'Chennai') {
  const fakeSheet = { '__fakeSheet': sheetName }
  XLSX.read.mockReturnValue({
    SheetNames: [sheetName],
    Sheets: { [sheetName]: fakeSheet },
  })
  XLSX.utils.sheet_to_json.mockReturnValue(rows)
  return fakeSheet
}

/**
 * Helper to trigger the file input change with a fake file.
 * Uses Object.defineProperty because fireEvent won't let you set files directly.
 */
function triggerFileChange(input, file) {
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  })
  fireEvent.change(input)
}

/**
 * Sets up the Supabase mock for the 4-call happy-path sequence:
 *  call 1: from('locations').upsert(phcRecords).select()  → phcUpsertResult
 *  call 2: from('locations').select('id, query_text').in(...)  → phcIdResult
 *  call 3: from('locations').upsert(hscRecords).select()  → hscUpsertResult
 *  call 4: from('locations').select('*').in(...)  → finalResult
 */
function setupSupabaseMock({
  phcData = [],
  phcError = null,
  allPhcRows = [],
  fetchPhcError = null,
  hscData = [],
  hscError = null,
  finalRows = [],
  fetchAllError = null,
} = {}) {
  let callCount = 0

  mockFrom.mockImplementation(() => {
    callCount++
    const idx = callCount

    return {
      // Upsert chain: .upsert(...).select()
      upsert: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockResolvedValue(
          idx === 1
            ? { data: phcData, error: phcError }
            : { data: hscData, error: hscError }
        ),
      })),
      // Select chain: .select(...).in(...)
      select: vi.fn().mockImplementation(() => ({
        in: vi.fn().mockResolvedValue(
          idx === 2
            ? { data: allPhcRows, error: fetchPhcError }
            : { data: finalRows, error: fetchAllError }
        ),
      })),
    }
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExcelUploader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Requirement 1.1 — renders the file input for .xlsx/.xls
  it('renders a file input that accepts .xlsx and .xls', () => {
    render(<ExcelUploader onUploadComplete={vi.fn()} />)
    const input = screen.getByLabelText(/upload excel file/i)
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('accept', '.xlsx,.xls')
  })

  // Requirement 1.1 — uses "Chennai" sheet when present
  it('uses the "Chennai" sheet when present in the workbook', async () => {
    const fakeSheetCh = { __id: 'Chennai' }
    const fakeSheetOther = { __id: 'Other' }
    XLSX.read.mockReturnValue({
      SheetNames: ['Other', 'Chennai'],
      Sheets: { Other: fakeSheetOther, Chennai: fakeSheetCh },
    })
    XLSX.utils.sheet_to_json.mockReturnValue(VALID_ROWS)

    setupSupabaseMock({
      phcData: [{ id: 1 }, { id: 2 }],
      allPhcRows: [
        { id: 1, query_text: 'PHC Ambattur, Ambattur, Chennai, Tamil Nadu, India' },
        { id: 2, query_text: 'PHC Sholinganallur, Sholinganallur, Chennai, Tamil Nadu, India' },
      ],
      hscData: [{ id: 3 }, { id: 4 }, { id: 5 }],
      finalRows: [],
    })

    render(<ExcelUploader onUploadComplete={vi.fn()} />)
    triggerFileChange(screen.getByLabelText(/upload excel file/i), makeFakeFile())

    await waitFor(() => {
      expect(XLSX.utils.sheet_to_json).toHaveBeenCalledWith(fakeSheetCh)
    })
  })

  // Requirement 1.1 — falls back to first sheet when "Chennai" absent
  it('falls back to the first sheet when "Chennai" sheet is absent', async () => {
    const fakeSheet = { __id: 'Sheet1' }
    XLSX.read.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: fakeSheet },
    })
    XLSX.utils.sheet_to_json.mockReturnValue(VALID_ROWS)

    setupSupabaseMock({
      phcData: [{ id: 1 }, { id: 2 }],
      allPhcRows: [
        { id: 1, query_text: 'PHC Ambattur, Ambattur, Chennai, Tamil Nadu, India' },
        { id: 2, query_text: 'PHC Sholinganallur, Sholinganallur, Chennai, Tamil Nadu, India' },
      ],
      hscData: [{ id: 3 }, { id: 4 }, { id: 5 }],
      finalRows: [],
    })

    render(<ExcelUploader onUploadComplete={vi.fn()} />)
    triggerFileChange(screen.getByLabelText(/upload excel file/i), makeFakeFile())

    await waitFor(() => {
      expect(XLSX.utils.sheet_to_json).toHaveBeenCalledWith(fakeSheet)
    })
  })

  // Requirement 1.3 — missing columns → show error listing them
  it('shows an error listing missing columns when validation fails', async () => {
    // Only 2 of 6 required columns present
    setupXlsxMock([{ 'S.No': 1, District: 'Chennai' }])

    render(<ExcelUploader onUploadComplete={vi.fn()} />)
    triggerFileChange(screen.getByLabelText(/upload excel file/i), makeFakeFile())

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    const errorMsg = screen.getByRole('alert').textContent
    expect(errorMsg).toMatch(/Hud Name/)
    expect(errorMsg).toMatch(/Block Name/)
    expect(errorMsg).toMatch(/Phc Name/)
    expect(errorMsg).toMatch(/Hsc Name/)
  })

  // Requirement 1.3 — no DB write when validation fails
  it('does not write to the database when column validation fails', async () => {
    setupXlsxMock([{ 'S.No': 1, District: 'Chennai' }])

    render(<ExcelUploader onUploadComplete={vi.fn()} />)
    triggerFileChange(screen.getByLabelText(/upload excel file/i), makeFakeFile())

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(mockFrom).not.toHaveBeenCalled()
  })

  // Requirement 1.4 — PHC deduplication via Set
  it('deduplicates PHC rows — two rows with the same PHC produce one PHC record', async () => {
    // VALID_ROWS has 2 rows sharing "PHC Ambattur" + "Ambattur" block
    setupXlsxMock(VALID_ROWS)

    const capturedUpsertArgs = []
    mockFrom.mockImplementation(() => ({
      upsert: vi.fn().mockImplementation((records) => {
        capturedUpsertArgs.push(records)
        return {
          select: vi.fn().mockResolvedValue({ data: records, error: null }),
        }
      }),
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: [
            { id: 1, query_text: 'PHC Ambattur, Ambattur, Chennai, Tamil Nadu, India' },
            { id: 2, query_text: 'PHC Sholinganallur, Sholinganallur, Chennai, Tamil Nadu, India' },
          ],
          error: null,
        }),
      }),
    }))

    render(<ExcelUploader onUploadComplete={vi.fn()} />)
    triggerFileChange(screen.getByLabelText(/upload excel file/i), makeFakeFile())

    await waitFor(() => {
      expect(capturedUpsertArgs.length).toBeGreaterThanOrEqual(1)
    })

    // First upsert = PHC records — should be exactly 2 unique PHCs
    const phcUpsert = capturedUpsertArgs[0]
    expect(phcUpsert.filter((r) => r.level === 'phc')).toHaveLength(2)
    expect(phcUpsert.every((r) => r.hsc === null)).toBe(true)
  })

  // Requirement 1.4 — correct PHC query_text format
  it('builds correct PHC query_text format', async () => {
    setupXlsxMock([VALID_ROWS[0]])

    const capturedPHCRecords = []
    mockFrom.mockImplementation(() => ({
      upsert: vi.fn().mockImplementation((records) => {
        if (records[0]?.level === 'phc') capturedPHCRecords.push(...records)
        return {
          select: vi.fn().mockResolvedValue({ data: records, error: null }),
        }
      }),
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: [{ id: 1, query_text: 'PHC Ambattur, Ambattur, Chennai, Tamil Nadu, India' }],
          error: null,
        }),
      }),
    }))

    render(<ExcelUploader onUploadComplete={vi.fn()} />)
    triggerFileChange(screen.getByLabelText(/upload excel file/i), makeFakeFile())

    await waitFor(() => expect(capturedPHCRecords.length).toBeGreaterThan(0))
    expect(capturedPHCRecords[0].query_text).toBe(
      'PHC Ambattur, Ambattur, Chennai, Tamil Nadu, India'
    )
  })

  // Requirement 1.4 — correct HSC query_text format
  it('builds correct HSC query_text format', async () => {
    setupXlsxMock([VALID_ROWS[0]])

    const capturedHSCRecords = []
    mockFrom.mockImplementation(() => ({
      upsert: vi.fn().mockImplementation((records) => {
        if (records[0]?.level === 'hsc') capturedHSCRecords.push(...records)
        return {
          select: vi.fn().mockResolvedValue({ data: records, error: null }),
        }
      }),
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: [{ id: 1, query_text: 'PHC Ambattur, Ambattur, Chennai, Tamil Nadu, India' }],
          error: null,
        }),
      }),
    }))

    render(<ExcelUploader onUploadComplete={vi.fn()} />)
    triggerFileChange(screen.getByLabelText(/upload excel file/i), makeFakeFile())

    await waitFor(() => expect(capturedHSCRecords.length).toBeGreaterThan(0))
    expect(capturedHSCRecords[0].query_text).toBe(
      'HSC Ambattur East, PHC Ambattur, Ambattur, Chennai, Tamil Nadu, India'
    )
  })

  // Requirement 1.5 — upsert uses onConflict: 'query_text'
  it('upserts records using query_text as the conflict key', async () => {
    setupXlsxMock([VALID_ROWS[0]])

    const capturedOptions = []
    mockFrom.mockImplementation(() => ({
      upsert: vi.fn().mockImplementation((records, opts) => {
        capturedOptions.push(opts)
        return {
          select: vi.fn().mockResolvedValue({ data: records, error: null }),
        }
      }),
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: [{ id: 1, query_text: 'PHC Ambattur, Ambattur, Chennai, Tamil Nadu, India' }],
          error: null,
        }),
      }),
    }))

    render(<ExcelUploader onUploadComplete={vi.fn()} />)
    triggerFileChange(screen.getByLabelText(/upload excel file/i), makeFakeFile())

    await waitFor(() => expect(capturedOptions.length).toBeGreaterThan(0))
    capturedOptions.forEach((opts) => {
      expect(opts).toMatchObject({ onConflict: 'query_text', ignoreDuplicates: true })
    })
  })

  // Requirement 1.6 — display inserted/skipped summary
  it('displays inserted and skipped summary after successful upsert', async () => {
    setupXlsxMock(VALID_ROWS)
    // 2 PHC sent → 1 inserted; 3 HSC sent → 2 inserted → totals: 3 inserted, 2 skipped
    setupSupabaseMock({
      phcData: [{ id: 99 }],
      allPhcRows: [
        { id: 1, query_text: 'PHC Ambattur, Ambattur, Chennai, Tamil Nadu, India' },
        { id: 2, query_text: 'PHC Sholinganallur, Sholinganallur, Chennai, Tamil Nadu, India' },
      ],
      hscData: [{ id: 3 }, { id: 4 }],
      finalRows: [],
    })

    render(<ExcelUploader onUploadComplete={vi.fn()} />)
    triggerFileChange(screen.getByLabelText(/upload excel file/i), makeFakeFile())

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument()
    })

    const statusText = screen.getByRole('status').textContent
    expect(statusText).toMatch(/3.*inserted/i)
    expect(statusText).toMatch(/2.*skipped/i)
  })

  // Requirement 1.6 — onUploadComplete called with location rows
  it('calls onUploadComplete with the location rows after upsert', async () => {
    setupXlsxMock([VALID_ROWS[0]])

    const locationRows = [
      { id: 1, level: 'phc', query_text: 'PHC Ambattur, Ambattur, Chennai, Tamil Nadu, India' },
      {
        id: 2,
        level: 'hsc',
        query_text: 'HSC Ambattur East, PHC Ambattur, Ambattur, Chennai, Tamil Nadu, India',
      },
    ]

    setupSupabaseMock({
      phcData: [{ id: 1 }],
      allPhcRows: [{ id: 1, query_text: 'PHC Ambattur, Ambattur, Chennai, Tamil Nadu, India' }],
      hscData: [{ id: 2 }],
      finalRows: locationRows,
    })

    const onUploadComplete = vi.fn()
    render(<ExcelUploader onUploadComplete={onUploadComplete} />)
    triggerFileChange(screen.getByLabelText(/upload excel file/i), makeFakeFile())

    await waitFor(() => {
      expect(onUploadComplete).toHaveBeenCalledWith(locationRows)
    })
  })

  // Supabase PHC upsert error → show error message
  it('shows a database error message when the PHC upsert fails', async () => {
    setupXlsxMock([VALID_ROWS[0]])
    setupSupabaseMock({ phcError: { message: 'DB connection refused' } })

    render(<ExcelUploader onUploadComplete={vi.fn()} />)
    triggerFileChange(screen.getByLabelText(/upload excel file/i), makeFakeFile())

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByRole('alert').textContent).toMatch(/DB connection refused/)
  })

  // HSC records must carry parent_phc_id from PHC id lookup
  it('attaches parent_phc_id to HSC records using the PHC id map', async () => {
    setupXlsxMock([VALID_ROWS[0]])

    const capturedHSCRecords = []
    let callIndex = 0
    mockFrom.mockImplementation(() => {
      callIndex++
      const idx = callIndex

      return {
        upsert: vi.fn().mockImplementation((records) => {
          if (idx === 3) capturedHSCRecords.push(...records)
          return {
            select: vi.fn().mockResolvedValue({ data: records, error: null }),
          }
        }),
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [{ id: 42, query_text: 'PHC Ambattur, Ambattur, Chennai, Tamil Nadu, India' }],
            error: null,
          }),
        }),
      }
    })

    render(<ExcelUploader onUploadComplete={vi.fn()} />)
    triggerFileChange(screen.getByLabelText(/upload excel file/i), makeFakeFile())

    await waitFor(() => expect(capturedHSCRecords.length).toBeGreaterThan(0))
    expect(capturedHSCRecords[0].parent_phc_id).toBe(42)
  })
})

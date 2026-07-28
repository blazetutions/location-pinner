import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as XLSX from 'xlsx'
import ExcelUploader from './ExcelUploader'

// ---------------------------------------------------------------------------
// Mock XLSX — we don't need real Excel parsing in unit tests
// ---------------------------------------------------------------------------

vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    read: vi.fn(),
  }
})

// ---------------------------------------------------------------------------
// Mock tnceraUploader
// ---------------------------------------------------------------------------

const mockTnceraUploader = vi.fn()

vi.mock('../lib/tnceraUploader', () => ({
  tnceraUploader: (...args) => mockTnceraUploader(...args),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExcelUploader (TNCERA-only)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default XLSX.read mock — returns a minimal workbook
    XLSX.read.mockReturnValue({
      SheetNames: ['Both'],
      Sheets: { Both: {} },
    })
  })

  // Requirement: renders the file input with correct label and id
  it('renders a file input labeled "Upload TNCERA Excel file (.xlsx / .xls)"', () => {
    render(<ExcelUploader onTnceraUploadComplete={vi.fn()} />)
    const input = screen.getByLabelText(/upload tncera excel file/i)
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('id', 'excel-file-input')
    expect(input).toHaveAttribute('accept', '.xlsx,.xls')
  })

  // Requirement: shows processing message while file is being handled
  it('shows "Processing file, please wait…" while processing', async () => {
    // Never resolves — keeps the component in loading state
    mockTnceraUploader.mockReturnValue(new Promise(() => {}))

    render(<ExcelUploader onTnceraUploadComplete={vi.fn()} />)
    const input = screen.getByLabelText(/upload tncera excel file/i)
    triggerFileChange(input, makeFakeFile())

    await waitFor(() => {
      expect(screen.getByText(/processing file, please wait/i)).toBeInTheDocument()
    })
  })

  // Requirement: input is disabled while processing
  it('disables the file input while processing', async () => {
    mockTnceraUploader.mockReturnValue(new Promise(() => {}))

    render(<ExcelUploader onTnceraUploadComplete={vi.fn()} />)
    const input = screen.getByLabelText(/upload tncera excel file/i)
    triggerFileChange(input, makeFakeFile())

    await waitFor(() => {
      expect(input).toBeDisabled()
    })
  })

  // Requirement: on success shows role="status" with inserted/skipped counts
  it('shows success status with inserted and skipped counts after successful upload', async () => {
    mockTnceraUploader.mockResolvedValue({ inserted: 42, skipped: 3, rows: [] })

    render(<ExcelUploader onTnceraUploadComplete={vi.fn()} />)
    triggerFileChange(screen.getByLabelText(/upload tncera excel file/i), makeFakeFile())

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument()
    })

    const statusText = screen.getByRole('status').textContent
    expect(statusText).toMatch(/42.*inserted/i)
    expect(statusText).toMatch(/3.*skipped/i)
    expect(statusText).toMatch(/upload complete/i)
  })

  // Requirement: on error shows role="alert" with the error message
  it('shows role="alert" with the error message when tnceraUploader returns an error', async () => {
    mockTnceraUploader.mockResolvedValue({ error: 'Missing columns: District, TNCERA No. and Date' })

    render(<ExcelUploader onTnceraUploadComplete={vi.fn()} />)
    triggerFileChange(screen.getByLabelText(/upload tncera excel file/i), makeFakeFile())

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.getByRole('alert').textContent).toMatch(/Missing columns/)
  })

  // Requirement: on thrown error shows role="alert"
  it('shows role="alert" when an unexpected error is thrown', async () => {
    mockTnceraUploader.mockRejectedValue(new Error('Network timeout'))

    render(<ExcelUploader onTnceraUploadComplete={vi.fn()} />)
    triggerFileChange(screen.getByLabelText(/upload tncera excel file/i), makeFakeFile())

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.getByRole('alert').textContent).toMatch(/Unexpected error.*Network timeout/i)
  })

  // Requirement: calls onTnceraUploadComplete with rows after success
  it('calls onTnceraUploadComplete with rows on success', async () => {
    const rows = [{ id: 1 }, { id: 2 }]
    mockTnceraUploader.mockResolvedValue({ inserted: 2, skipped: 0, rows })

    const onTnceraUploadComplete = vi.fn()
    render(<ExcelUploader onTnceraUploadComplete={onTnceraUploadComplete} />)
    triggerFileChange(screen.getByLabelText(/upload tncera excel file/i), makeFakeFile())

    await waitFor(() => {
      expect(onTnceraUploadComplete).toHaveBeenCalledWith(rows)
    })
  })

  // Requirement: does not call onTnceraUploadComplete on error
  it('does not call onTnceraUploadComplete when tnceraUploader returns an error', async () => {
    mockTnceraUploader.mockResolvedValue({ error: 'Sheet not found' })

    const onTnceraUploadComplete = vi.fn()
    render(<ExcelUploader onTnceraUploadComplete={onTnceraUploadComplete} />)
    triggerFileChange(screen.getByLabelText(/upload tncera excel file/i), makeFakeFile())

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(onTnceraUploadComplete).not.toHaveBeenCalled()
  })

  // Requirement: XLSX.read is called with the file's arrayBuffer
  it('passes the file arrayBuffer to XLSX.read', async () => {
    mockTnceraUploader.mockResolvedValue({ inserted: 0, skipped: 0, rows: [] })

    render(<ExcelUploader onTnceraUploadComplete={vi.fn()} />)
    const file = makeFakeFile()
    triggerFileChange(screen.getByLabelText(/upload tncera excel file/i), file)

    await waitFor(() => {
      expect(XLSX.read).toHaveBeenCalled()
    })
  })

  // Requirement: no error/status shown before any file is selected
  it('shows neither alert nor status on initial render', () => {
    render(<ExcelUploader onTnceraUploadComplete={vi.fn()} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  // Requirement: tnceraUploader is called with the parsed workbook
  it('calls tnceraUploader with the workbook returned by XLSX.read', async () => {
    const fakeWorkbook = { SheetNames: ['Both'], Sheets: { Both: {} } }
    XLSX.read.mockReturnValue(fakeWorkbook)
    mockTnceraUploader.mockResolvedValue({ inserted: 1, skipped: 0, rows: [] })

    render(<ExcelUploader onTnceraUploadComplete={vi.fn()} />)
    triggerFileChange(screen.getByLabelText(/upload tncera excel file/i), makeFakeFile())

    await waitFor(() => {
      expect(mockTnceraUploader).toHaveBeenCalledWith(fakeWorkbook)
    })
  })
})

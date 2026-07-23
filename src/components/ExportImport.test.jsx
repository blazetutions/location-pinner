import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ExportImport from './ExportImport'

// ---------------------------------------------------------------------------
// Mock the Supabase client
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn()

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: (...args) => mockGetUser(...args),
    },
  },
}))

// ---------------------------------------------------------------------------
// Mock the exportImport library functions
// ---------------------------------------------------------------------------

const mockExportUserData = vi.fn()
const mockImportUserData = vi.fn()

vi.mock('../lib/exportImport', () => ({
  exportUserData: (...args) => mockExportUserData(...args),
  importUserData: (...args) => mockImportUserData(...args),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_USER_ID = 'user-abc-123'

/** Set up the Supabase getUser mock to return a logged-in user. */
function setupAuthMock(userId = FAKE_USER_ID) {
  mockGetUser.mockResolvedValue({
    data: { user: userId ? { id: userId } : null },
  })
}

/**
 * Build a minimal File object whose .text() resolves to `content`.
 * jsdom doesn't implement File.prototype.text, so we add it manually.
 */
function makeJsonFile(content, name = 'data.json') {
  const file = new File([content], name, { type: 'application/json' })
  // Polyfill .text() for jsdom
  if (!file.text) {
    file.text = () => Promise.resolve(content)
  }
  return file
}

/**
 * Simulate uploading a file to the file input.
 * Uses fireEvent.change with a mocked files list.
 */
function uploadFile(inputEl, file) {
  Object.defineProperty(inputEl, 'files', {
    value: [file],
    configurable: true,
  })
  fireEvent.change(inputEl)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExportImport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  it('renders the Export button and import file input', async () => {
    setupAuthMock()
    render(<ExportImport />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument()
    })

    expect(screen.getByLabelText(/import json file/i)).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Export — happy path (Requirements 11.1, 11.6)
  // -------------------------------------------------------------------------

  it('calls exportUserData with the current userId when Export is clicked', async () => {
    setupAuthMock()
    mockExportUserData.mockResolvedValue('[]')

    render(<ExportImport />)

    // Wait for userId to be resolved so the button is enabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).not.toBeDisabled()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /export/i }))
    })

    expect(mockExportUserData).toHaveBeenCalledTimes(1)
    expect(mockExportUserData).toHaveBeenCalledWith(FAKE_USER_ID)
  })

  it('shows "Exported successfully" after a successful export', async () => {
    setupAuthMock()
    mockExportUserData.mockResolvedValue('[]')

    render(<ExportImport />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).not.toBeDisabled()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /export/i }))
    })

    await waitFor(() => {
      expect(screen.getByText(/exported successfully/i)).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Export — error path (Requirement 11.7)
  // -------------------------------------------------------------------------

  it('shows an error message when exportUserData throws', async () => {
    setupAuthMock()
    mockExportUserData.mockRejectedValue(new Error('Network failure'))

    render(<ExportImport />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).not.toBeDisabled()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /export/i }))
    })

    await waitFor(() => {
      expect(screen.getByText(/network failure/i)).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Import — happy path (Requirements 11.3, 11.4, 11.6)
  // -------------------------------------------------------------------------

  it('calls importUserData with userId and file text when a file is selected', async () => {
    setupAuthMock()
    mockImportUserData.mockResolvedValue({ upserted: 5, errors: [] })

    render(<ExportImport />)

    await waitFor(() => {
      expect(screen.getByLabelText(/import json file/i)).not.toBeDisabled()
    })

    const jsonContent = JSON.stringify([{ location_id: '1', status: 'Visited' }])
    const file = makeJsonFile(jsonContent)

    await act(async () => {
      uploadFile(screen.getByLabelText(/import json file/i), file)
    })

    await waitFor(() => {
      expect(mockImportUserData).toHaveBeenCalledTimes(1)
    })

    expect(mockImportUserData).toHaveBeenCalledWith(FAKE_USER_ID, jsonContent)
  })

  it('shows "Imported X records" after a successful import (Requirement 11.6)', async () => {
    setupAuthMock()
    mockImportUserData.mockResolvedValue({ upserted: 42, errors: [] })

    render(<ExportImport />)

    await waitFor(() => {
      expect(screen.getByLabelText(/import json file/i)).not.toBeDisabled()
    })

    await act(async () => {
      uploadFile(screen.getByLabelText(/import json file/i), makeJsonFile('[]'))
    })

    await waitFor(() => {
      expect(screen.getByText(/imported 42 records/i)).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Import — validation error path (Requirement 11.3, 11.7)
  // -------------------------------------------------------------------------

  it('shows the error message when importUserData returns validation errors', async () => {
    setupAuthMock()
    mockImportUserData.mockResolvedValue({
      upserted: 0,
      errors: ['Invalid import file: must be an array where every element has location_id and status'],
    })

    render(<ExportImport />)

    await waitFor(() => {
      expect(screen.getByLabelText(/import json file/i)).not.toBeDisabled()
    })

    await act(async () => {
      uploadFile(screen.getByLabelText(/import json file/i), makeJsonFile('bad data'))
    })

    await waitFor(() => {
      expect(screen.getByText(/invalid import file/i)).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Import — thrown error (Requirement 11.7)
  // -------------------------------------------------------------------------

  it('shows an error message when importUserData throws', async () => {
    setupAuthMock()
    mockImportUserData.mockRejectedValue(new Error('Supabase error'))

    render(<ExportImport />)

    await waitFor(() => {
      expect(screen.getByLabelText(/import json file/i)).not.toBeDisabled()
    })

    await act(async () => {
      uploadFile(screen.getByLabelText(/import json file/i), makeJsonFile('[]'))
    })

    await waitFor(() => {
      expect(screen.getByText(/supabase error/i)).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  it('shows loading state on the Export button while exporting', async () => {
    setupAuthMock()
    // Never resolves — keeps the component in loading state
    mockExportUserData.mockReturnValue(new Promise(() => {}))

    render(<ExportImport />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).not.toBeDisabled()
    })

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /export/i }))
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /exporting/i })).toBeDisabled()
    })
  })
})

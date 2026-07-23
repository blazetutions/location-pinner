// src/components/AdminPanel.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminPanel from './AdminPanel'
import { supabase } from '../supabaseClient'

// Mock supabase client
vi.mock('../supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}))

describe('AdminPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the admin panel with title and sections', () => {
    // Mock empty user list response
    supabase.functions.invoke.mockResolvedValueOnce({
      data: [],
      error: null,
    })

    render(<AdminPanel />)

    expect(screen.getByText('Admin Panel')).toBeInTheDocument()
    expect(screen.getByText('Invite User')).toBeInTheDocument()
    expect(screen.getByText('All Users')).toBeInTheDocument()
  })

  it('fetches and displays users on mount', async () => {
    const mockUsers = [
      {
        id: '1',
        email: 'user1@example.com',
        created_at: '2024-01-01T00:00:00Z',
        last_sign_in_at: '2024-01-02T00:00:00Z',
      },
      {
        id: '2',
        email: 'user2@example.com',
        created_at: '2024-01-03T00:00:00Z',
        last_sign_in_at: null,
      },
    ]

    supabase.functions.invoke.mockResolvedValueOnce({
      data: mockUsers,
      error: null,
    })

    render(<AdminPanel />)

    // Wait for users to load
    await waitFor(() => {
      expect(screen.getByText('user1@example.com')).toBeInTheDocument()
      expect(screen.getByText('user2@example.com')).toBeInTheDocument()
    })

    // Verify table headers
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('Created')).toBeInTheDocument()
    expect(screen.getByText('Last Sign-in')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })

  it('invites a new user when form is submitted', async () => {
    const user = userEvent.setup()

    // Mock initial user list fetch
    supabase.functions.invoke.mockResolvedValueOnce({
      data: [],
      error: null,
    })

    render(<AdminPanel />)

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('No users found')).toBeInTheDocument()
    })

    // Mock invite_user response
    supabase.functions.invoke.mockResolvedValueOnce({
      data: { success: true, user: { id: '1', email: 'newuser@example.com' } },
      error: null,
    })

    // Mock refreshed user list
    supabase.functions.invoke.mockResolvedValueOnce({
      data: [{ id: '1', email: 'newuser@example.com', created_at: '2024-01-01T00:00:00Z' }],
      error: null,
    })

    // Fill in invite form
    const emailInput = screen.getByPlaceholderText('user@example.com')
    await user.type(emailInput, 'newuser@example.com')

    // Submit form
    const inviteButton = screen.getByText('Invite')
    await user.click(inviteButton)

    // Wait for success message
    await waitFor(() => {
      expect(screen.getByText(/Invitation sent to newuser@example.com/i)).toBeInTheDocument()
    })

    // Verify user list was refreshed
    await waitFor(() => {
      expect(screen.getByText('newuser@example.com')).toBeInTheDocument()
    })
  })

  it('removes a user after confirmation', async () => {
    const user = userEvent.setup()

    // Mock user list with one user
    supabase.functions.invoke.mockResolvedValueOnce({
      data: [{ id: '1', email: 'user@example.com', created_at: '2024-01-01T00:00:00Z' }],
      error: null,
    })

    render(<AdminPanel />)

    // Wait for user to load
    await waitFor(() => {
      expect(screen.getByText('user@example.com')).toBeInTheDocument()
    })

    // Mock window.confirm
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    // Mock remove_user response
    supabase.functions.invoke.mockResolvedValueOnce({
      data: { success: true },
      error: null,
    })

    // Mock refreshed user list (empty)
    supabase.functions.invoke.mockResolvedValueOnce({
      data: [],
      error: null,
    })

    // Click remove button
    const removeButton = screen.getByLabelText('Remove user user@example.com')
    await user.click(removeButton)

    // Verify confirm was called
    expect(confirmSpy).toHaveBeenCalledWith(
      'Are you sure you want to delete user@example.com? This cannot be undone.'
    )

    // Wait for success message
    await waitFor(() => {
      expect(screen.getByText(/User user@example.com deleted successfully/i)).toBeInTheDocument()
    })

    confirmSpy.mockRestore()
  })

  it('displays error when user list fetch fails', async () => {
    supabase.functions.invoke.mockResolvedValueOnce({
      data: null,
      error: { message: 'Network error' },
    })

    render(<AdminPanel />)

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })
})

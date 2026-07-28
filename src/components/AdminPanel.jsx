import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { exportAllStatuses, resetLocations } from '../lib/adminExport'
import { useTnceraGeocoding } from '../hooks/useTnceraGeocoding.jsx'

/**
 * AdminPanel — user management panel for admins.
 *
 * Shows a list of all registered users retrieved via the list_users Edge
 * Function. Provides Invite (task 18.3) and Remove (task 18.4) actions.
 *
 * Only rendered when isAdmin is true (guarded in App.jsx).
 *
 * Requirements: 16.8, 16.9, 16.10
 */
export default function AdminPanel() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState(null) // { type: 'success'|'error', message }
  const [inviteLoading, setInviteLoading] = useState(false)

  // Remove state
  const [removeStatus, setRemoveStatus] = useState(null)

  // Export / reset state (tasks 19.1–19.4)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportStatus, setExportStatus] = useState(null)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetStatus, setResetStatus] = useState(null)

  // ── Geocoding status (reads from shared context) ─────────────────────────
  const geocoding = useTnceraGeocoding()

  // ── Fetch user list ──────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: fnError } = await supabase.functions.invoke('list_users')
    if (fnError) {
      setError(fnError.message || 'Failed to load users')
    } else {
      setUsers(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // ── Invite user ──────────────────────────────────────────────────────────
  async function handleInvite(e) {
    e.preventDefault()
    if (!inviteEmail) return
    setInviteLoading(true)
    setInviteStatus(null)

    const { error: fnError } = await supabase.functions.invoke('invite_user', {
      body: { email: inviteEmail },
    })

    if (fnError) {
      setInviteStatus({ type: 'error', message: fnError.message || 'Invite failed' })
    } else {
      setInviteStatus({ type: 'success', message: `Invitation sent to ${inviteEmail}` })
      setInviteEmail('')
      await fetchUsers()
    }
    setInviteLoading(false)
  }

  // ── Export all statuses (task 19.1–19.2) ─────────────────────────────────
  async function handleExportAll() {
    setExportLoading(true)
    setExportStatus(null)
    const result = await exportAllStatuses()
    setExportStatus(result.success
      ? { type: 'success', message: 'All data exported successfully' }
      : { type: 'error', message: result.error ?? 'Export failed' }
    )
    setExportLoading(false)
  }

  // ── Reset locations (task 19.3–19.4) ─────────────────────────────────────
  async function handleReset() {
    setResetLoading(true)
    setResetStatus(null)
    const result = await resetLocations(() => {
      setUsers([])
    })
    if (result.cancelled) {
      setResetLoading(false)
      return
    }
    setResetStatus(result.success
      ? { type: 'success', message: 'All location data has been reset. Please re-upload an Excel file.' }
      : { type: 'error', message: result.error ?? 'Reset failed' }
    )
    setResetLoading(false)
  }

  // ── Remove user ──────────────────────────────────────────────────────────
  async function handleRemove(user) {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${user.email}? This cannot be undone.`
    )
    if (!confirmed) return

    setRemoveStatus(null)
    const { error: fnError } = await supabase.functions.invoke('remove_user', {
      body: { userId: user.id },
    })

    if (fnError) {
      setRemoveStatus({ type: 'error', message: fnError.message || 'Remove failed' })
    } else {
      setRemoveStatus({ type: 'success', message: `${user.email} removed` })
      await fetchUsers()
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const remainingRows = geocoding.total - geocoding.current
  const minutesRemaining = Math.ceil(remainingRows / 60)

  return (
    <section
      aria-labelledby="admin-panel-heading"
      style={{ padding: '1.5rem', fontFamily: 'sans-serif', maxWidth: 900 }}
    >
      <h2 id="admin-panel-heading" style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>
        Admin Panel — User Management
      </h2>

      {/* ── Geocoding status ── */}
      {geocoding.status === 'running' && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.5rem' }}>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 600, color: '#1d4ed8', fontSize: '0.875rem' }}>
            Geocoding in progress
          </p>
          <progress
            value={geocoding.current}
            max={geocoding.total || 1}
            style={{ width: '100%', height: 8, marginBottom: '0.25rem' }}
            aria-label={`Geocoding: ${geocoding.current} of ${geocoding.total}`}
          />
          <p role="status" aria-live="polite" style={{ margin: 0, fontSize: '0.8rem', color: '#1d4ed8' }}>
            {geocoding.total > 0
              ? `Geocoding ${geocoding.current} / ${geocoding.total}${remainingRows > 0 ? ` — ~${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''} remaining` : ''}`
              : 'Starting geocoding pass…'}
          </p>
        </div>
      )}

      {geocoding.status === 'done' && geocoding.total > 0 && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '0.5rem' }}>
          <p role="status" style={{ margin: '0 0 0.25rem', fontWeight: 600, color: '#16a34a', fontSize: '0.875rem' }}>
            Done: {geocoding.counts.geocoded} geocoded, {geocoding.counts.failed} failed
          </p>
          {geocoding.failedRows.length > 0 && (
            <ul style={{ margin: '0.5rem 0 0', padding: '0 0 0 1.25rem', fontSize: '0.8rem', color: '#dc2626', maxHeight: 150, overflowY: 'auto' }}>
              {geocoding.failedRows.map((row, i) => (
                <li key={i}><strong>{row.facility_name}</strong>{row.address_text ? ` — ${row.address_text}` : ''}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Invite form ── */}
      <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Invite New User</h3>
        <form onSubmit={handleInvite} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <label htmlFor="invite-email" style={{ display: 'none' }}>Email address</label>
          <input
            id="invite-email"
            type="email"
            placeholder="colleague@example.com"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            disabled={inviteLoading}
            required
            style={{ flex: 1, minWidth: 200, padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem' }}
            aria-label="Email address to invite"
          />
          <button
            type="submit"
            disabled={inviteLoading || !inviteEmail}
            style={{ padding: '0.5rem 1rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: 'pointer', opacity: inviteLoading || !inviteEmail ? 0.6 : 1 }}
          >
            {inviteLoading ? 'Sending…' : 'Invite'}
          </button>
        </form>
        {inviteStatus && (
          <p
            role={inviteStatus.type === 'error' ? 'alert' : 'status'}
            style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: inviteStatus.type === 'error' ? '#dc2626' : '#16a34a' }}
          >
            {inviteStatus.message}
          </p>
        )}
      </div>

      {/* ── Remove status ── */}
      {removeStatus && (
        <p
          role={removeStatus.type === 'error' ? 'alert' : 'status'}
          style={{ marginBottom: '1rem', fontSize: '0.875rem', color: removeStatus.type === 'error' ? '#dc2626' : '#16a34a' }}
        >
          {removeStatus.message}
        </p>
      )}

      {/* ── Admin data actions (tasks 19.2 & 19.4) ── */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <div>
          <button
            onClick={handleExportAll}
            disabled={exportLoading}
            style={{ padding: '0.5rem 1rem', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: exportLoading ? 'not-allowed' : 'pointer', opacity: exportLoading ? 0.6 : 1 }}
            aria-busy={exportLoading}
          >
            {exportLoading ? 'Exporting…' : 'Export All Data'}
          </button>
          {exportStatus && (
            <p role={exportStatus.type === 'error' ? 'alert' : 'status'} style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: exportStatus.type === 'error' ? '#dc2626' : '#16a34a' }}>
              {exportStatus.message}
            </p>
          )}
        </div>

        <div>
          <button
            onClick={handleReset}
            disabled={resetLoading}
            style={{ padding: '0.5rem 1rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: resetLoading ? 'not-allowed' : 'pointer', opacity: resetLoading ? 0.6 : 1 }}
            aria-busy={resetLoading}
          >
            {resetLoading ? 'Resetting…' : 'Reset Location Data'}
          </button>
          {resetStatus && (
            <p role={resetStatus.type === 'error' ? 'alert' : 'status'} style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: resetStatus.type === 'error' ? '#dc2626' : '#16a34a' }}>
              {resetStatus.message}
            </p>
          )}
        </div>
      </div>

      {/* ── User list ── */}
      {loading ? (
        <p role="status" aria-live="polite">Loading users…</p>
      ) : error ? (
        <p role="alert" style={{ color: '#dc2626' }}>{error}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }} aria-label="Registered users">
            <thead>
              <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Last Sign-in</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: '0.75rem', color: '#6b7280' }}>No users found.</td></tr>
              ) : (
                users.map(user => (
                  <tr key={user.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={tdStyle}>{user.email}</td>
                    <td style={tdStyle}>{user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</td>
                    <td style={tdStyle}>{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : 'Never'}</td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => handleRemove(user)}
                        style={{ padding: '0.25rem 0.625rem', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '0.25rem', fontSize: '0.8rem', cursor: 'pointer' }}
                        aria-label={`Remove ${user.email}`}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

const thStyle = { padding: '0.625rem 0.75rem', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0' }
const tdStyle = { padding: '0.625rem 0.75rem', color: '#1e293b' }

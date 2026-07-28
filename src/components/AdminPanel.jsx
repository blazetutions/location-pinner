import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { exportAllStatuses, resetLocations, retryFailedRows } from '../lib/adminExport'
import { useTnceraGeocoding } from '../hooks/useTnceraGeocoding.jsx'

export default function AdminPanel() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [removeStatus, setRemoveStatus] = useState(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportStatus, setExportStatus] = useState(null)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetStatus, setResetStatus] = useState(null)
  const [retryLoading, setRetryLoading] = useState(false)
  const [retryStatus, setRetryStatus] = useState(null)

  const geocoding = useTnceraGeocoding()

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

  useEffect(() => { fetchUsers() }, [fetchUsers])

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

  async function handleExportAll() {
    setExportLoading(true)
    setExportStatus(null)
    const result = await exportAllStatuses()
    setExportStatus(result.success
      ? { type: 'success', message: 'All data exported successfully' }
      : { type: 'error', message: result.error ?? 'Export failed' })
    setExportLoading(false)
  }

  async function handleReset() {    setResetLoading(true)
    setResetStatus(null)
    const result = await resetLocations(() => { setUsers([]) })
    if (result.cancelled) { setResetLoading(false); return }
    setResetStatus(result.success
      ? { type: 'success', message: 'All location data has been reset. Please re-upload an Excel file.' }
      : { type: 'error', message: result.error ?? 'Reset failed' })
    setResetLoading(false)
  }

  async function handleRemove(user) {
    if (!window.confirm(`Are you sure you want to delete ${user.email}? This cannot be undone.`)) return
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

  const remainingRows = geocoding.total - geocoding.current
  const minutesRemaining = Math.ceil(remainingRows / 60)

  return (
    <section className="admin-panel" aria-labelledby="admin-panel-heading">
      <h2 id="admin-panel-heading">Admin Panel — User Management</h2>

      {/* ── Geocoding status ── */}
      {geocoding.status === 'running' && (
        <div className="admin-panel__card" style={{ marginBottom: '1.5rem', background: '#eff6ff', borderColor: '#bfdbfe' }}>
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
        <div className="admin-panel__card" style={{ marginBottom: '1.5rem', background: '#f0fdf4', borderColor: '#86efac' }}>
          <p role="status" style={{ margin: '0 0 0.25rem', fontWeight: 600, color: '#16a34a', fontSize: '0.875rem' }}>
            Done: {geocoding.counts.geocoded} geocoded, {geocoding.counts.failed} failed
          </p>
          {geocoding.failedRows.length > 0 && (
            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', fontSize: '0.8rem', color: '#dc2626', maxHeight: 150, overflowY: 'auto' }}>
              {geocoding.failedRows.map((row, i) => (
                <li key={i}><strong>{row.facility_name}</strong>{row.address_text ? ` — ${row.address_text}` : ''}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Invite form ── */}
      <div className="admin-panel__card">
        <h3>Invite New User</h3>
        <form onSubmit={handleInvite} className="admin-panel__form">
          <label htmlFor="invite-email" style={{ display: 'none' }}>Email address</label>
          <input
            id="invite-email"
            type="email"
            placeholder="colleague@example.com"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            disabled={inviteLoading}
            required
            className="admin-panel__input"
            aria-label="Email address to invite"
          />
          <button
            type="submit"
            disabled={inviteLoading || !inviteEmail}
            className="admin-panel__btn admin-panel__btn--primary"
          >
            {inviteLoading ? 'Sending…' : 'Invite'}
          </button>
        </form>
        {inviteStatus && (
          <p
            role={inviteStatus.type === 'error' ? 'alert' : 'status'}
            className={`admin-panel__status admin-panel__status--${inviteStatus.type}`}
            style={{ marginTop: '0.5rem' }}
          >
            {inviteStatus.message}
          </p>
        )}
      </div>

      {/* ── Remove status ── */}
      {removeStatus && (
        <p
          role={removeStatus.type === 'error' ? 'alert' : 'status'}
          className={`admin-panel__status admin-panel__status--${removeStatus.type}`}
          style={{ marginBottom: '1rem' }}
        >
          {removeStatus.message}
        </p>
      )}

      {/* ── Admin data actions ── */}
      <div className="admin-panel__actions">
        <div className="admin-panel__action-group">
          <button
            onClick={handleExportAll}
            disabled={exportLoading}
            className="admin-panel__btn admin-panel__btn--teal"
            aria-busy={exportLoading}
          >
            {exportLoading ? 'Exporting…' : 'Export All Data'}
          </button>
          {exportStatus && (
            <p
              role={exportStatus.type === 'error' ? 'alert' : 'status'}
              className={`admin-panel__status admin-panel__status--${exportStatus.type}`}
            >
              {exportStatus.message}
            </p>
          )}
        </div>

        <div className="admin-panel__action-group">
          <button
            onClick={handleReset}
            disabled={resetLoading}
            className="admin-panel__btn admin-panel__btn--danger"
            aria-busy={resetLoading}
          >
            {resetLoading ? 'Resetting…' : 'Reset Location Data'}
          </button>
          {resetStatus && (
            <p
              role={resetStatus.type === 'error' ? 'alert' : 'status'}
              className={`admin-panel__status admin-panel__status--${resetStatus.type}`}
            >
              {resetStatus.message}
            </p>
          )}
        </div>
      </div>

      {/* ── User list ── */}
      {loading ? (
        <p role="status" aria-live="polite" className="admin-panel__loading">Loading users…</p>
      ) : error ? (
        <p role="alert" className="admin-panel__status admin-panel__status--error">{error}</p>
      ) : (
        <div className="admin-panel__table-wrapper">
          <table className="admin-panel__table" aria-label="Registered users">
            <thead>
              <tr>
                <th>Email</th>
                <th>Created</th>
                <th>Last Sign-in</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={4} className="admin-panel__empty">No users found.</td></tr>
              ) : (
                users.map(user => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>{user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</td>
                    <td>{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : 'Never'}</td>
                    <td>
                      <button
                        onClick={() => handleRemove(user)}
                        className="admin-panel__btn--danger-sm"
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

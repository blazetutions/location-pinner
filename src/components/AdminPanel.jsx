import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { exportAllStatuses, resetLocations, retryFailedRows } from '../lib/adminExport'
import { useTnceraGeocoding } from '../hooks/useTnceraGeocoding.jsx'
import { detectDuplicates, resolveDuplicatePair, bulkResolvePairs } from '../lib/detectDuplicates.js'

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

  // ── Google Places matching state ───────────────────────────────────────────
  const [dupPairs, setDupPairs] = useState([])        // unresolved duplicate pairs
  const [dupLoading, setDupLoading] = useState(false)
  const [dupError, setDupError] = useState(null)
  const [matchLoading, setMatchLoading] = useState(false)
  const [matchStatus, setMatchStatus] = useState(null)
  const [latestJob, setLatestJob] = useState(null)     // most recent job row (reload-driven)
  const [jobLoading, setJobLoading] = useState(true)
  const [reviewRows, setReviewRows] = useState([])     // needs_review rows for admin accept/reject
  const [reviewLoading, setReviewLoading] = useState(false)

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

  // Fetch latest Google Places job and needs_review rows on mount (reload-driven, no polling)
  useEffect(() => {
    async function fetchJobStatus() {
      setJobLoading(true)
      const { data } = await supabase
        .from('google_places_match_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setLatestJob(data ?? null)
      setJobLoading(false)
    }

    async function fetchReviewRows() {
      setReviewLoading(true)
      const { data } = await supabase
        .from('tncera_locations')
        .select('id, facility_name, address_text, review_candidate')
        .eq('geocode_status', 'needs_review')
      setReviewRows(data ?? [])
      setReviewLoading(false)
    }

    fetchJobStatus()
    fetchReviewRows()
  }, [])

  async function handleScanDuplicates() {
    setDupLoading(true)
    setDupError(null)
    const { pairs, error } = await detectDuplicates()
    if (error) setDupError(error)
    else setDupPairs(pairs)
    setDupLoading(false)
  }

  async function handleResolvePair(rowAId, rowBId, resolution) {
    await resolveDuplicatePair(rowAId, rowBId, resolution)
    setDupPairs(prev => prev.filter(p => !(p.rowA.id === rowAId && p.rowB.id === rowBId)))
  }

  async function handleBulkResolve(resolution) {
    await bulkResolvePairs(dupPairs.map(p => ({ rowAId: p.rowA.id, rowBId: p.rowB.id })), resolution)
    setDupPairs([])
  }

  async function handleMatchPlaces() {
    setMatchLoading(true)
    setMatchStatus(null)
    const { error: fnError, data } = await supabase.functions.invoke('google_places_match', {
      body: {},
    })
    if (fnError) {
      setMatchStatus({ type: 'error', message: fnError.message || 'Matching failed' })
    } else {
      setMatchStatus({
        type: 'success',
        message: `Job started. Matched: ${data?.matched ?? '–'}, Needs review: ${data?.needs_review ?? '–'}, No match: ${data?.no_match ?? '–'}`,
      })
      // Refresh job status and review rows after job completes
      const { data: job } = await supabase
        .from('google_places_match_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setLatestJob(job ?? null)
      const { data: review } = await supabase
        .from('tncera_locations')
        .select('id, facility_name, address_text, review_candidate')
        .eq('geocode_status', 'needs_review')
      setReviewRows(review ?? [])
    }
    setMatchLoading(false)
  }

  async function handleAcceptReview(rowId, candidate) {
    await supabase
      .from('tncera_locations')
      .update({
        lat: candidate.lat,
        lng: candidate.lng,
        geocode_status: 'geocoded',
        geocode_source: 'google_places',
        google_place_id: candidate.place_id,
        review_candidate: null,
      })
      .eq('id', rowId)
    setReviewRows(prev => prev.filter(r => r.id !== rowId))
  }

  async function handleRejectReview(rowId) {
    // Route back to pending so the Nominatim pass can pick it up
    await supabase
      .from('tncera_locations')
      .update({ geocode_status: 'pending', review_candidate: null })
      .eq('id', rowId)
    setReviewRows(prev => prev.filter(r => r.id !== rowId))
  }

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

      {/* ── Google Places matching ── */}
      <div className="admin-panel__card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 700 }}>
          Google Places Matching
        </h3>

        {/* Latest job status (reload-driven, no polling) */}
        {jobLoading ? (
          <p className="admin-panel__loading" style={{ fontSize: '0.8rem' }}>Loading job status…</p>
        ) : latestJob ? (
          <div style={{ marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
            <strong>Last job:</strong> {latestJob.status}
            {latestJob.status === 'done' && (
              <span> — {latestJob.matched_count} matched, {latestJob.needs_review_count} need review, {latestJob.no_match_count} no match
                {latestJob.finished_at && ` (${new Date(latestJob.finished_at).toLocaleString()})`}
              </span>
            )}
            {latestJob.status === 'failed' && latestJob.error_message && (
              <span className="admin-panel__status admin-panel__status--error" style={{ display: 'inline', marginLeft: '0.5rem' }}>
                {latestJob.error_message}
              </span>
            )}
          </div>
        ) : (
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>No matching jobs run yet.</p>
        )}

        {/* Step 1: Scan for duplicates */}
        <div style={{ marginBottom: '0.75rem' }}>
          <button
            onClick={handleScanDuplicates}
            disabled={dupLoading}
            className="admin-panel__btn admin-panel__btn--primary"
            aria-busy={dupLoading}
            style={{ marginRight: '0.5rem' }}
          >
            {dupLoading ? 'Scanning…' : 'Scan for Duplicates'}
          </button>
          {dupError && <span className="admin-panel__status admin-panel__status--error" style={{ fontSize: '0.8rem' }}>{dupError}</span>}
        </div>

        {/* Duplicate pairs review */}
        {dupPairs.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-warning)', margin: '0 0 0.5rem' }}>
              {dupPairs.length} potential duplicate pair{dupPairs.length !== 1 ? 's' : ''} found. Resolve before matching.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <button onClick={() => handleBulkResolve('not_duplicate')} className="admin-panel__btn admin-panel__btn--primary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}>
                All: Not Duplicates
              </button>
              <button onClick={() => handleBulkResolve('skip_matching')} className="admin-panel__btn" style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem', background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                All: Skip Matching
              </button>
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: '0.78rem' }}>
              {dupPairs.map((p, i) => (
                <div key={i} style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <div><strong>{p.rowA.facility_name}</strong> <span style={{ color: 'var(--color-text-muted)' }}>{p.rowA.address_text?.slice(0, 60)}</span></div>
                    <div style={{ color: 'var(--color-text-secondary)' }}>vs. <strong>{p.rowB.facility_name}</strong> <span style={{ color: 'var(--color-text-muted)' }}>{p.rowB.address_text?.slice(0, 60)}</span></div>
                    <div style={{ color: 'var(--color-text-muted)' }}>Similarity: {(p.similarity * 100).toFixed(0)}%</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flexShrink: 0 }}>
                    <button onClick={() => handleResolvePair(p.rowA.id, p.rowB.id, 'not_duplicate')} style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', background: 'var(--color-success-subtle)', border: '1px solid #86efac', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-success)' }}>Not a dup</button>
                    <button onClick={() => handleResolvePair(p.rowA.id, p.rowB.id, 'skip_matching')} style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>Skip</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Trigger matching (only if no unresolved duplicates) */}
        <button
          onClick={handleMatchPlaces}
          disabled={matchLoading || dupPairs.length > 0}
          className="admin-panel__btn admin-panel__btn--teal"
          aria-busy={matchLoading}
          title={dupPairs.length > 0 ? 'Resolve duplicate pairs first' : undefined}
        >
          {matchLoading ? 'Matching…' : 'Match via Google Places'}
        </button>
        {dupPairs.length > 0 && (
          <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            (resolve {dupPairs.length} pair{dupPairs.length !== 1 ? 's' : ''} first)
          </span>
        )}
        {matchStatus && (
          <p role={matchStatus.type === 'error' ? 'alert' : 'status'} className={`admin-panel__status admin-panel__status--${matchStatus.type}`} style={{ marginTop: '0.5rem' }}>
            {matchStatus.message}
          </p>
        )}
      </div>

      {/* ── Needs-review queue ── */}
      {(reviewLoading || reviewRows.length > 0) && (
        <div className="admin-panel__card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 700 }}>
            Needs Review ({reviewLoading ? '…' : reviewRows.length})
          </h3>
          {reviewLoading ? (
            <p className="admin-panel__loading" style={{ fontSize: '0.8rem' }}>Loading…</p>
          ) : (
            <div style={{ maxHeight: 300, overflowY: 'auto', fontSize: '0.8rem' }}>
              {reviewRows.map(row => {
                const c = row.review_candidate
                return (
                  <div key={row.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ fontWeight: 600 }}>{row.facility_name}</div>
                    <div style={{ color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>{row.address_text}</div>
                    {c && (
                      <div style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', padding: '0.35rem 0.5rem', marginBottom: '0.35rem', fontSize: '0.75rem' }}>
                        <strong>Google match:</strong> {c.name}<br />
                        <span style={{ color: 'var(--color-text-muted)' }}>{c.address}</span><br />
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          Similarity: {c.similarity !== undefined ? `${(c.similarity * 100).toFixed(0)}%` : '—'}
                          {c.pin_match !== undefined && ` · PIN match: ${c.pin_match ? 'yes' : 'no'}`}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => handleAcceptReview(row.id, c)} disabled={!c} style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem', background: 'var(--color-success-subtle)', border: '1px solid #86efac', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-success)', fontWeight: 600 }}>
                        Accept
                      </button>
                      <button onClick={() => handleRejectReview(row.id)} style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem', background: 'var(--color-danger-subtle)', border: '1px solid #fca5a5', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-danger)', fontWeight: 600 }}>
                        Reject → Nominatim
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
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

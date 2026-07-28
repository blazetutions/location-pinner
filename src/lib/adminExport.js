/**
 * adminExport.js — Admin-only: export all users' statuses and reset locations.
 *
 * Requirements: 16.11, 16.12
 */

import { supabase } from '../supabaseClient'

// ── exportAllStatuses ────────────────────────────────────────────────────────

/**
 * Calls the export_all_statuses() RPC (SECURITY DEFINER, admin-only),
 * serialises the result to JSON, and triggers a browser file download.
 *
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function exportAllStatuses() {
  const { data, error } = await supabase.rpc('export_all_statuses')

  if (error) {
    const msg = error.message?.toLowerCase?.() ?? ''
    const isPermission = msg.includes('permission denied') || msg.includes('admin only')
    return { success: false, error: isPermission ? 'Permission denied' : error.message }
  }

  const jsonString = JSON.stringify(data ?? [], null, 2)
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const date = new Date().toISOString().slice(0, 10)
  const filename = `all-user-statuses-${date}.json`

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)

  return { success: true }
}

// ── resetLocations ───────────────────────────────────────────────────────────

/**
 * Shows a confirmation prompt, then calls the reset_locations() RPC
 * (SECURITY DEFINER, admin-only) to delete all rows from the locations table.
 *
 * @param {() => void} onResetComplete — called after successful reset
 * @returns {Promise<{ success: boolean, cancelled?: boolean, error?: string }>}
 */
export async function resetLocations(onResetComplete) {
  const confirmed = window.confirm(
    'This will delete ALL location data and require a fresh Excel upload and geocoding pass. ' +
    'This cannot be undone. Proceed?'
  )

  if (!confirmed) {
    return { success: false, cancelled: true }
  }

  const { error } = await supabase.rpc('reset_locations')

  if (error) {
    const msg = error.message?.toLowerCase?.() ?? ''
    const isPermission = msg.includes('permission denied') || msg.includes('admin only')
    return { success: false, error: isPermission ? 'Permission denied' : error.message }
  }

  if (typeof onResetComplete === 'function') {
    onResetComplete()
  }

  return { success: true }
}

// ── retryFailedRows ──────────────────────────────────────────────────────────

/**
 * Resets all `tncera_locations` rows with `geocode_status = 'failed'` back to
 * `'pending'` so the next geocoding pass will re-attempt them.
 *
 * This is intentionally separate from `resetLocations` — it does NOT delete any
 * data; it only re-queues failed geocoding attempts for a fresh pass.
 *
 * @returns {Promise<{ success: boolean, count?: number, error?: string }>}
 */
export async function retryFailedRows() {
  // Count failed rows first so we can report how many were re-queued
  const { count, error: countError } = await supabase
    .from('tncera_locations')
    .select('*', { count: 'exact', head: true })
    .eq('geocode_status', 'failed')

  if (countError) {
    return { success: false, error: countError.message }
  }

  if (count === 0) {
    return { success: true, count: 0 }
  }

  const { error } = await supabase
    .from('tncera_locations')
    .update({ geocode_status: 'pending' })
    .eq('geocode_status', 'failed')

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, count }
}

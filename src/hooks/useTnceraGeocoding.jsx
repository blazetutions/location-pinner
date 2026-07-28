/**
 * useTnceraGeocoding — shared hook that owns the TNCERA geocoding pass state.
 *
 * Decouples the running geocoding pass from any individual component's lifecycle.
 * State lives in a React context so it survives re-renders, panel toggles, and
 * Admin Panel navigation without resetting or duplicating the pass.
 *
 * Usage:
 *   // Wrap AppContent (or App) with <TnceraGeocodingProvider>
 *   // Then in any component: const geocoding = useTnceraGeocoding()
 *
 * TODO: For cross-session / multi-admin visibility, replace the in-browser
 * state here with a Supabase Realtime subscription that watches a
 * `geocoding_jobs` table updated by a server-side Edge Function.
 * That would also survive tab closes and device sleep for large batches.
 */

import { createContext, useContext, useRef, useState, useCallback } from 'react'
import { runTnceraGeocodingPass } from '../lib/tnceraGeocodingEngine.js'

// ── Context ──────────────────────────────────────────────────────────────────

const TnceraGeocodingContext = createContext(null)

// ── Provider ─────────────────────────────────────────────────────────────────

export function TnceraGeocodingProvider({ children }) {
  // 'idle' | 'running' | 'done'
  const [status, setStatus] = useState('idle')
  const [estimatedCount, setEstimatedCount] = useState(null)
  const [current, setCurrent] = useState(0)
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState({ geocoded: 0, failed: 0 })
  const [failedRows, setFailedRows] = useState([])

  // Module-level lock: checked+set synchronously so concurrent calls are no-ops
  const isRunningRef = useRef(false)

  /**
   * Start a geocoding pass for the given rows.
   * Safe to call multiple times — concurrent calls while a pass is in flight
   * are silently ignored (no duplicate pass, no state reset).
   */
  const startGeocoding = useCallback(async () => {
    // Synchronous guard — prevents any second invocation from racing in
    if (isRunningRef.current) return
    isRunningRef.current = true

    // Reset progress state for the new pass
    setStatus('running')
    setEstimatedCount(null)
    setCurrent(0)
    setTotal(0)
    setCounts({ geocoded: 0, failed: 0 })
    setFailedRows([])

    try {
      const result = await runTnceraGeocodingPass({
        onEstimate: (count) => {
          setEstimatedCount(count)
          setTotal(count)
        },
        onProgress: (curr, tot) => {
          setCurrent(curr)
          setTotal(tot)
        },
      })

      setCounts({ geocoded: result.geocoded, failed: result.failed })
      setFailedRows(result.failedRows ?? [])
    } catch (err) {
      console.error('useTnceraGeocoding: geocoding pass failed', err)
    } finally {
      setStatus('done')
      isRunningRef.current = false
    }
  }, []) // stable — no deps that change

  const value = {
    status,         // 'idle' | 'running' | 'done'
    estimatedCount,
    current,
    total,
    counts,
    failedRows,
    startGeocoding, // stable reference — safe in useEffect dep arrays
  }

  return (
    <TnceraGeocodingContext.Provider value={value}>
      {children}
    </TnceraGeocodingContext.Provider>
  )
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

export function useTnceraGeocoding() {
  const ctx = useContext(TnceraGeocodingContext)
  if (!ctx) throw new Error('useTnceraGeocoding must be used inside TnceraGeocodingProvider')
  return ctx
}

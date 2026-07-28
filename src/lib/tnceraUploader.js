import { utils as XLSXUtils } from 'xlsx'
import { parseTnceraRow } from './parseTnceraRow.js'
import { supabase } from '../supabaseClient.js'

/** The sheet name required in every TNCERA workbook (Requirement 1.2, 1.3). */
const TNCERA_SHEET = 'Both'

/** All column headers that must be present in the `Both` sheet (Requirement 1.4). */
const REQUIRED_COLUMNS = [
  'S.No',
  'Name and Address of Clinical Establishment',
  'TNCERA No. and Date',
  'District',
  'Type of Establishment',
  'Validity From',
  'Validity To',
]

/**
 * Parses and upserts a TNCERA Excel workbook into the `tncera_locations` table.
 *
 * @param {import('xlsx').WorkBook} workbook - A SheetJS workbook parsed by the caller.
 * @param {(current: number, total: number) => void} [onProgress] - Optional progress callback
 *   invoked after each row is processed.
 * @returns {Promise<
 *   | { error: string }
 *   | { inserted: number, skipped: number, rows: object[] }
 * >}
 *
 * Error returns (no DB writes performed):
 *   - `{ error: "TNCERA file must contain a sheet named 'Both'" }` — sheet missing (Req 1.3)
 *   - `{ error: 'Missing columns: ...' }`                          — required columns absent (Req 1.5)
 *
 * Success return:
 *   - `{ inserted, skipped, rows }` where `rows` is the full post-upsert table contents (Req 3.3)
 */
export async function tnceraUploader(workbook, onProgress) {
  // ── 1. Verify `Both` sheet exists (Requirements 1.2, 1.3) ─────────────────
  if (!workbook.SheetNames.includes(TNCERA_SHEET)) {
    return { error: "TNCERA file must contain a sheet named 'Both'" }
  }

  const sheet = workbook.Sheets[TNCERA_SHEET]

  // Convert sheet to array of row objects; defval: '' ensures missing cells are
  // represented as empty strings rather than undefined keys.
  const rawRows = XLSXUtils.sheet_to_json(sheet, { defval: '' })

  // ── 2. Validate required columns (Requirements 1.4, 1.5) ──────────────────
  const actualColumns = rawRows.length > 0 ? Object.keys(rawRows[0]) : []
  const missingColumns = REQUIRED_COLUMNS.filter(col => !actualColumns.includes(col))

  if (missingColumns.length > 0) {
    return { error: `Missing columns: ${missingColumns.join(', ')}` }
  }

  // ── 3. Get pre-upsert row count to compute inserted vs skipped (Req 3.3) ──
  const { count: countBefore, error: countBeforeError } = await supabase
    .from('tncera_locations')
    .select('*', { count: 'exact', head: true })

  if (countBeforeError) {
    return { error: countBeforeError.message }
  }

  // ── 4. Build TNCERALocationRow objects (Requirements 2.x, 3.2, 3.4) ───────
  const builtRows = rawRows.map((row) => {
    const rawNameAddress = row['Name and Address of Clinical Establishment']
    const { facility_name, address_text, query_text } = parseTnceraRow(rawNameAddress)

    return {
      facility_name,
      address_text,
      query_text,
      tncera_no: String(row['TNCERA No. and Date'] ?? '').trim(),   // Requirement 3.2
      district: String(row['District'] ?? '').trim(),
      establishment_type: String(row['Type of Establishment'] ?? '').trim(),
      validity_from: String(row['Validity From'] ?? '').trim(),
      validity_to: String(row['Validity To'] ?? '').trim(),
      geocode_status: 'pending',                                     // Requirement 3.4
    }
  })

  // Deduplicate within the file itself: rows that share the same tncera_no OR
  // the same query_text would both violate unique constraints in Supabase.
  // We keep the last occurrence of each duplicate and filter by both keys.
  const seenTnceraNo = new Map()
  for (const row of builtRows) {
    seenTnceraNo.set(row.tncera_no, row)
  }
  // Second pass: within the tncera_no-deduplicated set, also deduplicate on query_text
  const seenQueryText = new Map()
  for (const row of seenTnceraNo.values()) {
    seenQueryText.set(row.query_text, row)
  }
  const locationRows = [...seenQueryText.values()]

  // Report progress after building all rows (pre-upsert phase complete)
  if (typeof onProgress === 'function') {
    onProgress(0, locationRows.length)
  }

  // ── 5. Upsert to `tncera_locations` ──────────────────────────────────────
  // Conflict on tncera_no (the business unique key). ignoreDuplicates: true
  // leaves existing rows and their geocode_status untouched on re-upload.
  const { error: upsertError } = await supabase
    .from('tncera_locations')
    .upsert(locationRows, {
      onConflict: 'tncera_no',
      ignoreDuplicates: true,
    })

  if (upsertError) {
    return { error: upsertError.message }
  }

  // ── 6. Fetch post-upsert state (Requirement 3.3 — return full rows) ────────
  const { data: rows, error: fetchError } = await supabase
    .from('tncera_locations')
    .select('*')

  if (fetchError) {
    return { error: fetchError.message }
  }

  // ── 7. Compute inserted vs skipped (Requirement 3.3) ──────────────────────
  const countAfter = rows.length
  const inserted = countAfter - (countBefore ?? 0)
  const skipped = locationRows.length - inserted

  // Final progress callback — all rows processed
  if (typeof onProgress === 'function') {
    onProgress(locationRows.length, locationRows.length)
  }

  return { inserted, skipped, rows }
}

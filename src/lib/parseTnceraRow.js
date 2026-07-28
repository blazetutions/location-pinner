/**
 * Parses the `Name and Address of Clinical Establishment` field from a TNCERA row
 * into structured facility name, address text, and geocoding query text.
 *
 * @param {string} rawValue - The raw cell value of the combined name-and-address field.
 * @returns {{ facility_name: string, address_text: string, query_text: string }}
 *
 * Normalisation (Requirement 2.1):
 *   - Replace all `\r` and `\n` characters with a single space.
 *   - Collapse runs of 2+ whitespace characters down to a single space.
 *   - Trim leading and trailing whitespace.
 *
 * Splitting (Requirements 2.2, 2.3):
 *   - If the normalised value contains at least one comma, split on the FIRST comma:
 *       facility_name = substring before first comma (trimmed)
 *       address_text  = substring after first comma (trimmed)
 *   - If no comma is present:
 *       facility_name = full normalised value
 *       address_text  = ''
 *
 * Query text construction (Requirements 2.4, 2.5, 2.6):
 *   - If address_text is non-empty AND does not already end with "Tamil Nadu"
 *     (optionally followed by a PIN code and/or punctuation), append
 *     ", Chennai, Tamil Nadu, India".
 *   - Otherwise use address_text as-is.
 *   - This is a pure deterministic operation — identical inputs always produce
 *     identical outputs.
 */

/**
 * Checks whether a string already contains "India" (case-insensitive, whole-word).
 * Used to avoid appending India twice to query_text.
 */
const INDIA_RE = /\bIndia\b/i;

/**
 * Checks whether a string already contains "Tamil Nadu" (case-insensitive).
 * Used to decide whether to append the full suffix or just ", India".
 */
const TAMIL_NADU_RE = /Tamil Nadu/i;

/**
 * Pure function — no side effects, no I/O.
 *
 * @param {string} rawValue
 * @returns {{ facility_name: string, address_text: string, query_text: string }}
 */
export function parseTnceraRow(rawValue) {
  // --- 1. Normalise (Requirement 2.1) ---
  const normalised = String(rawValue ?? '')
    .replace(/[\r\n]/g, ' ')   // replace line-break chars with space
    .replace(/\s{2,}/g, ' ')   // collapse runs of 2+ whitespace to one space
    .trim();

  // --- 2. Split on first comma (Requirements 2.2, 2.3) ---
  const commaIndex = normalised.indexOf(',');

  let facility_name;
  let address_text;

  if (commaIndex === -1) {
    facility_name = normalised;
    address_text = '';
  } else {
    facility_name = normalised.slice(0, commaIndex).trim();
    address_text = normalised.slice(commaIndex + 1).trim();
  }

  // --- 3. Build query_text ---
  // Rule: every non-empty query_text must contain an explicit country reference
  // so Nominatim can disambiguate sparse Indian street names.
  //
  // - Empty address_text → empty query_text (no location to geocode)
  // - Address already contains "India" → use as-is (no duplication)
  // - Address contains "Tamil Nadu" but not "India" → append ", India" only
  //   (avoids "Tamil Nadu, Chennai, Tamil Nadu, India" duplication)
  // - Address contains neither → append full ", Chennai, Tamil Nadu, India"
  let query_text;

  if (address_text === '') {
    query_text = '';
  } else if (INDIA_RE.test(address_text)) {
    // Already has India — use as-is
    query_text = address_text;
  } else if (TAMIL_NADU_RE.test(address_text)) {
    // Has Tamil Nadu but no India — append country only
    query_text = `${address_text}, India`;
  } else {
    // No location anchor at all — append full suffix
    query_text = `${address_text}, Chennai, Tamil Nadu, India`;
  }

  return { facility_name, address_text, query_text };
}

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
 * Regex that matches "Tamil Nadu" at the end of a string, optionally followed by
 * whitespace, a 6-digit PIN code, and/or trailing punctuation/whitespace.
 *
 * Examples that match:
 *   "Tamil Nadu"
 *   "Tamil Nadu 600001"
 *   "Tamil Nadu - 600001"
 *   "Tamil Nadu, 600001."
 */
const TAMIL_NADU_SUFFIX_RE = /Tamil Nadu[\s,\-–.]*(?:\d{6}[\s,\-.]*)?$/i;

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
    // No comma — full value is the facility name
    facility_name = normalised;
    address_text = '';
  } else {
    facility_name = normalised.slice(0, commaIndex).trim();
    address_text = normalised.slice(commaIndex + 1).trim();
  }

  // --- 3. Build query_text (Requirements 2.4, 2.5, 2.6) ---
  let query_text;

  if (address_text !== '' && !TAMIL_NADU_SUFFIX_RE.test(address_text)) {
    // address_text is non-empty and does not already end with Tamil Nadu
    query_text = `${address_text}, Chennai, Tamil Nadu, India`;
  } else {
    // Either address_text is empty, or it already ends with Tamil Nadu (+ optional PIN/punct)
    query_text = address_text;
  }

  return { facility_name, address_text, query_text };
}

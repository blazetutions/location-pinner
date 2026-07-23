/**
 * applyFilters — pure function for cascading AND filter logic.
 *
 * @param {Array}  locations    - Full LocationRow[] list
 * @param {Map}    userStatuses - Map<locationId, { status: string }>; may be empty
 * @param {Object} filters      - FilterState { zone, block, phc, statuses[] }
 * @returns {Array} Filtered subset of locations; never mutates inputs
 */
export function applyFilters(locations, userStatuses, filters) {
  // Defensively handle null/undefined inputs
  if (!Array.isArray(locations)) return []

  const safeStatuses = userStatuses instanceof Map ? userStatuses : new Map()
  const safeFilters = filters ?? { zone: null, block: null, phc: null, statuses: [] }

  let result = locations

  // Step 1: Zone filter
  if (safeFilters.zone != null) {
    result = result.filter(loc => loc.zone === safeFilters.zone)
  }

  // Step 2: Block filter
  if (safeFilters.block != null) {
    result = result.filter(loc => loc.block === safeFilters.block)
  }

  // Step 3: PHC filter
  if (safeFilters.phc != null) {
    result = result.filter(loc => loc.phc === safeFilters.phc)
  }

  // Step 4: Status filter (multi-select AND with default 'Not Visited')
  const activeStatuses = Array.isArray(safeFilters.statuses) ? safeFilters.statuses : []
  if (activeStatuses.length > 0) {
    result = result.filter(loc => {
      const effectiveStatus = safeStatuses.get(loc.id)?.status ?? 'Not Visited'
      return activeStatuses.includes(effectiveStatus)
    })
  }

  return result
}

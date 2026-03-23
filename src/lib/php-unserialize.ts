/**
 * Extract clean string values from PHP serialized array strings.
 *
 * Examples:
 *   'a:1:{i:0;s:15:"Los Angeles, CA";}' → ['Los Angeles, CA']
 *   'a:1:{i:0;s:0:"";}' → [] (empty string filtered)
 *   'a:2:{i:0;s:5:"phone";i:1;s:12:"323-723-3020";}' → ['phone', '323-723-3020']
 *   'plain text' → ['plain text']
 */
export function extractFromPhpSerialized(raw: string): string[] {
  if (!raw) return []

  // If it doesn't look like PHP serialized, return as-is
  if (!raw.startsWith('a:') && !raw.startsWith('s:')) {
    return [raw]
  }

  // Extract all s:N:"value"; patterns
  const results: string[] = []
  const regex = /s:\d+:"((?:[^"\\]|\\.)*)";/g
  let match
  while ((match = regex.exec(raw)) !== null) {
    const val = match[1].trim()
    if (val.length > 0) {
      results.push(val)
    }
  }

  return results
}

/**
 * Given a PostgreSQL text[] array that may contain PHP serialized strings,
 * return a flat array of clean human-readable values.
 */
export function cleanPgArray(arr: string[] | null | undefined): string[] {
  if (!arr || !Array.isArray(arr)) return []
  const out: string[] = []
  for (const item of arr) {
    if (!item) continue
    const extracted = extractFromPhpSerialized(item)
    out.push(...extracted)
  }
  return out
}

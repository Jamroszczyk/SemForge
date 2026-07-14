/** Subsequence fuzzy match (case-insensitive). Empty query matches everything. */
export function fuzzyMatchClassLabel(label: string, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true

  const text = label.toLowerCase()
  let start = 0

  for (const char of q) {
    const idx = text.indexOf(char, start)
    if (idx === -1) return false
    start = idx + 1
  }

  return true
}

export function sortClassesByLabel<T extends { label: string }>(items: T[], ascending: boolean) {
  return [...items].sort((a, b) => {
    const cmp = a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    return ascending ? cmp : -cmp
  })
}

export function filterAndSortClasses<T extends { label: string }>(
  items: T[],
  query: string,
  ascending: boolean,
) {
  const filtered = query.trim()
    ? items.filter((item) => fuzzyMatchClassLabel(item.label, query))
    : items
  return sortClassesByLabel(filtered, ascending)
}

/** Next default label: NewClass, then NewClass2, NewClass3, … based on existing names. */
export function nextNewClassLabel(existingLabels: Iterable<string>) {
  let max = 0

  for (const label of existingLabels) {
    if (label === 'NewClass') {
      max = Math.max(max, 1)
      continue
    }

    const match = /^NewClass(\d+)$/.exec(label)
    if (match) {
      max = Math.max(max, Number.parseInt(match[1], 10))
    }
  }

  if (max === 0) return 'NewClass'
  return `NewClass${max + 1}`
}

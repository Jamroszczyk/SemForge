/** Default namespace for auto-generated class IRIs. */
export const DEFAULT_ONTOLOGY_IRI_BASE = 'http://example.org/ontology#'

export function iriFragmentFromLabel(label: string): string {
  const trimmed = label.trim() || 'Unnamed'
  const fragment = trimmed.replace(/\s+/g, '')
  return `${DEFAULT_ONTOLOGY_IRI_BASE}${fragment}`
}

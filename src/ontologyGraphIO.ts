import { normalizeClassColor } from './classColorUtils'
import type {
  ExpressionKind,
  ExpressionNode,
  NamedClassNode,
  OntologyDataProperty,
  OntologyEdge,
  StatementKind,
} from './types'
import { DEFAULT_DATATYPE } from './types'

export const ONTOLOGY_GRAPH_FORMAT_VERSION = 1

export interface OntologyGraphDocument {
  formatVersion: typeof ONTOLOGY_GRAPH_FORMAT_VERSION
  exportedAt: string
  classes: NamedClassNode[]
  expressions: ExpressionNode[]
  edges: OntologyEdge[]
  dataProperties: OntologyDataProperty[]
  hiddenClassIds: string[]
}

export interface OntologyGraphSnapshot {
  classes: NamedClassNode[]
  expressions: ExpressionNode[]
  edges: OntologyEdge[]
  dataProperties: OntologyDataProperty[]
  hiddenClassIds: ReadonlySet<string>
}

const STATEMENT_KINDS = new Set<StatementKind>([
  'ObjectProperty',
  'subClassOf',
  'equivalentClass',
  'disjointWith',
  'OperandConnection',
])

const EXPRESSION_KINDS = new Set<ExpressionKind>([
  'ObjectIntersectionOf',
  'ObjectUnionOf',
  'ObjectComplementOf',
  'ObjectSomeValuesFrom',
  'ObjectAllValuesFrom',
  'ObjectHasValue',
  'ObjectHasSelf',
  'ObjectMinCardinality',
  'ObjectMaxCardinality',
  'ObjectExactCardinality',
  'ObjectOneOf',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${field}: expected string`)
  return value
}

function asOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined
  return value
}

function normalizeClass(raw: Record<string, unknown>): NamedClassNode {
  return {
    id: asString(raw.id, 'class id'),
    kind: 'namedClass',
    label: asString(raw.label ?? 'Unnamed', 'class label'),
    tag: asString(raw.tag ?? '', 'class tag'),
    iri: asString(raw.iri ?? '', 'class iri'),
    comment: asString(raw.comment ?? '', 'class comment'),
    expired: raw.expired === true,
    color: normalizeClassColor(raw.color),
    x: asOptionalNumber(raw.x),
    y: asOptionalNumber(raw.y),
  }
}

function normalizeExpression(raw: Record<string, unknown>): ExpressionNode {
  const kind = raw.expressionKind
  if (typeof kind !== 'string' || !EXPRESSION_KINDS.has(kind as ExpressionKind)) {
    throw new Error(`Invalid expression kind: ${String(kind)}`)
  }
  return {
    id: asString(raw.id, 'expression id'),
    kind: 'expression',
    expressionKind: kind as ExpressionKind,
    x: asOptionalNumber(raw.x),
    y: asOptionalNumber(raw.y),
  }
}

function normalizeEdge(raw: Record<string, unknown>): OntologyEdge {
  const kind = raw.statementKind ?? 'ObjectProperty'
  if (typeof kind !== 'string' || !STATEMENT_KINDS.has(kind as StatementKind)) {
    throw new Error(`Invalid statement kind: ${String(kind)}`)
  }
  return {
    id: asString(raw.id, 'edge id'),
    sourceId: asString(raw.sourceId, 'edge sourceId'),
    targetId: asString(raw.targetId, 'edge targetId'),
    label: asString(raw.label ?? '', 'edge label'),
    statementKind: kind as StatementKind,
  }
}

function normalizeDataProperty(raw: Record<string, unknown>): OntologyDataProperty {
  return {
    id: asString(raw.id, 'data property id'),
    classId: asString(raw.classId, 'data property classId'),
    label: asString(raw.label ?? 'property', 'data property label'),
    datatype: asString(raw.datatype ?? DEFAULT_DATATYPE, 'data property datatype'),
  }
}

export function buildOntologyGraphDocument(snapshot: OntologyGraphSnapshot): OntologyGraphDocument {
  return {
    formatVersion: ONTOLOGY_GRAPH_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    classes: snapshot.classes,
    expressions: snapshot.expressions,
    edges: snapshot.edges,
    dataProperties: snapshot.dataProperties,
    hiddenClassIds: [...snapshot.hiddenClassIds],
  }
}

export function parseOntologyGraphDocument(json: unknown): OntologyGraphDocument {
  if (!isRecord(json)) throw new Error('Invalid graph file: root must be an object')

  const classesRaw = json.classes
  const expressionsRaw = json.expressions
  const edgesRaw = json.edges
  const dataPropertiesRaw = json.dataProperties

  if (!Array.isArray(classesRaw)) throw new Error('Invalid graph file: classes must be an array')
  if (!Array.isArray(expressionsRaw)) throw new Error('Invalid graph file: expressions must be an array')
  if (!Array.isArray(edgesRaw)) throw new Error('Invalid graph file: edges must be an array')
  if (!Array.isArray(dataPropertiesRaw)) {
    throw new Error('Invalid graph file: dataProperties must be an array')
  }

  const classes = classesRaw.map((item, i) => {
    if (!isRecord(item)) throw new Error(`Invalid class at index ${i}`)
    return normalizeClass(item)
  })

  const expressions = expressionsRaw.map((item, i) => {
    if (!isRecord(item)) throw new Error(`Invalid expression at index ${i}`)
    const expr = normalizeExpression(item)
    return expr
  })

  const edges = edgesRaw.map((item, i) => {
    if (!isRecord(item)) throw new Error(`Invalid edge at index ${i}`)
    return normalizeEdge(item)
  })

  const dataProperties = dataPropertiesRaw.map((item, i) => {
    if (!isRecord(item)) throw new Error(`Invalid data property at index ${i}`)
    return normalizeDataProperty(item)
  })

  const nodeIds = new Set([
    ...classes.map((c) => c.id),
    ...expressions.map((e) => e.id),
  ])

  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) {
      throw new Error(`Edge "${edge.id}" references missing nodes`)
    }
  }

  for (const prop of dataProperties) {
    if (!classes.some((c) => c.id === prop.classId)) {
      throw new Error(`Data property "${prop.id}" references missing class`)
    }
  }

  const hiddenClassIds = Array.isArray(json.hiddenClassIds)
    ? json.hiddenClassIds.filter((id): id is string => typeof id === 'string')
    : []

  return {
    formatVersion: ONTOLOGY_GRAPH_FORMAT_VERSION,
    exportedAt: typeof json.exportedAt === 'string' ? json.exportedAt : new Date().toISOString(),
    classes,
    expressions,
    edges,
    dataProperties,
    hiddenClassIds: hiddenClassIds.filter((id) => classes.some((c) => c.id === id)),
  }
}

export function downloadOntologyGraphDocument(doc: OntologyGraphDocument): void {
  const suggested = 'ontology-graph.json'
  const input = window.prompt('Save graph as', suggested)
  if (input === null) return

  const trimmed = input.trim()
  if (!trimmed) return

  const filename = trimmed.toLowerCase().endsWith('.json') ? trimmed : `${trimmed}.json`
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function readOntologyGraphFile(file: File): Promise<OntologyGraphDocument> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Invalid JSON file')
  }
  return parseOntologyGraphDocument(parsed)
}

import { getExpressionKindLabel } from './expressionUtils'
import type {
  ExpressionNode,
  NamedClassNode,
  OntologyEdge,
  OntologyNodeKind,
  StatementKind,
} from './types'

export type StatementMarker = 'arrow' | 'bar' | 'diamond'

export interface StatementRenderSpec {
  dashed: boolean
  doubleLine: boolean
  markerStart: StatementMarker | null
  markerEnd: StatementMarker | null
}

export interface GraphNodeOption {
  id: string
  label: string
  kind: OntologyNodeKind
}

export const STATEMENT_KIND_OPTIONS: ReadonlyArray<{
  value: StatementKind
  label: string
}> = [
  { value: 'ObjectProperty', label: 'Object property' },
  { value: 'subClassOf', label: 'subClassOf' },
  { value: 'equivalentClass', label: 'equivalentClass' },
  { value: 'disjointWith', label: 'disjointWith' },
  { value: 'OperandConnection', label: 'Operand connection' },
]

export const STATEMENT_SECTIONS: ReadonlyArray<{
  kind: StatementKind
  title: string
}> = [
  { kind: 'ObjectProperty', title: 'Object properties' },
  { kind: 'subClassOf', title: 'Subclass relations' },
  { kind: 'equivalentClass', title: 'Equivalent classes' },
  { kind: 'disjointWith', title: 'Disjoint classes' },
  { kind: 'OperandConnection', title: 'Expression membership' },
]

const FIXED_LABEL: Partial<Record<StatementKind, string>> = {
  subClassOf: 'subClassOf',
  equivalentClass: 'equivalentClass',
  disjointWith: 'disjointWith',
}

export function getStatementKind(edge: Pick<OntologyEdge, 'statementKind'>): StatementKind {
  return edge.statementKind ?? 'ObjectProperty'
}

export function getStatementFixedLabel(kind: StatementKind): string | null {
  return FIXED_LABEL[kind] ?? null
}

export function statementUsesEditableLabel(kind: StatementKind): boolean {
  return kind === 'ObjectProperty'
}

export function getStatementCanvasLabel(edge: OntologyEdge): string {
  const kind = getStatementKind(edge)
  if (kind === 'ObjectProperty') return edge.label
  return getStatementFixedLabel(kind) ?? ''
}

export function shouldShowStatementCanvasLabel(kind: StatementKind): boolean {
  return kind !== 'OperandConnection'
}

export function labelForStatementKind(kind: StatementKind, userLabel?: string): string {
  if (kind === 'ObjectProperty') return userLabel?.trim() || 'relation'
  return getStatementFixedLabel(kind) ?? ''
}

export function getAllowedStatementKinds(
  sourceKind: OntologyNodeKind,
  targetKind: OntologyNodeKind,
): StatementKind[] {
  if (sourceKind === 'namedClass' && targetKind === 'namedClass') {
    return ['ObjectProperty', 'subClassOf', 'equivalentClass', 'disjointWith']
  }
  if (sourceKind === 'expression' && targetKind === 'expression') {
    return ['OperandConnection']
  }
  return ['OperandConnection', 'subClassOf', 'equivalentClass', 'disjointWith']
}

export function inferStatementKind(
  sourceKind: OntologyNodeKind,
  targetKind: OntologyNodeKind,
): StatementKind {
  const allowed = getAllowedStatementKinds(sourceKind, targetKind)
  if (allowed.length === 1) return allowed[0]
  if (sourceKind === 'namedClass' && targetKind === 'namedClass') return 'ObjectProperty'
  if (sourceKind === 'expression' && targetKind === 'expression') return 'OperandConnection'
  if (targetKind === 'expression' && allowed.includes('OperandConnection')) {
    return 'OperandConnection'
  }
  if (sourceKind === 'expression' && targetKind === 'namedClass') return 'subClassOf'
  return allowed[0]
}

export function getStatementRenderSpec(
  kind: StatementKind,
  sourceKind: OntologyNodeKind,
  targetKind: OntologyNodeKind,
): StatementRenderSpec {
  switch (kind) {
    case 'ObjectProperty':
      return { dashed: false, doubleLine: false, markerStart: null, markerEnd: 'arrow' }
    case 'subClassOf':
      return { dashed: true, doubleLine: false, markerStart: null, markerEnd: 'arrow' }
    case 'equivalentClass':
      return { dashed: false, doubleLine: true, markerStart: 'arrow', markerEnd: 'arrow' }
    case 'disjointWith':
      return { dashed: true, doubleLine: false, markerStart: 'bar', markerEnd: 'bar' }
    case 'OperandConnection':
      return {
        dashed: true,
        doubleLine: false,
        markerStart: sourceKind === 'expression' ? 'diamond' : null,
        markerEnd: targetKind === 'expression' ? 'diamond' : null,
      }
  }
}

export function hasStatementStartMarker(spec: StatementRenderSpec): boolean {
  return spec.markerStart != null
}

export function markerUrl(
  marker: StatementMarker | null,
  position: 'start' | 'end' = 'end',
): string | null {
  if (!marker) return null
  if (marker === 'arrow') return position === 'start' ? 'url(#arrow-start)' : 'url(#arrow)'
  return `url(#marker-${marker})`
}

export function swapStatementEndpoints(edge: OntologyEdge): OntologyEdge {
  return {
    ...edge,
    sourceId: edge.targetId,
    targetId: edge.sourceId,
  }
}

export function applyStatementKindChange(
  edge: OntologyEdge,
  kind: StatementKind,
): OntologyEdge {
  return {
    ...edge,
    statementKind: kind,
    label: labelForStatementKind(kind, edge.label),
  }
}

export function buildGraphNodeOptions(
  classes: NamedClassNode[],
  expressions: ExpressionNode[],
): GraphNodeOption[] {
  const classOpts = classes.map((c) => ({
    id: c.id,
    label: c.label,
    kind: 'namedClass' as const,
  }))
  const exprOpts = expressions.map((e) => ({
    id: e.id,
    label: getExpressionKindLabel(e.expressionKind),
    kind: 'expression' as const,
  }))
  return [...classOpts, ...exprOpts].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  )
}

export function nodeKindById(
  id: string,
  classes: NamedClassNode[],
  expressions: ExpressionNode[],
): OntologyNodeKind | null {
  if (classes.some((c) => c.id === id)) return 'namedClass'
  if (expressions.some((e) => e.id === id)) return 'expression'
  return null
}

/** Anchor class for class-tab connection UI (the selected class). */
export function getStatementAnchorNodeId(edge: OntologyEdge, classId: string): string {
  if (edge.sourceId === classId || edge.targetId === classId) return classId
  return edge.sourceId
}

export function getStatementOtherNodeId(edge: OntologyEdge, anchorId: string): string {
  return edge.sourceId === anchorId ? edge.targetId : edge.sourceId
}

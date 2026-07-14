import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3'

export interface OntologyClass {
  id: string
  label: string
  x?: number
  y?: number
}

export interface OntologyEdge {
  id: string
  sourceId: string
  targetId: string
  label: string
  bidirectional?: boolean
  /** 0 = forward directed, 1 = reversed directed, 2 = bidirectional */
  directionPhase?: 0 | 1 | 2
  lineStyle?: 'solid' | 'dashed'
}

export type EdgeLineStyle = 'solid' | 'dashed'

export function getEdgeLineStyle(edge: Pick<OntologyEdge, 'lineStyle'>): EdgeLineStyle {
  return edge.lineStyle ?? 'solid'
}

/** OWL-style datatype property on a class (range shown as a datatype node on canvas). */
export interface OntologyDataProperty {
  id: string
  classId: string
  label: string
  datatype: string
}

export function isSelfEdge(edge: Pick<OntologyEdge, 'sourceId' | 'targetId'>) {
  return edge.sourceId === edge.targetId
}

export function cycleEdgeDirection(edge: OntologyEdge): OntologyEdge {
  const phase = getEdgeDirectionPhase(edge)

  if (isSelfEdge(edge)) {
    if (phase === 0) return { ...edge, directionPhase: 1, bidirectional: false }
    if (phase === 1) return { ...edge, directionPhase: 2, bidirectional: true }
    return { ...edge, directionPhase: 0, bidirectional: false }
  }

  if (phase === 0) {
    return {
      ...edge,
      sourceId: edge.targetId,
      targetId: edge.sourceId,
      directionPhase: 1,
      bidirectional: false,
    }
  }
  if (phase === 1) {
    return {
      ...edge,
      sourceId: edge.targetId,
      targetId: edge.sourceId,
      bidirectional: true,
      directionPhase: 2,
    }
  }
  return {
    ...edge,
    bidirectional: false,
    directionPhase: 0,
  }
}

export function getEdgeDirectionPhase(edge: OntologyEdge): 0 | 1 | 2 {
  if (edge.bidirectional) return 2
  return edge.directionPhase ?? 0
}

export function getDraftEdgeArrow(phase: 0 | 1 | 2) {
  return phase === 2 ? '↔' : phase === 1 ? '←' : '→'
}

export function cycleDraftEdgePhase(phase: 0 | 1 | 2): 0 | 1 | 2 {
  return ((phase + 1) % 3) as 0 | 1 | 2
}

export function getEdgeOtherClassId(edge: OntologyEdge, classId: string) {
  if (edge.sourceId === classId && edge.targetId === classId) return classId
  return edge.sourceId === classId ? edge.targetId : edge.sourceId
}

/** Fixed left node in connection UI (matches object-tab anchor semantics). */
export function getEdgeAnchorClassId(edge: OntologyEdge) {
  const phase = getEdgeDirectionPhase(edge)
  if (phase === 1) return edge.targetId
  return edge.sourceId
}

/** Map fixed left=classId, right=otherId UI to stored edge endpoints. */
export function edgeEndpointsForClassContext(
  classId: string,
  otherId: string,
  phase: 0 | 1 | 2,
): Pick<OntologyEdge, 'sourceId' | 'targetId' | 'bidirectional' | 'directionPhase'> {
  if (phase === 1) {
    return {
      sourceId: otherId,
      targetId: classId,
      bidirectional: false,
      directionPhase: 1,
    }
  }
  if (phase === 2) {
    return {
      sourceId: classId,
      targetId: otherId,
      bidirectional: true,
      directionPhase: 2,
    }
  }
  return {
    sourceId: classId,
    targetId: otherId,
    bidirectional: false,
    directionPhase: 0,
  }
}

export function getEdgeArrowForClassContext(edge: OntologyEdge, classId: string) {
  const phase = getEdgeDirectionPhase(edge)
  if (phase === 2) return '↔'
  const otherId = getEdgeOtherClassId(edge, classId)
  if (edge.sourceId === classId && edge.targetId === otherId) return '→'
  if (edge.sourceId === otherId && edge.targetId === classId) return '←'
  return getDraftEdgeArrow(phase)
}

/** Stable left/right labels with arrow glyph for sidebar display. */
export function getEdgeDisplayState(edge: OntologyEdge) {
  const phase = getEdgeDirectionPhase(edge)
  if (isSelfEdge(edge)) {
    return {
      leftId: edge.sourceId,
      rightId: edge.targetId,
      arrow: phase === 2 ? '↔' : phase === 1 ? '←' : '→',
      phase,
    }
  }
  const leftId = phase === 1 ? edge.targetId : edge.sourceId
  const rightId = phase === 1 ? edge.sourceId : edge.targetId
  const arrow = phase === 2 ? '↔' : phase === 1 ? '←' : '→'
  return { leftId, rightId, arrow, phase }
}

export type SelectionKind = 'class' | 'edge'

export interface Selection {
  kind: SelectionKind
  id: string
}

export type DataPropertyField = 'label' | 'datatype'

export interface EditingDataProperty {
  id: string
  field: DataPropertyField
}

export interface SimClass extends OntologyClass, SimulationNodeDatum {}

export interface SimLoopAnchor extends SimulationNodeDatum {
  id: string
  edgeId: string
  parentId: string
  kind: 'loop-anchor'
}

export interface SimLabelAnchor extends SimulationNodeDatum {
  id: string
  edgeId: string
  kind: 'label-anchor'
}

export interface SimLoopLink extends SimulationLinkDatum<SimClass | SimLoopAnchor> {
  id: string
  edgeId: string
}

export interface SimLabelAnchorLink extends SimulationLinkDatum<SimClass | SimLabelAnchor> {
  id: string
  edgeId: string
}

export interface SimLink extends SimulationLinkDatum<SimClass> {
  id: string
  label: string
  sourceId: string
  targetId: string
  bidirectional?: boolean
  directionPhase?: 0 | 1 | 2
  lineStyle?: 'solid' | 'dashed'
  _siblingIndex?: number
  _siblingCount?: number
  _anchorX?: number
  _anchorY?: number
}

export interface SimDataProperty extends SimulationNodeDatum {
  id: string
  propertyId: string
  classId: string
  kind: 'data-property'
  label: string
  datatype: string
  _boxWidth?: number
  /** Position of name label along class→type segment (0 = class, 1 = type). */
  _labelT?: number
  /** Extra link length when crowded — pushes types outward from class. */
  _outwardPush?: number
}

export interface SimDataPropertyLink extends SimulationLinkDatum<SimClass | SimDataProperty> {
  id: string
  propertyId: string
}

export type SimNode = SimClass | SimLoopAnchor | SimLabelAnchor | SimDataProperty

export function isLoopAnchor(node: SimNode): node is SimLoopAnchor {
  return 'kind' in node && node.kind === 'loop-anchor'
}

export function isLabelAnchor(node: SimNode): node is SimLabelAnchor {
  return 'kind' in node && node.kind === 'label-anchor'
}

export function isDataPropertyNode(node: SimNode): node is SimDataProperty {
  return 'kind' in node && node.kind === 'data-property'
}

export const CLASS_COLOR = '#5b8cff'
export const CLASS_RADIUS = 50
export const LINK_DISTANCE = 295
export const DATA_PROPERTY_COLOR = '#d4b84a'
export const DATA_PROPERTY_MIN_WIDTH = 56
export const DATA_PROPERTY_MAX_WIDTH = 108
export const DATA_PROPERTY_LABEL_MIN_WIDTH = 52
export const DATA_PROPERTY_LABEL_MAX_WIDTH = 140
/** @deprecated alias */
export const DATA_PROPERTY_WIDTH = DATA_PROPERTY_MIN_WIDTH
export const DATA_PROPERTY_HEIGHT = 28
/** Class center → datatype center; ~90% of inter-class surface gap. */
export const DATA_PROPERTY_DISTANCE =
  CLASS_RADIUS + (LINK_DISTANCE - CLASS_RADIUS * 2) * 0.9 + DATA_PROPERTY_MIN_WIDTH / 2
export const DATA_PROPERTY_LINK_STRENGTH = 0.52
export const DATA_PROPERTY_AVOID_STRENGTH = 0.88
export const DATA_PROPERTY_AVOID_RANGE = 96
export const DATA_PROPERTY_OUTWARD_BIAS = 1.55
export const DATA_PROPERTY_MAX_OUTWARD_PUSH = 72
export const DATA_PROPERTY_LABEL_GAP = 12
export const DEFAULT_DATATYPE = 'string'

export function shortDatatype(datatype: string): string {
  const t = datatype.trim()
  if (!t) return DEFAULT_DATATYPE
  const colon = t.lastIndexOf(':')
  return colon >= 0 ? t.slice(colon + 1) : t
}
export const PARALLEL_STEP = 92
export const LOOP_LABEL_DISTANCE = 78
export const LOOP_ANCHOR_DISTANCE = CLASS_RADIUS + 4 + LOOP_LABEL_DISTANCE
export const LOOP_LINK_STRENGTH = 0.42
export const LOOP_EDGE_AVOID_STRENGTH = 0.62
export const LOOP_EDGE_AVOID_RANGE = LOOP_ANCHOR_DISTANCE * 2.6
export const LABEL_ANCHOR_LINK_STRENGTH = 0.24
export const LABEL_ANCHOR_RESTORE_STRENGTH = 0.34

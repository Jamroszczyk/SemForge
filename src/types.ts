import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3'

export type OntologyNodeKind = 'namedClass' | 'expression'

export interface OntologyNodeBase {
  id: string
  kind: OntologyNodeKind
  x?: number
  y?: number
}

/** OWL named class — label, IRI, and class-level metadata. */
export interface NamedClassNode extends OntologyNodeBase {
  kind: 'namedClass'
  label: string
  /** Optional short tag shown on the canvas below the class name. */
  tag: string
  iri: string
  comment: string
  /** When true, the class is shown greyed out on the canvas. */
  expired: boolean
  /** Canvas fill color for this class node. */
  color: string
}

/**
 * OWL anonymous class expression node.
 */
export type ExpressionKind =
  | 'ObjectIntersectionOf'
  | 'ObjectUnionOf'
  | 'ObjectComplementOf'
  | 'ObjectSomeValuesFrom'
  | 'ObjectAllValuesFrom'
  | 'ObjectHasValue'
  | 'ObjectHasSelf'
  | 'ObjectMinCardinality'
  | 'ObjectMaxCardinality'
  | 'ObjectExactCardinality'
  | 'ObjectOneOf'

export interface ExpressionNode extends OntologyNodeBase {
  kind: 'expression'
  expressionKind: ExpressionKind
}

export type OntologyNode = NamedClassNode | ExpressionNode

export function isNamedClassNode(node: OntologyNode): node is NamedClassNode {
  return node.kind === 'namedClass'
}

export function isExpressionNode(node: OntologyNode): node is ExpressionNode {
  return node.kind === 'expression'
}

/** Half-width of the expression diamond square (before 45° rotation). */
export const EXPRESSION_HALF = 36

export const EXPRESSION_CORNER_RADIUS = 7

/** OWL semantic statement kind — rendering is derived from this, not dash/arrow UI. */
export type StatementKind =
  | 'ObjectProperty'
  | 'subClassOf'
  | 'equivalentClass'
  | 'disjointWith'
  | 'OperandConnection'

export interface OntologyEdge {
  id: string
  sourceId: string
  targetId: string
  label: string
  statementKind: StatementKind
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

export function getEdgeOtherClassId(edge: OntologyEdge, classId: string) {
  if (edge.sourceId === classId && edge.targetId === classId) return classId
  return edge.sourceId === classId ? edge.targetId : edge.sourceId
}

export type SelectionKind = 'class' | 'edge' | 'expression'

export interface Selection {
  kind: SelectionKind
  id: string
}

export type DataPropertyField = 'label' | 'datatype'

export interface EditingDataProperty {
  id: string
  field: DataPropertyField
}

export interface SimClass extends NamedClassNode, SimulationNodeDatum {}

export interface SimExpression extends ExpressionNode, SimulationNodeDatum {}

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

export interface SimLink extends SimulationLinkDatum<SimClass | SimExpression> {
  id: string
  label: string
  sourceId: string
  targetId: string
  statementKind: StatementKind
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

export type SimNode = SimClass | SimExpression | SimLoopAnchor | SimLabelAnchor | SimDataProperty

export function isSimExpression(node: SimNode): node is SimExpression {
  return node.kind === 'expression'
}

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
export const CLASS_EXPIRED_COLOR = '#8a93a8'
export const CLASS_RADIUS = 50

/** Uniform scale for force-layout spacing (link length, repulsion, collision, etc.). */
export const CANVAS_LAYOUT_SCALE = 1.3

/** Center-to-center distance for two standard class nodes (legacy reference). */
export const LINK_DISTANCE = Math.round(295 * CANVAS_LAYOUT_SCALE)
/** Visible gap between statement endpoint outlines (WebVOWL classDistance pattern). */
export const STATEMENT_LINK_SURFACE_GAP = LINK_DISTANCE - 2 * (CLASS_RADIUS + 4)
/** WebVOWL linkStrength default is 1. */
export const LINK_STRENGTH = 1
/** WebVOWL gravity — gentle pull toward layout center (hub settling). */
export const GRAPH_GRAVITY_STRENGTH = 0.025
/** Straighten degree-2 chain nodes toward 180° (sunbeam / stretch-out paths). */
export const STATEMENT_STRAIGHTEN_STRENGTH = 1.35
/** Leaf nodes continue outward along the sunbeam (centroid → parent → leaf). */
export const LEAF_RADIAL_STRENGTH = 0.85
/** @deprecated alias */
export const LEAF_CHAIN_EXTEND_STRENGTH = LEAF_RADIAL_STRENGTH
/** Extra outward push when links are shorter than their target distance. */
export const LINK_COMPRESSION_RESTORE_STRENGTH = 0.85
/** WebVOWL has no collision; we use light collide because label nodes aren't in the sim yet. */
export const COLLIDE_STRENGTH = 0.42
/** Spread neighbors angularly around high-degree hubs (sunbeam spokes). */
export const HUB_SPOKE_ANGULAR_STRENGTH = 0.92
export const HUB_SPOKE_RADIAL_STRENGTH = 1.08
/** Push nodes off chords between neighbor pairs to reduce clumping. */
export const WEDGE_EXTERIOR_STRENGTH = 1.15
export const WEDGE_EXTERIOR_RANGE = Math.round(CLASS_RADIUS * 2.8)
/** Repel endpoints when edge segments cross. */
export const EDGE_CROSSING_AVOID_STRENGTH = 1.4
/** Keep node centers away from unrelated edge segments. */
export const NODE_EDGE_AVOID_STRENGTH = 1.35
export const NODE_EDGE_AVOID_RANGE = CLASS_RADIUS + 34
/** Unclump: base radial pull for leaf nodes (degree 1). */
export const UNCLUMP_PULL_SCALE = 0.52
export const UNCLUMP_MIN_PULL = Math.round(140 * CANVAS_LAYOUT_SCALE)
export const UNCLUMP_VELOCITY_SCALE = 0.16
/** One visible ease from start → resolved layout. */
export const UNCLUMP_ANIMATION_MS = 420
/** Hidden geometry + sim passes (≈ several button clicks). */
export const UNCLUMP_RESOLVE_PASSES = 5
export const UNCLUMP_SIM_TICKS_PER_PASS = 36
/** Extra ticks with the max-gravity hub pinned (same effect as click-and-hold). */
export const UNCLUMP_HUB_HOLD_TICKS = 160
/** Matches class/expression drag start: keeps the sim warm while the hub is fixed. */
export const UNCLUMP_HUB_HOLD_ALPHA_TARGET = 0.3
/** Visible post-unclump settle: brief kick, then cool to a stop. */
export const UNCLUMP_SETTLE_MS = 380
/** After drag release: keep the sim warm long enough for leaves/chains to finish stretching. */
export const DRAG_SETTLE_MS = 800
export const DRAG_SETTLE_ALPHA = 0.95
/** Match click/hold warmth (drag start uses 0.3) so spokes finish aligning. */
export const DRAG_SETTLE_ALPHA_TARGET = 0.3
/** After warm settle: cool with hub still pinned until alpha drops below this, then unpin. */
export const DRAG_SETTLE_UNPIN_ALPHA = 0.04
export const DATA_PROPERTY_COLOR = '#d4b84a'
export const DATA_PROPERTY_MIN_WIDTH = 56
export const DATA_PROPERTY_MAX_WIDTH = 108
export const DATA_PROPERTY_LABEL_MIN_WIDTH = 52
export const DATA_PROPERTY_LABEL_MAX_WIDTH = 140
/** @deprecated alias */
export const DATA_PROPERTY_WIDTH = DATA_PROPERTY_MIN_WIDTH
export const DATA_PROPERTY_HEIGHT = 28
/** Visible gap between class outline and datatype box (WebVOWL datatypeDistance pattern). */
export const DATA_PROPERTY_SURFACE_GAP = (LINK_DISTANCE - CLASS_RADIUS * 2) * 0.9
/** Class center → datatype center for default-width datatype nodes. */
export const DATA_PROPERTY_DISTANCE =
  DATA_PROPERTY_SURFACE_GAP + CLASS_RADIUS + DATA_PROPERTY_MIN_WIDTH / 2
export const DATA_PROPERTY_LINK_STRENGTH = 0.72
export const DATA_PROPERTY_AVOID_STRENGTH = 0.88
export const DATA_PROPERTY_AVOID_RANGE = Math.round(96 * CANVAS_LAYOUT_SCALE)
export const DATA_PROPERTY_OUTWARD_BIAS = 1.55
export const DATA_PROPERTY_MAX_OUTWARD_PUSH = Math.round(72 * CANVAS_LAYOUT_SCALE)
export const DATA_PROPERTY_LABEL_GAP = Math.round(12 * CANVAS_LAYOUT_SCALE)
export const DEFAULT_DATATYPE = 'string'

export function shortDatatype(datatype: string): string {
  const t = datatype.trim()
  if (!t) return DEFAULT_DATATYPE
  const colon = t.lastIndexOf(':')
  return colon >= 0 ? t.slice(colon + 1) : t
}
export const PARALLEL_STEP = Math.round(92 * CANVAS_LAYOUT_SCALE)
export const LOOP_LABEL_DISTANCE = Math.round(78 * CANVAS_LAYOUT_SCALE)
export const LOOP_ANCHOR_DISTANCE = CLASS_RADIUS + 4 + LOOP_LABEL_DISTANCE
export const LOOP_LINK_STRENGTH = 0.68
export const LOOP_EDGE_AVOID_STRENGTH = 0.62
export const LOOP_EDGE_AVOID_RANGE = LOOP_ANCHOR_DISTANCE * 2.6
export const LABEL_ANCHOR_LINK_STRENGTH = 0.24
export const LABEL_ANCHOR_RESTORE_STRENGTH = 0.34

export const NODE_COLLIDE_PADDING = Math.round(22 * CANVAS_LAYOUT_SCALE)
export const EXPRESSION_COLLIDE_PADDING = Math.round(16 * CANVAS_LAYOUT_SCALE)
export const LOOP_COLLIDE_RADIUS = Math.round(24 * CANVAS_LAYOUT_SCALE)
export const LABEL_COLLIDE_RADIUS = Math.round(22 * CANVAS_LAYOUT_SCALE)
export const NODE_LINK_HAZARD_OFFSET = Math.round(36 * CANVAS_LAYOUT_SCALE)
/** WebVOWL default charge is -500. */
export const CHARGE_CLASS = Math.round(-500 * CANVAS_LAYOUT_SCALE)
/** Isolated (no edges) nodes: weak charge so the graph doesn't blast them away. */
export const ISOLATED_CHARGE_SCALE = 0.14
/** Soft reel-in when a free node drifts past the outer ring (never flings outward). */
export const ISOLATED_PARK_STRENGTH = 0.28
export const ISOLATED_PARK_MARGIN = Math.round(120 * CANVAS_LAYOUT_SCALE)
/** Dampen free-node drift while still inside the graph (stay near drop point). */
export const ISOLATED_INNER_DAMPING = 0.12
/** WebVOWL applies 0.8× charge to label nodes; expressions sit between class and label. */
export const CHARGE_EXPRESSION = Math.round(-400 * CANVAS_LAYOUT_SCALE)
export const CHARGE_DATA_PROPERTY = Math.round(-135 * CANVAS_LAYOUT_SCALE)
export const CHARGE_LABEL_ANCHOR = Math.round(-120 * CANVAS_LAYOUT_SCALE)
export const CHARGE_LOOP_ANCHOR = Math.round(-160 * CANVAS_LAYOUT_SCALE)

import type {
  OntologyEdge,
  SimClass,
  SimDataProperty,
  SimExpression,
  SimLabelAnchor,
  SimLabelAnchorLink,
  SimLink,
  SimDataPropertyLink,
  SimLoopAnchor,
  SimLoopLink,
  SimNode,
} from './types'
import {
  CLASS_RADIUS,
  DATA_PROPERTY_HEIGHT,
  DATA_PROPERTY_MIN_WIDTH,
  DATA_PROPERTY_SURFACE_GAP,
  EXPRESSION_HALF,
  LABEL_COLLIDE_RADIUS,
  LOOP_ANCHOR_DISTANCE,
  LOOP_COLLIDE_RADIUS,
  LOOP_LABEL_DISTANCE,
  NODE_LINK_HAZARD_OFFSET,
  PARALLEL_STEP,
  STATEMENT_LINK_SURFACE_GAP,
  STATEMENT_STRAIGHTEN_STRENGTH,
  LEAF_RADIAL_STRENGTH,
  GRAPH_GRAVITY_STRENGTH,
  CHARGE_CLASS,
  CHARGE_EXPRESSION,
  ISOLATED_CHARGE_SCALE,
  ISOLATED_INNER_DAMPING,
  ISOLATED_PARK_MARGIN,
  ISOLATED_PARK_STRENGTH,
  LINK_COMPRESSION_RESTORE_STRENGTH,
  HUB_SPOKE_ANGULAR_STRENGTH,
  HUB_SPOKE_RADIAL_STRENGTH,
  WEDGE_EXTERIOR_STRENGTH,
  WEDGE_EXTERIOR_RANGE,
  EDGE_CROSSING_AVOID_STRENGTH,
  NODE_EDGE_AVOID_STRENGTH,
  NODE_EDGE_AVOID_RANGE,
  LINK_DISTANCE,
  UNCLUMP_MIN_PULL,
  UNCLUMP_PULL_SCALE,
  UNCLUMP_VELOCITY_SCALE,
  isDataPropertyNode,
  isLabelAnchor,
  isLoopAnchor,
  isSimExpression,
} from './types'
import { getStatementKind, getStatementRenderSpec, type StatementMarker } from './statementUtils'

export interface LinkGeom {
  sx: number
  sy: number
  tx: number
  ty: number
  cx: number
  cy: number
  curved: boolean
  self?: boolean
  labelX?: number
  labelY?: number
}

const LOOP_MAX_SPAN = Math.PI / 3
const LOOP_ARROW_PULLBACK = 3
/** Gap between node outline and inner edge of SVG marker beyond refX. */
const MARKER_STROKE_GAP = 4
const EXPRESSION_MARKER_GAP = 2

type StatementEndpoint = SimClass | SimExpression

export function statementEndpointLayoutRadius(node: StatementEndpoint) {
  return node.kind === 'expression' ? EXPRESSION_HALF : CLASS_RADIUS + 4
}

function endpointRingHalf(node: StatementEndpoint) {
  return statementEndpointLayoutRadius(node)
}

export function dataPropertyLayoutRadius(node: SimDataProperty) {
  const hw = (node._boxWidth ?? DATA_PROPERTY_MIN_WIDTH) / 2
  const hh = DATA_PROPERTY_HEIGHT / 2
  return Math.max(hw, hh)
}

/** Center-to-center link distance following WebVOWL calculateLinkPartDistance (single segment). */
export function statementLinkDistance(link: SimLink) {
  if (isSelfLink(link)) return 0
  const source = link.source as StatementEndpoint
  const target = link.target as StatementEndpoint
  return (
    STATEMENT_LINK_SURFACE_GAP +
    statementEndpointLayoutRadius(source) +
    statementEndpointLayoutRadius(target)
  )
}

export function dataPropertyLinkDistance(link: SimDataPropertyLink) {
  const source = link.source as SimClass
  const target = link.target as SimDataProperty
  return (
    DATA_PROPERTY_SURFACE_GAP +
    statementEndpointLayoutRadius(source) +
    dataPropertyLayoutRadius(target) +
    (target._outwardPush ?? 0)
  )
}

export function loopAnchorLinkDistance(link: SimLoopLink) {
  const source = link.source as SimClass
  return statementEndpointLayoutRadius(source) + LOOP_LABEL_DISTANCE
}

/** Distance from expression center to boundary along an exit/entry ray (diamond corners need more). */
function expressionReachAlongAngle(half: number, angle: number) {
  const a = angle - Math.PI / 4
  return half / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)), 1e-6)
}

function endpointBoundaryReach(
  node: StatementEndpoint,
  peerX: number,
  peerY: number,
): number {
  const nx = node.x ?? 0
  const ny = node.y ?? 0
  const angle = Math.atan2(peerY - ny, peerX - nx)
  if (node.kind === 'expression') {
    return expressionReachAlongAngle(endpointRingHalf(node), angle)
  }
  return endpointRingHalf(node)
}

function markerInsetPadding(marker: StatementMarker | null, node: StatementEndpoint): number {
  if (!marker) return 2
  const gap = node.kind === 'expression' ? EXPRESSION_MARKER_GAP : MARKER_STROKE_GAP
  if (marker === 'diamond') return 6 + gap
  return 10 + gap
}

function endpointLinkInset(
  link: SimLink,
  node: StatementEndpoint,
  role: 'source' | 'target',
): number {
  const source = link.source as StatementEndpoint
  const target = link.target as StatementEndpoint
  const peer =
    role === 'source'
      ? { x: target.x ?? 0, y: target.y ?? 0 }
      : { x: source.x ?? 0, y: source.y ?? 0 }

  const reach = endpointBoundaryReach(node, peer.x, peer.y)
  const spec = getStatementRenderSpec(getStatementKind(link), source.kind, target.kind)
  const marker = role === 'source' ? spec.markerStart : spec.markerEnd
  return reach + markerInsetPadding(marker, node)
}

function loopMarkerPullback(link: SimLink, role: 'start' | 'end'): number {
  const source = link.source as StatementEndpoint
  const target = link.target as StatementEndpoint
  const spec = getStatementRenderSpec(getStatementKind(link), source.kind, target.kind)
  const marker = role === 'start' ? spec.markerStart : spec.markerEnd
  const node = role === 'start' ? (link.source as StatementEndpoint) : (link.target as StatementEndpoint)
  return marker ? markerInsetPadding(marker, node) + 4 : LOOP_ARROW_PULLBACK
}

export function isSelfLink(link: SimLink) {
  const s = typeof link.source === 'object' ? (link.source as StatementEndpoint).id : String(link.source)
  const t = typeof link.target === 'object' ? (link.target as StatementEndpoint).id : String(link.target)
  return s === t
}

export function isMultiEdge(link: SimLink) {
  return !isSelfLink(link) && (link._siblingCount ?? 1) > 1
}

export function isDraggableEdgeLabel(link: SimLink) {
  return isSelfLink(link) || isMultiEdge(link)
}

export interface ChordFrame {
  mx: number
  my: number
  nx: number
  ny: number
  len: number
}

export function naturalLinkControlPos(link: SimLink, allLinks?: SimLink[]) {
  const n = link._siblingCount || 1
  if (n <= 1) {
    const source = link.source as StatementEndpoint
    const target = link.target as StatementEndpoint
    return {
      x: ((source.x ?? 0) + (target.x ?? 0)) / 2,
      y: ((source.y ?? 0) + (target.y ?? 0)) / 2,
    }
  }
  const group = allLinks
    ? allLinks.filter((l) => parallelLinkGroupKey(l) === parallelLinkGroupKey(link))
    : [link]
  const frame = groupChordFrame(group)
  return dynamicLinkControlPos(link, link._siblingIndex ?? 0, frame)
}

export function parallelLinkGroupKey(link: SimLink) {
  const s = typeof link.source === 'object' ? link.source.id : String(link.source)
  const t = typeof link.target === 'object' ? link.target.id : String(link.target)
  return s === t ? `${s}>>${t}` : s < t ? `${s}||${t}` : `${t}||${s}`
}

/** Per-edge frame following source → target (used for rendering). */
export function linkChordFrame(link: SimLink): ChordFrame {
  const source = link.source as StatementEndpoint
  const target = link.target as StatementEndpoint
  const sx = source.x ?? 0
  const sy = source.y ?? 0
  const tx = target.x ?? 0
  const ty = target.y ?? 0
  const mx = (sx + tx) / 2
  const my = (sy + ty) / 2
  const dx = tx - sx
  const dy = ty - sy
  const len = Math.hypot(dx, dy) || 1
  return { mx, my, nx: -dy / len, ny: dx / len, len }
}

/** Shared frame for all edges between the same node pair (sibling layout). */
export function groupChordFrame(group: SimLink[]): ChordFrame {
  const ref = group.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]
  return linkChordFrame(ref)
}

export function dynamicLinkControlPos(link: SimLink, rank: number, frame?: ChordFrame) {
  const f = frame ?? linkChordFrame(link)
  const n = link._siblingCount ?? 1
  const offset = (rank - (n - 1) / 2) * PARALLEL_STEP
  return { x: f.mx + f.nx * offset, y: f.my + f.ny * offset }
}

export function computeDynamicSiblingRanks(
  links: SimLink[],
  labelAnchors: SimLabelAnchor[],
): Map<string, number> {
  const anchorByEdge = new Map(labelAnchors.map((a) => [a.edgeId, a]))
  const groups = new Map<string, SimLink[]>()

  for (const link of links) {
    if (!isMultiEdge(link)) continue
    const key = parallelLinkGroupKey(link)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(link)
  }

  const ranks = new Map<string, number>()
  groups.forEach((group) => {
    const frame = groupChordFrame(group)
    const sorted = group
      .map((link) => {
        const anchor = anchorByEdge.get(link.id)
        const ax = anchor?.x ?? frame.mx
        const ay = anchor?.y ?? frame.my
        const proj = (ax - frame.mx) * frame.nx + (ay - frame.my) * frame.ny
        return { link, proj }
      })
      .sort((a, b) =>
        a.proj !== b.proj ? a.proj - b.proj : a.link.id < b.link.id ? -1 : 1,
      )

    sorted.forEach((item, i) => ranks.set(item.link.id, i))
  })
  return ranks
}

export function targetLinkControlPos(
  link: SimLink,
  ranks: Map<string, number>,
  allLinks: SimLink[],
): { x: number; y: number } {
  if (!isMultiEdge(link)) return naturalLinkControlPos(link, allLinks)
  const group = allLinks.filter((l) => parallelLinkGroupKey(l) === parallelLinkGroupKey(link))
  const frame = groupChordFrame(group)
  const rank = ranks.get(link.id) ?? link._siblingIndex ?? 0
  return dynamicLinkControlPos(link, rank, frame)
}

function selfLoopCenterAngle(link: SimLink, x: number, y: number) {
  if (link._anchorX !== undefined && link._anchorY !== undefined) {
    return Math.atan2(link._anchorY - y, link._anchorX - x)
  }
  return -Math.PI / 2
}

function selfLoopGeom(link: SimLink): LinkGeom {
  const node = link.source as StatementEndpoint
  const x = node.x ?? 0
  const y = node.y ?? 0
  const ringR = endpointRingHalf(node)
  const n = link._siblingCount ?? 1
  const centerAngle = selfLoopCenterAngle(link, x, y)

  const fairShare = (2 * Math.PI) / n
  const loopSpan = Math.min(LOOP_MAX_SPAN, fairShare * 0.8)
  const startAngle = centerAngle - loopSpan / 2
  const endAngle = centerAngle + loopSpan / 2

  const sx = x + Math.cos(startAngle) * ringR
  const sy = y + Math.sin(startAngle) * ringR
  const tx = x + Math.cos(endAngle) * ringR
  const ty = y + Math.sin(endAngle) * ringR

  const labelX = link._anchorX ?? x + Math.cos(centerAngle) * (ringR + LOOP_LABEL_DISTANCE)
  const labelY = link._anchorY ?? y + Math.sin(centerAngle) * (ringR + LOOP_LABEL_DISTANCE)

  const cx = 2 * labelX - 0.5 * (sx + tx)
  const cy = 2 * labelY - 0.5 * (sy + ty)

  return { sx, sy, tx, ty, cx, cy, curved: true, self: true, labelX, labelY }
}

export function linkGeom(link: SimLink): LinkGeom {
  if (isSelfLink(link)) return selfLoopGeom(link)

  const source = link.source as StatementEndpoint
  const target = link.target as StatementEndpoint
  const sx = source.x ?? 0
  const sy = source.y ?? 0
  const tx = target.x ?? 0
  const ty = target.y ?? 0
  const n = link._siblingCount || 1

  if (n <= 1) {
    return { sx, sy, tx, ty, cx: (sx + tx) / 2, cy: (sy + ty) / 2, curved: false }
  }

  const control = naturalLinkControlPos(link)
  const cx = link._anchorX ?? control.x
  const cy = link._anchorY ?? control.y
  return { sx, sy, tx, ty, cx, cy, curved: true }
}

export function linkGeomTrimmed(link: SimLink): LinkGeom {
  const g = linkGeom(link)
  const source = link.source as StatementEndpoint
  const target = link.target as StatementEndpoint

  if (g.self) {
    const toEndX = g.tx - g.cx
    const toEndY = g.ty - g.cy
    const toEndLen = Math.sqrt(toEndX * toEndX + toEndY * toEndY) || 1
    const endPullback = loopMarkerPullback(link, 'end')
    const trimmed = {
      ...g,
      tx: g.tx - (toEndX / toEndLen) * endPullback,
      ty: g.ty - (toEndY / toEndLen) * endPullback,
    }

    const spec = getStatementRenderSpec(getStatementKind(link), source.kind, target.kind)
    if (!spec.markerStart) return trimmed

    const toStartX = g.sx - g.cx
    const toStartY = g.sy - g.cy
    const toStartLen = Math.sqrt(toStartX * toStartX + toStartY * toStartY) || 1
    const startPullback = loopMarkerPullback(link, 'start')
    return {
      ...trimmed,
      sx: g.sx - (toStartX / toStartLen) * startPullback,
      sy: g.sy - (toStartY / toStartLen) * startPullback,
    }
  }

  if (!g.curved) {
    const dx = g.tx - g.sx
    const dy = g.ty - g.sy
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const ex = dx / len
    const ey = dy / len
    const sourceInset = endpointLinkInset(link, source, 'source')
    const targetInset = endpointLinkInset(link, target, 'target')
    const si = Math.min(sourceInset, len / 2 - 0.5)
    const ti = Math.min(targetInset, len / 2 - 0.5)
    return {
      ...g,
      sx: g.sx + ex * si,
      sy: g.sy + ey * si,
      tx: g.tx - ex * ti,
      ty: g.ty - ey * ti,
    }
  }

  const toEndX = g.tx - g.cx
  const toEndY = g.ty - g.cy
  const toEndLen = Math.sqrt(toEndX * toEndX + toEndY * toEndY) || 1
  const ux = toEndX / toEndLen
  const uy = toEndY / toEndLen
  const fromStartX = g.cx - g.sx
  const fromStartY = g.cy - g.sy
  const fromStartLen = Math.sqrt(fromStartX * fromStartX + fromStartY * fromStartY) || 1
  const vx = fromStartX / fromStartLen
  const vy = fromStartY / fromStartLen
  const maxT = Math.min(endpointLinkInset(link, target, 'target'), toEndLen - 0.5)
  const maxS = Math.min(endpointLinkInset(link, source, 'source'), fromStartLen - 0.5)
  if (maxT <= 0 || maxS <= 0) return g
  return {
    ...g,
    sx: g.sx + vx * maxS,
    sy: g.sy + vy * maxS,
    tx: g.tx - ux * maxT,
    ty: g.ty - uy * maxT,
  }
}

export function linkPath(link: SimLink) {
  const g = linkGeomTrimmed(link)
  return g.curved
    ? `M${g.sx},${g.sy} Q${g.cx},${g.cy} ${g.tx},${g.ty}`
    : `M${g.sx},${g.sy}L${g.tx},${g.ty}`
}

export function naturalLinkLabelPos(link: SimLink) {
  const g = linkGeomTrimmed(link)
  if (!g.curved) return { x: (g.sx + g.tx) / 2, y: (g.sy + g.ty) / 2 }
  return {
    x: 0.25 * g.sx + 0.5 * g.cx + 0.25 * g.tx,
    y: 0.25 * g.sy + 0.5 * g.cy + 0.25 * g.ty,
  }
}

/** WebVOWL calculateIntersection — border point on segment from `from` toward `to`. */
function endpointBorderPointOnLine(
  from: StatementEndpoint,
  to: StatementEndpoint,
  additionalDistance = 0,
) {
  const fx = from.x ?? 0
  const fy = from.y ?? 0
  const tx = to.x ?? 0
  const ty = to.y ?? 0
  const dx = tx - fx
  const dy = ty - fy
  const len = Math.hypot(dx, dy)
  if (len === 0) return { x: tx, y: ty }
  const borderReach = endpointBoundaryReach(to, fx, fy) + additionalDistance
  const ratio = (len - borderReach) / len
  return { x: fx + dx * ratio, y: fy + dy * ratio }
}

/** WebVOWL single-layer label snap: midpoint between endpoint border intersections. */
function snappedSingleEdgeLabelPos(link: SimLink) {
  const source = link.source as StatementEndpoint
  const target = link.target as StatementEndpoint
  const nearTarget = endpointBorderPointOnLine(source, target)
  const nearSource = endpointBorderPointOnLine(target, source)
  return {
    x: (nearSource.x + nearTarget.x) / 2,
    y: (nearSource.y + nearTarget.y) / 2,
  }
}

export function linkLabelPos(link: SimLink) {
  if (isSelfLink(link)) {
    const g = linkGeomTrimmed(link)
    if (g.labelX !== undefined && g.labelY !== undefined) {
      return { x: g.labelX, y: g.labelY }
    }
  }

  if (isMultiEdge(link) && link._anchorX !== undefined && link._anchorY !== undefined) {
    return { x: link._anchorX, y: link._anchorY }
  }

  if (!isSelfLink(link) && !isMultiEdge(link)) {
    return snappedSingleEdgeLabelPos(link)
  }

  return naturalLinkLabelPos(link)
}

export function assignParallelOffsets(links: SimLink[]) {
  const groups = new Map<string, SimLink[]>()
  for (const link of links) {
    const key = parallelLinkGroupKey(link)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(link)
  }
  groups.forEach((group) => {
    group.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    group.forEach((link, i) => {
      link._siblingIndex = i
      link._siblingCount = group.length
    })
  })
}

export function syncLoopAnchors(
  edges: OntologyEdge[],
  classNodes: SimClass[],
  prev: SimLoopAnchor[],
): { anchors: SimLoopAnchor[]; loopLinks: SimLoopLink[] } {
  const prevByEdge = new Map(prev.map((a) => [a.edgeId, a]))
  const anchors: SimLoopAnchor[] = []
  const loopLinks: SimLoopLink[] = []

  for (const edge of edges) {
    if (edge.sourceId !== edge.targetId) continue
    const parent = classNodes.find((n) => n.id === edge.sourceId)
    if (!parent) continue

    let anchor = prevByEdge.get(edge.id)
    if (!anchor) {
      const px = parent.x ?? 0
      const py = parent.y ?? 0
      anchor = {
        id: `loop-anchor:${edge.id}`,
        edgeId: edge.id,
        parentId: edge.sourceId,
        kind: 'loop-anchor',
        x: px,
        y: py - LOOP_ANCHOR_DISTANCE,
        vx: 0,
        vy: 0,
      }
    }

    anchors.push(anchor)
    loopLinks.push({
      id: `loop-link:${edge.id}`,
      edgeId: edge.id,
      source: parent,
      target: anchor,
    })
  }

  return { anchors, loopLinks }
}

export function placeLoopAnchor(
  anchor: SimLoopAnchor,
  parent: SimClass,
  dropX: number,
  dropY: number,
) {
  const px = parent.x ?? 0
  const py = parent.y ?? 0
  const angle = Math.atan2(dropY - py, dropX - px)
  anchor.x = px + Math.cos(angle) * LOOP_ANCHOR_DISTANCE
  anchor.y = py + Math.sin(angle) * LOOP_ANCHOR_DISTANCE
  anchor.vx = 0
  anchor.vy = 0
}

export function flipLoopAnchorThroughParent(
  anchor: SimLoopAnchor,
  parent: SimClass,
) {
  const px = parent.x ?? 0
  const py = parent.y ?? 0
  anchor.x = 2 * px - (anchor.x ?? px)
  anchor.y = 2 * py - (anchor.y ?? py)
  anchor.vx = 0
  anchor.vy = 0
  anchor.fx = null
  anchor.fy = null
}

export function incidentEdgeHazards(
  link: SimLink,
  parent: SimClass,
  labelAnchorsByEdge: Map<string, SimLabelAnchor>,
): Array<{ x: number; y: number }> {
  const hazards: Array<{ x: number; y: number }> = []
  const source = link.source as SimClass
  const target = link.target as SimClass
  const other = source.id === parent.id ? target : source
  const px = parent.x ?? 0
  const py = parent.y ?? 0
  const ox = other.x ?? 0
  const oy = other.y ?? 0

  const dx = ox - px
  const dy = oy - py
  const len = Math.hypot(dx, dy) || 1
  hazards.push({
    x: px + (dx / len) * (CLASS_RADIUS + NODE_LINK_HAZARD_OFFSET),
    y: py + (dy / len) * (CLASS_RADIUS + NODE_LINK_HAZARD_OFFSET),
  })

  hazards.push(linkLabelPos(link))

  if (link._anchorX !== undefined && link._anchorY !== undefined) {
    hazards.push({ x: link._anchorX, y: link._anchorY })
  }

  const labelAnchor = labelAnchorsByEdge.get(link.id)
  if (labelAnchor) {
    hazards.push({ x: labelAnchor.x ?? 0, y: labelAnchor.y ?? 0 })
  }

  return hazards
}

function pushLoopAnchorTangent(
  anchor: SimLoopAnchor,
  parent: SimClass,
  dx: number,
  dy: number,
  scale: number,
) {
  const px = parent.x ?? 0
  const py = parent.y ?? 0
  const ax = anchor.x ?? 0
  const ay = anchor.y ?? 0
  const rx = ax - px
  const ry = ay - py
  const rlen = Math.hypot(rx, ry) || 1
  const tx = -ry / rlen
  const ty = rx / rlen
  const tang = dx * tx + dy * ty
  anchor.vx! += tx * tang * scale
  anchor.vy! += ty * tang * scale
}

function pushLoopAnchorAngular(
  anchor: SimLoopAnchor,
  parent: SimClass,
  amount: number,
) {
  const px = parent.x ?? 0
  const py = parent.y ?? 0
  const ax = anchor.x ?? 0
  const ay = anchor.y ?? 0
  const rx = ax - px
  const ry = ay - py
  const rlen = Math.hypot(rx, ry) || 1
  anchor.vx! += (-ry / rlen) * amount
  anchor.vy! += (rx / rlen) * amount
}

export function forceLoopEdgeAvoidance(
  getLinks: () => SimLink[],
  getLoopAnchors: () => SimLoopAnchor[],
  getNodes: () => SimClass[],
  getLabelAnchors: () => SimLabelAnchor[],
  strength: number,
  range: number,
) {
  function force(alpha: number) {
    const links = getLinks()
    const loopAnchors = getLoopAnchors()
    const nodes = getNodes()
    const labelAnchors = getLabelAnchors()
    const nodeById = new Map(nodes.map((n) => [n.id, n]))
    const labelByEdge = new Map(labelAnchors.map((a) => [a.edgeId, a]))

    for (const anchor of loopAnchors) {
      if (anchor.fx != null || anchor.fy != null) continue
      const parent = nodeById.get(anchor.parentId)
      if (!parent) continue
      const ax = anchor.x ?? 0
      const ay = anchor.y ?? 0

      let repX = 0
      let repY = 0

      for (const link of links) {
        if (isSelfLink(link)) continue
        const source = link.source as SimClass
        const target = link.target as SimClass
        if (source.id !== parent.id && target.id !== parent.id) continue

        for (const hazard of incidentEdgeHazards(link, parent, labelByEdge)) {
          const dx = ax - hazard.x
          const dy = ay - hazard.y
          const d2 = dx * dx + dy * dy
          if (d2 < 1 || d2 > range * range) continue
          const d = Math.sqrt(d2)
          const w = ((range - d) / range) ** 2 * strength * alpha
          repX += (dx / d) * w
          repY += (dy / d) * w
        }
      }

      pushLoopAnchorTangent(anchor, parent, repX, repY, 1)
      anchor.vx! += repX * 0.28
      anchor.vy! += repY * 0.28
    }

    const siblingsByParent = new Map<string, SimLoopAnchor[]>()
    for (const anchor of loopAnchors) {
      if (!siblingsByParent.has(anchor.parentId)) siblingsByParent.set(anchor.parentId, [])
      siblingsByParent.get(anchor.parentId)!.push(anchor)
    }

    siblingsByParent.forEach((siblings) => {
      if (siblings.length < 2) return
      const parent = nodeById.get(siblings[0].parentId)
      if (!parent) return
      const px = parent.x ?? 0
      const py = parent.y ?? 0
      const minAngle = ((2 * Math.PI) / siblings.length) * 0.58

      for (let i = 0; i < siblings.length; i++) {
        for (let j = i + 1; j < siblings.length; j++) {
          const a = siblings[i]
          const b = siblings[j]
          if (a.fx != null || a.fy != null || b.fx != null || b.fy != null) continue

          const ai = Math.atan2((a.y ?? 0) - py, (a.x ?? 0) - px)
          const aj = Math.atan2((b.y ?? 0) - py, (b.x ?? 0) - px)
          let dAngle = aj - ai
          while (dAngle > Math.PI) dAngle -= 2 * Math.PI
          while (dAngle < -Math.PI) dAngle += 2 * Math.PI
          if (Math.abs(dAngle) >= minAngle) continue

          const push = (minAngle - Math.abs(dAngle)) * 0.42 * alpha
          const sign = dAngle >= 0 ? 1 : -1
          pushLoopAnchorAngular(a, parent, -sign * push)
          pushLoopAnchorAngular(b, parent, sign * push)
        }
      }
    })
  }

  force.initialize = () => {}

  return force
}

function isStatementEndpoint(node: unknown): node is StatementEndpoint {
  if (!node || typeof node !== 'object' || !('id' in node)) return false
  const kind = (node as { kind?: string }).kind
  return kind !== 'loop-anchor' && kind !== 'label-anchor' && kind !== 'data-property'
}

/** Count statement edges incident on a class or expression node. */
export function countStatementDegree(nodeId: string, links: SimLink[]) {
  let degree = 0
  for (const link of links) {
    if (isSelfLink(link)) continue
    const source = link.source as { id?: string }
    const target = link.target as { id?: string }
    if (source.id === nodeId || target.id === nodeId) degree++
  }
  return degree
}

/**
 * WebVOWL applies uniform gravity, but its split-link topology keeps leaves on spokes.
 * With direct class links we only pull high-degree hubs toward center — leaves stay at zero.
 */
export function gravityStrengthForSimNode(node: SimNode, links: SimLink[]) {
  if (isLoopAnchor(node) || isLabelAnchor(node)) return GRAPH_GRAVITY_STRENGTH * 0.35
  if (isDataPropertyNode(node)) return GRAPH_GRAVITY_STRENGTH * 0.15
  if (isSimExpression(node) || (node as { kind?: string }).kind === 'namedClass') {
    const degree = countStatementDegree(node.id, links)
    if (degree <= 1) return 0
    if (degree === 2) return GRAPH_GRAVITY_STRENGTH * 0.12
    return GRAPH_GRAVITY_STRENGTH * Math.min(1, 0.35 + degree * 0.07)
  }
  return GRAPH_GRAVITY_STRENGTH
}

/** Charge for statement nodes; isolated nodes get a weak charge so they don't fly off. */
export function chargeStrengthForSimNode(node: SimNode, links: SimLink[]) {
  if (isLoopAnchor(node) || isLabelAnchor(node) || isDataPropertyNode(node)) {
    return null
  }
  const base = isSimExpression(node) ? CHARGE_EXPRESSION : CHARGE_CLASS
  if (countStatementDegree(node.id, links) === 0) return base * ISOLATED_CHARGE_SCALE
  return base
}

/**
 * Free (degree-0) nodes: stay near where the user dropped them inside the graph.
 * Only gently reel back if charge blasts them past an outer ring — never fling outward.
 */
export function forceIsolatedNodePark(
  getStatementNodes: () => StatementEndpoint[],
  getLinks: () => SimLink[],
  strength = ISOLATED_PARK_STRENGTH,
  margin = ISOLATED_PARK_MARGIN,
  innerDamping = ISOLATED_INNER_DAMPING,
) {
  function force(alpha: number) {
    const links = getLinks()
    const nodes = getStatementNodes()
    const connected: StatementEndpoint[] = []
    const isolated: StatementEndpoint[] = []

    for (const node of nodes) {
      if (countStatementDegree(node.id, links) === 0) isolated.push(node)
      else connected.push(node)
    }
    if (isolated.length === 0) return

    let cx = 0
    let cy = 0
    let parkR = LINK_DISTANCE * 1.4

    if (connected.length > 0) {
      for (const node of connected) {
        cx += node.x ?? 0
        cy += node.y ?? 0
      }
      cx /= connected.length
      cy /= connected.length
      let maxR = 0
      for (const node of connected) {
        maxR = Math.max(maxR, Math.hypot((node.x ?? 0) - cx, (node.y ?? 0) - cy))
      }
      // Generous outer leash — only for nodes that flew away, not a target to seek.
      parkR = Math.max(maxR + margin * 1.6, LINK_DISTANCE * 1.4)
    }

    for (const node of isolated) {
      if (node.fx != null || node.fy != null) continue
      const x = node.x ?? 0
      const y = node.y ?? 0
      let dx = x - cx
      let dy = y - cy
      let dist = Math.hypot(dx, dy)

      if (dist <= parkR) {
        // Inside the working area: damp drift, do not pull toward the ring.
        const damp = 1 - innerDamping * alpha
        node.vx! *= damp
        node.vy! *= damp
        continue
      }

      if (dist < 1e-3) continue
      const tx = cx + (dx / dist) * parkR
      const ty = cy + (dy / dist) * parkR
      const overshoot = (dist - parkR) / Math.max(parkR, 1)
      const pull = strength * Math.min(overshoot, 1.2)
      node.vx! += (tx - x) * pull * alpha
      node.vy! += (ty - y) * pull * alpha
    }
  }

  force.initialize = () => {}
  return force
}

function fallbackLinkDirection(a: StatementEndpoint, b: StatementEndpoint) {
  const seed = a.id <= b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  const angle = ((hash & 0xffff) / 0xffff) * Math.PI * 2
  return { x: Math.cos(angle), y: Math.sin(angle) }
}

/**
 * WebVOWL-style network stretch: restore compressed links and straighten chains.
 * Degree-2 middles open toward 180°; leaves continue outward along their parent's chain.
 */
export function forceNetworkStretch(
  getLinks: () => SimLink[],
  straightenStrength = STATEMENT_STRAIGHTEN_STRENGTH,
  compressionStrength = LINK_COMPRESSION_RESTORE_STRENGTH,
  leafExtendStrength = LEAF_RADIAL_STRENGTH,
) {
  function force(alpha: number) {
    const links = getLinks()
    const adjacency = new Map<string, StatementEndpoint[]>()
    const nodeById = new Map<string, StatementEndpoint>()

    for (const link of links) {
      if (isSelfLink(link)) continue
      const source = link.source
      const target = link.target
      if (!isStatementEndpoint(source) || !isStatementEndpoint(target)) continue

      nodeById.set(source.id, source)
      nodeById.set(target.id, target)

      if (!adjacency.has(source.id)) adjacency.set(source.id, [])
      if (!adjacency.has(target.id)) adjacency.set(target.id, [])
      const sourceNeighbors = adjacency.get(source.id)!
      const targetNeighbors = adjacency.get(target.id)!
      if (!sourceNeighbors.some((n) => n.id === target.id)) sourceNeighbors.push(target)
      if (!targetNeighbors.some((n) => n.id === source.id)) targetNeighbors.push(source)

      if (source.fx != null && source.fy != null && target.fx != null && target.fy != null) continue

      const sx = source.x ?? 0
      const sy = source.y ?? 0
      const tx = target.x ?? 0
      const ty = target.y ?? 0
      const dx = tx - sx
      const dy = ty - sy
      const dist = Math.hypot(dx, dy)
      const targetDist = statementLinkDistance(link)
      if (dist >= targetDist * 0.98) continue

      const dir =
        dist > 1e-3
          ? { x: dx / dist, y: dy / dist }
          : fallbackLinkDirection(source, target)
      const deficit = targetDist - dist
      const push = (deficit / targetDist) * compressionStrength * alpha

      if (source.fx == null && source.fy == null) {
        source.vx! -= dir.x * push * 0.5
        source.vy! -= dir.y * push * 0.5
      }
      if (target.fx == null && target.fy == null) {
        target.vx! += dir.x * push * 0.5
        target.vy! += dir.y * push * 0.5
      }
    }

    let centroidX = 0
    let centroidY = 0
    let centroidCount = 0
    nodeById.forEach((node) => {
      centroidX += node.x ?? 0
      centroidY += node.y ?? 0
      centroidCount++
    })
    if (centroidCount > 0) {
      centroidX /= centroidCount
      centroidY /= centroidCount
    }

    adjacency.forEach((neighbors, nodeId) => {
      const node = nodeById.get(nodeId)
      if (!node || node.fx != null || node.fy != null) return

      // Degree-2: open the bend toward 180°. ua+ub points into the acute side —
      // push OPPOSITE so Software–Models–Source flattens into a line.
      if (neighbors.length === 2) {
        const [a, b] = neighbors
        const nx = node.x ?? 0
        const ny = node.y ?? 0
        const ax = (a.x ?? 0) - nx
        const ay = (a.y ?? 0) - ny
        const bx = (b.x ?? 0) - nx
        const by = (b.y ?? 0) - ny
        const la = Math.hypot(ax, ay) || 1
        const lb = Math.hypot(bx, by) || 1
        const uax = ax / la
        const uay = ay / la
        const ubx = bx / lb
        const uby = by / lb
        const sx = uax + ubx
        const sy = uay + uby
        const mag = Math.hypot(sx, sy)
        if (mag < 0.04) return

        const scale = straightenStrength * alpha * mag
        node.vx! -= (sx / mag) * scale
        node.vy! -= (sy / mag) * scale

        // Light assist on endpoints so the whole chain can open.
        if (a.fx == null && a.fy == null) {
          a.vx! += uax * scale * 0.22
          a.vy! += uay * scale * 0.22
        }
        if (b.fx == null && b.fy == null) {
          b.vx! += ubx * scale * 0.22
          b.vy! += uby * scale * 0.22
        }
        return
      }

      // Leaves: push outward along this node's own spoke when it drifted inward.
      if (neighbors.length !== 1 || leafExtendStrength <= 0) return
      const parent = neighbors[0]
      const px = parent.x ?? 0
      const py = parent.y ?? 0
      const lx = node.x ?? 0
      const ly = node.y ?? 0

      const spokeDx = lx - px
      const spokeDy = ly - py
      const spokeLen = Math.hypot(spokeDx, spokeDy)
      if (spokeLen < 1e-3) return
      const rayX = spokeDx / spokeLen
      const rayY = spokeDy / spokeLen

      const leafDistFromCenter = Math.hypot(lx - centroidX, ly - centroidY)
      const parentDistFromCenter = Math.hypot(px - centroidX, py - centroidY)
      if (leafDistFromCenter >= parentDistFromCenter * 1.04) return

      const scale = leafExtendStrength * alpha * 0.65
      node.vx! += rayX * scale
      node.vy! += rayY * scale
    })
  }

  force.initialize = () => {}

  return force
}

interface SpokeNeighbor {
  node: StatementEndpoint
  link: SimLink
}

function buildStatementAdjacency(links: SimLink[]) {
  const adjacency = new Map<string, SpokeNeighbor[]>()
  const nodeById = new Map<string, StatementEndpoint>()

  for (const link of links) {
    if (isSelfLink(link)) continue
    const source = link.source
    const target = link.target
    if (!isStatementEndpoint(source) || !isStatementEndpoint(target)) continue

    nodeById.set(source.id, source)
    nodeById.set(target.id, target)

    if (!adjacency.has(source.id)) adjacency.set(source.id, [])
    if (!adjacency.has(target.id)) adjacency.set(target.id, [])
    const sourceNeighbors = adjacency.get(source.id)!
    const targetNeighbors = adjacency.get(target.id)!
    if (!sourceNeighbors.some((entry) => entry.node.id === target.id)) {
      sourceNeighbors.push({ node: target, link })
    }
    if (!targetNeighbors.some((entry) => entry.node.id === source.id)) {
      targetNeighbors.push({ node: source, link })
    }
  }

  return { adjacency, nodeById }
}

function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-6) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

interface StatementEdgeSegment {
  ax: number
  ay: number
  bx: number
  by: number
  sourceId: string
  targetId: string
}

function collectStatementEdgeSegments(links: SimLink[]): StatementEdgeSegment[] {
  const segments: StatementEdgeSegment[] = []
  for (const link of links) {
    if (isSelfLink(link)) continue
    const source = link.source
    const target = link.target
    if (!isStatementEndpoint(source) || !isStatementEndpoint(target)) continue
    segments.push({
      ax: source.x ?? 0,
      ay: source.y ?? 0,
      bx: target.x ?? 0,
      by: target.y ?? 0,
      sourceId: source.id,
      targetId: target.id,
    })
  }
  return segments
}

function nodeEdgeOverlapPenalty(
  x: number,
  y: number,
  nodeId: string,
  segments: StatementEdgeSegment[],
  range: number,
) {
  let penalty = 0
  for (const seg of segments) {
    if (seg.sourceId === nodeId || seg.targetId === nodeId) continue
    const d = pointToSegmentDistance(x, y, seg.ax, seg.ay, seg.bx, seg.by)
    if (d < range) penalty += 1 - d / range
  }
  return penalty
}

function pushNodeOffEdgeSegment(
  node: StatementEndpoint,
  seg: StatementEdgeSegment,
  range: number,
  strength: number,
  alpha: number,
) {
  if (node.fx != null || node.fy != null) return
  const nx = node.x ?? 0
  const ny = node.y ?? 0
  const dx = seg.bx - seg.ax
  const dy = seg.by - seg.ay
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-6) return
  let t = ((nx - seg.ax) * dx + (ny - seg.ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = seg.ax + t * dx
  const cy = seg.ay + t * dy
  const dist = Math.hypot(nx - cx, ny - cy)
  if (dist >= range) return

  let awayX = nx - cx
  let awayY = ny - cy
  const awayLen = Math.hypot(awayX, awayY)
  if (awayLen > 1e-3) {
    awayX /= awayLen
    awayY /= awayLen
  } else {
    awayX = -dy / Math.hypot(dx, dy)
    awayY = dx / Math.hypot(dx, dy)
  }

  const push = (1 - dist / range) * strength * alpha
  node.vx! += awayX * push
  node.vy! += awayY * push
}

function findClearestSpokePosition(
  node: StatementEndpoint,
  hub: StatementEndpoint,
  link: SimLink,
  hubNeighbors: SpokeNeighbor[],
  segments: StatementEdgeSegment[],
  minRadius?: number,
) {
  const hx = hub.x ?? 0
  const hy = hub.y ?? 0
  const nx = node.x ?? 0
  const ny = node.y ?? 0
  const linkDist = statementLinkDistance(link)
  const currentDistFromHub = Math.hypot(nx - hx, ny - hy)
  const radius = Math.max(minRadius ?? linkDist, linkDist, currentDistFromHub)

  const occupiedAngles = hubNeighbors
    .filter((entry) => entry.node.id !== node.id)
    .map((entry) => Math.atan2((entry.node.y ?? 0) - hy, (entry.node.x ?? 0) - hx))

  let bestScore = -Infinity
  let bestX = nx
  let bestY = ny
  const steps = 64

  for (let i = 0; i < steps; i++) {
    const angle = (2 * Math.PI * i) / steps
    const cx = hx + Math.cos(angle) * radius
    const cy = hy + Math.sin(angle) * radius

    let minAngleSep = Math.PI
    for (const occupied of occupiedAngles) {
      let delta = Math.abs(angle - occupied)
      if (delta > Math.PI) delta = 2 * Math.PI - delta
      minAngleSep = Math.min(minAngleSep, delta)
    }

    let minEdgeDist = Infinity
    for (const seg of segments) {
      if (seg.sourceId === node.id || seg.targetId === node.id) continue
      minEdgeDist = Math.min(
        minEdgeDist,
        pointToSegmentDistance(cx, cy, seg.ax, seg.ay, seg.bx, seg.by),
      )
    }

    const score = minEdgeDist * 3.4 + minAngleSep * radius * 1.15
    if (score > bestScore) {
      bestScore = score
      bestX = cx
      bestY = cy
    }
  }

  return { x: bestX, y: bestY }
}

function pushNeighborRadial(
  neighbor: StatementEndpoint,
  hub: StatementEndpoint,
  amount: number,
) {
  if (neighbor.fx != null || neighbor.fy != null) return
  const hx = hub.x ?? 0
  const hy = hub.y ?? 0
  const nx = neighbor.x ?? 0
  const ny = neighbor.y ?? 0
  const dx = nx - hx
  const dy = ny - hy
  const len = Math.hypot(dx, dy) || 1
  neighbor.vx! += (dx / len) * amount
  neighbor.vy! += (dy / len) * amount
}

function pushNeighborAngular(
  neighbor: StatementEndpoint,
  hub: StatementEndpoint,
  amount: number,
) {
  if (neighbor.fx != null || neighbor.fy != null) return
  const hx = hub.x ?? 0
  const hy = hub.y ?? 0
  const nx = neighbor.x ?? 0
  const ny = neighbor.y ?? 0
  const rx = nx - hx
  const ry = ny - hy
  const len = Math.hypot(rx, ry) || 1
  neighbor.vx! += (-ry / len) * amount
  neighbor.vy! += (rx / len) * amount
}

function segmentInteriorIntersection(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): { x: number; y: number } | null {
  const denom = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx)
  if (Math.abs(denom) < 1e-9) return null
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denom
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / denom
  if (t <= 0.04 || t >= 0.96 || u <= 0.04 || u >= 0.96) return null
  return { x: ax + t * (bx - ax), y: ay + t * (by - ay) }
}

function pushEndpointFromCrossing(
  node: StatementEndpoint,
  other: StatementEndpoint,
  crossing: { x: number; y: number },
  weight: number,
  strength: number,
  alpha: number,
) {
  if (node.fx != null || node.fy != null) return
  const nx = node.x ?? 0
  const ny = node.y ?? 0
  const ox = other.x ?? 0
  const oy = other.y ?? 0
  const ex = ox - nx
  const ey = oy - ny
  const elen = Math.hypot(ex, ey) || 1
  const perpX = -ey / elen
  const perpY = ex / elen
  const toCrossX = crossing.x - nx
  const toCrossY = crossing.y - ny
  const sign = perpX * toCrossX + perpY * toCrossY > 0 ? -1 : 1
  const push = strength * weight * alpha
  node.vx! += perpX * sign * push
  node.vy! += perpY * sign * push
}

/**
 * Spread hub neighbors into sunbeam spokes (angular + radial decompression).
 * WebVOWL gets this from charge on split-link label nodes; we apply it at hubs directly.
 */
export function forceHubSpokeSpread(
  getLinks: () => SimLink[],
  angularStrength = HUB_SPOKE_ANGULAR_STRENGTH,
  radialStrength = HUB_SPOKE_RADIAL_STRENGTH,
) {
  function force(alpha: number) {
    const links = getLinks()
    const { adjacency, nodeById } = buildStatementAdjacency(links)

    adjacency.forEach((neighbors, hubId) => {
      if (neighbors.length < 2) return
      const hub = nodeById.get(hubId)
      if (!hub || hub.fx != null || hub.fy != null) return

      const minAngle = Math.max(Math.PI / 5, ((2 * Math.PI) / neighbors.length) * 0.68)

      for (const { node: neighbor, link } of neighbors) {
        const hx = hub.x ?? 0
        const hy = hub.y ?? 0
        const nx = neighbor.x ?? 0
        const ny = neighbor.y ?? 0
        const dist = Math.hypot(nx - hx, ny - hy)
        const targetDist = statementLinkDistance(link)
        if (dist > 1e-3 && dist < targetDist * 0.96) {
          const push = ((targetDist - dist) / targetDist) * radialStrength * alpha * 0.55
          pushNeighborRadial(neighbor, hub, push)
        }
      }

      for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
          const a = neighbors[i].node
          const b = neighbors[j].node
          if (a.fx != null || a.fy != null || b.fx != null || b.fy != null) continue

          const hx = hub.x ?? 0
          const hy = hub.y ?? 0
          const ai = Math.atan2((a.y ?? 0) - hy, (a.x ?? 0) - hx)
          const aj = Math.atan2((b.y ?? 0) - hy, (b.x ?? 0) - hx)
          let dAngle = aj - ai
          while (dAngle > Math.PI) dAngle -= 2 * Math.PI
          while (dAngle < -Math.PI) dAngle += 2 * Math.PI
          if (Math.abs(dAngle) >= minAngle) continue

          const push = (minAngle - Math.abs(dAngle)) * angularStrength * alpha * 0.48
          const sign = dAngle >= 0 ? 1 : -1
          pushNeighborAngular(a, hub, -sign * push)
          pushNeighborAngular(b, hub, sign * push)
          pushNeighborRadial(a, hub, push * 0.42)
          pushNeighborRadial(b, hub, push * 0.42)
        }
      }
    })
  }

  force.initialize = () => {}

  return force
}

/**
 * Unwrap clumped layouts: hub spoke spreading, wedge escape, and edge-crossing repulsion.
 */
export function forceGraphUnwrap(
  getLinks: () => SimLink[],
  angularStrength = HUB_SPOKE_ANGULAR_STRENGTH,
  radialStrength = HUB_SPOKE_RADIAL_STRENGTH,
  wedgeStrength = WEDGE_EXTERIOR_STRENGTH,
  wedgeRange = WEDGE_EXTERIOR_RANGE,
  crossingStrength = EDGE_CROSSING_AVOID_STRENGTH,
) {
  function force(alpha: number) {
    const links = getLinks()
    const { adjacency, nodeById } = buildStatementAdjacency(links)

    adjacency.forEach((neighbors, hubId) => {
      if (neighbors.length < 2) return
      const hub = nodeById.get(hubId)
      if (!hub || hub.fx != null || hub.fy != null) return

      const minAngle = Math.max(Math.PI / 5, ((2 * Math.PI) / neighbors.length) * 0.68)

      for (const { node: neighbor, link } of neighbors) {
        const hx = hub.x ?? 0
        const hy = hub.y ?? 0
        const nx = neighbor.x ?? 0
        const ny = neighbor.y ?? 0
        const dx = nx - hx
        const dy = ny - hy
        const dist = Math.hypot(dx, dy)
        const targetDist = statementLinkDistance(link)
        if (dist > 1e-3 && dist < targetDist * 0.96) {
          const push = ((targetDist - dist) / targetDist) * radialStrength * alpha * 0.55
          pushNeighborRadial(neighbor, hub, push)
        }
      }

      for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
          const a = neighbors[i].node
          const b = neighbors[j].node
          if (a.fx != null || a.fy != null || b.fx != null || b.fy != null) continue

          const hx = hub.x ?? 0
          const hy = hub.y ?? 0
          const ai = Math.atan2((a.y ?? 0) - hy, (a.x ?? 0) - hx)
          const aj = Math.atan2((b.y ?? 0) - hy, (b.x ?? 0) - hx)
          let dAngle = aj - ai
          while (dAngle > Math.PI) dAngle -= 2 * Math.PI
          while (dAngle < -Math.PI) dAngle += 2 * Math.PI
          if (Math.abs(dAngle) >= minAngle) continue

          const push = (minAngle - Math.abs(dAngle)) * angularStrength * alpha * 0.48
          const sign = dAngle >= 0 ? 1 : -1
          pushNeighborAngular(a, hub, -sign * push)
          pushNeighborAngular(b, hub, sign * push)
          pushNeighborRadial(a, hub, push * 0.42)
          pushNeighborRadial(b, hub, push * 0.42)
        }
      }
    })

    nodeById.forEach((node, nodeId) => {
      const neighbors = adjacency.get(nodeId)
      if (!neighbors || neighbors.length < 2 || node.fx != null || node.fy != null) return

      const nx = node.x ?? 0
      const ny = node.y ?? 0

      for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
          const a = neighbors[i].node
          const b = neighbors[j].node
          const ax = a.x ?? 0
          const ay = a.y ?? 0
          const bx = b.x ?? 0
          const by = b.y ?? 0
          const dist = pointToSegmentDistance(nx, ny, ax, ay, bx, by)
          if (dist >= wedgeRange) continue

          const dx = bx - ax
          const dy = by - ay
          const len2 = dx * dx + dy * dy
          if (len2 < 1e-6) continue
          let t = ((nx - ax) * dx + (ny - ay) * dy) / len2
          if (t <= 0.08 || t >= 0.92) continue

          const cx = ax + t * dx
          const cy = ay + t * dy
          const awayX = nx - cx
          const awayY = ny - cy
          const awayLen = Math.hypot(awayX, awayY)
          const pushDirX = awayLen > 1e-3 ? awayX / awayLen : -dy / Math.hypot(dx, dy)
          const pushDirY = awayLen > 1e-3 ? awayY / awayLen : dx / Math.hypot(dx, dy)
          const push = (1 - dist / wedgeRange) * wedgeStrength * alpha
          node.vx! += pushDirX * push
          node.vy! += pushDirY * push
        }
      }
    })

    const segments = collectStatementEdgeSegments(links)

    for (const node of nodeById.values()) {
      for (const seg of segments) {
        if (seg.sourceId === node.id || seg.targetId === node.id) continue
        pushNodeOffEdgeSegment(node, seg, NODE_EDGE_AVOID_RANGE, NODE_EDGE_AVOID_STRENGTH, alpha)
      }
    }

    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const s1 = segments[i]
        const s2 = segments[j]
        const shared =
          s1.sourceId === s2.sourceId ||
          s1.sourceId === s2.targetId ||
          s1.targetId === s2.sourceId ||
          s1.targetId === s2.targetId
        if (shared) continue

        const crossing = segmentInteriorIntersection(
          s1.ax,
          s1.ay,
          s1.bx,
          s1.by,
          s2.ax,
          s2.ay,
          s2.bx,
          s2.by,
        )
        if (!crossing) continue

        const d1 = adjacency.get(s1.sourceId)?.length ?? 1
        const d2 = adjacency.get(s1.targetId)?.length ?? 1
        const d3 = adjacency.get(s2.sourceId)?.length ?? 1
        const d4 = adjacency.get(s2.targetId)?.length ?? 1
        const w1 = 1 / Math.max(d1, 1)
        const w2 = 1 / Math.max(d2, 1)
        const w3 = 1 / Math.max(d3, 1)
        const w4 = 1 / Math.max(d4, 1)

        const source1 = nodeById.get(s1.sourceId)
        const target1 = nodeById.get(s1.targetId)
        const source2 = nodeById.get(s2.sourceId)
        const target2 = nodeById.get(s2.targetId)
        if (source1 && target1) {
          pushEndpointFromCrossing(source1, target1, crossing, w1, crossingStrength, alpha)
          pushEndpointFromCrossing(target1, source1, crossing, w2, crossingStrength, alpha)
        }
        if (source2 && target2) {
          pushEndpointFromCrossing(source2, target2, crossing, w3, crossingStrength, alpha)
          pushEndpointFromCrossing(target2, source2, crossing, w4, crossingStrength, alpha)
        }
      }
    }
  }

  force.initialize = () => {}

  return force
}

export function bindAnchorsToLinks(
  links: SimLink[],
  loopAnchors: SimLoopAnchor[],
  labelAnchors: SimLabelAnchor[],
) {
  const loopByEdge = new Map(loopAnchors.map((a) => [a.edgeId, a]))
  const labelByEdge = new Map(labelAnchors.map((a) => [a.edgeId, a]))
  for (const link of links) {
    if (isSelfLink(link)) {
      const anchor = loopByEdge.get(link.id)
      link._anchorX = anchor?.x
      link._anchorY = anchor?.y
      continue
    }
    const anchor = labelByEdge.get(link.id)
    if (anchor) {
      link._anchorX = anchor.x
      link._anchorY = anchor.y
    } else if (!isSelfLink(link)) {
      link._anchorX = undefined
      link._anchorY = undefined
    }
  }
}

export function bindLoopAnchorsToLinks(links: SimLink[], anchors: SimLoopAnchor[]) {
  bindAnchorsToLinks(links, anchors, [])
}

export function syncLabelAnchors(
  edges: OntologyEdge[],
  classNodes: SimClass[],
  links: SimLink[],
  prev: SimLabelAnchor[],
): { anchors: SimLabelAnchor[]; anchorLinks: SimLabelAnchorLink[] } {
  const prevByEdge = new Map(prev.map((a) => [a.edgeId, a]))
  const anchors: SimLabelAnchor[] = []
  const anchorLinks: SimLabelAnchorLink[] = []

  for (const edge of edges) {
    if (edge.sourceId === edge.targetId) continue
    const link = links.find((l) => l.id === edge.id)
    const source = classNodes.find((n) => n.id === edge.sourceId)
    const target = classNodes.find((n) => n.id === edge.targetId)
    if (!link || !source || !target) continue
    if ((link._siblingCount ?? 1) <= 1) continue

    let anchor = prevByEdge.get(edge.id)
    if (!anchor) {
      const pos = naturalLinkControlPos({ ...link, source, target }, links)
      anchor = {
        id: `label-anchor:${edge.id}`,
        edgeId: edge.id,
        kind: 'label-anchor',
        x: pos.x,
        y: pos.y,
        vx: 0,
        vy: 0,
      }
    }

    anchors.push(anchor)
    anchorLinks.push(
      {
        id: `label-link:${edge.id}:s`,
        edgeId: edge.id,
        source,
        target: anchor,
      },
      {
        id: `label-link:${edge.id}:t`,
        edgeId: edge.id,
        source: target,
        target: anchor,
      },
    )
  }

  return { anchors, anchorLinks }
}

export interface GraphLayoutBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const CLASS_LAYOUT_RADIUS = CLASS_RADIUS + 18
const EXPRESSION_LAYOUT_RADIUS = EXPRESSION_HALF + 18

function extendBounds(
  bounds: GraphLayoutBounds | null,
  x: number,
  y: number,
  radius: number,
): GraphLayoutBounds {
  const minX = x - radius
  const minY = y - radius
  const maxX = x + radius
  const maxY = y + radius
  if (!bounds) return { minX, minY, maxX, maxY }
  return {
    minX: Math.min(bounds.minX, minX),
    minY: Math.min(bounds.minY, minY),
    maxX: Math.max(bounds.maxX, maxX),
    maxY: Math.max(bounds.maxY, maxY),
  }
}

export function computeGraphLayoutBounds(input: {
  classes: SimClass[]
  expressions: SimExpression[]
  dataProperties: SimDataProperty[]
  labelAnchors: SimLabelAnchor[]
  loopAnchors: SimLoopAnchor[]
}): GraphLayoutBounds | null {
  let bounds: GraphLayoutBounds | null = null

  for (const node of input.classes) {
    bounds = extendBounds(bounds, node.x ?? 0, node.y ?? 0, CLASS_LAYOUT_RADIUS)
  }
  for (const node of input.expressions) {
    bounds = extendBounds(bounds, node.x ?? 0, node.y ?? 0, EXPRESSION_LAYOUT_RADIUS)
  }
  for (const node of input.dataProperties) {
    const hw = (node._boxWidth ?? DATA_PROPERTY_MIN_WIDTH) / 2 + 10
    const hh = DATA_PROPERTY_HEIGHT / 2 + 10
    bounds = extendBounds(bounds, node.x ?? 0, node.y ?? 0, Math.max(hw, hh))
  }
  for (const anchor of input.labelAnchors) {
    bounds = extendBounds(bounds, anchor.x ?? 0, anchor.y ?? 0, LABEL_COLLIDE_RADIUS + 8)
  }
  for (const anchor of input.loopAnchors) {
    bounds = extendBounds(bounds, anchor.x ?? 0, anchor.y ?? 0, LOOP_COLLIDE_RADIUS + 6)
  }

  return bounds
}

export function graphLayoutBoundsSize(bounds: GraphLayoutBounds) {
  return {
    width: Math.max(bounds.maxX - bounds.minX, 1),
    height: Math.max(bounds.maxY - bounds.minY, 1),
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerY: (bounds.minY + bounds.maxY) / 2,
  }
}

function radialDirectionFromCenter(
  nodeId: string,
  cx: number,
  cy: number,
  x: number,
  y: number,
) {
  const dx = x - cx
  const dy = y - cy
  const dist = Math.hypot(dx, dy)
  if (dist > 1e-3) return { x: dx / dist, y: dy / dist, dist }
  let hash = 0
  for (let i = 0; i < nodeId.length; i++) hash = (hash * 31 + nodeId.charCodeAt(i)) | 0
  const angle = ((hash & 0xffff) / 0xffff) * Math.PI * 2
  return { x: Math.cos(angle), y: Math.sin(angle), dist: 0 }
}

function unclumpPullFactor(degree: number, maxDegree: number) {
  if (maxDegree <= 1) return 1
  return (maxDegree - degree + 1) / maxDegree
}

function distanceFactorFromDist(dist: number, layoutSize: number) {
  return 1 / (1 + (dist / Math.max(layoutSize * 0.42, 1)) * 0.9)
}

export type UnclumpMobileNode =
  | SimClass
  | SimExpression
  | SimDataProperty
  | SimLoopAnchor
  | SimLabelAnchor

export interface UnclumpNodePlan {
  node: UnclumpMobileNode
  startX: number
  startY: number
  targetX: number
  targetY: number
  targetVx: number
  targetVy: number
}

interface UnclumpLayoutContext {
  cx: number
  cy: number
  layoutSize: number
  basePull: number
  degree: Map<string, number>
  maxDegree: number
  nodeById: Map<string, StatementEndpoint>
}

function buildUnclumpLayoutContext(input: {
  classes: SimClass[]
  expressions: SimExpression[]
  links: SimLink[]
  dataProperties?: SimDataProperty[]
  loopAnchors?: SimLoopAnchor[]
  labelAnchors?: SimLabelAnchor[]
}): UnclumpLayoutContext | null {
  const statementNodes: StatementEndpoint[] = [...input.classes, ...input.expressions]
  if (statementNodes.length === 0) return null

  const bounds = computeGraphLayoutBounds({
    classes: input.classes,
    expressions: input.expressions,
    dataProperties: input.dataProperties ?? [],
    labelAnchors: input.labelAnchors ?? [],
    loopAnchors: input.loopAnchors ?? [],
  })
  const layout = bounds
    ? graphLayoutBoundsSize(bounds)
    : { width: LINK_DISTANCE * 2, height: LINK_DISTANCE * 2, centerX: 0, centerY: 0 }

  const degree = new Map<string, number>()
  for (const link of input.links) {
    if (isSelfLink(link)) continue
    const source = link.source
    const target = link.target
    if (isStatementEndpoint(source)) {
      degree.set(source.id, (degree.get(source.id) ?? 0) + 1)
    }
    if (isStatementEndpoint(target)) {
      degree.set(target.id, (degree.get(target.id) ?? 0) + 1)
    }
  }

  return {
    cx: layout.centerX,
    cy: layout.centerY,
    layoutSize: Math.max(layout.width, layout.height, LINK_DISTANCE),
    basePull: Math.max(
      UNCLUMP_MIN_PULL,
      Math.max(layout.width, layout.height, LINK_DISTANCE) * UNCLUMP_PULL_SCALE,
    ),
    degree,
    maxDegree: Math.max(1, ...degree.values()),
    nodeById: new Map(statementNodes.map((node) => [node.id, node])),
  }
}

/** Compute radial unclump targets without mutating node positions. */
export function computeGraphUnclumpPlan(input: {
  classes: SimClass[]
  expressions: SimExpression[]
  links: SimLink[]
  dataProperties?: SimDataProperty[]
  loopAnchors?: SimLoopAnchor[]
  labelAnchors?: SimLabelAnchor[]
}): UnclumpNodePlan[] {
  const ctx = buildUnclumpLayoutContext(input)
  if (!ctx) return []

  const plans: UnclumpNodePlan[] = []
  const statementNodes: StatementEndpoint[] = [...input.classes, ...input.expressions]
  const { adjacency } = buildStatementAdjacency(input.links)
  const segments = collectStatementEdgeSegments(input.links)

  let globalHubId = ''
  let globalHubDegree = 0
  for (const [nodeId, deg] of ctx.degree.entries()) {
    if (deg > globalHubDegree) {
      globalHubDegree = deg
      globalHubId = nodeId
    }
  }

  for (const node of statementNodes) {
    const nx = node.x ?? 0
    const ny = node.y ?? 0
    const deg = ctx.degree.get(node.id) ?? 0
    const neighbors = adjacency.get(node.id) ?? []
    const overlap = nodeEdgeOverlapPenalty(nx, ny, node.id, segments, NODE_EDGE_AVOID_RANGE)
    const isGlobalHub = node.id === globalHubId && deg >= 3

    const dir = radialDirectionFromCenter(node.id, ctx.cx, ctx.cy, nx, ny)
    const gravityFactor = unclumpPullFactor(deg, ctx.maxDegree)
    const distanceFactor = distanceFactorFromDist(dir.dist, ctx.layoutSize)
    const hubPullScale = isGlobalHub ? 0.12 : 1
    const pull = ctx.basePull * gravityFactor * distanceFactor * hubPullScale

    let targetX = nx + dir.x * pull
    let targetY = ny + dir.y * pull
    let targetVx = dir.x * pull * UNCLUMP_VELOCITY_SCALE
    let targetVy = dir.y * pull * UNCLUMP_VELOCITY_SCALE

    if (!isGlobalHub && overlap > 0.1 && neighbors.length > 0) {
      let primary = neighbors[0]
      for (const entry of neighbors) {
        const primaryDeg = ctx.degree.get(primary.node.id) ?? 0
        const entryDeg = ctx.degree.get(entry.node.id) ?? 0
        if (entryDeg > primaryDeg) primary = entry
      }

      const hub = primary.node
      const hx = hub.x ?? 0
      const hy = hub.y ?? 0
      const currentDistFromHub = Math.hypot(nx - hx, ny - hy)
      const linkDist = statementLinkDistance(primary.link)
      const hubNeighbors = adjacency.get(hub.id) ?? []
      const minRadius = Math.max(currentDistFromHub * 1.04, linkDist * 1.06, dir.dist + pull * 0.4)
      const spoke = findClearestSpokePosition(
        node,
        hub,
        primary.link,
        hubNeighbors,
        segments,
        minRadius,
      )

      const spokeOverlap = nodeEdgeOverlapPenalty(
        spoke.x,
        spoke.y,
        node.id,
        segments,
        NODE_EDGE_AVOID_RANGE,
      )
      const spokeDistFromCenter = Math.hypot(spoke.x - ctx.cx, spoke.y - ctx.cy)

      if (
        spokeOverlap < overlap * 0.9 &&
        spokeDistFromCenter >= dir.dist * 0.96
      ) {
        targetX = spoke.x
        targetY = spoke.y
        const moveX = targetX - nx
        const moveY = targetY - ny
        const moveLen = Math.hypot(moveX, moveY)
        if (moveLen > 1e-3) {
          targetVx = (moveX / moveLen) * Math.min(moveLen, ctx.basePull) * UNCLUMP_VELOCITY_SCALE
          targetVy = (moveY / moveLen) * Math.min(moveLen, ctx.basePull) * UNCLUMP_VELOCITY_SCALE
        }
      }
    }

    plans.push({
      node,
      startX: nx,
      startY: ny,
      targetX,
      targetY,
      targetVx,
      targetVy,
    })
  }

  for (const prop of input.dataProperties ?? []) {
    const parent = ctx.nodeById.get(prop.classId)
    if (!parent) continue
    const px = prop.x ?? parent.x ?? 0
    const py = prop.y ?? parent.y ?? 0
    const dir = radialDirectionFromCenter(prop.id, ctx.cx, ctx.cy, px, py)
    const parentDeg = ctx.degree.get(parent.id) ?? 1
    const gravityFactor = unclumpPullFactor(parentDeg, ctx.maxDegree) * 0.72
    const distanceFactor = distanceFactorFromDist(dir.dist, ctx.layoutSize)
    const pull = ctx.basePull * gravityFactor * distanceFactor * 0.55

    plans.push({
      node: prop,
      startX: px,
      startY: py,
      targetX: px + dir.x * pull,
      targetY: py + dir.y * pull,
      targetVx: dir.x * pull * UNCLUMP_VELOCITY_SCALE * 0.75,
      targetVy: dir.y * pull * UNCLUMP_VELOCITY_SCALE * 0.75,
    })
  }

  for (const anchor of input.loopAnchors ?? []) {
    const parent =
      ctx.nodeById.get(anchor.parentId) ?? input.classes.find((n) => n.id === anchor.parentId)
    if (!parent) continue
    const px = parent.x ?? 0
    const py = parent.y ?? 0
    const ax = anchor.x ?? 0
    const ay = anchor.y ?? 0
    let dx = ax - px
    let dy = ay - py
    const len = Math.hypot(dx, dy)
    if (len > 1e-3) {
      dx /= len
      dy /= len
    } else {
      dx = 0
      dy = -1
    }
    const parentDeg = ctx.degree.get(parent.id) ?? 1
    const extend = ctx.basePull * unclumpPullFactor(parentDeg, ctx.maxDegree) * 0.22

    plans.push({
      node: anchor,
      startX: ax,
      startY: ay,
      targetX: ax + dx * extend,
      targetY: ay + dy * extend,
      targetVx: dx * extend * UNCLUMP_VELOCITY_SCALE,
      targetVy: dy * extend * UNCLUMP_VELOCITY_SCALE,
    })
  }

  for (const anchor of input.labelAnchors ?? []) {
    const ax = anchor.x ?? 0
    const ay = anchor.y ?? 0
    const dir = radialDirectionFromCenter(anchor.id, ctx.cx, ctx.cy, ax, ay)
    const pull = ctx.basePull * 0.18 * distanceFactorFromDist(dir.dist, ctx.layoutSize)

    plans.push({
      node: anchor,
      startX: ax,
      startY: ay,
      targetX: ax + dir.x * pull,
      targetY: ay + dir.y * pull,
      targetVx: dir.x * pull * UNCLUMP_VELOCITY_SCALE * 0.6,
      targetVy: dir.y * pull * UNCLUMP_VELOCITY_SCALE * 0.6,
    })
  }

  return plans
}

export function applyGraphUnclumpProgress(plans: UnclumpNodePlan[], progress: number) {
  const t = Math.max(0, Math.min(1, progress))
  for (const plan of plans) {
    const x = plan.startX + (plan.targetX - plan.startX) * t
    const y = plan.startY + (plan.targetY - plan.startY) * t
    plan.node.x = x
    plan.node.y = y
    plan.node.vx = plan.targetVx * t
    plan.node.vy = plan.targetVy * t
    plan.node.fx = null
    plan.node.fy = null
  }
}

export function finalizeGraphUnclumpPlan(plans: UnclumpNodePlan[]) {
  applyGraphUnclumpProgress(plans, 1)
}

export interface UnclumpNodeSnapshot {
  node: UnclumpMobileNode
  x: number
  y: number
  vx: number
  vy: number
  fx: number | null | undefined
  fy: number | null | undefined
}

export function snapshotUnclumpPlans(plans: UnclumpNodePlan[]): UnclumpNodeSnapshot[] {
  return plans.map((plan) => ({
    node: plan.node,
    x: plan.startX,
    y: plan.startY,
    vx: plan.node.vx ?? 0,
    vy: plan.node.vy ?? 0,
    fx: plan.node.fx,
    fy: plan.node.fy,
  }))
}

export function restoreUnclumpSnapshot(snapshot: UnclumpNodeSnapshot[]) {
  for (const entry of snapshot) {
    entry.node.x = entry.x
    entry.node.y = entry.y
    entry.node.vx = entry.vx
    entry.node.vy = entry.vy
    entry.node.fx = entry.fx ?? null
    entry.node.fy = entry.fy ?? null
  }
}

/** Build a single animation plan after hidden resolve passes mutated node positions. */
export function buildUnclumpAnimationPlan(snapshot: UnclumpNodeSnapshot[]): UnclumpNodePlan[] {
  return snapshot.map((entry) => ({
    node: entry.node,
    startX: entry.x,
    startY: entry.y,
    targetX: entry.node.x ?? entry.x,
    targetY: entry.node.y ?? entry.y,
    targetVx: (entry.node.vx ?? 0) * UNCLUMP_VELOCITY_SCALE * 0.75,
    targetVy: (entry.node.vy ?? 0) * UNCLUMP_VELOCITY_SCALE * 0.75,
  }))
}

/** Apply one radial unclump pass at full strength. */
export function applyUnclumpPass(input: Parameters<typeof computeGraphUnclumpPlan>[0]) {
  applyGraphUnclumpProgress(computeGraphUnclumpPlan(input), 1)
}

/**
 * Radially pull nodes out of the graph centroid. Leaf nodes move most; hub nodes least.
 * Gives outward velocity so links can straighten as the simulation re-settles.
 */
export function applyGraphUnclumpImpulse(input: {
  classes: SimClass[]
  expressions: SimExpression[]
  links: SimLink[]
  dataProperties?: SimDataProperty[]
  loopAnchors?: SimLoopAnchor[]
  labelAnchors?: SimLabelAnchor[]
}) {
  finalizeGraphUnclumpPlan(computeGraphUnclumpPlan(input))
}

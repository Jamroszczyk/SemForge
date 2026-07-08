import type {
  OntologyEdge,
  SimClass,
  SimLabelAnchor,
  SimLabelAnchorLink,
  SimLink,
  SimLoopAnchor,
  SimLoopLink,
} from './types'
import { CLASS_RADIUS, LOOP_ANCHOR_DISTANCE, LOOP_LABEL_DISTANCE, PARALLEL_STEP } from './types'

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

const RING_R = CLASS_RADIUS + 4
const LOOP_MAX_SPAN = Math.PI / 3
const LOOP_ARROW_PULLBACK = 3

function entityInset(isTarget: boolean) {
  return RING_R + (isTarget ? 1 : 2)
}

export function isSelfLink(link: SimLink) {
  const s = typeof link.source === 'object' ? (link.source as SimClass).id : String(link.source)
  const t = typeof link.target === 'object' ? (link.target as SimClass).id : String(link.target)
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
    const source = link.source as SimClass
    const target = link.target as SimClass
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
  const source = link.source as SimClass
  const target = link.target as SimClass
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
  const node = link.source as SimClass
  const x = node.x ?? 0
  const y = node.y ?? 0
  const n = link._siblingCount ?? 1
  const centerAngle = selfLoopCenterAngle(link, x, y)

  const fairShare = (2 * Math.PI) / n
  const loopSpan = Math.min(LOOP_MAX_SPAN, fairShare * 0.8)
  const startAngle = centerAngle - loopSpan / 2
  const endAngle = centerAngle + loopSpan / 2

  const sx = x + Math.cos(startAngle) * RING_R
  const sy = y + Math.sin(startAngle) * RING_R
  const tx = x + Math.cos(endAngle) * RING_R
  const ty = y + Math.sin(endAngle) * RING_R

  const labelX = link._anchorX ?? x + Math.cos(centerAngle) * (RING_R + LOOP_LABEL_DISTANCE)
  const labelY = link._anchorY ?? y + Math.sin(centerAngle) * (RING_R + LOOP_LABEL_DISTANCE)

  const cx = 2 * labelX - 0.5 * (sx + tx)
  const cy = 2 * labelY - 0.5 * (sy + ty)

  return { sx, sy, tx, ty, cx, cy, curved: true, self: true, labelX, labelY }
}

export function linkGeom(link: SimLink): LinkGeom {
  if (isSelfLink(link)) return selfLoopGeom(link)

  const source = link.source as SimClass
  const target = link.target as SimClass
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
  if (g.self) {
    const toEndX = g.tx - g.cx
    const toEndY = g.ty - g.cy
    const toEndLen = Math.sqrt(toEndX * toEndX + toEndY * toEndY) || 1
    const trimmed = {
      ...g,
      tx: g.tx - (toEndX / toEndLen) * LOOP_ARROW_PULLBACK,
      ty: g.ty - (toEndY / toEndLen) * LOOP_ARROW_PULLBACK,
    }
    if (!link.bidirectional) return trimmed

    const toStartX = g.sx - g.cx
    const toStartY = g.sy - g.cy
    const toStartLen = Math.sqrt(toStartX * toStartX + toStartY * toStartY) || 1
    return {
      ...trimmed,
      sx: g.sx - (toStartX / toStartLen) * LOOP_ARROW_PULLBACK,
      sy: g.sy - (toStartY / toStartLen) * LOOP_ARROW_PULLBACK,
    }
  }

  if (!g.curved) {
    const dx = g.tx - g.sx
    const dy = g.ty - g.sy
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const ex = dx / len
    const ey = dy / len
    const sourceInset = link.bidirectional ? entityInset(true) : entityInset(false)
    const si = Math.min(sourceInset, len / 2 - 0.5)
    const ti = Math.min(entityInset(true), len / 2 - 0.5)
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
  const maxT = Math.min(entityInset(true), toEndLen - 0.5)
  const sourceInset = link.bidirectional ? entityInset(true) : entityInset(false)
  const maxS = Math.min(sourceInset, fromStartLen - 0.5)
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

export function linkLabelPos(link: SimLink) {
  const g = linkGeomTrimmed(link)
  if (g.self && g.labelX !== undefined && g.labelY !== undefined) {
    return { x: g.labelX, y: g.labelY }
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
    x: px + (dx / len) * (CLASS_RADIUS + 36),
    y: py + (dy / len) * (CLASS_RADIUS + 36),
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

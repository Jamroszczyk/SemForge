import type {
  OntologyDataProperty,
  SimClass,
  SimDataProperty,
  SimDataPropertyLink,
  SimLabelAnchor,
  SimLink,
  SimLoopAnchor,
} from './types'
import {
  CLASS_RADIUS,
  DATA_PROPERTY_AVOID_RANGE,
  DATA_PROPERTY_AVOID_STRENGTH,
  DATA_PROPERTY_DISTANCE,
  DATA_PROPERTY_HEIGHT,
  DATA_PROPERTY_LABEL_GAP,
  DATA_PROPERTY_LABEL_MAX_WIDTH,
  DATA_PROPERTY_LABEL_MIN_WIDTH,
  DATA_PROPERTY_MAX_OUTWARD_PUSH,
  DATA_PROPERTY_MAX_WIDTH,
  DATA_PROPERTY_MIN_WIDTH,
  DATA_PROPERTY_OUTWARD_BIAS,
  DEFAULT_DATATYPE,
  shortDatatype,
} from './types'
import { incidentEdgeHazards, isSelfLink, linkLabelPos, statementEndpointLayoutRadius } from './graphGeometry'

const TYPE_PAD_X = 14
const LABEL_PAD_X = 12
const LABEL_PAD_Y = 6
const TYPE_CHAR_W = 6.2
const LABEL_CHAR_W = 6
const LABEL_TEXT_H = 14

export function fitTextToBox(
  text: string,
  opts: { minWidth: number; maxWidth: number; padX: number; charWidth: number },
): { display: string; width: number } {
  const innerMax = opts.maxWidth - opts.padX * 2
  let display = text
  let inner = display.length * opts.charWidth

  if (inner > innerMax) {
    const ellipsis = '…'
    const ellipsisW = ellipsis.length * opts.charWidth
    const maxChars = Math.max(1, Math.floor((innerMax - ellipsisW) / opts.charWidth))
    display = `${text.slice(0, maxChars)}${ellipsis}`
    inner = innerMax
  }

  const width = Math.max(opts.minWidth, Math.min(opts.maxWidth, inner + opts.padX * 2))
  return { display, width }
}

export function dataPropertyTypeBoxSize(text: string, editing = false) {
  const raw = (editing ? text : shortDatatype(text)).trim() || DEFAULT_DATATYPE
  return fitTextToBox(raw, {
    minWidth: DATA_PROPERTY_MIN_WIDTH,
    maxWidth: DATA_PROPERTY_MAX_WIDTH,
    padX: TYPE_PAD_X,
    charWidth: TYPE_CHAR_W,
  })
}

export function dataPropertyLabelBoxSize(text: string) {
  return {
    ...fitTextToBox(text.trim() || 'Unnamed', {
      minWidth: DATA_PROPERTY_LABEL_MIN_WIDTH,
      maxWidth: DATA_PROPERTY_LABEL_MAX_WIDTH,
      padX: LABEL_PAD_X,
      charWidth: LABEL_CHAR_W,
    }),
    h: LABEL_TEXT_H + LABEL_PAD_Y * 2,
  }
}

function dataPropertyRectTrim(dx: number, dy: number, len: number, width: number) {
  const ux = Math.abs(dx / len)
  const uy = Math.abs(dy / len)
  const hw = width / 2
  const hh = DATA_PROPERTY_HEIGHT / 2
  if (ux < 1e-6) return hh
  if (uy < 1e-6) return hw
  return Math.min(hw / ux, hh / uy)
}

export function spawnDataPropertyPosition(parent: SimClass, index: number, total: number) {
  const px = parent.x ?? 0
  const py = parent.y ?? 0
  const spread = Math.min(0.72, 0.36 + total * 0.1)
  const angle = Math.PI / 2 + (index - (total - 1) / 2) * spread
  return {
    x: px + Math.cos(angle) * DATA_PROPERTY_DISTANCE,
    y: py + Math.sin(angle) * DATA_PROPERTY_DISTANCE,
  }
}

export function syncDataPropertyNodes(
  properties: OntologyDataProperty[],
  classNodes: SimClass[],
  prev: SimDataProperty[],
): { nodes: SimDataProperty[]; links: SimDataPropertyLink[] } {
  const byClass = new Map<string, OntologyDataProperty[]>()
  for (const prop of properties) {
    const list = byClass.get(prop.classId) ?? []
    list.push(prop)
    byClass.set(prop.classId, list)
  }

  const nodes: SimDataProperty[] = []
  const links: SimDataPropertyLink[] = []

  for (const [classId, props] of byClass) {
    const parent = classNodes.find((n) => n.id === classId)
    if (!parent) continue

    props.forEach((prop, index) => {
      const existing = prev.find((n) => n.propertyId === prop.id)
      let pos: { x: number; y: number }
      if (existing) {
        const px = parent.x ?? 0
        const py = parent.y ?? 0
        const ox = (existing.x ?? px) - px
        const oy = (existing.y ?? py) - py
        const dist = Math.hypot(ox, oy) || 1
        if (dist < DATA_PROPERTY_DISTANCE * 0.9) {
          const scale = DATA_PROPERTY_DISTANCE / dist
          pos = { x: px + ox * scale, y: py + oy * scale }
        } else {
          pos = { x: existing.x ?? px, y: existing.y ?? py }
        }
      } else {
        pos = spawnDataPropertyPosition(parent, index, props.length)
      }

      const { width } = dataPropertyTypeBoxSize(prop.datatype)

      const node: SimDataProperty = {
        id: `dp-${prop.id}`,
        propertyId: prop.id,
        classId,
        kind: 'data-property',
        label: prop.label,
        datatype: prop.datatype,
        _boxWidth: existing?._boxWidth ?? width,
        _labelT: existing?._labelT ?? 0.48,
        _outwardPush: existing?._outwardPush ?? 0,
        x: pos.x,
        y: pos.y,
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
        fx: existing?.fx,
        fy: existing?.fy,
      }
      nodes.push(node)
      links.push({
        id: `dp-link-${prop.id}`,
        propertyId: prop.id,
        source: parent,
        target: node,
      })
    })
  }

  return { nodes, links }
}

export function dataPropertyLinkPath(classNode: SimClass, prop: SimDataProperty) {
  const sx = classNode.x ?? 0
  const sy = classNode.y ?? 0
  const tx = prop.x ?? 0
  const ty = prop.y ?? 0
  const dx = tx - sx
  const dy = ty - sy
  const len = Math.hypot(dx, dy) || 1
  const boxWidth = prop._boxWidth ?? DATA_PROPERTY_MIN_WIDTH
  const trimS = CLASS_RADIUS + 6
  const trimT = Math.min(dataPropertyRectTrim(dx, dy, len, boxWidth), len - trimS - 4)
  return `M${sx + (dx / len) * trimS},${sy + (dy / len) * trimS}L${tx - (dx / len) * trimT},${ty - (dy / len) * trimT}`
}

function classBorderPointToward(classNode: SimClass, tx: number, ty: number, additionalDistance = 0) {
  const sx = classNode.x ?? 0
  const sy = classNode.y ?? 0
  const dx = tx - sx
  const dy = ty - sy
  const len = Math.hypot(dx, dy)
  if (len === 0) return { x: sx, y: sy }
  const borderReach = statementEndpointLayoutRadius(classNode) + additionalDistance
  const ratio = (len - borderReach) / len
  return { x: sx + dx * ratio, y: sy + dy * ratio }
}

function dataPropertyBorderPointToward(
  prop: SimDataProperty,
  fx: number,
  fy: number,
  additionalDistance = 0,
) {
  const px = prop.x ?? 0
  const py = prop.y ?? 0
  const dx = fx - px
  const dy = fy - py
  const len = Math.hypot(dx, dy)
  if (len === 0) return { x: px, y: py }
  const hw = (prop._boxWidth ?? DATA_PROPERTY_MIN_WIDTH) / 2
  const hh = DATA_PROPERTY_HEIGHT / 2
  const angle = Math.atan2(dy, dx)
  const borderReach =
    Math.min(
      hw / Math.max(Math.abs(Math.cos(angle)), 1e-6),
      hh / Math.max(Math.abs(Math.sin(angle)), 1e-6),
    ) + additionalDistance
  const ratio = (len - borderReach) / len
  return { x: px + dx * ratio, y: py + dy * ratio }
}

export function dataPropertyLinkLabelPos(classNode: SimClass, prop: SimDataProperty) {
  const sx = classNode.x ?? 0
  const sy = classNode.y ?? 0
  const tx = prop.x ?? 0
  const ty = prop.y ?? 0
  const nearClass = classBorderPointToward(classNode, tx, ty)
  const nearProp = dataPropertyBorderPointToward(prop, sx, sy)
  return {
    x: (nearClass.x + nearProp.x) / 2,
    y: (nearClass.y + nearProp.y) / 2,
  }
}

export function dataPropertyTypeNodeLayout(datatype: string, editing = false) {
  const { display, width } = dataPropertyTypeBoxSize(datatype, editing)
  return { display, width, height: DATA_PROPERTY_HEIGHT }
}

export function dataPropertyEdgeLabelLayout(label: string) {
  const { display, width, h } = dataPropertyLabelBoxSize(label)
  return { display, width, h }
}

function typeNodeRadius(prop: SimDataProperty) {
  const hw = (prop._boxWidth ?? DATA_PROPERTY_MIN_WIDTH) / 2
  return Math.max(hw, DATA_PROPERTY_HEIGHT / 2) + 8
}

function labelNodeRadius(label: string) {
  const { width, h } = dataPropertyLabelBoxSize(label)
  return Math.hypot(width / 2, h / 2) + 6
}

interface RectBox {
  cx: number
  cy: number
  hw: number
  hh: number
}

const EDGE_LABEL_PAD_X = 12
const EDGE_LABEL_PAD_Y = 7
const EDGE_LABEL_MIN_W = 58
const EDGE_LABEL_TEXT_H = 15

function edgeLabelBox(link: SimLink): RectBox {
  const pos = linkLabelPos(link)
  const text = link.label || 'Unnamed'
  const w = Math.max(text.length * 6.5 + EDGE_LABEL_PAD_X * 2, EDGE_LABEL_MIN_W)
  const h = EDGE_LABEL_TEXT_H + EDGE_LABEL_PAD_Y * 2
  return { cx: pos.x, cy: pos.y, hw: w / 2, hh: h / 2 }
}

function dataPropLabelBox(parent: SimClass, prop: SimDataProperty): RectBox {
  const pos = dataPropertyLinkLabelPos(parent, prop)
  const { width, h } = dataPropertyLabelBoxSize(prop.label)
  return { cx: pos.x, cy: pos.y, hw: width / 2, hh: h / 2 }
}

function dataPropTypeBox(prop: SimDataProperty): RectBox {
  const hw = (prop._boxWidth ?? DATA_PROPERTY_MIN_WIDTH) / 2
  const hh = DATA_PROPERTY_HEIGHT / 2
  return { cx: prop.x ?? 0, cy: prop.y ?? 0, hw, hh }
}

/** Separation vector to resolve AABB overlap; moves box A away from box B. */
function boxSeparation(a: RectBox, b: RectBox, gap: number): { x: number; y: number } | null {
  const overlapX = a.hw + b.hw + gap - Math.abs(a.cx - b.cx)
  const overlapY = a.hh + b.hh + gap - Math.abs(a.cy - b.cy)
  if (overlapX <= 0 || overlapY <= 0) return null

  if (overlapX < overlapY) {
    const sign = a.cx < b.cx ? -1 : 1
    return { x: sign * overlapX, y: 0 }
  }
  const sign = a.cy < b.cy ? -1 : 1
  return { x: 0, y: sign * overlapY }
}

function applyBoxSeparation(
  prop: SimDataProperty,
  parent: SimClass,
  sep: { x: number; y: number },
  alpha: number,
  hard = false,
) {
  const biased = applyOutwardBias(parent, prop, sep.x, sep.y)
  const scale = hard ? 3.2 : 2.4
  prop.vx! += biased.x * scale * Math.max(alpha, 0.08)
  prop.vy! += biased.y * scale * Math.max(alpha, 0.08)
  if (hard) {
    prop.x! += biased.x * 0.42
    prop.y! += biased.y * 0.42
  }
}

function repelPoint(
  ax: number,
  ay: number,
  ar: number,
  hx: number,
  hy: number,
  hr: number,
  range: number,
  strength: number,
  alpha: number,
) {
  const dx = ax - hx
  const dy = ay - hy
  const d = Math.hypot(dx, dy)
  const reach = ar + hr + range
  if (d < 0.5 || d >= reach) return { x: 0, y: 0 }
  const overlap = reach - d
  const w = (overlap / range) ** 2 * strength * alpha
  return { x: (dx / d) * w, y: (dy / d) * w }
}

function applyOutwardBias(
  parent: SimClass,
  node: SimDataProperty,
  fx: number,
  fy: number,
) {
  const px = parent.x ?? 0
  const py = parent.y ?? 0
  const nx = (node.x ?? px) - px
  const ny = (node.y ?? py) - py
  const rlen = Math.hypot(nx, ny) || 1
  const rx = nx / rlen
  const ry = ny / rlen
  const radial = fx * rx + fy * ry
  const tx = fx - radial * rx
  const ty = fy - radial * ry
  let radialOut = radial
  if (radial < 0) radialOut = radial * 0.12
  else radialOut = radial * DATA_PROPERTY_OUTWARD_BIAS
  return { x: tx + rx * radialOut, y: ty + ry * radialOut }
}

function pushDataPropAngular(prop: SimDataProperty, parent: SimClass, amount: number) {
  const px = parent.x ?? 0
  const py = parent.y ?? 0
  const rx = (prop.x ?? px) - px
  const ry = (prop.y ?? py) - py
  const rlen = Math.hypot(rx, ry) || 1
  prop.vx! += (-ry / rlen) * amount
  prop.vy! += (rx / rlen) * amount
}

function pushDataPropOutward(prop: SimDataProperty, parent: SimClass, amount: number) {
  const px = parent.x ?? 0
  const py = parent.y ?? 0
  const rx = (prop.x ?? px) - px
  const ry = (prop.y ?? py) - py
  const rlen = Math.hypot(rx, ry) || 1
  prop.vx! += (rx / rlen) * amount
  prop.vy! += (ry / rlen) * amount
}

export function forceDataPropertyAvoidance(
  getDataProps: () => SimDataProperty[],
  getClassNodes: () => SimClass[],
  getLinks: () => SimLink[],
  getLoopAnchors: () => SimLoopAnchor[],
  getLabelAnchors: () => SimLabelAnchor[],
  strength = DATA_PROPERTY_AVOID_STRENGTH,
  range = DATA_PROPERTY_AVOID_RANGE,
) {
  function force(alpha: number) {
    const dataProps = getDataProps()
    const classNodes = getClassNodes()
    const links = getLinks()
    const loopAnchors = getLoopAnchors()
    const labelAnchors = getLabelAnchors()
    const classById = new Map(classNodes.map((n) => [n.id, n]))
    const labelByEdge = new Map(labelAnchors.map((a) => [a.edgeId, a]))
    const loopByEdge = new Map(loopAnchors.map((a) => [a.edgeId, a]))

    const edgeLabelBoxes: RectBox[] =
      labelAnchors.length > 0 ? links.map((link) => edgeLabelBox(link)) : []

    const globalHazards: Array<{ x: number; y: number; r: number }> = []
    for (const link of links) {
      if (isSelfLink(link)) {
        const loop = loopByEdge.get(link.id)
        if (loop) globalHazards.push({ x: loop.x ?? 0, y: loop.y ?? 0, r: 30 })
      }
      const la = labelByEdge.get(link.id)
      if (la) globalHazards.push({ x: la.x ?? 0, y: la.y ?? 0, r: 26 })
    }

    const siblingsByClass = new Map<string, SimDataProperty[]>()
    for (const prop of dataProps) {
      if (!siblingsByClass.has(prop.classId)) siblingsByClass.set(prop.classId, [])
      siblingsByClass.get(prop.classId)!.push(prop)
    }

    for (const prop of dataProps) {
      if (prop.fx != null || prop.fy != null) continue
      const parent = classById.get(prop.classId)
      if (!parent) continue

      prop._outwardPush = Math.max(0, (prop._outwardPush ?? 0) * 0.94)
      let pressure = 0

      const px = prop.x ?? 0
      const py = prop.y ?? 0
      const typeR = typeNodeRadius(prop)
      let repX = 0
      let repY = 0

      for (const h of globalHazards) {
        const r = repelPoint(px, py, typeR, h.x, h.y, h.r, range, strength, alpha)
        repX += r.x
        repY += r.y
        if (r.x !== 0 || r.y !== 0) pressure += 0.35
      }

      for (const link of links) {
        const source = link.source as SimClass
        const target = link.target as SimClass
        if (source.id !== parent.id && target.id !== parent.id) continue
        for (const h of incidentEdgeHazards(link, parent, labelByEdge)) {
          const r = repelPoint(px, py, typeR, h.x, h.y, 18, range, strength * 0.85, alpha)
          repX += r.x
          repY += r.y
          if (r.x !== 0 || r.y !== 0) pressure += 0.25
        }
      }

      const labelBox = dataPropLabelBox(parent, prop)
      const typeBox = dataPropTypeBox(prop)
      const labelR = labelNodeRadius(prop.label)
      let labelRepX = 0
      let labelRepY = 0

      for (const edgeBox of edgeLabelBoxes) {
        const labelSep = boxSeparation(labelBox, edgeBox, DATA_PROPERTY_LABEL_GAP)
        if (labelSep) {
          applyBoxSeparation(prop, parent, labelSep, alpha, true)
          pressure += 2.2
          prop._outwardPush = Math.min(
            DATA_PROPERTY_MAX_OUTWARD_PUSH,
            (prop._outwardPush ?? 0) + Math.max(labelSep.x, labelSep.y) * 1.4,
          )
          pushDataPropOutward(prop, parent, 0.55 * alpha)
        }

        const typeSep = boxSeparation(typeBox, edgeBox, DATA_PROPERTY_LABEL_GAP)
        if (typeSep) {
          applyBoxSeparation(prop, parent, typeSep, alpha, false)
          pressure += 1.4
        }
      }

      for (const other of dataProps) {
        if (other.propertyId === prop.propertyId) continue
        const ox = other.x ?? 0
        const oy = other.y ?? 0
        const r = repelPoint(px, py, typeR, ox, oy, typeNodeRadius(other), range, strength, alpha)
        repX += r.x
        repY += r.y
        if (r.x !== 0 || r.y !== 0) pressure += 0.4

        const otherParent = classById.get(other.classId)
        if (!otherParent) continue
        const otherLabelBox = dataPropLabelBox(otherParent, other)
        const lrBox = boxSeparation(labelBox, otherLabelBox, 8)
        if (lrBox) {
          applyBoxSeparation(prop, parent, lrBox, alpha, false)
          pressure += 0.8
        } else {
          const otherLabel = dataPropertyLinkLabelPos(otherParent, other)
          const lr = repelPoint(
            labelBox.cx,
            labelBox.cy,
            labelR,
            otherLabel.x,
            otherLabel.y,
            labelNodeRadius(other.label),
            range,
            strength * 0.9,
            alpha,
          )
          labelRepX += lr.x
          labelRepY += lr.y
        }

        const tr = repelPoint(
          px,
          py,
          typeR,
          otherLabelBox.cx,
          otherLabelBox.cy,
          labelNodeRadius(other.label),
          range,
          strength * 0.75,
          alpha,
        )
        repX += tr.x
        repY += tr.y
      }

      for (const h of globalHazards) {
        const lr = repelPoint(
          labelBox.cx,
          labelBox.cy,
          labelR,
          h.x,
          h.y,
          h.r,
          range,
          strength * 0.8,
          alpha,
        )
        labelRepX += lr.x
        labelRepY += lr.y
      }

      const biased = applyOutwardBias(parent, prop, repX, repY)
      prop.vx! += biased.x
      prop.vy! += biased.y

      if (labelRepX !== 0 || labelRepY !== 0) {
        const sx = parent.x ?? 0
        const sy = parent.y ?? 0
        const tx = prop.x ?? sx
        const ty = prop.y ?? sy
        const dx = tx - sx
        const dy = ty - sy
        const len = Math.hypot(dx, dy) || 1
        const tang = labelRepX * (-dy / len) + labelRepY * (dx / len)
        prop.vx! += (-dy / len) * tang * 1.1
        prop.vy! += (dx / len) * tang * 1.1
        pressure += 0.3
      }

      if (pressure > 0.2) {
        prop._outwardPush = Math.min(
          DATA_PROPERTY_MAX_OUTWARD_PUSH,
          (prop._outwardPush ?? 0) + pressure * 1.8 * alpha,
        )
        pushDataPropOutward(prop, parent, pressure * 0.22 * alpha)
      }
    }

    siblingsByClass.forEach((siblings, classId) => {
      if (siblings.length < 2) return
      const parent = classById.get(classId)
      if (!parent) return
      const ppx = parent.x ?? 0
      const ppy = parent.y ?? 0
      const minAngle = Math.min(0.78, 0.34 + siblings.length * 0.1)

      for (let i = 0; i < siblings.length; i++) {
        for (let j = i + 1; j < siblings.length; j++) {
          const a = siblings[i]
          const b = siblings[j]
          if (a.fx != null || a.fy != null || b.fx != null || b.fy != null) continue

          const ai = Math.atan2((a.y ?? 0) - ppy, (a.x ?? 0) - ppx)
          const aj = Math.atan2((b.y ?? 0) - ppy, (b.x ?? 0) - ppx)
          let dAngle = aj - ai
          while (dAngle > Math.PI) dAngle -= 2 * Math.PI
          while (dAngle < -Math.PI) dAngle += 2 * Math.PI
          if (Math.abs(dAngle) >= minAngle) continue

          const push = (minAngle - Math.abs(dAngle)) * 0.48 * alpha
          const sign = dAngle >= 0 ? 1 : -1
          pushDataPropAngular(a, parent, -sign * push)
          pushDataPropAngular(b, parent, sign * push)
          pushDataPropOutward(a, parent, push * 0.55)
          pushDataPropOutward(b, parent, push * 0.55)
        }
      }
    })
  }

  force.initialize = () => {}
  return force
}

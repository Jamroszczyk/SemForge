import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { ZoomTransform } from 'd3'
import type {
  DataPropertyField,
  EditingDataProperty,
  OntologyClass,
  OntologyDataProperty,
  OntologyEdge,
  Selection,
  SimClass,
  SimDataProperty,
  SimDataPropertyLink,
  SimLabelAnchor,
  SimLabelAnchorLink,
  SimLink,
  SimLoopAnchor,
  SimLoopLink,
  SimNode,
} from '../types'
import {
  CLASS_COLOR,
  CLASS_RADIUS,
  DATA_PROPERTY_AVOID_RANGE,
  DATA_PROPERTY_AVOID_STRENGTH,
  DATA_PROPERTY_DISTANCE,
  DATA_PROPERTY_HEIGHT,
  DATA_PROPERTY_LINK_STRENGTH,
  DATA_PROPERTY_MIN_WIDTH,
  getEdgeDirectionPhase,
  getEdgeLineStyle,
  LABEL_ANCHOR_LINK_STRENGTH,
  LABEL_ANCHOR_RESTORE_STRENGTH,
  LINK_DISTANCE,
  LOOP_ANCHOR_DISTANCE,
  LOOP_EDGE_AVOID_RANGE,
  LOOP_EDGE_AVOID_STRENGTH,
  LOOP_LINK_STRENGTH,
  isDataPropertyNode,
  isLabelAnchor,
  isLoopAnchor,
} from '../types'
import {
  assignParallelOffsets,
  bindAnchorsToLinks,
  computeDynamicSiblingRanks,
  flipLoopAnchorThroughParent,
  forceLoopEdgeAvoidance,
  isDraggableEdgeLabel,
  isMultiEdge,
  isSelfLink,
  linkLabelPos,
  linkPath,
  placeLoopAnchor,
  syncLabelAnchors,
  syncLoopAnchors,
  targetLinkControlPos,
} from '../graphGeometry'
import {
  dataPropertyEdgeLabelLayout,
  dataPropertyLinkLabelPos,
  dataPropertyLinkPath,
  dataPropertyTypeNodeLayout,
  forceDataPropertyAvoidance,
  syncDataPropertyNodes,
} from '../dataPropertyGeometry'
import { Minimap } from './Minimap'
import { ClassDragTool } from './ClassDragTool'

interface OntologyCanvasProps {
  classes: OntologyClass[]
  edges: OntologyEdge[]
  dataProperties: OntologyDataProperty[]
  selection: Selection | null
  selectedClassIds: ReadonlySet<string>
  editingLabel: Selection | null
  editingDataProperty: EditingDataProperty | null
  onCreateAt: (x: number, y: number) => void
  onSelectClass: (id: string, additive: boolean) => void
  onSelectClassDataTab: (id: string) => void
  onSelectAndEditClass: (id: string) => void
  onSelectEdge: (id: string) => void
  onSelectAndEditEdge: (id: string) => void
  onEditDataProperty: (classId: string, propertyId: string, field: DataPropertyField) => void
  onCreateEdge: (sourceId: string, targetId: string) => string | null
  onDeselect: () => void
}

type CanvasCallbacks = Pick<
  OntologyCanvasProps,
  | 'onCreateAt'
  | 'onSelectClass'
  | 'onSelectClassDataTab'
  | 'onSelectAndEditClass'
  | 'onSelectEdge'
  | 'onSelectAndEditEdge'
  | 'onEditDataProperty'
  | 'onCreateEdge'
  | 'onDeselect'
>

const HANDLE_OFFSET = CLASS_RADIUS + 10
const HANDLE_HIT_R = 7
const HANDLE_ZONE_R = 20
const LABEL_PAD_X = 12
const LABEL_PAD_Y = 7
const LABEL_MIN_W = 58
const LABEL_TEXT_H = 15

export function OntologyCanvas({
  classes,
  edges,
  dataProperties,
  selection,
  selectedClassIds,
  editingLabel,
  editingDataProperty,
  onCreateAt,
  onSelectClass,
  onSelectClassDataTab,
  onSelectAndEditClass,
  onSelectEdge,
  onSelectAndEditEdge,
  onEditDataProperty,
  onCreateEdge,
  onDeselect,
}: OntologyCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const simRef = useRef<d3.Simulation<SimNode, undefined> | null>(null)
  const nodesRef = useRef<SimClass[]>([])
  const anchorsRef = useRef<SimLoopAnchor[]>([])
  const labelAnchorsRef = useRef<SimLabelAnchor[]>([])
  const loopLinksRef = useRef<SimLoopLink[]>([])
  const labelAnchorLinksRef = useRef<SimLabelAnchorLink[]>([])
  const linksRef = useRef<SimLink[]>([])
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const transformRef = useRef<ZoomTransform>(d3.zoomIdentity)
  const gRootRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const linkLayerRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const dragLineLayerRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const nodeLayerRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const edgeLabelLayerRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const dataPropLinkLayerRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(
    null,
  )
  const dataPropNodeLayerRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(
    null,
  )
  const dataPropLabelLayerRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(
    null,
  )
  const dragLineRef = useRef<d3.Selection<SVGLineElement, unknown, null, undefined> | null>(null)
  const dataPropsRef = useRef<SimDataProperty[]>([])
  const dataPropLinksRef = useRef<SimDataPropertyLink[]>([])
  const pinnedRef = useRef<Set<string>>(new Set())
  const dragRef = useRef<d3.DragBehavior<SVGGElement, SimClass, SimClass | d3.SubjectPosition> | null>(null)
  const dataPropDragRef = useRef<
    d3.DragBehavior<SVGGElement, SimDataProperty, SimDataProperty | d3.SubjectPosition> | null
  >(null)
  const labelDragRef = useRef<d3.DragBehavior<SVGGElement, SimLink, SimLink | d3.SubjectPosition> | null>(null)
  const warmedRef = useRef(false)
  const linkingRef = useRef<{ source: SimClass; pointerId: number } | null>(null)
  const pendingLoopSpawnRef = useRef<{ edgeId: string; x: number; y: number } | null>(null)
  const startLinkingRef = useRef<(source: SimClass, ev: PointerEvent) => void>(() => {})
  const callbacksRef = useRef<CanvasCallbacks>({
    onCreateAt,
    onSelectClass,
    onSelectClassDataTab,
    onSelectAndEditClass,
    onSelectEdge,
    onSelectAndEditEdge,
    onEditDataProperty,
    onCreateEdge,
    onDeselect,
  })

  callbacksRef.current = {
    onCreateAt,
    onSelectClass,
    onSelectClassDataTab,
    onSelectAndEditClass,
    onSelectEdge,
    onSelectAndEditEdge,
    onEditDataProperty,
    onCreateEdge,
    onDeselect,
  }

  useEffect(() => {
    const svg = d3.select(svgRef.current!)
    const defs = svg.append('defs')
    defs
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 10)
      .attr('refY', 0)
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto')
      .append('path')
      .attr('class', 'arrow-path')
      .attr('d', 'M0,-5L10,0L0,5')

    defs
      .append('marker')
      .attr('id', 'arrow-start')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 10)
      .attr('refY', 0)
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto-start-reverse')
      .append('path')
      .attr('class', 'arrow-path')
      .attr('d', 'M0,-5L10,0L0,5')

    const gRoot = svg.append('g').attr('class', 'root')
    const linkLayer = gRoot.append('g').attr('class', 'links')
    const dataPropLinkLayer = gRoot.append('g').attr('class', 'data-prop-links')
    const nodeLayer = gRoot.append('g').attr('class', 'nodes')
    const dataPropNodeLayer = gRoot.append('g').attr('class', 'data-prop-nodes')
    const dataPropLabelLayer = gRoot.append('g').attr('class', 'data-prop-edge-labels')
    const edgeLabelLayer = gRoot.append('g').attr('class', 'edge-labels')
    const dragLineLayer = gRoot.append('g').attr('class', 'drag-line-layer')

    const dragLine = dragLineLayer
      .append('line')
      .attr('class', 'link-drag-preview')
      .style('display', 'none')

    gRootRef.current = gRoot
    linkLayerRef.current = linkLayer
    dataPropLinkLayerRef.current = dataPropLinkLayer
    dragLineLayerRef.current = dragLineLayer
    nodeLayerRef.current = nodeLayer
    dataPropNodeLayerRef.current = dataPropNodeLayer
    edgeLabelLayerRef.current = edgeLabelLayer
    dataPropLabelLayerRef.current = dataPropLabelLayer
    dragLineRef.current = dragLine

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .filter((event) => event.type === 'wheel')
      .on('zoom', (ev) => {
        transformRef.current = ev.transform
        gRoot.attr('transform', ev.transform.toString())
        wrapRef.current?.dispatchEvent(new CustomEvent('zoomchange', { detail: ev.transform }))
      })

    zoomRef.current = zoom
    svg.call(zoom)

    const clearLinking = () => {
      linkingRef.current = null
      dragLine.style('display', 'none')
      nodeLayer.selectAll<SVGGElement, SimClass>('g.node').classed('linking-source link-target', false)
      window.removeEventListener('pointermove', onLinkMove)
      window.removeEventListener('pointerup', onLinkUp)
      window.removeEventListener('pointercancel', onLinkUp)
    }

    const onLinkMove = (e: PointerEvent) => {
      const state = linkingRef.current
      if (!state || e.pointerId !== state.pointerId) return
      const [x, y] = d3.pointer(e, gRoot.node())
      dragLine.attr('x2', x).attr('y2', y)
      const target = findNodeAt(x, y)
      nodeLayer
        .selectAll<SVGGElement, SimClass>('g.node')
        .classed('link-target', (n) => (target ? n.id === target.id : false))
    }

    const onLinkUp = (e: PointerEvent) => {
      const state = linkingRef.current
      if (!state || e.pointerId !== state.pointerId) return
      const [x, y] = d3.pointer(e, gRoot.node())
      const target = findNodeAt(x, y)
      if (target) {
        const edgeId = callbacksRef.current.onCreateEdge(state.source.id, target.id)
        if (edgeId) {
          if (target.id === state.source.id) {
            pendingLoopSpawnRef.current = { edgeId, x, y }
          }
          callbacksRef.current.onSelectAndEditEdge(edgeId)
        }
      }
      clearLinking()
    }

    const startLinking = (source: SimClass, ev: PointerEvent) => {
      if (ev.button !== 0) return
      ev.stopPropagation()
      ev.preventDefault()

      linkingRef.current = { source, pointerId: ev.pointerId }
      nodeLayer
        .selectAll<SVGGElement, SimClass>('g.node')
        .classed('linking-source', (n) => n.id === source.id)

      const start = handleWorldPos(source)
      dragLine
        .attr('x1', start.x)
        .attr('y1', start.y)
        .attr('x2', start.x)
        .attr('y2', start.y)
        .style('display', null)

      window.addEventListener('pointermove', onLinkMove)
      window.addEventListener('pointerup', onLinkUp)
      window.addEventListener('pointercancel', onLinkUp)
    }

    const handleWorldPos = (node: SimClass) => ({
      x: (node.x ?? 0) + HANDLE_OFFSET,
      y: node.y ?? 0,
    })

    const findNodeAt = (x: number, y: number) => {
      const hitR = CLASS_RADIUS + 6
      let best: SimClass | null = null
      let bestDist = Infinity
      for (const n of nodesRef.current) {
        const dx = (n.x ?? 0) - x
        const dy = (n.y ?? 0) - y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist <= hitR && dist < bestDist) {
          best = n
          bestDist = dist
        }
      }
      return best
    }

    startLinkingRef.current = startLinking

    svg.on('pointerdown', (ev) => {
      const target = ev.target as Element
      if (target.closest('.node, .edge-label, .link-handle, .data-prop-node, .data-prop-edge-label')) return
      nodeLayer.selectAll<SVGGElement, SimClass>('g.node').classed('selected', false)
      edgeLabelLayer.selectAll<SVGGElement, SimLink>('g.edge-label').classed('selected', false)
      callbacksRef.current.onDeselect()
    })

    svg.on('dblclick.zoom', null)
    svg.on('dblclick', (ev) => {
      const target = ev.target as Element
      if (target.closest('.node, .edge-label, .link-handle, .data-prop-node, .data-prop-edge-label')) return
      ev.preventDefault()
      const [x, y] = d3.pointer(ev, gRoot.node())
      callbacksRef.current.onCreateAt(x, y)
    })

    const drag = d3
      .drag<SVGGElement, SimClass>()
      .filter((ev) => {
        const t = ev.target as Element
        return !t.classList.contains('link-handle') && !t.classList.contains('link-handle-zone')
      })
      .on('start', (ev, d) => {
        if (!ev.active) simRef.current?.alphaTarget(0.3).restart()
        d.vx = 0
        d.vy = 0
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (ev, d) => {
        d.fx = ev.x
        d.fy = ev.y
      })
      .on('end', (ev, d) => {
        if (!ev.active) simRef.current?.alphaTarget(0)
        d.fx = null
        d.fy = null
      })

    const dataPropDrag = d3
      .drag<SVGGElement, SimDataProperty>()
      .on('start', (ev, d) => {
        if (!ev.active) sim.alphaTarget(0.3).restart()
        d.vx = 0
        d.vy = 0
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (ev, d) => {
        d.fx = ev.x
        d.fy = ev.y
      })
      .on('end', (ev, d) => {
        if (!ev.active) sim.alphaTarget(0)
        d.fx = null
        d.fy = null
        sim.alpha(0.15).restart()
      })

    const labelDrag = d3
      .drag<SVGGElement, SimLink>()
      .filter((ev, d) => {
        const g = (ev.target as Element).closest('g.edge-label')
        if (g?.classList.contains('editing-label')) return false
        return isDraggableEdgeLabel(d)
      })
      .on('start', (ev, d) => {
        const anchor = labelDragTarget(d, anchorsRef.current, labelAnchorsRef.current)
        if (!anchor) return
        if (!ev.active) sim.alphaTarget(0.3).restart()
        anchor.vx = 0
        anchor.vy = 0
        anchor.fx = anchor.x
        anchor.fy = anchor.y
      })
      .on('drag', (ev, d) => {
        const anchor = labelDragTarget(d, anchorsRef.current, labelAnchorsRef.current)
        if (!anchor) return
        anchor.fx = ev.x
        anchor.fy = ev.y
      })
      .on('end', (ev, d) => {
        const anchor = labelDragTarget(d, anchorsRef.current, labelAnchorsRef.current)
        if (!anchor) return
        if (!ev.active) sim.alphaTarget(0)
        anchor.fx = null
        anchor.fy = null
        sim.alpha(0.18).restart()
      })

    const linkForce = d3
      .forceLink<SimClass, SimLink>([])
      .id((d) => d.id)
      .distance((d) => (isSelfLink(d) ? 0 : LINK_DISTANCE))
      .strength((d) => (isSelfLink(d) ? 0 : 0.32))

    const loopLinkForce = d3
      .forceLink<SimNode, SimLoopLink>([])
      .id((d) => d.id)
      .distance(LOOP_ANCHOR_DISTANCE)
      .strength(LOOP_LINK_STRENGTH)

    const labelAnchorLinkForce = d3
      .forceLink<SimNode, SimLabelAnchorLink>([])
      .id((d) => d.id)
      .distance((d) => {
        const link = linksRef.current.find((l) => l.id === d.edgeId)
        const endpoint = d.source as SimClass
        if (!link || !endpoint) return 80
        const ranks = computeDynamicSiblingRanks(linksRef.current, labelAnchorsRef.current)
        const target = targetLinkControlPos(link, ranks, linksRef.current)
        return Math.hypot(target.x - (endpoint.x ?? 0), target.y - (endpoint.y ?? 0))
      })
      .strength(LABEL_ANCHOR_LINK_STRENGTH)

    const dataPropLinkForce = d3
      .forceLink<SimNode, SimDataPropertyLink>([])
      .id((d) => d.id)
      .distance((link) => {
        const target = link.target as SimDataProperty
        return DATA_PROPERTY_DISTANCE + (target._outwardPush ?? 0)
      })
      .strength(DATA_PROPERTY_LINK_STRENGTH)

    const labelRestoreForce = forceLabelRestore(
      () => linksRef.current,
      () => labelAnchorsRef.current,
      LABEL_ANCHOR_RESTORE_STRENGTH,
    )

    const loopEdgeAvoidForce = forceLoopEdgeAvoidance(
      () => linksRef.current,
      () => anchorsRef.current,
      () => nodesRef.current,
      () => labelAnchorsRef.current,
      LOOP_EDGE_AVOID_STRENGTH,
      LOOP_EDGE_AVOID_RANGE,
    )

    const dataPropAvoidForce = forceDataPropertyAvoidance(
      () => dataPropsRef.current,
      () => nodesRef.current,
      () => linksRef.current,
      () => anchorsRef.current,
      () => labelAnchorsRef.current,
      DATA_PROPERTY_AVOID_STRENGTH,
      DATA_PROPERTY_AVOID_RANGE,
    )

    const sim = d3
      .forceSimulation<SimNode>([])
      .force('charge', d3.forceManyBody<SimNode>().strength((d) => {
        if (isLoopAnchor(d)) return -160
        if (isLabelAnchor(d)) return -120
        if (isDataPropertyNode(d)) return -135
        return -780
      }))
      .force('link', linkForce)
      .force('loop', loopLinkForce)
      .force('labelAnchor', labelAnchorLinkForce)
      .force('dataPropLink', dataPropLinkForce)
      .force('labelRestore', labelRestoreForce)
      .force('loopEdgeAvoid', loopEdgeAvoidForce)
      .force('dataPropAvoid', dataPropAvoidForce)
      .force(
        'collide',
        d3
          .forceCollide<SimNode>()
          .radius((d) => {
            if (isLoopAnchor(d)) return 24
            if (isLabelAnchor(d)) return 22
            if (isDataPropertyNode(d)) {
              const hw = (d._boxWidth ?? DATA_PROPERTY_MIN_WIDTH) / 2
              return Math.max(hw, DATA_PROPERTY_HEIGHT / 2) + 14
            }
            return CLASS_RADIUS + 22
          })
          .strength(0.92),
      )
      .force('x', d3.forceX(0).strength(0.022))
      .force('y', d3.forceY(0).strength(0.022))
      .alphaTarget(0)

    sim.on('tick', () => {
      bindAnchorsToLinks(linksRef.current, anchorsRef.current, labelAnchorsRef.current)

      linkLayer
        .selectAll<SVGPathElement, SimLink>('g.link-g path.link')
        .attr('d', (d) => linkPath(d))

      edgeLabelLayer
        .selectAll<SVGGElement, SimLink>('g.edge-label')
        .attr('transform', (d) => {
          const pos = linkLabelPos(d)
          return `translate(${pos.x},${pos.y})`
        })

      nodeLayer
        .selectAll<SVGGElement, SimClass>('g.node')
        .attr('transform', (d) => `translate(${d.x},${d.y})`)

      dataPropLinkLayer
        .selectAll<SVGPathElement, SimDataPropertyLink>('path.data-prop-link')
        .attr('d', (d) =>
          dataPropertyLinkPath(d.source as SimClass, d.target as SimDataProperty),
        )

      dataPropNodeLayer
        .selectAll<SVGGElement, SimDataProperty>('g.data-prop-node')
        .attr('transform', (d) => `translate(${d.x},${d.y})`)

      dataPropLabelLayer
        .selectAll<SVGGElement, SimDataPropertyLink>('g.data-prop-edge-label')
        .attr('transform', (d) => {
          const pos = dataPropertyLinkLabelPos(
            d.source as SimClass,
            d.target as SimDataProperty,
          )
          return `translate(${pos.x},${pos.y})`
        })

      if (linkingRef.current) {
        const start = handleWorldPos(linkingRef.current.source)
        dragLine.attr('x1', start.x).attr('y1', start.y)
      }

      for (const id of [...pinnedRef.current]) {
        const node = nodesRef.current.find((n) => n.id === id)
        if (node && sim.alpha() < 0.05) {
          node.fx = null
          node.fy = null
          pinnedRef.current.delete(id)
        }
      }
    })

    simRef.current = sim
    dragRef.current = drag
    dataPropDragRef.current = dataPropDrag
    labelDragRef.current = labelDrag

    return () => {
      warmedRef.current = false
      clearLinking()
      sim.stop()
      simRef.current = null
      svg.on('.zoom', null)
      svg.on('pointerdown', null)
      svg.on('dblclick', null)
      svg.selectAll('*').remove()
      gRootRef.current = null
      linkLayerRef.current = null
      dragLineLayerRef.current = null
      nodeLayerRef.current = null
      edgeLabelLayerRef.current = null
      dataPropLinkLayerRef.current = null
      dataPropNodeLayerRef.current = null
      dataPropLabelLayerRef.current = null
      dragLineRef.current = null
    }
  }, [])

  useEffect(() => {
    const sim = simRef.current
    const nodeLayer = nodeLayerRef.current
    const drag = dragRef.current
    if (!sim || !nodeLayer || !drag) return

    const prev = nodesRef.current
    const prevIds = new Set(prev.map((n) => n.id))
    const nextIds = new Set(classes.map((c) => c.id))

    let changed = false

    const kept = prev.filter((n) => nextIds.has(n.id))
    if (kept.length !== prev.length) changed = true

    const nodes = [...kept]
    const newNodeIds: string[] = []
    const pinForWarmLayout = !warmedRef.current

    for (const c of classes) {
      if (!prevIds.has(c.id)) {
        const x = c.x ?? 0
        const y = c.y ?? 0
        if (pinForWarmLayout) {
          pinnedRef.current.add(c.id)
          nodes.push({ id: c.id, label: c.label, x, y, fx: x, fy: y, vx: 0, vy: 0 })
        } else {
          nodes.push({ id: c.id, label: c.label, x, y, vx: 0, vy: 0 })
        }
        newNodeIds.push(c.id)
        changed = true
      }
    }

    nodesRef.current = nodes

    const svg = svgRef.current
    if (svg) aimCenterForces(sim, svg)

    if (changed) {
      syncSimulationNodes(
        sim,
        nodes,
        anchorsRef.current,
        labelAnchorsRef.current,
        dataPropsRef.current,
      )
      const newCount = nodes.length - prev.length
      if (!warmedRef.current && nodes.length > 0) {
        warmLayout(sim, Math.min(520, 120 + nodes.length * 12))
        warmedRef.current = true
        releasePinnedNodes(newNodeIds, nodes, pinnedRef.current)
        sim.alpha(0.22).restart()
      } else if (newCount > 0) {
        sim.alpha(Math.min(0.22, 0.1 + newCount * 0.02)).restart()
      }

      const nodeSel = nodeLayer.selectAll<SVGGElement, SimClass>('g.node').data(nodes, (d) => d.id)

      nodeSel.exit().remove()

      const nodeEnter = nodeSel
        .enter()
        .append('g')
        .attr('class', 'node')
        .call(drag)
        .on('pointerdown', (ev, d) => {
          if (ev.button !== 0) return
          if ((ev.target as Element).closest('.link-handle')) return
          ev.stopPropagation()
          edgeLabelLayerRef.current
            ?.selectAll<SVGGElement, SimLink>('g.edge-label')
            .classed('selected', false)
          callbacksRef.current.onSelectClass(
            d.id,
            ev.shiftKey || ev.ctrlKey || ev.metaKey,
          )
        })
        .on('dblclick', (ev, d) => {
          if ((ev.target as Element).closest('.link-handle')) return
          ev.stopPropagation()
          edgeLabelLayerRef.current
            ?.selectAll<SVGGElement, SimLink>('g.edge-label')
            .classed('selected', false)
          callbacksRef.current.onSelectAndEditClass(d.id)
        })

      nodeEnter.append('circle').attr('class', 'selection-halo')
      nodeEnter.append('circle').attr('class', 'entity-ring')
      nodeEnter.append('circle').attr('class', 'entity-core')
      nodeEnter.append('text').attr('class', 'node-label')
      nodeEnter
        .append('circle')
        .attr('class', 'link-handle-zone')
        .attr('cx', HANDLE_OFFSET)
        .attr('cy', 0)
        .attr('r', HANDLE_ZONE_R)
        .on('pointerenter', onHandleZoneEnter)
        .on('pointerleave', onHandleZoneLeave)
      nodeEnter
        .append('circle')
        .attr('class', 'link-handle')
        .attr('cx', HANDLE_OFFSET)
        .attr('cy', 0)
        .attr('r', HANDLE_HIT_R)
        .on('pointerenter', onHandleZoneEnter)
        .on('pointerleave', onHandleZoneLeave)
        .on('pointerdown', (ev, d) => {
          startLinkingRef.current(d, ev)
        })

      const nodeMerged = nodeEnter.merge(nodeSel)

      nodeMerged.on('pointerleave', onNodePointerLeave)

      nodeMerged.each(function () {
        const g = d3.select(this)
        if (g.select('circle.link-handle-zone').empty()) {
          g.append('circle')
            .attr('class', 'link-handle-zone')
            .attr('cx', HANDLE_OFFSET)
            .attr('cy', 0)
            .attr('r', HANDLE_ZONE_R)
            .on('pointerenter', onHandleZoneEnter)
            .on('pointerleave', onHandleZoneLeave)
        }
        g.select<SVGCircleElement>('circle.link-handle')
          .on('pointerenter', onHandleZoneEnter)
          .on('pointerleave', onHandleZoneLeave)
      })

      nodeMerged.select('circle.selection-halo').attr('r', CLASS_RADIUS + 14)

      nodeMerged.select('circle.entity-ring').attr('r', CLASS_RADIUS + 4).attr('stroke', CLASS_COLOR)

      nodeMerged.select('circle.entity-core').attr('r', CLASS_RADIUS).attr('fill', CLASS_COLOR)

      nodeMerged
        .select('text.node-label')
        .attr('dy', 0)
        .text((d) => truncate(d.label, 34))
    }

    pinnedRef.current.forEach((id) => {
      if (!nextIds.has(id)) pinnedRef.current.delete(id)
    })
  }, [classes.map((c) => c.id).join('|')])

  useEffect(() => {
    const sim = simRef.current
    const linkLayer = linkLayerRef.current
    const edgeLabelLayer = edgeLabelLayerRef.current
    if (!sim || !linkLayer || !edgeLabelLayer) return

    const prev = linksRef.current
    const prevSnapshot = prev.map((l) => ({
      id: l.id,
      sourceId: l.sourceId,
      targetId: l.targetId,
      bidirectional: l.bidirectional ?? false,
      directionPhase: getEdgeDirectionPhase(l),
    }))

    const links: SimLink[] = edges.map((e) => {
      const existing = prev.find((l) => l.id === e.id)
      if (existing) {
        existing.label = e.label
        existing.bidirectional = e.bidirectional ?? false
        existing.sourceId = e.sourceId
        existing.targetId = e.targetId
        existing.directionPhase = e.directionPhase ?? 0
        existing.lineStyle = e.lineStyle
        return existing
      }
      return {
        id: e.id,
        label: e.label,
        sourceId: e.sourceId,
        targetId: e.targetId,
        source: e.sourceId,
        target: e.targetId,
        bidirectional: e.bidirectional ?? false,
        directionPhase: e.directionPhase ?? 0,
        lineStyle: e.lineStyle,
      }
    })

    assignParallelOffsets(links)
    linksRef.current = links

    for (const link of links) {
      link.source = nodesRef.current.find((n) => n.id === link.sourceId) ?? link.source
      link.target = nodesRef.current.find((n) => n.id === link.targetId) ?? link.target
    }

    const { anchors, loopLinks } = syncLoopAnchors(edges, nodesRef.current, anchorsRef.current)
    anchorsRef.current = anchors
    loopLinksRef.current = loopLinks

    for (const link of links) {
      if (!isSelfLink(link)) continue
      const prevLink = prevSnapshot.find((p) => p.id === link.id)
      if (!prevLink) continue
      const prevPhase = prevLink.directionPhase
      const newPhase = getEdgeDirectionPhase(link)
      if (prevPhase === newPhase) continue
      const shouldFlip =
        (prevPhase === 0 && newPhase === 1) || (newPhase === 0 && prevPhase !== 0)
      if (!shouldFlip) continue
      const anchor = anchors.find((a) => a.edgeId === link.id)
      const parent = link.source as SimClass
      if (anchor && parent) flipLoopAnchorThroughParent(anchor, parent)
    }

    const { anchors: labelAnchors, anchorLinks } = syncLabelAnchors(
      edges,
      nodesRef.current,
      links,
      labelAnchorsRef.current,
    )
    labelAnchorsRef.current = labelAnchors
    labelAnchorLinksRef.current = anchorLinks

    const pending = pendingLoopSpawnRef.current
    if (pending) {
      const anchor = anchors.find((a) => a.edgeId === pending.edgeId)
      const parent = nodesRef.current.find((n) => n.id === anchor?.parentId)
      if (anchor && parent) placeLoopAnchor(anchor, parent, pending.x, pending.y)
      pendingLoopSpawnRef.current = null
    }

    const linkForce = sim.force('link') as d3.ForceLink<SimClass, SimLink>
    const loopLinkForce = sim.force('loop') as d3.ForceLink<SimNode, SimLoopLink>
    const labelAnchorLinkForce = sim.force('labelAnchor') as d3.ForceLink<
      SimNode,
      SimLabelAnchorLink
    >
    loopLinkForce.links(loopLinks)
    labelAnchorLinkForce.links(anchorLinks)
    syncSimulationNodes(sim, nodesRef.current, anchors, labelAnchors, dataPropsRef.current)

    const prevIds = new Set(prev.map((l) => l.id))
    const changed =
      links.length !== prev.length ||
      links.some((l) => {
        const p = prevSnapshot.find((x) => x.id === l.id)
        if (!p) return true
        return (
          p.bidirectional !== (l.bidirectional ?? false) ||
          p.sourceId !== l.sourceId ||
          p.targetId !== l.targetId ||
          p.directionPhase !== getEdgeDirectionPhase(l)
        )
      })

    linkForce.links(links)
    if (changed) {
      sim.alpha(0.15).restart()
    }

    const linkSel = linkLayer.selectAll<SVGGElement, SimLink>('g.link-g').data(links, (d) => d.id)
    linkSel.exit().remove()

    const linkEnter = linkSel.enter().append('g').attr('class', 'link-g')
    linkEnter
      .append('path')
      .attr('class', 'link')
      .attr('marker-end', 'url(#arrow)')

    linkSel
      .merge(linkEnter)
      .select('path.link')
      .attr('class', (d) => linkPathClass(d))
      .attr('marker-end', 'url(#arrow)')
      .attr('marker-start', (d) => (d.bidirectional ? 'url(#arrow-start)' : null))

    if (changed) {
      linkLayer
        .selectAll<SVGPathElement, SimLink>('g.link-g path.link')
        .attr('d', (d) => linkPath(d))
    }

    const labelSel = edgeLabelLayer
      .selectAll<SVGGElement, SimLink>('g.edge-label')
      .data(links, (d) => d.id)

    labelSel.exit().remove()

    const labelEnter = labelSel
      .enter()
      .append('g')
      .attr('class', 'edge-label')
      .on('pointerdown', (ev, d) => {
        if (ev.button !== 0) return
        ev.stopPropagation()
        nodeLayerRef.current
          ?.selectAll<SVGGElement, SimClass>('g.node')
          .classed('selected', false)
        edgeLabelLayer
          .selectAll<SVGGElement, SimLink>('g.edge-label')
          .classed('selected', (l) => l.id === d.id)
        callbacksRef.current.onSelectEdge(d.id)
      })
      .on('dblclick', (ev, d) => {
        ev.stopPropagation()
        nodeLayerRef.current
          ?.selectAll<SVGGElement, SimClass>('g.node')
          .classed('selected', false)
        edgeLabelLayer
          .selectAll<SVGGElement, SimLink>('g.edge-label')
          .classed('selected', (l) => l.id === d.id)
        callbacksRef.current.onSelectAndEditEdge(d.id)
      })

    labelEnter.append('rect').attr('class', 'edge-label-bg')
    labelEnter.append('text').attr('class', 'edge-label-text').attr('dy', 1)

    const labelMerged = labelEnter.merge(labelSel)

    const labelDrag = labelDragRef.current
    if (labelDrag) labelMerged.call(labelDrag)

    labelMerged.classed('draggable', (d) => isDraggableEdgeLabel(d))

    labelMerged.select('text.edge-label-text').text((d) => d.label || 'Unnamed')

    labelMerged.each(function (d) {
      const size = labelSize(d.label || 'Unnamed')
      d3.select(this)
        .select('rect.edge-label-bg')
        .attr('x', -size.w / 2)
        .attr('y', -size.h / 2)
        .attr('width', size.w)
        .attr('height', size.h)
    })

    if (changed) {
      sim.alpha(Math.min(0.32, 0.14 + links.filter((l) => !prevIds.has(l.id)).length * 0.08)).restart()
    }
  }, [edges.map((e) => `${e.id}:${e.sourceId}:${e.targetId}:${e.bidirectional ? 1 : 0}:${e.directionPhase ?? 0}:${e.lineStyle ?? 'solid'}`).join('|')])

  useEffect(() => {
    const sim = simRef.current
    const dataPropLinkLayer = dataPropLinkLayerRef.current
    const dataPropNodeLayer = dataPropNodeLayerRef.current
    const dataPropLabelLayer = dataPropLabelLayerRef.current
    const dataPropDrag = dataPropDragRef.current
    if (!sim || !dataPropLinkLayer || !dataPropNodeLayer || !dataPropLabelLayer || !dataPropDrag)
      return

    const prev = dataPropsRef.current
    const { nodes, links } = syncDataPropertyNodes(
      dataProperties,
      nodesRef.current,
      prev,
    )

    for (const node of nodes) {
      const prop = dataProperties.find((p) => p.id === node.propertyId)
      if (prop) {
        node.label = prop.label
        node.datatype = prop.datatype
      }
    }

    dataPropsRef.current = nodes
    dataPropLinksRef.current = links

    for (const link of links) {
      const classId = (link.source as SimClass).id
      link.source = nodesRef.current.find((n) => n.id === classId) ?? link.source
      link.target = nodes.find((n) => n.propertyId === link.propertyId) ?? link.target
    }

    const dataPropLinkForce = sim.force('dataPropLink') as d3.ForceLink<
      SimNode,
      SimDataPropertyLink
    >
    dataPropLinkForce.links(links)
    syncSimulationNodes(
      sim,
      nodesRef.current,
      anchorsRef.current,
      labelAnchorsRef.current,
      nodes,
    )

    const changed =
      nodes.length !== prev.length ||
      nodes.some((n) => {
        const old = prev.find((p) => p.propertyId === n.propertyId)
        return !old
      })
    if (changed) {
      sim.alpha(0.14).restart()
    }

    const linkSel = dataPropLinkLayer
      .selectAll<SVGPathElement, SimDataPropertyLink>('path.data-prop-link')
      .data(links, (d) => d.id)
    linkSel.exit().remove()
    linkSel.enter().append('path').attr('class', 'data-prop-link')

    const nodeSel = dataPropNodeLayer
      .selectAll<SVGGElement, SimDataProperty>('g.data-prop-node')
      .data(nodes, (d) => d.id)
    nodeSel.exit().remove()

    const selectDataPropertyClass = (d: SimDataProperty) => {
      edgeLabelLayerRef.current
        ?.selectAll<SVGGElement, SimLink>('g.edge-label')
        .classed('selected', false)
      callbacksRef.current.onSelectClassDataTab(d.classId)
    }

    const nodeEnter = nodeSel
      .enter()
      .append('g')
      .attr('class', 'data-prop-node')
      .call(dataPropDrag)
      .on('pointerdown', (ev, d) => {
        if (ev.button !== 0) return
        ev.stopPropagation()
        selectDataPropertyClass(d)
      })
      .on('dblclick', (ev, d) => {
        ev.stopPropagation()
        selectDataPropertyClass(d)
        callbacksRef.current.onEditDataProperty(d.classId, d.propertyId, 'datatype')
      })

    nodeEnter.append('rect').attr('class', 'data-prop-rect')
    nodeEnter.append('text').attr('class', 'data-prop-type-label')

    const nodeMerged = nodeEnter.merge(nodeSel)
    nodeMerged.call(dataPropDrag)
    nodeMerged.each(function (d) {
      const prop = dataProperties.find((p) => p.id === d.propertyId)
      paintDataPropertyTypeNode(d3.select(this), d, prop?.datatype ?? d.datatype, false)
    })

    const labelSel = dataPropLabelLayer
      .selectAll<SVGGElement, SimDataPropertyLink>('g.data-prop-edge-label')
      .data(links, (d) => d.id)
    labelSel.exit().remove()

    const labelEnter = labelSel
      .enter()
      .append('g')
      .attr('class', 'data-prop-edge-label')
      .on('pointerdown', (ev, d) => {
        if (ev.button !== 0) return
        ev.stopPropagation()
        const prop = nodes.find((n) => n.propertyId === d.propertyId)
        if (!prop) return
        selectDataPropertyClass(prop)
      })
      .on('dblclick', (ev, d) => {
        ev.stopPropagation()
        const prop = nodes.find((n) => n.propertyId === d.propertyId)
        if (!prop) return
        selectDataPropertyClass(prop)
        callbacksRef.current.onEditDataProperty(prop.classId, prop.propertyId, 'label')
      })

    labelEnter.append('rect').attr('class', 'data-prop-edge-label-bg')
    labelEnter.append('text').attr('class', 'data-prop-edge-label-text').attr('dy', 1)

    const labelMerged = labelEnter.merge(labelSel)
    labelMerged
      .on('pointerdown', (ev, d) => {
        if (ev.button !== 0) return
        ev.stopPropagation()
        const prop = nodes.find((n) => n.propertyId === d.propertyId)
        if (!prop) return
        selectDataPropertyClass(prop)
      })
      .on('dblclick', (ev, d) => {
        ev.stopPropagation()
        const prop = nodes.find((n) => n.propertyId === d.propertyId)
        if (!prop) return
        selectDataPropertyClass(prop)
        callbacksRef.current.onEditDataProperty(prop.classId, prop.propertyId, 'label')
      })
    labelMerged.each(function (d) {
      const prop = nodes.find((n) => n.propertyId === d.propertyId)
      paintDataPropertyEdgeLabel(d3.select(this), prop?.label ?? '')
    })
  }, [
    dataProperties
      .map((p) => `${p.id}:${p.classId}:${p.label}:${p.datatype}`)
      .join('|'),
    classes.map((c) => c.id).join('|'),
  ])

  useEffect(() => {
    const wrap = wrapRef.current
    const sim = simRef.current
    const svg = svgRef.current
    if (!wrap || !sim || !svg) return

    const onResize = () => {
      aimCenterForces(sim, svg)
      sim.alpha(0.1).restart()
    }

    const observer = new ResizeObserver(onResize)
    observer.observe(wrap)
    window.addEventListener('resize', onResize)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  useEffect(() => {
    const nodeLayer = nodeLayerRef.current
    const edgeLabelLayer = edgeLabelLayerRef.current
    const dataPropNodeLayer = dataPropNodeLayerRef.current
    const dataPropLabelLayer = dataPropLabelLayerRef.current
    if (!nodeLayer || !edgeLabelLayer) return

    const labelById = new Map(classes.map((c) => [c.id, c.label]))
    const edgeLabelById = new Map(edges.map((e) => [e.id, e.label]))
    const dataPropById = new Map(dataProperties.map((p) => [p.id, p]))

    const selectedEdgeId = selection?.kind === 'edge' ? selection.id : null
    const editingClassId = editingLabel?.kind === 'class' ? editingLabel.id : null
    const editingEdgeId = editingLabel?.kind === 'edge' ? editingLabel.id : null
    const editingDataPropId = editingDataProperty?.id ?? null
    const editingDataPropField = editingDataProperty?.field ?? null

    nodeLayer
      .selectAll<SVGGElement, SimClass>('g.node')
      .classed('selected', (d) => selectedClassIds.has(d.id))
      .classed('editing-label', (d) => d.id === editingClassId)

    nodeLayer.selectAll<SVGGElement, SimClass>('g.node').each(function (d) {
      d.label = labelById.get(d.id) ?? d.label
    })

    nodeLayer
      .selectAll<SVGGElement, SimClass>('g.node text.node-label')
      .text((d) =>
        d.id === editingClassId ? d.label || 'Unnamed' : truncate(d.label, 34),
      )

    edgeLabelLayer
      .selectAll<SVGGElement, SimLink>('g.edge-label')
      .classed('selected', (d) => d.id === selectedEdgeId)
      .classed('editing-label', (d) => d.id === editingEdgeId)

    edgeLabelLayer.selectAll<SVGGElement, SimLink>('g.edge-label').each(function (d) {
      d.label = edgeLabelById.get(d.id) ?? d.label
      const text = d.id === editingEdgeId ? d.label || 'Unnamed' : truncate(d.label, 24)
      const size = labelSize(text)
      const g = d3.select(this)
      g.select('text.edge-label-text').text(text)
      g.select('rect.edge-label-bg')
        .attr('x', -size.w / 2)
        .attr('y', -size.h / 2)
        .attr('width', size.w)
        .attr('height', size.h)
    })

    if (dataPropLabelLayer) {
      dataPropLabelLayer
        .selectAll<SVGGElement, SimDataPropertyLink>('g.data-prop-edge-label')
        .classed('selected', (d) => {
          const prop = dataPropById.get(d.propertyId)
          return prop ? selectedClassIds.has(prop.classId) : false
        })
        .classed(
          'editing-label',
          (d) => editingDataPropField === 'label' && d.propertyId === editingDataPropId,
        )
        .each(function (d) {
          const prop = dataPropById.get(d.propertyId)
          const isEditing =
            editingDataPropField === 'label' && d.propertyId === editingDataPropId
          paintDataPropertyEdgeLabel(d3.select(this), prop?.label ?? '', isEditing)
        })
    }

    if (dataPropNodeLayer) {
      dataPropNodeLayer
        .selectAll<SVGGElement, SimDataProperty>('g.data-prop-node')
        .classed('selected', (d) => selectedClassIds.has(d.classId))
        .classed(
          'editing-label',
          (d) => editingDataPropField === 'datatype' && d.propertyId === editingDataPropId,
        )
        .each(function (d) {
          const prop = dataPropById.get(d.propertyId)
          const isEditing =
            editingDataPropField === 'datatype' && d.propertyId === editingDataPropId
          paintDataPropertyTypeNode(
            d3.select(this),
            d,
            prop?.datatype ?? d.datatype,
            isEditing,
          )
        })
    }
  }, [
    selection,
    [...selectedClassIds].sort().join('|'),
    editingLabel,
    editingDataProperty,
    classes,
    edges,
    dataProperties,
  ])

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <div className="canvas-toolbar">
        <div className="canvas-hint">
          <strong>Zoom and navigate</strong> by scrolling · <strong>Add a class</strong> by double-clicking the
          canvas or dragging from the tool below · <strong>Connect a node</strong> by dragging its node handle
        </div>
      </div>

      <svg ref={svgRef} className="graph-canvas" aria-label="Ontology canvas" />

      <ClassDragTool wrapRef={wrapRef} gRootRef={gRootRef} onCreateAt={onCreateAt} />

      <Minimap
        wrapRef={wrapRef}
        svgRef={svgRef}
        nodesRef={nodesRef}
        zoomRef={zoomRef}
        transformRef={transformRef}
        gRootRef={gRootRef}
        nodeCount={classes.length}
      />
    </div>
  )
}

function paintDataPropertyTypeNode(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  node: SimDataProperty,
  datatype: string,
  editing: boolean,
) {
  const { display, width, height } = dataPropertyTypeNodeLayout(datatype, editing)
  node._boxWidth = width
  g.select('rect.data-prop-rect')
    .attr('x', -width / 2)
    .attr('y', -height / 2)
    .attr('width', width)
    .attr('height', height)
    .attr('rx', 4)
  g.select('text.data-prop-type-label').attr('dy', 0).text(display)
}

function paintDataPropertyEdgeLabel(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  label: string,
  _editing = false,
) {
  const { display, width, h } = dataPropertyEdgeLabelLayout(label)
  g.select('text.data-prop-edge-label-text').text(display)
  g.select('rect.data-prop-edge-label-bg')
    .attr('x', -width / 2)
    .attr('y', -h / 2)
    .attr('width', width)
    .attr('height', h)
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

function labelSize(text: string) {
  const w = Math.max(text.length * 6.5 + LABEL_PAD_X * 2, LABEL_MIN_W)
  const h = LABEL_TEXT_H + LABEL_PAD_Y * 2
  return { w, h }
}

function setHandleHot(node: SVGGElement, hot: boolean) {
  d3.select(node).classed('handle-hot', hot)
}

function onNodePointerLeave(this: SVGGElement, ev: PointerEvent) {
  const rel = ev.relatedTarget as Node | null
  if (rel && this.contains(rel)) return
  setHandleHot(this, false)
}

function onHandleZoneEnter(this: SVGCircleElement) {
  setHandleHot(this.parentNode as SVGGElement, true)
}

function onHandleZoneLeave(this: SVGCircleElement, ev: PointerEvent) {
  const parent = this.parentNode as SVGGElement
  const rel = ev.relatedTarget as Node | null
  if (rel && parent.contains(rel)) return
  setHandleHot(parent, false)
}

function linkPathClass(link: SimLink) {
  const classes = ['link']
  if (isSelfLink(link)) classes.push('link-self')
  if (link.bidirectional) classes.push('link-bidir')
  if (getEdgeLineStyle(link) === 'dashed') classes.push('link-dashed')
  return classes.join(' ')
}

function forceLabelRestore(
  getLinks: () => SimLink[],
  getLabelAnchors: () => SimLabelAnchor[],
  strength: number,
) {
  function force(alpha: number) {
    const links = getLinks()
    const anchors = getLabelAnchors()
    const ranks = computeDynamicSiblingRanks(links, anchors)
    const byEdge = new Map(anchors.map((a) => [a.edgeId, a]))

    for (const link of links) {
      if (!isMultiEdge(link)) continue
      const anchor = byEdge.get(link.id)
      if (!anchor || anchor.fx != null || anchor.fy != null) continue
      const target = targetLinkControlPos(link, ranks, links)
      anchor.vx! += (target.x - (anchor.x ?? 0)) * strength * alpha
      anchor.vy! += (target.y - (anchor.y ?? 0)) * strength * alpha
    }
  }

  force.initialize = () => {}

  return force
}

function labelDragTarget(
  link: SimLink,
  loopAnchors: SimLoopAnchor[],
  labelAnchors: SimLabelAnchor[],
): SimLoopAnchor | SimLabelAnchor | undefined {
  if (!isDraggableEdgeLabel(link)) return undefined
  if (isSelfLink(link)) return loopAnchors.find((a) => a.edgeId === link.id)
  return labelAnchors.find((a) => a.edgeId === link.id)
}

function releasePinnedNodes(ids: Iterable<string>, nodes: SimClass[], pinned: Set<string>) {
  for (const id of ids) {
    const node = nodes.find((n) => n.id === id)
    if (node) {
      node.fx = null
      node.fy = null
    }
    pinned.delete(id)
  }
}

function syncSimulationNodes(
  sim: d3.Simulation<SimNode, undefined>,
  classNodes: SimClass[],
  loopAnchors: SimLoopAnchor[],
  labelAnchors: SimLabelAnchor[],
  dataProps: SimDataProperty[] = [],
) {
  sim.nodes([...classNodes, ...dataProps, ...loopAnchors, ...labelAnchors])
}

function aimCenterForces(sim: d3.Simulation<SimNode, undefined>, svg: SVGSVGElement) {
  const { width, height } = svg.getBoundingClientRect()
  sim.force('x', d3.forceX(width / 2).strength(0.022))
  sim.force('y', d3.forceY(height / 2).strength(0.022))
}

function warmLayout(sim: d3.Simulation<SimNode, undefined>, maxTicks = 400) {
  sim.alpha(1)
  for (let i = 0; i < maxTicks; i++) {
    sim.tick()
    if (sim.alpha() < 0.015 && i > 80) break
  }
  sim.alpha(0)
}

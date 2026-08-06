import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { ZoomTransform } from 'd3'
import type {
  DataPropertyField,
  EditingDataProperty,
  ExpressionNode,
  NamedClassNode,
  OntologyDataProperty,
  OntologyEdge,
  Selection,
  SimClass,
  SimExpression,
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
  CHARGE_CLASS,
  CHARGE_DATA_PROPERTY,
  CHARGE_EXPRESSION,
  CHARGE_LABEL_ANCHOR,
  CHARGE_LOOP_ANCHOR,
  CLASS_COLOR,
  CLASS_RADIUS,
  COLLIDE_STRENGTH,
  DATA_PROPERTY_AVOID_RANGE,
  DATA_PROPERTY_AVOID_STRENGTH,
  DATA_PROPERTY_HEIGHT,
  DATA_PROPERTY_LINK_STRENGTH,
  DATA_PROPERTY_MIN_WIDTH,
  EXPRESSION_COLLIDE_PADDING,
  EXPRESSION_CORNER_RADIUS,
  EXPRESSION_HALF,
  DRAG_SETTLE_ALPHA,
  DRAG_SETTLE_ALPHA_TARGET,
  DRAG_SETTLE_MS,
  DRAG_SETTLE_UNPIN_ALPHA,
  UNCLUMP_HUB_HOLD_ALPHA_TARGET,
  UNCLUMP_HUB_HOLD_TICKS,
  UNCLUMP_RESOLVE_PASSES,
  UNCLUMP_SETTLE_MS,
  UNCLUMP_SIM_TICKS_PER_PASS,
  isSimExpression,
  LABEL_ANCHOR_LINK_STRENGTH,
  LABEL_ANCHOR_RESTORE_STRENGTH,
  LABEL_COLLIDE_RADIUS,
  LINK_STRENGTH,
  LOOP_COLLIDE_RADIUS,
  LOOP_EDGE_AVOID_RANGE,
  LOOP_EDGE_AVOID_STRENGTH,
  LOOP_LINK_STRENGTH,
  NODE_COLLIDE_PADDING,
  isDataPropertyNode,
  isLabelAnchor,
  isLoopAnchor,
} from '../types'
import {
  applyUnclumpPass,
  computeGraphUnclumpPlan,
  assignParallelOffsets,
  bindAnchorsToLinks,
  computeDynamicSiblingRanks,
  dataPropertyLinkDistance,
  chargeStrengthForSimNode,
  countStatementDegree,
  forceHubSpokeSpread,
  forceIsolatedNodePark,
  forceLoopEdgeAvoidance,
  forceNetworkStretch,
  gravityStrengthForSimNode,
  isDraggableEdgeLabel,
  isMultiEdge,
  isSelfLink,
  linkLabelPos,
  linkPath,
  loopAnchorLinkDistance,
  placeLoopAnchor,
  statementLinkDistance,
  syncLabelAnchors,
  syncLoopAnchors,
  targetLinkControlPos,
  computeGraphLayoutBounds,
  graphLayoutBoundsSize,
} from '../graphGeometry'
import {
  dataPropertyEdgeLabelLayout,
  dataPropertyLinkLabelPos,
  dataPropertyLinkPath,
  dataPropertyTypeNodeLayout,
  forceDataPropertyAvoidance,
  syncDataPropertyNodes,
} from '../dataPropertyGeometry'
import { getExpressionKindLabel } from '../expressionUtils'
import {
  getStatementCanvasLabel,
  getStatementKind,
  getStatementRenderSpec,
  markerUrl,
  shouldShowStatementCanvasLabel,
} from '../statementUtils'
import { Minimap } from './Minimap'
import { ClassDragTool } from './ClassDragTool'
import { classColorOrDefault, classColorWithAlpha } from '../classColorUtils'

interface OntologyCanvasProps {
  classes: NamedClassNode[]
  expressions: ExpressionNode[]
  edges: OntologyEdge[]
  dataProperties: OntologyDataProperty[]
  showEdgeLabels: boolean
  showDataProperties: boolean
  graphLoadGeneration: number
  unclumpGeneration: number
  onUnclumpActiveChange?: (active: boolean) => void
  selection: Selection | null
  selectedClassIds: ReadonlySet<string>
  editingLabel: Selection | null
  editingDataProperty: EditingDataProperty | null
  onCreateClassAt: (x: number, y: number) => void
  onCreateExpressionAt: (x: number, y: number) => void
  onSelectClass: (id: string, additive: boolean) => void
  onSelectExpression: (id: string) => void
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
  | 'onCreateClassAt'
  | 'onCreateExpressionAt'
  | 'onSelectClass'
  | 'onSelectExpression'
  | 'onSelectClassDataTab'
  | 'onSelectAndEditClass'
  | 'onSelectEdge'
  | 'onSelectAndEditEdge'
  | 'onEditDataProperty'
  | 'onCreateEdge'
  | 'onDeselect'
>

const EXPRESSION_HANDLE_OFFSET = EXPRESSION_HALF + 14

type StatementEndpoint = SimClass | SimExpression
const HANDLE_OFFSET = CLASS_RADIUS + 14
/** Outward-pointing arrowhead (tip along +x, away from node center). */
const HANDLE_TRI_LEN = 19
const HANDLE_TRI_HALF = 11
const HANDLE_ZONE_R = 28

function linkHandlePoints(offset: number) {
  const tipX = offset + HANDLE_TRI_LEN * 0.55
  const baseX = offset - HANDLE_TRI_LEN * 0.45
  return `${tipX},0 ${baseX},${HANDLE_TRI_HALF} ${baseX},${-HANDLE_TRI_HALF}`
}

const LABEL_PAD_X = 12
const LABEL_PAD_Y = 7
const LABEL_MIN_W = 58
const LABEL_TEXT_H = 15

const EXPRESSION_CORE_HALF = EXPRESSION_HALF
const EXPRESSION_RING_HALF = EXPRESSION_HALF + 4
const EXPRESSION_HALO_HALF = EXPRESSION_HALF + 14

const GRAPH_LOAD_REVEAL_ALPHA = 0.052
const GRAPH_LOAD_MAX_WAIT_MS = 8000
const GRAPH_LOAD_FIT_PADDING = 56
const GRAPH_LOAD_FIT_DURATION_MS = 900

export function OntologyCanvas({
  classes,
  expressions,
  edges,
  dataProperties,
  showEdgeLabels,
  showDataProperties,
  graphLoadGeneration,
  unclumpGeneration,
  onUnclumpActiveChange,
  selection,
  selectedClassIds,
  editingLabel,
  editingDataProperty,
  onCreateClassAt,
  onCreateExpressionAt,
  onSelectClass,
  onSelectExpression,
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
  const [isGraphLoadSettling, setIsGraphLoadSettling] = useState(false)
  const [hintExpanded, setHintExpanded] = useState(false)
  const simRef = useRef<d3.Simulation<SimNode, undefined> | null>(null)
  const nodesRef = useRef<SimClass[]>([])
  const expressionNodesRef = useRef<SimExpression[]>([])
  const anchorsRef = useRef<SimLoopAnchor[]>([])
  const labelAnchorsRef = useRef<SimLabelAnchor[]>([])
  const loopLinksRef = useRef<SimLoopLink[]>([])
  const labelAnchorLinksRef = useRef<SimLabelAnchorLink[]>([])
  const linksRef = useRef<SimLink[]>([])
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const transformRef = useRef<ZoomTransform>(d3.zoomIdentity)
  const gRootRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const linkLayerRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const linkHitLayerRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const dragLineLayerRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const nodeLayerRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const expressionLayerRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
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
  /** Free nodes held at drop position until linked or manually dragged. */
  const placementPinnedRef = useRef<Set<string>>(new Set())
  const dragRef = useRef<d3.DragBehavior<SVGGElement, SimClass, SimClass | d3.SubjectPosition> | null>(null)
  const expressionDragRef = useRef<
    d3.DragBehavior<SVGGElement, SimExpression, SimExpression | d3.SubjectPosition> | null
  >(null)
  const dataPropDragRef = useRef<
    d3.DragBehavior<SVGGElement, SimDataProperty, SimDataProperty | d3.SubjectPosition> | null
  >(null)
  const labelDragRef = useRef<d3.DragBehavior<SVGGElement, SimLink, SimLink | d3.SubjectPosition> | null>(null)
  const warmedRef = useRef(false)
  const graphLoadSettleTimerRef = useRef<number | null>(null)
  const graphLoadPollRef = useRef<number | null>(null)
  const graphLoadRevealPendingRef = useRef(false)
  const unclumpAnimFrameRef = useRef<number | null>(null)
  const suppressSimRenderRef = useRef(false)
  const renderSimFrameRef = useRef<(() => void) | null>(null)
  const onUnclumpActiveChangeRef = useRef(onUnclumpActiveChange)
  onUnclumpActiveChangeRef.current = onUnclumpActiveChange
  const lastGraphLoadGenerationRef = useRef(graphLoadGeneration)
  if (graphLoadGeneration !== lastGraphLoadGenerationRef.current) {
    lastGraphLoadGenerationRef.current = graphLoadGeneration
    if (graphLoadGeneration > 0) {
      warmedRef.current = true
      pinnedRef.current.clear()
      placementPinnedRef.current.clear()
    }
  }
  const linkingRef = useRef<{ source: StatementEndpoint; pointerId: number } | null>(null)
  const pendingLoopSpawnRef = useRef<{ edgeId: string; x: number; y: number } | null>(null)
  const startLinkingRef = useRef<(source: StatementEndpoint, ev: PointerEvent) => void>(() => {})
  const callbacksRef = useRef<CanvasCallbacks>({
    onCreateClassAt,
    onCreateExpressionAt,
    onSelectClass,
    onSelectExpression,
    onSelectClassDataTab,
    onSelectAndEditClass,
    onSelectEdge,
    onSelectAndEditEdge,
    onEditDataProperty,
    onCreateEdge,
    onDeselect,
  })

  callbacksRef.current = {
    onCreateClassAt,
    onCreateExpressionAt,
    onSelectClass,
    onSelectExpression,
    onSelectClassDataTab,
    onSelectAndEditClass,
    onSelectEdge,
    onSelectAndEditEdge,
    onEditDataProperty,
    onCreateEdge,
    onDeselect,
  }

  const selectedClassIdsRef = useRef(selectedClassIds)
  selectedClassIdsRef.current = selectedClassIds
  const editingLabelRef = useRef(editingLabel)
  editingLabelRef.current = editingLabel
  const showEdgeLabelsRef = useRef(showEdgeLabels)
  showEdgeLabelsRef.current = showEdgeLabels
  const showDataPropertiesRef = useRef(showDataProperties)
  showDataPropertiesRef.current = showDataProperties
  const visibilityLayoutPrimedRef = useRef(false)

  const applySimulationLayoutVisibility = (sim: d3.Simulation<SimNode, undefined>) => {
    const labelAnchors = showEdgeLabelsRef.current ? labelAnchorsRef.current : []
    const dataProps = showDataPropertiesRef.current ? dataPropsRef.current : []

    syncSimulationNodes(
      sim,
      nodesRef.current,
      expressionNodesRef.current,
      anchorsRef.current,
      labelAnchors,
      dataProps,
    )

    ;(sim.force('labelAnchor') as d3.ForceLink<SimNode, SimLabelAnchorLink>).links(
      showEdgeLabelsRef.current ? labelAnchorLinksRef.current : [],
    )
    ;(sim.force('dataPropLink') as d3.ForceLink<SimNode, SimDataPropertyLink>).links(
      showDataPropertiesRef.current ? dataPropLinksRef.current : [],
    )
  }

  const startGraphLoadSettling = (sim: d3.Simulation<SimNode, undefined>) => {
    if (graphLoadSettleTimerRef.current !== null) {
      window.clearTimeout(graphLoadSettleTimerRef.current)
      graphLoadSettleTimerRef.current = null
    }
    if (graphLoadPollRef.current !== null) {
      window.cancelAnimationFrame(graphLoadPollRef.current)
      graphLoadPollRef.current = null
    }

    const nodeCount =
      nodesRef.current.length +
      expressionNodesRef.current.length +
      dataPropsRef.current.length

    if (nodeCount === 0) {
      graphLoadRevealPendingRef.current = false
      setIsGraphLoadSettling(false)
      return
    }

    graphLoadRevealPendingRef.current = true
    setIsGraphLoadSettling(true)

    warmLayout(sim, Math.min(2400, 600 + nodeCount * 16))

    const loadUnclumpInput = {
      classes: nodesRef.current,
      expressions: expressionNodesRef.current,
      links: linksRef.current,
      dataProperties: showDataPropertiesRef.current ? dataPropsRef.current : [],
      loopAnchors: anchorsRef.current,
      labelAnchors: showEdgeLabelsRef.current ? labelAnchorsRef.current : [],
    }
    // Hub-hold settle already ran inside hidden unclump. Cool quickly and reveal —
    // do not keep alphaTarget warm or alpha never drops below the reveal threshold.
    runHiddenUnclumpResolve(sim, loadUnclumpInput, suppressSimRenderRef)
    sim.alphaTarget(0).alpha(0.35).restart()

    const startedAt = performance.now()

    const finishGraphLoadReveal = () => {
      if (!graphLoadRevealPendingRef.current) return
      graphLoadRevealPendingRef.current = false

      if (graphLoadSettleTimerRef.current !== null) {
        window.clearTimeout(graphLoadSettleTimerRef.current)
        graphLoadSettleTimerRef.current = null
      }
      if (graphLoadPollRef.current !== null) {
        window.cancelAnimationFrame(graphLoadPollRef.current)
        graphLoadPollRef.current = null
      }

      sim.alphaTarget(0).alpha(0)
      setIsGraphLoadSettling(false)
      fitGraphToView(true)
    }

    const poll = () => {
      if (!graphLoadRevealPendingRef.current) return

      const elapsed = performance.now() - startedAt
      if (sim.alpha() < GRAPH_LOAD_REVEAL_ALPHA || elapsed >= GRAPH_LOAD_MAX_WAIT_MS) {
        finishGraphLoadReveal()
        return
      }

      graphLoadPollRef.current = window.requestAnimationFrame(poll)
    }

    graphLoadPollRef.current = window.requestAnimationFrame(poll)
    graphLoadSettleTimerRef.current = window.setTimeout(finishGraphLoadReveal, GRAPH_LOAD_MAX_WAIT_MS)
  }

  const fitGraphToView = (animated: boolean) => {
    const svg = svgRef.current
    const zoom = zoomRef.current
    if (!svg || !zoom) return

    const bounds = computeGraphLayoutBounds({
      classes: nodesRef.current,
      expressions: expressionNodesRef.current,
      dataProperties: showDataPropertiesRef.current ? dataPropsRef.current : [],
      labelAnchors: showEdgeLabelsRef.current ? labelAnchorsRef.current : [],
      loopAnchors: anchorsRef.current,
    })
    if (!bounds) return

    const { width, height } = svg.getBoundingClientRect()
    if (width <= 0 || height <= 0) return

    const layout = graphLayoutBoundsSize(bounds)
    const scale = Math.min(
      (width - GRAPH_LOAD_FIT_PADDING * 2) / layout.width,
      (height - GRAPH_LOAD_FIT_PADDING * 2) / layout.height,
      4,
    )
    const clampedScale = Math.max(0.1, scale)
    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(clampedScale)
      .translate(-layout.centerX, -layout.centerY)

    const svgSelection = d3.select(svg)
    if (animated) {
      svgSelection
        .transition()
        .duration(GRAPH_LOAD_FIT_DURATION_MS)
        .ease(d3.easeCubicOut)
        .call(zoom.transform, transform)
    } else {
      svgSelection.call(zoom.transform, transform)
    }
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

    defs
      .append('marker')
      .attr('id', 'marker-bar')
      .attr('viewBox', '0 -6 10 12')
      .attr('refX', 10)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto')
      .append('path')
      .attr('class', 'bar-path')
      .attr('d', 'M10,-6L10,6')

    defs
      .append('marker')
      .attr('id', 'marker-diamond')
      .attr('viewBox', '-5 -5 10 10')
      .attr('refX', 6)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto')
      .append('path')
      .attr('class', 'diamond-path')
      .attr('d', 'M0,-4L4,0L0,4L-4,0Z')

    const gRoot = svg.append('g').attr('class', 'root')
    const linkLayer = gRoot.append('g').attr('class', 'links')
    const dataPropLinkLayer = gRoot.append('g').attr('class', 'data-prop-links')
    const nodeLayer = gRoot.append('g').attr('class', 'nodes')
    const expressionLayer = gRoot.append('g').attr('class', 'expressions')
    const linkHitLayer = gRoot.append('g').attr('class', 'link-hits')
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
    linkHitLayerRef.current = linkHitLayer
    dataPropLinkLayerRef.current = dataPropLinkLayer
    dragLineLayerRef.current = dragLineLayer
    nodeLayerRef.current = nodeLayer
    expressionLayerRef.current = expressionLayer
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
      expressionLayer
        .selectAll<SVGGElement, SimExpression>('g.expression-node')
        .classed('linking-source link-target', false)
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
        .classed('link-target', (n) => (target?.kind === 'namedClass' ? n.id === target.id : false))
      expressionLayer
        .selectAll<SVGGElement, SimExpression>('g.expression-node')
        .classed('link-target', (n) => (target?.kind === 'expression' ? n.id === target.id : false))
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

    const startLinking = (source: StatementEndpoint, ev: PointerEvent) => {
      if (ev.button !== 0) return
      ev.stopPropagation()
      ev.preventDefault()

      linkingRef.current = { source, pointerId: ev.pointerId }
      nodeLayer
        .selectAll<SVGGElement, SimClass>('g.node')
        .classed('linking-source', (n) => n.kind === 'namedClass' && n.id === source.id)
      expressionLayer
        .selectAll<SVGGElement, SimExpression>('g.expression-node')
        .classed('linking-source', (n) => n.kind === 'expression' && n.id === source.id)

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

    const handleWorldPos = (node: StatementEndpoint) => {
      const offset = node.kind === 'expression' ? EXPRESSION_HANDLE_OFFSET : HANDLE_OFFSET
      return {
        x: (node.x ?? 0) + offset,
        y: node.y ?? 0,
      }
    }

    const findNodeAt = (x: number, y: number): StatementEndpoint | null => {
      let best: StatementEndpoint | null = null
      let bestDist = Infinity

      for (const n of nodesRef.current) {
        const hitR = CLASS_RADIUS + 6
        const dx = (n.x ?? 0) - x
        const dy = (n.y ?? 0) - y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist <= hitR && dist < bestDist) {
          best = n
          bestDist = dist
        }
      }

      for (const n of expressionNodesRef.current) {
        const hitR = EXPRESSION_HALF + 6
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
      if (target.closest('.node, .expression-node, .edge-label, .link-hit, .link-handle, .data-prop-node, .data-prop-edge-label')) return
      nodeLayer.selectAll<SVGGElement, SimClass>('g.node').classed('selected', false)
      expressionLayer.selectAll<SVGGElement, SimExpression>('g.expression-node').classed('selected', false)
      edgeLabelLayer.selectAll<SVGGElement, SimLink>('g.edge-label').classed('selected', false)
      callbacksRef.current.onDeselect()
    })

    svg.on('dblclick.zoom', null)
    svg.on('dblclick', (ev) => {
      const target = ev.target as Element
      if (target.closest('.node, .expression-node, .edge-label, .link-handle, .data-prop-node, .data-prop-edge-label')) return
      ev.preventDefault()
      const [x, y] = d3.pointer(ev, gRoot.node())
      callbacksRef.current.onCreateClassAt(x, y)
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
        placementPinnedRef.current.delete(d.id)
        if (simRef.current) {
          resumeLayoutAfterDrag(
            simRef.current,
            findMaxGravityHub(nodesRef.current, expressionNodesRef.current, linksRef.current),
          )
        }
      })

    const expressionDrag = d3
      .drag<SVGGElement, SimExpression>()
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
        placementPinnedRef.current.delete(d.id)
        if (simRef.current) {
          resumeLayoutAfterDrag(
            simRef.current,
            findMaxGravityHub(nodesRef.current, expressionNodesRef.current, linksRef.current),
          )
        }
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
        resumeLayoutAfterDrag(
          sim,
          findMaxGravityHub(nodesRef.current, expressionNodesRef.current, linksRef.current),
        )
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
        resumeLayoutAfterDrag(
          sim,
          findMaxGravityHub(nodesRef.current, expressionNodesRef.current, linksRef.current),
        )
      })

    const linkForce = d3
      .forceLink<StatementEndpoint, SimLink>([])
      .id((d) => d.id)
      .distance((d) => statementLinkDistance(d))
      .strength((d) => (isSelfLink(d) ? 0 : LINK_STRENGTH))

    const loopLinkForce = d3
      .forceLink<SimNode, SimLoopLink>([])
      .id((d) => d.id)
      .distance((d) => loopAnchorLinkDistance(d))
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
      .distance((link) => dataPropertyLinkDistance(link))
      .strength(DATA_PROPERTY_LINK_STRENGTH)

    const labelRestoreForce = forceLabelRestore(
      () => linksRef.current,
      () => (showEdgeLabelsRef.current ? labelAnchorsRef.current : []),
      LABEL_ANCHOR_RESTORE_STRENGTH,
    )

    const loopEdgeAvoidForce = forceLoopEdgeAvoidance(
      () => linksRef.current,
      () => anchorsRef.current,
      () => nodesRef.current,
      () => (showEdgeLabelsRef.current ? labelAnchorsRef.current : []),
      LOOP_EDGE_AVOID_STRENGTH,
      LOOP_EDGE_AVOID_RANGE,
    )

    const dataPropAvoidForce = forceDataPropertyAvoidance(
      () => (showDataPropertiesRef.current ? dataPropsRef.current : []),
      () => nodesRef.current,
      () => linksRef.current,
      () => anchorsRef.current,
      () => (showEdgeLabelsRef.current ? labelAnchorsRef.current : []),
      DATA_PROPERTY_AVOID_STRENGTH,
      DATA_PROPERTY_AVOID_RANGE,
    )

    const networkStretchForce = forceNetworkStretch(() => linksRef.current)
    const hubSpokeSpreadForce = forceHubSpokeSpread(() => linksRef.current)
    const isolatedParkForce = forceIsolatedNodePark(
      () => [...nodesRef.current, ...expressionNodesRef.current],
      () => linksRef.current,
    )

    const gravityStrength = (d: d3.SimulationNodeDatum) =>
      gravityStrengthForSimNode(d as SimNode, linksRef.current)

    const sim = d3
      .forceSimulation<SimNode>([])
      .force(
        'charge',
        d3
          .forceManyBody<SimNode>()
          .strength((d) => {
            if (isLoopAnchor(d)) return CHARGE_LOOP_ANCHOR
            if (isLabelAnchor(d)) return CHARGE_LABEL_ANCHOR
            if (isDataPropertyNode(d)) return CHARGE_DATA_PROPERTY
            const scaled = chargeStrengthForSimNode(d, linksRef.current)
            if (scaled != null) return scaled
            if (isSimExpression(d)) return CHARGE_EXPRESSION
            return CHARGE_CLASS
          })
          .distanceMin(1),
      )
      .force('link', linkForce)
      .force('loop', loopLinkForce)
      .force('labelAnchor', labelAnchorLinkForce)
      .force('dataPropLink', dataPropLinkForce)
      .force('labelRestore', labelRestoreForce)
      .force('loopEdgeAvoid', loopEdgeAvoidForce)
      .force('dataPropAvoid', dataPropAvoidForce)
      .force('networkStretch', networkStretchForce)
      .force('hubSpokeSpread', hubSpokeSpreadForce)
      .force('isolatedPark', isolatedParkForce)
      .force(
        'collide',
        d3
          .forceCollide<SimNode>()
          .radius((d) => {
            if (isLoopAnchor(d)) return LOOP_COLLIDE_RADIUS
            if (isLabelAnchor(d)) return LABEL_COLLIDE_RADIUS
            if (isDataPropertyNode(d)) {
              const hw = (d._boxWidth ?? DATA_PROPERTY_MIN_WIDTH) / 2
              return Math.max(hw, DATA_PROPERTY_HEIGHT / 2) + Math.round(14 * 1.3)
            }
            if (isSimExpression(d)) return EXPRESSION_HALO_HALF + EXPRESSION_COLLIDE_PADDING
            return CLASS_RADIUS + NODE_COLLIDE_PADDING
          })
          .strength(COLLIDE_STRENGTH),
      )
      .force('x', d3.forceX(0).strength(gravityStrength))
      .force('y', d3.forceY(0).strength(gravityStrength))
      .alphaTarget(0)

    const renderSimFrame = () => {
      bindAnchorsToLinks(
        linksRef.current,
        anchorsRef.current,
        showEdgeLabelsRef.current ? labelAnchorsRef.current : [],
      )

      linkLayer
        .selectAll<SVGPathElement, SimLink>('g.link-g path.link:not(.link-hit), g.link-g path.link-underlay')
        .attr('d', (d) => linkPath(d))

      linkHitLayerRef.current
        ?.selectAll<SVGPathElement, SimLink>('g.link-hit-g path.link-hit')
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

      expressionLayer
        .selectAll<SVGGElement, SimExpression>('g.expression-node')
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
        const classNode = nodesRef.current.find((n) => n.id === id)
        const exprNode = expressionNodesRef.current.find((n) => n.id === id)
        const node = classNode ?? exprNode
        if (node && sim.alpha() < 0.05) {
          node.fx = null
          node.fy = null
          pinnedRef.current.delete(id)
        }
      }
    }

    renderSimFrameRef.current = renderSimFrame

    sim.on('tick', () => {
      if (suppressSimRenderRef.current) return
      renderSimFrame()
    })

    simRef.current = sim
    dragRef.current = drag
    expressionDragRef.current = expressionDrag
    dataPropDragRef.current = dataPropDrag
    labelDragRef.current = labelDrag

    return () => {
      if (dragSettleTimer !== null) {
        window.clearTimeout(dragSettleTimer)
        dragSettleTimer = null
      }
      if (dragSettleCoolRaf !== null) {
        window.cancelAnimationFrame(dragSettleCoolRaf)
        dragSettleCoolRaf = null
      }
      if (unclumpAnimFrameRef.current !== null) {
        window.cancelAnimationFrame(unclumpAnimFrameRef.current)
        unclumpAnimFrameRef.current = null
      }
      onUnclumpActiveChangeRef.current?.(false)
      if (graphLoadSettleTimerRef.current !== null) {
        window.clearTimeout(graphLoadSettleTimerRef.current)
        graphLoadSettleTimerRef.current = null
      }
      if (graphLoadPollRef.current !== null) {
        window.cancelAnimationFrame(graphLoadPollRef.current)
        graphLoadPollRef.current = null
      }
      graphLoadRevealPendingRef.current = false
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
      linkHitLayerRef.current = null
      dragLineLayerRef.current = null
      nodeLayerRef.current = null
      expressionLayerRef.current = null
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

    const classById = new Map(classes.map((c) => [c.id, c]))

    const kept = prev.filter((n) => nextIds.has(n.id))
    if (kept.length !== prev.length) changed = true

    for (const n of kept) {
      const c = classById.get(n.id)
      if (!c) continue
      n.kind = c.kind
      n.label = c.label
      n.tag = c.tag
      n.iri = c.iri
      n.comment = c.comment
      n.expired = c.expired
      n.color = c.color
    }

    const nodes = [...kept]
    const newNodeIds: string[] = []
    const pinForWarmLayout = !warmedRef.current

    for (const c of classes) {
      if (!prevIds.has(c.id)) {
        const x = c.x ?? 0
        const y = c.y ?? 0
        if (pinForWarmLayout) {
          pinnedRef.current.add(c.id)
          nodes.push({ ...c, x, y, fx: x, fy: y, vx: 0, vy: 0 })
        } else {
          // Hold at drop point so users can connect before physics moves it.
          placementPinnedRef.current.add(c.id)
          nodes.push({ ...c, x, y, fx: x, fy: y, vx: 0, vy: 0 })
        }
        newNodeIds.push(c.id)
        changed = true
      }
    }

    nodesRef.current = nodes

    const svg = svgRef.current
    if (svg) aimCenterForces(sim, svg, () => linksRef.current)

    if (changed) {
      applySimulationLayoutVisibility(sim)
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
      nodeEnter.append('text').attr('class', 'node-tag')
      nodeEnter
        .append('circle')
        .attr('class', 'link-handle-zone')
        .attr('cx', HANDLE_OFFSET)
        .attr('cy', 0)
        .attr('r', HANDLE_ZONE_R)
        .on('pointerenter', onHandleZoneEnter)
        .on('pointerleave', onHandleZoneLeave)
      nodeEnter
        .append('polygon')
        .attr('class', 'link-handle')
        .attr('points', linkHandlePoints(HANDLE_OFFSET))
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
        } else {
          g.select<SVGCircleElement>('circle.link-handle-zone')
            .attr('cx', HANDLE_OFFSET)
            .attr('r', HANDLE_ZONE_R)
        }
        // Migrate legacy circle handles → outward triangle.
        g.selectAll('circle.link-handle').remove()
        let handle = g.select<SVGPolygonElement>('polygon.link-handle')
        if (handle.empty()) {
          handle = g
            .append('polygon')
            .attr('class', 'link-handle')
            .on('pointerdown', (ev, d) => {
              startLinkingRef.current(d as StatementEndpoint, ev)
            })
        }
        handle
          .attr('points', linkHandlePoints(HANDLE_OFFSET))
          .on('pointerenter', onHandleZoneEnter)
          .on('pointerleave', onHandleZoneLeave)
      })

      nodeMerged.select('circle.selection-halo').attr('r', CLASS_RADIUS + 14)

      nodeMerged.select('circle.entity-ring').attr('r', CLASS_RADIUS + 4)

      nodeMerged.select('circle.entity-core').attr('r', CLASS_RADIUS)

      nodeMerged.each(function (d) {
        const editingClassId =
          editingLabelRef.current?.kind === 'class' ? editingLabelRef.current.id : null
        paintClassNodeAppearance(d3.select(this), d, {
          selected: selectedClassIdsRef.current.has(d.id),
          editing: d.id === editingClassId,
        })
        paintClassNodeLabels(d3.select(this), d, editingClassId)
      })
    }

    for (const id of [...pinnedRef.current]) {
      if (prev.some((p) => p.id === id) && !nextIds.has(id)) pinnedRef.current.delete(id)
    }
    for (const id of [...placementPinnedRef.current]) {
      if (!nextIds.has(id)) placementPinnedRef.current.delete(id)
    }
  }, [classes.map((c) => c.id).join('|')])

  useEffect(() => {
    const sim = simRef.current
    const expressionLayer = expressionLayerRef.current
    const expressionDrag = expressionDragRef.current
    if (!sim || !expressionLayer || !expressionDrag) return

    const prev = expressionNodesRef.current
    const prevIds = new Set(prev.map((n) => n.id))
    const nextIds = new Set(expressions.map((e) => e.id))

    let changed = false

    const exprById = new Map(expressions.map((e) => [e.id, e]))

    const kept = prev.filter((n) => nextIds.has(n.id))
    if (kept.length !== prev.length) changed = true

    for (const n of kept) {
      const e = exprById.get(n.id)
      if (!e) continue
      n.kind = e.kind
      n.expressionKind = e.expressionKind
    }

    const nodes = [...kept]
    const newNodeIds: string[] = []
    const pinForWarmLayout = !warmedRef.current

    for (const e of expressions) {
      if (!prevIds.has(e.id)) {
        const x = e.x ?? 0
        const y = e.y ?? 0
        if (pinForWarmLayout) {
          pinnedRef.current.add(e.id)
          nodes.push({ ...e, x, y, fx: x, fy: y, vx: 0, vy: 0 })
        } else {
          placementPinnedRef.current.add(e.id)
          nodes.push({ ...e, x, y, fx: x, fy: y, vx: 0, vy: 0 })
        }
        newNodeIds.push(e.id)
        changed = true
      }
    }

    expressionNodesRef.current = nodes

    const svg = svgRef.current
    if (svg) aimCenterForces(sim, svg, () => linksRef.current)

    if (changed) {
      applySimulationLayoutVisibility(sim)
      const newCount = nodes.length - prev.length
      if (!warmedRef.current && nodes.length > 0 && nodesRef.current.length === 0) {
        warmLayout(sim, Math.min(520, 120 + nodes.length * 12))
        warmedRef.current = true
        releasePinnedExpressionNodes(newNodeIds, nodes, pinnedRef.current)
        sim.alpha(0.22).restart()
      } else if (newCount > 0) {
        sim.alpha(Math.min(0.22, 0.1 + newCount * 0.02)).restart()
      }
    }

    const nodeSel = expressionLayer
      .selectAll<SVGGElement, SimExpression>('g.expression-node')
      .data(nodes, (d) => d.id)

    nodeSel.exit().remove()

    const nodeEnter = nodeSel
      .enter()
      .append('g')
      .attr('class', 'expression-node')
      .call(expressionDrag)
      .on('pointerdown', (ev, d) => {
        if (ev.button !== 0) return
        if ((ev.target as Element).closest('.link-handle')) return
        ev.stopPropagation()
        edgeLabelLayerRef.current
          ?.selectAll<SVGGElement, SimLink>('g.edge-label')
          .classed('selected', false)
        nodeLayerRef.current
          ?.selectAll<SVGGElement, SimClass>('g.node')
          .classed('selected', false)
        callbacksRef.current.onSelectExpression(d.id)
      })

    const shapeEnter = nodeEnter.append('g').attr('class', 'expression-shape-group').attr(
      'transform',
      'rotate(45)',
    )
    shapeEnter.append('rect').attr('class', 'selection-halo expression-halo')
    shapeEnter
      .append('rect')
      .attr('class', 'entity-ring expression-ring')
      .attr('fill', 'none')
      .attr('stroke', CLASS_COLOR)
    shapeEnter
      .append('rect')
      .attr('class', 'entity-core expression-core')
      .attr('fill', CLASS_COLOR)
      .attr('stroke', 'var(--entity-core-stroke)')

    nodeEnter.append('text').attr('class', 'node-label')
    nodeEnter
      .append('circle')
      .attr('class', 'link-handle-zone')
      .attr('cx', EXPRESSION_HANDLE_OFFSET)
      .attr('cy', 0)
      .attr('r', HANDLE_ZONE_R)
      .on('pointerenter', onHandleZoneEnter)
      .on('pointerleave', onHandleZoneLeave)
    nodeEnter
      .append('polygon')
      .attr('class', 'link-handle')
      .attr('points', linkHandlePoints(EXPRESSION_HANDLE_OFFSET))
      .on('pointerenter', onHandleZoneEnter)
      .on('pointerleave', onHandleZoneLeave)
      .on('pointerdown', (ev, d) => {
        startLinkingRef.current(d, ev)
      })

    const nodeMerged = nodeEnter.merge(nodeSel)
    nodeMerged.on('pointerleave', onNodePointerLeave)
    nodeMerged.each(function (d) {
      const g = d3.select(this)
      const expr = d as SimExpression
      if (g.select('text.node-label').empty()) {
        g.append('text').attr('class', 'node-label')
      }
      if (g.select('circle.link-handle-zone').empty()) {
        g.append('circle')
          .attr('class', 'link-handle-zone')
          .attr('cx', EXPRESSION_HANDLE_OFFSET)
          .attr('cy', 0)
          .attr('r', HANDLE_ZONE_R)
          .on('pointerenter', onHandleZoneEnter)
          .on('pointerleave', onHandleZoneLeave)
      } else {
        g.select<SVGCircleElement>('circle.link-handle-zone')
          .attr('cx', EXPRESSION_HANDLE_OFFSET)
          .attr('r', HANDLE_ZONE_R)
          .on('pointerenter', onHandleZoneEnter)
          .on('pointerleave', onHandleZoneLeave)
      }
      g.selectAll('circle.link-handle').remove()
      let handle = g.select<SVGPolygonElement>('polygon.link-handle')
      if (handle.empty()) {
        handle = g
          .append('polygon')
          .attr('class', 'link-handle')
          .on('pointerdown', (ev) => {
            startLinkingRef.current(expr, ev)
          })
      } else {
        handle.on('pointerdown', (ev) => {
          startLinkingRef.current(expr, ev)
        })
      }
      handle
        .attr('points', linkHandlePoints(EXPRESSION_HANDLE_OFFSET))
        .on('pointerenter', onHandleZoneEnter)
        .on('pointerleave', onHandleZoneLeave)
    })
    nodeMerged.each(function (d) {
      paintExpressionNodeShapes(d3.select(this), d)
    })

    for (const id of [...pinnedRef.current]) {
      if (prev.some((p) => p.id === id) && !nextIds.has(id)) pinnedRef.current.delete(id)
    }
    for (const id of [...placementPinnedRef.current]) {
      if (!nextIds.has(id)) placementPinnedRef.current.delete(id)
    }
  }, [expressions.map((e) => `${e.id}:${e.expressionKind}`).join('|')])

  useEffect(() => {
    const sim = simRef.current
    const linkLayer = linkLayerRef.current
    const linkHitLayer = linkHitLayerRef.current
    const edgeLabelLayer = edgeLabelLayerRef.current
    if (!sim || !linkLayer || !linkHitLayer || !edgeLabelLayer) return

    const prev = linksRef.current
    const prevSnapshot = prev.map((l) => ({
      id: l.id,
      sourceId: l.sourceId,
      targetId: l.targetId,
      statementKind: getStatementKind(l),
    }))

    const links: SimLink[] = edges.map((e) => {
      const existing = prev.find((l) => l.id === e.id)
      if (existing) {
        existing.label = e.label
        existing.sourceId = e.sourceId
        existing.targetId = e.targetId
        existing.statementKind = e.statementKind
        return existing
      }
      return {
        id: e.id,
        label: e.label,
        sourceId: e.sourceId,
        targetId: e.targetId,
        source: e.sourceId,
        target: e.targetId,
        statementKind: e.statementKind,
      }
    })

    assignParallelOffsets(links)
    linksRef.current = links

    const resolveEndpoint = (id: string) =>
      nodesRef.current.find((n) => n.id === id) ??
      expressionNodesRef.current.find((n) => n.id === id)

    for (const link of links) {
      link.source = resolveEndpoint(link.sourceId) ?? link.source
      link.target = resolveEndpoint(link.targetId) ?? link.target
    }

    // Once a dropped free node is connected, let normal layout take over.
    for (const id of [...placementPinnedRef.current]) {
      if (countStatementDegree(id, links) === 0) continue
      const node = resolveEndpoint(id)
      if (node) {
        node.fx = null
        node.fy = null
      }
      placementPinnedRef.current.delete(id)
    }

    const { anchors, loopLinks } = syncLoopAnchors(edges, nodesRef.current, anchorsRef.current)
    anchorsRef.current = anchors
    loopLinksRef.current = loopLinks

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

    const linkForce = sim.force('link') as d3.ForceLink<StatementEndpoint, SimLink>
    const loopLinkForce = sim.force('loop') as d3.ForceLink<SimNode, SimLoopLink>
    loopLinkForce.links(loopLinks)
    applySimulationLayoutVisibility(sim)

    const prevIds = new Set(prev.map((l) => l.id))
    const changed =
      links.length !== prev.length ||
      links.some((l) => {
        const p = prevSnapshot.find((x) => x.id === l.id)
        if (!p) return true
        return (
          p.statementKind !== getStatementKind(l) ||
          p.sourceId !== l.sourceId ||
          p.targetId !== l.targetId
        )
      })

    linkForce.links(links)
    if (changed) {
      sim.alpha(0.15).restart()
    }

    const linkSel = linkLayer.selectAll<SVGGElement, SimLink>('g.link-g').data(links, (d) => d.id)
    linkSel.exit().remove()

    const linkEnter = linkSel.enter().append('g').attr('class', 'link-g')
    linkEnter.append('path').attr('class', 'link link-underlay').style('display', 'none')
    linkEnter.append('path').attr('class', 'link')

    const linkMerged = linkEnter.merge(linkSel)
    linkMerged.each(function (d) {
      const g = d3.select(this)
      if (g.select('path.link-underlay').empty()) {
        g.append('path').attr('class', 'link link-underlay').style('display', 'none')
      }
      g.select('path.link-hit').remove()
      const eps = statementEndpoints(d)
      const spec = eps
        ? getStatementRenderSpec(getStatementKind(d), eps.source.kind, eps.target.kind)
        : null
      g.classed('link-equiv', spec?.doubleLine ?? false)
      g.select('path.link-underlay').style('display', spec?.doubleLine ? 'block' : 'none')
    })
    paintStatementLinkPaths(linkMerged)

    const linkHitSel = linkHitLayer
      .selectAll<SVGGElement, SimLink>('g.link-hit-g')
      .data(links, (d) => d.id)
    linkHitSel.exit().remove()

    const linkHitEnter = linkHitSel.enter().append('g').attr('class', 'link-hit-g')
    linkHitEnter.append('path').attr('class', 'link-hit')

    const linkHitMerged = linkHitEnter.merge(linkHitSel)
    linkHitMerged.on('pointerdown', (ev, d) => {
      if (ev.button !== 0) return
      if (shouldShowStatementCanvasLabel(getStatementKind(d))) return
      ev.stopPropagation()
      nodeLayerRef.current
        ?.selectAll<SVGGElement, SimClass>('g.node')
        .classed('selected', false)
      expressionLayerRef.current
        ?.selectAll<SVGGElement, SimExpression>('g.expression-node')
        .classed('selected', false)
      edgeLabelLayer
        .selectAll<SVGGElement, SimLink>('g.edge-label')
        .classed('selected', false)
      linkLayer.selectAll<SVGGElement, SimLink>('g.link-g').classed('selected', (l) => l.id === d.id)
      callbacksRef.current.onSelectEdge(d.id)
    })
    linkHitMerged.select('path.link-hit').style('display', (d) =>
      shouldShowStatementCanvasLabel(getStatementKind(d)) ? 'none' : null,
    )

    if (changed) {
      linkLayer
        .selectAll<SVGPathElement, SimLink>('g.link-g path.link:not(.link-hit), g.link-g path.link-underlay')
        .attr('d', (d) => linkPath(d))
      linkHitLayer
        .selectAll<SVGPathElement, SimLink>('g.link-hit-g path.link-hit')
        .attr('d', (d) => linkPath(d))
    } else {
      linkHitLayer
        .selectAll<SVGPathElement, SimLink>('g.link-hit-g path.link-hit')
        .attr('d', (d) => linkPath(d))
    }

    const labelLinks =
      showEdgeLabelsRef.current
        ? links.filter((l) => shouldShowStatementCanvasLabel(getStatementKind(l)))
        : []

    const labelSel = edgeLabelLayer
      .selectAll<SVGGElement, SimLink>('g.edge-label')
      .data(labelLinks, (d) => d.id)

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
        expressionLayerRef.current
          ?.selectAll<SVGGElement, SimExpression>('g.expression-node')
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
        expressionLayerRef.current
          ?.selectAll<SVGGElement, SimExpression>('g.expression-node')
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

    labelMerged.select('text.edge-label-text').text((d) => {
      const edge: OntologyEdge = {
        id: d.id,
        sourceId: d.sourceId,
        targetId: d.targetId,
        label: d.label,
        statementKind: getStatementKind(d),
      }
      return getStatementCanvasLabel(edge) || 'Unnamed'
    })

    labelMerged.each(function (d) {
      const edge: OntologyEdge = {
        id: d.id,
        sourceId: d.sourceId,
        targetId: d.targetId,
        label: d.label,
        statementKind: getStatementKind(d),
      }
      const text = getStatementCanvasLabel(edge) || 'Unnamed'
      const size = labelSize(text)
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
  }, [edges.map((e) => `${e.id}:${e.sourceId}:${e.targetId}:${e.statementKind}`).join('|'), showEdgeLabels])

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

    applySimulationLayoutVisibility(sim)

    const displayNodes = showDataPropertiesRef.current ? nodes : []
    const displayLinks = showDataPropertiesRef.current ? links : []

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
      .data(displayLinks, (d) => d.id)
    linkSel.exit().remove()
    linkSel.enter().append('path').attr('class', 'data-prop-link')

    const nodeSel = dataPropNodeLayer
      .selectAll<SVGGElement, SimDataProperty>('g.data-prop-node')
      .data(displayNodes, (d) => d.id)
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
      .data(displayLinks, (d) => d.id)
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
        const prop = displayNodes.find((n) => n.propertyId === d.propertyId)
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
        const prop = displayNodes.find((n) => n.propertyId === d.propertyId)
        if (!prop) return
        selectDataPropertyClass(prop)
        callbacksRef.current.onEditDataProperty(prop.classId, prop.propertyId, 'label')
      })
    labelMerged.each(function (d) {
      const prop = displayNodes.find((n) => n.propertyId === d.propertyId)
      paintDataPropertyEdgeLabel(d3.select(this), prop?.label ?? '')
    })
  }, [
    dataProperties
      .map((p) => `${p.id}:${p.classId}:${p.label}:${p.datatype}`)
      .join('|'),
    classes.map((c) => c.id).join('|'),
    showDataProperties,
  ])

  useEffect(() => {
    const sim = simRef.current
    if (!sim) return

    applySimulationLayoutVisibility(sim)

    if (visibilityLayoutPrimedRef.current) {
      sim.alpha(0.18).restart()
    } else {
      visibilityLayoutPrimedRef.current = true
    }
  }, [showEdgeLabels, showDataProperties])

  useEffect(() => {
    if (graphLoadGeneration === 0) return

    const sim = simRef.current
    if (!sim) return

    const frameId = window.requestAnimationFrame(() => {
      startGraphLoadSettling(sim)
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [graphLoadGeneration])

  useEffect(() => {
    if (unclumpGeneration === 0) return

    const sim = simRef.current
    if (!sim) return

    const unclumpInput = {
      classes: nodesRef.current,
      expressions: expressionNodesRef.current,
      links: linksRef.current,
      dataProperties: showDataPropertiesRef.current ? dataPropsRef.current : [],
      loopAnchors: anchorsRef.current,
      labelAnchors: showEdgeLabelsRef.current ? labelAnchorsRef.current : [],
    }

    if (computeGraphUnclumpPlan(unclumpInput).length === 0) return

    pinnedRef.current.clear()
    onUnclumpActiveChangeRef.current?.(true)

    if (unclumpAnimFrameRef.current !== null) {
      window.cancelAnimationFrame(unclumpAnimFrameRef.current)
      unclumpAnimFrameRef.current = null
    }

    // Resolve fully off-screen, then show the result in one paint (no glide animation).
    runHiddenUnclumpResolve(sim, unclumpInput, suppressSimRenderRef)
    renderSimFrameRef.current?.()

    const hub = findMaxGravityHub(
      nodesRef.current,
      expressionNodesRef.current,
      linksRef.current,
    )
    onUnclumpActiveChangeRef.current?.(false)
    startLayoutSettling(sim, 'unclump', undefined, hub)

    return () => {
      suppressSimRenderRef.current = false
    }
  }, [unclumpGeneration])

  useEffect(() => {
    const wrap = wrapRef.current
    const sim = simRef.current
    const svg = svgRef.current
    if (!wrap || !sim || !svg) return

    const onResize = () => {
      aimCenterForces(sim, svg, () => linksRef.current)
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
    const expressionLayer = expressionLayerRef.current
    const linkLayer = linkLayerRef.current
    const edgeLabelLayer = edgeLabelLayerRef.current
    const dataPropNodeLayer = dataPropNodeLayerRef.current
    const dataPropLabelLayer = dataPropLabelLayerRef.current
    if (!nodeLayer || !edgeLabelLayer) return

    const labelById = new Map(classes.map((c) => [c.id, c.label]))
    const tagById = new Map(classes.map((c) => [c.id, c.tag]))
    const expiredById = new Map(classes.map((c) => [c.id, c.expired]))
    const colorById = new Map(classes.map((c) => [c.id, c.color]))
    const expressionKindById = new Map(expressions.map((e) => [e.id, e.expressionKind]))
    const edgeById = new Map(edges.map((e) => [e.id, e]))
    const dataPropById = new Map(dataProperties.map((p) => [p.id, p]))

    const selectedEdgeId = selection?.kind === 'edge' ? selection.id : null
    const selectedExpressionId = selection?.kind === 'expression' ? selection.id : null
    const editingClassId = editingLabel?.kind === 'class' ? editingLabel.id : null
    const editingEdgeId = editingLabel?.kind === 'edge' ? editingLabel.id : null
    const editingDataPropId = editingDataProperty?.id ?? null
    const editingDataPropField = editingDataProperty?.field ?? null

    nodeLayer
      .selectAll<SVGGElement, SimClass>('g.node')
      .classed('selected', (d) => selectedClassIds.has(d.id))
      .classed('editing-label', (d) => d.id === editingClassId)
      .classed('expired', (d) => expiredById.get(d.id) ?? d.expired)

    if (expressionLayer) {
      expressionLayer
        .selectAll<SVGGElement, SimExpression>('g.expression-node')
        .classed('selected', (d) => d.id === selectedExpressionId)
        .each(function (d) {
          d.expressionKind = expressionKindById.get(d.id) ?? d.expressionKind
        })

      expressionLayer
        .selectAll<SVGGElement, SimExpression>('g.expression-node text.node-label')
        .text((d) => getExpressionKindLabel(d.expressionKind))
    }

    nodeLayer.selectAll<SVGGElement, SimClass>('g.node').each(function (d) {
      d.label = labelById.get(d.id) ?? d.label
      d.tag = tagById.get(d.id) ?? d.tag
      d.expired = expiredById.get(d.id) ?? d.expired
      d.color = colorById.get(d.id) ?? d.color
      paintClassNodeAppearance(d3.select(this), d, {
        selected: selectedClassIds.has(d.id),
        editing: d.id === editingClassId,
      })
      paintClassNodeLabels(d3.select(this), d, editingClassId)
    })

    edgeLabelLayer
      .selectAll<SVGGElement, SimLink>('g.edge-label')
      .classed('selected', (d) => d.id === selectedEdgeId)
      .classed('editing-label', (d) => d.id === editingEdgeId)

    if (linkLayer) {
      linkLayer
        .selectAll<SVGGElement, SimLink>('g.link-g')
        .classed('selected', (d) => d.id === selectedEdgeId)
    }

    edgeLabelLayer.selectAll<SVGGElement, SimLink>('g.edge-label').each(function (d) {
      const edge = edgeById.get(d.id)
      if (edge) d.label = edge.label
      const display =
        edge && d.id === editingEdgeId
          ? getStatementCanvasLabel(edge) || 'Unnamed'
          : edge
            ? truncate(getStatementCanvasLabel(edge), 24)
            : truncate(d.label, 24)
      const size = labelSize(display)
      const g = d3.select(this)
      g.select('text.edge-label-text').text(display)
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
    expressions,
    edges,
    dataProperties,
  ])

  return (
    <div
      className={`canvas-wrap ${isGraphLoadSettling ? 'canvas-wrap-settling' : ''}`}
      ref={wrapRef}
    >
      <div className="canvas-toolbar">
        <button
          type="button"
          className={`canvas-hint ${hintExpanded ? 'canvas-hint-expanded' : ''}`}
          aria-expanded={hintExpanded}
          onClick={() => setHintExpanded((open) => !open)}
        >
          {hintExpanded ? (
            <span className="canvas-hint-body">
              <strong>Zoom and navigate</strong> by scrolling · <strong>Add a class</strong> by
              double-clicking the canvas or dragging the circle from the tool below ·{' '}
              <strong>Add an expression</strong> by dragging the diamond ·{' '}
              <strong>Connect a node</strong> by dragging its node handle
            </span>
          ) : (
            <span className="canvas-hint-title">How to use this tool?</span>
          )}
          <span className="canvas-hint-chevron" aria-hidden="true">
            {hintExpanded ? '▴' : '▾'}
          </span>
        </button>
      </div>

      <div className="canvas-graph-stage" aria-hidden={isGraphLoadSettling}>
        <svg ref={svgRef} className="graph-canvas" aria-label="Ontology canvas" />

        <ClassDragTool
          wrapRef={wrapRef}
          gRootRef={gRootRef}
          onCreateClassAt={onCreateClassAt}
          onCreateExpressionAt={onCreateExpressionAt}
        />

        <Minimap
          wrapRef={wrapRef}
          svgRef={svgRef}
          nodesRef={nodesRef}
          expressionNodesRef={expressionNodesRef}
          zoomRef={zoomRef}
          transformRef={transformRef}
          gRootRef={gRootRef}
          nodeCount={classes.length + expressions.length}
        />
      </div>

      {isGraphLoadSettling && (
        <div className="canvas-load-overlay" aria-live="polite">
          <span className="canvas-load-overlay-text">Laying out graph…</span>
        </div>
      )}
    </div>
  )
}

function formatClassTagCanvas(tag: string | undefined): string {
  const trimmed = tag?.trim()
  if (!trimmed) return ''
  return `(${truncate(trimmed, 18)})`
}

function paintClassNodeLabels(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  node: SimClass,
  editingClassId: string | null,
) {
  if (g.select('text.node-tag').empty()) {
    g.append('text').attr('class', 'node-tag')
  }

  const tagText = formatClassTagCanvas(node.tag)
  const hasTag = tagText.length > 0
  const nameText =
    node.id === editingClassId ? node.label || 'Unnamed' : truncate(node.label, 34)

  g.select('text.node-label').attr('dy', hasTag ? -6 : 0).text(nameText)
  g.select('text.node-tag')
    .attr('dy', hasTag ? 10 : 0)
    .attr('display', hasTag ? null : 'none')
    .text(tagText)
}

function paintClassNodeAppearance(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  node: SimClass,
  options: { selected?: boolean; editing?: boolean } = {},
) {
  const selected = options.selected ?? false
  const editing = options.editing ?? false
  const color = classColorOrDefault(node.color)
  const halo = g.select<SVGCircleElement>('circle.selection-halo')
  const ring = g.select<SVGCircleElement>('circle.entity-ring')
  const core = g.select<SVGCircleElement>('circle.entity-core')
  const label = g.select<SVGTextElement>('text.node-label')
  const tag = g.select<SVGTextElement>('text.node-tag')
  const ringGlow = `drop-shadow(0 0 8px ${classColorWithAlpha(color, 0.65)}) drop-shadow(0 0 18px ${classColorWithAlpha(color, 0.35)})`

  halo.style('fill', null).style('stroke', null)
  ring.style('stroke', null).style('filter', null)
  label.style('fill', null).style('stroke', null)
  tag.style('fill', null).style('stroke', null)

  if (node.expired) {
    core.style('fill', null).style('stroke', null)
    if (!selected) return

    ring.style('stroke', color).style('filter', `drop-shadow(0 0 8px ${classColorWithAlpha(color, 0.55)})`)
    halo
      .style('fill', classColorWithAlpha(color, editing ? 0.22 : 0.14))
      .style('stroke', classColorWithAlpha(color, editing ? 0.72 : 0.5))
    label.style('fill', null).style('stroke', color)
    tag.style('fill', null).style('stroke', color)
    return
  }

  core.style('fill', color).style('stroke', null)
  ring.style('stroke', color)

  if (!selected) return

  ring.style('filter', ringGlow)
  halo
    .style('fill', classColorWithAlpha(color, editing ? 0.24 : 0.16))
    .style('stroke', classColorWithAlpha(color, editing ? 0.75 : 0.52))
  label.style('fill', null).style('stroke', color)
  tag.style('fill', null).style('stroke', color)
}

function paintExpressionNodeShapes(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  _d: SimExpression,
) {
  const layoutRect = (
    sel: d3.Selection<SVGRectElement, unknown, null, undefined>,
    half: number,
  ) => {
    sel
      .attr('x', -half)
      .attr('y', -half)
      .attr('width', half * 2)
      .attr('height', half * 2)
      .attr('rx', EXPRESSION_CORNER_RADIUS)
      .attr('ry', EXPRESSION_CORNER_RADIUS)
  }

  layoutRect(g.select<SVGRectElement>('rect.expression-halo'), EXPRESSION_HALO_HALF)
  layoutRect(g.select<SVGRectElement>('rect.expression-ring'), EXPRESSION_RING_HALF)
  layoutRect(g.select<SVGRectElement>('rect.expression-core'), EXPRESSION_CORE_HALF)
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

function onHandleZoneEnter(this: Element) {
  setHandleHot(this.parentNode as SVGGElement, true)
}

function onHandleZoneLeave(this: Element, ev: PointerEvent) {
  const parent = this.parentNode as SVGGElement
  const rel = ev.relatedTarget as Node | null
  if (rel && parent.contains(rel)) return
  setHandleHot(parent, false)
}

function statementEndpoints(
  link: SimLink,
): { source: StatementEndpoint; target: StatementEndpoint } | null {
  const source = link.source as StatementEndpoint | string
  const target = link.target as StatementEndpoint | string
  if (typeof source === 'string' || typeof target === 'string') return null
  return { source, target }
}

function paintStatementLinkPaths(
  linkGroups: d3.Selection<SVGGElement, SimLink, SVGGElement | null, unknown>,
) {
  linkGroups.selectAll<SVGPathElement, SimLink>('path.link:not(.link-hit), path.link-underlay').each(function (d) {
    const path = d3.select(this)
    const eps = statementEndpoints(d)
    if (!eps) return
    const spec = getStatementRenderSpec(getStatementKind(d), eps.source.kind, eps.target.kind)
    const isUnderlay = path.classed('link-underlay')
    path
      .attr('class', isUnderlay ? 'link link-underlay' : linkPathClass(d))
      .attr('marker-end', isUnderlay ? '' : markerUrl(spec.markerEnd, 'end') ?? '')
      .attr('marker-start', isUnderlay ? '' : markerUrl(spec.markerStart, 'start') ?? '')
  })
}

function linkPathClass(link: SimLink) {
  const classes = ['link']
  if (isSelfLink(link)) classes.push('link-self')
  const eps = statementEndpoints(link)
  if (eps) {
    const spec = getStatementRenderSpec(
      getStatementKind(link),
      eps.source.kind,
      eps.target.kind,
    )
    if (spec.dashed) classes.push('link-dashed')
    if (spec.doubleLine) classes.push('link-double')
  }
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

function releasePinnedExpressionNodes(
  ids: Iterable<string>,
  nodes: SimExpression[],
  pinned: Set<string>,
) {
  for (const id of ids) {
    const node = nodes.find((n) => n.id === id)
    if (node) {
      node.fx = null
      node.fy = null
    }
    pinned.delete(id)
  }
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
  expressionNodes: SimExpression[] = [],
  loopAnchors: SimLoopAnchor[],
  labelAnchors: SimLabelAnchor[],
  dataProps: SimDataProperty[] = [],
) {
  sim.nodes([...classNodes, ...expressionNodes, ...dataProps, ...loopAnchors, ...labelAnchors])
}

function aimCenterForces(
  sim: d3.Simulation<SimNode, undefined>,
  svg: SVGSVGElement,
  getLinks: () => SimLink[],
) {
  const { width, height } = svg.getBoundingClientRect()
  const cx = width / 2
  const cy = height / 2
  const strength = (d: d3.SimulationNodeDatum) =>
    gravityStrengthForSimNode(d as SimNode, getLinks())
  sim.force('x', d3.forceX(cx).strength(strength))
  sim.force('y', d3.forceY(cy).strength(strength))
}

type GraphUnclumpInput = Parameters<typeof computeGraphUnclumpPlan>[0]

function findMaxGravityHub(
  classes: SimClass[],
  expressions: SimExpression[],
  links: SimLink[],
): StatementEndpoint | null {
  let best: StatementEndpoint | null = null
  let bestStrength = -1
  for (const node of [...classes, ...expressions]) {
    const strength = gravityStrengthForSimNode(node, links)
    if (strength > bestStrength) {
      bestStrength = strength
      best = node
    }
  }
  return best
}

/** Same as click-and-hold on a hub: pin it and keep the sim warm so spokes settle. */
function pinHubLikeDragHold(hub: StatementEndpoint) {
  hub.vx = 0
  hub.vy = 0
  hub.fx = hub.x
  hub.fy = hub.y
}

function unpinHub(hub: StatementEndpoint) {
  hub.fx = null
  hub.fy = null
}

function runHubHoldSettle(
  sim: d3.Simulation<SimNode, undefined>,
  hub: StatementEndpoint | null,
  ticks = UNCLUMP_HUB_HOLD_TICKS,
) {
  if (!hub) return
  pinHubLikeDragHold(hub)
  sim.alphaTarget(UNCLUMP_HUB_HOLD_ALPHA_TARGET).alpha(Math.max(sim.alpha(), 0.45))
  for (let i = 0; i < ticks; i++) sim.tick()
  sim.alphaTarget(0)
  unpinHub(hub)
}

/** Multi-pass radial resolve (hidden). Mutates node positions in place. */
function runHiddenUnclumpResolve(
  sim: d3.Simulation<SimNode, undefined>,
  input: GraphUnclumpInput,
  suppressSimRender: { current: boolean },
): boolean {
  if (computeGraphUnclumpPlan(input).length === 0) return false

  suppressSimRender.current = true
  sim.stop()

  for (let pass = 0; pass < UNCLUMP_RESOLVE_PASSES; pass++) {
    applyUnclumpPass(input)
    sim.alpha(Math.max(sim.alpha(), 0.38))
    for (let tick = 0; tick < UNCLUMP_SIM_TICKS_PER_PASS; tick++) sim.tick()
  }

  runHubHoldSettle(
    sim,
    findMaxGravityHub(input.classes, input.expressions, input.links),
  )

  suppressSimRender.current = false
  return true
}

/**
 * After drag: match a click/hold on the gravity hub — pin it, keep alphaTarget at 0.3,
 * then cool. A plain click feels better because drag-start already does that for the
 * pressed node; release used to unpin everything and settle cooler with no anchor.
 */
function resumeLayoutAfterDrag(
  sim: d3.Simulation<SimNode, undefined>,
  holdHub?: StatementEndpoint | null,
) {
  startLayoutSettling(sim, 'drag', undefined, holdHub)
}

let dragSettleTimer: number | null = null
let dragSettleCoolRaf: number | null = null

function finishDragSettle(
  sim: d3.Simulation<SimNode, undefined>,
  holdHub: StatementEndpoint | null | undefined,
  onComplete?: () => void,
) {
  sim.alphaTarget(0).alpha(0)
  if (holdHub) {
    holdHub.vx = 0
    holdHub.vy = 0
    unpinHub(holdHub)
  }
  onComplete?.()
}

function startLayoutSettling(
  sim: d3.Simulation<SimNode, undefined>,
  mode: 'drag' | 'unclump',
  onComplete?: () => void,
  holdHub?: StatementEndpoint | null,
) {
  if (dragSettleTimer !== null) window.clearTimeout(dragSettleTimer)
  if (dragSettleCoolRaf !== null) {
    window.cancelAnimationFrame(dragSettleCoolRaf)
    dragSettleCoolRaf = null
  }
  if (holdHub) pinHubLikeDragHold(holdHub)

  if (mode === 'unclump') {
    // Hub-hold physics already ran hidden; briefly accelerate, then cool to a hard stop.
    sim.alphaTarget(0).alpha(0.7).restart()
    dragSettleTimer = window.setTimeout(() => {
      dragSettleTimer = null
      finishDragSettle(sim, holdHub, onComplete)
    }, UNCLUMP_SETTLE_MS)
    return
  }

  // Warm settle with hub fixed (same as click/hold), then cool BEFORE unpinning —
  // unpinning while alpha is still ~0.3 causes the end-of-settle twitch.
  sim.alphaTarget(DRAG_SETTLE_ALPHA_TARGET).alpha(DRAG_SETTLE_ALPHA).restart()
  dragSettleTimer = window.setTimeout(() => {
    dragSettleTimer = null
    sim.alphaTarget(0)

    const coolThenUnpin = () => {
      dragSettleCoolRaf = null
      if (sim.alpha() > DRAG_SETTLE_UNPIN_ALPHA) {
        dragSettleCoolRaf = window.requestAnimationFrame(coolThenUnpin)
        return
      }
      finishDragSettle(sim, holdHub, onComplete)
    }
    dragSettleCoolRaf = window.requestAnimationFrame(coolThenUnpin)
  }, DRAG_SETTLE_MS)
}

function warmLayout(sim: d3.Simulation<SimNode, undefined>, maxTicks = 400) {
  sim.alpha(1)
  for (let i = 0; i < maxTicks; i++) {
    sim.tick()
    if (sim.alpha() < 0.015 && i > 80) break
  }
  sim.alpha(0)
}

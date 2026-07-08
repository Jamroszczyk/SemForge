import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import type { ZoomTransform } from 'd3'
import type { SimClass } from '../types'
import { CLASS_COLOR, CLASS_RADIUS } from '../types'

interface MinimapProps {
  wrapRef: React.RefObject<HTMLDivElement | null>
  svgRef: React.RefObject<SVGSVGElement | null>
  nodesRef: React.RefObject<SimClass[]>
  zoomRef: React.RefObject<d3.ZoomBehavior<SVGSVGElement, unknown> | null>
  transformRef: React.RefObject<ZoomTransform>
  gRootRef: React.RefObject<d3.Selection<SVGGElement, unknown, null, undefined> | null>
  nodeCount: number
}

const MINI_W = 160
const MINI_H = 110
const PAD = 12

export function Minimap({
  wrapRef,
  svgRef,
  nodesRef,
  zoomRef,
  transformRef,
  gRootRef,
  nodeCount,
}: MinimapProps) {
  const miniSvgRef = useRef<SVGSVGElement>(null)
  const [viewport, setViewport] = useState({ x: 0, y: 0, w: MINI_W, h: MINI_H })
  const scaleRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })

  const refresh = useCallback(() => {
    const miniSvg = miniSvgRef.current
    const mainSvg = svgRef.current
    const gRoot = gRootRef.current
    if (!miniSvg || !mainSvg) return

    const nodes = nodesRef.current ?? []
    const { width, height } = mainSvg.getBoundingClientRect()
    const t = transformRef.current ?? d3.zoomIdentity

    let minX = -200
    let minY = -200
    let maxX = 200
    let maxY = 200

    nodes.forEach((n) => {
      if (n.x == null || n.y == null) return
      minX = Math.min(minX, n.x - CLASS_RADIUS)
      minY = Math.min(minY, n.y - CLASS_RADIUS)
      maxX = Math.max(maxX, n.x + CLASS_RADIUS)
      maxY = Math.max(maxY, n.y + CLASS_RADIUS)
    })

    const bw = Math.max(maxX - minX, 120)
    const bh = Math.max(maxY - minY, 120)
    const scale = Math.min((MINI_W - PAD * 2) / bw, (MINI_H - PAD * 2) / bh)
    const ox = (MINI_W - bw * scale) / 2 - minX * scale
    const oy = (MINI_H - bh * scale) / 2 - minY * scale

    scaleRef.current = scale
    offsetRef.current = { x: ox, y: oy }

    const g = d3.select(miniSvg).select<SVGGElement>('g.content')
    g.selectAll<SVGCircleElement, SimClass>('circle.node-dot')
      .data(nodes, (d) => d.id)
      .join('circle')
      .attr('class', 'node-dot')
      .attr('r', 3)
      .attr('cx', (d) => (d.x ?? 0) * scale + ox)
      .attr('cy', (d) => (d.y ?? 0) * scale + oy)
      .attr('fill', CLASS_COLOR)

    const vx0 = -t.x / t.k
    const vy0 = -t.y / t.k
    const vx1 = (width - t.x) / t.k
    const vy1 = (height - t.y) / t.k

    setViewport({
      x: vx0 * scale + ox,
      y: vy0 * scale + oy,
      w: Math.max(8, (vx1 - vx0) * scale),
      h: Math.max(8, (vy1 - vy0) * scale),
    })

    if (gRoot && nodes.length > 0) {
      try {
        gRoot.node()?.getBBox()
      } catch {
        /* empty graph */
      }
    }
  }, [svgRef, nodesRef, transformRef, gRootRef])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const onZoom = () => refresh()
    wrap.addEventListener('zoomchange', onZoom)
    const interval = setInterval(refresh, 200)

    return () => {
      wrap.removeEventListener('zoomchange', onZoom)
      clearInterval(interval)
    }
  }, [wrapRef, refresh])

  useEffect(() => {
    refresh()
  }, [refresh, nodeCount])

  const navigateTo = (clientX: number, clientY: number) => {
    const miniSvg = miniSvgRef.current
    const mainSvg = svgRef.current
    const zoom = zoomRef.current
    if (!miniSvg || !mainSvg || !zoom) return

    const rect = miniSvg.getBoundingClientRect()
    const mx = clientX - rect.left
    const my = clientY - rect.top
    const { x: ox, y: oy } = offsetRef.current
    const scale = scaleRef.current
    const gx = (mx - ox) / scale
    const gy = (my - oy) / scale

    const { width, height } = mainSvg.getBoundingClientRect()
    const t = transformRef.current ?? d3.zoomIdentity
    const tx = width / 2 - gx * t.k
    const ty = height / 2 - gy * t.k

    d3.select(mainSvg)
      .transition()
      .duration(250)
      .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(t.k))
  }

  return (
    <div className="minimap">
      <div className="minimap-label">Overview</div>
      <svg
        ref={miniSvgRef}
        width={MINI_W}
        height={MINI_H}
        className="minimap-svg"
        onClick={(e) => navigateTo(e.clientX, e.clientY)}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          navigateTo(e.clientX, e.clientY)
        }}
      >
        <g className="content" />
        <rect
          className="minimap-viewport"
          x={viewport.x}
          y={viewport.y}
          width={viewport.w}
          height={viewport.h}
          pointerEvents="none"
        />
      </svg>
    </div>
  )
}

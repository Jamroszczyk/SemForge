import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import * as d3 from 'd3'
import type { Selection } from 'd3'

type PaletteTool = 'class' | 'expression'

interface ClassDragToolProps {
  wrapRef: RefObject<HTMLDivElement | null>
  gRootRef: RefObject<Selection<SVGGElement, unknown, null, undefined> | null>
  onCreateClassAt: (x: number, y: number) => void
  onCreateExpressionAt: (x: number, y: number) => void
}

function ClassNodePreview({ className }: { className?: string }) {
  return (
    <div className={`class-drag-node-preview ${className ?? ''}`} aria-hidden>
      <span className="class-drag-node-ring" />
      <span className="class-drag-node-core" />
    </div>
  )
}

function ExpressionNodePreview({ className }: { className?: string }) {
  return (
    <div className={`expression-drag-node-preview ${className ?? ''}`} aria-hidden>
      <span className="expression-drag-node-ring" />
      <span className="expression-drag-node-core" />
    </div>
  )
}

function isInsideRect(clientX: number, clientY: number, rect: DOMRect) {
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  )
}

export function ClassDragTool({
  wrapRef,
  gRootRef,
  onCreateClassAt,
  onCreateExpressionAt,
}: ClassDragToolProps) {
  const paletteRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; draggedOffPalette: boolean; tool: PaletteTool } | null>(
    null,
  )
  const [dragging, setDragging] = useState(false)
  const [activeTool, setActiveTool] = useState<PaletteTool>('class')
  const [draggedOffPalette, setDraggedOffPalette] = useState(false)
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 })
  const [overCanvas, setOverCanvas] = useState(false)

  const clientToGraph = useCallback(
    (clientX: number, clientY: number) => {
      const gRoot = gRootRef.current?.node()
      if (!gRoot) return null
      return d3.pointer({ clientX, clientY } as PointerEvent, gRoot)
    },
    [gRootRef],
  )

  const isInsideCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const wrap = wrapRef.current
      if (!wrap) return false
      return isInsideRect(clientX, clientY, wrap.getBoundingClientRect())
    },
    [wrapRef],
  )

  const isInsidePalette = useCallback((clientX: number, clientY: number) => {
    const palette = paletteRef.current
    if (!palette) return false
    return isInsideRect(clientX, clientY, palette.getBoundingClientRect())
  }, [])

  const isValidDropTarget = useCallback(
    (clientX: number, clientY: number) => {
      return isInsideCanvas(clientX, clientY) && !isInsidePalette(clientX, clientY)
    },
    [isInsideCanvas, isInsidePalette],
  )

  useEffect(() => {
    if (!dragging) return

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || e.pointerId !== drag.pointerId) return

      if (!drag.draggedOffPalette && !isInsidePalette(e.clientX, e.clientY)) {
        drag.draggedOffPalette = true
        setDraggedOffPalette(true)
      }

      setGhostPos({ x: e.clientX, y: e.clientY })
      setOverCanvas(isValidDropTarget(e.clientX, e.clientY))
    }

    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || e.pointerId !== drag.pointerId) return

      if (drag.draggedOffPalette && isValidDropTarget(e.clientX, e.clientY)) {
        const pt = clientToGraph(e.clientX, e.clientY)
        if (pt) {
          if (drag.tool === 'expression') onCreateExpressionAt(pt[0], pt[1])
          else onCreateClassAt(pt[0], pt[1])
        }
      }

      dragRef.current = null
      setDragging(false)
      setDraggedOffPalette(false)
      setOverCanvas(false)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragging, clientToGraph, isInsidePalette, isValidDropTarget, onCreateClassAt, onCreateExpressionAt])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    wrap.classList.toggle('canvas-wrap-drop-target', dragging && draggedOffPalette && overCanvas)
    return () => wrap.classList.remove('canvas-wrap-drop-target')
  }, [dragging, draggedOffPalette, overCanvas, wrapRef])

  const onPointerDown = (tool: PaletteTool) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { pointerId: e.pointerId, draggedOffPalette: false, tool }
    setActiveTool(tool)
    setGhostPos({ x: e.clientX, y: e.clientY })
    setDraggedOffPalette(false)
    setOverCanvas(false)
    setDragging(true)
  }

  return (
    <>
      <div className="canvas-drag-palette-wrap" ref={paletteRef}>
        <div className="canvas-drag-palette">
          <button
            type="button"
            className={`canvas-drag-tool-handle ${dragging && activeTool === 'expression' ? 'dragging' : ''}`}
            aria-label="Drag to canvas to add an expression"
            onPointerDown={onPointerDown('expression')}
          >
            <span className="canvas-drag-tool-tooltip">Expression</span>
            <ExpressionNodePreview />
          </button>
          <button
            type="button"
            className={`canvas-drag-tool-handle ${dragging && activeTool === 'class' ? 'dragging' : ''}`}
            aria-label="Drag to canvas to add a class"
            onPointerDown={onPointerDown('class')}
          >
            <span className="canvas-drag-tool-tooltip">Class</span>
            <ClassNodePreview />
          </button>
        </div>
      </div>

      {dragging && draggedOffPalette && (
        <div
          className={`class-drag-ghost ${overCanvas ? 'over-canvas' : ''}`}
          style={{ left: ghostPos.x, top: ghostPos.y }}
          aria-hidden
        >
          {activeTool === 'expression' ? (
            <ExpressionNodePreview className="expression-drag-node-preview-ghost" />
          ) : (
            <ClassNodePreview className="class-drag-node-preview-ghost" />
          )}
        </div>
      )}
    </>
  )
}

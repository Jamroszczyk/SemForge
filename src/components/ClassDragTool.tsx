import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import * as d3 from 'd3'
import type { Selection } from 'd3'

interface ClassDragToolProps {
  wrapRef: RefObject<HTMLDivElement | null>
  gRootRef: RefObject<Selection<SVGGElement, unknown, null, undefined> | null>
  onCreateAt: (x: number, y: number) => void
}

function ClassNodePreview({ className }: { className?: string }) {
  return (
    <div className={`class-drag-node-preview ${className ?? ''}`} aria-hidden>
      <span className="class-drag-node-ring" />
      <span className="class-drag-node-core" />
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

export function ClassDragTool({ wrapRef, gRootRef, onCreateAt }: ClassDragToolProps) {
  const paletteRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; draggedOffPalette: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)
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
        if (pt) onCreateAt(pt[0], pt[1])
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
  }, [dragging, clientToGraph, isInsidePalette, isValidDropTarget, onCreateAt])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    wrap.classList.toggle('canvas-wrap-drop-target', dragging && draggedOffPalette && overCanvas)
    return () => wrap.classList.remove('canvas-wrap-drop-target')
  }, [dragging, draggedOffPalette, overCanvas, wrapRef])

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { pointerId: e.pointerId, draggedOffPalette: false }
    setGhostPos({ x: e.clientX, y: e.clientY })
    setDraggedOffPalette(false)
    setOverCanvas(false)
    setDragging(true)
  }

  return (
    <>
      <div className="class-drag-tool" ref={paletteRef}>
        <button
          type="button"
          className={`class-drag-tool-handle ${dragging ? 'dragging' : ''}`}
          aria-label="Drag to canvas to add a class"
          onPointerDown={onPointerDown}
        >
          <ClassNodePreview />
        </button>
      </div>

      {dragging && draggedOffPalette && (
        <div
          className={`class-drag-ghost ${overCanvas ? 'over-canvas' : ''}`}
          style={{ left: ghostPos.x, top: ghostPos.y }}
          aria-hidden
        >
          <ClassNodePreview className="class-drag-node-preview-ghost" />
        </div>
      )}
    </>
  )
}

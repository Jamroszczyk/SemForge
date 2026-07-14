import { useCallback, useState } from 'react'
import { nextNewClassLabel } from '../classListUtils'
import type {
  OntologyClass,
  OntologyDataProperty,
  OntologyEdge,
  EditingDataProperty,
  Selection,
} from '../types'
import { DEFAULT_DATATYPE, cycleEdgeDirection, edgeEndpointsForClassContext, getEdgeDirectionPhase } from '../types'

function newId() {
  return crypto.randomUUID()
}

export type DeleteTarget =
  | { kind: 'class'; id: string; label: string }
  | {
      kind: 'classes'
      ids: string[]
      labels: string[]
      edgeCount: number
      dataPropCount: number
    }
  | { kind: 'edge'; id: string; label: string }
  | { kind: 'dataProperty'; id: string; label: string }
  | { kind: 'objectProperty'; id: string; label: string }

export function useOntologyState() {
  const [classes, setClasses] = useState<OntologyClass[]>([])
  const [edges, setEdges] = useState<OntologyEdge[]>([])
  const [dataProperties, setDataProperties] = useState<OntologyDataProperty[]>([])
  const [selection, setSelection] = useState<Selection | null>(null)
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(() => new Set())
  const [editingLabel, setEditingLabel] = useState<Selection | null>(null)
  const [editingDataProperty, setEditingDataProperty] = useState<EditingDataProperty | null>(null)
  const [propertyTab, setPropertyTab] = useState<'data' | 'object'>('data')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [hiddenClassIds, setHiddenClassIds] = useState<Set<string>>(() => new Set())

  const createClassAt = useCallback((x: number, y: number) => {
    const id = newId()
    setClasses((prev) => {
      const label = nextNewClassLabel(prev.map((c) => c.label))
      const node: OntologyClass = { id, label, x, y }
      return [...prev, node]
    })
    setSelection({ kind: 'class', id })
    setSelectedClassIds(new Set([id]))
    return id
  }, [])

  const createEdge = useCallback((sourceId: string, targetId: string) => {
    const id = newId()
    setEdges((prev) => [...prev, { id, sourceId, targetId, label: 'relation' }])
    setSelection({ kind: 'edge', id })
    setSelectedClassIds(new Set())
    return id
  }, [])

  const createEdgeBetween = useCallback(
    (
      leftId: string,
      rightId: string,
      phase: 0 | 1 | 2,
      options?: { keepClassSelection?: boolean; classId?: string; label?: string },
    ) => {
      const id = newId()
      const endpoints = edgeEndpointsForClassContext(leftId, rightId, phase)
      const label = options?.label?.trim() || 'relation'

      setEdges((prev) => [
        ...prev,
        {
          id,
          ...endpoints,
          label,
        },
      ])

      if (options?.keepClassSelection && options.classId) {
        setSelection({ kind: 'class', id: options.classId })
      } else {
        setSelection({ kind: 'edge', id })
        setSelectedClassIds(new Set())
      }
      return id
    },
    [],
  )

  const updateClassLabel = useCallback((id: string, label: string) => {
    setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)))
  }, [])

  const updateEdgeLabel = useCallback((id: string, label: string) => {
    setEdges((prev) => prev.map((e) => (e.id === id ? { ...e, label } : e)))
  }, [])

  const updateEdgeLineStyle = useCallback((id: string, lineStyle: 'solid' | 'dashed') => {
    setEdges((prev) => prev.map((e) => (e.id === id ? { ...e, lineStyle } : e)))
  }, [])

  const cycleEdgeDirectionById = useCallback((id: string) => {
    setEdges((prev) =>
      prev.map((e) => (e.id === id ? cycleEdgeDirection(e) : e)),
    )
  }, [])

  const updateEdgeOtherClass = useCallback(
    (edgeId: string, classId: string, newOtherId: string) => {
      setEdges((prev) =>
        prev.map((edge) => {
          if (edge.id !== edgeId) return edge
          const phase = getEdgeDirectionPhase(edge)
          return {
            ...edge,
            ...edgeEndpointsForClassContext(classId, newOtherId, phase),
          }
        }),
      )
    },
    [],
  )

  const commitClassLabel = useCallback((id: string) => {
    setClasses((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, label: c.label.trim() || 'Unnamed' } : c,
      ),
    )
  }, [])

  const commitEdgeLabel = useCallback((id: string) => {
    setEdges((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, label: e.label.trim() || 'Unnamed' } : e,
      ),
    )
  }, [])

  const deleteClasses = useCallback((ids: string[]) => {
    if (ids.length === 0) return

    const idSet = new Set(ids)
    setClasses((prev) => prev.filter((c) => !idSet.has(c.id)))
    setEdges((prev) =>
      prev.filter((e) => !idSet.has(e.sourceId) && !idSet.has(e.targetId)),
    )
    setDataProperties((prev) => prev.filter((p) => !idSet.has(p.classId)))
    setSelection((cur) => (cur?.kind === 'class' && idSet.has(cur.id) ? null : cur))
    setSelectedClassIds((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      return next
    })
    setEditingLabel((cur) => (cur?.kind === 'class' && idSet.has(cur.id) ? null : cur))
    setEditingDataProperty(null)
    setDeleteTarget(null)
    setHiddenClassIds((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const id of ids) {
        if (next.delete(id)) changed = true
      }
      return changed ? next : prev
    })
  }, [])

  const deleteClass = useCallback(
    (id: string) => {
      deleteClasses([id])
    },
    [deleteClasses],
  )

  const deleteEdge = useCallback((id: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== id))
    setSelection((cur) => (cur?.kind === 'edge' && cur.id === id ? null : cur))
    setEditingLabel((cur) => (cur?.kind === 'edge' && cur.id === id ? null : cur))
    setDeleteTarget(null)
  }, [])

  const clearSelection = useCallback(() => {
    setSelection(null)
    setSelectedClassIds(new Set())
  }, [])

  const selectClass = useCallback((id: string, additive = false) => {
    if (!additive) {
      setSelectedClassIds(new Set([id]))
      setSelection({ kind: 'class', id })
      return
    }

    setSelectedClassIds((prev) => {
      const next = new Set(prev)
      const wasSelected = next.has(id)
      if (wasSelected) next.delete(id)
      else next.add(id)

      setSelection((cur) => {
        if (!wasSelected) return { kind: 'class', id }
        if (cur?.kind !== 'class' || cur.id !== id) return cur
        const remaining = [...next]
        if (remaining.length === 0) return null
        return { kind: 'class', id: remaining[remaining.length - 1] }
      })

      return next
    })
  }, [])

  const selectEdge = useCallback((id: string) => {
    setSelection({ kind: 'edge', id })
    setSelectedClassIds(new Set())
  }, [])

  const deselectClass = useCallback((id: string) => {
    setSelectedClassIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)

      setSelection((cur) => {
        if (cur?.kind !== 'class' || cur.id !== id) return cur
        const remaining = [...next]
        if (remaining.length === 0) return null
        return { kind: 'class', id: remaining[remaining.length - 1] }
      })

      return next
    })
  }, [])

  const requestDelete = useCallback((target: DeleteTarget) => {
    setDeleteTarget(target)
  }, [])

  const cancelDelete = useCallback(() => {
    setDeleteTarget(null)
  }, [])

  const toggleClassVisibility = useCallback((id: string) => {
    setHiddenClassIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const addDataProperty = useCallback((classId: string) => {
    const id = newId()
    setDataProperties((prev) => {
      const count = prev.filter((p) => p.classId === classId).length
      return [
        ...prev,
        {
          id,
          classId,
          label: `property${count + 1}`,
          datatype: DEFAULT_DATATYPE,
        },
      ]
    })
    return id
  }, [])

  const updateDataProperty = useCallback(
    (id: string, patch: Partial<Pick<OntologyDataProperty, 'label' | 'datatype'>>) => {
      setDataProperties((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      )
    },
    [],
  )

  const removeDataProperty = useCallback((id: string) => {
    setDataProperties((prev) => prev.filter((p) => p.id !== id))
    setEditingDataProperty((cur) => (cur?.id === id ? null : cur))
    setDeleteTarget(null)
  }, [])

  const commitDataProperty = useCallback((id: string) => {
    setDataProperties((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              label: p.label.trim() || 'property',
              datatype: p.datatype.trim() || DEFAULT_DATATYPE,
            }
          : p,
      ),
    )
  }, [])

  const selectedClass =
    selection?.kind === 'class' ? classes.find((c) => c.id === selection.id) ?? null : null

  const selectedEdge =
    selection?.kind === 'edge' ? edges.find((e) => e.id === selection.id) ?? null : null

  return {
    classes,
    edges,
    dataProperties,
    selection,
    selectedClassIds,
    editingLabel,
    editingDataProperty,
    propertyTab,
    deleteTarget,
    hiddenClassIds,
    selectedClass,
    selectedEdge,
    createClassAt,
    createEdge,
    createEdgeBetween,
    updateClassLabel,
    updateEdgeLabel,
    updateEdgeLineStyle,
    cycleEdgeDirectionById,
    updateEdgeOtherClass,
    commitClassLabel,
    commitEdgeLabel,
    deleteClass,
    deleteClasses,
    deleteEdge,
    addDataProperty,
    updateDataProperty,
    removeDataProperty,
    commitDataProperty,
    selectClass,
    selectEdge,
    deselectClass,
    clearSelection,
    setEditingLabel,
    setEditingDataProperty,
    setPropertyTab,
    requestDelete,
    cancelDelete,
    toggleClassVisibility,
  }
}

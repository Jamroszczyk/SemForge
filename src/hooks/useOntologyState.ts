import { useCallback, useState } from 'react'
import type {
  OntologyClass,
  OntologyDataProperty,
  OntologyEdge,
  EditingDataProperty,
  Selection,
  SelectionKind,
} from '../types'
import { DEFAULT_DATATYPE, cycleEdgeDirection } from '../types'

function newId() {
  return crypto.randomUUID()
}

export interface DeleteTarget {
  kind: SelectionKind
  id: string
  label: string
}

export function useOntologyState() {
  const [classes, setClasses] = useState<OntologyClass[]>([])
  const [edges, setEdges] = useState<OntologyEdge[]>([])
  const [dataProperties, setDataProperties] = useState<OntologyDataProperty[]>([])
  const [selection, setSelection] = useState<Selection | null>(null)
  const [editingLabel, setEditingLabel] = useState<Selection | null>(null)
  const [editingDataProperty, setEditingDataProperty] = useState<EditingDataProperty | null>(null)
  const [propertyTab, setPropertyTab] = useState<'data' | 'object'>('data')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  const createClassAt = useCallback((x: number, y: number) => {
    const id = newId()
    const node: OntologyClass = { id, label: 'NewClass', x, y }
    setClasses((prev) => [...prev, node])
    setSelection({ kind: 'class', id })
    return id
  }, [])

  const createEdge = useCallback((sourceId: string, targetId: string) => {
    const id = newId()
    setEdges((prev) => [...prev, { id, sourceId, targetId, label: 'relation' }])
    setSelection({ kind: 'edge', id })
    return id
  }, [])

  const updateClassLabel = useCallback((id: string, label: string) => {
    setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)))
  }, [])

  const updateEdgeLabel = useCallback((id: string, label: string) => {
    setEdges((prev) => prev.map((e) => (e.id === id ? { ...e, label } : e)))
  }, [])

  const cycleEdgeDirectionById = useCallback((id: string) => {
    setEdges((prev) =>
      prev.map((e) => (e.id === id ? cycleEdgeDirection(e) : e)),
    )
  }, [])

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

  const deleteClass = useCallback((id: string) => {
    setClasses((prev) => prev.filter((c) => c.id !== id))
    setEdges((prev) => prev.filter((e) => e.sourceId !== id && e.targetId !== id))
    setDataProperties((prev) => prev.filter((p) => p.classId !== id))
    setSelection((cur) => (cur?.kind === 'class' && cur.id === id ? null : cur))
    setEditingLabel((cur) => (cur?.kind === 'class' && cur.id === id ? null : cur))
    setEditingDataProperty(null)
    setDeleteTarget(null)
  }, [])

  const deleteEdge = useCallback((id: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== id))
    setSelection((cur) => (cur?.kind === 'edge' && cur.id === id ? null : cur))
    setEditingLabel((cur) => (cur?.kind === 'edge' && cur.id === id ? null : cur))
    setDeleteTarget(null)
  }, [])

  const select = useCallback((sel: Selection | null) => {
    setSelection(sel)
  }, [])

  const requestDelete = useCallback((target: DeleteTarget) => {
    setDeleteTarget(target)
  }, [])

  const cancelDelete = useCallback(() => {
    setDeleteTarget(null)
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
    editingLabel,
    editingDataProperty,
    propertyTab,
    deleteTarget,
    selectedClass,
    selectedEdge,
    createClassAt,
    createEdge,
    updateClassLabel,
    updateEdgeLabel,
    cycleEdgeDirectionById,
    commitClassLabel,
    commitEdgeLabel,
    deleteClass,
    deleteEdge,
    addDataProperty,
    updateDataProperty,
    removeDataProperty,
    commitDataProperty,
    select,
    setEditingLabel,
    setEditingDataProperty,
    setPropertyTab,
    requestDelete,
    cancelDelete,
  }
}

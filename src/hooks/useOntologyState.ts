import { useCallback, useState } from 'react'
import { nextNewClassLabel } from '../classListUtils'
import { DEFAULT_EXPRESSION_KIND } from '../expressionUtils'
import { iriFragmentFromLabel } from '../namedClassUtils'
import {
  applyStatementKindChange,
  inferStatementKind,
  labelForStatementKind,
  nodeKindById,
  swapStatementEndpoints,
} from '../statementUtils'
import type {
  ExpressionKind,
  ExpressionNode,
  NamedClassNode,
  OntologyDataProperty,
  OntologyEdge,
  EditingDataProperty,
  Selection,
  StatementKind,
} from '../types'
import type { OntologyGraphDocument } from '../ontologyGraphIO'
import { DEFAULT_DATATYPE, CLASS_COLOR } from '../types'

export type NamedClassPatch = Partial<Pick<NamedClassNode, 'label' | 'tag' | 'iri' | 'comment' | 'expired' | 'color'>>

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
  | { kind: 'expression'; id: string; label: string }
  | { kind: 'dataProperty'; id: string; label: string }
  | { kind: 'objectProperty'; id: string; label: string }

export function useOntologyState() {
  const [classes, setClasses] = useState<NamedClassNode[]>([])
  const [expressions, setExpressions] = useState<ExpressionNode[]>([])
  const [edges, setEdges] = useState<OntologyEdge[]>([])
  const [dataProperties, setDataProperties] = useState<OntologyDataProperty[]>([])
  const [selection, setSelection] = useState<Selection | null>(null)
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(() => new Set())
  const [editingLabel, setEditingLabel] = useState<Selection | null>(null)
  const [editingDataProperty, setEditingDataProperty] = useState<EditingDataProperty | null>(null)
  const [propertyTab, setPropertyTab] = useState<'data' | 'object'>('data')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [hiddenClassIds, setHiddenClassIds] = useState<Set<string>>(() => new Set())
  const [graphLoadGeneration, setGraphLoadGeneration] = useState(0)

  const createClassAt = useCallback((x: number, y: number) => {
    const id = newId()
    setClasses((prev) => {
      const label = nextNewClassLabel(prev.map((c) => c.label))
      const node: NamedClassNode = {
        id,
        kind: 'namedClass',
        label,
        tag: '',
        iri: iriFragmentFromLabel(label),
        comment: '',
        expired: false,
        color: CLASS_COLOR,
        x,
        y,
      }
      return [...prev, node]
    })
    setSelection({ kind: 'class', id })
    setSelectedClassIds(new Set([id]))
    return id
  }, [])

  const createExpressionAt = useCallback((x: number, y: number) => {
    const id = newId()
    const node: ExpressionNode = {
      id,
      kind: 'expression',
      expressionKind: DEFAULT_EXPRESSION_KIND,
      x,
      y,
    }
    setExpressions((prev) => [...prev, node])
    setSelection({ kind: 'expression', id })
    setSelectedClassIds(new Set())
    return id
  }, [])

  const createEdge = useCallback(
    (sourceId: string, targetId: string) => {
      const id = newId()
      const sourceKind = nodeKindById(sourceId, classes, expressions) ?? 'namedClass'
      const targetKind = nodeKindById(targetId, classes, expressions) ?? 'namedClass'
      const statementKind = inferStatementKind(sourceKind, targetKind)
      setEdges((prev) => [
        ...prev,
        {
          id,
          sourceId,
          targetId,
          statementKind,
          label: labelForStatementKind(statementKind),
        },
      ])
      setSelection({ kind: 'edge', id })
      setSelectedClassIds(new Set())
      return id
    },
    [classes, expressions],
  )

  const createStatementBetween = useCallback(
    (
      sourceId: string,
      targetId: string,
      statementKind: StatementKind,
      options?: {
        keepClassSelection?: boolean
        classId?: string
        keepExpressionSelection?: boolean
        expressionId?: string
        label?: string
      },
    ) => {
      const id = newId()
      const label = labelForStatementKind(statementKind, options?.label)

      setEdges((prev) => [
        ...prev,
        {
          id,
          sourceId,
          targetId,
          statementKind,
          label,
        },
      ])

      if (options?.keepClassSelection && options.classId) {
        setSelection({ kind: 'class', id: options.classId })
      } else if (options?.keepExpressionSelection && options.expressionId) {
        setSelection({ kind: 'expression', id: options.expressionId })
      } else {
        setSelection({ kind: 'edge', id })
        setSelectedClassIds(new Set())
      }
      return id
    },
    [],
  )

  const updateNamedClass = useCallback((id: string, patch: NamedClassPatch) => {
    setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }, [])

  const updateClassLabel = useCallback(
    (id: string, label: string) => {
      updateNamedClass(id, { label })
    },
    [updateNamedClass],
  )

  const updateExpressionKind = useCallback((id: string, expressionKind: ExpressionKind) => {
    setExpressions((prev) =>
      prev.map((e) => (e.id === id ? { ...e, expressionKind } : e)),
    )
  }, [])

  const updateEdgeLabel = useCallback((id: string, label: string) => {
    setEdges((prev) => prev.map((e) => (e.id === id ? { ...e, label } : e)))
  }, [])

  const updateStatementKind = useCallback((id: string, statementKind: StatementKind) => {
    setEdges((prev) =>
      prev.map((e) => (e.id === id ? applyStatementKindChange(e, statementKind) : e)),
    )
  }, [])

  const swapStatementEndpointsById = useCallback((id: string) => {
    setEdges((prev) => prev.map((e) => (e.id === id ? swapStatementEndpoints(e) : e)))
  }, [])

  const updateStatementEndpoint = useCallback(
    (edgeId: string, endpoint: 'source' | 'target', nodeId: string) => {
      setEdges((prev) =>
        prev.map((edge) => {
          if (edge.id !== edgeId) return edge
          if (endpoint === 'source') {
            if (edge.sourceId === nodeId) return edge
            return { ...edge, sourceId: nodeId }
          }
          if (edge.targetId === nodeId) return edge
          return { ...edge, targetId: nodeId }
        }),
      )
    },
    [],
  )

  const updateEdgeOtherClass = useCallback(
    (edgeId: string, anchorClassId: string, newOtherId: string) => {
      setEdges((prev) =>
        prev.map((edge) => {
          if (edge.id !== edgeId) return edge
          if (edge.sourceId === anchorClassId) {
            return { ...edge, targetId: newOtherId }
          }
          if (edge.targetId === anchorClassId) {
            return { ...edge, sourceId: newOtherId }
          }
          return edge
        }),
      )
    },
    [],
  )

  const commitNamedClass = useCallback((id: string) => {
    setClasses((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c
        const label = c.label.trim() || 'Unnamed'
        const iri = c.iri.trim() || iriFragmentFromLabel(label)
        return { ...c, label, iri, tag: c.tag.trim(), comment: c.comment.trim() }
      }),
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

  const deleteExpression = useCallback((id: string) => {
    setExpressions((prev) => prev.filter((e) => e.id !== id))
    setEdges((prev) => prev.filter((e) => e.sourceId !== id && e.targetId !== id))
    setSelection((cur) => (cur?.kind === 'expression' && cur.id === id ? null : cur))
    setDeleteTarget(null)
  }, [])

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

  const selectExpression = useCallback((id: string) => {
    setSelection({ kind: 'expression', id })
    setSelectedClassIds(new Set())
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

  const loadGraph = useCallback((doc: OntologyGraphDocument) => {
    setClasses(doc.classes)
    setExpressions(doc.expressions)
    setEdges(doc.edges)
    setDataProperties(doc.dataProperties)
    setHiddenClassIds(new Set(doc.hiddenClassIds))
    setSelection(null)
    setSelectedClassIds(new Set())
    setEditingLabel(null)
    setEditingDataProperty(null)
    setDeleteTarget(null)
    setGraphLoadGeneration((n) => n + 1)
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

  const selectedExpression =
    selection?.kind === 'expression'
      ? expressions.find((e) => e.id === selection.id) ?? null
      : null

  const selectedEdge =
    selection?.kind === 'edge' ? edges.find((e) => e.id === selection.id) ?? null : null

  return {
    classes,
    expressions,
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
    selectedExpression,
    selectedEdge,
    createClassAt,
    createExpressionAt,
    createEdge,
    createStatementBetween,
    updateNamedClass,
    updateClassLabel,
    updateExpressionKind,
    updateEdgeLabel,
    updateStatementKind,
    swapStatementEndpointsById,
    updateStatementEndpoint,
    updateEdgeOtherClass,
    commitNamedClass,
    commitEdgeLabel,
    deleteClass,
    deleteClasses,
    deleteExpression,
    deleteEdge,
    addDataProperty,
    updateDataProperty,
    removeDataProperty,
    commitDataProperty,
    selectClass,
    selectExpression,
    selectEdge,
    deselectClass,
    clearSelection,
    setEditingLabel,
    setEditingDataProperty,
    setPropertyTab,
    requestDelete,
    cancelDelete,
    toggleClassVisibility,
    loadGraph,
    graphLoadGeneration,
  }
}

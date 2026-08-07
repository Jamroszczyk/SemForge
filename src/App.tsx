import { useEffect, useMemo, useState } from 'react'
import { useOntologyState } from './hooks/useOntologyState'
import { useTheme } from './hooks/useTheme'
import { OntologyCanvas } from './components/OntologyCanvas'
import { ClassListSidebar } from './components/ClassListSidebar'
import { PropertiesSidebar } from './components/PropertiesSidebar'
import { DeleteConfirmModal } from './components/DeleteConfirmModal'
import { ThemeToggle } from './components/ThemeToggle'
import { GraphTransferButtons } from './components/GraphTransferButtons'
import { CanvasViewToggles } from './components/CanvasViewToggles'
import type { DataPropertyField, ExpressionKind, Selection, StatementKind } from './types'
import {
  buildOntologyGraphDocument,
  downloadOntologyGraphDocument,
  readOntologyGraphFile,
} from './ontologyGraphIO'
import { getEdgeOtherClassId } from './types'
import { getExpressionKindLabel } from './expressionUtils'
import { getStatementCanvasLabel } from './statementUtils'
import ontologyCanvasLogo from './assets/ontology_canvas_logo.svg'
import './App.css'

const LEFT_SIDEBAR_COLLAPSED_KEY = 'semforge.leftSidebarCollapsed'
const SHOW_EDGE_LABELS_KEY = 'semforge.showEdgeLabels'
const SHOW_DATA_PROPERTIES_KEY = 'semforge.showDataProperties'

function readLeftSidebarCollapsed() {
  try {
    return localStorage.getItem(LEFT_SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function readStoredBoolean(key: string, defaultValue: boolean) {
  try {
    const value = localStorage.getItem(key)
    if (value === null) return defaultValue
    return value === '1'
  } catch {
    return defaultValue
  }
}

function writeStoredBoolean(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* ignore storage errors */
  }
}

function App() {
  const {
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
    selectedClass,
    selectedEdge,
    selectedExpression,
    createClassAt,
    createExpressionAt,
    createEdge,
    createStatementBetween,
    updateClassLabel,
    updateNamedClass,
    updateEdgeLabel,
    updateStatementKind,
    swapStatementEndpointsById,
    updateStatementEndpoint,
    updateEdgeOtherClass,
    commitNamedClass,
    commitEdgeLabel,
    commitDataProperty,
    deleteClass,
    deleteClasses,
    deleteEdge,
    deleteExpression,
    addDataProperty,
    updateDataProperty,
    removeDataProperty,
    selectClass,
    selectEdge,
    selectExpression,
    deselectClass,
    clearSelection,
    setEditingLabel,
    setEditingDataProperty,
    setPropertyTab,
    requestDelete,
    cancelDelete,
    toggleClassVisibility,
    hiddenClassIds,
    updateExpressionKind,
    loadGraph,
    graphLoadGeneration,
  } = useOntologyState()

  const { theme, toggleTheme } = useTheme()

  const [leftCollapsed, setLeftCollapsed] = useState(readLeftSidebarCollapsed)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)
  const [showEdgeLabels, setShowEdgeLabels] = useState(() => readStoredBoolean(SHOW_EDGE_LABELS_KEY, true))
  const [showDataProperties, setShowDataProperties] = useState(() =>
    readStoredBoolean(SHOW_DATA_PROPERTIES_KEY, true),
  )
  const [unclumpGeneration, setUnclumpGeneration] = useState(0)
  const [unclumpActive, setUnclumpActive] = useState(false)

  const openRightSidebar = () => setRightSidebarOpen(true)

  const handleToggleLeftSidebar = () => {
    setLeftCollapsed((collapsed) => {
      const next = !collapsed
      try {
        localStorage.setItem(LEFT_SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        /* ignore storage errors */
      }
      return next
    })
  }

  const handleShowEdgeLabelsChange = (value: boolean) => {
    setShowEdgeLabels(value)
    writeStoredBoolean(SHOW_EDGE_LABELS_KEY, value)
  }

  const handleShowDataPropertiesChange = (value: boolean) => {
    setShowDataProperties(value)
    writeStoredBoolean(SHOW_DATA_PROPERTIES_KEY, value)
  }

  const hiddenClassKey = [...hiddenClassIds].sort().join('|')
  const selectedClassKey = [...selectedClassIds].sort().join('|')

  const visibleClasses = useMemo(
    () => classes.filter((c) => !hiddenClassIds.has(c.id)),
    [classes, hiddenClassKey],
  )

  const visibleEdges = useMemo(
    () =>
      edges.filter(
        (e) => !hiddenClassIds.has(e.sourceId) && !hiddenClassIds.has(e.targetId),
      ),
    [edges, hiddenClassKey],
  )

  const visibleDataProperties = useMemo(
    () => dataProperties.filter((p) => !hiddenClassIds.has(p.classId)),
    [dataProperties, hiddenClassKey],
  )

  const commitClassOrEdgeLabel = (sel: Selection | null) => {
    if (!sel) return
    if (sel.kind === 'class') commitNamedClass(sel.id)
    else commitEdgeLabel(sel.id)
  }

  const finishAllEditing = () => {
    if (editingLabel) commitClassOrEdgeLabel(editingLabel)
    if (editingDataProperty) commitDataProperty(editingDataProperty.id)
    setEditingLabel(null)
    setEditingDataProperty(null)
  }

  const handleCloseRightSidebar = () => {
    finishAllEditing()
    setRightSidebarOpen(false)
  }

  const openClassSidebar = (id: string, tab: 'data' | 'object' = 'data') => {
    finishAllEditing()
    selectClass(id)
    setPropertyTab(tab)
    openRightSidebar()
  }

  const handleSelectClass = (id: string, additive = false) => {
    finishAllEditing()
    selectClass(id, additive)
    openRightSidebar()
  }

  const handleSelectClassDataTab = (id: string) => {
    openClassSidebar(id, 'data')
  }

  const handleSelectEdge = (id: string) => {
    finishAllEditing()
    selectEdge(id)
    openRightSidebar()
  }

  const handleSelectExpression = (id: string) => {
    finishAllEditing()
    selectExpression(id)
    openRightSidebar()
  }

  const handleSelectAndEditClass = (id: string) => {
    finishAllEditing()
    selectClass(id)
    setEditingLabel({ kind: 'class', id })
    setPropertyTab('data')
    openRightSidebar()
  }

  const handleSelectAndEditEdge = (id: string) => {
    finishAllEditing()
    selectEdge(id)
    setEditingLabel({ kind: 'edge', id })
    openRightSidebar()
  }

  const handleEditDataProperty = (
    classId: string,
    propertyId: string,
    field: DataPropertyField,
  ) => {
    finishAllEditing()
    selectClass(classId)
    setPropertyTab('data')
    setEditingDataProperty({ id: propertyId, field })
    openRightSidebar()
  }

  const handleCreateClassAt = (x: number, y: number) => {
    finishAllEditing()
    const id = createClassAt(x, y)
    setEditingLabel({ kind: 'class', id })
    setPropertyTab('data')
    openRightSidebar()
  }

  const handleCreateExpressionAt = (x: number, y: number) => {
    finishAllEditing()
    createExpressionAt(x, y)
    openRightSidebar()
  }

  const handleCreateEdge = (sourceId: string, targetId: string) => {
    const id = createEdge(sourceId, targetId)
    openRightSidebar()
    return id
  }

  const handleDeselect = () => {
    finishAllEditing()
    clearSelection()
  }

  const handleToggleClassVisibility = (id: string) => {
    const willHide = !hiddenClassIds.has(id)
    toggleClassVisibility(id)

    if (!willHide) return

    deselectClass(id)

    if (selection?.kind === 'edge') {
      const edge = edges.find((e) => e.id === selection.id)
      if (edge && (edge.sourceId === id || edge.targetId === id)) {
        handleDeselect()
        return
      }
    }

    if (editingDataProperty) {
      const prop = dataProperties.find((p) => p.id === editingDataProperty.id)
      if (prop?.classId === id) handleDeselect()
    }
  }

  const handleFinishEditing = () => {
    if (editingLabel) commitClassOrEdgeLabel(editingLabel)
    setEditingLabel(null)
  }

  const handleStartEditing = () => {
    if (selection) {
      setEditingDataProperty(null)
      setEditingLabel(selection)
    }
  }

  const handleFinishDataPropertyEditing = () => {
    if (!editingDataProperty) return
    commitDataProperty(editingDataProperty.id)
    setEditingDataProperty(null)
  }

  const handleStartDataPropertyEditing = (id: string, field: DataPropertyField) => {
    if (editingLabel) commitClassOrEdgeLabel(editingLabel)
    setEditingLabel(null)
    setEditingDataProperty({ id, field })
  }

  const handleLabelChange = (label: string) => {
    if (!selection) return
    if (selection.kind === 'class') updateClassLabel(selection.id, label)
    else updateEdgeLabel(selection.id, label)
  }

  const handleIriChange = (iri: string) => {
    if (selection?.kind !== 'class') return
    updateNamedClass(selection.id, { iri })
  }

  const handleCommentChange = (comment: string) => {
    if (selection?.kind !== 'class') return
    updateNamedClass(selection.id, { comment })
  }

  const handleTagChange = (tag: string) => {
    if (selection?.kind !== 'class') return
    updateNamedClass(selection.id, { tag })
  }

  const handleExpiredChange = (expired: boolean) => {
    if (selection?.kind !== 'class') return
    updateNamedClass(selection.id, { expired })
  }

  const handleColorChange = (color: string) => {
    if (selection?.kind !== 'class') return
    updateNamedClass(selection.id, { color })
  }

  const handleCommitNamedClass = () => {
    if (selection?.kind !== 'class') return
    commitNamedClass(selection.id)
  }

  const handleSwapStatementEndpoints = (edgeId: string) => {
    swapStatementEndpointsById(edgeId)
  }

  const handleDeleteRequest = () => {
    if (selectedClassIds.size > 1) {
      const ids = [...selectedClassIds]
      const labels = ids.map((id) => classes.find((c) => c.id === id)?.label ?? 'Unnamed')
      const idSet = new Set(ids)
      const edgeCount = edges.filter(
        (e) => idSet.has(e.sourceId) || idSet.has(e.targetId),
      ).length
      const dataPropCount = dataProperties.filter((p) => idSet.has(p.classId)).length
      requestDelete({ kind: 'classes', ids, labels, edgeCount, dataPropCount })
      return
    }

    if (!selection) return
    if (selection.kind === 'class' && selectedClass) {
      requestDelete({ kind: 'class', id: selection.id, label: selectedClass.label })
    } else if (selection.kind === 'edge' && selectedEdge) {
      requestDelete({
        kind: 'edge',
        id: selection.id,
        label: getStatementCanvasLabel(selectedEdge),
      })
    } else if (selection.kind === 'expression' && selectedExpression) {
      requestDelete({
        kind: 'expression',
        id: selection.id,
        label: getExpressionKindLabel(selectedExpression.expressionKind),
      })
    }
  }

  const handleExpressionKindChange = (kind: ExpressionKind) => {
    if (selection?.kind !== 'expression') return
    updateExpressionKind(selection.id, kind)
  }

  const selectedEdgeMeta =
    selectedEdge && selection?.kind === 'edge'
      ? {
          edge: selectedEdge,
          sourceId: selectedEdge.sourceId,
          targetId: selectedEdge.targetId,
        }
      : null

  const classObjectEdges =
    selection?.kind === 'class'
      ? edges
          .filter(
            (edge) =>
              edge.sourceId === selection.id || edge.targetId === selection.id,
          )
          .map((edge) => ({
            edge,
            anchorId: selection.id,
            otherId: getEdgeOtherClassId(edge, selection.id),
          }))
          .reverse()
      : []

  const expressionObjectEdges =
    selection?.kind === 'expression'
      ? edges
          .filter(
            (edge) =>
              edge.sourceId === selection.id || edge.targetId === selection.id,
          )
          .map((edge) => ({
            edge,
            anchorId: selection.id,
            otherId: getEdgeOtherClassId(edge, selection.id),
          }))
          .reverse()
      : []

  const classDataProperties =
    selection?.kind === 'class'
      ? dataProperties.filter((p) => p.classId === selection.id).reverse()
      : []

  const handleAddStatement = (
    sourceId: string,
    targetId: string,
    statementKind: StatementKind,
    label: string,
  ) => {
    if (selection?.kind === 'class') {
      createStatementBetween(sourceId, targetId, statementKind, {
        keepClassSelection: true,
        classId: selection.id,
        label,
      })
      return
    }
    if (selection?.kind === 'expression') {
      createStatementBetween(sourceId, targetId, statementKind, {
        keepExpressionSelection: true,
        expressionId: selection.id,
        label,
      })
    }
  }

  const handleChangeObjectEdgeOther = (edgeId: string, otherId: string) => {
    if (!otherId) return
    if (selection?.kind === 'class') {
      updateEdgeOtherClass(edgeId, selection.id, otherId)
      return
    }
    if (selection?.kind === 'expression') {
      updateEdgeOtherClass(edgeId, selection.id, otherId)
    }
  }

  const handleChangeEdgeTarget = (edgeId: string, nodeId: string) => {
    if (!nodeId) return
    updateStatementEndpoint(edgeId, 'target', nodeId)
  }

  const handleChangeEdgeSource = (edgeId: string, nodeId: string) => {
    if (!nodeId) return
    updateStatementEndpoint(edgeId, 'source', nodeId)
  }

  const handleRequestRemoveDataProperty = (id: string) => {
    const prop = dataProperties.find((p) => p.id === id)
    if (!prop) return
    requestDelete({ kind: 'dataProperty', id, label: prop.label })
  }

  const handleRequestRemoveObjectEdge = (edgeId: string) => {
    const edge = edges.find((e) => e.id === edgeId)
    if (!edge) return
    requestDelete({ kind: 'objectProperty', id: edgeId, label: edge.label })
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (deleteTarget || editingLabel || editingDataProperty) return
      if (selectedClassIds.size === 0 && !selection) return

      const el = document.activeElement
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      e.preventDefault()
      handleDeleteRequest()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    selection,
    selectedClassKey,
    deleteTarget,
    editingLabel,
    editingDataProperty,
    selectedClass,
    selectedEdge,
    selectedExpression,
    classes,
    edges,
    dataProperties,
  ])

  const handleDownloadGraph = () => {
    const doc = buildOntologyGraphDocument({
      classes,
      expressions,
      edges,
      dataProperties,
      hiddenClassIds,
    })
    downloadOntologyGraphDocument(doc)
  }

  const handleUploadGraph = async (file: File) => {
    try {
      const doc = await readOntologyGraphFile(file)
      loadGraph(doc)
      setRightSidebarOpen(false)
      setEditingLabel(null)
      setEditingDataProperty(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load graph file'
      window.alert(message)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img
            src={ontologyCanvasLogo}
            alt="Ontology Canvas"
            className="brand-logo"
            width={180}
            height={23}
          />
        </div>
        <div className="topbar-actions">
          <CanvasViewToggles
            showEdgeLabels={showEdgeLabels}
            showDataProperties={showDataProperties}
            onShowEdgeLabelsChange={handleShowEdgeLabelsChange}
            onShowDataPropertiesChange={handleShowDataPropertiesChange}
          />
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            disabled={unclumpActive}
            onClick={() => {
              if (unclumpActive) return
              setUnclumpGeneration((n) => n + 1)
            }}
            aria-label="Untangle Graph"
            title="Untangle Graph"
          >
            <img src="/untangle.svg" alt="" className="topbar-transfer-icon" width={18} height={18} />
          </button>
          <GraphTransferButtons onDownload={handleDownloadGraph} onUpload={handleUploadGraph} />
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      <main className="app-main">
        <ClassListSidebar
          classes={classes}
          selectedClassIds={selectedClassIds}
          hiddenClassIds={hiddenClassIds}
          collapsed={leftCollapsed}
          onToggle={handleToggleLeftSidebar}
          onSelect={handleSelectClass}
          onToggleVisibility={handleToggleClassVisibility}
        />

        <OntologyCanvas
          classes={visibleClasses}
          expressions={expressions}
          edges={visibleEdges}
          dataProperties={visibleDataProperties}
          showEdgeLabels={showEdgeLabels}
          showDataProperties={showDataProperties}
          graphLoadGeneration={graphLoadGeneration}
          unclumpGeneration={unclumpGeneration}
          onUnclumpActiveChange={setUnclumpActive}
          selection={selection}
          selectedClassIds={selectedClassIds}
          editingLabel={editingLabel}
          editingDataProperty={editingDataProperty}
          onCreateClassAt={handleCreateClassAt}
          onCreateExpressionAt={handleCreateExpressionAt}
          onSelectClass={handleSelectClass}
          onSelectExpression={handleSelectExpression}
          onSelectClassDataTab={handleSelectClassDataTab}
          onSelectAndEditClass={handleSelectAndEditClass}
          onSelectEdge={handleSelectEdge}
          onSelectAndEditEdge={handleSelectAndEditEdge}
          onEditDataProperty={handleEditDataProperty}
          onCreateEdge={handleCreateEdge}
          onDeselect={handleDeselect}
        />

        <PropertiesSidebar
          open={rightSidebarOpen}
          selectedClass={selection?.kind === 'class' ? selectedClass : null}
          selectedExpression={selection?.kind === 'expression' ? selectedExpression : null}
          selectedClassCount={selectedClassIds.size}
          selectedEdge={selectedEdgeMeta}
          classDataProperties={classDataProperties}
          classObjectEdges={classObjectEdges}
          expressionObjectEdges={expressionObjectEdges}
          allClasses={classes}
          allExpressions={expressions}
          propertyTab={propertyTab}
          editingLabel={
            editingLabel !== null &&
            selection !== null &&
            editingLabel.kind === selection.kind &&
            editingLabel.id === selection.id
          }
          editingDataProperty={editingDataProperty}
          onClose={handleCloseRightSidebar}
          onPropertyTabChange={setPropertyTab}
          onLabelChange={handleLabelChange}
          onTagChange={handleTagChange}
          onIriChange={handleIriChange}
          onCommentChange={handleCommentChange}
          onExpiredChange={handleExpiredChange}
          onColorChange={handleColorChange}
          onCommitNamedClass={handleCommitNamedClass}
          onExpressionKindChange={handleExpressionKindChange}
          onUpdateStatementKind={updateStatementKind}
          onSwapStatementEndpoints={handleSwapStatementEndpoints}
          onUpdateStatementSource={handleChangeEdgeSource}
          onUpdateStatementTarget={handleChangeEdgeTarget}
          onStartEditing={handleStartEditing}
          onFinishEditing={handleFinishEditing}
          onStartDataPropertyEditing={handleStartDataPropertyEditing}
          onFinishDataPropertyEditing={handleFinishDataPropertyEditing}
          onDelete={handleDeleteRequest}
          onAddDataProperty={addDataProperty}
          onUpdateDataProperty={updateDataProperty}
          onRequestRemoveDataProperty={handleRequestRemoveDataProperty}
          onChangeObjectEdgeOther={handleChangeObjectEdgeOther}
          onRequestRemoveObjectEdge={handleRequestRemoveObjectEdge}
          onUpdateObjectEdgeLabel={updateEdgeLabel}
          onCommitObjectEdgeLabel={commitEdgeLabel}
          onAddStatement={handleAddStatement}
        />
      </main>

      {deleteTarget && (
        <DeleteConfirmModal
          kind={deleteTarget.kind}
          label={'label' in deleteTarget ? deleteTarget.label : ''}
          classLabels={deleteTarget.kind === 'classes' ? deleteTarget.labels : undefined}
          edgeCount={deleteTarget.kind === 'classes' ? deleteTarget.edgeCount : undefined}
          dataPropCount={deleteTarget.kind === 'classes' ? deleteTarget.dataPropCount : undefined}
          onConfirm={() => {
            if (deleteTarget.kind === 'class') deleteClass(deleteTarget.id)
            else if (deleteTarget.kind === 'classes') deleteClasses(deleteTarget.ids)
            else if (deleteTarget.kind === 'dataProperty') removeDataProperty(deleteTarget.id)
            else if (deleteTarget.kind === 'expression') deleteExpression(deleteTarget.id)
            else deleteEdge(deleteTarget.id)
          }}
          onCancel={cancelDelete}
        />
      )}
    </div>
  )
}

export default App

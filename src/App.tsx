import { useEffect, useMemo, useState } from 'react'
import { useOntologyState } from './hooks/useOntologyState'
import { useTheme } from './hooks/useTheme'
import { OntologyCanvas } from './components/OntologyCanvas'
import { ClassListSidebar } from './components/ClassListSidebar'
import { PropertiesSidebar } from './components/PropertiesSidebar'
import { DeleteConfirmModal } from './components/DeleteConfirmModal'
import { ThemeToggle } from './components/ThemeToggle'
import type { DataPropertyField, Selection } from './types'
import { getEdgeAnchorClassId, getEdgeArrowForClassContext, getEdgeOtherClassId } from './types'
import ontologyCanvasLogo from './assets/ontology_canvas_logo.svg'
import './App.css'

const LEFT_SIDEBAR_COLLAPSED_KEY = 'semforge.leftSidebarCollapsed'

function readLeftSidebarCollapsed() {
  try {
    return localStorage.getItem(LEFT_SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function App() {
  const {
    classes,
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
    commitDataProperty,
    deleteClass,
    deleteClasses,
    deleteEdge,
    addDataProperty,
    updateDataProperty,
    removeDataProperty,
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
    hiddenClassIds,
  } = useOntologyState()

  const { theme, toggleTheme } = useTheme()

  const [leftCollapsed, setLeftCollapsed] = useState(readLeftSidebarCollapsed)

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
    if (sel.kind === 'class') commitClassLabel(sel.id)
    else commitEdgeLabel(sel.id)
  }

  const finishAllEditing = () => {
    if (editingLabel) commitClassOrEdgeLabel(editingLabel)
    if (editingDataProperty) commitDataProperty(editingDataProperty.id)
    setEditingLabel(null)
    setEditingDataProperty(null)
  }

  const openClassSidebar = (id: string, tab: 'data' | 'object' = 'data') => {
    finishAllEditing()
    selectClass(id)
    setPropertyTab(tab)
  }

  const handleSelectClass = (id: string, additive = false) => {
    finishAllEditing()
    selectClass(id, additive)
  }

  const handleSelectClassDataTab = (id: string) => {
    openClassSidebar(id, 'data')
  }

  const handleSelectEdge = (id: string) => {
    finishAllEditing()
    selectEdge(id)
  }

  const handleSelectAndEditClass = (id: string) => {
    finishAllEditing()
    selectClass(id)
    setEditingLabel({ kind: 'class', id })
    setPropertyTab('data')
  }

  const handleSelectAndEditEdge = (id: string) => {
    finishAllEditing()
    selectEdge(id)
    setEditingLabel({ kind: 'edge', id })
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
  }

  const handleCreateAt = (x: number, y: number) => {
    finishAllEditing()
    const id = createClassAt(x, y)
    setEditingLabel({ kind: 'class', id })
    setPropertyTab('data')
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

  const handleCycleEdgeDirection = () => {
    if (selection?.kind === 'edge') cycleEdgeDirectionById(selection.id)
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
      requestDelete({ kind: 'edge', id: selection.id, label: selectedEdge.label })
    }
  }

  const selectedEdgeMeta =
    selectedEdge && selection?.kind === 'edge'
      ? (() => {
          const anchorId = getEdgeAnchorClassId(selectedEdge)
          return {
            edge: selectedEdge,
            anchorId,
            otherId: getEdgeOtherClassId(selectedEdge, anchorId),
            directionArrow: getEdgeArrowForClassContext(selectedEdge, anchorId),
          }
        })()
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
            otherId: getEdgeOtherClassId(edge, selection.id),
            directionArrow: getEdgeArrowForClassContext(edge, selection.id),
          }))
          .reverse()
      : []

  const classDataProperties =
    selection?.kind === 'class'
      ? dataProperties.filter((p) => p.classId === selection.id).reverse()
      : []

  const handleAddObjectEdge = (
    leftId: string,
    rightId: string,
    phase: 0 | 1 | 2,
    label: string,
  ) => {
    if (selection?.kind !== 'class') return
    createEdgeBetween(leftId, rightId, phase, {
      keepClassSelection: true,
      classId: selection.id,
      label,
    })
  }

  const handleChangeObjectEdgeOther = (edgeId: string, otherId: string) => {
    if (selection?.kind !== 'class' || !otherId) return
    updateEdgeOtherClass(edgeId, selection.id, otherId)
  }

  const handleChangeEdgeOther = (edgeId: string, otherId: string) => {
    if (!otherId) return
    const edge = edges.find((e) => e.id === edgeId)
    if (!edge) return
    updateEdgeOtherClass(edgeId, getEdgeAnchorClassId(edge), otherId)
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
    classes,
    edges,
    dataProperties,
  ])

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
          edges={visibleEdges}
          dataProperties={visibleDataProperties}
          selection={selection}
          selectedClassIds={selectedClassIds}
          editingLabel={editingLabel}
          editingDataProperty={editingDataProperty}
          onCreateAt={handleCreateAt}
          onSelectClass={handleSelectClass}
          onSelectClassDataTab={handleSelectClassDataTab}
          onSelectAndEditClass={handleSelectAndEditClass}
          onSelectEdge={handleSelectEdge}
          onSelectAndEditEdge={handleSelectAndEditEdge}
          onEditDataProperty={handleEditDataProperty}
          onCreateEdge={createEdge}
          onDeselect={handleDeselect}
        />

        <PropertiesSidebar
          open={selection !== null}
          selectedClass={selection?.kind === 'class' ? selectedClass : null}
          selectedClassCount={selectedClassIds.size}
          selectedEdge={selectedEdgeMeta}
          classDataProperties={classDataProperties}
          classObjectEdges={classObjectEdges}
          allClasses={classes}
          propertyTab={propertyTab}
          editingLabel={
            editingLabel !== null &&
            selection !== null &&
            editingLabel.kind === selection.kind &&
            editingLabel.id === selection.id
          }
          editingDataProperty={editingDataProperty}
          onClose={handleDeselect}
          onPropertyTabChange={setPropertyTab}
          onLabelChange={handleLabelChange}
          onCycleDirection={handleCycleEdgeDirection}
          onChangeEdgeOther={handleChangeEdgeOther}
          onStartEditing={handleStartEditing}
          onFinishEditing={handleFinishEditing}
          onStartDataPropertyEditing={handleStartDataPropertyEditing}
          onFinishDataPropertyEditing={handleFinishDataPropertyEditing}
          onDelete={handleDeleteRequest}
          onAddDataProperty={addDataProperty}
          onUpdateDataProperty={updateDataProperty}
          onRequestRemoveDataProperty={handleRequestRemoveDataProperty}
          onCycleObjectEdgeDirection={cycleEdgeDirectionById}
          onChangeObjectEdgeOther={handleChangeObjectEdgeOther}
          onRequestRemoveObjectEdge={handleRequestRemoveObjectEdge}
          onUpdateObjectEdgeLabel={updateEdgeLabel}
          onCommitObjectEdgeLabel={commitEdgeLabel}
          onUpdateEdgeLineStyle={updateEdgeLineStyle}
          onAddObjectEdge={handleAddObjectEdge}
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
            else deleteEdge(deleteTarget.id)
          }}
          onCancel={cancelDelete}
        />
      )}
    </div>
  )
}

export default App

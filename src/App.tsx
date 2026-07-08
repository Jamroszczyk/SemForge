import { useEffect, useState } from 'react'
import { useOntologyState } from './hooks/useOntologyState'
import { useTheme } from './hooks/useTheme'
import { OntologyCanvas } from './components/OntologyCanvas'
import { ClassListSidebar } from './components/ClassListSidebar'
import { PropertiesSidebar } from './components/PropertiesSidebar'
import { DeleteConfirmModal } from './components/DeleteConfirmModal'
import { ThemeToggle } from './components/ThemeToggle'
import type { DataPropertyField, Selection } from './types'
import { getEdgeDisplayState } from './types'
import './App.css'

function App() {
  const {
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
    commitDataProperty,
    deleteClass,
    deleteEdge,
    addDataProperty,
    updateDataProperty,
    removeDataProperty,
    select,
    setEditingLabel,
    setEditingDataProperty,
    setPropertyTab,
    requestDelete,
    cancelDelete,
  } = useOntologyState()

  const { theme, toggleTheme } = useTheme()

  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)

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
    select({ kind: 'class', id })
    setPropertyTab(tab)
    setRightCollapsed(false)
  }

  const handleSelectClass = (id: string) => {
    finishAllEditing()
    select({ kind: 'class', id })
    setRightCollapsed(false)
  }

  const handleSelectClassDataTab = (id: string) => {
    openClassSidebar(id, 'data')
  }

  const handleSelectEdge = (id: string) => {
    finishAllEditing()
    select({ kind: 'edge', id })
    setRightCollapsed(false)
  }

  const handleSelectAndEditClass = (id: string) => {
    finishAllEditing()
    select({ kind: 'class', id })
    setEditingLabel({ kind: 'class', id })
    setPropertyTab('data')
    setRightCollapsed(false)
  }

  const handleSelectAndEditEdge = (id: string) => {
    finishAllEditing()
    select({ kind: 'edge', id })
    setEditingLabel({ kind: 'edge', id })
    setRightCollapsed(false)
  }

  const handleEditDataProperty = (
    classId: string,
    propertyId: string,
    field: DataPropertyField,
  ) => {
    finishAllEditing()
    select({ kind: 'class', id: classId })
    setPropertyTab('data')
    setEditingDataProperty({ id: propertyId, field })
    setRightCollapsed(false)
  }

  const handleCreateAt = (x: number, y: number) => {
    finishAllEditing()
    const id = createClassAt(x, y)
    setEditingLabel({ kind: 'class', id })
    setPropertyTab('data')
    setRightCollapsed(false)
  }

  const handleDeselect = () => {
    finishAllEditing()
    select(null)
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
          const display = getEdgeDisplayState(selectedEdge)
          return {
            edge: selectedEdge,
            leftLabel:
              classes.find((c) => c.id === display.leftId)?.label ?? 'Unknown',
            rightLabel:
              classes.find((c) => c.id === display.rightId)?.label ?? 'Unknown',
            directionArrow: display.arrow,
          }
        })()
      : null

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (!selection || deleteTarget || editingLabel || editingDataProperty) return

      const el = document.activeElement
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      e.preventDefault()
      handleDeleteRequest()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selection, deleteTarget, editingLabel, editingDataProperty, selectedClass, selectedEdge])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-logo">SF</div>
          <div className="brand-text">
            <div className="brand-title">SemForge</div>
            <div className="brand-subtitle">Ontology visualizer & editor</div>
          </div>
        </div>
        <div className="topbar-actions">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      <main className="app-main">
        <ClassListSidebar
          classes={classes}
          selectedId={selection?.kind === 'class' ? selection.id : null}
          collapsed={leftCollapsed}
          onToggle={() => setLeftCollapsed((v) => !v)}
          onSelect={handleSelectClass}
        />

        <OntologyCanvas
          classes={classes}
          edges={edges}
          dataProperties={dataProperties}
          selection={selection}
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
          collapsed={rightCollapsed}
          selectedClass={selection?.kind === 'class' ? selectedClass : null}
          selectedEdge={selectedEdgeMeta}
          classDataProperties={
            selection?.kind === 'class'
              ? dataProperties.filter((p) => p.classId === selection.id)
              : []
          }
          propertyTab={propertyTab}
          editingLabel={
            editingLabel !== null &&
            selection !== null &&
            editingLabel.kind === selection.kind &&
            editingLabel.id === selection.id
          }
          editingDataProperty={editingDataProperty}
          onToggleCollapse={() => setRightCollapsed((v) => !v)}
          onClose={handleDeselect}
          onPropertyTabChange={setPropertyTab}
          onLabelChange={handleLabelChange}
          onCycleDirection={handleCycleEdgeDirection}
          onStartEditing={handleStartEditing}
          onFinishEditing={handleFinishEditing}
          onStartDataPropertyEditing={handleStartDataPropertyEditing}
          onFinishDataPropertyEditing={handleFinishDataPropertyEditing}
          onDelete={handleDeleteRequest}
          onAddDataProperty={addDataProperty}
          onUpdateDataProperty={updateDataProperty}
          onRemoveDataProperty={removeDataProperty}
        />
      </main>

      {deleteTarget && (
        <DeleteConfirmModal
          kind={deleteTarget.kind}
          label={deleteTarget.label}
          onConfirm={() =>
            deleteTarget.kind === 'class'
              ? deleteClass(deleteTarget.id)
              : deleteEdge(deleteTarget.id)
          }
          onCancel={cancelDelete}
        />
      )}
    </div>
  )
}

export default App

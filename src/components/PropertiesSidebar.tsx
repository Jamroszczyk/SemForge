import { useEffect, useRef, useState, type ReactNode } from 'react'
import type {
  DataPropertyField,
  EditingDataProperty,
  EdgeLineStyle,
  OntologyClass,
  OntologyDataProperty,
  OntologyEdge,
} from '../types'
import { cycleDraftEdgePhase, getDraftEdgeArrow, getEdgeLineStyle } from '../types'

interface SelectedEdgeMeta {
  edge: OntologyEdge
  anchorId: string
  otherId: string
  directionArrow: string
}

interface ClassObjectEdgeRow {
  edge: OntologyEdge
  otherId: string
  directionArrow: string
}

interface SidebarDisplaySnapshot {
  selectedClass: OntologyClass | null
  selectedEdge: SelectedEdgeMeta | null
  selectedClassCount: number
  classDataProperties: OntologyDataProperty[]
  classObjectEdges: ClassObjectEdgeRow[]
}

const SIDEBAR_ANIM_MS = 280

interface PropertiesSidebarProps {
  open: boolean
  selectedClass: OntologyClass | null
  selectedClassCount: number
  selectedEdge: SelectedEdgeMeta | null
  classDataProperties: OntologyDataProperty[]
  classObjectEdges: ClassObjectEdgeRow[]
  allClasses: OntologyClass[]
  propertyTab: 'data' | 'object'
  editingLabel: boolean
  editingDataProperty: EditingDataProperty | null
  onClose: () => void
  onPropertyTabChange: (tab: 'data' | 'object') => void
  onLabelChange: (label: string) => void
  onCycleDirection: () => void
  onChangeEdgeOther: (edgeId: string, otherId: string) => void
  onStartEditing: () => void
  onFinishEditing: () => void
  onStartDataPropertyEditing: (id: string, field: DataPropertyField) => void
  onFinishDataPropertyEditing: () => void
  onDelete: () => void
  onAddDataProperty: (classId: string) => void
  onUpdateDataProperty: (
    id: string,
    patch: Partial<Pick<OntologyDataProperty, 'label' | 'datatype'>>,
  ) => void
  onRequestRemoveDataProperty: (id: string) => void
  onCycleObjectEdgeDirection: (edgeId: string) => void
  onChangeObjectEdgeOther: (edgeId: string, otherId: string) => void
  onRequestRemoveObjectEdge: (edgeId: string) => void
  onUpdateObjectEdgeLabel: (edgeId: string, label: string) => void
  onCommitObjectEdgeLabel: (edgeId: string) => void
  onUpdateEdgeLineStyle: (edgeId: string, lineStyle: EdgeLineStyle) => void
  onAddObjectEdge: (
    leftId: string,
    rightId: string,
    phase: 0 | 1 | 2,
    label: string,
  ) => void
}

function ObjectConnectionRow({
  selectedClassId,
  otherClassId,
  directionArrow,
  sortedClasses,
  allowEmptyOther,
  onCycleDirection,
  onOtherClassChange,
  trailingAction,
}: {
  selectedClassId: string
  otherClassId: string
  directionArrow: string
  sortedClasses: OntologyClass[]
  allowEmptyOther?: boolean
  onCycleDirection: () => void
  onOtherClassChange: (classId: string) => void
  trailingAction?: ReactNode
}) {
  return (
    <div className={`object-prop-row ${trailingAction ? '' : 'object-prop-row-full'}`}>
      <select
        className="object-prop-select object-prop-select-fixed"
        value={selectedClassId}
        disabled
        aria-label="Selected class"
      >
        {sortedClasses.map((cls) => (
          <option key={cls.id} value={cls.id}>
            {cls.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="property-endpoint-arrow property-endpoint-arrow-btn object-prop-direction"
        onClick={onCycleDirection}
        aria-label="Cycle connection direction"
      >
        {directionArrow}
      </button>
      <select
        className="object-prop-select"
        value={otherClassId}
        onChange={(e) => onOtherClassChange(e.target.value)}
        aria-label="Connected class"
      >
        {allowEmptyOther && <option value="">Select</option>}
        {sortedClasses.map((cls) => (
          <option key={cls.id} value={cls.id}>
            {cls.label}
          </option>
        ))}
      </select>
      {trailingAction}
    </div>
  )
}

function EdgeLineStyleToggle({
  lineStyle,
  onChange,
}: {
  lineStyle: EdgeLineStyle
  onChange: (lineStyle: EdgeLineStyle) => void
}) {
  return (
    <div className="edge-line-style-section">
      <p className="object-prop-composer-label">Line style</p>
      <div className="edge-line-style-toggle" role="group" aria-label="Line style">
        <button
          type="button"
          className={`edge-line-style-btn ${lineStyle === 'solid' ? 'active' : ''}`}
          aria-label="Solid line"
          aria-pressed={lineStyle === 'solid'}
          onClick={() => onChange('solid')}
        >
          <span className="edge-line-style-symbol" aria-hidden>
            —
          </span>
        </button>
        <button
          type="button"
          className={`edge-line-style-btn ${lineStyle === 'dashed' ? 'active' : ''}`}
          aria-label="Dashed line"
          aria-pressed={lineStyle === 'dashed'}
          onClick={() => onChange('dashed')}
        >
          <span className="edge-line-style-symbol edge-line-style-symbol-dashed" aria-hidden>
            - -
          </span>
        </button>
      </div>
    </div>
  )
}

function ObjectConnectionBlock({
  relationLabel,
  onRelationLabelChange,
  onRelationLabelBlur,
  selectedClassId,
  otherClassId,
  directionArrow,
  sortedClasses,
  allowEmptyOther,
  onCycleDirection,
  onOtherClassChange,
  trailingAction,
  relationLabelId,
  relationLabelEditing,
  onRelationLabelFocus,
}: {
  relationLabel: string
  onRelationLabelChange: (label: string) => void
  onRelationLabelBlur?: () => void
  selectedClassId: string
  otherClassId: string
  directionArrow: string
  sortedClasses: OntologyClass[]
  allowEmptyOther?: boolean
  onCycleDirection: () => void
  onOtherClassChange: (classId: string) => void
  trailingAction?: ReactNode
  relationLabelId?: string
  relationLabelEditing?: boolean
  onRelationLabelFocus?: () => void
}) {
  return (
    <div className="object-prop-item">
      <input
        id={relationLabelId}
        className={`object-prop-label-input ${relationLabelEditing ? 'object-prop-label-input-editing' : ''}`}
        value={relationLabel}
        placeholder="relation"
        onChange={(e) => onRelationLabelChange(e.target.value)}
        onBlur={onRelationLabelBlur}
        onFocus={onRelationLabelFocus}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        aria-label="Connection label"
      />
      <ObjectConnectionRow
        selectedClassId={selectedClassId}
        otherClassId={otherClassId}
        directionArrow={directionArrow}
        sortedClasses={sortedClasses}
        allowEmptyOther={allowEmptyOther}
        onCycleDirection={onCycleDirection}
        onOtherClassChange={onOtherClassChange}
        trailingAction={trailingAction}
      />
    </div>
  )
}

export function PropertiesSidebar({
  open,
  selectedClass,
  selectedClassCount,
  selectedEdge,
  classDataProperties,
  classObjectEdges,
  allClasses,
  propertyTab,
  editingLabel,
  editingDataProperty,
  onClose,
  onPropertyTabChange,
  onLabelChange,
  onCycleDirection,
  onChangeEdgeOther,
  onStartEditing,
  onFinishEditing,
  onStartDataPropertyEditing,
  onFinishDataPropertyEditing,
  onDelete,
  onAddDataProperty,
  onUpdateDataProperty,
  onRequestRemoveDataProperty,
  onCycleObjectEdgeDirection,
  onChangeObjectEdgeOther,
  onRequestRemoveObjectEdge,
  onUpdateObjectEdgeLabel,
  onCommitObjectEdgeLabel,
  onUpdateEdgeLineStyle,
  onAddObjectEdge,
}: PropertiesSidebarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const sidebarInnerRef = useRef<HTMLDivElement>(null)
  const lastFocusedDataPropRef = useRef<string | null>(null)
  const displayRef = useRef<SidebarDisplaySnapshot | null>(null)
  const [isMounted, setIsMounted] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [draftRightId, setDraftRightId] = useState('')
  const [draftPhase, setDraftPhase] = useState<0 | 1 | 2>(0)
  const [draftRelationLabel, setDraftRelationLabel] = useState('')

  const contentActive = open && (selectedClass !== null || selectedEdge !== null)

  if (contentActive) {
    displayRef.current = {
      selectedClass,
      selectedEdge,
      selectedClassCount,
      classDataProperties,
      classObjectEdges,
    }
  }

  useEffect(() => {
    if (contentActive) {
      setIsMounted(true)
      let frame2 = 0
      const frame1 = requestAnimationFrame(() => {
        frame2 = requestAnimationFrame(() => setIsExpanded(true))
      })
      return () => {
        cancelAnimationFrame(frame1)
        cancelAnimationFrame(frame2)
      }
    }

    setIsExpanded(false)
    inputRef.current?.blur()
  }, [contentActive])

  useEffect(() => {
    if (isExpanded || contentActive) return
    const timer = window.setTimeout(() => setIsMounted(false), SIDEBAR_ANIM_MS)
    return () => window.clearTimeout(timer)
  }, [isExpanded, contentActive])

  const display = displayRef.current
  const activeClass = display?.selectedClass ?? null
  const activeEdge = display?.selectedEdge ?? null
  const activeClassCount = display?.selectedClassCount ?? 0
  const activeDataProperties = display?.classDataProperties ?? []
  const activeObjectEdges = display?.classObjectEdges ?? []

  const isClass = activeClass !== null
  const isEdge = activeEdge !== null
  const isMultiClass = activeClassCount > 1
  const deleteLabel = isMultiClass ? `Delete ${activeClassCount} classes` : 'Delete'
  const classLabel = isClass ? activeClass.label : ''
  const sortedClasses = [...allClasses].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  )
  const canAddObjectEdge = activeClass !== null && draftRightId !== ''

  useEffect(() => {
    setDraftRightId('')
    setDraftPhase(0)
    setDraftRelationLabel('')
  }, [selectedClass?.id])

  useEffect(() => {
    if (!open || !editingLabel) return

    const frame = requestAnimationFrame(() => {
      if (selectedClass) {
        const input = inputRef.current
        if (!input) return
        input.focus()
        input.select()
        return
      }

      if (selectedEdge) {
        const input = document.getElementById('edge-relation-label-input') as HTMLInputElement | null
        if (!input) return
        input.focus()
        input.select()
      }
    })

    return () => cancelAnimationFrame(frame)
  }, [open, selectedClass?.id, selectedEdge?.edge.id, editingLabel])

  useEffect(() => {
    if (!open || !editingDataProperty) {
      lastFocusedDataPropRef.current = null
      return
    }

    const focusKey = `${editingDataProperty.id}:${editingDataProperty.field}`
    if (lastFocusedDataPropRef.current === focusKey) return
    lastFocusedDataPropRef.current = focusKey

    const inputId =
      editingDataProperty.field === 'label'
        ? `data-prop-label-${editingDataProperty.id}`
        : `data-prop-type-${editingDataProperty.id}`

    const frame = requestAnimationFrame(() => {
      const input = document.getElementById(inputId) as HTMLInputElement | null
      if (!input) return
      input.focus()
      input.select()
      input.closest('.data-prop-row')?.scrollIntoView({ block: 'nearest' })
    })

    return () => cancelAnimationFrame(frame)
  }, [open, editingDataProperty?.id, editingDataProperty?.field])

  useEffect(() => {
    const inner = sidebarInnerRef.current
    if (!inner || (!editingLabel && !editingDataProperty)) return

    const onPointerDown = (ev: PointerEvent) => {
      const target = ev.target as Element
      if (target.closest('#item-label-input, #edge-relation-label-input, .data-prop-input, .object-prop-label-input')) return
      inputRef.current?.blur()
      ;(document.activeElement as HTMLElement | null)?.blur()
    }

    inner.addEventListener('pointerdown', onPointerDown)
    return () => inner.removeEventListener('pointerdown', onPointerDown)
  }, [editingLabel, editingDataProperty])

  if (!isMounted || !display) return null

  const saveAndExit = () => {
    onFinishEditing()
    inputRef.current?.blur()
  }

  return (
    <aside
      className={`sidebar sidebar-right ${isExpanded ? '' : 'is-closed'}`}
      aria-hidden={!isExpanded}
    >
      <div className="sidebar-inner" ref={sidebarInnerRef}>
        <div className="sidebar-head sidebar-head-row">
          <div className="sidebar-head-group">
            <h2>{isEdge ? 'Edge' : 'Properties'}</h2>
            {isMultiClass && (
              <span className="sidebar-multi-count">{activeClassCount} selected</span>
            )}
          </div>
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="sidebar-content">
          {isClass && (
            <div className="property-group property-group-compact">
              <label className="property-label" htmlFor="item-label-input">
                Label
              </label>
              <input
                ref={inputRef}
                id="item-label-input"
                className={`object-prop-label-input ${editingLabel ? 'object-prop-label-input-editing' : ''}`}
                value={classLabel}
                onChange={(e) => onLabelChange(e.target.value)}
                onFocus={onStartEditing}
                onBlur={onFinishEditing}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    saveAndExit()
                  }
                }}
              />
            </div>
          )}

          {isEdge && activeEdge && (
            <>
              <ObjectConnectionBlock
                relationLabel={activeEdge.edge.label}
                onRelationLabelChange={(label) => onUpdateObjectEdgeLabel(activeEdge.edge.id, label)}
                onRelationLabelBlur={() => {
                  onCommitObjectEdgeLabel(activeEdge.edge.id)
                  if (editingLabel) onFinishEditing()
                }}
                onRelationLabelFocus={onStartEditing}
                selectedClassId={activeEdge.anchorId}
                otherClassId={activeEdge.otherId}
                directionArrow={activeEdge.directionArrow}
                sortedClasses={sortedClasses}
                onCycleDirection={onCycleDirection}
                onOtherClassChange={(otherId) => onChangeEdgeOther(activeEdge.edge.id, otherId)}
                relationLabelId="edge-relation-label-input"
                relationLabelEditing={editingLabel}
              />
              <EdgeLineStyleToggle
                lineStyle={getEdgeLineStyle(activeEdge.edge)}
                onChange={(style) => onUpdateEdgeLineStyle(activeEdge.edge.id, style)}
              />
            </>
          )}

          {isClass && (
            <div className="property-tabs-section">
              <div className="property-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={propertyTab === 'data'}
                  className={`property-tab ${propertyTab === 'data' ? 'active' : ''}`}
                  onClick={() => onPropertyTabChange('data')}
                >
                  Data
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={propertyTab === 'object'}
                  className={`property-tab ${propertyTab === 'object' ? 'active' : ''}`}
                  onClick={() => onPropertyTabChange('object')}
                >
                  Connections
                </button>
              </div>

              {propertyTab === 'data' && (
                <div className="property-tab-panel" role="tabpanel">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-block data-prop-add"
                    onClick={() => activeClass && onAddDataProperty(activeClass.id)}
                  >
                    + Data property
                  </button>
                  <div className="data-prop-list">
                    {activeDataProperties.map((prop) => {
                      const editingName =
                        editingDataProperty?.id === prop.id &&
                        editingDataProperty.field === 'label'
                      const editingType =
                        editingDataProperty?.id === prop.id &&
                        editingDataProperty.field === 'datatype'

                      return (
                        <div
                          key={prop.id}
                          className={`data-prop-row ${editingName || editingType ? 'data-prop-row-editing' : ''}`}
                        >
                          <input
                            id={`data-prop-label-${prop.id}`}
                            className={`data-prop-input ${editingName ? 'data-prop-input-editing' : ''}`}
                            value={prop.label}
                            placeholder="name"
                            onChange={(e) =>
                              onUpdateDataProperty(prop.id, { label: e.target.value })
                            }
                            onFocus={() => onStartDataPropertyEditing(prop.id, 'label')}
                            onBlur={onFinishDataPropertyEditing}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                ;(e.target as HTMLInputElement).blur()
                              }
                            }}
                          />
                          <input
                            id={`data-prop-type-${prop.id}`}
                            className={`data-prop-input data-prop-type ${editingType ? 'data-prop-input-editing' : ''}`}
                            value={prop.datatype}
                            placeholder="type"
                            onChange={(e) =>
                              onUpdateDataProperty(prop.id, { datatype: e.target.value })
                            }
                            onFocus={() => onStartDataPropertyEditing(prop.id, 'datatype')}
                            onBlur={onFinishDataPropertyEditing}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                ;(e.target as HTMLInputElement).blur()
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs data-prop-remove"
                            onClick={() => onRequestRemoveDataProperty(prop.id)}
                            aria-label="Remove data property"
                          >
                            ×
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {propertyTab === 'object' && (
                <div className="property-tab-panel" role="tabpanel">
                  <div className="object-prop-composer object-prop-composer-top">
                    <p className="object-prop-composer-label">Add connection</p>
                    <ObjectConnectionBlock
                      relationLabel={draftRelationLabel}
                      onRelationLabelChange={setDraftRelationLabel}
                      selectedClassId={activeClass!.id}
                      otherClassId={draftRightId}
                      directionArrow={getDraftEdgeArrow(draftPhase)}
                      sortedClasses={sortedClasses}
                      allowEmptyOther
                      onCycleDirection={() =>
                        setDraftPhase((phase) => cycleDraftEdgePhase(phase))
                      }
                      onOtherClassChange={setDraftRightId}
                      trailingAction={
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs object-prop-add"
                          disabled={!canAddObjectEdge}
                          onClick={() => {
                            if (!canAddObjectEdge || !activeClass) return
                            onAddObjectEdge(
                              activeClass.id,
                              draftRightId,
                              draftPhase,
                              draftRelationLabel,
                            )
                            setDraftRightId('')
                            setDraftPhase(0)
                            setDraftRelationLabel('')
                          }}
                          aria-label="Add connection"
                        >
                          +
                        </button>
                      }
                    />
                  </div>

                  <div className="object-prop-existing">
                    <p className="object-prop-composer-label object-prop-existing-label">
                      Existing connections
                    </p>
                    <div className="object-prop-list">
                      {activeObjectEdges.length === 0 && (
                        <p className="object-prop-empty">No connections yet.</p>
                      )}
                      {activeObjectEdges.map((row) => (
                        <ObjectConnectionBlock
                          key={row.edge.id}
                          relationLabel={row.edge.label}
                          onRelationLabelChange={(label) =>
                            onUpdateObjectEdgeLabel(row.edge.id, label)
                          }
                          onRelationLabelBlur={() => onCommitObjectEdgeLabel(row.edge.id)}
                          selectedClassId={activeClass!.id}
                          otherClassId={row.otherId}
                          directionArrow={row.directionArrow}
                          sortedClasses={sortedClasses}
                          onCycleDirection={() => onCycleObjectEdgeDirection(row.edge.id)}
                          onOtherClassChange={(otherId) =>
                            onChangeObjectEdgeOther(row.edge.id, otherId)
                          }
                          trailingAction={
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs object-prop-remove"
                              onClick={() => onRequestRemoveObjectEdge(row.edge.id)}
                              aria-label="Remove object property"
                            >
                              ×
                            </button>
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sidebar-actions">
          <button type="button" className="btn btn-danger btn-block" onClick={onDelete}>
            {deleteLabel}
          </button>
        </div>
      </div>
    </aside>
  )
}

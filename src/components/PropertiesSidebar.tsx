import { useEffect, useRef } from 'react'
import type { DataPropertyField, EditingDataProperty, OntologyClass, OntologyDataProperty } from '../types'

interface SelectedEdgeMeta {
  edge: {
    id: string
    label: string
    sourceId: string
    targetId: string
    bidirectional?: boolean
    directionPhase?: 0 | 1 | 2
  }
  leftLabel: string
  rightLabel: string
  directionArrow: string
}

interface PropertiesSidebarProps {
  open: boolean
  collapsed: boolean
  selectedClass: OntologyClass | null
  selectedEdge: SelectedEdgeMeta | null
  classDataProperties: OntologyDataProperty[]
  propertyTab: 'data' | 'object'
  editingLabel: boolean
  editingDataProperty: EditingDataProperty | null
  onToggleCollapse: () => void
  onClose: () => void
  onPropertyTabChange: (tab: 'data' | 'object') => void
  onLabelChange: (label: string) => void
  onCycleDirection: () => void
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
  onRemoveDataProperty: (id: string) => void
}

export function PropertiesSidebar({
  open,
  collapsed,
  selectedClass,
  selectedEdge,
  classDataProperties,
  propertyTab,
  editingLabel,
  editingDataProperty,
  onToggleCollapse,
  onClose,
  onPropertyTabChange,
  onLabelChange,
  onCycleDirection,
  onStartEditing,
  onFinishEditing,
  onStartDataPropertyEditing,
  onFinishDataPropertyEditing,
  onDelete,
  onAddDataProperty,
  onUpdateDataProperty,
  onRemoveDataProperty,
}: PropertiesSidebarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const sidebarInnerRef = useRef<HTMLDivElement>(null)
  const lastFocusedDataPropRef = useRef<string | null>(null)

  const isClass = selectedClass !== null
  const isEdge = selectedEdge !== null
  const label = isClass ? selectedClass.label : isEdge ? selectedEdge.edge.label : ''

  useEffect(() => {
    if (open && !collapsed && (selectedClass || selectedEdge) && editingLabel) {
      const input = inputRef.current
      if (input) {
        input.focus()
        input.select()
      }
    }
  }, [open, collapsed, selectedClass?.id, selectedEdge?.edge.id, editingLabel])

  useEffect(() => {
    if (!open || collapsed || !editingDataProperty) {
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
  }, [open, collapsed, editingDataProperty?.id, editingDataProperty?.field])

  useEffect(() => {
    const inner = sidebarInnerRef.current
    if (!inner || (!editingLabel && !editingDataProperty)) return

    const onPointerDown = (ev: PointerEvent) => {
      const target = ev.target as Element
      if (target.closest('#item-label-input, .data-prop-input')) return
      inputRef.current?.blur()
      ;(document.activeElement as HTMLElement | null)?.blur()
    }

    inner.addEventListener('pointerdown', onPointerDown)
    return () => inner.removeEventListener('pointerdown', onPointerDown)
  }, [editingLabel, editingDataProperty])

  if (!open || (!selectedClass && !selectedEdge)) return null

  const saveAndExit = () => {
    onFinishEditing()
    inputRef.current?.blur()
  }

  return (
    <aside className={`sidebar sidebar-right ${collapsed ? 'collapsed' : ''}`}>
      <button
        type="button"
        className="sidebar-toggle sidebar-toggle-right"
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Expand properties' : 'Collapse properties'}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? '‹' : '›'}
      </button>

      <div className="sidebar-inner" ref={sidebarInnerRef}>
        <div className="sidebar-head sidebar-head-row">
          <h2>{isEdge ? 'Edge' : 'Properties'}</h2>
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="sidebar-content">
          <div className="property-group">
            <label className="property-label" htmlFor="item-label-input">
              Label
            </label>
            <input
              ref={inputRef}
              id="item-label-input"
              className="property-input"
              value={label}
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

          {isEdge && (
            <div className="property-endpoints">
              <span className="property-endpoint-name">{selectedEdge.leftLabel}</span>
              <button
                type="button"
                className="property-endpoint-arrow property-endpoint-arrow-btn"
                onClick={onCycleDirection}
                aria-label="Cycle edge direction"
              >
                {selectedEdge.directionArrow}
              </button>
              <span className="property-endpoint-name">{selectedEdge.rightLabel}</span>
            </div>
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
                  Object
                </button>
              </div>

              {propertyTab === 'data' && (
                <div className="property-tab-panel" role="tabpanel">
                  <div className="data-prop-list">
                    {classDataProperties.map((prop) => {
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
                            onClick={() => onRemoveDataProperty(prop.id)}
                            aria-label="Remove data property"
                          >
                            ×
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-block data-prop-add"
                    onClick={() => onAddDataProperty(selectedClass.id)}
                  >
                    + Data property
                  </button>
                </div>
              )}

              {propertyTab === 'object' && (
                <div className="property-tab-panel property-tab-panel-empty" role="tabpanel" />
              )}
            </div>
          )}
        </div>

        <div className="sidebar-actions">
          <button type="button" className="btn btn-danger btn-block" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </aside>
  )
}

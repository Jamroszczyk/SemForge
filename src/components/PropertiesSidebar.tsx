import { useEffect, useRef, useState, type ReactNode } from 'react'
import type {
  DataPropertyField,
  EditingDataProperty,
  ExpressionKind,
  ExpressionNode,
  NamedClassNode,
  OntologyDataProperty,
  OntologyEdge,
  StatementKind,
} from '../types'
import { EXPRESSION_KIND_OPTIONS, getExpressionOwlConstructName } from '../expressionUtils'
import { CLASS_COLOR_OPTIONS, classColorOrDefault } from '../classColorUtils'
import {
  STATEMENT_KIND_OPTIONS,
  STATEMENT_SECTIONS,
  buildGraphNodeOptions,
  getAllowedStatementKinds,
  getStatementKind,
  nodeKindById,
  statementUsesEditableLabel,
  type GraphNodeOption,
} from '../statementUtils'

interface SelectedEdgeMeta {
  edge: OntologyEdge
  sourceId: string
  targetId: string
}

interface ClassObjectEdgeRow {
  edge: OntologyEdge
  anchorId: string
  otherId: string
}

const SIDEBAR_ANIM_MS = 280

interface PropertiesSidebarProps {
  open: boolean
  selectedClass: NamedClassNode | null
  selectedExpression: ExpressionNode | null
  selectedClassCount: number
  selectedEdge: SelectedEdgeMeta | null
  classDataProperties: OntologyDataProperty[]
  classObjectEdges: ClassObjectEdgeRow[]
  expressionObjectEdges: ClassObjectEdgeRow[]
  allClasses: NamedClassNode[]
  allExpressions: ExpressionNode[]
  propertyTab: 'data' | 'object'
  editingLabel: boolean
  editingDataProperty: EditingDataProperty | null
  onClose: () => void
  onPropertyTabChange: (tab: 'data' | 'object') => void
  onLabelChange: (label: string) => void
  onTagChange: (tag: string) => void
  onIriChange: (iri: string) => void
  onCommentChange: (comment: string) => void
  onExpiredChange: (expired: boolean) => void
  onColorChange: (color: string) => void
  onCommitNamedClass: () => void
  onExpressionKindChange: (kind: ExpressionKind) => void
  onUpdateStatementKind: (edgeId: string, kind: StatementKind) => void
  onSwapStatementEndpoints: (edgeId: string) => void
  onUpdateStatementSource: (edgeId: string, nodeId: string) => void
  onUpdateStatementTarget: (edgeId: string, nodeId: string) => void
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
  onChangeObjectEdgeOther: (edgeId: string, otherId: string) => void
  onRequestRemoveObjectEdge: (edgeId: string) => void
  onUpdateObjectEdgeLabel: (edgeId: string, label: string) => void
  onCommitObjectEdgeLabel: (edgeId: string) => void
  onAddStatement: (
    sourceId: string,
    targetId: string,
    statementKind: StatementKind,
    label: string,
  ) => void
}

function StatementKindSelect({
  value,
  sourceId,
  targetId,
  allClasses,
  allExpressions,
  onChange,
}: {
  value: StatementKind
  sourceId: string
  targetId: string
  allClasses: NamedClassNode[]
  allExpressions: ExpressionNode[]
  onChange: (kind: StatementKind) => void
}) {
  const sourceKind = nodeKindById(sourceId, allClasses, allExpressions) ?? 'namedClass'
  const targetKind = nodeKindById(targetId, allClasses, allExpressions) ?? 'namedClass'
  const allowed = new Set(getAllowedStatementKinds(sourceKind, targetKind))

  return (
    <div className="property-group property-group-compact">
      <label className="property-label" htmlFor="statement-kind-select">
        Semantic type
      </label>
      <select
        id="statement-kind-select"
        className="object-prop-select"
        value={value}
        onChange={(e) => onChange(e.target.value as StatementKind)}
        aria-label="Semantic connection type"
      >
        {STATEMENT_KIND_OPTIONS.filter((o) => allowed.has(o.value)).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function StatementEndpointRow({
  sourceId,
  targetId,
  graphNodes,
  fixedSource,
  onSwap,
  onSourceChange,
  onTargetChange,
  trailingAction,
}: {
  sourceId: string
  targetId: string
  graphNodes: GraphNodeOption[]
  fixedSource?: string
  onSwap: () => void
  onSourceChange?: (nodeId: string) => void
  onTargetChange: (nodeId: string) => void
  trailingAction?: ReactNode
}) {
  return (
    <div className={`object-prop-row ${trailingAction ? '' : 'object-prop-row-full'}`}>
      <select
        className="object-prop-select object-prop-select-fixed"
        value={sourceId}
        disabled={fixedSource !== undefined}
        onChange={(e) => onSourceChange?.(e.target.value)}
        aria-label="Source node"
      >
        {graphNodes.map((node) => (
          <option key={node.id} value={node.id}>
            {node.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="property-endpoint-arrow property-endpoint-arrow-btn object-prop-direction"
        onClick={onSwap}
        aria-label="Swap source and target"
      >
        ⇄
      </button>
      <select
        className="object-prop-select"
        value={targetId}
        onChange={(e) => onTargetChange(e.target.value)}
        aria-label="Target node"
      >
        {!targetId && <option value="">Select</option>}
        {graphNodes
          .filter((node) => node.id !== sourceId)
          .map((node) => (
            <option key={node.id} value={node.id}>
              {node.label}
            </option>
          ))}
      </select>
      {trailingAction}
    </div>
  )
}

function StatementConnectionBlock({
  edge,
  allClasses,
  allExpressions,
  anchorNodeId,
  relationLabel,
  onRelationLabelChange,
  onRelationLabelBlur,
  onRelationLabelFocus,
  relationLabelId,
  relationLabelEditing,
  onStatementKindChange,
  onSwap,
  onSourceChange,
  onTargetChange,
  onOtherChange,
  allowEmptyTarget,
  trailingAction,
}: {
  edge: OntologyEdge
  allClasses: NamedClassNode[]
  allExpressions: ExpressionNode[]
  anchorNodeId?: string
  relationLabel?: string
  onRelationLabelChange?: (label: string) => void
  onRelationLabelBlur?: () => void
  onRelationLabelFocus?: () => void
  relationLabelId?: string
  relationLabelEditing?: boolean
  onStatementKindChange: (kind: StatementKind) => void
  onSwap: () => void
  onSourceChange?: (nodeId: string) => void
  onTargetChange?: (nodeId: string) => void
  onOtherChange?: (nodeId: string) => void
  allowEmptyTarget?: boolean
  trailingAction?: ReactNode
}) {
  const graphNodes = buildGraphNodeOptions(allClasses, allExpressions)
  const kind = getStatementKind(edge)
  const showLabel = statementUsesEditableLabel(kind)
  const sourceId = anchorNodeId ?? edge.sourceId
  const targetId = anchorNodeId
    ? edge.sourceId === anchorNodeId
      ? edge.targetId
      : edge.sourceId
    : edge.targetId

  return (
    <div className="object-prop-item">
      <StatementKindSelect
        value={kind}
        sourceId={edge.sourceId}
        targetId={edge.targetId}
        allClasses={allClasses}
        allExpressions={allExpressions}
        onChange={onStatementKindChange}
      />
      {showLabel && (
        <input
          id={relationLabelId}
          className={`object-prop-label-input ${relationLabelEditing ? 'object-prop-label-input-editing' : ''}`}
          value={relationLabel ?? edge.label}
          placeholder="relation"
          onChange={(e) => onRelationLabelChange?.(e.target.value)}
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
      )}
      <StatementEndpointRow
        sourceId={sourceId}
        targetId={allowEmptyTarget && !targetId ? '' : targetId}
        graphNodes={graphNodes}
        fixedSource={anchorNodeId}
        onSwap={onSwap}
        onSourceChange={onSourceChange}
        onTargetChange={onOtherChange ?? onTargetChange ?? (() => {})}
        trailingAction={trailingAction}
      />
    </div>
  )
}

function NodeConnectionSections({
  anchorId,
  connectionRows,
  allClasses,
  allExpressions,
  onUpdateObjectEdgeLabel,
  onCommitObjectEdgeLabel,
  onUpdateStatementKind,
  onSwapStatementEndpoints,
  onChangeObjectEdgeOther,
  onRequestRemoveObjectEdge,
}: {
  anchorId: string
  connectionRows: ClassObjectEdgeRow[]
  allClasses: NamedClassNode[]
  allExpressions: ExpressionNode[]
  onUpdateObjectEdgeLabel: (edgeId: string, label: string) => void
  onCommitObjectEdgeLabel: (edgeId: string) => void
  onUpdateStatementKind: (edgeId: string, kind: StatementKind) => void
  onSwapStatementEndpoints: (edgeId: string) => void
  onChangeObjectEdgeOther: (edgeId: string, otherId: string) => void
  onRequestRemoveObjectEdge: (edgeId: string) => void
}) {
  return (
    <>
      {STATEMENT_SECTIONS.map((section) => {
        const rows = connectionRows.filter((row) => getStatementKind(row.edge) === section.kind)
        if (rows.length === 0) return null
        return (
          <div key={section.kind} className="object-prop-existing">
            <p className="object-prop-composer-label object-prop-existing-label">{section.title}</p>
            <div className="object-prop-list">
              {rows.map((row) => (
                <StatementConnectionBlock
                  key={row.edge.id}
                  edge={row.edge}
                  allClasses={allClasses}
                  allExpressions={allExpressions}
                  anchorNodeId={anchorId}
                  relationLabel={row.edge.label}
                  onRelationLabelChange={(label) => onUpdateObjectEdgeLabel(row.edge.id, label)}
                  onRelationLabelBlur={() => onCommitObjectEdgeLabel(row.edge.id)}
                  onStatementKindChange={(kind) => onUpdateStatementKind(row.edge.id, kind)}
                  onSwap={() => onSwapStatementEndpoints(row.edge.id)}
                  onOtherChange={(otherId) => onChangeObjectEdgeOther(row.edge.id, otherId)}
                  trailingAction={
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs object-prop-remove"
                      onClick={() => onRequestRemoveObjectEdge(row.edge.id)}
                      aria-label="Remove connection"
                    >
                      ×
                    </button>
                  }
                />
              ))}
            </div>
          </div>
        )
      })}

      {connectionRows.length === 0 && <p className="object-prop-empty">No connections yet.</p>}
    </>
  )
}

export function PropertiesSidebar({
  open,
  selectedClass,
  selectedExpression,
  selectedClassCount,
  selectedEdge,
  classDataProperties,
  classObjectEdges,
  expressionObjectEdges,
  allClasses,
  allExpressions,
  propertyTab,
  editingLabel,
  editingDataProperty,
  onClose,
  onPropertyTabChange,
  onLabelChange,
  onTagChange,
  onIriChange,
  onCommentChange,
  onExpiredChange,
  onColorChange,
  onCommitNamedClass,
  onExpressionKindChange,
  onUpdateStatementKind,
  onSwapStatementEndpoints,
  onUpdateStatementSource,
  onUpdateStatementTarget,
  onStartEditing,
  onFinishEditing,
  onStartDataPropertyEditing,
  onFinishDataPropertyEditing,
  onDelete,
  onAddDataProperty,
  onUpdateDataProperty,
  onRequestRemoveDataProperty,
  onChangeObjectEdgeOther,
  onRequestRemoveObjectEdge,
  onUpdateObjectEdgeLabel,
  onCommitObjectEdgeLabel,
  onAddStatement,
}: PropertiesSidebarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const sidebarInnerRef = useRef<HTMLDivElement>(null)
  const lastFocusedDataPropRef = useRef<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [draftRightId, setDraftRightId] = useState('')
  const [draftStatementKind, setDraftStatementKind] = useState<StatementKind>('ObjectProperty')
  const [draftRelationLabel, setDraftRelationLabel] = useState('')

  const hasSelection = selectedClass !== null || selectedEdge !== null || selectedExpression !== null
  const isClass = selectedClass !== null
  const isEdge = selectedEdge !== null
  const isExpression = selectedExpression !== null
  const isMultiClass = selectedClassCount > 1
  const deleteLabel = isMultiClass ? `Delete ${selectedClassCount} classes` : 'Delete'
  const classLabel = isClass ? selectedClass.label : ''
  const classTag = isClass ? selectedClass.tag : ''
  const classIri = isClass ? selectedClass.iri : ''
  const classComment = isClass ? selectedClass.comment : ''
  const classExpired = isClass ? selectedClass.expired : false
  const classColor = isClass ? classColorOrDefault(selectedClass.color) : CLASS_COLOR_OPTIONS[0].value
  const canAddStatement =
    (selectedClass !== null || selectedExpression !== null) && draftRightId !== ''
  const connectionAnchorId = selectedClass?.id ?? selectedExpression?.id ?? null

  useEffect(() => {
    if (open) {
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
  }, [open])

  useEffect(() => {
    if (isExpanded || open) return
    const timer = window.setTimeout(() => setIsMounted(false), SIDEBAR_ANIM_MS)
    return () => window.clearTimeout(timer)
  }, [isExpanded, open])

  useEffect(() => {
    setDraftRightId('')
    setDraftRelationLabel('')
    setDraftStatementKind(selectedExpression ? 'subClassOf' : 'ObjectProperty')
  }, [selectedClass?.id, selectedExpression?.id])

  useEffect(() => {
    if (!connectionAnchorId || !draftRightId) return
    const sourceKind = selectedExpression
      ? ('expression' as const)
      : ('namedClass' as const)
    const targetKind = nodeKindById(draftRightId, allClasses, allExpressions) ?? 'namedClass'
    const allowed = getAllowedStatementKinds(sourceKind, targetKind)
    if (!allowed.includes(draftStatementKind)) {
      setDraftStatementKind(allowed[0])
    }
  }, [
    connectionAnchorId,
    selectedExpression?.id,
    draftRightId,
    draftStatementKind,
    allClasses,
    allExpressions,
  ])

  useEffect(() => {
    if (!open || !hasSelection || !editingLabel) return

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
    if (!open || !hasSelection || !editingDataProperty) {
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

  if (!isMounted) return null

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
            <h2>
              {isEdge ? 'Edge' : isExpression ? 'Expression' : 'Properties'}
            </h2>
            {isMultiClass && (
              <span className="sidebar-multi-count">{selectedClassCount} selected</span>
            )}
          </div>
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {!hasSelection ? (
          <div className="sidebar-empty-state">
            <p>Select any graph element for details</p>
          </div>
        ) : (
          <>
        <div className="sidebar-content">
          {isClass && (
            <div className="named-class-metadata">
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
              <div className="property-group property-group-compact">
                <label className="property-label" htmlFor="item-tag-input">
                  Tag
                </label>
                <input
                  id="item-tag-input"
                  className="object-prop-label-input"
                  value={classTag}
                  onChange={(e) => onTagChange(e.target.value)}
                  onBlur={onCommitNamedClass}
                  placeholder="e.g. ARTIFACT"
                  spellCheck={false}
                />
                <p className="property-hint">Shown below the name on the canvas in brackets.</p>
              </div>
              <div className="property-group property-group-compact">
                <label className="property-label" htmlFor="item-iri-input">
                  IRI
                </label>
                <input
                  id="item-iri-input"
                  className="object-prop-label-input"
                  value={classIri}
                  onChange={(e) => onIriChange(e.target.value)}
                  onBlur={onCommitNamedClass}
                  spellCheck={false}
                />
              </div>
              <div className="property-group property-group-compact">
                <label className="property-label" htmlFor="item-comment-input">
                  Comment
                </label>
                <textarea
                  id="item-comment-input"
                  className="object-prop-label-input property-textarea"
                  value={classComment}
                  onChange={(e) => onCommentChange(e.target.value)}
                  onBlur={onCommitNamedClass}
                  rows={3}
                />
              </div>
              <div className="property-group property-group-compact">
                <span className="property-label" id="item-color-label">
                  Color
                </span>
                <div className="class-color-picker" role="group" aria-labelledby="item-color-label">
                  {CLASS_COLOR_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`class-color-swatch ${classColor === option.value ? 'active' : ''}`}
                      style={{ backgroundColor: option.value }}
                      onClick={() => onColorChange(option.value)}
                      aria-label={`${option.label} (${option.value})`}
                      aria-pressed={classColor === option.value}
                      title={option.label}
                    />
                  ))}
                  <label className="class-color-custom" title="Custom color">
                    <span className="sr-only">Custom color</span>
                    <input
                      type="color"
                      className="class-color-custom-input"
                      value={classColor}
                      onChange={(e) => onColorChange(e.target.value)}
                      aria-label="Custom class color"
                    />
                  </label>
                </div>
              </div>
              <div className="property-group property-group-compact">
                <label className="property-label property-checkbox-label" htmlFor="item-expired-input">
                  <input
                    id="item-expired-input"
                    type="checkbox"
                    checked={classExpired}
                    onChange={(e) => onExpiredChange(e.target.checked)}
                  />
                  Expired
                </label>
                <p className="property-hint">Grey out this class on the canvas.</p>
              </div>
              <div className="property-group property-group-compact">
                <span className="property-label">Annotations</span>
                <p className="object-prop-empty">No annotations yet.</p>
              </div>
            </div>
          )}

          {isExpression && selectedExpression && (
            <div className="expression-metadata">
              <div className="property-group property-group-compact">
                <label className="property-label" htmlFor="expression-kind-select">
                  Kind
                </label>
                <select
                  id="expression-kind-select"
                  className="object-prop-select"
                  value={selectedExpression.expressionKind}
                  onChange={(e) => onExpressionKindChange(e.target.value as ExpressionKind)}
                  aria-label="Expression kind"
                >
                  {EXPRESSION_KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="property-meta">
                <span className="property-meta-label">OWL</span>
                <span className="property-meta-value expression-owl-construct">
                  {getExpressionOwlConstructName(selectedExpression.expressionKind)}
                </span>
              </div>
            </div>
          )}

          {isExpression && selectedExpression && (
            <div className="expression-connections">
              <p className="property-label expression-connections-heading">Connections</p>
              <div className="object-prop-composer object-prop-composer-top">
                <p className="object-prop-composer-label">Add connection</p>
                <StatementConnectionBlock
                  edge={{
                    id: 'draft',
                    sourceId: selectedExpression.id,
                    targetId: draftRightId,
                    label: draftRelationLabel,
                    statementKind: draftStatementKind,
                  }}
                  allClasses={allClasses}
                  allExpressions={allExpressions}
                  anchorNodeId={selectedExpression.id}
                  relationLabel={draftRelationLabel}
                  onRelationLabelChange={setDraftRelationLabel}
                  allowEmptyTarget
                  onStatementKindChange={setDraftStatementKind}
                  onSwap={() => {}}
                  onOtherChange={setDraftRightId}
                  trailingAction={
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs object-prop-add"
                      disabled={!canAddStatement}
                      onClick={() => {
                        if (!canAddStatement || !connectionAnchorId) return
                        onAddStatement(
                          connectionAnchorId,
                          draftRightId,
                          draftStatementKind,
                          draftRelationLabel,
                        )
                        setDraftRightId('')
                        setDraftStatementKind('subClassOf')
                        setDraftRelationLabel('')
                      }}
                      aria-label="Add connection"
                    >
                      +
                    </button>
                  }
                />
              </div>

              <NodeConnectionSections
                anchorId={selectedExpression.id}
                connectionRows={expressionObjectEdges}
                allClasses={allClasses}
                allExpressions={allExpressions}
                onUpdateObjectEdgeLabel={onUpdateObjectEdgeLabel}
                onCommitObjectEdgeLabel={onCommitObjectEdgeLabel}
                onUpdateStatementKind={onUpdateStatementKind}
                onSwapStatementEndpoints={onSwapStatementEndpoints}
                onChangeObjectEdgeOther={onChangeObjectEdgeOther}
                onRequestRemoveObjectEdge={onRequestRemoveObjectEdge}
              />
            </div>
          )}

          {isEdge && selectedEdge && (
            <StatementConnectionBlock
              edge={selectedEdge.edge}
              allClasses={allClasses}
              allExpressions={allExpressions}
              relationLabel={selectedEdge.edge.label}
              onRelationLabelChange={(label) => onUpdateObjectEdgeLabel(selectedEdge.edge.id, label)}
              onRelationLabelBlur={() => {
                onCommitObjectEdgeLabel(selectedEdge.edge.id)
                if (editingLabel) onFinishEditing()
              }}
              onRelationLabelFocus={onStartEditing}
              relationLabelId="edge-relation-label-input"
              relationLabelEditing={editingLabel}
              onStatementKindChange={(kind) => onUpdateStatementKind(selectedEdge.edge.id, kind)}
              onSwap={() => onSwapStatementEndpoints(selectedEdge.edge.id)}
              onSourceChange={(nodeId) => onUpdateStatementSource(selectedEdge.edge.id, nodeId)}
              onTargetChange={(nodeId) => onUpdateStatementTarget(selectedEdge.edge.id, nodeId)}
            />
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
                    onClick={() => selectedClass && onAddDataProperty(selectedClass.id)}
                  >
                    + Data property
                  </button>
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
                    <StatementConnectionBlock
                      edge={{
                        id: 'draft',
                        sourceId: selectedClass.id,
                        targetId: draftRightId,
                        label: draftRelationLabel,
                        statementKind: draftStatementKind,
                      }}
                      allClasses={allClasses}
                      allExpressions={allExpressions}
                      anchorNodeId={selectedClass.id}
                      relationLabel={draftRelationLabel}
                      onRelationLabelChange={setDraftRelationLabel}
                      allowEmptyTarget
                      onStatementKindChange={setDraftStatementKind}
                      onSwap={() => {}}
                      onOtherChange={setDraftRightId}
                      trailingAction={
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs object-prop-add"
                          disabled={!canAddStatement}
                          onClick={() => {
                            if (!canAddStatement || !connectionAnchorId) return
                            onAddStatement(
                              connectionAnchorId,
                              draftRightId,
                              draftStatementKind,
                              draftRelationLabel,
                            )
                            setDraftRightId('')
                            setDraftStatementKind('ObjectProperty')
                            setDraftRelationLabel('')
                          }}
                          aria-label="Add connection"
                        >
                          +
                        </button>
                      }
                    />
                  </div>

                  <NodeConnectionSections
                    anchorId={selectedClass.id}
                    connectionRows={classObjectEdges}
                    allClasses={allClasses}
                    allExpressions={allExpressions}
                    onUpdateObjectEdgeLabel={onUpdateObjectEdgeLabel}
                    onCommitObjectEdgeLabel={onCommitObjectEdgeLabel}
                    onUpdateStatementKind={onUpdateStatementKind}
                    onSwapStatementEndpoints={onSwapStatementEndpoints}
                    onChangeObjectEdgeOther={onChangeObjectEdgeOther}
                    onRequestRemoveObjectEdge={onRequestRemoveObjectEdge}
                  />
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
          </>
        )}
      </div>
    </aside>
  )
}

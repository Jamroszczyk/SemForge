interface CanvasViewTogglesProps {
  showEdgeLabels: boolean
  showDataProperties: boolean
  onShowEdgeLabelsChange: (value: boolean) => void
  onShowDataPropertiesChange: (value: boolean) => void
}

export function CanvasViewToggles({
  showEdgeLabels,
  showDataProperties,
  onShowEdgeLabelsChange,
  onShowDataPropertiesChange,
}: CanvasViewTogglesProps) {
  return (
    <div className="topbar-view-toggles">
      <label className="topbar-view-toggle">
        <input
          type="checkbox"
          checked={showEdgeLabels}
          onChange={(e) => onShowEdgeLabelsChange(e.target.checked)}
        />
        <span>Edge Labels</span>
      </label>
      <label className="topbar-view-toggle">
        <input
          type="checkbox"
          checked={showDataProperties}
          onChange={(e) => onShowDataPropertiesChange(e.target.checked)}
        />
        <span>Data Properties</span>
      </label>
    </div>
  )
}

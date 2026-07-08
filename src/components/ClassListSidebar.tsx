import type { OntologyClass } from '../types'

interface ClassListSidebarProps {
  classes: OntologyClass[]
  selectedId: string | null
  collapsed: boolean
  onToggle: () => void
  onSelect: (id: string) => void
}

export function ClassListSidebar({
  classes,
  selectedId,
  collapsed,
  onToggle,
  onSelect,
}: ClassListSidebarProps) {
  return (
    <aside className={`sidebar sidebar-left ${collapsed ? 'collapsed' : ''}`}>
      <button
        type="button"
        className="sidebar-toggle"
        onClick={onToggle}
        aria-label={collapsed ? 'Expand class list' : 'Collapse class list'}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? '›' : '‹'}
      </button>

      <div className="sidebar-inner">
        <div className="sidebar-head">
          <h2>Classes</h2>
          <span className="sidebar-count">{classes.length}</span>
        </div>

        {classes.length === 0 ? (
          <p className="sidebar-empty">Double-click the canvas to add a class.</p>
        ) : (
          <ul className="class-list">
            {classes.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`class-list-item ${selectedId === c.id ? 'active' : ''}`}
                  onClick={() => onSelect(c.id)}
                >
                  <span className="class-dot" aria-hidden="true" />
                  <span className="class-list-label">{c.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

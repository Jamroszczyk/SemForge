import { useMemo, useState } from 'react'
import type { OntologyClass } from '../types'
import { filterAndSortClasses } from '../classListUtils'

interface ClassListSidebarProps {
  classes: OntologyClass[]
  selectedClassIds: ReadonlySet<string>
  hiddenClassIds: ReadonlySet<string>
  collapsed: boolean
  onToggle: () => void
  onSelect: (id: string, additive: boolean) => void
  onToggleVisibility: (id: string) => void
}

function ClassVisibilityIcon({ hidden }: { hidden: boolean }) {
  if (hidden) {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"
        />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
      />
    </svg>
  )
}

function ClassSortIcon({ ascending }: { ascending: boolean }) {
  return <span aria-hidden="true">{ascending ? '↑' : '↓'}</span>
}

export function ClassListSidebar({
  classes,
  selectedClassIds,
  hiddenClassIds,
  collapsed,
  onToggle,
  onSelect,
  onToggleVisibility,
}: ClassListSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortAscending, setSortAscending] = useState(true)

  const displayedClasses = useMemo(
    () => filterAndSortClasses(classes, searchQuery, sortAscending),
    [classes, searchQuery, sortAscending],
  )

  return (
    <aside className={`sidebar sidebar-left ${collapsed ? 'collapsed' : ''}`}>
      {collapsed && (
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggle}
          aria-label="Expand class list"
          title="Expand"
        >
          ›
        </button>
      )}

      <div className="sidebar-inner">
        <div className="sidebar-head sidebar-head-row">
          <div className="sidebar-head-group">
            <h2>Classes</h2>
            <span className="sidebar-count">{classes.length}</span>
          </div>
          {!collapsed && (
            <button
              type="button"
              className="sidebar-inline-toggle"
              onClick={onToggle}
              aria-label="Collapse class list"
              title="Collapse"
            >
              ‹
            </button>
          )}
        </div>

        {!collapsed && classes.length > 0 && (
          <div className="class-list-toolbar">
            <input
              type="search"
              className="class-list-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search classes…"
              aria-label="Search classes"
            />
            <button
              type="button"
              className="btn btn-ghost btn-xs class-list-sort"
              onClick={() => setSortAscending((asc) => !asc)}
              aria-label={sortAscending ? 'Sort classes Z–A' : 'Sort classes A–Z'}
              title={sortAscending ? 'Sort Z–A' : 'Sort A–Z'}
            >
              <ClassSortIcon ascending={sortAscending} />
            </button>
          </div>
        )}

        {classes.length === 0 ? (
          <p className="sidebar-empty">Double-click the canvas to add a class.</p>
        ) : displayedClasses.length === 0 ? (
          <p className="sidebar-empty">No classes match your search.</p>
        ) : (
          <ul className="class-list">
            {displayedClasses.map((c) => {
              const hidden = hiddenClassIds.has(c.id)
              return (
                <li key={c.id} className={`class-list-entry ${hidden ? 'class-list-entry-hidden' : ''}`}>
                  <button
                    type="button"
                    className={`class-list-item ${selectedClassIds.has(c.id) ? 'active' : ''}`}
                    onMouseDown={(e) => {
                      if (e.button === 0) e.preventDefault()
                    }}
                    onClick={(e) =>
                      onSelect(c.id, e.shiftKey || e.ctrlKey || e.metaKey)
                    }
                  >
                    <span className="class-dot" aria-hidden="true" />
                    <span className="class-list-label">{c.label}</span>
                  </button>
                  <button
                    type="button"
                    className={`class-visibility-btn ${hidden ? 'is-hidden' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleVisibility(c.id)
                    }}
                    aria-label={hidden ? `Show ${c.label} on canvas` : `Hide ${c.label} on canvas`}
                    aria-pressed={!hidden}
                    title={hidden ? 'Show on canvas' : 'Hide on canvas'}
                  >
                    <ClassVisibilityIcon hidden={hidden} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}

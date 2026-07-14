import { useEffect, useState } from 'react'

export type DeleteModalKind =
  | 'class'
  | 'classes'
  | 'edge'
  | 'dataProperty'
  | 'objectProperty'

interface DeleteConfirmModalProps {
  kind: DeleteModalKind
  label: string
  classLabels?: string[]
  edgeCount?: number
  dataPropCount?: number
  onConfirm: () => void
  onCancel: () => void
}

const COPY: Record<
  Exclude<DeleteModalKind, 'classes'>,
  { title: string; noun: string }
> = {
  class: { title: 'Delete class', noun: 'class' },
  edge: { title: 'Delete edge', noun: 'edge' },
  dataProperty: { title: 'Delete data property', noun: 'data property' },
  objectProperty: { title: 'Delete connection', noun: 'connection' },
}

const CLASS_DELETE_DELAY_MS = 2000
const MAX_LISTED_LABELS = 5

function formatLabelList(labels: string[]) {
  if (labels.length <= MAX_LISTED_LABELS) return labels.join(', ')
  const shown = labels.slice(0, MAX_LISTED_LABELS).join(', ')
  return `${shown}, +${labels.length - MAX_LISTED_LABELS} more`
}

export function DeleteConfirmModal({
  kind,
  label,
  classLabels = [],
  edgeCount = 0,
  dataPropCount = 0,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  const isBulkClasses = kind === 'classes'
  const title = isBulkClasses
    ? `Delete ${classLabels.length} classes`
    : COPY[kind].title
  const requiresDelay = kind === 'class' || isBulkClasses
  const [remainingMs, setRemainingMs] = useState(requiresDelay ? CLASS_DELETE_DELAY_MS : 0)
  const deleteReady = !requiresDelay || remainingMs === 0
  const deleteSecondsLeft = Math.ceil(remainingMs / 1000)

  useEffect(() => {
    if (!requiresDelay) {
      setRemainingMs(0)
      return
    }

    setRemainingMs(CLASS_DELETE_DELAY_MS)
    const started = Date.now()

    const tick = window.setInterval(() => {
      const left = CLASS_DELETE_DELAY_MS - (Date.now() - started)
      setRemainingMs(Math.max(0, left))
    }, 50)

    return () => window.clearInterval(tick)
  }, [kind, label, classLabels.join('|'), requiresDelay])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !deleteReady) return
      e.preventDefault()
      onConfirm()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onConfirm, deleteReady])

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-title" id="delete-modal-title">
            {title}
          </div>
        </div>
        <div className="modal-body">
          {isBulkClasses ? (
            <>
              <p>
                Remove <strong>{classLabels.length} classes</strong> (
                {formatLabelList(classLabels)}) from the canvas? This cannot be undone.
              </p>
              {(edgeCount > 0 || dataPropCount > 0) && (
                <p className="modal-note">
                  Also removes{' '}
                  {[
                    edgeCount > 0 ? `${edgeCount} connection${edgeCount === 1 ? '' : 's'}` : null,
                    dataPropCount > 0
                      ? `${dataPropCount} data propert${dataPropCount === 1 ? 'y' : 'ies'}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' and ')}
                  .
                </p>
              )}
            </>
          ) : (
            <p>
              Remove the {COPY[kind].noun} <strong>{label}</strong> from the canvas? This cannot be
              undone.
            </p>
          )}
          {requiresDelay && !deleteReady && (
            <p className="modal-note">Delete will be available in {deleteSecondsLeft}s.</p>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={!deleteReady}
            onClick={onConfirm}
          >
            {deleteReady
              ? isBulkClasses
                ? `Delete ${classLabels.length} classes`
                : 'Delete'
              : `Delete (${deleteSecondsLeft})`}
          </button>
        </div>
      </div>
    </div>
  )
}

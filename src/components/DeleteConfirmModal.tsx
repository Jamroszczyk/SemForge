import type { SelectionKind } from '../types'

interface DeleteConfirmModalProps {
  kind: SelectionKind
  label: string
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteConfirmModal({ kind, label, onConfirm, onCancel }: DeleteConfirmModalProps) {
  const title = kind === 'class' ? 'Delete class' : 'Delete edge'
  const noun = kind === 'class' ? 'class' : 'edge'

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
          <p>
            Remove the {noun} <strong>{label}</strong> from the canvas? This cannot be undone.
          </p>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

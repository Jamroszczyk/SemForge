import { useRef } from 'react'

interface GraphTransferButtonsProps {
  onDownload: () => void
  onUpload: (file: File) => void
}

export function GraphTransferButtons({ onDownload, onUpload }: GraphTransferButtonsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        onClick={onDownload}
        aria-label="Download graph as JSON"
        title="Download graph"
      >
        <img src="/download.svg" alt="" className="topbar-transfer-icon" width={18} height={18} />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        onClick={() => fileInputRef.current?.click()}
        aria-label="Upload graph from JSON"
        title="Upload graph"
      >
        <img src="/upload.svg" alt="" className="topbar-transfer-icon" width={18} height={18} />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onUpload(file)
          e.target.value = ''
        }}
      />
    </>
  )
}

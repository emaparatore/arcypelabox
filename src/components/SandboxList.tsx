import type { SandboxInfo } from "../types"

interface Props {
  sandboxes: SandboxInfo[]
  selectedId: string | null
  loading: boolean
  error: string | null
  onSelect: (id: string) => void
  onRefresh: () => void
}

export function SandboxList({ sandboxes, selectedId, loading, error, onSelect }: Props) {
  return (
    <>
      <div className="sandbox-list-header">
        <h2>Sandboxes ({sandboxes.length})</h2>
      </div>

      <div className="sandbox-list">
        {loading && sandboxes.length === 0 ? (
          <div className="empty-state">
            <div className="spinner" />
            <p>Loading sandboxes...</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <p style={{ color: "var(--danger)" }}>{error}</p>
          </div>
        ) : sandboxes.length === 0 ? (
          <div className="empty-state">
            <p>No sandboxes yet</p>
          </div>
        ) : (
          sandboxes.map((s) => (
            <div
              key={s.id}
              className={`sandbox-card ${selectedId === s.id ? "selected" : ""}`}
              onClick={() => onSelect(s.id)}
            >
              <div className="sandbox-card-header">
                <span className="sandbox-card-name">{s.name}</span>
                <span className={`sandbox-card-status ${s.status}`}>{s.status}</span>
              </div>
              <div className="sandbox-card-detail">
                Port: {s.opencodePort} &middot; Image: {s.image}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  )
}

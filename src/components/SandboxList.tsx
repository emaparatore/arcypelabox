import { useState } from "react"
import type { SandboxInfo } from "../types"

interface Props {
  sandboxes: SandboxInfo[]
  selectedId: string | null
  loading: boolean
  error: string | null
  onSelect: (id: string, sandboxId: string) => void
  onRefresh: () => void
  onNewSandbox: () => void
}

export function SandboxList({ sandboxes, selectedId, loading, error, onSelect, onRefresh, onNewSandbox }: Props) {
  const [query, setQuery] = useState("")

  const filtered = query
    ? sandboxes.filter((s) =>
        [s.name, s.image, s.projectMount, s.sandboxId, s.status]
          .some((v) => v?.toLowerCase().includes(query.toLowerCase()))
      )
    : sandboxes

  return (
    <>
      <div className="sandbox-list-header">
        <div className="sandbox-list-header-row">
          <h2>Sandboxes ({filtered.length}{query ? `/${sandboxes.length}` : ""})</h2>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="btn btn-sm icon-btn" onClick={onRefresh} title="Refresh">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 8a6 6 0 0 1-11.3 3.2"/><path d="M2 8a6 6 0 0 1 11.3-3.2"/><path d="M14 2v3.5a.5.5 0 0 1-.5.5H10"/><path d="M2 14v-3.5a.5.5 0 0 1 .5-.5H6"/></svg>
            </button>
            <button className="btn btn-primary btn-sm icon-btn" onClick={onNewSandbox} title="New Sandbox">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3v10"/><path d="M3 8h10"/></svg>
            </button>
          </div>
        </div>
        <input
          className="sandbox-search"
          type="text"
          placeholder="Search sandboxes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
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
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>{query ? "No sandboxes match your search" : "No sandboxes yet"}</p>
          </div>
        ) : (
          filtered.map((s) => (
            <div
              key={s.id}
              className={`sandbox-card ${selectedId === s.id ? "selected" : ""}`}
              onClick={() => onSelect(s.id, s.sandboxId)}
            >
              <div className="sandbox-card-header">
                <div className="sandbox-card-name-col">
                  <span className="sandbox-card-name">{s.name}</span>
                  {s.projectMount && <>
                    <span className="sandbox-card-workspace">{s.projectMount.replace(/[/\\]+$/, "").split(/[/\\]/).pop()}</span>
                    <span className="sandbox-card-fullpath" title={s.projectMount}>{s.projectMount}</span>
                  </>}
                </div>
                <span className={`sandbox-card-status ${s.status}`}>{s.status}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  )
}

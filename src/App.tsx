import { useState, useEffect, useCallback } from "react"
import type { SandboxInfo } from "./types"
import { SandboxList } from "./components/SandboxList"
import { SandboxCreate } from "./components/SandboxCreate"
import { SandboxDetail } from "./components/SandboxDetail"
import "./App.css"

type View = "list" | "create"

export default function App() {
  const [sandboxes, setSandboxes] = useState<SandboxInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedSandboxId, setSelectedSandboxId] = useState<string | null>(null)
  const [view, setView] = useState<View>("list")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.sandobox.listSandboxes()
      if (Array.isArray(result)) {
        setSandboxes(result)
      } else {
        setError(result.error ?? "Failed to list sandboxes")
        setSandboxes([])
      }
    } catch (err) {
      setError((err as Error).message)
      setSandboxes([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [refresh])

  const selected = sandboxes.find((s) => s.id === selectedId) ?? null

  return (
    <div className="app">
      <header className="app-header">
        <h1>Sandobox Manager</h1>
        <div className="app-header-actions">
          <button className="btn btn-sm" onClick={refresh}>
            Refresh
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setView("create")
              setSelectedId(null)
            }}
          >
            + New Sandbox
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside className="app-sidebar">
          <SandboxList
            sandboxes={sandboxes}
            selectedId={selectedId}
            loading={loading}
            error={error}
            onSelect={(id, sandboxId) => {
              setSelectedId(id)
              setSelectedSandboxId(sandboxId)
              setView("list")
            }}
            onRefresh={refresh}
          />
        </aside>

        <main className="app-main">
          {view === "create" ? (
            <SandboxCreate
              onCreated={() => {
                refresh()
                setView("list")
              }}
              onCancel={() => setView("list")}
            />
          ) : selected ? (
            <SandboxDetail
              sandbox={selected}
              sandboxId={selectedSandboxId ?? selected.id}
              onRefresh={refresh}
              onDeleted={() => {
                setSelectedId(null)
                setSelectedSandboxId(null)
                refresh()
              }}
            />
          ) : (
            <div className="empty-state">
              <h2>Select a sandbox</h2>
              <p>Choose a sandbox from the sidebar or create a new one to get started.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

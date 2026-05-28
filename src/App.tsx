import { useState, useEffect, useCallback } from "react"
import type { SandboxInfo, SandboxRecord } from "./types"
import { SandboxList } from "./components/SandboxList"
import { SandboxCreate } from "./components/SandboxCreate"
import { SandboxDetail } from "./components/SandboxDetail"
import { ConfirmModal } from "./components/ConfirmModal"
import brandLogo from "../imgs/arcypelabox-logo-round.png"
import "./App.css"

type View = "list" | "create"
const COMPACT_SIDEBAR_BREAKPOINT = 1200

export default function App() {
  const [sandboxes, setSandboxes] = useState<SandboxInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedSandboxId, setSelectedSandboxId] = useState<string | null>(null)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isCompactSidebarMode, setIsCompactSidebarMode] = useState(() => window.innerWidth <= COMPACT_SIDEBAR_BREAKPOINT)
  const [view, setView] = useState<View>("list")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingRecord, setEditingRecord] = useState<SandboxRecord | null>(null)
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null)

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

  useEffect(() => {
    if (!editingRecord) {
      setConfirmAction(null)
    }
  }, [editingRecord])

  useEffect(() => {
    const handleResize = () => {
      const compact = window.innerWidth <= COMPACT_SIDEBAR_BREAKPOINT
      setIsCompactSidebarMode(compact)
      setIsSidebarCollapsed(compact)
    }

    window.addEventListener("resize", handleResize)
    handleResize()

    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const selected = sandboxes.find((s) => s.id === selectedId) ?? null
  const isSidebarOverlayOpen = isCompactSidebarMode && !isSidebarCollapsed

  const goToNewSandbox = useCallback(() => {
    setEditingRecord(null)
    setView("create")
    setSelectedId(null)
  }, [])

  const handleNewSandbox = useCallback(() => {
    if (editingRecord) {
      setConfirmAction(() => goToNewSandbox)
    } else {
      goToNewSandbox()
    }
  }, [editingRecord, goToNewSandbox])

  const goHome = useCallback(() => {
    setSelectedId(null)
    setSelectedSandboxId(null)
    setView("list")
  }, [])

  const handleGoHome = useCallback(() => {
    if (editingRecord) {
      setConfirmAction(() => goHome)
    } else {
      goHome()
    }
  }, [editingRecord, goHome])

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand" onClick={handleGoHome}>
          <img className="app-brand-logo" src={brandLogo} alt="Arcypelabox logo" />
          <h1 className="app-brand-name">
            <span className="app-brand-name-primary">arcypela</span>
            <span className="app-brand-name-accent">box</span>
          </h1>
        </div>

      </header>

      <div className={`app-body ${isCompactSidebarMode ? "compact-sidebar-mode" : ""}`}>
        <aside className={`app-sidebar ${isSidebarCollapsed ? "collapsed" : ""} ${isSidebarOverlayOpen ? "overlay-open" : ""}`}>
          <div className="app-sidebar-toggle-row">
            <button
              className="btn btn-sm icon-btn"
              type="button"
              onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
              title={isSidebarCollapsed ? "Expand sandboxes" : "Collapse sandboxes"}
              aria-label={isSidebarCollapsed ? "Expand sandboxes" : "Collapse sandboxes"}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
                <path d="M6 2.5v11" />
                {isSidebarCollapsed ? (
                  <>
                    <path d="M8.5 8h3" />
                    <path d="M10 6.5 11.5 8 10 9.5" />
                  </>
                ) : (
                  <>
                    <path d="M11.5 8h-3" />
                    <path d="M10 6.5 8.5 8 10 9.5" />
                  </>
                )}
              </svg>
            </button>
          </div>

          {!isSidebarCollapsed && (
            <SandboxList
              sandboxes={sandboxes}
              selectedId={selectedId}
              loading={loading}
              error={error}
              onSelect={(id, sandboxId) => {
                const go = () => {
                  setSelectedId(id)
                  setSelectedSandboxId(sandboxId)
                  setView("list")
                  if (isCompactSidebarMode) {
                    setIsSidebarCollapsed(true)
                  }
                }
                if (view === "create") {
                  setConfirmAction(() => go)
                } else {
                  go()
                }
              }}
              onRefresh={refresh}
              onNewSandbox={handleNewSandbox}
            />
          )}
        </aside>

        {isSidebarOverlayOpen && <div className="app-sidebar-overlay" onClick={() => setIsSidebarCollapsed(true)} />}

        <main className={`app-main ${isCompactSidebarMode ? "compact-sidebar-main" : ""}`}>
          {view === "create" ? (
            <SandboxCreate
              editRecord={editingRecord}
              onCreated={(sandboxId, containerId) => {
                setEditingRecord(null)
                refresh()
                setSelectedId(containerId)
                setSelectedSandboxId(sandboxId)
                setView("list")
              }}
              onCancel={() => {
                const go = () => {
                  setEditingRecord(null)
                  setView("list")
                }
                if (view === "create") {
                  setConfirmAction(() => go)
                } else {
                  go()
                }
              }}
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
              onEdit={async () => {
                const sid = selectedSandboxId ?? selected.id
                const record = await window.sandobox.db.getFullSandboxRecord(sid)
                if (record && typeof record === "object" && !("error" in record)) {
                  setEditingRecord(record as SandboxRecord)
                  setView("create")
                }
              }}
            />
          ) : (
            <div className="empty-state">
              <h2>Select a sandbox</h2>
              <p>Choose a sandbox from the sidebar or create a new one to get started.</p>
              <button className="btn btn-primary btn-sm icon-btn" onClick={handleNewSandbox} title="New Sandbox" style={{ marginTop: 16 }}>
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3v10"/><path d="M3 8h10"/></svg>
              </button>
            </div>
          )}
        </main>
      </div>

      {confirmAction && (
        <ConfirmModal
          title="Unsaved changes"
          message="You have unsaved changes in the sandbox editor. Leaving now will discard them."
          confirmLabel="Leave"
          cancelLabel="Stay"
          onConfirm={() => {
            const action = confirmAction
            setConfirmAction(null)
            action()
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}

import { useState, useEffect, useCallback } from "react"
import type { SandboxInfo, ContainerLog } from "../types"
import { OpenCodePanel } from "./OpenCodePanel"

interface Props {
  sandbox: SandboxInfo
  sandboxId: string
  onRefresh: () => void
  onDeleted: () => void
}

type Tab = "info" | "logs" | "opencode"

export function SandboxDetail({ sandbox, sandboxId, onRefresh, onDeleted }: Props) {
  const [tab, setTab] = useState<Tab>("info")
  const [logs, setLogs] = useState<ContainerLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    const result = await window.sandobox.getSandboxLogs(sandbox.id)
    if (Array.isArray(result)) {
      setLogs(result)
    }
  }, [sandbox.id])

  useEffect(() => {
    if (tab === "logs") fetchLogs()
  }, [tab, fetchLogs])

  const handleStart = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.sandobox.startSandbox(sandbox.id)
      if ("error" in result) setError(result.error)
      else onRefresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleStop = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.sandobox.stopSandbox(sandbox.id)
      if ("error" in result) setError(result.error)
      else onRefresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.sandobox.removeSandbox(sandbox.id)
      if ("error" in result) setError(result.error)
      else onDeleted()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const isRunning = sandbox.status === "running"

  return (
    <div className="sandbox-detail">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{sandbox.name}</h2>
        <span className={`sandbox-card-status ${sandbox.status}`}>{sandbox.status}</span>
      </div>

      <div className="tabs">
        <div className={`tab ${tab === "info" ? "active" : ""}`} onClick={() => setTab("info")}>
          Info
        </div>
        <div className={`tab ${tab === "logs" ? "active" : ""}`} onClick={() => setTab("logs")}>
          Logs
        </div>
        <div
          className={`tab ${tab === "opencode" ? "active" : ""}`}
          onClick={() => setTab("opencode")}
        >
          OpenCode Panel
        </div>
      </div>

      {tab === "info" && (
        <>
          <div className="sandbox-detail-section">
            <h3>Details</h3>
            <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
              <div>
                <strong>ID:</strong> {sandbox.id.slice(0, 12)}...
              </div>
              <div>
                <strong>Image:</strong> {sandbox.image}
              </div>
              <div>
                <strong>OpenCode Port:</strong> {sandbox.opencodePort}
              </div>
              <div>
                <strong>Project Mount:</strong> {sandbox.projectMount || "None"}
              </div>
              <div>
                <strong>Status:</strong> {sandbox.status}
              </div>
              <div>
                <strong>Created:</strong> {new Date(sandbox.createdAt).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="sandbox-detail-section">
            <h3>Actions</h3>
            <div className="sandbox-detail-actions">
              {isRunning ? (
                <button className="btn btn-danger" onClick={handleStop} disabled={loading}>
                  Stop
                </button>
              ) : (
                <button className="btn btn-success" onClick={handleStart} disabled={loading}>
                  Start
                </button>
              )}
              <button className="btn btn-danger" onClick={handleRemove} disabled={loading}>
                Delete
              </button>
              <button className="btn" onClick={onRefresh}>
                Refresh
              </button>
            </div>
          </div>

          {error && (
            <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{error}</div>
          )}

          {isRunning && (
            <div
              style={{
                padding: "8px 12px",
                background: "rgba(var(--success-rgb), 0.1)",
                border: "1px solid rgba(var(--success-rgb), 0.3)",
                borderRadius: 6,
                fontSize: 13,
                color: "var(--success)",
                marginTop: 16,
              }}
            >
              Sandbox is running. OpenCode server available at{" "}
              <code>http://localhost:{sandbox.opencodePort}</code>.
              Use the OpenCode SDK to connect from external apps.
            </div>
          )}
        </>
      )}

      {tab === "logs" && (
        <div className="sandbox-detail-section">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <h3>Container Logs</h3>
            <button className="btn btn-sm" onClick={fetchLogs}>
              Refresh Logs
            </button>
          </div>
          <div className="log-viewer">
            {logs.length === 0 ? (
              <div style={{ color: "var(--text-secondary)" }}>No logs available</div>
            ) : (
              logs.map((l, i) => (
                <div key={i} className="log-line">
                  <span style={{ color: "var(--text-secondary)" }}>{l.time}</span>{" "}
                  <span>{l.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === "opencode" && isRunning && (
        <OpenCodePanel sandboxId={sandboxId} containerId={sandbox.id} port={sandbox.opencodePort} />
      )}

      {tab === "opencode" && !isRunning && (
        <div className="empty-state">
          <h2>Sandbox is not running</h2>
          <p>Start the sandbox to interact with OpenCode.</p>
        </div>
      )}
    </div>
  )
}

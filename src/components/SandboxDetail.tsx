import { useState, useEffect, useCallback } from "react"
import type { SandboxInfo, ContainerLog } from "../types"
import { OpenCodePanel } from "./OpenCodePanel"
import { ConfirmModal } from "./ConfirmModal"

interface Props {
  sandbox: SandboxInfo
  sandboxId: string
  onRefresh: () => void
  onDeleted: () => void
  onEdit?: () => void
}

type Tab = "info" | "logs" | "opencode"
type ConfirmAction = "stop" | "delete" | null

export function SandboxDetail({ sandbox, sandboxId, onRefresh, onDeleted, onEdit }: Props) {
  const [tab, setTab] = useState<Tab>("info")
  const [logs, setLogs] = useState<ContainerLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<ConfirmAction>(null)

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

  const executeStop = async () => {
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

  const executeRemove = async () => {
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
                <button className="btn btn-danger icon-btn" onClick={() => setConfirming("stop")} disabled={loading} title="Stop">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1"/></svg>
                </button>
              ) : (
                <button className="btn btn-success icon-btn" onClick={handleStart} disabled={loading} title="Start">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><polygon points="3,2 14,8 3,14"/></svg>
                </button>
              )}
              <button className="btn btn-danger icon-btn" onClick={() => setConfirming("delete")} disabled={loading} title="Delete">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h12"/><path d="M5 4V2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5V4"/><path d="M3 4v9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4"/><path d="M6 7v4"/><path d="M10 7v4"/></svg>
              </button>
              <button className="btn icon-btn" onClick={onRefresh} title="Refresh">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 8a6 6 0 0 1-11.3 3.2"/><path d="M2 8a6 6 0 0 1 11.3-3.2"/><path d="M14 2v3.5a.5.5 0 0 1-.5.5H10"/><path d="M2 14v-3.5a.5.5 0 0 1 .5-.5H6"/></svg>
              </button>
              <button className="btn icon-btn" onClick={() => onEdit?.()} disabled={loading} title="Edit">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3l9.5-9.5z"/><path d="M9.5 3.5l3 3"/></svg>
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

      {confirming === "stop" && (
        <ConfirmModal
          title="Stop Sandbox"
          message={`Are you sure you want to stop "${sandbox.name}"? The container and its services will be shut down but not removed.`}
          confirmLabel="Stop"
          variant="danger"
          onConfirm={() => {
            setConfirming(null)
            executeStop()
          }}
          onCancel={() => setConfirming(null)}
        />
      )}

      {confirming === "delete" && (
        <ConfirmModal
          title="Delete Sandbox"
          message={`Are you sure you want to permanently delete "${sandbox.name}"? The container, its services, and all data inside the container (not the mounted project folder) will be lost.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => {
            setConfirming(null)
            executeRemove()
          }}
          onCancel={() => setConfirming(null)}
        >
          <div
            style={{
              marginTop: 12,
              padding: "8px 12px",
              border: "1px solid var(--danger)",
              borderRadius: 6,
              background: "rgba(var(--danger-rgb, 255, 80, 80), 0.08)",
              fontSize: 12,
              color: "var(--danger)",
              lineHeight: 1.5,
            }}
          >
            <strong>⚠️ This action is irreversible.</strong> Once deleted, the container and all
            uncommitted changes inside it cannot be recovered.
          </div>
        </ConfirmModal>
      )}
    </div>
  )
}

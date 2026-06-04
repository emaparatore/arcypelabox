import { useState, useEffect, useCallback } from "react"
import type { SandboxInfo, SandboxRecord, ContainerLog } from "../types"
import { OpenCodePanel } from "./OpenCodePanel"
import { OpenCodeCLIButton } from "./OpenCodeCLIButton"
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
  const [fullRecord, setFullRecord] = useState<SandboxRecord | null>(null)
  const [containerPort, setContainerPort] = useState<number | null>(null)
  const [showDockerfile, setShowDockerfile] = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const [composeContent, setComposeContent] = useState("")
  const [copyToast, setCopyToast] = useState<{ x: number; y: number } | null>(null)

  const fetchLogs = useCallback(async () => {
    const result = await window.sandobox.getSandboxLogs(sandbox.id)
    if (Array.isArray(result)) {
      setLogs(result)
    }
  }, [sandbox.id])

  useEffect(() => {
    if (tab === "logs") fetchLogs()
  }, [tab, fetchLogs])

  useEffect(() => {
    let cancelled = false
    const sid = sandbox.sandboxId || sandboxId
    window.sandobox.db.getFullSandboxRecord(sid).then((rec) => {
      if (!cancelled && rec && typeof rec === "object" && !("error" in rec)) {
        setFullRecord(rec as SandboxRecord)
      }
    })
    window.sandobox.getProxyTarget(sid).then((res) => {
      if (!cancelled && "port" in res) {
        setContainerPort(res.port)
      }
    })
    return () => { cancelled = true }
  }, [sandbox.sandboxId, sandboxId, sandbox.status])

  useEffect(() => {
    let cancelled = false
    const sid = sandbox.sandboxId || sandboxId
    window.sandobox.generateCompose(sid).then((res) => {
      if (!cancelled && typeof res === "string") {
        setComposeContent(res)
      }
    })
    return () => { cancelled = true }
  }, [sandbox.sandboxId, sandboxId, sandbox.status])

  useEffect(() => {
    if (!copyToast) return
    const timer = setTimeout(() => setCopyToast(null), 1500)
    return () => clearTimeout(timer)
  }, [copyToast])

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

  function generateCompose(): string {
    return composeContent
  }

  const isRunning = sandbox.status === "running"

  return (
    <div className="sandbox-detail">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{sandbox.name}</h2>
        <span className={`sandbox-card-status ${sandbox.status}`}>{sandbox.status}</span>
        <div className="sandbox-detail-actions" style={{ marginLeft: "auto" }}>
          {isRunning ? (
            <button className="btn btn-danger icon-btn" onClick={() => setConfirming("stop")} disabled={loading} title="Stop">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1"/></svg>
            </button>
          ) : (
            <button className="btn btn-success icon-btn" onClick={handleStart} disabled={loading} title="Start">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><polygon points="3,2 14,8 3,14"/></svg>
            </button>
          )}
          {isRunning && <OpenCodeCLIButton sandboxId={sandbox.sandboxId} />}
          <button className="btn icon-btn" onClick={onRefresh} title="Refresh">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 8a6 6 0 0 1-11.3 3.2"/><path d="M2 8a6 6 0 0 1 11.3-3.2"/><path d="M14 2v3.5a.5.5 0 0 1-.5.5H10"/><path d="M2 14v-3.5a.5.5 0 0 1 .5-.5H6"/></svg>
          </button>
          <button className="btn icon-btn" onClick={() => onEdit?.()} disabled={loading} title="Edit">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3l9.5-9.5z"/><path d="M9.5 3.5l3 3"/></svg>
          </button>
          <button className="btn btn-danger icon-btn" onClick={() => setConfirming("delete")} disabled={loading} title="Delete">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h12"/><path d="M5 4V2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5V4"/><path d="M3 4v9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4"/><path d="M6 7v4"/><path d="M10 7v4"/></svg>
          </button>
        </div>
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
        <div style={{ position: "relative" }}>
          {copyToast && (
            <div style={{ position: "fixed", left: copyToast.x, top: copyToast.y - 28, background: "var(--bg-secondary)", color: "var(--text-secondary)", padding: "4px 10px", borderRadius: 4, fontSize: 12, border: "1px solid var(--border-color)", pointerEvents: "none", zIndex: 1000 }}>
              Copied
            </div>
          )}
          <div className="sandbox-detail-section" style={{ marginBottom: 10 }}>
            <h3 className="section-title">General</h3>
            <div className="info-grid">
              <div><span className="info-label">Image</span><span className="info-value">{sandbox.image}</span></div>
              <div><span className="info-label">Status</span><span className="info-value">{sandbox.status}</span></div>
              <div><span className="info-label">Sandbox ID</span><span className="info-value" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{sandbox.sandboxId}</span></div>
              
              
              
              <div></div>
              <div><span className="info-label">OpenCode SDK Server URL</span><span className="info-value" style={{ fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }} onClick={(e) => { navigator.clipboard.writeText(`http://localhost:4096/${sandbox.sandboxId}`); setCopyToast({ x: e.clientX, y: e.clientY }) }} title="Copy URL">http://localhost:4096/{sandbox.sandboxId}</span></div>
              {containerPort && (
                <div>
                  <span className="info-label">OpenCode Web</span>
                  <span className="info-value">
                    {sandbox.status === "running" ? (
                      <a href={`http://127.0.0.1:${containerPort}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                        http://127.0.0.1:{containerPort} ↗
                      </a>
                    ) : (
                      <span className="info-value" style={{ fontFamily: "var(--font-mono)", fontSize: 11, opacity: 0.5 }}>
                        http://127.0.0.1:{containerPort}
                      </span>
                    )}
                  </span>
                </div>
              )}
              <div><span className="info-label">Created</span><span className="info-value">{new Date(sandbox.createdAt).toLocaleString()}</span></div>
              {fullRecord && <div><span className="info-label">Updated</span><span className="info-value">{new Date(fullRecord.updated_at).toLocaleString()}</span></div>}
            </div>
          </div>

          <div className="sandbox-detail-section" style={{ marginBottom: 10 }}>
            <h3 className="section-title">Workspace</h3>
            <div className="info-grid">
              <div><span className="info-label">Mount</span><span className="info-value" style={{ display: "inline-flex", alignItems: "flex-end" }}>{sandbox.projectMount ? <span className="mount-path">{sandbox.projectMount}</span> : "None"}{sandbox.projectMount && <><span className="mount-icon-btn" style={{ marginLeft: 6 }} onClick={() => window.sandobox.openPath(sandbox.projectMount!)} title="Open folder"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5a2 2 0 0 1 2-2h3.5L9 5h5a1 1 0 0 1 1 1v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5z"/><path d="M7 9l3-3"/><path d="M10 6H7v3"/></svg></span><span className="mount-icon-btn" style={{ marginLeft: 6 }} onClick={() => window.sandobox.openInTerminal(sandbox.projectMount!)} title="Open in terminal"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg></span></>}</span></div>
              {fullRecord?.git_config && Object.keys(fullRecord.git_config).length > 0 && (
                <div style={{ gridColumn: "span 2" }}><span className="info-label">Git Config</span><span className="info-value">{Object.entries(fullRecord.git_config).map(([k, v]) => `${k}=${v}`).join(", ")}</span></div>
              )}
              {fullRecord?.permissions && Object.keys(fullRecord.permissions).length > 0 && (
                <div style={{ gridColumn: "span 2" }}><span className="info-label">OpenCode Permissions</span><span className="info-value">{Object.entries(fullRecord.permissions).map(([k, v]) => `${k}=${v}`).join(", ")}</span></div>
              )}
            </div>
          </div>

          {fullRecord && (fullRecord.runtimes.length > 0 || fullRecord.tools.length > 0 || fullRecord.services.length > 0 || (fullRecord.providers && fullRecord.providers.length > 0)) && (
            <div className="sandbox-detail-section" style={{ marginBottom: 10 }}>
              <h3 className="section-title">Technology</h3>
              <div className="info-grid">
                {fullRecord.runtimes.length > 0 && (
                  <div style={{ gridColumn: "span 2" }}><span className="info-label">Runtimes</span><span className="info-value">{fullRecord.runtimes.join(", ")}</span></div>
                )}
                {fullRecord.tools.length > 0 && (
                  <div style={{ gridColumn: "span 2" }}><span className="info-label">Tools</span><span className="info-value">{fullRecord.tools.join(", ")}</span></div>
                )}
                {fullRecord.services.length > 0 && (
                  <div style={{ gridColumn: "span 2" }}><span className="info-label">Services</span><span className="info-value">{fullRecord.services.join(", ")}</span></div>
                )}
                {fullRecord.providers && fullRecord.providers.length > 0 && (
                  <div style={{ gridColumn: "span 2" }}><span className="info-label">Providers</span><span className="info-value">{fullRecord.providers.map((p) => p.id).join(", ")}</span></div>
                )}
              </div>
            </div>
          )}

          <div className="sandbox-detail-section" style={{ marginBottom: 10 }}>
            <h3 className="section-title">Docker</h3>
            <div className="info-grid">
              <div><span className="info-label">Container ID</span><span className="info-value" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{sandbox.id}</span></div>
              {fullRecord?.docker_container_id && (
                <div><span className="info-label">Docker ID (DB)</span><span className="info-value" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{fullRecord.docker_container_id}</span></div>
              )}
            </div>
            {fullRecord?.generated_dockerfile && (
              <div style={{ marginTop: 8 }}>
                <button
                  className="collapsible-header"
                  onClick={() => setShowDockerfile(!showDockerfile)}
                >
                  <span className={`collapsible-chevron ${showDockerfile ? "open" : ""}`}>&#9654;</span>
                  Dockerfile
                </button>
                {showDockerfile && (
                  <div style={{ position: "relative" }}>
                    <pre className="collapsible-content">{fullRecord.generated_dockerfile}</pre>
                    <span className="dockerfile-copy"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--brand-sun)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }} onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(fullRecord.generated_dockerfile); setCopyToast({ x: e.clientX, y: e.clientY }) }}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>
                  </div>
                )}
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <button
                className="collapsible-header"
                onClick={() => setShowCompose(!showCompose)}
              >
                <span className={`collapsible-chevron ${showCompose ? "open" : ""}`}>&#9654;</span>
                Docker Compose
              </button>
              {showCompose && (
                <div style={{ position: "relative" }}>
                  <pre className="collapsible-content">{generateCompose()}</pre>
                  <span className="dockerfile-copy"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--brand-sun)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }} onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(generateCompose()); setCopyToast({ x: e.clientX, y: e.clientY }) }}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>
                </div>
              )}
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
                marginTop: 12,
              }}
            >
              Sandbox is running. OpenCode server available at{" "}
              <code>http://localhost:4096/{sandbox.sandboxId}</code>.
              Use the OpenCode SDK to connect from external apps.
            </div>
          )}
          </div>
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
        <OpenCodePanel sandboxId={sandboxId} containerId={sandbox.id} />
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

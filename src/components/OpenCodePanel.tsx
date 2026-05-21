import { useState, useEffect } from "react"
import { useOpenCode } from "../hooks/useOpenCode"
import { OpenCodeCLIButton } from "./OpenCodeCLIButton"

interface Props {
  sandboxId: string
  containerId: string
  port: number
}

export function OpenCodePanel({ sandboxId, port }: Props) {
  const [input, setInput] = useState("")
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string[]>>({})
  const [showNewSessionForm, setShowNewSessionForm] = useState(false)
  const [newSessionTitle, setNewSessionTitle] = useState("")
  const [selectedProviderId, setSelectedProviderId] = useState<string>("")
  const [selectedModelId, setSelectedModelId] = useState<string>("")
  const [showIntermediate, setShowIntermediate] = useState(false)
  const [busyMessage, setBusyMessage] = useState<string | null>(null)
  const [sessionFilter, setSessionFilter] = useState("")
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const {
    messages,
    messagesEndRef,
    connected,
    loading,
    providers,
    sessions,
    selectedSessionId,
    setSelectedSessionId,
    pendingPermissions,
    pendingQuestions,
    sessionDebug,
    setSessionDebug,
    diagnostic,
    sendPrompt,
    createSession,
    deleteSession,
    abortSession,
    replyQuestion,
    replyPermission,
    refreshSessionDebug,
    refreshAll,
  } = useOpenCode(port)

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null

  const models = providers.find((p) => p.id === selectedProviderId)?.models ?? []

  useEffect(() => {
    if (providers.length > 0 && !selectedProviderId) {
      setSelectedProviderId(providers[0].id)
    }
  }, [providers, selectedProviderId])

  useEffect(() => {
    if (models.length > 0 && !selectedModelId) {
      setSelectedModelId(models[0].id)
    }
  }, [models, selectedModelId])

  useEffect(() => {
    if (!selectedSessionId) return
    if (selectedSession?.status === "busy") {
      const timer = setTimeout(() => {
        refreshSessionDebug(selectedSessionId)
      }, 2000)
      return () => clearTimeout(timer)
    } else {
      setSessionDebug(null)
    }
  }, [selectedSessionId, selectedSession?.status, refreshSessionDebug, setSessionDebug])

  const showBusyWarning = () => {
    setBusyMessage("Session is busy — wait for the AI to finish before sending a new message.")
    setTimeout(() => setBusyMessage(null), 3000)
  }

  const handleSend = async () => {
    if (!input.trim() || loading || !selectedSessionId) return
    if (selectedSession?.status === "busy") {
      showBusyWarning()
      return
    }
    const text = input.trim()
    setInput("")
    await sendPrompt(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (selectedSession?.status === "busy") {
        showBusyWarning()
        return
      }
      handleSend()
    }
  }

  const handlePermissionReply = async (
    requestId: string,
    reply: "once" | "always" | "reject",
  ) => {
    setPermissionError(null)
    try {
      await replyPermission(requestId, reply)
    } catch (err) {
      setPermissionError((err as Error).message)
    }
  }

  const handleAbortSession = async (sessionId: string) => {
    setPermissionError(null)
    try {
      await abortSession(sessionId)
    } catch (err) {
      setPermissionError((err as Error).message)
    }
  }

  const handleDeleteSession = async () => {
    if (!deleteConfirmId) return
    await deleteSession(deleteConfirmId)
    setDeleteConfirmId(null)
  }

  const handleNewSession = async () => {
    if (!showNewSessionForm) {
      setShowNewSessionForm(true)
      setNewSessionTitle("")
      return
    }
    if (!newSessionTitle.trim()) return
    const params: { title?: string; model?: { providerID: string; id: string } } = {
      title: newSessionTitle.trim(),
    }
    if (selectedProviderId && selectedModelId) {
      params.model = { providerID: selectedProviderId, id: selectedModelId }
    }
    await createSession(params)
    setShowNewSessionForm(false)
    setNewSessionTitle("")
  }

  const toggleQuestionAnswer = (requestId: string, optionLabel: string, multiple: boolean) => {
    setQuestionAnswers((prev) => {
      const current = prev[requestId] ?? []
      if (!multiple) return { ...prev, [requestId]: [optionLabel] }
      return current.includes(optionLabel)
        ? { ...prev, [requestId]: current.filter((entry) => entry !== optionLabel) }
        : { ...prev, [requestId]: [...current, optionLabel] }
    })
  }

  const handleQuestionReply = async (requestId: string, multiple: boolean) => {
    setPermissionError(null)
    try {
      const selected = questionAnswers[requestId] ?? []
      await replyQuestion(requestId, [multiple ? selected : selected.slice(0, 1)])
      setQuestionAnswers((prev) => {
        const next = { ...prev }
        delete next[requestId]
        return next
      })
    } catch (err) {
      setPermissionError((err as Error).message)
    }
  }

  return (
    <div className="opencode-panel">
      <div className="opencode-panel-header">
        <span>OpenCode Chat - Port {port}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            className={`status-dot ${connected ? "connected" : "disconnected"}`}
          />
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      <div className="opencode-panel-body">
        <div className="opencode-chat">
          {(diagnostic || sessionDebug) && (
            <div className="opencode-diagnostics">
              {diagnostic && <div className="opencode-diagnostic-error">{diagnostic}</div>}
              {sessionDebug && (
                <div className="session-debug-card">
                  <div className="session-debug-title">
                    Current Operation
                    <button
                      className="btn btn-sm"
                      style={{ marginLeft: "auto" }}
                      onClick={() => selectedSessionId && refreshSessionDebug(selectedSessionId)}
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="session-debug-line">
                    Session: <code>{sessionDebug.sessionId}</code>
                    {sessionDebug.lastMessageRole
                      ? ` | Last message: ${sessionDebug.lastMessageRole}`
                      : ""}
                  </div>
                  {sessionDebug.toolName && (
                    <div className="session-debug-line">
                      Tool: <code>{sessionDebug.toolName}</code>
                      {sessionDebug.toolStatus ? ` (${sessionDebug.toolStatus})` : ""}
                    </div>
                  )}
                  {sessionDebug.toolInput && (
                    <pre className="session-debug-pre">{sessionDebug.toolInput}</pre>
                  )}
                  {sessionDebug.assistantText && (
                    <pre className="session-debug-pre">{sessionDebug.assistantText}</pre>
                  )}
                  {sessionDebug.error && (
                    <div className="opencode-diagnostic-error">{sessionDebug.error}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {pendingPermissions.length > 0 && (
            <div className="permission-banner">
              <div className="permission-banner-header">
                <strong>OpenCode is waiting for permission</strong>
              </div>
              {pendingPermissions.map((request) => (
                <div key={request.id} className="permission-card">
                  <div>
                    <div className="permission-name">{request.permission}</div>
                    {request.patterns.length > 0 && (
                      <div className="permission-patterns">{request.patterns.join(", ")}</div>
                    )}
                  </div>
                  <div className="permission-actions">
                    <button
                      className="btn btn-sm"
                      onClick={() => handlePermissionReply(request.id, "once")}
                    >
                      Allow Once
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handlePermissionReply(request.id, "always")}
                    >
                      Always Allow
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handlePermissionReply(request.id, "reject")}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
              {permissionError && <div className="permission-error">{permissionError}</div>}
            </div>
          )}

          {pendingQuestions.length > 0 && (
            <div className="permission-banner">
              <div className="permission-banner-header">
                <strong>OpenCode needs an answer to continue</strong>
              </div>
              {pendingQuestions.map((request) => {
                const item = request.questions[0]
                const selected = questionAnswers[request.id] ?? []
                return (
                  <div key={request.id} className="question-card">
                    <div className="permission-name">{item?.header || "Question"}</div>
                    <div className="question-text">{item?.question}</div>
                    <div className="question-options">
                      {item?.options.map((option) => {
                        const active = selected.includes(option.label)
                        return (
                          <button
                            key={option.label}
                            className={`option-card ${active ? "selected" : ""}`}
                            onClick={() =>
                              toggleQuestionAnswer(request.id, option.label, Boolean(item.multiple))
                            }
                            type="button"
                          >
                            <strong>{option.label}</strong>
                            <span>{option.description}</span>
                          </button>
                        )
                      })}
                    </div>
                    <div className="permission-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={selected.length === 0}
                        onClick={() => handleQuestionReply(request.id, Boolean(item?.multiple))}
                      >
                        Submit Answer
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="opencode-panel-messages">
            {!selectedSessionId && (
              <div style={{ color: "var(--text-secondary)", textAlign: "center", padding: 20 }}>
                {connected ? "Create a new session to start chatting." : "Connecting to OpenCode server..."}
              </div>
            )}
            {selectedSessionId && messages.length === 0 && (
              <div style={{ color: "var(--text-secondary)", textAlign: "center", padding: 20 }}>
                {connected
                  ? "Send a message to start interacting with OpenCode in the sandbox."
                  : "Connecting to OpenCode server..."}
              </div>
            )}
            {messages
              .filter((msg) => showIntermediate || msg.role === "user" || msg.content)
              .map((msg, i) => (
                <div key={i} className={`opencode-message ${msg.role}`}>
                  {showIntermediate && msg.parts ? (
                    msg.parts.map((part, pi) => {
                      if (part.type === "text") {
                        return <div key={pi}>{part.text}</div>
                      }
                      if (part.type === "tool") {
                        return (
                          <div key={pi} className="msg-tool-call">
                            <span className="msg-tool-name">🛠 {part.tool}</span>
                            {part.input && <pre className="msg-tool-input">{part.input}</pre>}
                            {part.output && <pre className="msg-tool-output">{part.output}</pre>}
                          </div>
                        )
                      }
                      if (part.type === "file") {
                        return <div key={pi} className="msg-file-call">📄 {part.text}</div>
                      }
                      return null
                    })
                  ) : (
                    msg.content
                  )}
                </div>
              ))}
            {loading && (
              <div className="opencode-message assistant">
                <div className="spinner" />
              </div>
            )}
            {!loading && selectedSession?.status === "busy" && (messages.length === 0 || !messages[messages.length - 1].content) && (
              <div className="opencode-message assistant">
                <div className="spinner" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

      <div className="opencode-panel-input">
        <div className="opencode-panel-input-wrapper">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask OpenCode to do something..."
            disabled={!connected || !selectedSessionId}
            rows={2}
          />
          <button
            className="btn btn-primary btn-send"
            onClick={handleSend}
            disabled={!connected || loading || !input.trim() || !selectedSessionId || selectedSession?.status === "busy"}
            title="Send message"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        {busyMessage && (
          <div className="opencode-busy-warning">{busyMessage}</div>
        )}
      </div>
        </div>

        <div className="opencode-sessions-panel">
          <div className="sessions-panel-header">
            <span className="sessions-panel-title">Sessions</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                className="btn btn-sm"
                onClick={refreshAll}
                title="Refresh sessions and messages"
              >
                ↻
              </button>
              <button
                className="btn btn-sm"
                onClick={handleNewSession}
              >
                + New
              </button>
            </div>
          </div>

          <div className="sessions-filter">
            <input
              type="text"
              placeholder="Filter sessions..."
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
            />
          </div>

          {showNewSessionForm && (
            <div className="sessions-new-form">
              <input
                type="text"
                placeholder="Session title..."
                value={newSessionTitle}
                onChange={(e) => setNewSessionTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNewSession()
                }}
                autoFocus
              />
              <div className="sessions-model-selectors">
                <select
                  value={selectedProviderId}
                  onChange={(e) => {
                    setSelectedProviderId(e.target.value)
                    setSelectedModelId("")
                  }}
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sessions-new-actions">
                <button className="btn btn-primary btn-sm" onClick={handleNewSession}>
                  Create
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => setShowNewSessionForm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="sessions-list">
            {sessions.filter((s) => s.title.toLowerCase().includes(sessionFilter.toLowerCase())).length === 0 && (
              <div className="sessions-empty">
                {sessionFilter ? "No sessions match your filter." : "No sessions yet. Create one to start."}
              </div>
            )}
            {sessions
              .filter((s) => s.title.toLowerCase().includes(sessionFilter.toLowerCase()))
              .map((session) => (
              <div
                key={session.id}
                className={`sessions-item ${session.id === selectedSessionId ? "active" : ""}`}
                onClick={() => setSelectedSessionId(session.id)}
              >
                <div className="sessions-item-info">
                  <div className="sessions-item-title">{session.title}</div>
                  <div className="sessions-item-meta">
                    <span className={`sessions-item-status ${session.status}`}>
                      {session.status}
                    </span>
                    {session.model && (
                      <span className="sessions-item-model">
                        {session.model.providerID}/{session.model.id}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className="sessions-item-delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteConfirmId(session.id)
                  }}
                  title="Delete session"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="sessions-model-info">
            <div className="sessions-model-left">
              {selectedSession && !showNewSessionForm && (
                <>
                  <span className="sessions-model-label">Active model</span>
                  <span className="sessions-model-value">
                    {selectedSession.model
                      ? `${selectedSession.model.providerID}/${selectedSession.model.id}`
                      : "Default"}
                  </span>
                </>
              )}
              <label className="sessions-toggle-label">
                <input
                  type="checkbox"
                  checked={showIntermediate}
                  onChange={(e) => {
                    setShowIntermediate(e.target.checked)
                    requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView())
                  }}
                />
                <span>Show intermediate steps</span>
              </label>
            </div>
            <div className="sessions-model-right">
              <OpenCodeCLIButton port={port} sessionId={selectedSessionId ?? undefined} className="btn-sm" />
            </div>
          </div>
        </div>
      </div>

      {deleteConfirmId && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">Delete session</div>
            <div className="modal-body">
              Are you sure you want to delete this session? This action cannot be undone.
            </div>
            <div className="modal-actions">
              <button className="btn btn-sm" onClick={() => setDeleteConfirmId(null)}>
                Cancel
              </button>
              <button className="btn btn-danger btn-sm" onClick={handleDeleteSession}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useRef, useEffect } from "react"
import { useOpenCode } from "../hooks/useOpenCode"

interface Props {
  sandboxId: string
  port: number
}

export function OpenCodePanel({ sandboxId, port }: Props) {
  const [input, setInput] = useState("")
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string[]>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const {
    messages,
    connected,
    loading,
    pendingPermissions,
    pendingQuestions,
    sessions,
    sessionDebug,
    diagnostic,
    connect,
    disconnect,
    sendPrompt,
    refreshPermissions,
    refreshQuestions,
    refreshSessions,
    refreshSessionDebug,
    replyQuestion,
    replyPermission,
    abortSession,
  } = useOpenCode(port)

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (!connected) return

    const interval = setInterval(() => {
      refreshPermissions()
      refreshQuestions()
      refreshSessions()
      refreshSessionDebug()
    }, 1500)

    return () => clearInterval(interval)
  }, [connected, refreshPermissions, refreshQuestions, refreshSessionDebug, refreshSessions])

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const text = input.trim()
    setInput("")
    await sendPrompt(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
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
          {!connected && (
            <button className="btn btn-sm" onClick={() => connect()}>
              Retry
            </button>
          )}
        </div>
      </div>

      {(diagnostic || sessions.length > 0) && (
        <div className="opencode-diagnostics">
          {diagnostic && <div className="opencode-diagnostic-error">{diagnostic}</div>}
          {sessions.length > 0 && (
            <div className="session-status-list">
              {sessions.map((session) => (
                <div key={session.id} className={`session-status-card ${session.status}`}>
                  <div className="session-status-title">{session.title}</div>
                  <div className="session-status-meta">
                    {session.status}
                    {session.statusMessage ? ` - ${session.statusMessage}` : ""}
                  </div>
                  {session.status === "busy" && (
                    <button
                      className="btn btn-sm session-abort-btn"
                      onClick={() => handleAbortSession(session.id)}
                    >
                      Abort Session
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {sessionDebug && (
            <div className="session-debug-card">
              <div className="session-debug-title">Current Operation</div>
              <div className="session-debug-line">
                Session: <code>{sessionDebug.sessionId}</code>
                {sessionDebug.lastMessageRole ? ` | Last message: ${sessionDebug.lastMessageRole}` : ""}
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
            <button className="btn btn-sm" onClick={() => refreshPermissions()}>
              Refresh
            </button>
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
            <button className="btn btn-sm" onClick={() => refreshQuestions()}>
              Refresh
            </button>
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
        {messages.length === 0 && (
          <div style={{ color: "var(--text-secondary)", textAlign: "center", padding: 20 }}>
            {connected
              ? "Send a message to start interacting with OpenCode in the sandbox."
              : "Connecting to OpenCode server..."}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`opencode-message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="opencode-message assistant">
            <div className="spinner" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="opencode-panel-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask OpenCode to do something..."
          disabled={!connected || loading}
          rows={1}
        />
        <button
          className="btn btn-primary"
          onClick={handleSend}
          disabled={!connected || loading || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  )
}

import { useState, useRef, useEffect } from "react"
import { useOpenCode } from "../hooks/useOpenCode"

interface Props {
  sandboxId: string
  port: number
}

export function OpenCodePanel({ sandboxId, port }: Props) {
  const [input, setInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { messages, connected, loading, connect, disconnect, sendPrompt } = useOpenCode(port)

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

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

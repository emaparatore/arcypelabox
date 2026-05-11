import { useState, useCallback } from "react"
import type { SandboxMessage } from "../types"

export function useOpenCode(sandboxPort?: number) {
  const [messages, setMessages] = useState<SandboxMessage[]>([])
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(false)

  const connect = useCallback(async () => {
    if (!sandboxPort) return
    try {
      const healthy = await window.sandobox.opencode.checkHealth(sandboxPort)
      setConnected(healthy)
    } catch {
      setConnected(false)
    }
  }, [sandboxPort])

  const disconnect = useCallback(() => {
    setConnected(false)
    setMessages([])
  }, [])

  const sendPrompt = useCallback(
    async (text: string) => {
      if (!sandboxPort) return

      setMessages((prev) => [...prev, { role: "user", content: text, timestamp: Date.now() }])
      setLoading(true)

      try {
        const response = await window.sandobox.opencode.sendPrompt(sandboxPort, text)
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: response, timestamp: Date.now() },
        ])
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Error: ${(err as Error).message}`,
            timestamp: Date.now(),
          },
        ])
      } finally {
        setLoading(false)
      }
    },
    [sandboxPort],
  )

  const runShell = useCallback(
    async (command: string) => {
      if (!sandboxPort) return ""
      try {
        return await window.sandobox.opencode.runShell(sandboxPort, command)
      } catch (err) {
        return `Error: ${(err as Error).message}`
      }
    },
    [sandboxPort],
  )

  return { messages, connected, loading, connect, disconnect, sendPrompt, runShell }
}

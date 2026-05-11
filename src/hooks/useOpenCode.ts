import { useState, useCallback } from "react"
import type {
  OpenCodeQuestionRequest,
  OpenCodeSessionDebugInfo,
  OpenCodeSessionInfo,
  PermissionRequestInfo,
  SandboxMessage,
} from "../types"

export function useOpenCode(sandboxPort?: number) {
  const [messages, setMessages] = useState<SandboxMessage[]>([])
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pendingPermissions, setPendingPermissions] = useState<PermissionRequestInfo[]>([])
  const [pendingQuestions, setPendingQuestions] = useState<OpenCodeQuestionRequest[]>([])
  const [sessions, setSessions] = useState<OpenCodeSessionInfo[]>([])
  const [sessionDebug, setSessionDebug] = useState<OpenCodeSessionDebugInfo | null>(null)
  const [diagnostic, setDiagnostic] = useState<string | null>(null)

  const refreshPermissions = useCallback(async () => {
    if (!sandboxPort) return

    try {
      const result = await window.sandobox.listPendingPermissions(sandboxPort)
      if (Array.isArray(result)) setPendingPermissions(result)
    } catch {
      setPendingPermissions([])
    }
  }, [sandboxPort])

  const refreshQuestions = useCallback(async () => {
    if (!sandboxPort) return

    try {
      const result = await window.sandobox.listPendingQuestions(sandboxPort)
      if (Array.isArray(result)) setPendingQuestions(result)
    } catch {
      setPendingQuestions([])
    }
  }, [sandboxPort])

  const refreshSessions = useCallback(async () => {
    if (!sandboxPort) return

    try {
      const result = await window.sandobox.getOpenCodeSessions(sandboxPort)
      if (Array.isArray(result)) setSessions(result)
    } catch {
      setSessions([])
    }
  }, [sandboxPort])

  const refreshSessionDebug = useCallback(async () => {
    if (!sandboxPort) return

    try {
      const sessionResult = await window.sandobox.getOpenCodeSessions(sandboxPort)
      if (!Array.isArray(sessionResult)) return

      const busySession = sessionResult.find((session) => session.status === "busy")
      if (!busySession) {
        setSessionDebug(null)
        return
      }

      const debugResult = await window.sandobox.getOpenCodeSessionDebug(sandboxPort, busySession.id)
      if ("error" in debugResult) {
        setSessionDebug({
          sessionId: busySession.id,
          error: debugResult.error,
        })
        return
      }
      setSessionDebug(debugResult)
    } catch {
      setSessionDebug({
        sessionId: "unknown",
        error: "Failed to inspect the busy session.",
      })
    }
  }, [sandboxPort])

  const connect = useCallback(async () => {
    if (!sandboxPort) return
    try {
      const healthy = await window.sandobox.opencode.checkHealth(sandboxPort)
      setConnected(healthy)
      if (healthy) {
        setDiagnostic(null)
        await Promise.all([
          refreshPermissions(),
          refreshQuestions(),
          refreshSessions(),
          refreshSessionDebug(),
        ])
      }
    } catch {
      setConnected(false)
    }
  }, [refreshPermissions, refreshSessions, sandboxPort])

  const disconnect = useCallback(() => {
    setConnected(false)
    setMessages([])
    setPendingPermissions([])
    setPendingQuestions([])
    setSessions([])
    setSessionDebug(null)
    setDiagnostic(null)
  }, [])

  const sendPrompt = useCallback(
    async (text: string) => {
      if (!sandboxPort) return

      setMessages((prev) => [...prev, { role: "user", content: text, timestamp: Date.now() }])
      setLoading(true)

      try {
        setDiagnostic(null)
        const response = await window.sandobox.opencode.sendPrompt(sandboxPort, text)
        await Promise.all([
          refreshPermissions(),
          refreshQuestions(),
          refreshSessions(),
          refreshSessionDebug(),
        ])
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: response, timestamp: Date.now() },
        ])
      } catch (err) {
        setDiagnostic((err as Error).message)
        await Promise.all([
          refreshPermissions(),
          refreshQuestions(),
          refreshSessions(),
          refreshSessionDebug(),
        ])
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
    [refreshPermissions, refreshQuestions, refreshSessionDebug, refreshSessions, sandboxPort],
  )

  const replyQuestion = useCallback(
    async (requestId: string, answers: string[][]) => {
      if (!sandboxPort) return

      const result = await window.sandobox.replyQuestion(sandboxPort, requestId, answers)
      if (typeof result !== "boolean") {
        throw new Error(result.error ?? "Failed to reply to question")
      }

      await Promise.all([
        refreshPermissions(),
        refreshQuestions(),
        refreshSessions(),
        refreshSessionDebug(),
      ])
    },
    [refreshPermissions, refreshQuestions, refreshSessionDebug, refreshSessions, sandboxPort],
  )

  const replyPermission = useCallback(
    async (requestId: string, reply: "once" | "always" | "reject") => {
      if (!sandboxPort) return

      const result = await window.sandobox.replyPermission(sandboxPort, requestId, reply)
      if (typeof result !== "boolean") {
        throw new Error(result.error ?? "Failed to reply to permission request")
      }

      await refreshPermissions()
      await Promise.all([refreshQuestions(), refreshSessions(), refreshSessionDebug()])
    },
    [refreshPermissions, refreshQuestions, refreshSessionDebug, refreshSessions, sandboxPort],
  )

  const abortSession = useCallback(
    async (sessionId: string) => {
      if (!sandboxPort) return

      const result = await window.sandobox.abortOpenCodeSession(sandboxPort, sessionId)
      if (typeof result !== "boolean") {
        throw new Error(result.error ?? "Failed to abort OpenCode session")
      }

      setDiagnostic(null)
      await Promise.all([
        refreshPermissions(),
        refreshQuestions(),
        refreshSessions(),
        refreshSessionDebug(),
      ])
    },
    [refreshPermissions, refreshQuestions, refreshSessionDebug, refreshSessions, sandboxPort],
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

  return {
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
    runShell,
    refreshPermissions,
    refreshQuestions,
    refreshSessions,
    refreshSessionDebug,
    replyQuestion,
    replyPermission,
    abortSession,
  }
}

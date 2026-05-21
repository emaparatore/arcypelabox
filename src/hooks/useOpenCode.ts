import { useState, useCallback, useEffect, useRef } from "react"
import type {
  OpenCodeQuestionRequest,
  OpenCodeSessionDebugInfo,
  OpenCodeSessionInfo,
  PermissionRequestInfo,
  SandboxMessage,
  OpenCodeProviderInfo,
  OpenCodeEventState,
} from "../types"

const HEARTBEAT_INTERVAL = 15000

export function useOpenCode(sandboxPort?: number) {
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [providers, setProviders] = useState<OpenCodeProviderInfo[]>([])
  const [sessions, setSessions] = useState<OpenCodeSessionInfo[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [messagesBySession, setMessagesBySession] = useState<Record<string, SandboxMessage[]>>({})
  const [pendingPermissions, setPendingPermissions] = useState<PermissionRequestInfo[]>([])
  const [pendingQuestions, setPendingQuestions] = useState<OpenCodeQuestionRequest[]>([])
  const [sessionDebug, setSessionDebug] = useState<OpenCodeSessionDebugInfo | null>(null)
  const [diagnostic, setDiagnostic] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const selectedSessionIdRef = useRef(selectedSessionId)
  selectedSessionIdRef.current = selectedSessionId

  const messages = selectedSessionId ? messagesBySession[selectedSessionId] ?? [] : []

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 0)
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (!sandboxPort || !selectedSessionId) return
    let cancelled = false
    window.sandobox.getSessionMessages(sandboxPort, selectedSessionId).then((result) => {
      if (cancelled) return
      if (Array.isArray(result)) {
        setMessagesBySession((prev) => ({
          ...prev,
          [selectedSessionId]: result,
        }))
      }
    })
    return () => { cancelled = true }
  }, [sandboxPort, selectedSessionId])

  useEffect(() => {
    if (!sandboxPort) return

    let mounted = true
    const cleanupFns: (() => void)[] = []

    const unsubState = window.sandobox.opencode.onState((port, state: OpenCodeEventState) => {
      if (port !== sandboxPort || !mounted) return

      if (state.sessions) {
        setSessions(state.sessions)
        setSelectedSessionId((prev) => {
          if (prev && state.sessions.find((s) => s.id === prev)) return prev
          if (state.sessions.length > 0) return state.sessions[0].id
          return null
        })
      }
      if (state.permissions) setPendingPermissions(state.permissions)
      if (state.questions) setPendingQuestions(state.questions)
      if (state.providers) setProviders(state.providers)
    })
    cleanupFns.push(unsubState)

    const unsubEvent = window.sandobox.opencode.onEvent((port, event: any) => {
      if (port !== sandboxPort || !mounted) return
      if (event?.type === "session.status" || event?.type === "session.created" || event?.type === "session.deleted") {
        setDiagnostic(null)
      }
    })
    cleanupFns.push(unsubEvent)

    window.sandobox.opencode.subscribeEvents(sandboxPort).then((result) => {
      if (!mounted) return
      if ("error" in result) {
        setConnected(false)
        setDiagnostic(`Failed to subscribe to events: ${result.error}`)
      } else {
        setConnected(true)
        setDiagnostic(null)
      }
    })

    const heartbeat = setInterval(async () => {
      if (!sandboxPort) return
      try {
        const healthy = await window.sandobox.opencode.checkHealth(sandboxPort)
        if (mounted) setConnected(healthy)
      } catch {
        if (mounted) setConnected(false)
      }
    }, HEARTBEAT_INTERVAL)
    cleanupFns.push(() => clearInterval(heartbeat))

    if (sandboxPort) {
      const refreshInterval = setInterval(async () => {
        if (!mounted || !sandboxPort) return
        const sessionsResult = await window.sandobox.getOpenCodeSessions(sandboxPort)
        if (!Array.isArray(sessionsResult) || !mounted) return
        setSessions(sessionsResult)

        const currentSid = selectedSessionIdRef.current
        if (currentSid) {
          const msgsResult = await window.sandobox.getSessionMessages(sandboxPort, currentSid)
          if (Array.isArray(msgsResult) && mounted) {
            setMessagesBySession((prev) => {
              const existing = prev[currentSid]
              if (existing && msgsResult.length === existing.length) {
                const same = msgsResult.every(
                  (m, i) => m.content === existing[i].content && m.role === existing[i].role
                )
                if (same) return prev
              }
              return { ...prev, [currentSid]: msgsResult }
            })
          }
        }
      }, 1500)
      cleanupFns.push(() => clearInterval(refreshInterval))
    }

    return () => {
      mounted = false
      cleanupFns.forEach((fn) => fn())
      window.sandobox.opencode.unsubscribeEvents(sandboxPort)
    }
  }, [sandboxPort])

  const sendPrompt = useCallback(
    async (text: string) => {
      if (!sandboxPort || !selectedSessionId) return

      setMessagesBySession((prev) => {
        const sessionMessages = prev[selectedSessionId] ?? []
        return {
          ...prev,
          [selectedSessionId]: [
            ...sessionMessages,
            { role: "user", content: text, timestamp: Date.now() },
          ],
        }
      })
      setLoading(true)
      setDiagnostic(null)

      try {
        const response = await window.sandobox.opencode.sendPrompt(
          sandboxPort,
          selectedSessionId,
          text,
        )
        setMessagesBySession((prev) => {
          const sessionMessages = prev[selectedSessionId] ?? []
          return {
            ...prev,
            [selectedSessionId]: [
              ...sessionMessages,
              { role: "assistant", content: response, timestamp: Date.now() },
            ],
          }
        })
      } catch (err) {
        setDiagnostic((err as Error).message)
        setMessagesBySession((prev) => {
          const sessionMessages = prev[selectedSessionId] ?? []
          return {
            ...prev,
            [selectedSessionId]: [
              ...sessionMessages,
              {
                role: "assistant",
                content: `Error: ${(err as Error).message}`,
                timestamp: Date.now(),
              },
            ],
          }
        })
      } finally {
        setLoading(false)
      }
    },
    [sandboxPort, selectedSessionId],
  )

  const refreshSessions = useCallback(async () => {
    if (!sandboxPort) return
    const result = await window.sandobox.getOpenCodeSessions(sandboxPort)
    if (Array.isArray(result)) {
      setSessions(result)
      setSelectedSessionId((prev) => {
        if (prev && result.find((s) => s.id === prev)) return prev
        if (result.length > 0) return result[0].id
        return null
      })
    }
  }, [sandboxPort])

  const createSession = useCallback(
    async (params?: { title?: string; model?: { providerID: string; id: string; variant?: string } }) => {
      if (!sandboxPort) return null
      const result = await window.sandobox.createOpenCodeSession(sandboxPort, params)
      if ("error" in result) {
        setDiagnostic(result.error)
        return null
      }
      setSelectedSessionId(result.id)
      await refreshSessions()
      return result
    },
    [sandboxPort, refreshSessions],
  )

  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (!sandboxPort) return
      const result = await window.sandobox.deleteOpenCodeSession(sandboxPort, sessionId)
      if ("error" in result) {
        setDiagnostic(result.error)
      }
      setSelectedSessionId((prev) => (prev === sessionId ? null : prev))
      setMessagesBySession((prev) => {
        const next = { ...prev }
        delete next[sessionId]
        return next
      })
    },
    [sandboxPort],
  )

  const abortSession = useCallback(
    async (sessionId: string) => {
      if (!sandboxPort) return
      const result = await window.sandobox.abortOpenCodeSession(sandboxPort, sessionId)
      if (typeof result === "object" && "error" in result) {
        setDiagnostic(result.error)
      }
    },
    [sandboxPort],
  )

  const replyQuestion = useCallback(
    async (requestId: string, answers: string[][]) => {
      if (!sandboxPort) return
      const result = await window.sandobox.replyQuestion(sandboxPort, requestId, answers)
      if (typeof result !== "boolean") {
        throw new Error(result.error ?? "Failed to reply to question")
      }
    },
    [sandboxPort],
  )

  const replyPermission = useCallback(
    async (requestId: string, reply: "once" | "always" | "reject") => {
      if (!sandboxPort) return
      const result = await window.sandobox.replyPermission(sandboxPort, requestId, reply)
      if (typeof result !== "boolean") {
        throw new Error(result.error ?? "Failed to reply to permission")
      }
    },
    [sandboxPort],
  )

  const refreshSessionDebug = useCallback(
    async (sessionId: string) => {
      if (!sandboxPort) return
      try {
        const result = await window.sandobox.getOpenCodeSessionDebug(sandboxPort, sessionId)
        if ("error" in result) {
          setSessionDebug({
            sessionId,
            error: result.error,
          })
          return
        }
        setSessionDebug(result)
      } catch {
        setSessionDebug({ sessionId, error: "Failed to inspect the session." })
      }
    },
    [sandboxPort],
  )

  const refreshAll = useCallback(async () => {
    if (!sandboxPort) return
    const [sessionsResult, permissionsResult, questionsResult] = await Promise.all([
      window.sandobox.getOpenCodeSessions(sandboxPort),
      window.sandobox.listPendingPermissions(sandboxPort),
      window.sandobox.listPendingQuestions(sandboxPort),
    ])
    if (Array.isArray(sessionsResult)) {
      setSessions(sessionsResult)
      setSelectedSessionId((prev) => {
        if (prev && sessionsResult.find((s) => s.id === prev)) return prev
        if (sessionsResult.length > 0) return sessionsResult[0].id
        return null
      })
    }
    if (Array.isArray(permissionsResult)) setPendingPermissions(permissionsResult)
    if (Array.isArray(questionsResult)) setPendingQuestions(questionsResult)

    const sid = selectedSessionIdRef.current
    if (sid) {
      const msgsResult = await window.sandobox.getSessionMessages(sandboxPort, sid)
      if (Array.isArray(msgsResult)) {
        setMessagesBySession((prev) => ({ ...prev, [sid]: msgsResult }))
      }
    }
  }, [sandboxPort])

  return {
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
    scrollToBottom,
  }
}

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

export function useOpenCode(sandboxId?: string) {
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
    messagesEndRef.current?.scrollIntoView()
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (!sandboxId || !selectedSessionId) return
    let cancelled = false
    window.sandobox.getSessionMessages(sandboxId, selectedSessionId).then((result) => {
      if (cancelled) return
      if (Array.isArray(result)) {
        setMessagesBySession((prev) => ({
          ...prev,
          [selectedSessionId]: result,
        }))
      }
    })
    return () => { cancelled = true }
  }, [sandboxId, selectedSessionId])

  useEffect(() => {
    if (!sandboxId) return

    let mounted = true
    const cleanupFns: (() => void)[] = []

    const unsubState = window.sandobox.opencode.onState((port, state: OpenCodeEventState) => {
      if (port !== sandboxId || !mounted) return

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
      if (port !== sandboxId || !mounted) return
      if (event?.type === "session.status" || event?.type === "session.created" || event?.type === "session.deleted") {
        setDiagnostic(null)
      }
    })
    cleanupFns.push(unsubEvent)

    window.sandobox.opencode.subscribeEvents(sandboxId).then((result) => {
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
      if (!sandboxId) return
      try {
        const healthy = await window.sandobox.opencode.checkHealth(sandboxId)
        if (mounted) setConnected(healthy)
      } catch {
        if (mounted) setConnected(false)
      }
    }, HEARTBEAT_INTERVAL)
    cleanupFns.push(() => clearInterval(heartbeat))

    if (sandboxId) {
      const refreshInterval = setInterval(async () => {
        if (!mounted || !sandboxId) return
        const sessionsResult = await window.sandobox.getOpenCodeSessions(sandboxId)
        if (!Array.isArray(sessionsResult) || !mounted) return
        setSessions(sessionsResult)

        const currentSid = selectedSessionIdRef.current
        if (currentSid) {
          const msgsResult = await window.sandobox.getSessionMessages(sandboxId, currentSid)
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
      window.sandobox.opencode.unsubscribeEvents(sandboxId)
    }
  }, [sandboxId])

  const sendPrompt = useCallback(
    async (text: string) => {
      if (!sandboxId || !selectedSessionId) return

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
          sandboxId,
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
    [sandboxId, selectedSessionId],
  )

  const refreshSessions = useCallback(async () => {
    if (!sandboxId) return
    const result = await window.sandobox.getOpenCodeSessions(sandboxId)
    if (Array.isArray(result)) {
      setSessions(result)
      setSelectedSessionId((prev) => {
        if (prev && result.find((s) => s.id === prev)) return prev
        if (result.length > 0) return result[0].id
        return null
      })
    }
  }, [sandboxId])

  const createSession = useCallback(
    async (params?: { title?: string; model?: { providerID: string; id: string; variant?: string } }) => {
      if (!sandboxId) return null
      const result = await window.sandobox.createOpenCodeSession(sandboxId, params)
      if ("error" in result) {
        setDiagnostic(result.error)
        return null
      }
      setSelectedSessionId(result.id)
      await refreshSessions()
      return result
    },
    [sandboxId, refreshSessions],
  )

  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (!sandboxId) return
      const result = await window.sandobox.deleteOpenCodeSession(sandboxId, sessionId)
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
    [sandboxId],
  )

  const abortSession = useCallback(
    async (sessionId: string) => {
      if (!sandboxId) return
      const result = await window.sandobox.abortOpenCodeSession(sandboxId, sessionId)
      if (typeof result === "object" && "error" in result) {
        setDiagnostic(result.error)
      }
    },
    [sandboxId],
  )

  const replyQuestion = useCallback(
    async (requestId: string, answers: string[][]) => {
      if (!sandboxId) return
      const result = await window.sandobox.replyQuestion(sandboxId, requestId, answers)
      if (typeof result !== "boolean") {
        throw new Error(result.error ?? "Failed to reply to question")
      }
    },
    [sandboxId],
  )

  const replyPermission = useCallback(
    async (requestId: string, reply: "once" | "always" | "reject") => {
      if (!sandboxId) return
      const result = await window.sandobox.replyPermission(sandboxId, requestId, reply)
      if (typeof result !== "boolean") {
        throw new Error(result.error ?? "Failed to reply to permission")
      }
    },
    [sandboxId],
  )

  const refreshSessionDebug = useCallback(
    async (sessionId: string) => {
      if (!sandboxId) return
      try {
        const result = await window.sandobox.getOpenCodeSessionDebug(sandboxId, sessionId)
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
    [sandboxId],
  )

  const refreshAll = useCallback(async () => {
    if (!sandboxId) return
    const [sessionsResult, permissionsResult, questionsResult] = await Promise.all([
      window.sandobox.getOpenCodeSessions(sandboxId),
      window.sandobox.listPendingPermissions(sandboxId),
      window.sandobox.listPendingQuestions(sandboxId),
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
      const msgsResult = await window.sandobox.getSessionMessages(sandboxId, sid)
      if (Array.isArray(msgsResult)) {
        setMessagesBySession((prev) => ({ ...prev, [sid]: msgsResult }))
      }
    }
  }, [sandboxId])

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

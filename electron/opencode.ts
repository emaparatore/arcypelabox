async function getOpencodeClient() {
  const { createOpencodeClient } = await import("@opencode-ai/sdk")
  return createOpencodeClient
}

type PermissionRequestInfo = {
  id: string
  sessionId: string
  permission: string
  patterns: string[]
}

type OpenCodeSessionInfo = {
  id: string
  title: string
  status: "idle" | "busy" | "retry" | "unknown"
  statusMessage?: string
}

type OpenCodeSessionDebugInfo = {
  sessionId: string
  lastMessageRole?: string
  lastMessageId?: string
  toolName?: string
  toolStatus?: string
  toolInput?: string
  assistantText?: string
  error?: string
}

type OpenCodeQuestionRequest = {
  id: string
  sessionId?: string
  questions: Array<{
    question: string
    header: string
    options: Array<{
      label: string
      description: string
    }>
    multiple: boolean
  }>
}

export async function checkHealth(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/global/health`)
    return res.ok
  } catch {
    return false
  }
}

export async function sendPrompt(port: number, text: string): Promise<string> {
  const createOpencodeClient = await getOpencodeClient()
  const client = createOpencodeClient({
    baseUrl: `http://localhost:${port}`,
  })

  const sessionId = await getAvailableSessionId(client)

  const result = (await withTimeout(
    (client.session as any).prompt({
      path: { id: sessionId },
      body: { parts: [{ type: "text", text }] },
    }),
    30000,
    async () => {
      const sessions = await getSessionStates(client)
      const current = sessions.find((session) => session.id === sessionId)
      const details = current
        ? `Session status: ${current.status}${current.statusMessage ? ` (${current.statusMessage})` : ""}.`
        : "Session status unavailable."
      throw new Error(
        `OpenCode did not respond within 30s. ${details} It may be waiting on a tool, permission, or a stuck session.`
      )
    }
  )) as any

  const response = result.data
  const textParts =
    response?.parts
      ?.filter((p: { type: string }) => p.type === "text")
      .map((p: { text?: string }) => p.text ?? "")
      .join("\n") ?? JSON.stringify(response?.info ?? result.data)

  return textParts
}

export async function listPendingPermissions(port: number): Promise<PermissionRequestInfo[]> {
  const response = await fetch(`http://localhost:${port}/permission`)
  const data = (await response.json()) as any[]

  return (data ?? []).map((request: any) => ({
    id: request.id,
    sessionId: request.sessionID,
    permission: request.permission,
    patterns: Array.isArray(request.patterns) ? request.patterns : [],
  }))
}

export async function getOpenCodeSessions(port: number): Promise<OpenCodeSessionInfo[]> {
  const createOpencodeClient = await getOpencodeClient()
  const client = createOpencodeClient({
    baseUrl: `http://localhost:${port}`,
  })

  return getSessionStates(client)
}

export async function abortOpenCodeSession(port: number, sessionId: string): Promise<boolean> {
  const createOpencodeClient = await getOpencodeClient()
  const client = createOpencodeClient({
    baseUrl: `http://localhost:${port}`,
  })

  const result = await (client.session as any).abort({
    path: { id: sessionId },
  })

  return Boolean(result?.data ?? true)
}

export async function getOpenCodeSessionDebug(
  port: number,
  sessionId: string
): Promise<OpenCodeSessionDebugInfo> {
  const createOpencodeClient = await getOpencodeClient()
  const client = createOpencodeClient({
    baseUrl: `http://localhost:${port}`,
  })

  const result = await (client.session as any).messages({
    path: { id: sessionId },
  })

  const messages = Array.isArray(result?.data) ? result.data : []
  const latest = messages.at(-1)
  const parts = Array.isArray(latest?.parts) ? latest.parts : []
  const latestTool = [...parts].reverse().find((part: any) => part?.type === "tool")
  const latestText = parts
    .filter((part: any) => part?.type === "text")
    .map((part: any) => part.text)
    .filter(Boolean)
    .join("\n")
  const latestError = latest?.info?.error?.message || latestTool?.state?.error

  return {
    sessionId,
    lastMessageRole: latest?.info?.role,
    lastMessageId: latest?.info?.id,
    toolName: latestTool?.tool,
    toolStatus: latestTool?.state?.status,
    toolInput: latestTool?.state?.raw ?? stringifyToolInput(latestTool?.state?.input),
    assistantText: latestText || undefined,
    error:
      latestError ||
      (!latest
        ? "No messages returned for this session."
        : parts.length === 0
          ? "The latest message has no parts yet. OpenCode may be stuck before producing output."
          : undefined),
  }
}

export async function listPendingQuestions(port: number): Promise<OpenCodeQuestionRequest[]> {
  const response = await fetch(`http://localhost:${port}/question`)
  const data = (await response.json()) as any[]

  return (data ?? []).map((request: any) => ({
    id: request.id,
    sessionId: request.tool?.sessionID,
    questions: Array.isArray(request.questions)
      ? request.questions.map((question: any) => ({
          question: question.question,
          header: question.header,
          multiple: Boolean(question.multiple),
          options: Array.isArray(question.options)
            ? question.options.map((option: any) => ({
                label: option.label,
                description: option.description ?? "",
              }))
            : [],
        }))
      : [],
  }))
}

export async function replyQuestion(
  port: number,
  requestId: string,
  answers: string[][]
): Promise<boolean> {
  const response = await fetch(`http://localhost:${port}/question/${requestId}/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ answers }),
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return true
}

export async function replyPermission(
  port: number,
  requestId: string,
  reply: "once" | "always" | "reject"
): Promise<boolean> {
  const response = await fetch(`http://localhost:${port}/permission/${requestId}/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reply }),
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return true
}

export async function runShell(port: number, command: string): Promise<string> {
  const createOpencodeClient = await getOpencodeClient()
  const client = createOpencodeClient({
    baseUrl: `http://localhost:${port}`,
  })

  const sessionId = await getAvailableSessionId(client)

  const result = await (client.session as any).shell({
    path: { id: sessionId },
    body: { agent: "default", command },
  })

  return JSON.stringify(result.data)
}

async function getAvailableSessionId(client: any): Promise<string> {
  const sessions = await client.session.list()
  const sessionList = Array.isArray(sessions.data) ? sessions.data : []

  if (sessionList.length === 0) {
    const created = await client.session.create({
      body: { title: "Sandbox Chat" },
    })
    if (created.error) throw new Error(`Failed to create session: ${JSON.stringify(created.error)}`)
    return created.data?.id ?? (created as any).id
  }

  const statuses = await getSessionStates(client)
  const idleSession = sessionList.find(
    (session: any) => statuses.find((entry) => entry.id === session.id)?.status !== "busy"
  )

  if (idleSession) return idleSession.id

  const created = await client.session.create({
    body: { title: "Sandbox Chat" },
  })
  if (created.error) throw new Error(`Failed to create session: ${JSON.stringify(created.error)}`)
  return created.data?.id ?? (created as any).id
}

async function getSessionStates(client: any): Promise<OpenCodeSessionInfo[]> {
  const sessions = await client.session.list()
  const sessionList = Array.isArray(sessions.data) ? sessions.data : []
  const statusResult = await client.session.status()
  const statuses = statusResult.data ?? {}

  return sessionList.map((session: any) => {
    const status = statuses[session.id]
    if (!status) {
      return {
        id: session.id,
        title: session.title ?? "Untitled session",
        status: "unknown",
      }
    }

    if (status.type === "retry") {
      return {
        id: session.id,
        title: session.title ?? "Untitled session",
        status: "retry",
        statusMessage: status.message,
      }
    }

    return {
      id: session.id,
      title: session.title ?? "Untitled session",
      status: status.type,
    }
  })
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => Promise<never>
): Promise<T> {
  let timer: NodeJS.Timeout | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          onTimeout().then(reject).catch(reject)
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function stringifyToolInput(input: unknown) {
  if (!input) return undefined

  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}

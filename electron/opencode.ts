import { getProxy } from "./proxy.js"

const QUICK_TIMEOUT = 300_000 // 5 min
const LONG_TIMEOUT = 1_800_000 // 30 min

function createFetchWithTimeout(timeoutMs: number) {
  return async function fetchWithTimeout(input: URL | RequestInfo, init?: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(input, { ...init, signal: controller.signal })
      return response
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

let _createClient: ((opts: { baseUrl: string; fetch: typeof fetch }) => any) | null = null

async function getClient(sandboxId: string, timeoutMs: number = LONG_TIMEOUT) {
  if (!_createClient) {
    const mod = await import("@opencode-ai/sdk/v2")
    _createClient = mod.createOpencodeClient
  }
  return _createClient({
    baseUrl: getProxy().getUrl(sandboxId),
    fetch: createFetchWithTimeout(timeoutMs),
  })
}

export async function checkHealth(sandboxId: string): Promise<boolean> {
  try {
    const client = await getClient(sandboxId, QUICK_TIMEOUT)
    await client.global.health()
    return true
  } catch {
    return false
  }
}

export async function sendPrompt(sandboxId: string, text: string, sessionId: string): Promise<string> {
  const client = await getClient(sandboxId)
  const result = await client.session.prompt({
    sessionID: sessionId,
    parts: [{ type: "text", text }],
  })
  const response = result.data as any
  const textParts =
    response?.parts
      ?.filter((p: any) => p.type === "text")
      .map((p: any) => p.text ?? "")
      .join("\n") ?? JSON.stringify(response?.info ?? result.data)
  return textParts
}

export async function sessionPromptAsync(sandboxId: string, text: string, sessionId: string): Promise<boolean> {
  const client = await getClient(sandboxId)
  await client.session.promptAsync({
    sessionID: sessionId,
    parts: [{ type: "text", text }],
  })
  return true
}

export async function listProviders(sandboxId: string) {
  const client = await getClient(sandboxId, QUICK_TIMEOUT)
  const result: any = await client.provider.list()
  const data = result.data ?? {}
  const all: any[] = data.all ?? []
  const connected: string[] = data.connected ?? []
  return all
    .filter((p: any) => connected.includes(p.id))
    .map((p: any) => ({
      id: p.id,
      name: p.name,
      models: Object.entries(p.models ?? {}).map(([modelId, model]: [string, any]) => ({
        id: modelId,
        name: model.name ?? modelId,
        providerId: p.id,
        variants: model.variants ? Object.keys(model.variants) : [],
      })),
    }))
}

export async function listSessions(sandboxId: string) {
  const client = await getClient(sandboxId, QUICK_TIMEOUT)
  const [listResult, statusResult] = await Promise.all([
    client.session.list(),
    client.session.status(),
  ])
  const sessions = listResult.data ?? []
  const statuses = (statusResult.data ?? {}) as Record<string, any>
  return sessions.map((s: any) => ({
    id: s.id,
    title: s.title ?? "Untitled session",
    model: s.model ?? null,
    status: statuses[s.id]?.type ?? "idle",
    statusMessage: statuses[s.id]?.message,
  }))
}

export async function createSession(sandboxId: string, params: { title?: string; model?: { providerID: string; id: string; variant?: string } }) {
  const client = await getClient(sandboxId, QUICK_TIMEOUT)
  const result = await client.session.create({
    title: params.title ?? "Sandbox Chat",
    model: params.model,
  })
  return {
    id: result.data?.id ?? (result as any).id,
    title: params.title ?? "Sandbox Chat",
    model: params.model ?? null,
    status: "idle",
  }
}

export async function deleteSession(sandboxId: string, sessionId: string) {
  const client = await getClient(sandboxId, QUICK_TIMEOUT)
  await client.session.delete({ sessionID: sessionId })
}

export async function abortOpenCodeSession(sandboxId: string, sessionId: string) {
  const client = await getClient(sandboxId, QUICK_TIMEOUT)
  await client.session.abort({ sessionID: sessionId })
}

export async function listPendingPermissions(sandboxId: string) {
  const client = await getClient(sandboxId, QUICK_TIMEOUT)
  const result = await client.permission.list()
  return (result.data ?? []).map((req: any) => ({
    id: req.id,
    sessionId: req.sessionID,
    permission: req.permission,
    patterns: req.patterns ?? [],
  }))
}

export async function replyPermission(sandboxId: string, requestId: string, reply: "once" | "always" | "reject") {
  const client = await getClient(sandboxId, QUICK_TIMEOUT)
  await client.permission.reply({ requestID: requestId, reply })
  return true
}

export async function listPendingQuestions(sandboxId: string) {
  const client = await getClient(sandboxId, QUICK_TIMEOUT)
  const result = await client.question.list()
  return (result.data ?? []).map((req: any) => ({
    id: req.id,
    sessionId: req.sessionID,
    questions: (req.questions ?? []).map((q: any) => ({
      question: q.question,
      header: q.header,
      options: (q.options ?? []).map((o: any) => ({
        label: o.label,
        description: o.description ?? "",
      })),
      multiple: Boolean(q.multiple),
    })),
  }))
}

export async function replyQuestion(sandboxId: string, requestId: string, answers: string[][]) {
  const client = await getClient(sandboxId, QUICK_TIMEOUT)
  await client.question.reply({ requestID: requestId, answers })
  return true
}

export async function getSessionMessages(sandboxId: string, sessionId: string) {
  const client = await getClient(sandboxId, QUICK_TIMEOUT)
  const result: any = await client.session.messages({ sessionID: sessionId })
  const msgs = Array.isArray(result.data) ? result.data : []
  return msgs.map((msg: any) => ({
    role: msg.info?.role === "user" ? "user" : "assistant",
    content: (msg.parts ?? [])
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text ?? "")
      .join("\n"),
    timestamp: msg.info?.time?.created ?? Date.now(),
    parts: (msg.parts ?? []).map((p: any) => ({
      type: p.type,
      text: p.text,
      tool: p.tool,
      status: p.state?.status,
      input: p.state?.raw ?? stringifyToolInput(p.state?.input),
      output: p.state?.output,
    })),
  }))
}

export async function getOpenCodeSessionDebug(sandboxId: string, sessionId: string) {
  const client = await getClient(sandboxId, QUICK_TIMEOUT)
  const result: any = await client.session.messages({ sessionID: sessionId })
  const msgs = Array.isArray(result.data) ? result.data : []
  const latest = msgs[msgs.length - 1]
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

export async function getAvailableSessionId(sandboxId: string): Promise<string> {
  const sessions = await listSessions(sandboxId)
  const idleSession = sessions.find((s: any) => s.status !== "busy")
  if (idleSession) return idleSession.id
  const created = await createSession(sandboxId, { title: "Sandbox Chat" })
  return created.id
}

function stringifyToolInput(input: unknown) {
  if (!input) return undefined
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}

export async function subscribeToEvents(
  sandboxId: string,
  onEvent: (event: any) => void,
  onError?: (error: any) => void,
  onReconnect?: () => void,
): Promise<AbortController> {
  const abortController = new AbortController()
  const maxDelay = 30000
  let retryDelay = 1000

  const connect = async () => {
    while (!abortController.signal.aborted) {
      try {
        const response = await fetch(`${getProxy().getUrl(sandboxId)}/event`, {
          signal: abortController.signal,
        })
        if (!response.ok || !response.body) {
          throw new Error(`SSE connection failed: ${response.status}`)
        }
        retryDelay = 1000
        onReconnect?.()

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6))
                onEvent(data)
              } catch {
                // ignore parse errors
              }
            }
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") return
        onError?.(err)
      }
      await new Promise((r) => setTimeout(r, retryDelay))
      retryDelay = Math.min(retryDelay * 2, maxDelay)
    }
  }
  connect()
  return abortController
}

export async function runShell(sandboxId: string, command: string): Promise<string> {
  const client = await getClient(sandboxId)
  const sessionId = await getAvailableSessionId(sandboxId)
  const result = await client.session.shell({ sessionID: sessionId, command })
  return JSON.stringify(result.data)
}

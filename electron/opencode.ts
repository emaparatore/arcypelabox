function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("Port must be an integer between 1024 and 65535")
  }
}

async function getClient(port: number) {
  validatePort(port)
  const { createOpencodeClient } = await import("@opencode-ai/sdk/v2")
  return createOpencodeClient({
    baseUrl: `http://localhost:${port}`,
  })
}

export async function checkHealth(port: number): Promise<boolean> {
  try {
    const client = await getClient(port)
    await client.global.health()
    return true
  } catch {
    return false
  }
}

export async function sendPrompt(port: number, text: string, sessionId: string): Promise<string> {
  const client = await getClient(port)
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

export async function sessionPromptAsync(port: number, text: string, sessionId: string): Promise<boolean> {
  const client = await getClient(port)
  await client.session.promptAsync({
    sessionID: sessionId,
    parts: [{ type: "text", text }],
  })
  return true
}

export async function listProviders(port: number) {
  const client = await getClient(port)
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

export async function listSessions(port: number) {
  const client = await getClient(port)
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
    status: statuses[s.id]?.type ?? "unknown",
    statusMessage: statuses[s.id]?.message,
  }))
}

export async function createSession(port: number, params: { title?: string; model?: { providerID: string; id: string; variant?: string } }) {
  const client = await getClient(port)
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

export async function deleteSession(port: number, sessionId: string) {
  const client = await getClient(port)
  await client.session.delete({ sessionID: sessionId })
}

export async function abortOpenCodeSession(port: number, sessionId: string) {
  const client = await getClient(port)
  await client.session.abort({ sessionID: sessionId })
}

export async function listPendingPermissions(port: number) {
  const client = await getClient(port)
  const result = await client.permission.list()
  return (result.data ?? []).map((req: any) => ({
    id: req.id,
    sessionId: req.sessionID,
    permission: req.permission,
    patterns: req.patterns ?? [],
  }))
}

export async function replyPermission(port: number, requestId: string, reply: "once" | "always" | "reject") {
  const client = await getClient(port)
  await client.permission.reply({ requestID: requestId, reply })
  return true
}

export async function listPendingQuestions(port: number) {
  const client = await getClient(port)
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

export async function replyQuestion(port: number, requestId: string, answers: string[][]) {
  const client = await getClient(port)
  await client.question.reply({ requestID: requestId, answers })
  return true
}

export async function getSessionMessages(port: number, sessionId: string) {
  const client = await getClient(port)
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

export async function getOpenCodeSessionDebug(port: number, sessionId: string) {
  const client = await getClient(port)
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

export async function getAvailableSessionId(port: number): Promise<string> {
  const sessions = await listSessions(port)
  const idleSession = sessions.find((s: any) => s.status !== "busy")
  if (idleSession) return idleSession.id
  const created = await createSession(port, { title: "Sandbox Chat" })
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

const maxRetryAttempts = 10
let retryDelay = 1000

export async function subscribeToEvents(
  port: number,
  onEvent: (event: any) => void,
  onError?: (error: any) => void
): Promise<AbortController> {
  validatePort(port)
  const abortController = new AbortController()
  const maxDelay = 30000

  const connect = async (attempt = 0) => {
    try {
      const response = await fetch(`http://localhost:${port}/event`, {
        signal: abortController.signal,
      })
      if (!response.ok || !response.body) {
        throw new Error(`SSE connection failed: ${response.status}`)
      }
      retryDelay = 1000
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
      if (attempt < maxRetryAttempts) {
        await new Promise((r) => setTimeout(r, retryDelay))
        retryDelay = Math.min(retryDelay * 2, maxDelay)
        connect(attempt + 1)
      } else {
        onError?.(err)
      }
    }
  }
  connect()
  return abortController
}

export async function runShell(port: number, command: string): Promise<string> {
  const client = await getClient(port)
  const sessionId = await getAvailableSessionId(port)
  const result = await client.session.shell({ sessionID: sessionId, command })
  return JSON.stringify(result.data)
}

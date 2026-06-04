import { beforeEach, describe, expect, it, vi } from "vitest"

const opencodeMocks = vi.hoisted(() => {
  const sdkClient = {
    global: { health: vi.fn() },
    provider: { list: vi.fn() },
    permission: { list: vi.fn(), reply: vi.fn() },
    question: { list: vi.fn(), reply: vi.fn() },
    session: {
      prompt: vi.fn(),
      promptAsync: vi.fn(),
      list: vi.fn(),
      status: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      abort: vi.fn(),
      messages: vi.fn(),
      shell: vi.fn(),
    },
  }

  return {
    createOpencodeClient: vi.fn(() => sdkClient),
    sdkClient,
    getUrl: vi.fn((sandboxId: string) => `http://proxy/${sandboxId}`),
  }
})

vi.mock("../../../electron/proxy.js", () => ({
  getProxy: vi.fn(() => ({
    getUrl: opencodeMocks.getUrl,
  })),
}))

vi.mock("@opencode-ai/sdk/v2", () => ({
  createOpencodeClient: opencodeMocks.createOpencodeClient,
}))

import {
  checkHealth,
  createSession,
  getAvailableSessionId,
  getOpenCodeSessionDebug,
  getSessionMessages,
  listPendingPermissions,
  listPendingQuestions,
  listProviders,
  listSessions,
  replyPermission,
  replyQuestion,
  sendPrompt,
  sessionPromptAsync,
  subscribeToEvents,
} from "../../../electron/opencode.js"

function makeReader(chunks: string[]) {
  let index = 0
  return {
    read: vi.fn(async () => {
      if (index >= chunks.length) return { done: true, value: undefined }
      const value = new TextEncoder().encode(chunks[index])
      index += 1
      return { done: false, value }
    }),
  }
}

describe("electron/opencode", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()

    opencodeMocks.sdkClient.global.health.mockResolvedValue(undefined)
    opencodeMocks.sdkClient.session.prompt.mockResolvedValue({ data: { parts: [] } })
    opencodeMocks.sdkClient.session.promptAsync.mockResolvedValue({})
    opencodeMocks.sdkClient.provider.list.mockResolvedValue({ data: { all: [], connected: [] } })
    opencodeMocks.sdkClient.session.list.mockResolvedValue({ data: [] })
    opencodeMocks.sdkClient.session.status.mockResolvedValue({ data: {} })
    opencodeMocks.sdkClient.session.create.mockResolvedValue({ data: { id: "session-created" } })
    opencodeMocks.sdkClient.permission.list.mockResolvedValue({ data: [] })
    opencodeMocks.sdkClient.permission.reply.mockResolvedValue({})
    opencodeMocks.sdkClient.question.list.mockResolvedValue({ data: [] })
    opencodeMocks.sdkClient.question.reply.mockResolvedValue({})
    opencodeMocks.sdkClient.session.messages.mockResolvedValue({ data: [] })
    opencodeMocks.sdkClient.session.shell.mockResolvedValue({ data: { ok: true } })
  })

  it("returns true when health check resolves", async () => {
    await expect(checkHealth("sandbox-1")).resolves.toBe(true)
    expect(opencodeMocks.createOpencodeClient).toHaveBeenCalledWith({ baseUrl: "http://proxy/sandbox-1" })
  })

  it("returns false when health check throws", async () => {
    opencodeMocks.sdkClient.global.health.mockRejectedValue(new Error("offline"))
    await expect(checkHealth("sandbox-1")).resolves.toBe(false)
  })

  it("concatenates text parts in prompt responses", async () => {
    opencodeMocks.sdkClient.session.prompt.mockResolvedValue({
      data: { parts: [{ type: "text", text: "first" }, { type: "tool", tool: "bash" }, { type: "text", text: "second" }] },
    })

    await expect(sendPrompt("sandbox-1", "hello", "session-1")).resolves.toBe("first\nsecond")
  })

  it("falls back to response info when no text parts exist", async () => {
    opencodeMocks.sdkClient.session.prompt.mockResolvedValue({
      data: { info: { summary: "fallback" } },
    })

    await expect(sendPrompt("sandbox-1", "hello", "session-1")).resolves.toBe(JSON.stringify({ summary: "fallback" }))
  })

  it("returns true for async prompts", async () => {
    await expect(sessionPromptAsync("sandbox-1", "hello", "session-1")).resolves.toBe(true)
    expect(opencodeMocks.sdkClient.session.promptAsync).toHaveBeenCalledWith({
      sessionID: "session-1",
      parts: [{ type: "text", text: "hello" }],
    })
  })

  it("filters connected providers and maps models", async () => {
    opencodeMocks.sdkClient.provider.list.mockResolvedValue({
      data: {
        connected: ["openai"],
        all: [
          {
            id: "openai",
            name: "OpenAI",
            models: {
              "gpt-4.1": { name: "GPT-4.1", variants: { fast: {}, deep: {} } },
            },
          },
          {
            id: "anthropic",
            name: "Anthropic",
            models: { claude: { name: "Claude" } },
          },
        ],
      },
    })

    await expect(listProviders("sandbox-1")).resolves.toEqual([
      {
        id: "openai",
        name: "OpenAI",
        models: [
          {
            id: "gpt-4.1",
            name: "GPT-4.1",
            providerId: "openai",
            variants: ["fast", "deep"],
          },
        ],
      },
    ])
  })

  it("merges session list with status information", async () => {
    opencodeMocks.sdkClient.session.list.mockResolvedValue({
      data: [
        { id: "session-1", title: "First", model: { providerID: "openai", id: "gpt-4.1" } },
        { id: "session-2" },
      ],
    })
    opencodeMocks.sdkClient.session.status.mockResolvedValue({
      data: {
        "session-1": { type: "busy", message: "Thinking" },
      },
    })

    await expect(listSessions("sandbox-1")).resolves.toEqual([
      {
        id: "session-1",
        title: "First",
        model: { providerID: "openai", id: "gpt-4.1" },
        status: "busy",
        statusMessage: "Thinking",
      },
      {
        id: "session-2",
        title: "Untitled session",
        model: null,
        status: "idle",
        statusMessage: undefined,
      },
    ])
  })

  it("uses default title and id fallback when creating sessions", async () => {
    opencodeMocks.sdkClient.session.create.mockResolvedValue({ id: "fallback-id" })

    await expect(createSession("sandbox-1", {})).resolves.toEqual({
      id: "fallback-id",
      title: "Sandbox Chat",
      model: null,
      status: "idle",
    })
    expect(opencodeMocks.sdkClient.session.create).toHaveBeenCalledWith({
      title: "Sandbox Chat",
      model: undefined,
    })
  })

  it("reuses an idle session before creating a new one", async () => {
    opencodeMocks.sdkClient.session.list.mockResolvedValue({ data: [{ id: "session-1", title: "Chat" }] })
    opencodeMocks.sdkClient.session.status.mockResolvedValue({ data: { "session-1": { type: "idle" } } })

    await expect(getAvailableSessionId("sandbox-1")).resolves.toBe("session-1")
    expect(opencodeMocks.sdkClient.session.create).not.toHaveBeenCalled()
  })

  it("creates a new session when all sessions are busy", async () => {
    opencodeMocks.sdkClient.session.list.mockResolvedValue({ data: [{ id: "session-1", title: "Busy" }] })
    opencodeMocks.sdkClient.session.status.mockResolvedValue({ data: { "session-1": { type: "busy" } } })
    opencodeMocks.sdkClient.session.create.mockResolvedValue({ data: { id: "session-2" } })

    await expect(getAvailableSessionId("sandbox-1")).resolves.toBe("session-2")
  })

  it("maps pending permissions and defaults patterns", async () => {
    opencodeMocks.sdkClient.permission.list.mockResolvedValue({
      data: [{ id: "perm-1", sessionID: "session-1", permission: "bash" }],
    })

    await expect(listPendingPermissions("sandbox-1")).resolves.toEqual([
      { id: "perm-1", sessionId: "session-1", permission: "bash", patterns: [] },
    ])
  })

  it("replies to permissions and questions", async () => {
    await expect(replyPermission("sandbox-1", "perm-1", "always")).resolves.toBe(true)
    await expect(replyQuestion("sandbox-1", "question-1", [["Yes"]])).resolves.toBe(true)

    expect(opencodeMocks.sdkClient.permission.reply).toHaveBeenCalledWith({ requestID: "perm-1", reply: "always" })
    expect(opencodeMocks.sdkClient.question.reply).toHaveBeenCalledWith({ requestID: "question-1", answers: [["Yes"]] })
  })

  it("maps pending questions for the renderer", async () => {
    opencodeMocks.sdkClient.question.list.mockResolvedValue({
      data: [{
        id: "question-1",
        sessionID: "session-1",
        questions: [{
          header: "Deploy?",
          question: "Proceed?",
          multiple: 1,
          options: [{ label: "Yes", description: "Continue" }, { label: "No" }],
        }],
      }],
    })

    await expect(listPendingQuestions("sandbox-1")).resolves.toEqual([
      {
        id: "question-1",
        sessionId: "session-1",
        questions: [{
          header: "Deploy?",
          question: "Proceed?",
          multiple: true,
          options: [
            { label: "Yes", description: "Continue" },
            { label: "No", description: "" },
          ],
        }],
      },
    ])
  })

  it("maps session messages including tool parts", async () => {
    opencodeMocks.sdkClient.session.messages.mockResolvedValue({
      data: [{
        info: { role: "assistant", time: { created: 123 } },
        parts: [
          { type: "text", text: "done" },
          { type: "tool", tool: "bash", state: { status: "completed", input: { cmd: "npm test" }, output: "ok" } },
        ],
      }],
    })

    await expect(getSessionMessages("sandbox-1", "session-1")).resolves.toEqual([
      {
        role: "assistant",
        content: "done",
        timestamp: 123,
        parts: [
          { type: "text", text: "done", tool: undefined, status: undefined, input: undefined, output: undefined },
          { type: "tool", text: undefined, tool: "bash", status: "completed", input: JSON.stringify({ cmd: "npm test" }, null, 2), output: "ok" },
        ],
      },
    ])
  })

  it("returns debug data for the latest tool call", async () => {
    opencodeMocks.sdkClient.session.messages.mockResolvedValue({
      data: [{
        info: { role: "assistant", id: "msg-1" },
        parts: [
          { type: "text", text: "running" },
          { type: "tool", tool: "bash", state: { status: "running", raw: "npm run build" } },
        ],
      }],
    })

    await expect(getOpenCodeSessionDebug("sandbox-1", "session-1")).resolves.toEqual({
      sessionId: "session-1",
      lastMessageRole: "assistant",
      lastMessageId: "msg-1",
      toolName: "bash",
      toolStatus: "running",
      toolInput: "npm run build",
      assistantText: "running",
      error: undefined,
    })
  })

  it("returns descriptive debug errors for empty responses and partless messages", async () => {
    opencodeMocks.sdkClient.session.messages.mockResolvedValueOnce({ data: [] })
    await expect(getOpenCodeSessionDebug("sandbox-1", "session-1")).resolves.toMatchObject({
      error: "No messages returned for this session.",
    })

    opencodeMocks.sdkClient.session.messages.mockResolvedValueOnce({ data: [{ info: { role: "assistant" }, parts: [] }] })
    await expect(getOpenCodeSessionDebug("sandbox-1", "session-1")).resolves.toMatchObject({
      error: "The latest message has no parts yet. OpenCode may be stuck before producing output.",
    })
  })

  it("parses SSE data lines and ignores invalid JSON", async () => {
    const onEvent = vi.fn()
    const onReconnect = vi.fn()

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => makeReader(["data: {\"type\":\"session.updated\"}\n", "data: not-json\n"]),
      },
    }))

    const controller = await subscribeToEvents("sandbox-1", onEvent, undefined, onReconnect)
    await vi.waitFor(() => {
      expect(onReconnect).toHaveBeenCalledTimes(1)
      expect(onEvent).toHaveBeenCalledWith({ type: "session.updated" })
    })
    controller.abort()
  })

  it("calls onError and retries after fetch failures", async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    const onReconnect = vi.fn()
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => makeReader([]),
        },
      })

    vi.stubGlobal("fetch", fetchMock)

    const controller = await subscribeToEvents("sandbox-1", vi.fn(), onError, onReconnect)
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "network down" }))
    })

    await vi.advanceTimersByTimeAsync(1000)
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(onReconnect).toHaveBeenCalledTimes(1)
    })

    controller.abort()
  })

  it("stops reconnecting after abort", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(() => new Promise(() => undefined))
    vi.stubGlobal("fetch", fetchMock)

    const controller = await subscribeToEvents("sandbox-1", vi.fn(), vi.fn(), vi.fn())
    controller.abort()
    await vi.advanceTimersByTimeAsync(5000)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

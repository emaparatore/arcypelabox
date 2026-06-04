import { beforeEach, describe, expect, it, vi } from "vitest"

const electronMocks = vi.hoisted(() => {
  const ipcRenderer = {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  }

  return {
    ipcRenderer,
    contextBridge: {
      exposeInMainWorld: vi.fn(),
    },
  }
})

vi.mock("electron", () => electronMocks)

async function loadApi() {
  vi.resetModules()
  electronMocks.contextBridge.exposeInMainWorld.mockClear()
  electronMocks.ipcRenderer.invoke.mockReset()
  electronMocks.ipcRenderer.on.mockReset()
  electronMocks.ipcRenderer.removeListener.mockReset()

  await import("../../../electron/preload.js")
  expect(electronMocks.contextBridge.exposeInMainWorld).toHaveBeenCalledTimes(1)
  const [name, api] = electronMocks.contextBridge.exposeInMainWorld.mock.calls[0]
  expect(name).toBe("sandobox")
  return api as any
}

describe("electron/preload", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("exposes bridge methods through ipcRenderer.invoke", async () => {
    const api = await loadApi()

    api.generateDockerfile({ runtimes: ["node"] })
    api.generateCompose("sandbox-1")
    api.checkImage("arcypelabox-base:test")
    api.checkSandboxName("my-box", "sandbox-1")
    api.listSandboxes()
    api.createSandbox({ name: "my-box" })
    api.updateSandbox("sandbox-1", { name: "next-box" })
    api.startSandbox("container-1")
    api.stopSandbox("container-1")
    api.removeSandbox("container-1")
    api.getSandboxLogs("container-1")
    api.getSandboxInfo("container-1")
    api.getProxyTarget("sandbox-1")
    api.execInSandbox("container-1", "pwd")
    api.openPath("C:/work")
    api.openInTerminal("C:/work")

    expect(electronMocks.ipcRenderer.invoke.mock.calls).toEqual([
      ["sandobox:generate:dockerfile", { runtimes: ["node"] }],
      ["sandobox:generate:compose", "sandbox-1"],
      ["sandobox:check:image", "arcypelabox-base:test"],
      ["sandobox:db:sandbox:name-exists", "my-box", "sandbox-1"],
      ["sandobox:list"],
      ["sandobox:create", { name: "my-box" }],
      ["sandobox:update", "sandbox-1", { name: "next-box" }],
      ["sandobox:start", "container-1"],
      ["sandobox:stop", "container-1"],
      ["sandobox:remove", "container-1"],
      ["sandobox:logs", "container-1"],
      ["sandobox:info", "container-1"],
      ["sandobox:proxy:target", "sandbox-1"],
      ["sandobox:exec", "container-1", "pwd"],
      ["sandobox:shell:open-path", "C:/work"],
      ["sandobox:shell:open-terminal", "C:/work"],
    ])
  })

  it("exposes opencode invoke methods", async () => {
    const api = await loadApi()

    api.listPendingPermissions("sandbox-1")
    api.replyPermission("sandbox-1", "perm-1", "always")
    api.listPendingQuestions("sandbox-1")
    api.replyQuestion("sandbox-1", "question-1", [["Yes"]])
    api.getOpenCodeSessions("sandbox-1")
    api.createOpenCodeSession("sandbox-1", { title: "Chat" })
    api.deleteOpenCodeSession("sandbox-1", "session-1")
    api.abortOpenCodeSession("sandbox-1", "session-1")
    api.getOpenCodeSessionDebug("sandbox-1", "session-1")
    api.getSessionMessages("sandbox-1", "session-1")
    api.getAvailableSessionId("sandbox-1")
    api.opencode.checkHealth("sandbox-1")
    api.opencode.sendPrompt("sandbox-1", "session-1", "hello")
    api.opencode.sendPromptAsync("sandbox-1", "session-1", "hello")
    api.opencode.runShell("sandbox-1", "ls")
    api.opencode.openCLI("sandbox-1", "session-1")
    api.opencode.listProviders("sandbox-1")
    api.opencode.subscribeEvents("sandbox-1")
    api.opencode.unsubscribeEvents("sandbox-1")

    expect(electronMocks.ipcRenderer.invoke.mock.calls).toEqual([
      ["sandobox:opencode:permissions", "sandbox-1"],
      ["sandobox:opencode:permission:reply", "sandbox-1", "perm-1", "always"],
      ["sandobox:opencode:questions", "sandbox-1"],
      ["sandobox:opencode:question:reply", "sandbox-1", "question-1", [["Yes"]]],
      ["sandobox:opencode:sessions", "sandbox-1"],
      ["sandobox:opencode:session:create", "sandbox-1", { title: "Chat" }],
      ["sandobox:opencode:session:delete", "sandbox-1", "session-1"],
      ["sandobox:opencode:session:abort", "sandbox-1", "session-1"],
      ["sandobox:opencode:session:debug", "sandbox-1", "session-1"],
      ["sandobox:opencode:session:messages", "sandbox-1", "session-1"],
      ["sandobox:opencode:session:get-available", "sandbox-1"],
      ["sandobox:opencode:health", "sandbox-1"],
      ["sandobox:opencode:prompt", "sandbox-1", "session-1", "hello"],
      ["sandobox:opencode:prompt-async", "sandbox-1", "session-1", "hello"],
      ["sandobox:opencode:shell", "sandbox-1", "ls"],
      ["sandobox:opencode:open-cli", "sandbox-1", "session-1"],
      ["sandobox:opencode:providers", "sandbox-1"],
      ["sandobox:opencode:events:subscribe", "sandbox-1"],
      ["sandobox:opencode:events:unsubscribe", "sandbox-1"],
    ])
  })

  it("registers and cleans up opencode listeners", async () => {
    const api = await loadApi()
    const eventCallback = vi.fn()
    const stateCallback = vi.fn()

    const cleanupEvent = api.opencode.onEvent(eventCallback)
    const cleanupState = api.opencode.onState(stateCallback)

    expect(electronMocks.ipcRenderer.on).toHaveBeenNthCalledWith(1, "sandobox:opencode:event", expect.any(Function))
    expect(electronMocks.ipcRenderer.on).toHaveBeenNthCalledWith(2, "sandobox:opencode:state", expect.any(Function))

    const eventHandler = electronMocks.ipcRenderer.on.mock.calls[0][1]
    const stateHandler = electronMocks.ipcRenderer.on.mock.calls[1][1]
    eventHandler({}, "sandbox-1", { type: "message" })
    stateHandler({}, "sandbox-1", { sessions: [] })

    expect(eventCallback).toHaveBeenCalledWith("sandbox-1", { type: "message" })
    expect(stateCallback).toHaveBeenCalledWith("sandbox-1", { sessions: [] })

    cleanupEvent()
    cleanupState()

    expect(electronMocks.ipcRenderer.removeListener).toHaveBeenNthCalledWith(1, "sandobox:opencode:event", eventHandler)
    expect(electronMocks.ipcRenderer.removeListener).toHaveBeenNthCalledWith(2, "sandobox:opencode:state", stateHandler)
  })

  it("registers and cleans up build progress listeners", async () => {
    const api = await loadApi()
    const callback = vi.fn()

    const cleanup = api.onBuildProgress(callback)
    expect(electronMocks.ipcRenderer.on).toHaveBeenCalledWith("sandobox:build:progress", expect.any(Function))

    const handler = electronMocks.ipcRenderer.on.mock.calls[0][1]
    handler({}, { type: "step", text: "Building" })

    expect(callback).toHaveBeenCalledWith({ type: "step", text: "Building" })

    cleanup()
    expect(electronMocks.ipcRenderer.removeListener).toHaveBeenCalledWith("sandobox:build:progress", handler)
  })

  it("exposes db methods through the expected channels", async () => {
    const api = await loadApi()

    api.db.getSandboxById("sandbox-1")
    api.db.getSandboxByContainerId("container-1")
    api.db.getFullSandboxRecord("sandbox-1")
    api.db.listSandboxes()
    api.db.deleteSandbox("sandbox-1")
    api.db.getChatMessages("sandbox-1")
    api.db.addChatMessage("sandbox-1", "user", "hello", 123)
    api.db.clearChatMessages("sandbox-1")
    api.db.getSetting("theme")
    api.db.setSetting("theme", "dark")

    expect(electronMocks.ipcRenderer.invoke.mock.calls).toEqual([
      ["sandobox:db:sandbox:getById", "sandbox-1"],
      ["sandobox:db:sandbox:getByContainerId", "container-1"],
      ["sandobox:db:sandbox:getFullRecord", "sandbox-1"],
      ["sandobox:db:sandbox:list"],
      ["sandobox:db:sandbox:delete", "sandbox-1"],
      ["sandobox:db:chat:list", "sandbox-1"],
      ["sandobox:db:chat:add", "sandbox-1", "user", "hello", 123],
      ["sandobox:db:chat:clear", "sandbox-1"],
      ["sandobox:db:settings:get", "theme"],
      ["sandobox:db:settings:set", "theme", "dark"],
    ])
  })
})

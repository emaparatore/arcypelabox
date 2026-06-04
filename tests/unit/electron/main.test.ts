import { beforeEach, describe, expect, it, vi } from "vitest"

const mainMocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => any>()
  const webContents = {
    send: vi.fn(),
    on: vi.fn(),
    toggleDevTools: vi.fn(),
  }

  class BrowserWindow {
    static getAllWindows = vi.fn(() => [new BrowserWindow()])
    webContents = webContents
    loadURL = vi.fn()
    loadFile = vi.fn()
    on = vi.fn()
    isDestroyed = vi.fn(() => false)
  }

  const proxyInstance = {
    start: vi.fn(async () => undefined),
    stop: vi.fn(),
    getTarget: vi.fn(),
    getUrl: vi.fn((sandboxId: string) => `http://localhost:4096/${sandboxId}`),
  }

  class SandboxProxy {
    start = proxyInstance.start
    stop = proxyInstance.stop
    getTarget = proxyInstance.getTarget
    getUrl = proxyInstance.getUrl
  }

  return {
    handlers,
    webContents,
    BrowserWindow,
    app: {
      isPackaged: false,
      getAppPath: vi.fn(() => "C:/app"),
      whenReady: vi.fn(() => Promise.resolve()),
      on: vi.fn(),
      quit: vi.fn(),
    },
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
        handlers.set(channel, handler)
      }),
    },
    Menu: { setApplicationMenu: vi.fn() },
    shell: { openPath: vi.fn() },
    docker: {
      listSandboxes: vi.fn(),
      createSandbox: vi.fn(),
      updateSandbox: vi.fn(),
      startSandbox: vi.fn(),
      stopSandbox: vi.fn(),
      removeSandbox: vi.fn(),
      removeSandboxBySandboxId: vi.fn(),
      getSandboxLogs: vi.fn(),
      getSandboxInfo: vi.fn(),
      execInSandbox: vi.fn(),
      buildGeneratedDockerfile: vi.fn(() => "FROM node:20"),
      buildDockerCompose: vi.fn(() => "services: {}"),
      checkImageExists: vi.fn(),
      registerExistingSandboxes: vi.fn(),
      startDockerWatcher: vi.fn(),
      stopDockerWatcher: vi.fn(),
    },
    opencode: {
      abortOpenCodeSession: vi.fn(),
      checkHealth: vi.fn(),
      createSession: vi.fn(),
      deleteSession: vi.fn(),
      getAvailableSessionId: vi.fn(),
      getOpenCodeSessionDebug: vi.fn(),
      getSessionMessages: vi.fn(),
      listPendingPermissions: vi.fn(),
      listPendingQuestions: vi.fn(),
      listProviders: vi.fn(),
      listSessions: vi.fn(),
      replyPermission: vi.fn(),
      replyQuestion: vi.fn(),
      sendPrompt: vi.fn(),
      sessionPromptAsync: vi.fn(),
      subscribeToEvents: vi.fn(),
      runShell: vi.fn(),
    },
    database: {
      initDatabase: vi.fn(),
      createSandboxRecord: vi.fn(),
      updateSandboxRecord: vi.fn(),
      getSandboxRecord: vi.fn(),
      getSandboxRecordFull: vi.fn(),
      getSandboxByContainerId: vi.fn(),
      listSandboxRecords: vi.fn(),
      deleteSandboxRecord: vi.fn(),
      deleteSandboxByContainerId: vi.fn(),
      getChatMessages: vi.fn(),
      addChatMessage: vi.fn(),
      clearChatMessages: vi.fn(),
      getSetting: vi.fn(),
      setSetting: vi.fn(),
      findNameConflict: vi.fn(),
    },
    api: {
      registerRoutes: vi.fn(),
      getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
    },
    proxy: {
      SandboxProxy,
      setProxy: vi.fn(),
      getProxy: vi.fn(() => proxyInstance),
      proxyInstance,
    },
    createIpcServer: vi.fn(() => ({ start: vi.fn(async () => undefined), stop: vi.fn(), register: vi.fn(), getPipePath: vi.fn() })),
    childProcess: { exec: vi.fn(), spawn: vi.fn() },
  }
})

vi.mock("electron", () => ({
  app: mainMocks.app,
  BrowserWindow: mainMocks.BrowserWindow,
  ipcMain: mainMocks.ipcMain,
  Menu: mainMocks.Menu,
  shell: mainMocks.shell,
}))

vi.mock("child_process", () => mainMocks.childProcess)
vi.mock("../../../electron/docker.js", () => mainMocks.docker)
vi.mock("../../../electron/opencode.js", () => mainMocks.opencode)
vi.mock("../../../electron/database.js", () => mainMocks.database)
vi.mock("../../../electron/ipc-server.js", () => ({ createIpcServer: mainMocks.createIpcServer }))
vi.mock("../../../electron/api.js", () => mainMocks.api)
vi.mock("../../../electron/proxy.js", () => mainMocks.proxy)

async function loadMainModule() {
  vi.resetModules()
  mainMocks.handlers.clear()
  await import("../../../electron/main.js")
  await Promise.resolve()
  await Promise.resolve()
}

function makeEvent() {
  return { sender: { send: vi.fn() } }
}

describe("electron/main", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mainMocks.handlers.clear()
    mainMocks.docker.listSandboxes.mockResolvedValue([])
    mainMocks.docker.createSandbox.mockResolvedValue("container-1")
    mainMocks.docker.updateSandbox.mockResolvedValue("container-1")
    mainMocks.docker.getSandboxInfo.mockResolvedValue(null)
    mainMocks.docker.execInSandbox.mockResolvedValue("ok")
    mainMocks.database.getSandboxRecordFull.mockReturnValue(null)
    mainMocks.database.createSandboxRecord.mockReturnValue(undefined)
    mainMocks.api.getErrorMessage.mockImplementation((err: unknown) => (err instanceof Error ? err.message : String(err)))
    mainMocks.proxy.proxyInstance.getTarget.mockReturnValue({ host: "127.0.0.1", port: 4096 })
    mainMocks.opencode.sendPrompt.mockResolvedValue("done")
    mainMocks.opencode.listProviders.mockResolvedValue([])
  })

  it("registers lifecycle IPC handlers and lists sandboxes", async () => {
    mainMocks.docker.listSandboxes.mockResolvedValue([{ id: "container-1" }])
    await loadMainModule()

    const result = await mainMocks.handlers.get("sandobox:list")?.(makeEvent())
    expect(result).toEqual([{ id: "container-1" }])
  })

  it("wraps list errors with a user-facing error object", async () => {
    mainMocks.docker.listSandboxes.mockRejectedValue(new Error("docker failed"))
    await loadMainModule()

    const result = await mainMocks.handlers.get("sandobox:list")?.(makeEvent())
    expect(result).toEqual({ error: "docker failed" })
  })

  it("creates sandboxes, forwards build progress, and saves the record", async () => {
    await loadMainModule()
    const event = makeEvent()
    const config = { name: "box", image: "arcypelabox-base:box" }

    mainMocks.docker.createSandbox.mockImplementation(async (_config: any, onProgress: (msg: unknown) => void) => {
      onProgress({ type: "step", text: "Building" })
      return "container-1"
    })

    const result = await mainMocks.handlers.get("sandobox:create")?.(event, config)
    expect(result).toEqual({ sandboxId: expect.any(String), containerId: "container-1" })
    expect(event.sender.send).toHaveBeenCalledWith("sandobox:build:progress", { type: "step", text: "Building" })
    expect(mainMocks.database.createSandboxRecord).toHaveBeenCalledWith(
      expect.objectContaining({ name: "box", image: "arcypelabox-base:box", sandboxId: expect.any(String) }),
      "container-1",
    )
  })

  it("rolls back created sandboxes if DB save fails", async () => {
    mainMocks.database.createSandboxRecord.mockImplementation(() => {
      throw new Error("db write failed")
    })
    await loadMainModule()

    const result = await mainMocks.handlers.get("sandobox:create")?.(makeEvent(), { name: "box", image: "arcypelabox-base:box" })
    expect(mainMocks.docker.removeSandboxBySandboxId).toHaveBeenCalledWith(expect.any(String))
    expect(result).toEqual({ error: "Failed to save sandbox configuration. The container has been removed." })
  })

  it("updates existing records and falls back to create for missing ones", async () => {
    await loadMainModule()
    const handler = mainMocks.handlers.get("sandobox:update")

    mainMocks.database.getSandboxRecordFull.mockReturnValueOnce({ id: "sandbox-1" })
    await handler?.(makeEvent(), "sandbox-1", { name: "first" })
    expect(mainMocks.database.updateSandboxRecord).toHaveBeenCalledWith("sandbox-1", expect.objectContaining({ name: "first" }), "container-1")

    mainMocks.database.getSandboxRecordFull.mockReturnValueOnce(null)
    await handler?.(makeEvent(), "sandbox-2", { name: "second" })
    expect(mainMocks.database.createSandboxRecord).toHaveBeenCalledWith(expect.objectContaining({ sandboxId: "sandbox-2", name: "second" }), "container-1")
  })

  it("treats update DB failures as non-critical", async () => {
    mainMocks.database.getSandboxRecordFull.mockReturnValue({ id: "sandbox-1" })
    mainMocks.database.updateSandboxRecord.mockImplementation(() => {
      throw new Error("db write failed")
    })
    await loadMainModule()

    const result = await mainMocks.handlers.get("sandobox:update")?.(makeEvent(), "sandbox-1", { name: "box" })
    expect(result).toEqual({ sandboxId: "sandbox-1", containerId: "container-1" })
  })

  it("removes sandboxes and deletes the DB record by container id", async () => {
    await loadMainModule()

    const result = await mainMocks.handlers.get("sandobox:remove")?.(makeEvent(), "container-1")
    expect(mainMocks.docker.removeSandbox).toHaveBeenCalledWith("container-1")
    expect(mainMocks.database.deleteSandboxByContainerId).toHaveBeenCalledWith("container-1")
    expect(result).toEqual({ success: true })
  })

  it("returns proxy target info and a missing-target error", async () => {
    await loadMainModule()

    const success = await mainMocks.handlers.get("sandobox:proxy:target")?.(makeEvent(), "sandbox-1")
    expect(success).toEqual({ host: "127.0.0.1", port: 4096 })

    mainMocks.proxy.proxyInstance.getTarget.mockReturnValueOnce(null)
    const missing = await mainMocks.handlers.get("sandobox:proxy:target")?.(makeEvent(), "sandbox-1")
    expect(missing).toEqual({ error: "Sandbox not registered with proxy" })
  })

  it("forwards sandbox exec commands", async () => {
    await loadMainModule()

    const result = await mainMocks.handlers.get("sandobox:exec")?.(makeEvent(), "container-1", "pwd")
    expect(mainMocks.docker.execInSandbox).toHaveBeenCalledWith("container-1", "pwd")
    expect(result).toBe("ok")
  })

  it("wraps opencode handler failures", async () => {
    mainMocks.opencode.sendPrompt.mockRejectedValueOnce(new Error("opencode failed"))
    mainMocks.opencode.listProviders.mockRejectedValueOnce(new Error("providers failed"))
    await loadMainModule()

    await expect(mainMocks.handlers.get("sandobox:opencode:prompt")?.(makeEvent(), "sandbox-1", "session-1", "hello")).resolves.toEqual({ error: "opencode failed" })
    await expect(mainMocks.handlers.get("sandobox:opencode:providers")?.(makeEvent(), "sandbox-1")).resolves.toEqual({ error: "providers failed" })
  })

  it("recovers a missing sandbox record from Docker info", async () => {
    mainMocks.docker.listSandboxes.mockResolvedValue([{ id: "container-1", sandboxId: "sandbox-1" }])
    mainMocks.docker.getSandboxInfo.mockResolvedValue({
      id: "container-1",
      sandboxId: "sandbox-1",
      name: "Recovered",
      image: "arcypelabox-base:recovered",
      projectMount: "C:/work/project",
    })
    mainMocks.database.getSandboxRecordFull.mockReturnValue({ id: "sandbox-1", name: "Recovered" })

    vi.resetModules()
    const mod = await import("../../../electron/main.js")
    const result = await mod.tryRecoverSandboxRecord("sandbox-1")

    expect(mainMocks.database.createSandboxRecord).toHaveBeenCalledWith(expect.objectContaining({ sandboxId: "sandbox-1", name: "Recovered" }), "container-1")
    expect(result).toMatchObject({ id: "sandbox-1" })
  })

  it("returns null when recovery cannot find a matching sandbox or save the record", async () => {
    mainMocks.docker.listSandboxes.mockResolvedValue([])
    vi.resetModules()
    const mod = await import("../../../electron/main.js")
    await expect(mod.tryRecoverSandboxRecord("missing")).resolves.toBeNull()

    mainMocks.docker.listSandboxes.mockResolvedValue([{ id: "container-1", sandboxId: "sandbox-1" }])
    mainMocks.docker.getSandboxInfo.mockResolvedValue({
      id: "container-1",
      sandboxId: "sandbox-1",
      name: "Recovered",
      image: "arcypelabox-base:recovered",
      projectMount: "C:/work/project",
    })
    mainMocks.database.createSandboxRecord.mockImplementation(() => {
      throw new Error("db failed")
    })

    await expect(mod.tryRecoverSandboxRecord("sandbox-1")).resolves.toBeNull()
  })
})

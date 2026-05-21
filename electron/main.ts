import { app, BrowserWindow, ipcMain, Menu } from "electron"
import path from "path"
import { randomUUID } from "node:crypto"
import {
  listSandboxes,
  createSandbox,
  updateSandbox,
  startSandbox,
  stopSandbox,
  removeSandbox,
  getSandboxLogs,
  getSandboxInfo,
  execInSandbox,
  buildGeneratedDockerfile,
} from "./docker.js"
import {
  abortOpenCodeSession,
  checkHealth,
  getOpenCodeSessionDebug,
  getOpenCodeSessions,
  listPendingQuestions,
  listPendingPermissions,
  replyQuestion,
  replyPermission,
  sendPrompt,
  runShell,
} from "./opencode.js"
import {
  initDatabase,
  createSandboxRecord,
  updateSandboxRecord,
  getSandboxRecord,
  getSandboxRecordFull,
  getSandboxByContainerId,
  listSandboxRecords,
  deleteSandboxRecord,
  deleteSandboxByContainerId,
  getChatMessages,
  addChatMessage,
  clearChatMessages,
  getSetting,
  setSetting,
} from "./database.js"
import { createIpcServer } from "./ipc-server.js"
import { registerRoutes, getErrorMessage } from "./api.js"

let mainWindow: BrowserWindow | null = null

const ipcServer = createIpcServer("paratoolz-arcypelabox")

function validateString(value: unknown, name: string): value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${name}: expected non-empty string`)
  }
  return true
}

function validatePort(value: unknown): number {
  const port = typeof value === "string" ? parseInt(value, 10) : value
  if (!Number.isInteger(port) || (port as number) < 1024 || (port as number) > 65535) {
    throw new Error("Port must be an integer between 1024 and 65535")
  }
  return port as number
}

function createWindow() {
  const isDev = !app.isPackaged || process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL
  const iconPath = path.join(app.getAppPath(), "imgs", "arcypelabox-logo-round.png")

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hiddenInset",
  })

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173")
    mainWindow.webContents.on("before-input-event", (event, input) => {
      if (input.key === "F12" && input.type === "keyDown") {
        mainWindow?.webContents.toggleDevTools()
      }
    })
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"))
  }

  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  initDatabase()
  Menu.setApplicationMenu(null)
  createWindow()

  ipcMain.handle("sandobox:list", async () => {
    try {
      return await listSandboxes()
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:create", async (_event, config) => {
    try {
      const sandboxId = config.sandboxId ?? randomUUID()
      const containerId = await createSandbox({ ...config, sandboxId })
      try {
        createSandboxRecord({ ...config, sandboxId }, containerId)
      } catch (dbErr) {
        console.error("[create] DB save failed (non-critical):", dbErr)
      }
      return { sandboxId, containerId }
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:update", async (_event, sandboxId, config) => {
    try {
      validateString(sandboxId, "sandboxId")
      const containerId = await updateSandbox(sandboxId, config)
      try {
        updateSandboxRecord(sandboxId, { ...config, sandboxId }, containerId)
      } catch (dbErr) {
        console.error("[update] DB save failed (non-critical):", dbErr)
      }
      return { sandboxId, containerId }
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:start", async (_event, id) => {
    try {
      await startSandbox(id)
      return { success: true }
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:stop", async (_event, id) => {
    try {
      await stopSandbox(id)
      return { success: true }
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:remove", async (_event, id) => {
    try {
      await removeSandbox(id)
      deleteSandboxByContainerId(id)
      return { success: true }
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:logs", async (_event, id) => {
    try {
      return await getSandboxLogs(id)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:info", async (_event, id) => {
    try {
      return await getSandboxInfo(id)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:exec", async (_event, id, command) => {
    try {
      return await execInSandbox(id, command)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:health", async (_event, port) => {
    return await checkHealth(validatePort(port))
  })

  ipcMain.handle("sandobox:opencode:prompt", async (_event, port, text) => {
    return await sendPrompt(validatePort(port), text)
  })

  ipcMain.handle("sandobox:opencode:permissions", async (_event, port) => {
    try {
      return await listPendingPermissions(validatePort(port))
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:permission:reply", async (_event, port, requestId, reply) => {
    try {
      return await replyPermission(validatePort(port), requestId, reply)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:sessions", async (_event, port) => {
    try {
      return await getOpenCodeSessions(validatePort(port))
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:session:abort", async (_event, port, sessionId) => {
    try {
      return await abortOpenCodeSession(validatePort(port), sessionId)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:session:debug", async (_event, port, sessionId) => {
    try {
      return await getOpenCodeSessionDebug(validatePort(port), sessionId)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:questions", async (_event, port) => {
    try {
      return await listPendingQuestions(validatePort(port))
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:question:reply", async (_event, port, requestId, answers) => {
    try {
      return await replyQuestion(validatePort(port), requestId, answers)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:shell", async (_event, port, command) => {
    return await runShell(validatePort(port), command)
  })

  ipcMain.handle("sandobox:db:sandbox:getById", async (_event, id) => {
    try {
      validateString(id, "sandboxId")
      const record = getSandboxRecord(id)
      if (!record) return null
      const { providers: _, ...safe } = record as Record<string, unknown>
      return safe
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:db:sandbox:getFullRecord", async (_event, id) => {
    try {
      validateString(id, "sandboxId")
      return getSandboxRecordFull(id)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:db:sandbox:getByContainerId", async (_event, containerId) => {
    try {
      validateString(containerId, "containerId")
      return getSandboxByContainerId(containerId)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:db:sandbox:list", async () => {
    try {
      return listSandboxRecords()
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:db:sandbox:delete", async (_event, id) => {
    try {
      validateString(id, "sandboxId")
      deleteSandboxRecord(id)
      return { success: true }
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:db:chat:list", async (_event, sandboxId) => {
    try {
      validateString(sandboxId, "sandboxId")
      return getChatMessages(sandboxId)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:db:chat:add", async (_event, sandboxId, role, content, timestamp) => {
    try {
      validateString(sandboxId, "sandboxId")
      validateString(content, "content")
      if (role !== "user" && role !== "assistant") {
        throw new Error('Invalid role: expected "user" or "assistant"')
      }
      const ts = typeof timestamp === "number" ? timestamp : Date.now()
      return addChatMessage(sandboxId, role, content, ts)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:db:chat:clear", async (_event, sandboxId) => {
    try {
      validateString(sandboxId, "sandboxId")
      clearChatMessages(sandboxId)
      return { success: true }
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:db:settings:get", async (_event, key) => {
    try {
      validateString(key, "key")
      return getSetting(key) ?? null
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:db:settings:set", async (_event, key, value) => {
    try {
      validateString(key, "key")
      validateString(value, "value")
      setSetting(key, value)
      return { success: true }
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:generate:dockerfile", async (_event, config) => {
    return buildGeneratedDockerfile(config as Parameters<typeof buildGeneratedDockerfile>[0])
  })

  registerRoutes(ipcServer)

  ipcServer.start().catch((err: unknown) => {
    console.error("[main] Failed to start IPC server:", err)
  })

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("before-quit", () => {
  ipcServer.stop()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

import { app, BrowserWindow, ipcMain } from "electron"
import path from "path"
import {
  listSandboxes,
  createSandbox,
  startSandbox,
  stopSandbox,
  removeSandbox,
  getSandboxLogs,
  getSandboxInfo,
  execInSandbox,
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

let mainWindow: BrowserWindow | null = null

function getErrorMessage(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)

  if (message.includes("connect ENOENT //./pipe/docker_engine")) {
    return "Docker Desktop is not running or Docker Engine is unavailable. Start Docker Desktop, wait for the engine to finish starting, then refresh the app."
  }

  return message
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hiddenInset",
  })

  if (process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL("http://localhost:5173")
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"))
  }

  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
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
      return await createSandbox(config)
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
    return await checkHealth(port)
  })

  ipcMain.handle("sandobox:opencode:prompt", async (_event, port, text) => {
    return await sendPrompt(port, text)
  })

  ipcMain.handle("sandobox:opencode:permissions", async (_event, port) => {
    try {
      return await listPendingPermissions(port)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:permission:reply", async (_event, port, requestId, reply) => {
    try {
      return await replyPermission(port, requestId, reply)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:sessions", async (_event, port) => {
    try {
      return await getOpenCodeSessions(port)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:session:abort", async (_event, port, sessionId) => {
    try {
      return await abortOpenCodeSession(port, sessionId)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:session:debug", async (_event, port, sessionId) => {
    try {
      return await getOpenCodeSessionDebug(port, sessionId)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:questions", async (_event, port) => {
    try {
      return await listPendingQuestions(port)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:question:reply", async (_event, port, requestId, answers) => {
    try {
      return await replyQuestion(port, requestId, answers)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:shell", async (_event, port, command) => {
    return await runShell(port, command)
  })

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

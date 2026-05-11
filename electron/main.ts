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
  listImages,
} from "./docker.js"
import { checkHealth, sendPrompt, runShell } from "./opencode.js"

let mainWindow: BrowserWindow | null = null

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
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle("sandobox:create", async (_event, config) => {
    try {
      return await createSandbox(config)
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle("sandobox:start", async (_event, id) => {
    try {
      await startSandbox(id)
      return { success: true }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle("sandobox:stop", async (_event, id) => {
    try {
      await stopSandbox(id)
      return { success: true }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle("sandobox:remove", async (_event, id) => {
    try {
      await removeSandbox(id)
      return { success: true }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle("sandobox:logs", async (_event, id) => {
    try {
      return await getSandboxLogs(id)
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle("sandobox:info", async (_event, id) => {
    try {
      return await getSandboxInfo(id)
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle("sandobox:exec", async (_event, id, command) => {
    try {
      return await execInSandbox(id, command)
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle("sandobox:images", async () => {
    try {
      return await listImages()
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle("sandobox:opencode:health", async (_event, port) => {
    return await checkHealth(port)
  })

  ipcMain.handle("sandobox:opencode:prompt", async (_event, port, text) => {
    return await sendPrompt(port, text)
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

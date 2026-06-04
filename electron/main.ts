import { app, BrowserWindow, ipcMain, Menu, shell } from "electron"
import { exec, spawn } from "child_process"
import path from "path"
import { randomUUID } from "node:crypto"
import type { SandboxConfig } from "./docker.js"
import {
  listSandboxes,
  createSandbox,
  updateSandbox,
  startSandbox,
  stopSandbox,
  removeSandbox,
  removeSandboxBySandboxId,
  getSandboxLogs,
  getSandboxInfo,
  execInSandbox,
  buildGeneratedDockerfile,
  buildDockerCompose,
  checkImageExists,
} from "./docker.js"
import {
  abortOpenCodeSession,
  checkHealth,
  createSession,
  deleteSession,
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
  findNameConflict,
} from "./database.js"
import { createIpcServer } from "./ipc-server.js"
import { registerRoutes, getErrorMessage } from "./api.js"
import { SandboxProxy, setProxy, getProxy } from "./proxy.js"
import { registerExistingSandboxes, startDockerWatcher, stopDockerWatcher } from "./docker.js"

let mainWindow: BrowserWindow | null = null

const ipcServer = createIpcServer("paratoolz-arcypelabox")

const opencodeSubscriptions = new Map<string, AbortController>()

function validateString(value: unknown, name: string): value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${name}: expected non-empty string`)
  }
  return true
}

function sendToRenderer(channel: string, ...args: unknown[]) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

export async function tryRecoverSandboxRecord(id: string): Promise<Record<string, unknown> | null> {
  const sandboxes = await listSandboxes()
  const match = sandboxes.find((s) => s.sandboxId === id || s.id === id)
  if (!match) return null

  const info = await getSandboxInfo(match.id)
  if (!info) return null

  const sandboxId = info.sandboxId || id
  const config: SandboxConfig = {
    name: info.name,
    image: info.image,
    projectMount: info.projectMount,
    permissions: {
      read: "allow", edit: "allow", write: "allow",
      glob: "allow", grep: "allow", bash: "allow",
      task: "allow", skill: "allow", question: "allow",
      todowrite: "allow", webfetch: "allow", websearch: "allow",
      lsp: "allow", external_directory: "allow", doom_loop: "deny",
    },
    runtimes: ["node"],
    tools: ["git"],
    services: [],
    generatedDockerfile: buildGeneratedDockerfile({ runtimes: ["node"], tools: ["git"] }),
  }

  try {
    createSandboxRecord({ ...config, sandboxId }, info.id)
    console.log("[recover] Created missing DB record for sandbox:", sandboxId)
  } catch (err) {
    console.error("[recover] Failed to create missing sandbox record:", err)
    return null
  }

  return getSandboxRecordFull(sandboxId)
}

function createWindow() {
  const isDev = !app.isPackaged || process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL
  const iconPath = path.join(app.getAppPath(), "imgs", "arcypelabox-logo-round.png")

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 580,
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

app.whenReady().then(async () => {
  initDatabase()
  Menu.setApplicationMenu(null)

  const proxy = new SandboxProxy(4096)
  await proxy.start()
  setProxy(proxy)
  await registerExistingSandboxes()
  startDockerWatcher()

  createWindow()

  ipcMain.handle("sandobox:list", async () => {
    try {
      return await listSandboxes()
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:create", async (event, config) => {
    try {
      const sandboxId = config.sandboxId ?? randomUUID()
      const containerId = await createSandbox(
        { ...config, sandboxId },
        (msg) => event.sender.send("sandobox:build:progress", msg),
      )
      try {
        createSandboxRecord({ ...config, sandboxId }, containerId)
      } catch (dbErr) {
        console.error("[create] DB save failed, rolling back container:", dbErr)
        try {
          await removeSandboxBySandboxId(sandboxId)
        } catch (rollbackErr) {
          console.error("[create] Rollback also failed:", rollbackErr)
        }
        throw new Error("Failed to save sandbox configuration. The container has been removed.")
      }
      return { sandboxId, containerId }
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:update", async (event, sandboxId, config) => {
    try {
      validateString(sandboxId, "sandboxId")
      const containerId = await updateSandbox(
        sandboxId,
        config,
        (msg) => event.sender.send("sandobox:build:progress", msg),
      )
      try {
        const existing = getSandboxRecordFull(sandboxId)
        if (existing) {
          updateSandboxRecord(sandboxId, { ...config, sandboxId }, containerId)
        } else {
          createSandboxRecord({ ...config, sandboxId }, containerId)
        }
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

  ipcMain.handle("sandobox:proxy:target", async (_event, sandboxId) => {
    try {
      validateString(sandboxId, "sandboxId")
      const target = getProxy().getTarget(sandboxId)
      if (!target) return { error: "Sandbox not registered with proxy" }
      return { host: target.host, port: target.port }
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

  ipcMain.handle("sandobox:opencode:health", async (_event, sandboxId) => {
    validateString(sandboxId, "sandboxId")
    return await checkHealth(sandboxId)
  })

  ipcMain.handle("sandobox:opencode:prompt", async (_event, sandboxId, sessionId, text) => {
    try {
      validateString(sandboxId, "sandboxId")
      return await sendPrompt(sandboxId, text, sessionId)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:prompt-async", async (_event, sandboxId, sessionId, text) => {
    try {
      validateString(sandboxId, "sandboxId")
      return await sessionPromptAsync(sandboxId, text, sessionId)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:providers", async (_event, sandboxId) => {
    try {
      validateString(sandboxId, "sandboxId")
      return await listProviders(sandboxId)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:permissions", async (_event, sandboxId) => {
    try {
      validateString(sandboxId, "sandboxId")
      return await listPendingPermissions(sandboxId)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:permission:reply", async (_event, sandboxId, requestId, reply) => {
    try {
      validateString(sandboxId, "sandboxId")
      return await replyPermission(sandboxId, requestId, reply)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:questions", async (_event, sandboxId) => {
    try {
      validateString(sandboxId, "sandboxId")
      return await listPendingQuestions(sandboxId)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:question:reply", async (_event, sandboxId, requestId, answers) => {
    try {
      validateString(sandboxId, "sandboxId")
      return await replyQuestion(sandboxId, requestId, answers)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:sessions", async (_event, sandboxId) => {
    try {
      validateString(sandboxId, "sandboxId")
      return await listSessions(sandboxId)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:session:create", async (_event, sandboxId, params) => {
    try {
      validateString(sandboxId, "sandboxId")
      return await createSession(sandboxId, params ?? {})
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:session:delete", async (_event, sandboxId, sessionId) => {
    try {
      validateString(sandboxId, "sandboxId")
      await deleteSession(sandboxId, sessionId)
      return { success: true }
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:session:abort", async (_event, sandboxId, sessionId) => {
    try {
      validateString(sandboxId, "sandboxId")
      return await abortOpenCodeSession(sandboxId, sessionId)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:session:debug", async (_event, sandboxId, sessionId) => {
    try {
      validateString(sandboxId, "sandboxId")
      return await getOpenCodeSessionDebug(sandboxId, sessionId)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:session:messages", async (_event, sandboxId, sessionId) => {
    try {
      validateString(sandboxId, "sandboxId")
      return await getSessionMessages(sandboxId, sessionId)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:session:get-available", async (_event, sandboxId) => {
    try {
      validateString(sandboxId, "sandboxId")
      return await getAvailableSessionId(sandboxId)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:events:subscribe", async (_event, sandboxId) => {
    validateString(sandboxId, "sandboxId")

    const existing = opencodeSubscriptions.get(sandboxId)
    if (existing) {
      existing.abort()
      opencodeSubscriptions.delete(sandboxId)
    }

    try {
      let pushTimer: NodeJS.Timeout | undefined
      let dirtyFlags = 0
      const DIRTY_SESSIONS = 1
      const DIRTY_PERMISSIONS = 2
      const DIRTY_QUESTIONS = 4

      const flushState = async () => {
        pushTimer = undefined
        const flags = dirtyFlags
        dirtyFlags = 0
        if (!flags) return
        const updates: Record<string, unknown> = {}
        if (flags & DIRTY_SESSIONS) updates.sessions = await listSessions(sandboxId)
        if (flags & DIRTY_PERMISSIONS) updates.permissions = await listPendingPermissions(sandboxId)
        if (flags & DIRTY_QUESTIONS) updates.questions = await listPendingQuestions(sandboxId)
        sendToRenderer("sandobox:opencode:state", sandboxId, updates)
      }

      const markDirty = (flag: number) => {
        dirtyFlags |= flag
        if (!pushTimer) {
          pushTimer = setTimeout(flushState, 100)
        }
      }

      const reloadFullState = async () => {
        const [sessions, permissions, questions, providers] = await Promise.all([
          listSessions(sandboxId),
          listPendingPermissions(sandboxId),
          listPendingQuestions(sandboxId),
          listProviders(sandboxId),
        ])
        sendToRenderer("sandobox:opencode:state", sandboxId, { sessions, permissions, questions, providers })
      }

      const abortController = await subscribeToEvents(
        sandboxId,
        (event: any) => {
          sendToRenderer("sandobox:opencode:event", sandboxId, event)
          const type: string = event?.type ?? ""
          if (type.startsWith("session.") || type === "session.created" || type === "session.deleted") {
            markDirty(DIRTY_SESSIONS)
          }
          if (type.startsWith("permission.")) {
            markDirty(DIRTY_PERMISSIONS)
          }
          if (type.startsWith("question.")) {
            markDirty(DIRTY_QUESTIONS)
          }
        },
        (error) => {
          console.error(`[SSE] Error on sandbox ${sandboxId}:`, error)
        },
        () => {
          console.log(`[SSE] Reconnected to sandbox ${sandboxId}, reloading state`)
          reloadFullState()
        }
      )
      opencodeSubscriptions.set(sandboxId, abortController)

      const [sessions, permissions, questions, providers] = await Promise.all([
        listSessions(sandboxId),
        listPendingPermissions(sandboxId),
        listPendingQuestions(sandboxId),
        listProviders(sandboxId),
      ])
      sendToRenderer("sandobox:opencode:state", sandboxId, { sessions, permissions, questions, providers })

      return { success: true }
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:opencode:events:unsubscribe", async (_event, sandboxId) => {
    validateString(sandboxId, "sandboxId")
    const existing = opencodeSubscriptions.get(sandboxId)
    if (existing) {
      existing.abort()
      opencodeSubscriptions.delete(sandboxId)
    }
    return { success: true }
  })

  ipcMain.handle("sandobox:opencode:shell", async (_event, sandboxId, command) => {
    validateString(sandboxId, "sandboxId")
    return await runShell(sandboxId, command)
  })

  ipcMain.handle("sandobox:opencode:open-cli", async (_event, sandboxId, sessionId) => {
    validateString(sandboxId, "sandboxId")
    let cmd = `opencode attach http://localhost:4096/${sandboxId}`
    if (typeof sessionId === "string" && sessionId.length > 0) {
      cmd += ` --session ${sessionId}`
    }

    const platform = process.platform
    if (platform === "win32") {
      exec(`start cmd.exe /k "${cmd}"`, { shell: "cmd.exe" })
    } else if (platform === "darwin") {
      const script = `tell application "Terminal" to do script "${cmd.replace(/"/g, '\\"')}"`
      exec(`osascript -e '${script}'`)
    } else {
      const openTerminal = (term: string, args: string[]) => {
        const child = spawn(term, args, { detached: true, stdio: "ignore" })
        child.on("error", () => {})
        child.unref()
      }
      openTerminal("x-terminal-emulator", ["-e", cmd])
      openTerminal("gnome-terminal", ["--", "sh", "-c", cmd])
      openTerminal("xterm", ["-e", cmd])
    }
    return { success: true }
  })

  ipcMain.handle("sandobox:shell:open-path", async (_event, folderPath) => {
    validateString(folderPath, "folderPath")
    return shell.openPath(folderPath)
  })

  ipcMain.handle("sandobox:shell:open-terminal", async (_event, folderPath) => {
    validateString(folderPath, "folderPath")
    const platform = process.platform
    if (platform === "win32") {
      exec(`start cmd.exe /k "cd /d ${folderPath}"`, { shell: "cmd.exe" })
    } else if (platform === "darwin") {
      const script = `tell application "Terminal" to do script "cd ${folderPath.replace(/"/g, '\\"')}"`
      exec(`osascript -e '${script}'`)
    } else {
      const openTerminal = (term: string, args: string[]) => {
        const child = spawn(term, args, { detached: true, stdio: "ignore" })
        child.on("error", () => {})
        child.unref()
      }
      const cmd = `cd ${folderPath.replace(/"/g, '\\"')} && exec $SHELL`
      openTerminal("x-terminal-emulator", ["-e", cmd])
      openTerminal("gnome-terminal", ["--", "sh", "-c", cmd])
      openTerminal("xterm", ["-e", cmd])
    }
    return { success: true }
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
      let record = getSandboxRecordFull(id)
      if (!record) {
        record = await tryRecoverSandboxRecord(id)
      }
      return record
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

  ipcMain.handle("sandobox:db:sandbox:name-exists", async (_event, name, excludeId) => {
    try {
      return findNameConflict(name, excludeId || undefined)
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

  ipcMain.handle("sandobox:check:image", async (_event, tag) => {
    try {
      return await checkImageExists(tag)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle("sandobox:generate:dockerfile", async (_event, config) => {
    return buildGeneratedDockerfile(config as Parameters<typeof buildGeneratedDockerfile>[0])
  })

  ipcMain.handle("sandobox:generate:compose", async (_event, sandboxId) => {
    try {
      validateString(sandboxId, "sandboxId")
      return buildDockerCompose(sandboxId)
    } catch (err) {
      return { error: getErrorMessage(err) }
    }
  })

  app.on("before-quit", () => {
    for (const abortController of opencodeSubscriptions.values()) {
      abortController.abort()
    }
    opencodeSubscriptions.clear()
    stopDockerWatcher()
    proxy.stop()
    ipcServer.stop()
  })

  registerRoutes(ipcServer)

  ipcServer.start().catch((err: unknown) => {
    console.error("[main] Failed to start IPC server:", err)
  })

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

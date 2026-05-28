import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("sandobox", {
  generateDockerfile: (config: unknown) => ipcRenderer.invoke("sandobox:generate:dockerfile", config),
  checkImage: (tag: string) => ipcRenderer.invoke("sandobox:check:image", tag),
  checkSandboxName: (name: string, excludeId?: string) => ipcRenderer.invoke("sandobox:db:sandbox:name-exists", name, excludeId),
  listSandboxes: () => ipcRenderer.invoke("sandobox:list"),
  createSandbox: (config: unknown) => ipcRenderer.invoke("sandobox:create", config),
  updateSandbox: (sandboxId: string, config: unknown) => ipcRenderer.invoke("sandobox:update", sandboxId, config),
  startSandbox: (id: string) => ipcRenderer.invoke("sandobox:start", id),
  stopSandbox: (id: string) => ipcRenderer.invoke("sandobox:stop", id),
  removeSandbox: (id: string) => ipcRenderer.invoke("sandobox:remove", id),
  getSandboxLogs: (id: string) => ipcRenderer.invoke("sandobox:logs", id),
  getSandboxInfo: (id: string) => ipcRenderer.invoke("sandobox:info", id),
  getProxyTarget: (sandboxId: string) => ipcRenderer.invoke("sandobox:proxy:target", sandboxId),
  execInSandbox: (id: string, command: string) =>
    ipcRenderer.invoke("sandobox:exec", id, command),
  listPendingPermissions: (sandboxId: string) => ipcRenderer.invoke("sandobox:opencode:permissions", sandboxId),
  replyPermission: (sandboxId: string, requestId: string, reply: "once" | "always" | "reject") =>
    ipcRenderer.invoke("sandobox:opencode:permission:reply", sandboxId, requestId, reply),
  listPendingQuestions: (sandboxId: string) => ipcRenderer.invoke("sandobox:opencode:questions", sandboxId),
  replyQuestion: (sandboxId: string, requestId: string, answers: string[][]) =>
    ipcRenderer.invoke("sandobox:opencode:question:reply", sandboxId, requestId, answers),
  getOpenCodeSessions: (sandboxId: string) => ipcRenderer.invoke("sandobox:opencode:sessions", sandboxId),
  createOpenCodeSession: (sandboxId: string, params?: { title?: string; model?: { providerID: string; id: string; variant?: string } }) =>
    ipcRenderer.invoke("sandobox:opencode:session:create", sandboxId, params),
  deleteOpenCodeSession: (sandboxId: string, sessionId: string) =>
    ipcRenderer.invoke("sandobox:opencode:session:delete", sandboxId, sessionId),
  abortOpenCodeSession: (sandboxId: string, sessionId: string) =>
    ipcRenderer.invoke("sandobox:opencode:session:abort", sandboxId, sessionId),
  getOpenCodeSessionDebug: (sandboxId: string, sessionId: string) =>
    ipcRenderer.invoke("sandobox:opencode:session:debug", sandboxId, sessionId),
  getSessionMessages: (sandboxId: string, sessionId: string) =>
    ipcRenderer.invoke("sandobox:opencode:session:messages", sandboxId, sessionId),
  getAvailableSessionId: (sandboxId: string) =>
    ipcRenderer.invoke("sandobox:opencode:session:get-available", sandboxId),
  opencode: {
    checkHealth: (sandboxId: string) => ipcRenderer.invoke("sandobox:opencode:health", sandboxId),
    sendPrompt: (sandboxId: string, sessionId: string, text: string) =>
      ipcRenderer.invoke("sandobox:opencode:prompt", sandboxId, sessionId, text),
    sendPromptAsync: (sandboxId: string, sessionId: string, text: string) =>
      ipcRenderer.invoke("sandobox:opencode:prompt-async", sandboxId, sessionId, text),
    runShell: (sandboxId: string, command: string) =>
      ipcRenderer.invoke("sandobox:opencode:shell", sandboxId, command),
    openCLI: (sandboxId: string, sessionId?: string) =>
      ipcRenderer.invoke("sandobox:opencode:open-cli", sandboxId, sessionId),
    listProviders: (sandboxId: string) =>
      ipcRenderer.invoke("sandobox:opencode:providers", sandboxId),
    subscribeEvents: (sandboxId: string) =>
      ipcRenderer.invoke("sandobox:opencode:events:subscribe", sandboxId),
    unsubscribeEvents: (sandboxId: string) =>
      ipcRenderer.invoke("sandobox:opencode:events:unsubscribe", sandboxId),
    onEvent: (callback: (sandboxId: string, event: any) => void) => {
      const handler = (_event: any, sandboxId: string, data: any) => callback(sandboxId, data)
      ipcRenderer.on("sandobox:opencode:event", handler)
      return () => ipcRenderer.removeListener("sandobox:opencode:event", handler)
    },
    onState: (callback: (sandboxId: string, state: any) => void) => {
      const handler = (_event: any, sandboxId: string, state: any) => callback(sandboxId, state)
      ipcRenderer.on("sandobox:opencode:state", handler)
      return () => ipcRenderer.removeListener("sandobox:opencode:state", handler)
    },
  },
  openPath: (folderPath: string) => ipcRenderer.invoke("sandobox:shell:open-path", folderPath),
  openInTerminal: (folderPath: string) => ipcRenderer.invoke("sandobox:shell:open-terminal", folderPath),
  onBuildProgress: (callback: (event: { type: "step" | "log"; text: string }) => void) => {
    const handler = (_event: any, data: { type: "step" | "log"; text: string }) => callback(data)
    ipcRenderer.on("sandobox:build:progress", handler)
    return () => ipcRenderer.removeListener("sandobox:build:progress", handler)
  },
  db: {
    getSandboxById: (id: string) => ipcRenderer.invoke("sandobox:db:sandbox:getById", id),
    getSandboxByContainerId: (containerId: string) =>
      ipcRenderer.invoke("sandobox:db:sandbox:getByContainerId", containerId),
    getFullSandboxRecord: (id: string) => ipcRenderer.invoke("sandobox:db:sandbox:getFullRecord", id),
    listSandboxes: () => ipcRenderer.invoke("sandobox:db:sandbox:list"),
    deleteSandbox: (id: string) => ipcRenderer.invoke("sandobox:db:sandbox:delete", id),
    getChatMessages: (sandboxId: string) => ipcRenderer.invoke("sandobox:db:chat:list", sandboxId),
    addChatMessage: (sandboxId: string, role: string, content: string, timestamp: number) =>
      ipcRenderer.invoke("sandobox:db:chat:add", sandboxId, role, content, timestamp),
    clearChatMessages: (sandboxId: string) => ipcRenderer.invoke("sandobox:db:chat:clear", sandboxId),
    getSetting: (key: string) => ipcRenderer.invoke("sandobox:db:settings:get", key),
    setSetting: (key: string, value: string) =>
      ipcRenderer.invoke("sandobox:db:settings:set", key, value),
  },
})

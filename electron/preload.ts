import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("sandobox", {
  generateDockerfile: (config: unknown) => ipcRenderer.invoke("sandobox:generate:dockerfile", config),
  listSandboxes: () => ipcRenderer.invoke("sandobox:list"),
  createSandbox: (config: unknown) => ipcRenderer.invoke("sandobox:create", config),
  updateSandbox: (sandboxId: string, config: unknown) => ipcRenderer.invoke("sandobox:update", sandboxId, config),
  startSandbox: (id: string) => ipcRenderer.invoke("sandobox:start", id),
  stopSandbox: (id: string) => ipcRenderer.invoke("sandobox:stop", id),
  removeSandbox: (id: string) => ipcRenderer.invoke("sandobox:remove", id),
  getSandboxLogs: (id: string) => ipcRenderer.invoke("sandobox:logs", id),
  getSandboxInfo: (id: string) => ipcRenderer.invoke("sandobox:info", id),
  execInSandbox: (id: string, command: string) =>
    ipcRenderer.invoke("sandobox:exec", id, command),
  listPendingPermissions: (port: number) => ipcRenderer.invoke("sandobox:opencode:permissions", port),
  replyPermission: (port: number, requestId: string, reply: "once" | "always" | "reject") =>
    ipcRenderer.invoke("sandobox:opencode:permission:reply", port, requestId, reply),
  listPendingQuestions: (port: number) => ipcRenderer.invoke("sandobox:opencode:questions", port),
  replyQuestion: (port: number, requestId: string, answers: string[][]) =>
    ipcRenderer.invoke("sandobox:opencode:question:reply", port, requestId, answers),
  getOpenCodeSessions: (port: number) => ipcRenderer.invoke("sandobox:opencode:sessions", port),
  createOpenCodeSession: (port: number, params?: { title?: string; model?: { providerID: string; id: string; variant?: string } }) =>
    ipcRenderer.invoke("sandobox:opencode:session:create", port, params),
  deleteOpenCodeSession: (port: number, sessionId: string) =>
    ipcRenderer.invoke("sandobox:opencode:session:delete", port, sessionId),
  abortOpenCodeSession: (port: number, sessionId: string) =>
    ipcRenderer.invoke("sandobox:opencode:session:abort", port, sessionId),
  getOpenCodeSessionDebug: (port: number, sessionId: string) =>
    ipcRenderer.invoke("sandobox:opencode:session:debug", port, sessionId),
  getSessionMessages: (port: number, sessionId: string) =>
    ipcRenderer.invoke("sandobox:opencode:session:messages", port, sessionId),
  getAvailableSessionId: (port: number) =>
    ipcRenderer.invoke("sandobox:opencode:session:get-available", port),
  opencode: {
    checkHealth: (port: number) => ipcRenderer.invoke("sandobox:opencode:health", port),
    sendPrompt: (port: number, sessionId: string, text: string) =>
      ipcRenderer.invoke("sandobox:opencode:prompt", port, sessionId, text),
    sendPromptAsync: (port: number, sessionId: string, text: string) =>
      ipcRenderer.invoke("sandobox:opencode:prompt-async", port, sessionId, text),
    runShell: (port: number, command: string) =>
      ipcRenderer.invoke("sandobox:opencode:shell", port, command),
    openCLI: (port: number, sessionId?: string) =>
      ipcRenderer.invoke("sandobox:opencode:open-cli", port, sessionId),
    listProviders: (port: number) =>
      ipcRenderer.invoke("sandobox:opencode:providers", port),
    subscribeEvents: (port: number) =>
      ipcRenderer.invoke("sandobox:opencode:events:subscribe", port),
    unsubscribeEvents: (port: number) =>
      ipcRenderer.invoke("sandobox:opencode:events:unsubscribe", port),
    onEvent: (callback: (port: number, event: any) => void) => {
      const handler = (_event: any, port: number, data: any) => callback(port, data)
      ipcRenderer.on("sandobox:opencode:event", handler)
      return () => ipcRenderer.removeListener("sandobox:opencode:event", handler)
    },
    onState: (callback: (port: number, state: any) => void) => {
      const handler = (_event: any, port: number, state: any) => callback(port, state)
      ipcRenderer.on("sandobox:opencode:state", handler)
      return () => ipcRenderer.removeListener("sandobox:opencode:state", handler)
    },
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

import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("sandobox", {
  listSandboxes: () => ipcRenderer.invoke("sandobox:list"),
  createSandbox: (config: unknown) => ipcRenderer.invoke("sandobox:create", config),
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
  getOpenCodeSessions: (port: number) => ipcRenderer.invoke("sandobox:opencode:sessions", port),
  abortOpenCodeSession: (port: number, sessionId: string) =>
    ipcRenderer.invoke("sandobox:opencode:session:abort", port, sessionId),
  getOpenCodeSessionDebug: (port: number, sessionId: string) =>
    ipcRenderer.invoke("sandobox:opencode:session:debug", port, sessionId),
  listPendingQuestions: (port: number) => ipcRenderer.invoke("sandobox:opencode:questions", port),
  replyQuestion: (port: number, requestId: string, answers: string[][]) =>
    ipcRenderer.invoke("sandobox:opencode:question:reply", port, requestId, answers),
  opencode: {
    checkHealth: (port: number) => ipcRenderer.invoke("sandobox:opencode:health", port),
    sendPrompt: (port: number, text: string) =>
      ipcRenderer.invoke("sandobox:opencode:prompt", port, text),
    runShell: (port: number, command: string) =>
      ipcRenderer.invoke("sandobox:opencode:shell", port, command),
  },
  db: {
    getSandboxById: (id: string) => ipcRenderer.invoke("sandobox:db:sandbox:getById", id),
    getSandboxByContainerId: (containerId: string) =>
      ipcRenderer.invoke("sandobox:db:sandbox:getByContainerId", containerId),
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

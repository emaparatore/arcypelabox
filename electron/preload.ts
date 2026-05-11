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
  listImages: () => ipcRenderer.invoke("sandobox:images"),
  opencode: {
    checkHealth: (port: number) => ipcRenderer.invoke("sandobox:opencode:health", port),
    sendPrompt: (port: number, text: string) =>
      ipcRenderer.invoke("sandobox:opencode:prompt", port, text),
    runShell: (port: number, command: string) =>
      ipcRenderer.invoke("sandobox:opencode:shell", port, command),
  },
})

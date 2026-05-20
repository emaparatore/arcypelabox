import { randomUUID } from "node:crypto"
import type { IpcRequest, RequestHandler } from "./ipc-server.js"
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
import { createSandboxRecord, deleteSandboxByContainerId } from "./database.js"

export function getErrorMessage(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)

  if (message.includes("connect ENOENT //./pipe/docker_engine")) {
    return "Docker Desktop is not running or Docker Engine is unavailable. Start Docker Desktop, wait for the engine to finish starting, then refresh the app."
  }

  return message
}

interface IpcServerHandle {
  register(method: IpcRequest["method"], path: string, handler: RequestHandler): void
  start(): Promise<void>
  stop(): Promise<void>
  getPipePath(): string
}

export function registerRoutes(server: IpcServerHandle) {
  server.register("GET", "/api/ping", () => {
    return { status: 200, body: { pong: true } }
  })

  server.register("GET", "/api/sandboxes", async () => {
    try {
      const list = await listSandboxes()
      return { status: 200, body: list }
    } catch (err) {
      return { status: 500, body: { error: getErrorMessage(err) } }
    }
  })

  server.register("POST", "/api/sandboxes", async (req) => {
    try {
      const config = req.body as Record<string, unknown>
      const sandboxId = (config?.sandboxId as string) ?? randomUUID()
      const containerId = await createSandbox({ ...config, sandboxId } as Parameters<typeof createSandbox>[0])
      try {
        createSandboxRecord({ ...config, sandboxId } as Parameters<typeof createSandboxRecord>[0], containerId)
      } catch (dbErr) {
        console.error("[api] DB save failed (non-critical):", dbErr)
      }
      return { status: 201, body: { sandboxId, containerId } }
    } catch (err) {
      return { status: 500, body: { error: getErrorMessage(err) } }
    }
  })

  server.register("POST", "/api/sandboxes/start", async (req) => {
    try {
      const id = (req.body as Record<string, unknown>)?.id as string
      await startSandbox(id)
      return { status: 200, body: { success: true } }
    } catch (err) {
      return { status: 500, body: { error: getErrorMessage(err) } }
    }
  })

  server.register("POST", "/api/sandboxes/stop", async (req) => {
    try {
      const id = (req.body as Record<string, unknown>)?.id as string
      await stopSandbox(id)
      return { status: 200, body: { success: true } }
    } catch (err) {
      return { status: 500, body: { error: getErrorMessage(err) } }
    }
  })

  server.register("DELETE", "/api/sandboxes", async (req) => {
    try {
      const id = (req.body as Record<string, unknown>)?.id as string
      await removeSandbox(id)
      deleteSandboxByContainerId(id)
      return { status: 200, body: { success: true } }
    } catch (err) {
      return { status: 500, body: { error: getErrorMessage(err) } }
    }
  })

  server.register("GET", "/api/sandboxes/logs", async (req) => {
    try {
      const id = (req.body as Record<string, unknown>)?.id as string
      const logs = await getSandboxLogs(id)
      return { status: 200, body: logs }
    } catch (err) {
      return { status: 500, body: { error: getErrorMessage(err) } }
    }
  })

  server.register("GET", "/api/sandboxes/info", async (req) => {
    try {
      const id = (req.body as Record<string, unknown>)?.id as string
      const info = await getSandboxInfo(id)
      return { status: 200, body: info }
    } catch (err) {
      return { status: 500, body: { error: getErrorMessage(err) } }
    }
  })

  server.register("POST", "/api/sandboxes/exec", async (req) => {
    try {
      const { id, command } = req.body as { id: string; command: string }
      const result = await execInSandbox(id, command)
      return { status: 200, body: result }
    } catch (err) {
      return { status: 500, body: { error: getErrorMessage(err) } }
    }
  })
}

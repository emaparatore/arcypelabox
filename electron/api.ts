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
  buildGeneratedDockerfile,
} from "./docker.js"
import { createSandboxRecord, deleteSandboxByContainerId, getSandboxRecord, listSandboxRecords } from "./database.js"

export function getErrorMessage(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)

  if (message.includes("connect ENOENT //./pipe/docker_engine")) {
    return "Docker Desktop is not running or Docker Engine is unavailable. Start Docker Desktop, wait for the engine to finish starting, then refresh the app."
  }

  return message
}

function resolveContainerId(sandboxId: string): string {
  const record = getSandboxRecord(sandboxId)
  if (!record) throw new Error(`Sandbox not found: ${sandboxId}`)
  const containerId = record.docker_container_id as string
  if (!containerId) throw new Error(`No Docker container for sandbox: ${sandboxId}`)
  return containerId
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
      if (!config?.projectMount) {
        return { status: 400, body: { error: "projectMount is required" } }
      }
      if (!config?.generatedDockerfile) {
        config.generatedDockerfile = buildGeneratedDockerfile({
          runtimes: config.runtimes as string[] | undefined,
          tools: config.tools as string[] | undefined,
          services: config.services as string[] | undefined,
        })
      }
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
      const sandboxId = (req.body as Record<string, unknown>)?.id as string
      const containerId = resolveContainerId(sandboxId)
      await startSandbox(containerId)
      return { status: 200, body: { success: true } }
    } catch (err) {
      return { status: 500, body: { error: getErrorMessage(err) } }
    }
  })

  server.register("POST", "/api/sandboxes/stop", async (req) => {
    try {
      const sandboxId = (req.body as Record<string, unknown>)?.id as string
      const containerId = resolveContainerId(sandboxId)
      await stopSandbox(containerId)
      return { status: 200, body: { success: true } }
    } catch (err) {
      return { status: 500, body: { error: getErrorMessage(err) } }
    }
  })

  server.register("DELETE", "/api/sandboxes", async (req) => {
    try {
      const sandboxId = (req.body as Record<string, unknown>)?.id as string
      const containerId = resolveContainerId(sandboxId)
      await removeSandbox(containerId)
      deleteSandboxByContainerId(containerId)
      return { status: 200, body: { success: true } }
    } catch (err) {
      return { status: 500, body: { error: getErrorMessage(err) } }
    }
  })

  server.register("GET", "/api/sandboxes/logs", async (req) => {
    try {
      const sandboxId = (req.body as Record<string, unknown>)?.id as string
      const containerId = resolveContainerId(sandboxId)
      const logs = await getSandboxLogs(containerId)
      return { status: 200, body: logs }
    } catch (err) {
      return { status: 500, body: { error: getErrorMessage(err) } }
    }
  })

  server.register("GET", "/api/sandboxes/info", async (req) => {
    try {
      const sandboxId = (req.body as Record<string, unknown>)?.id as string
      const containerId = resolveContainerId(sandboxId)
      const info = await getSandboxInfo(containerId)
      return { status: 200, body: info }
    } catch (err) {
      return { status: 500, body: { error: getErrorMessage(err) } }
    }
  })

  server.register("POST", "/api/sandboxes/exec", async (req) => {
    try {
      const sandboxId = (req.body as { id: string })?.id
      const command = (req.body as { command: string })?.command
      const containerId = resolveContainerId(sandboxId)
      const result = await execInSandbox(containerId, command)
      return { status: 200, body: result }
    } catch (err) {
      return { status: 500, body: { error: getErrorMessage(err) } }
    }
  })

  server.register("GET", "/api/sandboxes/by-mount", async (req) => {
    try {
      const mountPath = (req.body as Record<string, unknown>)?.mountPath as string
      if (!mountPath) {
        return { status: 400, body: { error: "mountPath is required" } }
      }
      const all = listSandboxRecords()
      const sandboxes = all
        .filter((r) => r.project_mount === mountPath)
        .map((r) => ({ id: r.id, name: r.name }))
      return { status: 200, body: sandboxes }
    } catch (err) {
      return { status: 500, body: { error: getErrorMessage(err) } }
    }
  })
}

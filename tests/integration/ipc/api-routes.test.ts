import { describe, it, expect, afterAll, vi, beforeAll } from "vitest"
import { randomUUID } from "node:crypto"
import { createIpcServer } from "../../../electron/ipc-server.js"
import { createIpcClient } from "../../../electron/ipc-client.js"
import { registerRoutes } from "../../../electron/api.js"
import * as docker from "../../../electron/docker.js"
import * as database from "../../../electron/database.js"

vi.mock("../../../electron/docker.js", () => ({
  listSandboxes: vi.fn(),
  createSandbox: vi.fn(),
  startSandbox: vi.fn(),
  stopSandbox: vi.fn(),
  removeSandbox: vi.fn(),
  getSandboxLogs: vi.fn(),
  getSandboxInfo: vi.fn(),
  execInSandbox: vi.fn(),
  buildGeneratedDockerfile: vi.fn(() => "FROM node:20\nWORKDIR test"),
}))

vi.mock("../../../electron/database.js", () => ({
  findNameConflict: vi.fn(() => false),
  createSandboxRecord: vi.fn(() => randomUUID()),
  getSandboxRecord: vi.fn(() => null),
  listSandboxRecords: vi.fn(() => []),
  deleteSandboxByContainerId: vi.fn(),
  getSandboxRecordFull: vi.fn(),
}))

vi.mock("../../../electron/proxy.js", () => ({
  getProxy: vi.fn(() => ({
    getUrl: vi.fn(() => "http://localhost:4096/test"),
    getTarget: vi.fn(() => ({ host: "127.0.0.1", port: 4096 })),
    register: vi.fn(),
    unregister: vi.fn(),
  })),
}))

const pipeName = `test-api-routes-${randomUUID().slice(0, 8)}`
const server = createIpcServer(pipeName)
const client = createIpcClient(pipeName)

beforeAll(async () => {
  registerRoutes(server)
  await server.start()
})

afterAll(async () => {
  await server.stop()
})

describe("API routes", () => {
  it("GET /api/ping returns pong", async () => {
    const { status, body } = await client.get("/api/ping")
    expect(status).toBe(200)
    expect(body).toEqual({ pong: true })
  })

  it("POST /api/sandboxes rejects empty name", async () => {
    const { status, body } = await client.post("/api/sandboxes", { name: "", projectMount: "/tmp/test" })
    expect(status).toBe(400)
    expect(body).toHaveProperty("error")
  })

  it("POST /api/sandboxes rejects name with invalid characters", async () => {
    const { status, body } = await client.post("/api/sandboxes", { name: "Invalid Name!", projectMount: "/tmp/test" })
    expect(status).toBe(400)
    expect(body).toHaveProperty("error")
  })

  it("POST /api/sandboxes rejects missing projectMount", async () => {
    const { status, body } = await client.post("/api/sandboxes", { name: "valid-name" })
    expect(status).toBe(400)
    expect(body).toHaveProperty("error")
  })

  it("POST /api/sandboxes rejects image field", async () => {
    const { status, body } = await client.post("/api/sandboxes", {
      name: "valid-name",
      projectMount: "/tmp/test",
      image: "custom:latest",
    })
    expect(status).toBe(400)
    expect(body).toHaveProperty("error", expect.stringContaining("image"))
  })

  it("POST /api/sandboxes rejects generatedDockerfile via API", async () => {
    const { status, body } = await client.post("/api/sandboxes", {
      name: "valid-name",
      projectMount: "/tmp/test",
      generatedDockerfile: "FROM alpine",
    })
    expect(status).toBe(400)
    expect(body).toHaveProperty("error", expect.stringContaining("generatedDockerfile"))
  })

  it("POST /api/sandboxes rejects customCommands via API", async () => {
    const { status, body } = await client.post("/api/sandboxes", {
      name: "valid-name",
      projectMount: "/tmp/test",
      customCommands: "RUN echo hi",
    })
    expect(status).toBe(400)
    expect(body).toHaveProperty("error", expect.stringContaining("customCommands"))
  })

  it("POST /api/sandboxes rejects long name", async () => {
    const { status, body } = await client.post("/api/sandboxes", {
      name: "a".repeat(65),
      projectMount: "/tmp/test",
    })
    expect(status).toBe(400)
    expect(body).toHaveProperty("error")
  })

  it("GET /api/sandboxes/by-mount returns empty if no mountPath", async () => {
    const { status, body } = await client.get("/api/sandboxes/by-mount", {})
    expect(status).toBe(400)
    expect(body).toHaveProperty("error")
  })

  it("GET /api/sandboxes/:id/status returns 500 for unknown sandbox", async () => {
    const { status, body } = await client.get(`/api/sandboxes/${randomUUID()}/status`)
    expect(status).toBe(500)
    expect(body).toHaveProperty("error")
  })

  it("POST /api/sandboxes returns 409 on name conflict", async () => {
    vi.mocked(database.findNameConflict).mockReturnValueOnce(true)

    const { status, body } = await client.post("/api/sandboxes", {
      name: "existing-box",
      projectMount: "/tmp/test",
    })

    expect(status).toBe(409)
    expect(body).toEqual({
      error: 'A sandbox with the name "existing-box" already exists. Please use a different name.',
    })
  })

  it("GET /api/sandboxes/:id/info returns 404 when sandbox info is missing", async () => {
    vi.mocked(database.getSandboxRecord).mockReturnValueOnce({ docker_container_id: "container-1" } as any)
    vi.mocked(docker.getSandboxInfo).mockResolvedValueOnce(null)

    const { status, body } = await client.get("/api/sandboxes/sandbox-1/info")
    expect(status).toBe(404)
    expect(body).toEqual({ error: "Sandbox not found" })
  })

  it("GET /api/sandboxes/by-mount maps proxyUrl for matching records", async () => {
    vi.mocked(database.listSandboxRecords).mockReturnValueOnce([
      { id: "sandbox-1", name: "Box One", project_mount: "/tmp/project" } as any,
      { id: "sandbox-2", name: "Box Two", project_mount: "/tmp/other" } as any,
    ])

    const { status, body } = await client.get("/api/sandboxes/by-mount", { mountPath: "/tmp/project" })
    expect(status).toBe(200)
    expect(body).toEqual([
      {
        id: "sandbox-1",
        name: "Box One",
        proxyUrl: "http://localhost:4096/test",
      },
    ])
  })

  it("POST /api/sandboxes/exec forwards the resolved container id and command", async () => {
    vi.mocked(database.getSandboxRecord).mockReturnValueOnce({ docker_container_id: "container-1" } as any)
    vi.mocked(docker.execInSandbox).mockResolvedValueOnce("command output")

    const { status, body } = await client.post("/api/sandboxes/exec", {
      id: "sandbox-1",
      command: "pwd",
    })

    expect(status).toBe(200)
    expect(body).toBe("command output")
    expect(docker.execInSandbox).toHaveBeenCalledWith("container-1", "pwd")
  })
})

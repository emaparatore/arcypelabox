import { describe, it, expect, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import { createIpcServer } from "../../../electron/ipc-server.js"
import { createIpcClient } from "../../../electron/ipc-client.js"

const pipeName = `test-server-client-${randomUUID().slice(0, 8)}`
const server = createIpcServer(pipeName)
const client = createIpcClient(pipeName)

beforeAll(async () => {
  server.register("GET", "/api/ping", () => ({ status: 200, body: { pong: true } }))
  server.register("POST", "/api/echo", (req) => ({ status: 200, body: req.body }))
  server.register("GET", "/api/sandboxes/:id/info", (req) => ({
    status: 200,
    body: { id: req.params!.id, name: "test-sandbox" },
  }))
  server.register("GET", "/api/error-test", () => {
    throw new Error("handler failure")
  })
  await server.start()
})

afterAll(async () => {
  await server.stop()
})

describe("IPC server-client integration", () => {
  it("handles GET /api/ping", async () => {
    const { status, body } = await client.get("/api/ping")
    expect(status).toBe(200)
    expect(body).toEqual({ pong: true })
  })

  it("handles POST with body echo", async () => {
    const payload = { hello: "world", number: 42 }
    const { status, body } = await client.post("/api/echo", payload)
    expect(status).toBe(200)
    expect(body).toEqual(payload)
  })

  it("handles parametric routes with :id", async () => {
    const sandboxId = randomUUID()
    const { status, body } = await client.get(`/api/sandboxes/${sandboxId}/info`)
    expect(status).toBe(200)
    expect(body).toEqual({ id: sandboxId, name: "test-sandbox" })
  })

  it("returns 404 for unknown routes", async () => {
    const { status, body } = await client.get("/api/unknown")
    expect(status).toBe(404)
    expect(body).toHaveProperty("error")
  })

  it("returns 500 when handler throws", async () => {
    const { status, body } = await client.get("/api/error-test")
    expect(status).toBe(500)
    expect(body).toHaveProperty("error", "handler failure")
  })

  it("rejects request with timeout if no server responds", async () => {
    const deadClient = createIpcClient(`nonexistent-pipe-${randomUUID()}`)
    await expect(deadClient.get("/api/ping", undefined, 500)).rejects.toThrow()
  })
})

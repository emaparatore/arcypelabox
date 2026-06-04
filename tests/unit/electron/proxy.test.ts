import http from "node:http"
import net from "node:net"
import { afterEach, describe, expect, it } from "vitest"
import { SandboxProxy } from "../../../electron/proxy.js"

const upstreamServers: http.Server[] = []
const proxies: SandboxProxy[] = []

async function startHttpServer(handler: http.RequestListener) {
  const server = http.createServer(handler)
  upstreamServers.push(server)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Failed to bind test server")
  return { server, port: address.port }
}

async function getFreePort() {
  const probe = http.createServer()
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve))
  const address = probe.address()
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  if (!address || typeof address === "string") throw new Error("Failed to reserve test port")
  return address.port
}

async function startProxy() {
  const proxy = new SandboxProxy(await getFreePort())
  proxies.push(proxy)
  await proxy.start()
  const server = proxy as unknown as { server: http.Server }
  const address = server.server.address()
  if (!address || typeof address === "string") throw new Error("Failed to bind proxy")
  return { proxy, port: address.port }
}

function request(port: number, path: string, options: { method?: string; body?: string } = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: options.method ?? "GET",
        headers: options.body ? { "Content-Type": "text/plain", "Content-Length": Buffer.byteLength(options.body) } : undefined,
      },
      (res) => {
        let body = ""
        res.setEncoding("utf8")
        res.on("data", (chunk) => {
          body += chunk
        })
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }))
      },
    )
    req.on("error", reject)
    if (options.body) req.write(options.body)
    req.end()
  })
}

afterEach(async () => {
  await Promise.all(upstreamServers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
  proxies.splice(0).forEach((proxy) => proxy.stop())
})

describe("electron/proxy", () => {
  it("registers, unregisters and formats route urls", async () => {
    const { proxy, port } = await startProxy()

    proxy.register("sandbox-1", { host: "127.0.0.1", port: 5001 })
    proxy.register("sandbox-2", { host: "127.0.0.1", port: 5002 })

    expect(proxy.getTarget("sandbox-1")).toEqual({ host: "127.0.0.1", port: 5001 })
    expect(proxy.getTarget("sandbox-2")).toEqual({ host: "127.0.0.1", port: 5002 })
    expect(proxy.getUrl("sandbox-1")).toBe(`http://127.0.0.1:${port}/sandbox-1`)

    proxy.unregister("sandbox-1")
    expect(proxy.getTarget("sandbox-1")).toBeNull()
  })

  it("forwards GET requests and rewrites the sandbox prefix", async () => {
    const upstream = await startHttpServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ method: req.method, url: req.url }))
    })
    const { proxy, port } = await startProxy()
    proxy.register("sandbox-1", { host: "127.0.0.1", port: upstream.port })

    const response = await request(port, "/sandbox-1/api/ping?x=1")

    expect(response.status).toBe(200)
    expect(response.body).toContain('"method":"GET"')
    expect(response.body).toContain('"url":"/api/ping?x=1"')
  })

  it("forwards POST requests with body", async () => {
    const upstream = await startHttpServer((req, res) => {
      let body = ""
      req.setEncoding("utf8")
      req.on("data", (chunk) => {
        body += chunk
      })
      req.on("end", () => {
        res.writeHead(201, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ method: req.method, body }))
      })
    })
    const { proxy, port } = await startProxy()
    proxy.register("sandbox-1", { host: "127.0.0.1", port: upstream.port })

    const response = await request(port, "/sandbox-1/messages", { method: "POST", body: "hello proxy" })

    expect(response.status).toBe(201)
    expect(response.body).toContain('"method":"POST"')
    expect(response.body).toContain('"body":"hello proxy"')
  })

  it("returns 404 for unknown sandboxes and unknown debug endpoints", async () => {
    const { port } = await startProxy()

    const unknownSandbox = await request(port, "/missing-sandbox/health")
    const unknownDebug = await request(port, "/__proxy/unknown")

    expect(unknownSandbox.status).toBe(404)
    expect(unknownSandbox.body).toContain("Unknown sandbox")
    expect(unknownDebug.status).toBe(404)
    expect(unknownDebug.body).toBe("Unknown debug endpoint")
  })

  it("returns 502 when the target cannot be reached", async () => {
    const { proxy, port } = await startProxy()
    proxy.register("sandbox-1", { host: "127.0.0.1", port: 65500 })

    const response = await request(port, "/sandbox-1/health")

    expect(response.status).toBe(502)
    expect(response.body).toContain("Bad Gateway")
  })

  it("lists registered routes on the debug endpoint", async () => {
    const { proxy, port } = await startProxy()
    proxy.register("sandbox-1", { host: "127.0.0.1", port: 5010 })

    const response = await request(port, "/__proxy/routes")

    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      "sandbox-1": { host: "127.0.0.1", port: 5010 },
    })
  })

  it("forwards upgrade requests to the target", async () => {
    const server = http.createServer()
    upstreamServers.push(server)
    let upgradedPath = ""
    server.on("upgrade", (req, socket) => {
      upgradedPath = req.url ?? ""
      socket.write("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n")
      socket.end()
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const upstreamAddress = server.address()
    if (!upstreamAddress || typeof upstreamAddress === "string") throw new Error("Failed to bind upgrade server")

    const { proxy, port } = await startProxy()
    proxy.register("sandbox-1", { host: "127.0.0.1", port: upstreamAddress.port })

    const response = await new Promise<string>((resolve, reject) => {
      const socket = net.connect(port, "127.0.0.1", () => {
        socket.write("GET /sandbox-1/ws HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n")
      })

      let data = ""
      socket.setEncoding("utf8")
      socket.on("data", (chunk) => {
        data += chunk
      })
      socket.on("end", () => resolve(data))
      socket.on("error", reject)
    })

    expect(upgradedPath).toBe("/ws")
    expect(response).toContain("101 Switching Protocols")
  })
})

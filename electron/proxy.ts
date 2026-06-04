import http from "http"
import net from "net"

interface ContainerTarget {
  host: string
  port: number
}

let instance: SandboxProxy | null = null

export function setProxy(proxy: SandboxProxy) {
  instance = proxy
}

export function getProxy(): SandboxProxy {
  if (!instance) throw new Error("Proxy not initialized. Call setProxy() first.")
  return instance
}

export class SandboxProxy {
  private routes = new Map<string, ContainerTarget>()
  private server: http.Server
  private _port: number

  constructor(port = 4096) {
    this._port = port
    this.server = http.createServer(this.onRequest.bind(this))
    this.server.on("upgrade", this.onUpgrade.bind(this))
  }

  register(sandboxId: string, target: ContainerTarget) {
    this.routes.set(sandboxId, target)
  }

  unregister(sandboxId: string) {
    this.routes.delete(sandboxId)
  }

  getUrl(sandboxId: string): string {
    return `http://127.0.0.1:${this._port}/${sandboxId}`
  }

  getTarget(sandboxId: string): ContainerTarget | null {
    return this.routes.get(sandboxId) ?? null
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this._port, "127.0.0.1", resolve)
    })
  }

  stop() {
    this.server.close()
  }

  private resolveTarget(rawPath: string): { target: ContainerTarget; rewrittenPath: string } | null {
    const segments = rawPath.split("/").filter(Boolean)
    const sandboxId = segments[0]
    const target = this.routes.get(sandboxId)
    if (!target) return null
    const rewrittenPath = "/" + segments.slice(1).join("/")
    return { target, rewrittenPath }
  }

  private onRequest(clientReq: http.IncomingMessage, clientRes: http.ServerResponse) {
    const rawPath = clientReq.url ?? "/"
    const segments = rawPath.split("/").filter(Boolean)

    if (segments[0] === "__proxy") {
      if (segments[1] === "routes") {
        const routes = Object.fromEntries(this.routes.entries())
        const data = JSON.stringify(routes, null, 2)
        clientRes.writeHead(200, { "Content-Type": "application/json" })
        clientRes.end(data)
        return
      }
      clientRes.writeHead(404, { "Content-Type": "text/plain" })
      clientRes.end("Unknown debug endpoint")
      return
    }

    const resolved = this.resolveTarget(rawPath)
    if (!resolved) {
      const sandboxId = segments[0] ?? "unknown"
      console.error(`[proxy] Unknown sandbox: ${sandboxId} — registered: ${JSON.stringify([...this.routes.keys()])}`)
      clientRes.writeHead(404, { "Content-Type": "text/plain" })
      clientRes.end(`Unknown sandbox: ${sandboxId}`)
      return
    }

    const options: http.RequestOptions = {
      hostname: resolved.target.host,
      port: resolved.target.port,
      path: resolved.rewrittenPath,
      method: clientReq.method,
      headers: clientReq.headers,
    }

    const proxyReq = http.request(options, (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers)
      proxyRes.pipe(clientRes)
    })

    proxyReq.on("error", () => {
      clientRes.writeHead(502, { "Content-Type": "text/plain" })
      clientRes.end("Bad Gateway: cannot reach sandbox container")
    })

    clientReq.pipe(proxyReq)
  }

  private onUpgrade(clientReq: http.IncomingMessage, clientSocket: net.Socket, head: Buffer) {
    const resolved = this.resolveTarget(clientReq.url ?? "/")
    if (!resolved) {
      clientSocket.destroy()
      return
    }

    const targetSocket = net.connect(resolved.target.port, resolved.target.host, () => {
      targetSocket.write(
        `${clientReq.method} ${resolved.rewrittenPath} HTTP/${clientReq.httpVersion}\r\n` +
        Object.entries(clientReq.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n") +
        "\r\n\r\n"
      )
      if (head.length > 0) targetSocket.write(head)
      targetSocket.pipe(clientSocket)
      clientSocket.pipe(targetSocket)
    })

    targetSocket.on("error", () => clientSocket.destroy())
    clientSocket.on("error", () => targetSocket.destroy())
  }
}

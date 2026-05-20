import net from "net"
import os from "os"

export interface IpcRequest {
  id: string
  method: "GET" | "POST" | "PUT" | "DELETE"
  path: string
  body?: unknown
}

export interface IpcResponse {
  id: string
  status: number
  body?: unknown
}

export interface HandlerResult {
  status: number
  body?: unknown
}

export type RequestHandler = (req: IpcRequest) => HandlerResult | Promise<HandlerResult>

function getPipePath(name: string): string {
  if (os.platform() === "win32") {
    return `//./pipe/${name}`
  }
  return `/tmp/${name}.sock`
}

export function createIpcServer(serviceName: string) {
  const handlers = new Map<string, RequestHandler>()
  const pipePath = getPipePath(serviceName)

  const server = net.createServer((socket) => {
    let buffer = ""

    function tryParse(line: string) {
      if (!line.trim()) return

      let request: IpcRequest
      try {
        request = JSON.parse(line)
      } catch {
        const errResp: IpcResponse = { id: "parse-error", status: 400, body: { error: "Invalid JSON" } }
        socket.write(JSON.stringify(errResp) + "\n")
        return
      }

      const key = `${request.method}:${request.path}`
      const handler = handlers.get(key)

      if (!handler) {
        const resp: IpcResponse = {
          id: request.id,
          status: 404,
          body: { error: `No handler for ${request.method} ${request.path}` },
        }
        socket.write(JSON.stringify(resp) + "\n")
        return
      }

      Promise.resolve(handler(request))
        .then((result) => {
          const resp: IpcResponse = { id: request.id, status: result.status ?? 200, body: result.body }
          socket.write(JSON.stringify(resp) + "\n")
        })
        .catch((err: unknown) => {
          const resp: IpcResponse = {
            id: request.id,
            status: 500,
            body: { error: err instanceof Error ? err.message : String(err) },
          }
          socket.write(JSON.stringify(resp) + "\n")
        })
    }

    socket.on("data", (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) tryParse(line)
    })

    socket.on("error", (err) => {
      console.error(`[ipc-server] socket error:`, err.message)
    })
  })

  const api = {
    register(method: IpcRequest["method"], path: string, handler: RequestHandler) {
      handlers.set(`${method}:${path}`, handler)
    },

    start(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.listen(pipePath, () => {
          console.log(`[ipc-server] listening on ${pipePath}`)
          resolve()
        })
        server.on("error", reject)
      })
    },

    stop(): Promise<void> {
      return new Promise((resolve) => server.close(() => resolve()))
    },

    getPipePath: () => pipePath,
  }

  return api
}

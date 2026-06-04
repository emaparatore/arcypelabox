import net from "net"
import { randomUUID } from "node:crypto"
import os from "os"

export function getPipePath(name: string): string {
  if (os.platform() === "win32") {
    return `//./pipe/${name}`
  }
  return `/tmp/${name}.sock`
}

export function createIpcClient(serviceName: string) {
  const pipePath = getPipePath(serviceName)

  function request(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown, timeoutMs = 30000): Promise<{ status: number; body?: unknown }> {
    return new Promise((resolve, reject) => {
      const id = randomUUID()
      const client = net.connect(pipePath)
      let buffer = ""
      let done = false

      const cleanup = () => {
        done = true
        client.removeAllListeners()
        client.end()
        client.destroy()
      }

      client.on("connect", () => {
        client.write(JSON.stringify({ id, method, path, body }) + "\n")
      })

      client.on("data", (chunk) => {
        if (done) return
        buffer += chunk.toString()
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const resp = JSON.parse(line)
            if (resp.id === id) {
              cleanup()
              resolve({ status: resp.status, body: resp.body })
              return
            }
          } catch {
            // skip malformed lines
          }
        }
      })

      client.on("error", (err) => {
        if (!done) {
          cleanup()
          reject(err)
        }
      })

      client.on("end", () => {
        if (!done) {
          cleanup()
          reject(new Error("Connection closed without response"))
        }
      })

      if (timeoutMs > 0) {
        setTimeout(() => {
          if (!done) {
            cleanup()
            reject(new Error(`Request timeout after ${timeoutMs}ms`))
          }
        }, timeoutMs)
      }
    })
  }

  return {
    get: (path: string, body?: unknown) => request("GET", path, body),
    post: (path: string, body?: unknown) => request("POST", path, body),
    put: (path: string, body?: unknown) => request("PUT", path, body),
    delete: (path: string, body?: unknown) => request("DELETE", path, body),
    request,
  }
}

import net from "net"
import { randomUUID } from "node:crypto"
import os from "os"

const PIPE = os.platform() === "win32"
  ? "//./pipe/paratoolz-arcypelabox"
  : "/tmp/paratoolz-arcypelabox.sock"

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const id = randomUUID()
    const client = net.connect(PIPE)
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
      for (const line of buffer.split("\n")) {
        if (!line.trim()) continue
        try {
          const resp = JSON.parse(line)
          if (resp.id === id) {
            cleanup()
            resolve(resp)
            return
          }
        } catch { /* skip */ }
      }
      buffer = ""
    })

    client.on("error", (err) => { if (!done) { cleanup(); reject(err) } })
    client.on("end", () => { if (!done) { cleanup(); reject(new Error("Connection closed")) } })

    setTimeout(() => { if (!done) { cleanup(); reject(new Error("Timeout")) } }, 10000)
  })
}

async function main() {
  console.log(`Connecting to ${PIPE}...\n`)

  try {
    // 1. ping
    const ping = await request("GET", "/api/ping")
    console.log("✓ GET /api/ping →", ping.status, JSON.stringify(ping.body))
  } catch (err) {
    console.log("✗ GET /api/ping →", err.message)
    console.log("\nMake sure the app is running (npm run electron:dev)")
    process.exit(1)
  }

  // 2. list sandboxes
  try {
    const list = await request("GET", "/api/sandboxes")
    console.log("✓ GET /api/sandboxes →", list.status, `(${Array.isArray(list.body) ? list.body.length : "?"} items)`)
  } catch (err) {
    console.log("✗ GET /api/sandboxes →", err.message)
  }

  // 3. by-mount (filtra sandbox per percorso progetto)
  try {
    const mountPath = process.argv[2]
    if (mountPath) {
      const byMount = await request("GET", "/api/sandboxes/by-mount", { mountPath })
      console.log("✓ GET /api/sandboxes/by-mount →", byMount.status, `(${Array.isArray(byMount.body) ? byMount.body.length : "?"} found)`)
    }
  } catch (err) {
    console.log("✗ GET /api/sandboxes/by-mount →", err.message)
  }
}

main()

# Connettere un'app ad Arcypelabox tramite Named Pipe (esempio con Electron/Node.js)

Questa guida spiega come far comunicare un'altra applicazione con Arcypelabox usando il named pipe locale. Il codice d'esempio è per **Electron / Node.js**, ma il protocollo (JSON su named pipe) è accessibile da qualsiasi linguaggio.

## Prerequisiti

- Arcypelabox deve essere in esecuzione sulla stessa macchina
- La tua app deve essere un'app Electron (o qualsiasi app Node.js)

## 1. Crea il client

Crea un file `ipc-client.ts` (o `ipc-client.js`) nel tuo progetto, nella cartella del processo main (`electron/` o `src/`), con questo contenuto — non ha dipendenze esterne, usa solo `net` e `crypto` di Node.js:

```ts
import net from "net"
import { randomUUID } from "node:crypto"
import os from "os"

function getPipePath(name: string): string {
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
```

## 2. Usalo nel tuo processo main

```ts
import { createIpcClient } from "./ipc-client.js"

const client = createIpcClient("paratoolz-arcypelabox")

// Health check
const { status, body } = await client.get("/api/ping")
console.log(body) // { pong: true }

// Lista sandbox
const { body: sandboxes } = await client.get("/api/sandboxes")
console.log(sandboxes)

// Crea una sandbox (solo parametri strutturati, niente Dockerfile custom)
await client.post("/api/sandboxes", {
  name: "prova-da-app-esterna",
  image: "node:20",
  runtimes: ["node", "python", "go"],
  tools: ["git", "curl", "jq"],
  services: [],
  projectMount: "C:\\progetti\\mio-progetto",
  permissions: {},
  providers: [
    { id: "anthropic", apiKey: "sk-ant-..." },
    { id: "openai", apiKey: "sk-proj-..." },
  ],
})

// Avvia / ferma / rimuovi
await client.post("/api/sandboxes/start", { id: "sandbox-id" })
await client.post("/api/sandboxes/stop", { id: "sandbox-id" })
await client.delete("/api/sandboxes", { id: "sandbox-id" })

// Ottieni stato e info di una sandbox (include proxyUrl)
const { body: stato } = await client.get("/api/sandboxes/:id/status")
console.log(stato) // { status: "running" }

const { body: info } = await client.get("/api/sandboxes/:id/info")
console.log(info.proxyUrl) // "http://127.0.0.1:4096/sandbox-uuid"
```

## 3. Esponilo al renderer (preload)

Per usare il client anche dal renderer della tua app, aggiungi un bridge in `preload.ts`:

```ts
import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("arcypelabox", {
  // Questi chiamano ipcRenderer.invoke(), che gestisci in main.ts
  ping: () => ipcRenderer.invoke("arcypelabox:ping"),
  listSandboxes: () => ipcRenderer.invoke("arcypelabox:list"),
  createSandbox: (config: unknown) => ipcRenderer.invoke("arcypelabox:create", config),
  startSandbox: (id: string) => ipcRenderer.invoke("arcypelabox:start", id),
  stopSandbox: (id: string) => ipcRenderer.invoke("arcypelabox:stop", id),
  removeSandbox: (id: string) => ipcRenderer.invoke("arcypelabox:remove", id),
})
```

E in `main.ts` della tua app:

```ts
import { createIpcClient } from "./ipc-client.js"

const client = createIpcClient("paratoolz-arcypelabox")

ipcMain.handle("arcypelabox:ping", () => client.get("/api/ping"))
ipcMain.handle("arcypelabox:list", () => client.get("/api/sandboxes"))
ipcMain.handle("arcypelabox:create", (_e, config) => client.post("/api/sandboxes", config))
ipcMain.handle("arcypelabox:start", (_e, id) => client.post("/api/sandboxes/start", { id }))
ipcMain.handle("arcypelabox:stop", (_e, id) => client.post("/api/sandboxes/stop", { id }))
ipcMain.handle("arcypelabox:remove", (_e, id) => client.delete("/api/sandboxes", { id }))
```

## 4. API disponibili

| Metodo | Path | Descrizione | Body richiesto |
|--------|------|-------------|----------------|
| `GET` | `/api/ping` | Verifica se Arcypelabox è raggiungibile | — |
| `GET` | `/api/sandboxes` | Lista tutte le sandbox | — |
| `POST` | `/api/sandboxes` | Crea una sandbox (richiede `projectMount`) | `{ name, image, runtimes, tools, services, projectMount, ... }` |
| `GET` | `/api/sandboxes/by-mount` | Filtra sandbox per percorso mount (restituisce `{ id, name, proxyUrl }`) | `{ mountPath }` |
| `POST` | `/api/sandboxes/start` | Avvia una sandbox | `{ id }` |
| `POST` | `/api/sandboxes/stop` | Ferma una sandbox | `{ id }` |
| `DELETE` | `/api/sandboxes` | Rimuove una sandbox | `{ id }` |
| `GET` | `/api/sandboxes/logs` | Log di una sandbox | `{ id }` |
| `GET` | `/api/sandboxes/:id/info` | Info complete di una sandbox | — |
| `GET` | `/api/sandboxes/:id/status` | Stato della sandbox (`{ status }`) | — |
| `POST` | `/api/sandboxes/exec` | Esegue un comando | `{ id, command }` |

> **Nota:** `id` nei path e nei body richiesta è sempre il **sandbox UUID** (es. `99168509-e4a7-4b94-b422-374c76019051`), non il Docker container ID. La risoluzione avviene automaticamente lato server.
>
> **Nota:** `POST /api/sandboxes` richiede obbligatoriamente `projectMount`. `generatedDockerfile` e `customCommands` **non sono accettati** via named pipe per ragioni di sicurezza; il Dockerfile viene sempre generato automaticamente da `runtimes`, `tools` e `services`.
>
> **Nota:** `proxyUrl` è incluso automaticamente nelle risposte di `GET /api/sandboxes`, `GET /api/sandboxes/:id/info` e `GET /api/sandboxes/by-mount`. Non è più necessario un endpoint dedicato.

## 5. Gestione errori

Il client lancia un'eccezione se il pipe non è raggiungibile (Arcypelabox non in esecuzione):

```ts
try {
  const { status, body } = await client.get("/api/ping")
} catch (err) {
  if (err.code === "ENOENT" || err.message.includes("connect")) {
    console.error("Arcypelabox non è in esecuzione")
  }
}
```

Il server risponde sempre con status `200` in caso di successo, `4xx`/`5xx` in caso di errore.

Il `body` contiene `{ error: "..." }` per gli errori.

## 6. Note tecniche

- **Pipe name**: `//./pipe/paratoolz-arcypelabox` (Windows), `/tmp/paratoolz-arcypelabox.sock` (Unix)
- **Timeout**: default 30 secondi, configurabile con `client.request("GET", "/path", body, timeoutMs)`
- **Protocollo**: newline-delimited JSON — ogni messaggio è un JSON su una riga terminata da `\n`
- **Modulo Node**: `net` (nativo, nessuna dipendenza esterna)

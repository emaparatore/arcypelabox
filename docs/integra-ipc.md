# Connettere un'app Electron ad Arcypelabox tramite Named Pipe

Questa guida spiega come far comunicare un'altra applicazione Electron con Arcypelabox usando il named pipe locale.

## Prerequisiti

- Arcypelabox deve essere in esecuzione sulla stessa macchina
- La tua app deve essere un'app Electron (o qualsiasi app Node.js)

## 1. Copia il client

Prendi il file `electron/ipc-client.ts` da Arcypelabox e copialo nel tuo progetto (nella cartella del processo main, ad esempio `src/ipc-client.ts` o `electron/ipc-client.ts`).

Non ha dipendenze esterne, usa solo `net` e `crypto` di Node.js.

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
  opencodePort: 4096,
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
| `POST` | `/api/sandboxes` | Crea una sandbox (richiede `projectMount`) | `{ name, image, runtimes, tools, services, opencodePort, projectMount, ... }` |
| `GET` | `/api/sandboxes/by-mount` | Filtra sandbox per percorso mount | `{ mountPath }` |
| `POST` | `/api/sandboxes/start` | Avvia una sandbox | `{ id }` |
| `POST` | `/api/sandboxes/stop` | Ferma una sandbox | `{ id }` |
| `DELETE` | `/api/sandboxes` | Rimuove una sandbox | `{ id }` |
| `GET` | `/api/sandboxes/logs` | Log di una sandbox | `{ id }` |
| `GET` | `/api/sandboxes/info` | Info di una sandbox | `{ id }` |
| `POST` | `/api/sandboxes/exec` | Esegue un comando | `{ id, command }` |

> **Nota:** `id` nei body richiesta è sempre il **sandbox UUID** (es. `99168509-e4a7-4b94-b422-374c76019051`), non il Docker container ID. La risoluzione avviene automaticamente lato server.
>
> **Nota:** `POST /api/sandboxes` richiede obbligatoriamente `projectMount`. `generatedDockerfile` e `customCommands` **non sono accettati** via named pipe per ragioni di sicurezza; il Dockerfile viene sempre generato automaticamente da `runtimes`, `tools` e `services`.

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

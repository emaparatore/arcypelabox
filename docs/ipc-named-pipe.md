# IPC via Named Pipe (Local REST API)

Arcypelabox espone un server **REST-like su named pipe** (Windows) o **Unix socket** (Linux/macOS) per comunicare con altre applicazioni desktop locali senza passare da HTTP o da una porta TCP.

## Come funziona

- Ogni app che vuole esporsi crea un server named pipe con nome univoco (`paratoolz-arcypelabox`).
- Altre app sulla stessa macchina si connettono al pipe e inviano richieste JSON.
- Il protocollo è **newline-delimited JSON**: ogni messaggio è un oggetto JSON su una riga terminata da `\n`.
- Le richieste hanno metodo (`GET/POST/PUT/DELETE`) e path, come una REST API.
- Il server risponde con status HTTP-like e body JSON.

## Endpoint esposti

| Metodo | Path | Descrizione |
|--------|------|-------------|
| `GET` | `/api/ping` | Health check |
| `GET` | `/api/sandboxes` | Lista tutte le sandbox |
| `POST` | `/api/sandboxes` | Crea una nuova sandbox |
| `GET` | `/api/sandboxes/by-mount` | Filtra sandbox per percorso mount (body: `{ mountPath }`) |
| `POST` | `/api/sandboxes/start` | Avvia una sandbox (body: `{ id }`) |
| `POST` | `/api/sandboxes/stop` | Ferma una sandbox (body: `{ id }`) |
| `DELETE` | `/api/sandboxes` | Rimuove una sandbox (body: `{ id }`) |
| `GET` | `/api/sandboxes/logs` | Log di una sandbox (body: `{ id }`) |
| `GET` | `/api/sandboxes/:id/info` | Info complete di una sandbox |
| `GET` | `/api/sandboxes/:id/status` | Stato di una sandbox (`{ status }`) |
| `GET` | `/api/sandboxes/:id/opencode-port` | Porta OpenCode di una sandbox (`{ opencodePort }`) |
| `POST` | `/api/sandboxes/exec` | Esegue un comando (body: `{ id, command }`) |

> **Nota:** `id` nei path e nei body si riferisce sempre al **sandbox UUID** (chiave primaria del database), non al Docker container ID. La risoluzione avviene automaticamente lato server.
>
> **Nota:** `POST /api/sandboxes` richiede obbligatoriamente `projectMount` nel body; `generatedDockerfile` è opzionale — se omesso viene generato automaticamente da `runtimes`, `tools` e `services`.

## Formato dei messaggi

### Richiesta
```json
{"id":"uuid-univoco","method":"GET","path":"/api/sandboxes","body":{}}
```

### Risposta
```json
{"id":"uuid-univoco","status":200,"body":[...]}
```

## Usare il client (da un'altra app Electron)

```ts
import { createIpcClient } from "./ipc-client.js"

const client = createIpcClient("paratoolz-arcypelabox")

// Lista sandbox
const { status, body } = await client.get("/api/sandboxes")

// Crea sandbox
const { status, body } = await client.post("/api/sandboxes", {
  name: "my-sandbox",
  image: "node:20",
  ...
})

// Avvia sandbox
await client.post("/api/sandboxes/start", { id: "sandbox-id" })

// Health check
await client.get("/api/ping")
```

## Esporre nuovi endpoint (lato server)

In `electron/api.ts`:

```ts
server.register("GET", "/api/mia-risorsa", async (req) => {
  // req.body, req.method, req.path, req.id
  return { status: 200, body: { risultato: "ok" } }
})
```

## Dettagli implementativi

- **Server**: `electron/ipc-server.ts` — `net.createServer()` su named pipe
- **Client**: `electron/ipc-client.ts` — `net.connect()` su named pipe
- **Piattaforme**: Windows (`//./pipe/<nome>`), Unix (`/tmp/<nome>.sock`)
- **Modulo Node**: `net` (nativo, nessuna dipendenza esterna)
- **Timeout**: 30 secondi di default sul client, configurabile

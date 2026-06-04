# Reverse Proxy: Sostituzione del port-per-container con path-based routing

## Problema

Ogni sandbox Docker espone una porta host unica mappata direttamente al container:

```
Host:4096 → Container:4096 (opencode serve --port 4096)
Host:4097 → Container:4097 (opencode serve --port 4097)
...
```

Il renderer e il main process comunicano via `http://localhost:<port>/...`.

**Problemi:**
- Gestione di N porte (firewall, conflitti, port exhaustion)
- L'utente deve specificare manualmente la porta in fase di creazione
- Se due sandbox usano la stessa porta, c'è conflitto

## Soluzione

Un singolo proxy HTTP in ascolto su una porta fissa (4096), che instrada in base al sandboxId:

```
http://localhost:4096/<sandbox-id>/global/health
http://localhost:4096/<sandbox-id>/event
http://localhost:4096/<sandbox-id>/session/list
...
```

Il proxy forwarda al container via IP interno sulla rete Docker `<group>-net`.

## Architettura

```
                    Proxy (Electron main process)
                    ┌───────────────────────────────┐
                    │  http://localhost:4096          │
                    │  Map<sandboxId, ContainerTarget>│
                    │                                 │
Renderer ──IPC─────▶  │  ┌─ /<sandbox-A>/* ──▶ Container A (172.x.x.1:4096)  │
                    │  ├─ /<sandbox-B>/* ──▶ Container B (172.x.x.2:4096)  │
                    │  └─ /<sandbox-C>/* ──▶ Container C (172.x.x.3:4096)  │
                    └───────────────────────────────┘
```

I container non hanno più port binding host → container. Usano solo la rete interna Docker `<group>-net`.

## Piano di implementazione

### 1. Nuovo file: `electron/proxy.ts`

Reverse proxy HTTP usando solo moduli nativi (`http`).

**Nota:** L'SDK OpenCode e il CLI `opencode attach` usano esclusivamente **HTTP REST + SSE**. Non c'è WebSocket. SSE è un flusso HTTP standard (chunked transfer encoding), quindi passa attraverso il proxy automaticamente con un `pipe()`.

```ts
interface ContainerTarget {
  host: string  // container IP su rete interna Docker
  port: number  // porta interna del container (es. 4096)
}

class SandboxProxy {
  private routes: Map<string, ContainerTarget>
  private server: http.Server
  private port: number

  constructor(port?: number)

  register(sandboxId: string, target: ContainerTarget): void
  unregister(sandboxId: string): void
  getUrl(sandboxId: string): string   // es. "http://localhost:4096/<sandboxId>"
  start(): Promise<void>
  stop(): void
}
```

**Routing HTTP (request handler):**
1. Estrarre sandboxId dal primo segmento del path
2. Cercare target registrato
3. Connettersi via `http.request()` o `net.connect()` al container IP:porta
4. Inviare la request HTTP con path riscritto (senza prefisso sandboxId)
5. Fare `pipe()` della response del container alla response del client
6. SSE funziona automaticamente (è solo HTTP streaming)

**Niente WebSocket da gestire** — l'SDK e il CLI OpenCode usano solo HTTP + SSE.

### 2. `electron/docker.ts` — modifiche

**Rimuovere** da `createContainer()`:
- `ExposedPorts`
- `PortBindings`

**Modificare `SandboxConfig`:**
- Rimuovere `opencodePort`

**Modificare `SandboxInfo`:**
- Rimuovere `opencodePort`
- Aggiungere (opzionale) `proxyUrl`

**Dopo `container.start()`:**
```ts
const info = await container.inspect()
const networkName = `${group}-net`
const ip = info.NetworkSettings.Networks[networkName].IPAddress
const target = { host: ip, port: 4096 }
proxy.register(sandboxId, target)
```

**Fixare `injectApiKey()`:**
- Usare `proxy.getUrl(sandboxId)` invece di `http://127.0.0.1:${port}`

**Hardcodare** la porta interna container a 4096 nel `Cmd`:
```
opencode serve --port 4096 --hostname 0.0.0.0
```

### 3. `electron/opencode.ts` — refactor

Tutte le funzioni: `port: number` → `sandboxId: string`.

```ts
function getClient(sandboxId: string) {
  const { createOpencodeClient } = await import("@opencode-ai/sdk/v2")
  return createOpencodeClient({ baseUrl: proxy.getUrl(sandboxId) })
}
```

Modificare:
- `checkHealth(port)` → `checkHealth(sandboxId)`
- `sendPrompt(port, ...)` → `sendPrompt(sandboxId, ...)`
- `subscribeToEvents(port, ...)` → `subscribeToEvents(sandboxId, ...)`
- Tutte le altre funzioni
- Rimuovere `validatePort()`

### 4. `electron/main.ts` — modifiche

**Aggiungere** in `app.whenReady()`:
```ts
const proxy = new SandboxProxy(4096)
await proxy.start()
```

**Aggiungere** in `before-quit`:
```ts
proxy.stop()
```

**Tutti gli handler IPC:**
- Sostituire `port` (number) con `sandboxId` (string)
- `validatePort()` → `validateString(sandboxId, "sandboxId")`
- `opencodeSubscriptions`: chiave da `port` a `sandboxId`

**Handler modificati:**
- `sandobox:opencode:health` → parametro sandboxId
- `sandobox:opencode:prompt` → parametro sandboxId
- `sandobox:opencode:events:subscribe` → parametro sandboxId
- `sandobox:opencode:events:unsubscribe` → parametro sandboxId
- `sandobox:opencode:open-cli` → genera `opencode attach http://localhost:4096/<sandboxId>`
- Tutti gli altri handler opencode

**Singletons condivisi:**
- Esportare `proxy` come singleton o passarlo via dependency injection

### 5. `electron/preload.ts` e `src/types.ts`

**Aggiornare `SandboxWindowApi`:**
```ts
opencode: {
  checkHealth(sandboxId: string): Promise<boolean>
  sendPrompt(sandboxId: string, sessionId: string, text: string): Promise<string>
  subscribeEvents(sandboxId: string): Promise<{ success: boolean } | { error: string }>
  unsubscribeEvents(sandboxId: string): Promise<{ success: boolean }>
  // ...tutti gli altri metodi: sandboxId al posto di port
}
```

### 6. Renderer — modifiche

| File | Modifica |
|---|---|
| `src/components/SandboxCreate.tsx` | Rimuovere stato `opencodePort` (default 4096) e campo input relativo |
| `src/components/SandboxDetail.tsx` | Mostrare `http://localhost:4096/<sandboxId>` come URL di connessione; passare `sandboxId` a `OpenCodePanel` invece di `port` |
| `src/components/SandboxList.tsx` | Mostrare `Proxy: localhost:4096/<sandboxId>` invece di `Port: xxx` |
| `src/components/OpenCodePanel.tsx` | Prop `port?: number` → `sandboxId: string` |
| `src/components/OpenCodeCLIButton.tsx` | Comando: `opencode attach http://localhost:4096/<sandboxId>` |
| `src/hooks/useOpenCode.ts` | Parametro `port: number` → `sandboxId: string`; tutte le chiamate IPC aggiornate |

### 7. `electron/api.ts` (named pipe) — comunicazione app esterne

Le app esterne comunicano con le sandbox in due passi:

1. **Named pipe** → ottengono l'URL proxy per una data sandbox
2. **HTTP diretto** → usano l'URL proxy per tutte le chiamate OpenCode

**Modifiche alle route:**

| Prima | Dopo |
|---|---|
| `GET /api/sandboxes/:id/opencode-port` → `{ opencodePort: 4096 }` | `GET /api/sandboxes/:id/proxy-url` → `{ proxyUrl: "http://localhost:4096/<sandboxId>" }` |

**Esempio flusso app esterna (Python):**
```python
# 1. Named pipe → ottieni URL proxy
client = IpcClient("paratoolz-arcypelabox")
response = await client.request("GET", "/api/sandboxes/abc-123/proxy-url")
proxy_url = response["body"]["proxyUrl"]
# → "http://localhost:4096/abc-123"

# 2. HTTP diretto → usa l'URL per chiamate OpenCode
health = requests.get(f"{proxy_url}/global/health")
sessions = requests.get(f"{proxy_url}/session/list")
```

**Accesso remoto (altra macchina):**
- Oggi: le porte sono su `127.0.0.1` → nessun accesso remoto
- Con proxy: basta cambiare il bind da `127.0.0.1` a `0.0.0.0` (singola porta)
- Molto più gestibile che esporre N porte

**Aggiornare documentazione in `docs/ipc-named-pipe.md` e `docs/api-client-docs/api-reference.md`**

### 8. Database

- Rimuovere colonna `opencode_port`:
  ```sql
  ALTER TABLE sandboxes DROP COLUMN opencode_port;
  ```
- Aggiornare funzioni CRUD in `electron/database.ts`
- Aggiornare schema in `initDatabase()`

## Backward compatibility

I sandbox **esistenti** (con port binding) continuano a funzionare:

1. Proxy registra ogni sandbox (anche quelli vecchi) con IP:port interno
2. UI punta sempre all'URL del proxy per tutti i sandbox
3. Vecchi port binding rimangono ma non sono più utilizzati dall'app (possono essere rimossi manualmente)
4. In fase di recovery (`tryRecoverSandboxRecord`), rimosso il fallback `opencodePort || 4096`
5. Route named pipe `/api/sandboxes/:id/opencode-port` continua a funzionare per vecchi client (deprecata) — restituisce sia `opencodePort` legacy che `proxyUrl`

## Gestione errori proxy

- Container non raggiungibile → 502 Bad Gateway (connessione TCP fallita)
- sandboxId non registrato → 404 Not Found
- Timeout connessione → 504 Gateway Timeout (default 30s)
- Destroy container → `unregister()` chiamato in `removeSandbox()` e `removeSandboxBySandboxId()`

Vantaggio: con un proxy centralizzato, possiamo aggiungere metriche, logging, rate limiting in futuro.

## Dettaglio `opencode attach` con proxy

Il comando `opencode attach` usa HTTP puro (REST + SSE), non WebSocket. Quindi:

```bash
# Oggi
opencode attach http://localhost:4096

# Con proxy
opencode attach http://localhost:4096/<sandboxId>
```

Il proxy:
1. Riceve la request su `http://localhost:4096/<sandboxId>/...`
2. Estrae `<sandboxId>`, cerca il container target
3. Forwarda al container IP:4096 con path riscritto (`/<sandboxId>/...` → `/...`)
4. La response (incluso SSE streaming) viene ripassata al client via `pipe()`

**Nessuna modifica al CLI OpenCode.** Funziona con qualsiasi versione.

## Stima effort

| Componente | Nuovo/Rifatto | Stima righe |
|---|---|---|
| `electron/proxy.ts` | Nuovo | ~80 righe |
| `electron/docker.ts` | Modificato | ~20 righe cambiate |
| `electron/opencode.ts` | Refactor | ~100 righe (principalmente firme funzioni) |
| `electron/main.ts` | Modificato | ~50 righe cambiate |
| `electron/preload.ts` + `src/types.ts` | Modificato | ~20 righe |
| Renderer components | Modificato | ~50 righe totali |
| `electron/api.ts` + docs | Modificato | ~30 righe |
| `electron/database.ts` | Modificato | ~15 righe |
| **Totale** | | **~365 righe** |

## Test / Verifica

1. `npm run typecheck` — nessun errore di tipo
2. Creare sandbox senza specificare porta
3. Verificare che `http://localhost:4096/<sandboxId>/global/health` risponda 200
4. Verificare SSE (`/event`) funzioni via proxy (eventi in tempo reale)
5. Verificare `opencode attach http://localhost:4096/<sandboxId>` funzioni (CLI)
6. Verificare sandbox esistenti ancora accessibili via proxy
7. Eliminare sandbox → proxy deregistra route
8. App esterna via named pipe → ottiene proxy URL → chiama sandbox

## Ordine di implementazione suggerito

1. `electron/proxy.ts` (nuovo file, autoportante)
2. `electron/docker.ts` (rimuovere port binding, registrare nel proxy)
3. `electron/opencode.ts` (refactor port → sandboxId)
4. `electron/main.ts` (integra proxy, aggiornare handler)
5. `electron/preload.ts` + `src/types.ts` (aggiornare API bridge)
6. Renderer components (port → sandboxId)
7. `electron/api.ts` (named pipe routes)
8. `electron/database.ts` (rimuovere colonna opencode_port)

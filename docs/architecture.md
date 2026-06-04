# Architecture

## High-Level Architecture

Arcypelabox is an Electron application composed of two processes:

- **Main process** (`electron/`): Node.js runtime responsible for Docker container lifecycle, the OpenCode SDK integration, a reverse proxy, a named pipe server, and local SQLite storage.
- **Renderer process** (`src/`): A React + Vite frontend that provides the graphical user interface.

The two processes communicate exclusively through Electron's `contextBridge` mechanism. The preload script (`electron/preload.ts`) exposes a `window.sandobox` API object to the renderer, which in turn invokes IPC handlers registered in the main process.

## Process Model

```
+------------------------------------------------------------------+
|                  Electron Main Process                           |
|  +-------------------------------------------------------------+ |
|  | IPC Handlers (main.ts)                                      | |
|  |  sandbox:create, sandbox:start, sandbox:stop,               | |
|  |  sandbox:remove, sandbox:logs, sandbox:info,                | |
|  |  sandbox:exec, sandbox:opencode:* (15+ handlers)            | |
|  |  sandbox:db:*, sandbox:shell:*, sandbox:generate            | |
|  +-------------------------------------------------------------+ |
|         |              |              |                          |
|  +------v------+ +-----v------+ +----v----------+                |
|  | docker.ts   | | opencode.ts| | proxy.ts      |                |
|  | (Dockerode  | | (@opencode | | (HTTP Proxy   |                |
|  |  API)       | |  SDK)      | |  on port 4096)|                |
|  +-------------+ +------------+ +---------------+                |
|  +-------------+ +------------+ +------------------+             |
|  | database.ts | | api.ts     | | ipc-server.ts    |             |
|  | (SQLite via | | (REST      | | (Named Pipe      |             |
|  | better-sql.)| |  routes)   | |  Server)         |             |
|  +-------------+ +------------+ +------------------+             |
+------------------------------------------------------------------+
         | contextBridge (preload.ts)
         v
+------------------------------------------------------------------+
|                  Renderer Process                                |
|  +-------------+ +--------------+ +------------------+           |
|  | App.tsx     | | SandboxCreate| | SandboxDetail    |           |
|  | (Router)    | | .tsx (Wizard)| | .tsx (Info/Logs/ |           |
|  |             | |              | |      Chat)       |           |
|  +-------------+ +--------------+ +------------------+           |
|  +-------------+ +--------------+ +------------------+           |
|  | SandboxList | | OpenCodePanel| | useOpenCode.ts   |           |
|  | .tsx        | | .tsx         | | (Polling Hook)   |           |
|  +-------------+ +--------------+ +------------------+           |
+------------------------------------------------------------------+
```

## Key Files and Their Roles

### `electron/main.ts` (723 lines)

The application entry point. Responsibilities:

- Creates the `BrowserWindow` (1280x820, `contextIsolation: true`, `nodeIntegration: false`).
- On app ready: initializes the database, starts the reverse proxy on port 4096, registers existing sandbox containers, starts the Docker watcher, and creates the window.
- Registers approximately 40 IPC handlers covering sandbox CRUD, OpenCode operations, database queries, shell commands, and Dockerfile/compose generation.
- Starts the named pipe server (`paratoolz-arcypelabox`).
- In development mode, loads from the Vite dev server; in production, loads `dist/index.html`.
- F12 toggles DevTools in development mode.
- On `before-quit`: cleans up SSE subscriptions, stops the Docker watcher, the proxy, and the IPC server.

### `electron/preload.ts` (87 lines)

The sole bridge between the renderer and main process. Exposes `window.sandobox` with approximately 30 methods covering:

- Sandbox CRUD (`createSandbox`, `startSandbox`, `stopSandbox`, `removeSandbox`, etc.)
- OpenCode chat, permissions, and session operations
- Database operations and settings
- Build progress events
- Event subscriptions via `onEvent`, `onState`, `onBuildProgress`

### `electron/docker.ts` (1186 lines)

Docker container management via the Dockerode library. Features:

- Resource limits: 2 CPU / 2 GB RAM for the main sandbox container, 1 CPU / 512 MB for sidecars.
- Functions: `createSandbox` (build image + create container + sidecars), `updateSandbox`, `start/stop/removeSandbox`, `listSandboxes`, `getSandboxLogs`, `getSandboxInfo`, `execInSandbox`, `buildGeneratedDockerfile`, `buildDockerCompose`, `registerExistingSandboxes`, `startDockerWatcher`, `validateMountPath`.
- Container labeling for identification (`sandobox.manager=true`) and group tracking (`sandobox.group` label).
- Mount path validation with symlink scanning.

### `electron/opencode.ts` (275 lines)

Integrates with the `@opencode-ai/sdk/v2` package (dynamically imported). All functions accept a `sandboxId` and use the reverse proxy URL as the base URL. Capabilities:

- `checkHealth`, `sendPrompt`, `sessionPromptAsync`
- `listProviders`, `create/delete/listSessions`
- `listPendingPermissions`, `replyPermission`
- `listPendingQuestions`, `replyQuestion`
- `getSessionMessages`, `getOpenCodeSessionDebug`, `getAvailableSessionId`
- `abortOpenCodeSession`, `subscribeToEvents` (SSE), `runShell`

### `electron/proxy.ts` (136 lines)

An HTTP reverse proxy (`SandboxProxy` class) listening on `127.0.0.1:4096`. Routes requests by the first URL path segment (the sandbox UUID) to the corresponding container's host and port. Supports HTTP upgrade for SSE streaming. Exposes a debug endpoint at `GET /__proxy/routes`. Singleton access via `setProxy()` / `getProxy()`.

### `electron/ipc-server.ts` (151 lines)

A named pipe server using `net.createServer()`. Paths:

- Windows: `//./pipe/paratoolz-arcypelabox`
- Unix: `/tmp/paratoolz-arcypelabox.sock`

Communicates using NDJSON (newline-delimited JSON). Supports parameterized routes (e.g., `/api/sandboxes/:id/info`).

### `electron/ipc-client.ts` (86 lines)

A named pipe client using `net.connect()`. Provides a `request()` method with a configurable 30-second timeout. Returns `{ status, body }`. Includes convenience methods: `get()`, `post()`, `put()`, `delete()`.

### `electron/api.ts` (212 lines)

Registers REST-style routes on the IPC server. Eleven endpoints cover ping, sandbox CRUD, start/stop, logs, info, status, exec, and lookup by mount path. Rejects `generatedDockerfile` and `customCommands` via the API for security. Maps Docker ENOENT errors to user-friendly messages.

### `electron/database.ts` (297 lines)

SQLite storage via `better-sqlite3` at `%APPDATA%/sandbox-manager/sandbox.db`. Tables: `sandboxes`, `chat_messages`, `settings`. Supports schema migration. Provider API keys are encrypted using Electron's `safeStorage` API before storage.

## Communication Flows

### Sandbox Creation

1. The user fills out the wizard in `SandboxCreate.tsx` and calls `window.sandobox.createSandbox(config)`.
2. The preload script forwards the call to the `sandbox:create` IPC handler in `main.ts`.
3. `main.ts` invokes `createSandbox()` in `docker.ts`.
4. `docker.ts` builds the Docker image, creates the sandbox container, and creates any sidecar containers (Postgres, Redis).
5. The container is registered with the reverse proxy.
6. The result is returned to the renderer, which navigates to the sandbox detail view.

### Chat Message

1. The user types a message in `OpenCodePanel.tsx` and calls `window.sandobox.opencode.sendPrompt(sandboxId, sessionId, text)`.
2. The preload script forwards the call to the `sandbox:opencode:prompt` IPC handler.
3. `main.ts` calls `sendPrompt()` in `opencode.ts`.
4. `opencode.ts` creates an SDK client using the proxy URL: `getProxy().getUrl(sandboxId)`.
5. The SDK sends the prompt to the OpenCode server running inside the sandbox container.
6. The response propagates back through the chain to the UI.

## Data Flow

```
+----------+     IPC      +-----------+    HTTP     +--------------+
| Renderer |<----------->| Main      |<---------->| Sandbox      |
| (React)  | contextBridge| Process   |  Proxy:4096| Container    |
|          |              |           |            | (OpenCode    |
|          |              |           |            |  Server)     |
+----------+              +-----------+            +--------------+
                                |
                          +-----v-----+
                          |  External |
                          |   Apps    |
                          | (Named    |
                          |  Pipe)    |
                          +-----------+
```

## Auto-Recovery

The `tryRecoverSandboxRecord()` function in `main.ts` handles the case where a Docker container exists but no corresponding database record is found. If a container is discovered during startup or polling that lacks a DB entry, a minimal recovery record is created. This is triggered when `getFullSandboxRecord()` returns `null`.

## SSE Event System

The `subscribeToEvents()` function in `opencode.ts` opens a Server-Sent Events (SSE) connection to the OpenCode server inside the sandbox container. Events are forwarded to the renderer via the `sandbox:opencode:event` IPC channel. State changes (sessions, permissions, questions) trigger batched updates with a 100 ms debounce. The connection automatically reconnects with exponential backoff (1 s minimum, 30 s maximum). Cleanup is handled via `AbortController`.

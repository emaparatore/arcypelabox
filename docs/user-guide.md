# User Guide — Arcypelabox

## 1. Interface Overview

![Sandbox detail view — Info tab](../imgs/screenshots/sandbox-info.png)

The application window is divided into three main areas:

**Header** — Displays the Arcypelabox logo. Clicking the logo navigates to the home view.

**Sidebar** (left) — Lists all sandboxes with a search filter, a refresh button, and a "New Sandbox" create button. The sidebar is collapsible and auto-compacts below 1200px viewport width.

Each sandbox card in the sidebar shows:
- Sandbox name
- Project mount path (folder name highlighted)
- Status badge: green for running, gray for exited, yellow for created

**Main Area** (right) — Shows one of three views depending on state:
- The create wizard when creating a new sandbox
- The detail view when a sandbox is selected
- An empty state when no sandbox is selected

The search filter matches by name, image, status, mount path, or sandbox ID. The list auto-refreshs every 5 seconds.

---

## 2. Sandbox Management

### Operations

| Operation | Description |
|-----------|-------------|
| Start | Starts the container and all sidecar containers |
| Stop | Stops the container and sidecars; all data is preserved |
| Delete | Permanently removes container, network, image, and sidecars |
| Edit | Recreates the sandbox from scratch with modified settings |
| Open Folder | Opens the project mount path in the file manager |
| Refresh | Refreshes the sandbox status and details |

### Container States

`created`, `running`, `exited`, `paused`, `restarting`, `removing`, `dead`

### Group Operations

Start, stop, and remove actions operate on the entire sandbox group: the main container, all sidecar containers (Postgres, Redis), and the shared Docker network. Individual container actions are not exposed — management is always at the group level.

---

## 3. OpenCode Chat

![OpenCode AI chat panel](../imgs/screenshots/opencode-panel.png)

The chat panel provides a terminal-like interface to the OpenCode AI agent running inside the sandbox.

- **Send messages** with Enter. Use Shift+Enter for a newline.
- **Message history** auto-scrolls to the latest message.
- **Connection indicator** (green or red dot) shows whether the client is connected to the OpenCode server.
- **Loading spinner** appears while the agent is processing a prompt.
- **"Show intermediate steps" toggle** — when enabled, displays tool calls, input/output, and file operations the agent performs.
- **Debug section** — a session debug panel showing current tool information and error messages.

### Connection States

- When the sandbox is running but not yet connected, the panel displays "Connecting to OpenCode server..."
- A busy session (already processing a prompt) blocks sending new messages.

The chat panel polls the OpenCode server state every 1.5 seconds.

---

## 4. Permissions & Questions

### Permissions

Pending permission requests appear in a yellow banner. Each request shows the permission name and associated patterns.

Three response options are available:

| Option | Description |
|--------|-------------|
| Allow Once | Grants permission for a single operation |
| Always Allow | Permanently approves the permission for the session |
| Reject | Denies the request |

### Questions

When the AI agent asks a question, an info banner appears with selectable options. Depending on the question, selection may be single-choice or multi-choice. Click "Submit Answer" to respond.

---

## 5. Sessions Panel

The sessions panel appears on the right side of the chat area.

- **Session list** with a search filter to find sessions by name.
- **Create new session** — provide an optional title, select a provider from the dropdown, then select a model from the provider-specific dropdown.
- **Select an existing session** to view its message history.
- **Delete session** with a confirmation prompt.
- **Refresh button** to reload the session list.
- **Abort button** to force-stop a stuck busy session.

### Active Session Info

- Displays the current model in use.
- "Open terminal" button runs `opencode attach` for the sandbox.

---

## 6. Detail View

The detail view has three tabs: Info, Logs, and Chat.

### Info Tab

**General**
- Name, Docker image, status, sandbox ID (UUID)
- SDK URL: `http://localhost:4096/{sandboxId}`
- Web URL for the OpenCode UI
- Created and updated timestamps

**Workspace**
- Mount path with an "open folder" button
- Git configuration
- Permissions

**Technology**
- Runtimes, tools, services, and providers configured for the sandbox

**Docker**
- Container ID
- Dockerfile (collapsible, with copy button)
- Generated docker-compose (display-only, with copy button)

**Status banner** — displayed when the sandbox is running.

**Action bar** — Start/Stop, CLI, Refresh, Edit, and Delete (with confirmation).

### Logs Tab

Displays the last 100 container log lines with timestamps. A Refresh button reloads the logs.

### Chat Tab

The OpenCode Panel is shown here. It is visible only when the sandbox is running.

---

## 7. Sidecars (Postgres / Redis)

Sidecars are separate containers running on the same Docker network as the main sandbox container. They share the `sandobox.group` label and are managed as part of the group lifecycle.

### Environment Variables

The following environment variables are injected into the main sandbox container for application-level connectivity:

**Postgres**
```
PGHOST=postgres
PGPORT=5432
PGUSER=sandbox
PGPASSWORD=sandbox
PGDATABASE=sandbox
```

**Redis**
```
REDIS_HOST=redis
REDIS_PORT=6379
```

The AI agent inside the sandbox connects to sidecars via Docker DNS hostnames (`postgres`, `redis`).

---

## 8. Reverse Proxy

A built-in HTTP reverse proxy runs on port `4096`.

**URL format:** `http://localhost:4096/{sandboxId}/...`

### Use Cases

- OpenCode SDK base URL
- Direct REST API access to the sandbox
- Web UI for OpenCode

### Features

- HTTP upgrade support for SSE streaming
- Debug endpoint: `GET /__proxy/routes` (returns registered routes)
- Error responses: 404 (route not found), 502 (sandbox unreachable)

---

## 9. Named Pipe API

Local inter-process communication is available via a named pipe (Windows) or Unix socket (Linux/macOS).

### Connection

| Platform | Path |
|----------|------|
| Windows | `//./pipe/paratoolz-arcypelabox` |
| Linux/macOS | `/tmp/paratoolz-arcypelabox.sock` |

### Protocol

NDJSON (newline-delimited JSON).

### Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/sandboxes` | List all sandboxes |
| GET | `/sandboxes/:id` | Get sandbox details |
| POST | `/sandboxes` | Create a new sandbox |
| DELETE | `/sandboxes/:id` | Delete a sandbox |
| POST | `/sandboxes/:id/start` | Start a sandbox |
| POST | `/sandboxes/:id/stop` | Stop a sandbox |
| GET | `/sandboxes/:id/logs` | Get sandbox logs |
| POST | `/sandboxes/:id/chat` | Send a chat message |
| GET | `/sandboxes/:id/sessions` | List sessions |
| POST | `/sandboxes/:id/sessions` | Create a session |
| GET | `/sandboxes/:id/sessions/:sessionId` | Get session messages |
| DELETE | `/sandboxes/:id/sessions/:sessionId` | Delete a session |

### Security

`generatedDockerfile` and `customCommands` fields are not accepted via the API. Dockerfile modifications must go through the UI wizard.

---

## 10. Quick Commands

**Terminal button** (`>_`) — opens `opencode attach` in a terminal for the selected sandbox, providing direct CLI access to the OpenCode agent.

**Open Folder** — opens the project mount path in the system file manager. Available from the detail view.

---

## 11. Feature Summary

| Feature | Description |
|---------|-------------|
| Sandbox Creation | 4-step wizard: base config, technology selection, workspace setup, review |
| Container Management | Start, stop, delete, and monitor Docker containers |
| Edit Sandbox | Recreate a sandbox with modified settings |
| Group Operations | Lifecycle commands apply to main container and sidecars |
| OpenCode Chat | Interactive AI agent chat with message history |
| Permissions System | Allow-once, always-allow, or deny granular permission requests |
| Question Handling | Multi-option question prompts with submit |
| Session Management | Multiple sessions per sandbox with provider/model selection |
| Reverse Proxy | HTTP proxy for SDK, REST, and web access on port 4096 |
| Named Pipe API | Local inter-process communication with 12 REST-like endpoints |
| Sidecar Containers | Automated Postgres and Redis containers with DNS discovery |
| Logs Viewer | Real-time container logs with timestamps |
| Auto-Refresh | Sandbox list refreshes every 5 seconds |
| Docker Watcher | Detects externally created/removed containers |
| Auto-Recovery | Creates minimal DB records for orphaned containers |
| Search & Filter | Filter sandboxes by name, image, status, mount path, or ID |
| Responsive Sidebar | Auto-collapses below 1200px |
| Terminal Access | One-click `opencode attach` from the UI |

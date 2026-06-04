# REST API Reference

Arcypelabox exposes a REST API over a local named pipe (Windows) or Unix socket (Linux/macOS). This API allows external tools and scripts to manage sandboxes programmatically.

## Connection

| Platform | Path |
|----------|------|
| Windows | `//./pipe/paratoolz-arcypelabox` |
| Linux / macOS | `/tmp/paratoolz-arcypelabox.sock` |

The API is available only when Arcypelabox is running.

## Protocol

The API uses newline-delimited JSON (NDJSON). Each message is a single JSON object on one line, terminated by `\n`.

### Request Format

```json
{"id":"<uuid>","method":"GET|POST|PUT|DELETE","path":"<path>","body":{...}}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Unique request identifier (echoed in response) |
| method | string | yes | HTTP-like method |
| path | string | yes | Endpoint path |
| body | object | no | Request payload |

### Response Format

```json
{"id":"<uuid>","status":200,"body":{...}}
```

| Field | Type | Description |
|-------|------|-------------|
| id | string | Same id as the request |
| status | number | HTTP-like status code |
| body | any | Response payload |

## Endpoints

### GET /api/ping -- Health check

**Response:** `{"pong": true}`

---

### GET /api/sandboxes -- List all sandboxes

**Response:** Array of sandbox objects with the following fields:

| Field | Type | Description |
|-------|------|-------------|
| id | string | Internal UUID |
| sandboxId | string | Public sandbox identifier |
| name | string | Sandbox name |
| image | string | Docker image name |
| status | string | Container status |
| projectMount | string | Host path mounted to /workspace |
| createdAt | string | ISO timestamp |
| proxyUrl | string | Reverse proxy URL |

---

### POST /api/sandboxes -- Create a new sandbox

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | yes | Sandbox name (regex: `^[a-z0-9][a-z0-9_.-]*$`, max 64 chars) |
| projectMount | string | yes | Host path to mount as /workspace |
| runtimes | string[] | no | Selected runtimes |
| tools | string[] | no | Selected tools |
| services | string[] | no | Selected sidecar services |
| permissions | object | no | Permission configuration |
| providers | object[] | no | LLM provider configuration |
| gitConfig | object | no | Git configuration |

**Security restrictions:**

- `generatedDockerfile` is NOT accepted via the API (rejected for security)
- `customCommands` is NOT accepted via the API (rejected for security)
- `image` is auto-generated from the sandbox name

**Response 201:**

```json
{
  "sandboxId": "uuid",
  "containerId": "docker-container-id"
}
```

**Errors:**

| Status | Condition |
|--------|-----------|
| 400 | Validation failure (invalid name, missing required fields, rejected fields) |
| 409 | Sandbox name already exists |

---

### POST /api/sandboxes/start -- Start a sandbox

**Request body:** `{ "id": "sandbox-uuid" }`

**Response:** `{ "success": true }`

---

### POST /api/sandboxes/stop -- Stop a sandbox

**Request body:** `{ "id": "sandbox-uuid" }`

**Response:** `{ "success": true }`

---

### DELETE /api/sandboxes -- Remove a sandbox

**Request body:** `{ "id": "sandbox-uuid" }`

**Response:** `{ "success": true }`

---

### GET /api/sandboxes/logs -- Get sandbox logs

**Request body:** `{ "id": "sandbox-uuid" }`

**Response:** Array of log entries:

```json
[
  { "time": "2024-01-01T00:00:00Z", "message": "Container started" }
]
```

---

### GET /api/sandboxes/:id/info -- Get sandbox info

**URL parameter:** `id` = sandbox UUID

**Response:** Full sandbox info object (same structure as list items, with additional details).

---

### GET /api/sandboxes/:id/status -- Get sandbox status

**Response:** `{ "status": "running" | "exited" | "created" | "paused" | "restarting" | "removing" | "dead" }`

---

### POST /api/sandboxes/exec -- Execute command in sandbox

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Sandbox UUID |
| command | string | yes | Shell command to execute |

**Response:** Command output as a string.

---

### GET /api/sandboxes/by-mount -- Find sandboxes by project mount

**Request body:** `{ "mountPath": "string" }`

**Response:** Array of sandbox objects:

```json
[
  { "id": "uuid", "name": "sandbox-name", "proxyUrl": "..." }
]
```

## Error Codes

| Status | When |
|--------|------|
| 400 | Invalid request body or missing required field |
| 404 | Endpoint not found or sandbox not found |
| 409 | Sandbox name already exists (POST /api/sandboxes) |
| 500 | Internal error or Docker unavailable |

Error body format: `{"error": "<message>"}`

## Examples

### PowerShell (Windows)

```powershell
$req = @{
  id     = [guid]::NewGuid().ToString()
  method = "GET"
  path   = "/api/ping"
  body   = $null
}
$json = $req | ConvertTo-Json -Compress
$pipe = "//./pipe/paratoolz-arcypelabox"
```

### Python (cross-platform)

```python
import json, uuid, socket, sys

def request(method, path, body=None):
    if sys.platform == "win32":
        import win32pipe, win32file
        handle = win32file.CreateFile(
            r"\\.\pipe\paratoolz-arcypelabox",
            win32file.GENERIC_READ | win32file.GENERIC_WRITE,
            0, None, win32file.OPEN_EXISTING, 0, None
        )
        req = json.dumps({"id": str(uuid.uuid4()), "method": method, "path": path, "body": body})
        win32file.WriteFile(handle, (req + "\n").encode())
        data, _ = win32file.ReadFile(handle, 65536)
        win32file.CloseHandle(handle)
    else:
        sock = socket.socket(socket.AF_UNIX)
        sock.connect("/tmp/paratoolz-arcypelabox.sock")
        req = json.dumps({"id": str(uuid.uuid4()), "method": method, "path": path, "body": body})
        sock.sendall((req + "\n").encode())
        data = sock.recv(65536)
        sock.close()
    return json.loads(data)

# Health check
resp = request("GET", "/api/ping")
print(resp)  # {"status": 200, "body": {"pong": true}}
```

### TypeScript (Node.js)

The built-in `ipc-client.ts` wraps the protocol. Reference implementation:

```typescript
import { createIpcClient } from "./ipc-client"

const client = createIpcClient("paratoolz-arcypelabox")

// List all sandboxes
const { status, body } = await client.get("/api/sandboxes")

// Create a sandbox
const { status, body } = await client.post("/api/sandboxes", {
  name: "my-sandbox",
  projectMount: "/path/to/project",
  runtimes: ["node", "python"],
  tools: ["git", "curl"],
})
```

## Typical Flow for External Applications

1. Find sandbox by mount path -- `GET /api/sandboxes/by-mount`
2. Check status -- `GET /api/sandboxes/:id/status`
3. Start if not running -- `POST /api/sandboxes/start`
4. Connect to OpenCode via proxy URL -- `http://127.0.0.1:4096/{sandboxId}`

## Implementation Details

| Component | File | Description |
|-----------|------|-------------|
| Server | `electron/ipc-server.ts` | `net.createServer()` on named pipe / Unix socket |
| Client | `electron/ipc-client.ts` | `net.connect()` to named pipe / Unix socket |
| Routes | `electron/api.ts` | Route registration via `registerRoutes()` |

**Timeout:** 30 seconds by default on the client, configurable.

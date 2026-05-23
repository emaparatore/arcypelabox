# Arcypelabox — API Reference

Arcypelabox espone un server **REST-like** su un named pipe (Windows) o Unix socket (Linux/macOS) per permettere ad applicazioni locali di gestire sandbox Docker e ottenere metadata per connettersi al server OpenCode all'interno di una sandbox.

## Connessione

| Piattaforma | Path |
|---|---|
| Windows | `//./pipe/paratoolz-arcypelabox` |
| Linux / macOS | `/tmp/paratoolz-arcypelabox.sock` |

Il server è disponibile solo quando Arcypelabox è in esecuzione.

## Protocollo

Il protocollo è **newline-delimited JSON** (NDJSON). Ogni messaggio è un oggetto JSON su una riga terminata da `\n`.

### Richiesta

```json
{"id":"<uuid>","method":"GET|POST|PUT|DELETE","path":"<path>","body":{...}}
```

| Campo | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `id` | string | sì | Identificativo univoco della richiesta (la risposta userà lo stesso `id`) |
| `method` | string | sì | Metodo HTTP-like |
| `path` | string | sì | Path dell'endpoint |
| `body` | object | no | Payload della richiesta |

### Risposta

```json
{"id":"<uuid>","status":200,"body":{...}}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `id` | string | Stesso `id` della richiesta |
| `status` | number | Codice HTTP-like |
| `body` | any | Payload della risposta |

## Endpoint

### Health check

```
GET /api/ping
```

**Richiesta:** body non richiesto.

**Risposta:**
```json
{"status":200,"body":{"pong":true}}
```

---

### Lista sandbox

```
GET /api/sandboxes
```

**Richiesta:** body non richiesto.

**Risposta:**
```json
{"status":200,"body":[
  {
    "id": "abc123...",
    "sandboxId": "99168509-...",
    "name": "my-sandbox",
    "image": "node:20",
    "opencodePort": 4096,
    "status": "running",
    "projectMount": "C:\\progetti\\mio-progetto",
    "createdAt": "1700000000"
  }
]}
```

---

### Info sandbox

```
GET /api/sandboxes/:id/info
```

**Richiesta:** body non richiesto. `:id` è il sandbox UUID.

**Risposta:**
```json
{"status":200,"body":{
  "id": "abc123...",
  "sandboxId": "99168509-...",
  "name": "my-sandbox",
  "image": "node:20",
  "opencodePort": 4096,
  "status": "running",
  "projectMount": "C:\\progetti\\mio-progetto",
  "createdAt": "1700000000"
}}
```

---

### Stato sandbox

```
GET /api/sandboxes/:id/status
```

**Richiesta:** body non richiesto. `:id` è il sandbox UUID.

**Risposta:**
```json
{"status":200,"body":{"status":"running"}}
```

I valori possibili di `status` sono quelli di Docker: `running`, `exited`, `paused`, `created`, `restarting`, `removing`, `dead`.

---

### Porta OpenCode

```
GET /api/sandboxes/:id/opencode-port
```

**Richiesta:** body non richiesto. `:id` è il sandbox UUID.

**Risposta:**
```json
{"status":200,"body":{"opencodePort":4096}}
```

---

### Log sandbox

```
GET /api/sandboxes/logs
```

**Richiesta:**
```json
{"id":"<uuid>","method":"GET","path":"/api/sandboxes/logs","body":{"id":"<sandbox-uuid>"}}
```

**Risposta:**
```json
{"status":200,"body":[
  {"time":"2024-01-01T00:00:00","message":"Server started"},
  {"time":"2024-01-01T00:00:01","message":"Listening on port 4096"}
]}
```

---


### Esegui comando

```
POST /api/sandboxes/exec
```

**Richiesta:**
```json
{"id":"<uuid>","method":"POST","path":"/api/sandboxes/exec","body":{"id":"<sandbox-uuid>","command":"ls -la"}}
```

**Risposta:**
```json
{"status":200,"body":"total 32\ndrwxr-xr-x ..."}
```

---

### Crea sandbox

```
POST /api/sandboxes
```

**Richiesta:**
```json
{"id":"<uuid>","method":"POST","path":"/api/sandboxes","body":{
  "name": "my-sandbox",
  "image": "node:20",
  "opencodePort": 4096,
  "projectMount": "C:\\progetti\\mio-progetto",
  "runtimes": ["node","python"],
  "tools": ["git","curl"],
  "services": ["postgres"],
  "permissions": {"read":"allow","write":"ask"},
  "providers": [
    {"id":"anthropic","apiKey":"sk-ant-..."},
    {"id":"openai","apiKey":"sk-proj-..."}
  ]
}}
```

| Campo | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `name` | string | sì | Nome della sandbox |
| `image` | string | sì | Tag immagine Docker base |
| `opencodePort` | number | sì | Porta OpenCode |
| `projectMount` | string | **sì** | Path assoluto del progetto da montare in `/workspace` |
| `runtimes` | string[] | no | Runtime da installare (`node`, `python`, `go`, `java`, `ruby`, `php`, `rust`, `dotnet`, `zig`) |
| `tools` | string[] | no | Tool da installare (`git`, `curl`, `vim`, `jq`, `gh`, `pnpm`, `bun`, ...) |
| `services` | string[] | no | Servizi sidecar (`postgres`, `redis`) |
| `permissions` | object | no | Permessi OpenCode (`{"read":"allow","write":"ask","shell":"deny"}`) |
| `providers` | object[] | no | Provider AI con API key |
| `gitConfig` | object | no | Config git (`{userName, userEmail, autocrlf}`) |

> `generatedDockerfile` e `customCommands` **non sono accettati** via API per ragioni di sicurezza. Il Dockerfile viene generato automaticamente da `runtimes`, `tools` e `services`.

**Risposta:**
```json
{"status":201,"body":{"sandboxId":"99168509-...","containerId":"abc123..."}}
```

---

### Avvia sandbox

```
POST /api/sandboxes/start
```

**Richiesta:**
```json
{"id":"<uuid>","method":"POST","path":"/api/sandboxes/start","body":{"id":"<sandbox-uuid>"}}
```

**Risposta:**
```json
{"status":200,"body":{"success":true}}
```

---

### Ferma sandbox

```
POST /api/sandboxes/stop
```

**Richiesta:**
```json
{"id":"<uuid>","method":"POST","path":"/api/sandboxes/stop","body":{"id":"<sandbox-uuid>"}}
```

**Risposta:**
```json
{"status":200,"body":{"success":true}}
```

---

### Rimuovi sandbox

```
DELETE /api/sandboxes
```

**Richiesta:**
```json
{"id":"<uuid>","method":"DELETE","path":"/api/sandboxes","body":{"id":"<sandbox-uuid>"}}
```

**Risposta:**
```json
{"status":200,"body":{"success":true}}
```

---

### Trova sandbox per mount

```
GET /api/sandboxes/by-mount
```

**Richiesta:**
```json
{"id":"<uuid>","method":"GET","path":"/api/sandboxes/by-mount","body":{"mountPath":"C:\\progetti\\mio-progetto"}}
```

**Risposta:**
```json
{"status":200,"body":[
  {"id":"99168509-...","name":"my-sandbox"}
]}
```

---

## Errori

Tutti gli errori restituiscono un body con campo `error`:

```json
{"id":"<uuid>","status":<code>,"body":{"error":"<messaggio>"}}
```

| Status | Quando |
|---|---|
| `400` | Body richiesta invalido o campo obbligatorio mancante |
| `404` | Sandbox o endpoint non trovato |
| `500` | Errore interno (es. Docker Engine non disponibile) |

## Esempi

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

# Scrive la richiesta sulla named pipe e legge la risposta
$response = $json | Set-Content -Path $pipe -NoNewline
# (la lettura richiede un client più complesso - si consiglia di usare un linguaggio di programmazione)
```

### Python (con `pywin32` su Windows o socket su Unix)

```python
import json, uuid, socket

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

# Ottieni stato e porta
resp = request("GET", "/api/sandboxes/{id}/status")
print(resp["body"]["status"])

resp = request("GET", "/api/sandboxes/{id}/opencode-port")
port = resp["body"]["opencodePort"]
```

Poi usa `http://localhost:{port}` per parlare direttamente con OpenCode.

---

## Flusso tipico per un'app esterna

1. **Trova la sandbox** → `GET /api/sandboxes/by-mount`
2. **Leggi la porta** → `GET /api/sandboxes/:id/opencode-port`
3. **Connettiti a OpenCode** → `http://localhost:<port>` con l'SDK OpenCode o HTTP diretto

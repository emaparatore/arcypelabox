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
    "status": "running",
    "projectMount": "C:\\progetti\\mio-progetto",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "proxyUrl": "http://127.0.0.1:4096/99168509-..."
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
  "status": "running",
    "projectMount": "C:\\progetti\\mio-progetto",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "proxyUrl": "http://127.0.0.1:4096/99168509-..."
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
| `name` | string | sì | Nome della sandbox. Deve iniziare con lettera/numero e contenere solo `a-z`, `0-9`, `-`, `_`, `.`. Max 64 caratteri. Deve essere univoco. |

| `projectMount` | string | **sì** | Path assoluto del progetto da montare in `/workspace` |
| `runtimes` | string[] | no | Runtime da installare (`node`, `python`, `go`, `java`, `ruby`, `php`, `rust`, `dotnet`, `zig`) |
| `tools` | string[] | no | Tool da installare (`git`, `curl`, `vim`, `jq`, `gh`, `pnpm`, `bun`, ...) |
| `services` | string[] | no | Servizi sidecar (`postgres`, `redis`) |
| `permissions` | object | no | Permessi OpenCode (`{"read":"allow","write":"ask","shell":"deny"}`) |
| `providers` | object[] | no | Provider AI con API key |
| `gitConfig` | object | no | Config git (`{userName, userEmail, autocrlf}`) |

> `generatedDockerfile` e `customCommands` **non sono accettati** via API per ragioni di sicurezza. Il Dockerfile viene generato automaticamente da `runtimes`, `tools` e `services`.
> Il nome viene validato con la stessa regex dell'interfaccia utente: `^[a-z0-9][a-z0-9_.-]*$`. Se il nome esiste già, la API risponde con `409 Conflict`.

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
  {"id":"99168509-...","name":"my-sandbox","proxyUrl":"http://127.0.0.1:4096/99168509-..."}
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
| `409` | Nome sandbox già esistente (solo su `POST /api/sandboxes`) |
| `404` | Endpoint non trovato |
| `500` | Sandbox non trovata o errore interno (es. Docker Engine non disponibile) |

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

# Ottieni stato
resp = request("GET", "/api/sandboxes/{id}/status")
print(resp["body"]["status"])

# Ottieni info sandbox (include proxyUrl)
resp = request("GET", "/api/sandboxes/{id}/info")
proxyUrl = resp["body"]["proxyUrl"]
```

Poi usa `proxyUrl` (es. `http://127.0.0.1:4096/{sandboxId}`) per parlare con OpenCode tramite il reverse proxy integrato.

---

## Flusso tipico per un'app esterna

1. **Trova la sandbox** → `GET /api/sandboxes/by-mount` restituisce un array di `{ id, name, proxyUrl }` (una sandbox per progetto, ma possono essercene più d'una). Prendi l'entry che ti interessa.
2. **Verifica che sia running** → `GET /api/sandboxes/:id/status` restituisce `{ status }`. Se non è `"running"`, puoi usare `POST /api/sandboxes/start`.
3. **Connettiti a OpenCode** → usa `proxyUrl` (es. `http://127.0.0.1:4096/<sandboxId>`) come base URL per raggiungere l'API HTTP del server OpenCode in esecuzione dentro la sandbox. Puoi usare l'SDK ufficiale di OpenCode oppure chiamare direttamente le sue API REST — entrambi passano attraverso il proxy che inoltra alla sandbox.

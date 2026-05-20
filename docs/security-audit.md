# Security Audit — Sandobox Manager

> **Data:** 2026-05-20
> **Versione app:** 1.0.0
> **Tipo:** Analisi statica del codice sorgente

---

## Indice

- [Riepilogo](#riepilogo)
- [Critiche](#critiche)
- [Alte](#alte)
- [Medie](#medie)
- [Basse](#basse)
- [Docker e Build](#docker-e-build)
- [Azioni prioritarie](#azioni-prioritarie)

---

## Riepilogo

| Severità | Totale | Risolti | Accettati | Aperti |
|----------|--------|---------|-----------|--------|
| 🔴 Critica | 5 | 4 | 1 | 0 |
| 🟠 Alta | 7 | 2 | 1 | 4 |
| 🟡 Media | 7 | 0 | 0 | 7 |
| 🔵 Bassa | 4 | 0 | 0 | 4 |
| **Totale** | **23** | **5** | **2** | **16** |

---

## 🔴 Critiche

### C-1 — Iniezione Dockerfile arbitrario via named pipe

| Campo | Valore |
|-------|--------|
| **File** | `electron/api.ts:55-79`, `electron/ipc-server.ts:31-112` |
| **Categoria** | Input validation, Injection |
| **Stato** | ✅ **Risolto** — vedi fix applicati sotto |

La named pipe `//./pipe/paratoolz-arcypelabox` non richiedeva **alcuna autenticazione**. Qualsiasi processo locale poteva connettervisi e inviare un `generatedDockerfile` arbitrario. Il server lo passava direttamente a `createSandbox()` senza sanitizzazione.

**Impatto:** Creazione di container malevoli (rootkit, reverse shell, backdoor SSH, mount del socket Docker).

**Fix applicati:**
- ✅ `generatedDockerfile` rimosso dall'API della named pipe: il server genera sempre il Dockerfile dai parametri strutturati (`runtimes`, `tools`, `services`)
- ✅ Non è stata aggiunta autenticazione al pipe: essendo locale, un attaccante parlerebbe direttamente col socket Docker (che non ha auth) invece che col nostro named pipe — la vera protezione è rimuovere operazioni pericolose dall'API

---

### C-2 — Container escape via bind mount arbitrario

| Campo | Valore |
|-------|--------|
| **File** | `electron/docker.ts:87-91`, `src/components/SandboxCreate.tsx:130-133` |
| **Categoria** | Path traversal, Privilege escalation |
| **Stato** | ✅ **Risolto** |

Il campo `projectMount` era montato direttamente come bind mount in `/workspace` con **zero validazioni**. Solo controllo `non vuoto` in UI.

**Impatto:** Montando `/` → intero filesystem host accessibile. Montando `/var/run/docker.sock` → controllo completo del Docker daemon dal container. Combinato con C-3, è **compromissione totale dell'host**.

**Fix applicati:**
- ✅ Whitelist su home directory (`os.homedir()`) — nessun path fuori da `C:\Users\<user>` o `/home/<user>` è accettato
- ✅ Symlink resolution (`fs.realpathSync()`) — impedisce traversal via `../../`
- ✅ Scansione ricorsiva della directory: i symlink sono permessi se puntano **dentro** il progetto, bloccati se puntano **fuori**
- ✅ La scansione **recurse** nei symlink pointing dentro il progetto per scoprire catene di link (A -> B -> /etc)
- ✅ `visited.set` per evitare cicli e scansioni duplicate

---

### C-3 — Esecuzione comandi arbitrari nei container

| Campo | Valore |
|-------|--------|
| **File** | `electron/docker.ts:194-210`, `electron/main.ts:160-166`, `electron/api.ts:137-147` |
| **Categoria** | Command injection |
| **Stato** | ⏹️ **Non risolto (accettato)** |

`execInSandbox` passa il comando utente a `sh -c` dentro il container. Il comando arriva da IPC (`sandobox:exec`) o dalla named pipe (`POST /api/sandboxes/exec`).

**Nota:** Questo equivale funzionalmente a `docker exec`. Il container è già isolato da Docker, C-2 è risolto (niente bind mount pericolosi), e l'agente OpenCode deve poter eseguire comandi shell per funzionare. Chi ha accesso alla named pipe può già parlare direttamente con `//./pipe/docker_engine`. L'endpoint exec opera solo dentro sandbox già create, che sono isolate.

---

### C-4 — Provider API key esposta al renderer

| Campo | Valore |
|-------|--------|
| **File** | `electron/main.ts:241-242`, `electron/preload.ts:33` |
| **Categoria** | Secret exposure |
| **Stato** | ✅ **Risolto** |

L'handler IPC `sandobox:db:sandbox:getById` decifrava e restituiva la provider API key al renderer.

**Fix applicati:**
- ✅ `providerApiKey` rimosso dal record di ritorno di `sandobox:db:sandbox:getById`
- ✅ Anche `provider_api_key_enc` (blob cifrato) rimosso dal record
- ✅ `getDecryptedApiKey` non è più importata/usata in `main.ts`
- Nota: l'endpoint non era mai chiamato dal renderer, ma ora è protetto anche per il futuro

---

### C-5 — OpenCode server esposto a rete esterna

| Campo | Valore |
|-------|--------|
| **File** | `electron/docker.ts:83-86,111` |
| **Categoria** | Network exposure |
| **Stato** | ✅ **Risolto** |

La porta dell'OpenCode server era esposta su **tutte le interfacce host** (`0.0.0.0`) tramite Docker port binding. Il server stesso bindava a `0.0.0.0`.

**Fix applicati:**
- ✅ `HostIp: "127.0.0.1"` aggiunto al port binding Docker — limita l'accesso a localhost sull'host
- ✅ `--hostname 0.0.0.0` tenuto dentro il container (Docker forwarding richiede che il processo ascolti su tutte le interfacce del container, non solo loopback)

---

## 🟠 Alte

### H-1 — Named pipe senza autenticazione

| Campo | Valore |
|-------|--------|
| **File** | `electron/ipc-server.ts:31-112`, `electron/main.ts:47` |
| **Categoria** | Authentication |
| **Stato** | ⏹️ **Non risolto (accettato)** |

`net.createServer` su named pipe accetta **qualsiasi connessione locale**. Tutte le route (`POST /api/sandboxes`, `POST /api/sandboxes/exec`, `DELETE /api/sandboxes`, ecc.) sono invocabili senza autenticazione.

**Impatto:** Su sistemi multi-utente, chiunque può creare/distruggere container ed eseguire comandi.

**Nota:** Si è scelto di non aggiungere autenticazione perché un attaccante locale parlerebbe direttamente col socket Docker (`//./pipe/docker_engine`) che non ha auth. La vera protezione è rimuovere operazioni pericolose dall'API (vedi C-1).

---

### H-2 — API key in variabile d'ambiente del container

| Campo | Valore |
|-------|--------|
| **File** | `electron/docker.ts:93-106` |
| **Categoria** | Secret exposure |
| **Stato** | ✅ **Risolto** |

La provider API key era passata come `OPENCODE_PROVIDER_API_KEY` e dentro `OPENCODE_CONFIG` (JSON completo) nelle env del container Docker.

**Fix applicati:**
- ✅ `OPENCODE_PROVIDER_API_KEY` rimosso dalle env var del container
- ✅ `providerApiKey` non è più incluso nel JSON di `OPENCODE_CONFIG` — `buildOpenCodeConfig()` non embedda più la chiave
- ✅ Dopo `container.start()`, il main process chiama `PUT /auth/:providerId` sull'OpenCode server tramite `127.0.0.1:<port>` — OpenCode salva la chiave nel suo auth store (`~/.local/share/opencode/auth.json`)
- ✅ La chiave non è mai in env var, né in chiaro nel config JSON, né in layer Docker
- ✅ Se l'auth injection fallisce, non blocca la creazione della sandbox (log di warning)
- ✅ La chiave rimane cifrata nel DB (`safeStorage`) per ricreazione futuro

---

### H-3 — Nome container non sanitizzato

| Campo | Valore |
|-------|--------|
| **File** | `electron/docker.ts:70,278` |
| **Categoria** | Input validation |
| **Stato** | ✅ **Risolto** |

`config.name` era usato direttamente come Docker container name. Solo `createGroupName` lo sanitizzava (per label Docker e network), ma il nome container no.

**Impatto:** Collisioni di nome, stati incoerenti, potenziale social engineering.

**Fix applicati:**
- ✅ Creata `sanitizeContainerName()` che applica la stessa regex di `createGroupName` (`/^[a-z0-9][a-z0-9_.-]*$/`)
- ✅ Validazione lunghezza massima (64 caratteri) con errore esplicito
- ✅ Rifiuto caratteri speciali e nomi vuoti dopo sanitizzazione
- ✅ Applicata a `docker createContainer` (nome principale) e container servizio (Postgres/Redis)
- ✅ Validazione lato client in `SandboxCreate.tsx` per feedback immediato

---

### H-4 — SSRF via parametro port

| Campo | Valore |
|-------|--------|
| **File** | `electron/opencode.ts:47,91,166-168,189-213` |
| **Categoria** | SSRF |

Il parametro `port` (user-controllabile) è usato per costruire URL `http://localhost:${port}`. Nessuna validazione che la porta sia nel range consentito.

**Impatto:** Port scanning di localhost, accesso ad altri servizi locali.

**Fix:**
- Validare porta nel range 1024-65535
- Sanitizzare a intero prima dell'uso
- Usare Docker networking diretto invece di port binding

---

### H-5 — Download script senza verifica integrità

| Campo | Valore |
|-------|--------|
| **File** | `electron/docker.ts:418-421,431-433` |
| **Categoria** | Supply chain |

Gli script per dotnet e bun sono scaricati con `curl | bash` da URL HTTPS, ma **senza verifica SHA256**.

**Impatto:** Se i server di download sono compromessi, l'intera catena di build è compromessa.

**Fix:**
- Aggiungere verifica hash SHA256 dopo il download
- Usare repository ufficiali (apt) invece di `curl | bash`
- Validare che gli elementi di `tools` siano tra valori consentiti

---

### H-6 — OpenCode server esegue come root

| Campo | Valore |
|-------|--------|
| **File** | `electron/docker.ts:402`, `docker/Dockerfile.sandbox:1` |
| **Categoria** | Privilege escalation |

L'immagine parte da `node:20-bookworm-slim` che esegue di default come **root**. L'OpenCode server e tutti i comandi dell'agente AI girano come root.

**Impatto:** Massimizzazione del blast radius — se l'agente AI o un attacco sfrutta una vulnerabilità di container escape, ha accesso root.

**Fix:**
- Creare utente non-root nel Dockerfile
- Usare `USER` prima di eseguire l'OpenCode server
- Applicare `--cap-drop=ALL`

---

### H-7 — Polling eccessivo

| Campo | Valore |
|-------|--------|
| **File** | `src/hooks/useOpenCode.ts:46-56`, `src/components/OpenCodePanel.tsx:46-56` |
| **Categoria** | Denial of Service |

Ogni 1.5 secondi il renderer fa 4 chiamate IPC → HTTP all'OpenCode server. Con più sandbox aperte, il traffico si moltiplica.

**Impatto:** DoS accidentale, CPU elevata, traffico di rete eccessivo.

**Fix:**
- Aumentare intervallo a 5-10 secondi
- Usare event-driven (WebSocket) invece di polling
- Debounce delle richieste

---

## 🟡 Medie

### M-1 — Nessun Content-Security-Policy

| Campo | Valore |
|-------|--------|
| **File** | `electron/main.ts:60-70` |
| **Categoria** | XSS mitigation |

Il `BrowserWindow` è creato senza header CSP.

**Impatto:** Se un XSS viene introdotto (via Vite dev server o dipendenza npm compromessa), l'attaccante ha accesso illimitato a `window.sandobox.*` (controllo container, chiavi API).

**Fix:**
- Aggiungere CSP via `session.defaultSession.webRequest.onHeadersReceived`
- Restringere script-src, disabilitare inline script, limitare connect-src

---

### M-2 — Database SQLite in chiaro

| Campo | Valore |
|-------|--------|
| **File** | `electron/database.ts:9-14,73-103` |
| **Categoria** | Data at rest |

Solo la API key è cifrata. Tutte le altre configurazioni (provider ID, model ID, Dockerfile, permessi) sono in chiaro. DB in `%APPDATA%/sandobox-manager/sandobox.db`.

**Impatto:** Qualsiasi processo con accesso al filesystem può leggere le configurazioni complete delle sandbox.

**Fix:**
- Cifrare campi sensibili aggiuntivi
- Usare SQLCipher
- Impostare permessi restrittivi sul file DB

---

### M-3 — Credenziali Postgres hardcoded

| Campo | Valore |
|-------|--------|
| **File** | `electron/docker.ts:98-102,297-300` |
| **Categoria** | Weak credentials |

```ts
POSTGRES_USER=sandbox
POSTGRES_PASSWORD=sandbox
POSTGRES_DB=sandbox
```
Redis senza autenticazione.

**Impatto:** Chiunque abbia accesso alla rete del container può accedere al database con credenziali ovvie.

**Fix:**
- Generare password casuali per sandbox
- Usare Docker secrets
- Documentare che sono credenziali interne di sviluppo

---

### M-4 — Sessioni OpenCode mai chiuse

| Campo | Valore |
|-------|--------|
| **File** | `electron/opencode.ts:245-269` |
| **Categoria** | Resource leak |

`getAvailableSessionId` crea nuove sessioni quando nessuna è idle, ma **non le chiude mai**.

**Impatto:** Le sessioni si accumulano consumando memoria e risorse del server OpenCode.

**Fix:**
- Implementare riciclo sessioni (chiudere dopo timeout)
- Impostare numero massimo di sessioni
- Pulire sessioni su sandbox stop/remove

---

### M-5 — Nessuna validazione lunghezza nome

| Campo | Valore |
|-------|--------|
| **File** | `electron/docker.ts:70,263-265` |
| **Categoria** | Input validation |

Nessun limite a lunghezza o caratteri su `config.name`. Docker ha limiti interni ma nomi molto lunghi o con Unicode possono causare errori.

**Impatto:** Resource exhaustion, stati inconsistenti.

**Fix:**
- Applicare stessa sanitizzazione di `createGroupName`
- Limite massimo 64 caratteri

---

### M-6 — Unhandled errors in IPC handler

| Campo | Valore |
|-------|--------|
| **File** | `electron/main.ts:168-170,232-234,328-330` |
| **Categoria** | Information leak |

Alcuni handler IPC mancano di try-catch, potenzialmente esponendo stack trace e stato interno.

**Impatto:** Leak di informazioni (percorsi file, errori Docker, stack trace) al renderer.

**Fix:**
- Wrappare tutti gli handler in try-catch
- Restituire risposte di errore strutturate

---

### M-7 — Named pipe / socket aperto

| Campo | Valore |
|-------|--------|
| **File** | `electron/ipc-server.ts` |
| **Categoria** | Access control |

Su Unix il socket è in `/tmp/` (world-readable/writable per default). Su Windows il named pipe ha permessi di default.

**Impatto:** Su sistemi multi-utente, altri utenti possono accedere al pipe.

**Fix:**
- `chmod 600` sul socket Unix
- Impostare DACL sul named pipe Windows
- Documentare il modello di sicurezza

---

## 🔵 Basse

### L-1 — Intervalli polling hardcoded

| Campo | Valore |
|-------|--------|
| **File** | `src/components/OpenCodePanel.tsx:53` (`useOpenCode.ts`), `src/App.tsx:40` |
| **Categoria** | Configurability |

Intervalli non configurabili: 1.5s per OpenCode, 5s per sandbox list.

**Fix:** Rendere configurabili o adattivi.

---

### L-2 — Nessun timeout su chiamate Docker API

| Campo | Valore |
|-------|--------|
| **File** | `electron/docker.ts` (throughout) |
| **Categoria** | Resilience |

Dockerode senza timeout configurabile — default infinito.

**Fix:** Aggiungere timeout default (30s) a tutte le operazioni.

---

### L-3 — `sleep infinity` come CMD

| Campo | Valore |
|-------|--------|
| **File** | `electron/docker.ts:443` |
| **Categoria** | Resource usage |

`CMD ["sh", "-c", "opencode --help && sleep infinity"]` — consuma risorse inutilmente.

**Fix:** Usare healthcheck o signal handler.

---

### L-4 — Nessun audit logging

| Campo | Valore |
|-------|--------|
| **File** | Throughout |
| **Categoria** | Observability |

Nessun logging strutturato per operazioni di sicurezza (creazione/rimozione container, exec, accessi named pipe).

**Fix:** Aggiungere logging strutturato con timestamp, identità chiamante, dettagli operazione.

---

## Azioni prioritarie

| Priorità | Azione | ID rif. | Stato |
|----------|--------|---------|-------|
| 1 | Rimuovere `generatedDockerfile` dall'API della named pipe | C-1 | ✅ **Fatto** |
| 2 | Validare `projectMount` con whitelist + scan symlink | C-2 | ✅ **Fatto** |
| 3 | Bindare porte Docker su `127.0.0.1` | C-5 | ✅ **Fatto** |
| 4 | Rimuovere API key dalle env var del container (usa PUT /auth/:id) | H-2 | ✅ **Fatto** |
| 5 | Rimuovere API key decrypt dal canale renderer | C-4 | ✅ **Fatto** |
| 6 | Sanitizzare nome container Docker | H-3 | ✅ **Fatto** |
| 7 | Eseguire OpenCode server come non-root con `--cap-drop=ALL` | H-6 |
| 8 | Aggiungere CSP alla Electron window | M-1 |
| 9 | Aumentare polling interval a 5-10s | H-7 |
| 10 | Verifica hash SHA256 per download script | H-5 |
| 11 | Generare password casuali per Postgres/Redis | M-3 |
| 12 | Aggiungere try-catch a tutti gli handler IPC | M-6 |

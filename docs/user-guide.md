# Guida Utente — Arcypelabox

Arcypelabox è un'applicazione desktop che permette di creare, configurare e gestire **sandbox Docker** contenenti ciascuna un **server AI OpenCode**. Ogni sandbox è un ambiente di sviluppo isolato in cui un agente AI può operare su un progetto montato, eseguire comandi, installare strumenti e connettersi a servizi come Postgres e Redis.

---

## Indice

1. [Interfaccia Principale](#1-interfaccia-principale)
2. [Gestione Sandbox](#2-gestione-sandbox)
3. [Creazione Guidata (Wizard)](#3-creazione-guidata-wizard)
4. [Pannello Dettaglio Sandbox](#4-pannello-dettaglio-sandbox)
5. [Chat OpenCode](#5-chat-opencode)
6. [Permessi e Domande](#6-permessi-e-domande)
7. [Sessioni OpenCode](#7-sessioni-opencode)
8. [Sidecar (Postgres / Redis)](#8-sidecar-postgres--redis)
9. [Reverse Proxy e SDK Esterno](#9-reverse-proxy-e-sdk-esterno)
10. [API su Named Pipe](#10-api-su-named-pipe)
11. [Comandi Rapidi](#11-comandi-rapidi)

---

## 1. Interfaccia Principale

L'applicazione si presenta con tre aree principali:

- **Header** — Logo Arcypelabox, cliccabile per tornare alla schermata principale
- **Sidebar (sinistra)** — Elenco delle sandbox esistenti con barra di ricerca e pulsanti
- **Area principale** — Contenuto dinamico (creazione sandbox, dettagli, o stato vuoto)

La sidebar è **collassabile** tramite l'apposito pulsante. Su finestre più strette (< 1200px) si compatta automaticamente in modalità overlay.

### Sidebar — Elenco Sandbox

Ogni sandbox è rappresentata da una scheda che mostra:

- **Nome** della sandbox
- **Percorso del progetto montato** (con nome cartella in evidenza)
- **Badge di stato** — `running` (verde), `exited` (grigio), `created` (giallo), ecc.

Funzionalità della sidebar:

- **Ricerca filtrata** — Digita per filtrare per nome, immagine, stato, percorso mount o sandbox ID
- **Refresh manuale** — Pulsante di aggiornamento (la lista si aggiorna automaticamente ogni 5 secondi)
- **Nuova sandbox** — Pulsante `+` per avviare la procedura guidata di creazione

---

## 2. Gestione Sandbox

### Operazioni disponibili (dalla schermata di dettaglio)

| Azione | Descrizione |
|--------|-------------|
| **Avvia** | Avvia il container e i servizi sidecar (Postgres/Redis) |
| **Ferma** | Arresta il container e i sidecar (i dati nel container vengono preservati) |
| **Elimina** | Rimuove permanentemente container, rete, immagine e sidecar (irreversibile) |
| **Modifica** | Apre il wizard di modifica — la sandbox viene ricreata da capo |
| **Apri cartella** | Apre il percorso montato nel file manager del sistema operativo |
| **Refresh** | Ricarica lo stato e le informazioni della sandbox |

### Stati di una sandbox

- `created` — Container creato ma non avviato
- `running` — Container in esecuzione (OpenCode accessibile)
- `exited` — Container arrestato
- Altri stati Docker: `paused`, `restarting`, `removing`, `dead`

> **Nota:** Le operazioni di start/stop/remove agiscono sull'intero **gruppo sandbox** (container principale + sidecar + rete Docker condivisa).

---

## 3. Creazione Guidata (Wizard)

La creazione avviene in 4 passi progressivi.

### Step 0 — Base

- **Nome sandbox** — Obbligatorio. Deve iniziare con lettera o numero, contenere solo caratteri `a-z`, `0-9`, `-`, `_`, `.`. Massimo 64 caratteri. Il nome deve essere univoco.
- **Percorso progetto** — Obbligatorio. Path assoluto di una cartella locale da montare come volume Docker in `/workspace`.
- Il template base è "OpenCode Minimal": Debian slim con Node.js e OpenCode CLI preinstallati.

### Step 1 — Technology

Tre sezioni con filtro di ricerca testuale:

| Sezione | Opzioni disponibili |
|---------|---------------------|
| **Runtimes** | Node.js (incluso), Python, .NET SDK, Go, Java, Ruby, PHP, Rust, Zig |
| **Tools** | git (incluso), curl, vim, build-essential, sqlite, pnpm, bun, nvm, jq, GitHub CLI, unzip, tree, make, zip, ripgrep, CMake |
| **Services** | Postgres (16-alpine), Redis (7-alpine) — eseguiti come container sidecar separati |

Node.js e git sono **sempre inclusi** e non possono essere rimossi.

### Step 2 — Workspace

- **Permessi OpenCode** (15 permessi configurabili singolarmente):
  - Ogni permesso può essere: `allow` (approvato automaticamente), `ask` (chiede all'utente), `deny` (bloccato)
  - Permessi: `read`, `edit`, `write`, `glob`, `grep`, `bash`, `task`, `skill`, `question`, `todowrite`, `webfetch`, `websearch`, `lsp`, `external_directory`, `doom_loop`
  - Default: tutti `allow` tranne `doom_loop` che è `deny`
- **Provider LLM** — Aggiungi uno o più provider AI:
  - Seleziona da un elenco a discesa con autocompletamento (oltre 20 provider supportati: Anthropic, OpenAI, DeepSeek, Google, Groq, Ollama, OpenRouter, ecc.)
  - Inserisci la chiave API corrispondente
  - Le chiavi vengono **crittografate** con `safeStorage` del sistema operativo e iniettate nel container via API dopo l'avvio (mai in env var o layer Docker)
- **Configurazione Git** (solo se lo strumento `git` è selezionato):
  - `user.name`
  - `user.email`
  - `core.autocrlf` (`input`, `true`, `false`)

### Step 3 — Review

- **Riepilogo della configurazione** (immagine, mount, runtimes, tools, services, provider, permessi, git)
- **Anteprima del Dockerfile generato** — Mostra il Dockerfile che verrà costruito
- **Dockerfile avanzato** (collassabile) — Permette di aggiungere comandi `RUN` personalizzati
  - Attenzione: comandi malformati o malevoli possono compromettere la build

### Costruzione (Build)

Dopo la conferma, viene mostrato un **modale di progresso** con:
- Descrizione dello step corrente
- Log in tempo reale della build Docker
- Icona di caricamento animata
- Al termine: schermata di successo con navigazione automatica al dettaglio sandbox (dopo 2.5 secondi)

> **Modifica sandbox esistente:** Durante la modifica, il wizard è precompilato con i valori correnti. Un avviso informa che il container verrà ricostruito da capo (i dati non sul mount andranno persi).

---

## 4. Pannello Dettaglio Sandbox

Tre schede navigabili disponibili solo dopo aver selezionato una sandbox.

### Scheda Info

Mostra tutte le informazioni della sandbox in sezioni:

**Generale:**
- Nome, immagine Docker, stato, sandbox ID (UUID)
- **URL SDK OpenCode** — `http://localhost:4096/{sandboxId}` (clicca per copiare)
- **URL Web OpenCode** — Link diretto all'interfaccia web del server nella sandbox (se in esecuzione)
- Data di creazione e ultimo aggiornamento

**Workspace:**
- Path del progetto montato (con pulsante "apri cartella")
- Configurazione Git
- Permessi OpenCode configurati

**Technology:**
- Runtimes, tools, services, provider configurati

**Docker:**
- Container ID, Docker ID (DB)
- **Dockerfile** (collassabile, con pulsante copia)
- **Docker Compose** (generato automaticamente, con pulsante copia)

Viene anche mostrato un banner di stato quando la sandbox è in esecuzione.

**Barra azioni:** Avvia/Stop, CLI, Refresh, Modifica, Elimina (con conferma).

### Scheda Logs

Mostra le ultime 100 righe di log del container con timestamp. Pulsante "Refresh Logs" per ricaricare.

### Scheda OpenCode Panel

Pannello chat completo (vedi sezione 5). Visibile solo quando la sandbox è in esecuzione.

---

## 5. Chat OpenCode

L'**OpenCode Panel** è l'interfaccia di chat con l'agente AI nella sandbox.

### Funzionalità

- **Invio messaggi** — Scrivi un prompt e premi Invio (Shift+Invio per andare a capo) o clicca il pulsante di invio
- **Cronologia messaggi** — Tutti i messaggi user/assistant vengono mostrati in ordine cronologico, con auto-scroll
- **Indicatore di connessione** — Pallino verde (connesso) o rosso (disconnesso) con etichetta
- **Stato di caricamento** — Spinner durante l'elaborazione di un prompt
- **Messaggi intermedi** — Opzione "Show intermediate steps" per vedere tool call, input/output, e file generati

### Diagnostica

In alto nella chat viene mostrata una sezione diagnostica quando necessario:
- **Debug sessione** — Pannello con dettagli sull'operazione corrente (tool in uso, input, output, errori)
- **Messaggi di errore** — Se il prompt fallisce, mostra l'errore

### Comportamento

- Se la sandbox è in esecuzione ma il server OpenCode non è connesso, viene mostrato "Connecting to OpenCode server..."
- Se la sessione è occupata (`busy`), l'invio viene bloccato con un avviso temporaneo
- I messaggi vengono **pollati** ogni 1.5 secondi per aggiornamenti in tempo reale

---

## 6. Permessi e Domande

### Gestione Permessi

Quando l'agente AI richiede un'azione che richiede autorizzazione:

1. Viene mostrato un **banner giallo** con tutte le richieste in sospeso
2. Ogni richiesta mostra: nome del permesso e pattern coinvolti
3. Tre opzioni di risposta:
   - **Allow Once** — Approvazione singola
   - **Always Allow** — Approvazione permanente (per la sessione corrente)
   - **Reject** — Rifiuto

### Risposta a Domande

Quando l'agente AI ha bisogno di un input dall'utente:

1. Viene mostrato un **banner informativo** con la domanda
2. Le opzioni vengono presentate come pulsanti selezionabili
3. Clicca su "Submit Answer" per inviare la risposta
4. Supporta risposte singole e multiple (checkbox)

---

## 7. Sessioni OpenCode

Il pannello di destra della chat mostra la **lista delle sessioni**.

### Gestione Sessioni

| Azione | Descrizione |
|--------|-------------|
| **Nuova sessione** | Clicca "+ New", inserisci titolo opzionale, seleziona provider e modello, conferma "Create" |
| **Seleziona sessione** | Clicca su una sessione esistente per visualizzarne i messaggi |
| **Elimina sessione** | Clicca "✕" sulla sessione, conferma nel modale |
| **Refresh** | Ricarica l'elenco sessioni e tutti i dati |

### Creazione Sessione

Quando crei una nuova sessione puoi specificare:
- **Titolo** (opzionale)
- **Provider LLM** — Seleziona dal menu a tendina dei provider configurati al momento della creazione della sandbox
- **Modello** — Seleziona il modello specifico del provider scelto

### Filtro Sessioni

Una barra di ricerca permette di filtrare le sessioni per titolo.

### Abort

Se una sessione rimane bloccata in stato `busy`, il pulsante "Abort" nella diagnostica permette di interromperla forzatamente.

### Info Sessione Attiva

In fondo al pannello sessioni viene mostrato:
- Il modello attivo per la sessione corrente (es. `anthropic/claude-sonnet-4-20250514`)
- Pulsante "Open terminal" per avviare `opencode attach` da terminale

---

## 8. Sidecar (Postgres / Redis)

Se durante la creazione selezioni Postgres e/o Redis:

- Vengono creati **container separati** sulla stessa rete Docker della sandbox
- I container sidecar condividono l'etichetta `sandobox.group` con il container principale
- Le operazioni di start/stop/delete agiscono su **tutto il gruppo**
- **Variabili d'ambiente** iniettate automaticamente nel container sandbox:
  - Postgres: `PGHOST=postgres`, `PGPORT=5432`, `PGUSER=sandbox`, `PGPASSWORD=sandbox`, `PGDATABASE=sandbox`
  - Redis: `REDIS_HOST=redis`, `REDIS_PORT=6379`
- L'agente AI può connettersi ai servizi usando gli hostname `postgres` e `redis` (DNS sulla rete Docker)

---

## 9. Reverse Proxy e SDK Esterno

Arcypelabox include un **reverse proxy HTTP** sulla porta `4096` (localhost) che instrada le richieste al server OpenCode della sandbox corretta basandosi sul sandbox ID nel path URL.

```
http://localhost:4096/{sandboxId}/...
```

### Casi d'uso

- **SDK OpenCode** — Usa l'URL del proxy come base URL per l'SDK ufficiale `@opencode-ai/sdk`
- **API REST diretta** — Chiama le API HTTP di OpenCode attraverso il proxy
- **Interfaccia web** — Apri `http://127.0.0.1:{port}` (mostrato nei dettagli sandbox) per usare la UI web di OpenCode

### Caratteristiche

- Supporta **HTTP upgrade** (per SSE streaming)
- Endpoint debug: `http://localhost:4096/__proxy/routes`
- 404 per sandbox non registrate, 502 per container irraggiungibili

---

## 10. API su Named Pipe

Arcypelabox espone un server REST su **named pipe** (Windows) o **Unix socket** (Linux/macOS) per l'integrazione con altre applicazioni desktop locali.

### Connessione

| Piattaforma | Path |
|-------------|------|
| Windows | `//./pipe/paratoolz-arcypelabox` |
| Linux/macOS | `/tmp/paratoolz-arcypelabox.sock` |

### Endpoint (12 rotte)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| `GET` | `/api/ping` | Health check |
| `GET` | `/api/sandboxes` | Elenca tutte le sandbox |
| `POST` | `/api/sandboxes` | Crea nuova sandbox (richiede `projectMount`) |
| `GET` | `/api/sandboxes/by-mount` | Filtra per percorso mount |
| `POST` | `/api/sandboxes/start` | Avvia sandbox |
| `POST` | `/api/sandboxes/stop` | Ferma sandbox |
| `DELETE` | `/api/sandboxes` | Rimuove sandbox |
| `GET` | `/api/sandboxes/logs` | Log del container |
| `GET` | `/api/sandboxes/:id/info` | Info complete |
| `GET` | `/api/sandboxes/:id/status` | Stato sandbox |
| `GET` | `/api/sandboxes/:id/opencode-port` | Porta OpenCode |
| `POST` | `/api/sandboxes/exec` | Esegue comando nella sandbox |

### Protocollo

Il protocollo è **newline-delimited JSON** (NDJSON). Ogni messaggio è un oggetto JSON su una riga.

**Richiesta:**
```json
{"id":"uuid","method":"GET","path":"/api/ping","body":{}}
```

**Risposta:**
```json
{"id":"uuid","status":200,"body":{"pong":true}}
```

### Flusso tipico per app esterna

1. Trova la sandbox → `GET /api/sandboxes/by-mount` con il percorso del progetto
2. Verifica che sia in esecuzione → `GET /api/sandboxes/:id/status`
3. Se non in esecuzione, avvia → `POST /api/sandboxes/start`
4. Usa `http://localhost:4096/{sandboxId}` come base URL per l'SDK OpenCode

---

## 11. Comandi Rapidi

### Terminale (`opencode attach`)

Da qualsiasi sandbox in esecuzione, clicca il pulsante **terminale** (`>_`) nella barra azioni del dettaglio o nel pannello sessioni per aprire un terminale con `opencode attach` già configurato per connettersi al server OpenCode della sandbox (con sessione opzionale).

### Apri Cartella

Nel dettaglio sandbox, clicca l'icona cartella accanto al percorso del progetto montato per aprirlo direttamente nel file manager del sistema.

---

## Riepilogo Funzionalità

| Funzionalità | Descrizione |
|-------------|-------------|
| **Creazione sandbox** | Wizard 4 step con runtime, tool, servizi, provider AI |
| **Mount progetto** | Monta cartella locale in `/workspace` |
| **Sidecar Postgres/Redis** | Container separati su rete condivisa |
| **Chat AI** | Interfaccia chat completa con OpenCode |
| **Permessi AI** | Allow/ask/deny per 15 categorie |
| **Domande AI** | Risposta a domande con selezione multipla |
| **Sessioni multiple** | Crea, seleziona, elimina sessioni con modelli diversi |
| **Debug sessione** | Tool call, input/output, errori in tempo reale |
| **Log container** | Ultime 100 righe con timestamp |
| **Reverse proxy** | Porta unica 4096 per tutte le sandbox |
| **API named pipe** | REST per integrazione con altre app desktop |
| **Crittografia chiavi** | API key crittografate con safeStorage |
| **Auto-recovery** | Rilevamento container esistenti all'avvio |
| **Security hardening** | `--cap-drop=ALL`, port binding su 127.0.0.1, API key non in env |

---

*Documentazione generata il 25/05/2026*

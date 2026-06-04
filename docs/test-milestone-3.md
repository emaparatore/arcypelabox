# Test Milestone 3 — Backlog

Terza iterazione di test dopo milestone 1 + milestone 2.

Obiettivo: coprire le aree ancora ad alto rischio pratico ma con buon rapporto valore/costo:
- integrazione OpenCode SDK
- wiring IPC principale in `electron/main.ts`
- flussi operativi UI in `SandboxDetail.tsx`
- edge case aggiuntivi della named-pipe API

---

## Prerequisiti

Nessuna nuova dipendenza e' necessaria.

Setup gia' disponibile:
- `vitest`
- `tests/setup/vitest.setup.ts`
- `tests/setup/renderer.setup.ts`
- `tests/setup/sandobox.mock.ts`

Comandi gia' utili:

```bash
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:critical-flows
```

Nota sui renderer test:
- usare `// @vitest-environment jsdom`
- importare il setup renderer esplicitamente nel file di test

---

## Struttura nuovi file

```text
tests/
  unit/
    electron/
      opencode.test.ts             # priorita' 1
      main.test.ts                 # priorita' 3
  integration/
    renderer/
      SandboxDetail.test.tsx       # priorita' 2
```

Estensione file esistente:
- `tests/integration/ipc/api-routes.test.ts` # priorita' 4

---

## Regole implementative

1. Tenere milestone 3 corta: niente espansioni laterali non richieste.
2. Testare mapping, error handling e flussi utente reali; evitare test puramente cosmetici.
3. Mockare SDK, Electron e I/O ai bordi, ma non la logica del modulo sotto test.
4. Nei moduli con side effect (`main.ts` in particolare), usare `vi.resetModules()` e import ritardato.
5. Nei test renderer, preferire interazioni utente reali e assert su UI/side effect osservabili.
6. Se `main.ts` risulta troppo costoso da testare direttamente, sono ammessi piccoli export di helper non-UI.

---

## Priorita' 1 — `electron/opencode.ts`

**File**: `tests/unit/electron/opencode.test.ts`

**Perche' prima**:
- e' una zona di integrazione esterna ad alta volatilita'
- contiene parsing, fallback e retry logic facili da rompere
- un bug qui impatta prompt, sessioni, provider, eventi e shell

**Mock necessari**:
- `../../../electron/proxy.js` → `getProxy`
- `@opencode-ai/sdk/v2` → `createOpencodeClient`
- `global.fetch` per SSE in `subscribeToEvents`
- fake timer per retry/backoff

**Strategia concreta**:
- creare un client SDK finto con shape minima ma coerente
- usare helper `makeSdkClient(overrides?)`
- per SSE, costruire un `ReadableStream` o un fake reader minimale con `read()` sequenziale
- verificare output mappato, non dettagli interni del client

**Test**:

### Health / prompt

| # | Nome | Cosa verifica |
|---|------|---------------|
| 1 | `checkHealth true` | ritorna `true` se `client.global.health()` risolve |
| 2 | `checkHealth false` | ritorna `false` se il client lancia |
| 3 | `sendPrompt concatena text parts` | unisce i testi con newline |
| 4 | `sendPrompt fallback info` | se non ci sono text parts usa `response.info` / `result.data` |
| 5 | `sessionPromptAsync true` | invoca il canale async e ritorna `true` |

### Providers / sessions

| # | Nome | Cosa verifica |
|---|------|---------------|
| 6 | `listProviders filtra connected` | ritorna solo provider connessi |
| 7 | `listProviders mappa modelli e variants` | shape corretta per il renderer |
| 8 | `listSessions unisce list e status` | status e statusMessage corretti |
| 9 | `createSession usa title default` | default `Sandbox Chat` |
| 10 | `createSession fallback id` | usa `(result as any).id` se `result.data.id` manca |
| 11 | `getAvailableSessionId riusa idle` | prende una sessione non busy |
| 12 | `getAvailableSessionId crea sessione` | crea una nuova sessione se tutte busy |

### Permissions / questions / messages

| # | Nome | Cosa verifica |
|---|------|---------------|
| 13 | `listPendingPermissions mappa shape` | `sessionID` → `sessionId`, `patterns` default |
| 14 | `replyPermission true` | inoltra e ritorna `true` |
| 15 | `listPendingQuestions mappa options` | header/question/options/multiple |
| 16 | `replyQuestion true` | inoltra e ritorna `true` |
| 17 | `getSessionMessages mappa role/content/timestamp` | trasformazione base corretta |
| 18 | `getSessionMessages mappa tool parts` | raw/input/output/status corretti |

### Debug / SSE

| # | Nome | Cosa verifica |
|---|------|---------------|
| 19 | `getOpenCodeSessionDebug ultimo tool` | toolName/toolStatus/toolInput |
| 20 | `getOpenCodeSessionDebug no messages` | errore descrittivo se lista vuota |
| 21 | `getOpenCodeSessionDebug no parts` | errore descrittivo se latest senza parts |
| 22 | `subscribeToEvents parse data line` | emette eventi JSON validi |
| 23 | `subscribeToEvents ignora JSON invalidi` | nessun crash |
| 24 | `subscribeToEvents richiama onReconnect` | quando la connessione si apre |
| 25 | `subscribeToEvents richiama onError e retry` | errore fetch → callback + retry |
| 26 | `subscribeToEvents abort stop` | termina senza ulteriori retry |

**Stima**: ~26 test.

**Acceptance minima**:
- coprire almeno un test per ogni famiglia: prompt, providers, sessions, messages, debug, SSE
- coprire almeno un fallback e un failure mode reale

---

## Priorita' 2 — `src/components/SandboxDetail.tsx`

**File**: `tests/integration/renderer/SandboxDetail.test.tsx`

**Perche' secondo**:
- e' il componente operativo principale dopo la creazione sandbox
- concentra azioni critiche: start, stop, delete, logs, compose, open folder
- ha molto valore utente con mocking relativamente semplice

**Mock necessari**:
- `window.sandobox` tramite `createSandoboxMock()`
- `OpenCodePanel` e `OpenCodeCLIButton` possono essere mockati come stub semplici
- `navigator.clipboard.writeText`

**Strategia concreta**:
- usare una fixture `makeSandboxInfo(overrides?)`
- mockare `db.getFullSandboxRecord`, `getProxyTarget`, `generateCompose`, `getSandboxLogs`
- verificare callback `onRefresh`, `onDeleted`, `onEdit`
- coprire sia stato running sia stopped

**Test**:

| # | Nome | Cosa verifica |
|---|------|---------------|
| 1 | carica full record e proxy target | mostra dettagli estesi e web port |
| 2 | tab logs carica logs | `getSandboxLogs()` su switch tab |
| 3 | refresh logs | bottone refresh richiama fetch |
| 4 | start flow | `startSandbox()` e poi `onRefresh()` |
| 5 | stop flow confermato | modal conferma + `stopSandbox()` |
| 6 | delete flow confermato | modal conferma + `removeSandbox()` + `onDeleted()` |
| 7 | errore start/stop/remove | testo errore mostrato |
| 8 | open folder | `openPath(projectMount)` |
| 9 | open terminal | `openInTerminal(projectMount)` |
| 10 | toggle dockerfile | mostra/nasconde contenuto |
| 11 | toggle compose | mostra compose generato |
| 12 | copy URL/dockerfile/compose | copia su clipboard |
| 13 | running mostra OpenCodePanel | render del pannello opencode |
| 14 | stopped mostra empty state opencode | messaggio di start richiesto |

**Stima**: ~14 test.

**Acceptance minima**:
- coprire almeno uno tra start/stop/delete per ogni path success
- coprire almeno un path di errore
- coprire almeno una interazione su logs e una su compose/dockerfile

---

## Priorita' 3 — `electron/main.ts`

**File**: `tests/unit/electron/main.test.ts`

**Perche' terzo**:
- valore alto, ma costo di mocking maggiore per via di `app.whenReady()`, `ipcMain.handle()` e side effect iniziali
- conviene arrivarci dopo avere consolidato `opencode.ts` e `SandboxDetail.tsx`

**Mock necessari**:
- `electron` → `app`, `BrowserWindow`, `ipcMain`, `Menu`, `shell`
- `../../../electron/docker.js`
- `../../../electron/opencode.js`
- `../../../electron/database.js`
- `../../../electron/ipc-server.js`
- `../../../electron/api.js`
- `../../../electron/proxy.js`

**Strategia concreta**:
- import ritardato del modulo dopo aver predisposto tutti i mock
- catturare gli handler registrati via `ipcMain.handle`
- testare gli handler invocandoli direttamente
- se il setup iniziale e' troppo rumoroso, estrarre un helper piccolo e puro per registrare gli handler

**Test**:

### Sandbox lifecycle IPC

| # | Nome | Cosa verifica |
|---|------|---------------|
| 1 | `sandobox:list success` | ritorna lista |
| 2 | `sandobox:list error` | wrap `{ error }` |
| 3 | `sandobox:create success` | genera `sandboxId`, invia progress, salva DB |
| 4 | `sandobox:create db fail rollback` | chiama `removeSandboxBySandboxId()` e ritorna errore |
| 5 | `sandobox:update existing record` | usa `updateSandboxRecord()` |
| 6 | `sandobox:update missing record` | usa `createSandboxRecord()` |
| 7 | `sandobox:update db fail non critical` | non rompe il risultato |
| 8 | `sandobox:remove success` | remove Docker + delete DB |

### Proxy / exec / opencode IPC

| # | Nome | Cosa verifica |
|---|------|---------------|
| 9 | `sandobox:proxy:target success` | ritorna host/port |
| 10 | `sandobox:proxy:target missing` | errore user-facing |
| 11 | `sandobox:exec success` | inoltra comando |
| 12 | `sandobox:opencode:prompt error` | wrap `{ error }` |
| 13 | `sandobox:opencode:providers error` | wrap `{ error }` |

### Recovery helper

| # | Nome | Cosa verifica |
|---|------|---------------|
| 14 | `tryRecoverSandboxRecord found` | ricrea record DB e lo rilegge |
| 15 | `tryRecoverSandboxRecord no match` | ritorna `null` |
| 16 | `tryRecoverSandboxRecord save fail` | ritorna `null` |

**Stima**: ~16 test.

**Acceptance minima**:
- coprire create/update/remove
- coprire almeno un rollback e un errore non-critico DB
- coprire almeno un handler OpenCode e uno proxy

---

## Priorita' 4 — Estensioni a `electron/api.ts`

**File**: estendere `tests/integration/ipc/api-routes.test.ts`

**Perche' ultimo**:
- il file ha gia' copertura base
- qui servono solo edge cases mirati ad alto valore

**Test da aggiungere**:

| # | Nome | Cosa verifica |
|---|------|---------------|
| 1 | reject `image` in POST create | `400` |
| 2 | reject `generatedDockerfile` | `400` |
| 3 | reject `customCommands` | `400` |
| 4 | reject `projectMount` mancante | `400` |
| 5 | reject nome troppo lungo | `400` |
| 6 | reject nome invalido | `400` |
| 7 | `409` on name conflict | messaggio corretto |
| 8 | `GET /:id/info` returns `404` | quando `getSandboxInfo()` ritorna `null` |
| 9 | `GET /by-mount` requires mountPath | `400` |
| 10 | `GET /by-mount` maps `proxyUrl` | shape corretta |
| 11 | `POST /exec` forwards command | `execInSandbox(containerId, command)` |

**Stima**: ~11 test.

**Acceptance minima**:
- coprire almeno 3 validation error su create
- coprire almeno un `404` e un mapping `by-mount`

---

## Riepilogo milestone 3

| Priorita' | Modulo | File | Test previsti |
|-----------|--------|------|---------------|
| 1 | OpenCode SDK mapping | `tests/unit/electron/opencode.test.ts` | ~26 |
| 2 | Sandbox operational UI | `tests/integration/renderer/SandboxDetail.test.tsx` | ~14 |
| 3 | Main IPC wiring | `tests/unit/electron/main.test.ts` | ~16 |
| 4 | Named-pipe API edge cases | `tests/integration/ipc/api-routes.test.ts` | ~11 |

**Totale stimato**: ~67 test aggiuntivi.

---

## Ordine di implementazione consigliato

1. `tests/unit/electron/opencode.test.ts`
2. `tests/integration/renderer/SandboxDetail.test.tsx`
3. `tests/unit/electron/main.test.ts`
4. estensione `tests/integration/ipc/api-routes.test.ts`

Verifica dopo ogni step:

```bash
npm run typecheck
npm test -- <file-di-test>
```

Verifica finale milestone:

```bash
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:critical-flows
```

---

## Definition Of Done

La milestone 3 e' considerata completa quando:

1. i nuovi file di test esistono e girano isolatamente
2. le estensioni a `api-routes.test.ts` sono verdi
3. `npm run typecheck` e' verde
4. `npm run test:unit` e `npm run test:integration` restano verdi
5. i fallback e failure mode principali di `opencode.ts` e `main.ts` sono coperti
6. i flussi operativi principali di `SandboxDetail.tsx` sono coperti

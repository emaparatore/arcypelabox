# Test Milestone 2 — Backlog

Seconda iterazione di test dopo la milestone 1 (94 test, IPC/server/renderer).
Obiettivo: colmare i gap su contract Docker/compose, database, preload, proxy, e renderer
avanzato.

---

## Prerequisiti

Nessuna nuova dipendenza e' necessaria per questa milestone.

Dipendenze e setup gia' disponibili:
- `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
- `better-sqlite3` gia' presente nel progetto
- `@types/better-sqlite3` gia' presente in `devDependencies`

Setup riutilizzabile gia' esistente:
- `tests/setup/vitest.setup.ts`
- `tests/setup/renderer.setup.ts`
- `tests/setup/sandobox.mock.ts`

Nota importante sui test renderer:
- usare esplicitamente `// @vitest-environment jsdom` in cima ai nuovi file renderer
- importare `../../setup/renderer.setup` o path equivalente nel file di test
- non affidarsi a `environmentMatch` per questa milestone: oggi i test renderer esistenti
  funzionano grazie alla pragma inline e al setup esplicito

---

## 🤝 Struttura nuovi file

```
tests/
  unit/
    electron/
      database.test.ts           # priorità 2
      preload.test.ts            # priorità 3
      proxy.test.ts              # priorità 4
  integration/
    electron/
      docker-contract.test.ts    # priorità 1
    renderer/
      SandboxCreate.test.tsx     # priorità 5
      OpenCodePanel.test.tsx     # priorità 5
```

Tutti i nuovi test vanno in file nuovi, nessuna modifica ai test esistenti.

Naming consigliato:
- `describe("module/function")` con nome del modulo reale
- `it("does something specific")` o equivalente italiano, ma coerente nello stesso file
- una fixture/helper per file se riduce duplicazione, evitando helper globali non necessari

---

## Regole implementative

Per evitare regressioni durante l'implementazione, ogni nuovo file dovrebbe seguire queste regole:

1. Test `node` per moduli Electron/Node, `jsdom` solo per renderer.
2. Mockare solo i bordi I/O reali, non la logica del modulo sotto test.
3. Riutilizzare `createSandoboxMock()` dove possibile, estendendolo per singolo test con `mockResolvedValue`.
4. Nei test che importano moduli con side effect (`preload.ts`, moduli singleton), usare `vi.resetModules()` tra i casi.
5. Nei test `database.ts`, usare un file sqlite temporaneo per test, non `:memory:` tramite `app.getPath()`.
6. Nei test di rete/proxy, usare porte dinamiche o server su porta 0 quando possibile.
7. Ogni file nuovo deve poter essere eseguito isolatamente con `vitest run <file>`.

---

## Priorità 1 — Contract `createSandbox()` vs `buildDockerCompose()`

**File**: `tests/integration/electron/docker-contract.test.ts`

**Refactor minimo**:
Estrarre `createSandbox` e `buildDockerCompose` da `electron/docker.ts` non serve per
questa milestone. Il test mocka `getSandboxRecordFull` e costruisce record manuali, poi
confronta le stringhe di configurazione.

**Mock necessari**:
- `../../../electron/database.js` → `getSandboxRecordFull`
- `../../../electron/proxy.js` → `getProxy`
- `dockerode` (module)
- `node:child_process` → `spawn`
- `node:fs/promises`

**Strategia concreta**:
- mockare `dockerode` in modo che `createContainer`, `getNetwork().connect`, `container.start()` e
  `container.inspect()` restituiscano shape minime ma realistiche
- catturare i payload passati a `docker.createContainer(...)` e confrontarli con il compose generato
- per `buildDockerCompose(sandboxId)`, costruire record DB manuali e verificare stringhe/chiavi
- per `createSandbox(config)`, evitare build reali mockando `spawn`, `writeFile`, `mkdtemp`, `rm`
- dove il confronto stringa-stringa e' troppo fragile, preferire assert su frammenti chiave

**Test**:

### Contesto base — sandbox senza sidecar

| # | Nome | Cosa verifica |
|---|------|---------------|
| 1 | contiene OPENCODE_CONFIG | Entrambi i flussi producono `OPENCODE_CONFIG` come env |
| 2 | contiene SANDBOX_WORKSPACE | Entrambi espongono `SANDBOX_WORKSPACE=/workspace` |
| 3 | contiene cap_drop ALL | Entrambi rimuovono tutti i privilegi Linux |
| 4 | comando opencode serve | Entrambi eseguono `opencode serve --port 4096 --hostname 0.0.0.0` |
| 5 | mkdir + printf config prima di serve | Entrambi scrivono `opencode.json` prima di avviare il server |
| 6 | resources limits | Entrambi limitano CPU a 2 e RAM a 2GB |

### Sidecar Postgres

| # | Nome | Cosa verifica |
|---|------|---------------|
| 7 | env POSTGRES_* presenti | `POSTGRES_HOST=postgres`, `POSTGRES_PORT=5432`, credenziali sandbox |
| 8 | alias di rete | Entrambi danno alias `postgres` al container Postgres |

### Sidecar Redis

| # | Nome | Cosa verifica |
|---|------|---------------|
| 9 | env REDIS_* presenti | `REDIS_HOST=redis`, `REDIS_PORT=6379` |
| 10 | alias di rete | Entrambi danno alias `redis` al contenitore Redis |

### Provider e permessi

| # | Nome | Cosa verifica |
|---|------|---------------|
| 11 | config provider nella OPENCODE_CONFIG | Entrambi includono `provider` con la mappa corretta |
| 12 | permessi custom | Entrambi riflettono permessi allow/deny/ask, con `doom_loop=deny` forzato |

### Volumi

| # | Nome | Cosa verifica |
|---|------|---------------|
| 13 | projectMount /workspace | Entrambi montano il percorso host come `/workspace` |
| 14 | nessun mount se projectMount assente | Entrambi omettono la sezione volumi |

### Rete

| # | Nome | Cosa verifica |
|---|------|---------------|
| 15 | network alias sandbox | Entrambi danno alias `sandbox` al container principale |
| 16 | driver bridge | Entrambi creano rete bridge |

~16 test, prioritari.

**Output minimo atteso del file**:
- helper `makeSandboxRecord(overrides?)`
- helper `expectComposeContainsCoreContract(compose: string)`
- helper `expectCreatePayloadMatchesContract(payload)`

---

## Priorità 2 — `electron/database.ts`

**File**: `tests/unit/electron/database.test.ts`

**Refactor minimo**:
Nessun refactor obbligatorio, ma il modulo e' singleton. I test devono isolare il modulo per file.
Approccio consigliato:
- `vi.resetModules()` prima di ogni test o di ogni `describe`
- mock di `electron` prima dell'import del modulo
- `app.getPath("userData")` deve restituire una cartella temporanea unica per test

Mock di base:

```typescript
vi.mock("electron", () => ({
  app: { getPath: () => tempUserDataDir },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  },
}))
```

Dettaglio importante:
- non usare `:memory:` passando da `app.getPath()`; il modulo costruisce comunque un path con `path.join(...)`
- usare una cartella temporanea per test, ad esempio sotto `C:\Users\emapa\AppData\Local\Temp\opencode`
- pulire il file sqlite dopo ogni suite se necessario

Helper consigliati:
- `loadDatabaseModule()` → fa `vi.resetModules()` e poi `import("../../../electron/database.js")`
- `makeSandboxConfig(overrides?)`
- `makeEncryptedProviderPayload()` per i test su cifratura

**Test**:

### CRUD sandbox record

| # | Nome | Cosa verifica |
|---|------|---------------|
| 1 | create inserta e restituisce id | `createSandboxRecord` → id valido |
| 2 | get by id | `getSandboxRecord` torna il record corretto |
| 3 | get by containerId | `getSandboxByContainerId` torna il record |
| 4 | list ordinata per created_at | `listSandboxRecords` ordina DESC |
| 5 | update modifica campi | `updateSandboxRecord` aggiorna correttamente |
| 6 | delete rimuove | `deleteSandboxRecord` rimuove il record |
| 7 | deleteByContainerId | rimuove per containerId |

### Parsing e formati

| # | Nome | Cosa verifica |
|---|------|---------------|
| 8 | parseRecord deserializza JSON | runtimes/tools/services da stringa a array |
| 9 | parseRecord gestisce git_config null | non crasha se git_config è NULL |
| 10 | parseRecord gestisce permissions | deserializza permissions correttamente |

### Name conflict

| # | Nome | Cosa verifica |
|---|------|---------------|
| 11 | findNameConflict true | rileva conflitto correttamente |
| 12 | findNameConflict false | nessun falso positivo |
| 13 | findNameConflict excludeId esclude | non matcha se stesso |

### Chat messages

| # | Nome | Cosa verifica |
|---|------|---------------|
| 14 | addChatMessage | inserta e restituisce id |
| 15 | getChatMessages | ordine ASC per timestamp |
| 16 | clearChatMessages | rimuove solo messaggi della sandbox giusta |
| 17 | cascade delete | eliminando sandbox, chat sparite |

### Provider encryption

| # | Nome | Cosa verifica |
|---|------|---------------|
| 18 | providers null = non cifrato | se `providers` non fornito, db salva NULL |
| 19 | providers cifrati se encryption attiva | safeStorage mockato → encrypt chiamato |
| 20 | getDecryptedProviders | decrypt e JSON.parse |
| 21 | getDecryptedProviders fallisce = null | decrypt rotto → null |

### Settings

| # | Nome | Cosa verifica |
|---|------|---------------|
| 22 | setSetting insert | nuova chiave |
| 23 | setSetting update | upsert corretto |
| 24 | getSetting letto | valore corretto |
| 25 | getSetting per chiave inesistente | null |

### Schema migration

| # | Nome | Cosa verifica |
|---|------|---------------|
| 26 | aggiunge colonna providers | migrazione da vecchio schema |
| 27 | aggiunge colonna git_config | migrazione da vecchio schema |
| 28 | rimuove opencode_port | migrazione da vecchio schema |
| 29 | schema gia' aggiornato non crasha | idempotenza |

### safeStorage not available

| # | Nome | Cosa verifica |
|---|------|---------------|
| 30 | encrypt restituisce null | safeStorage disabilitato → warn, non crash |
| 31 | providers salvati come plain text? | comportamento attuale: non cifra, salta |

~31 test.

**Acceptance minima**:
- il file deve poter essere eseguito da solo senza dipendere da stato residuo di un DB precedente
- i test sulle migrazioni devono creare uno schema vecchio esplicito e poi chiamare `initDatabase()`

---

## Priorità 3 — `electron/preload.ts`

**File**: `tests/unit/electron/preload.test.ts`

**Refactor minimo**:
Nessuno. Il test mocka `contextBridge.exposeInMainWorld` e `ipcRenderer` poi richiede
il modulo con `vi.importActual`.

**Mock**:
- `electron` → `ipcRenderer`, `contextBridge`

**Strategia concreta**:
- fare `vi.resetModules()` prima di ogni caso che importa `preload.ts`
- catturare l'oggetto passato a `contextBridge.exposeInMainWorld("sandobox", api)`
- testare i metodi chiamando direttamente `api.<metodo>(...)`
- per `onEvent`, `onState`, `onBuildProgress` verificare sia `ipcRenderer.on(...)` sia il cleanup
  via `ipcRenderer.removeListener(...)`

**Test**:

### Bridge shape

| # | Nome | Cosa verifica |
|---|------|---------------|
| 1 | `generateDockerfile` invoca canale giusto | `sandobox:generate:dockerfile` |
| 2 | `generateCompose` invoca canale giusto | `sandobox:generate:compose` |
| 3 | `checkImage` invoca canale giusto | `sandobox:check:image` |
| 4 | `checkSandboxName` invoca canale giusto | `sandobox:db:sandbox:name-exists` |
| 5 | `listSandboxes` invoca canale giusto | `sandobox:list` |
| 6 | `createSandbox` invoca canale giusto | `sandobox:create` |
| 7 | `updateSandbox` invoca canale giusto | `sandobox:update` |
| 8 | `startSandbox` invoca canale giusto | `sandobox:start` |
| 9 | `stopSandbox` invoca canale giusto | `sandobox:stop` |
| 10 | `removeSandbox` invoca canale giusto | `sandobox:remove` |
| 11 | `getSandboxLogs` invoca canale giusto | `sandobox:logs` |
| 12 | `getSandboxInfo` invoca canale giusto | `sandobox:info` |
| 13 | `getProxyTarget` invoca canale giusto | `sandobox:proxy:target` |
| 14 | `execInSandbox` invoca canale giusto con args | `sandobox:exec` + (id, command) |
| 15 | `opencode.onEvent` registra listener | `sandobox:opencode:event` |
| 16 | `opencode.onEvent` restituisce cleanup | rimuove listener |
| 17 | `opencode.onState` registra listener | `sandobox:opencode:state` |
| 18 | `opencode.subscribeEvents` invoca canale | `sandobox:opencode:events:subscribe` |
| 19 | `onBuildProgress` registra listener | `sandobox:build:progress` |
| 20 | `db.*` tutti i canali | ogni metodo db chiama il canale giusto |
| 21 | `contextBridge.exposeInMainWorld` chiamato 1 volta | esposizione corretta |

~21 test.

**Acceptance minima**:
- coprire almeno un metodo per ogni gruppo: sandbox, opencode, shell, db, build-progress
- verificare almeno un listener registration/cleanup pattern per ciascun gruppo event-based

---

## Priorità 4 — `electron/proxy.ts`

**File**: `tests/unit/electron/proxy.test.ts`

**Refactor minimo**:
Nessuno. `SandboxProxy` è una classe semplice. Il test crea istanza, registra route,
invia richieste HTTP e verifica forwarding/errori.

**Strategia concreta**:
Si avvia un server HTTP reale su una porta temporanea, poi si testa il proxy contro
di esso.

Dettagli implementativi:
- upstream server con `http.createServer()` che ritorna body e path ricevuto
- proxy con porta fissa alta o preferibilmente porta libera dedicata per test
- fermare sempre sia upstream sia proxy in `afterEach` / `afterAll`
- per il test `502`, non registrare upstream oppure chiudere upstream prima della richiesta
- per l'upgrade smoke test, basta verificare che il socket non venga distrutto quando il target esiste

**Test**:

### Route management

| # | Nome | Cosa verifica |
|---|------|---------------|
| 1 | register + getTarget | restituisce il target corretto |
| 2 | unregister rimuove | getTarget torna null |
| 3 | getUrl formatta url | `http://127.0.0.1:{port}/{sandboxId}` |
| 4 | register multipli | ogni route indipendente |

### Request forwarding

| # | Nome | Cosa verifica |
|---|------|---------------|
| 5 | GET forward | proxy inoltra e restituisce risposta |
| 6 | POST con body | proxy inoltra metodo e body |
| 7 | path rewriting | `/sandbox-id/api/ping` → `/api/ping` sul target |
| 8 | 404 sandbox sconosciuto | proxy restituisce 404 |
| 9 | 502 target irraggiungibile | proxy restituisce 502 |
| 10 | `__proxy/routes` debug | elenco route registrate |

### HTTP Upgrade (SSE / WebSocket)

| # | Nome | Cosa verifica |
|---|------|---------------|
| 11 | upgrade connessione | proxy inoltra upgrade (opzionale, solo se il target supporta) |
| 12 | 404 upgrade sandbox sconosciuto | proxy chiude connessione |

~12 test.

**Acceptance minima**:
- almeno un test reale di forwarding HTTP e uno di path rewriting
- almeno un test `404` e uno `502`

---

## Priorità 5 — Renderer: `SandboxCreate.tsx`

**File**: `tests/integration/renderer/SandboxCreate.test.tsx`

**Refactor minimo**:
Nessuno. I test mockano `window.sandobox` e verificano comportamento UI.

**Strategia concreta**:
- riusare `createSandoboxMock()` e fare override per `generateDockerfile`, `checkSandboxName`,
  `createSandbox`, `updateSandbox`, `onBuildProgress`
- usare `vi.useFakeTimers()` per il caso `build success naviga` (timeout 2.5s)
- per `editRecord`, preparare una fixture completa con `providers`, `permissions`, `git_config`
- verificare sia il payload di submit sia il testo di errore mostrato in UI

**Test**:

| # | Nome | Cosa verifica |
|---|------|---------------|
| 1 | submit fallisce con name vuoto | errore visualizzato |
| 2 | submit fallisce con caratteri non validi | errore visualizzato |
| 3 | submit fallisce senza projectMount | errore visualizzato |
| 4 | submit controlla nome duplicato | errore visualizzato se checkSandboxName=true |
| 5 | submit chiama createSandbox | config corretta inviata |
| 6 | update mode chiama updateSandbox | editRecord presente → update |
| 7 | build progress ricevuto | progress event → log visibili |
| 8 | build success naviga | after 2.5s chiama onCreated |
| 9 | build error mostra errore | errore da createSandbox mostrato |
| 10 | editRecord pre-popolato | campi edit record caricati |

~10 test.

**Acceptance minima**:
- almeno un test create e uno update
- almeno un test progress modal e uno error path

---

## Priorità 5bis — Renderer: `OpenCodePanel.tsx`

**File**: `tests/integration/renderer/OpenCodePanel.test.tsx`

**Refactor minimo**:
Nessuno. I test mockano `window.sandobox` e il hook `useOpenCode`.

**Strategia concreta**:
- mockare `useOpenCode` invece di `window.sandobox` per i test del componente puro
- creare un helper `makeUseOpenCodeState(overrides?)`
- coprire solo la logica di rendering/interazione del pannello, non ripetere i test dell'hook
- per la delete confirmation, verificare apertura modal e callback `deleteSession`

**Test**:

| # | Nome | Cosa verifica |
|---|------|---------------|
| 1 | connessione status | dot verde/rosso riflette `connected` |
| 2 | session selector | sessioni disponibili |
| 3 | send con sessione busy blocca | busy warning |
| 4 | permission banner | pending permissions visibili e reply |
| 5 | question banner | pending questions visibili e submit |
| 6 | diagnostic error | error message mostra in card |
| 7 | create new session | form e submit |
| 8 | delete conferma | confirm modal e delete |

~8 test.

**Acceptance minima**:
- almeno un test per stato busy, pending permission/question, delete flow

---

## Riepilogo milestone 2

| Priorità | Modulo | File test | Test previsti |
|----------|--------|-----------|---------------|
| 1 | Docker contract | `integration/electron/docker-contract.test.ts` | ~16 |
| 2 | Database | `unit/electron/database.test.ts` | ~31 |
| 3 | Preload | `unit/electron/preload.test.ts` | ~21 |
| 4 | Proxy | `unit/electron/proxy.test.ts` | ~12 |
| 5 | SandboxCreate | `integration/renderer/SandboxCreate.test.tsx` | ~10 |
| 5bis | OpenCodePanel | `integration/renderer/OpenCodePanel.test.tsx` | ~8 |

**Totale stimato**: ~98 test aggiuntivi, ~192 totali.

---

## Modifiche source necessarie

| File | Modifica | Perche' |
|------|----------|---------|
| `electron/database.ts` | Nessuna | I test mockano `electron` e usano `:memory:` |
| `electron/preload.ts` | Nessuna | I test mockano `contextBridge` e `ipcRenderer` |
| `electron/proxy.ts` | Nessuna | Classe autonoma |
| `electron/docker.ts` | Nessuna per ora | Il contract test usa solo funzioni esportate |

Non e' previsto refactor obbligatorio. Se durante l'implementazione emergono funzioni
interne da esportare, la modifica e' banale e limitata alla singola `export` keyword.

Refactor ammessi se utili ma non obbligatori:
- esportare helper puri da `electron/docker.ts`
- esportare un helper da `electron/proxy.ts` solo se serve per evitare parsing fragile nei test
- evitare refactor architetturali piu' grandi in questa milestone

---

## Ordine di implementazione consigliato

1. `tests/integration/electron/docker-contract.test.ts`
2. `tests/unit/electron/database.test.ts`
3. `tests/unit/electron/preload.test.ts`
4. `tests/unit/electron/proxy.test.ts`
5. `tests/integration/renderer/SandboxCreate.test.tsx`
6. `tests/integration/renderer/OpenCodePanel.test.tsx`

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
```

---

## Script opzionali

```json
"test:milestone2": "vitest run tests/unit/electron/database.test.ts tests/unit/electron/preload.test.ts tests/unit/electron/proxy.test.ts tests/integration/electron/docker-contract.test.ts tests/integration/renderer/SandboxCreate.test.tsx tests/integration/renderer/OpenCodePanel.test.tsx"
```

---

## Definition Of Done

La backlog e' considerata implementata correttamente quando:

1. tutti i nuovi file di test esistono e girano localmente
2. `npm run typecheck` e' verde
3. `npm test` resta verde sull'intera suite
4. i nuovi test coprono almeno i casi minimi indicati in ogni sezione
5. non vengono introdotti refactor strutturali non richiesti solo per rendere i test possibili

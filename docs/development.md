# Development Guide

## Prerequisites

- Node.js (v18+)
- npm
- Docker Desktop (required for sandbox operations)
- Git

## Setup

```bash
git clone https://github.com/your-org/arcypelabox.git
cd arcypelabox
npm install
```

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run electron:dev` | Full development: starts Vite, watches `electron/*.ts` into `dist-electron/`, launches Electron |
| `npm run dev` | Vite renderer only on `http://localhost:5173` (no Electron, no preload/main process) |
| `npm run dev:electron` | Electron TypeScript watcher only |
| `npm run typecheck` | TypeScript type checking for both renderer and Electron configs |
| `npm run build` | Produces `dist/` and `dist-electron/` |
| `npm run electron:build` | Packages into `release/` via electron-builder |

## Project Structure

```
arcypelabox/
├── src/                    # React renderer
│   ├── main.tsx            # Entry point
│   ├── App.tsx             # Main app component
│   ├── App.css             # App styles
│   ├── index.css           # Global styles, CSS custom properties (theme)
│   ├── types.ts            # Shared TypeScript types and constants
│   ├── components/         # UI components
│   ├── hooks/              # React hooks
├── electron/               # Electron main process
│   ├── main.ts             # Entry point, window creation, IPC handlers
│   ├── preload.ts          # contextBridge API for renderer
│   ├── docker.ts           # Docker lifecycle and image creation
│   ├── opencode.ts         # OpenCode SDK integration
│   ├── proxy.ts            # HTTP reverse proxy for sandbox containers
│   ├── api.ts              # Named pipe REST route registration
│   ├── ipc-server.ts       # Named pipe / Unix socket server
│   ├── ipc-client.ts       # Named pipe / Unix socket client
│   ├── database.ts         # SQLite database layer
├── docs/                   # Documentation
├── imgs/                   # Application icons
├── scripts/                # Utility scripts
├── index.html              # Vite entry HTML
├── package.json
├── vite.config.ts
├── tsconfig.json           # Renderer TypeScript config
├── tsconfig.node.json      # Electron TypeScript config
├── AGENTS.md               # AI agent instructions
```

## Code Conventions

### General

- TypeScript throughout with strict mode enabled
- No comments in code unless absolutely necessary
- Follow existing patterns for imports, error handling, and naming

### Renderer (src/)

- React functional components with hooks
- All colors defined as CSS custom properties in `src/index.css` (`:root` block)
- Never hardcode hex or rgb(a) values in component CSS or inline styles
- Each color has a companion `--<name>-rgb` variable for use with `rgba()`

### Electron (electron/)

- All IPC handlers are registered in `main.ts`
- Docker-related functions live in `docker.ts` (with `buildDockerCompose()` kept in sync with `createSandbox()`)
- OpenCode-related functions live in `opencode.ts` (all take `sandboxId` as the first parameter)
- API routes are registered in `api.ts` using `registerRoutes()`
- Error handling: wrap in try/catch, use `getErrorMessage()` for user-friendly messages

## Adding New Features

### Adding a new runtime, tool, or service

1. Add the value to the appropriate type in `src/types.ts` (`SandboxRuntime`, `SandboxTool`, or `SandboxService`)
2. Add the Dockerfile generation logic in `buildGeneratedDockerfile()` in `electron/docker.ts`
3. Add the install command in `buildDockerCompose()` in `electron/docker.ts` (must stay in sync with step 2)
4. The UI automatically picks up the new option from the constants in `types.ts`

### Adding a new IPC handler

1. Add the handler function to the appropriate module (`docker.ts`, `opencode.ts`, or `database.ts`)
2. Register the IPC handler in `main.ts` using `ipcMain.handle("sandobox:name", handler)`
3. Add the method to the preload bridge in `preload.ts`
4. Add the TypeScript type to `SandboxWindowApi` in `src/types.ts`

### Adding a new API endpoint

1. Add the route in `electron/api.ts` using `server.register(method, path, handler)`
2. For parameterized routes, use `:param` syntax (e.g., `/api/sandboxes/:id/info`)
3. Access parameters via `req.params!`
4. Handle errors with try/catch and `getErrorMessage()`

### Adding a new UI component

1. Create in `src/components/` following existing naming conventions
2. Use CSS custom properties for all colors
3. Import types from `src/types.ts`
4. Register in `App.tsx` if it introduces a new route or view

## Type Checking

```bash
npm run typecheck
```

This checks both TypeScript configurations:

- `tsconfig.json` -- covers the renderer (`src/`)
- `tsconfig.node.json` -- covers the Electron process (`electron/`)

No test or lint scripts are currently configured at the repo root.

## Building for Production

```bash
npm run build          # Build renderer + Electron TypeScript
npm run electron:build # Package into release/ directory
```

### Build Configuration

| Setting | Value |
|---------|-------|
| Builder | electron-builder (configured in `package.json` under the `build` key) |
| App ID | `com.arcypelabox` |
| Product name | `Arcypelabox` |
| Included files | `dist/`, `dist-electron/`, `imgs/` |
| Windows icon | `imgs/arcypelabox-logo-blu.ico` |
| Linux icon | `imgs/arcypelabox-logo-round.png` |

## Important Gotchas

- The create flow currently requires a project mount path in the UI before it will submit
- The renderer polls OpenCode state every 1.5 seconds for permissions, questions, sessions, and busy-session debug info -- changes here can add significant IPC and network traffic
- Docker Desktop / Docker Engine must be running for any sandbox actions
- Windows named pipe failures are mapped to a friendlier error message in `main.ts`
- `createSandbox()` and `buildDockerCompose()` in `electron/docker.ts` must always be kept in sync -- both produce the same environment (same env vars, network aliases, `cap_drop`, `opencode serve` command, and sidecar configuration)
- Postgres and Redis sidecar containers share the `sandobox.group` label and network; start, stop, and delete operations affect the entire group, not just the main sandbox container

# Arcypelabox

Desktop app for creating and managing Docker-based sandboxes that run an OpenCode server inside each sandbox.

## What It Does

- Creates sandbox containers from a generated Dockerfile based on UI selections
- Starts, stops, deletes, and inspects sandboxes from an Electron UI
- Optionally provisions Postgres and Redis sidecars per sandbox group
- Exposes an OpenCode panel for chat, permission replies, question replies, session status, and debug info
- Optionally bind-mounts a local project into `/workspace` inside the sandbox

## Tech Stack

- Electron main/preload process in `electron/`
- React + Vite renderer in `src/`
- Docker integration through `dockerode`
- OpenCode integration through `@opencode-ai/sdk` plus local HTTP endpoints

## Prerequisites

- Node.js
- npm
- Docker Desktop or a working Docker Engine

Sandbox actions depend on Docker being available locally.

## Install

```bash
npm install
```

## Development

Run the full app:

```bash
npm run electron:dev
```

Useful commands:

```bash
npm run dev            # Vite renderer only on http://localhost:5173
npm run dev:electron   # Electron TypeScript watcher only
npm run typecheck      # Checks renderer and Electron TypeScript configs
```

## Build

Create production build output:

```bash
npm run build
```

Create a packaged Electron app in `release/`:

```bash
npm run electron:build
```

## Project Structure

- `src/`: renderer app and sandbox management UI
- `electron/main.ts`: Electron window setup and all IPC handlers
- `electron/preload.ts`: safe bridge exposed as `window.sandobox`
- `electron/docker.ts`: Docker image build, container lifecycle, sidecar management
- `electron/opencode.ts`: OpenCode health, prompt, session, permission, and question handling

## Important Behavior

- The real sandbox image is generated in the UI (`src/components/SandboxCreate.tsx`) and built from a temp directory by `electron/docker.ts`.
- `docker/Dockerfile.sandbox` and `docker/docker-compose.yml` are not part of the main app flow.
- Sandbox containers are identified with the Docker label `sandobox.manager=true`.
- Postgres and Redis sidecars are grouped with the main sandbox using `sandobox.group`; lifecycle actions operate on the whole group.
- The create flow currently requires a project mount path before submission.

## Verification

Fastest meaningful check:

```bash
npm run typecheck
```

There are currently no root `test` or `lint` scripts.

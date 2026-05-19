## Commands

- Use `npm install`. This repo is wired for npm (`package-lock.json` is committed).
- Use `npm run electron:dev` for normal development. It starts Vite, watches `electron/*.ts` into `dist-electron/`, then launches Electron.
- `npm run dev` starts only the Vite renderer on port `5173`; it does not run Electron or the preload/main process.
- `npm run dev:electron` is only the Electron TypeScript watcher.
- Use `npm run typecheck` for the fastest meaningful verification. It checks both the renderer `tsconfig.json` and the Electron `tsconfig.node.json`.
- Use `npm run build` to produce `dist/` and `dist-electron/`. Use `npm run electron:build` only when you need a packaged app in `release/`.
- There are no `test` or `lint` scripts at the repo root.

## Architecture

- This is a single-package Electron app, not a monorepo.
- Renderer UI lives in `src/`. Electron main-process code lives in `electron/`.
- `electron/main.ts` owns all IPC handlers. `electron/preload.ts` is the only renderer bridge; renderer code talks through `window.sandobox`.
- Docker lifecycle and image creation are implemented in `electron/docker.ts`.
- OpenCode HTTP/SDK integration is implemented in `electron/opencode.ts`.

## Sandbox Flow

- The app does not build sandboxes from `docker/Dockerfile.sandbox`. Real sandbox images are generated in `src/components/SandboxCreate.tsx`, then written to a temp build dir and built by `electron/docker.ts`.
- `docker/Dockerfile.sandbox` and `docker/docker-compose.yml` are not used by the main app flow unless you run them manually.
- Sandbox containers are identified by the Docker label `sandobox.manager=true`.
- Postgres/Redis sidecars share a generated `sandobox.group` label and network. Start, stop, and delete actions operate on the whole group, not just the main sandbox container.
- If a sandbox has a project mount, the host path is bind-mounted to `/workspace` inside the container.

## Verified Gotchas

- The create flow currently requires a project mount path in the UI before it will submit.
- The renderer polls OpenCode state frequently (`1.5s`) for permissions, questions, sessions, and busy-session debug info; changes here can add a lot of IPC/network traffic quickly.
- Docker Desktop / Docker Engine must be running for sandbox actions. The app already maps the common Windows named-pipe failure to a friendlier error in `electron/main.ts`.

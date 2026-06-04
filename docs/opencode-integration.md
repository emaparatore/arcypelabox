# OpenCode Integration

## Overview

Each sandbox container runs an OpenCode server. Arcypelabox integrates with OpenCode through:

- `@opencode-ai/sdk/v2` (official SDK, dynamically imported)
- HTTP REST calls through the reverse proxy
- Server-Sent Events (SSE) for real-time updates
- All communication goes through the reverse proxy at `http://127.0.0.1:4096/{sandboxId}`

## SDK Client Initialization

The OpenCode SDK is dynamically imported to avoid bundling it in the renderer. The client is created with the sandbox's reverse proxy URL:

```typescript
// electron/opencode.ts
async function getClient(sandboxId: string) {
  const { createOpencodeClient } = await import("@opencode-ai/sdk/v2")
  return createOpencodeClient({
    baseUrl: getProxy().getUrl(sandboxId),
  })
}
```

The proxy URL format is: `http://127.0.0.1:4096/{sandboxId}`

## Available Functions

| Function | Description | Endpoint |
|----------|-------------|----------|
| checkHealth() | Ping the OpenCode server to check if it's running | `GET /` |
| sendPrompt() | Send a prompt and get response (blocking) | `POST /session/prompt` |
| sessionPromptAsync() | Send a prompt and return immediately (non-blocking) | `POST /session/prompt/async` |
| listProviders() | List available and connected LLM providers | `GET /provider/list` |
| createSession() | Create a new chat session | `POST /session/create` |
| deleteSession() | Delete a session | `POST /session/delete` |
| listSessions() | List all sessions with their status | `POST /session/list` |
| getSessionMessages() | Get all messages in a session | `POST /session/messages` |
| getOpenCodeSessionDebug() | Get debug info for the latest message | `POST /session/messages` |
| getAvailableSessionId() | Get idle session or create new one | `POST /session/list` + create |
| abortOpenCodeSession() | Abort a busy session | `POST /session/abort` |
| listPendingPermissions() | List pending permission requests | `GET /permission/list` |
| replyPermission() | Reply to a permission request (once/always/reject) | `POST /permission/reply` |
| listPendingQuestions() | List pending questions from the agent | `GET /question/list` |
| replyQuestion() | Submit answers to pending questions | `POST /question/reply` |
| subscribeToEvents() | Open SSE connection for real-time events | `GET /event` (SSE) |
| runShell() | Execute a shell command in the sandbox | `POST /session/shell` |

## Chat Flow

1. User selects a sandbox that is running
2. Renderer calls `window.sandobox.opencode.checkHealth(sandboxId)` every 1.5s
3. If healthy, renderer calls `window.sandobox.opencode.subscribeEvents(sandboxId)` to start SSE
4. SSE streams events to the renderer via the `sandobox:opencode:event` channel
5. State changes (sessions, permissions, questions) are batched and forwarded via `sandobox:opencode:state`
6. User sends a message -- `sendPrompt()` or `sessionPromptAsync()` is called
7. Response is rendered in the chat panel

## Permission System

Fifteen permission keys are configured at sandbox creation:

- `read`, `edit`, `write`, `glob`, `grep`, `bash`, `task`, `skill`, `question`, `todowrite`, `webfetch`, `websearch`, `lsp`, `external_directory`, `doom_loop`

Each permission can be set to one of three modes:

| Mode | Behavior |
|------|----------|
| `allow` | Auto-approved without user interaction |
| `ask` | User is prompted to approve or deny each request |
| `deny` | Blocked entirely |

When a permission in `ask` mode is triggered:

1. An event is received via SSE: `permission.request`
2. The UI shows a yellow banner with the permission name and patterns
3. The user selects: Allow Once, Always Allow, or Reject
4. `replyPermission()` sends the response back to OpenCode

## Question System

The AI agent can ask the user questions during a session:

- Questions arrive via SSE as `question.*` events
- The UI displays the question with available options (single or multiple choice)
- `replyQuestion()` sends the selected answers back to the agent

## Session Management

Multiple sessions can exist per sandbox, each configured with different providers and models.

- **Session creation dialog**: title (optional), provider dropdown, model dropdown
- **Session states**: idle, busy, retry, unknown
- Busy sessions block new prompts until the current operation completes
- An abort button forcefully terminates a stuck busy session
- Sessions are persisted on the OpenCode server and deleted via the SDK

## Provider Configuration

Arcypelabox supports 20+ LLM providers (see the `OPENCODE_PROVIDERS` list in `src/types.ts`):

- Provider selection uses an autocomplete dropdown in the setup wizard
- API keys are encrypted and injected via the Docker API at runtime
- `listProviders()` returns connected providers with their available models
- Session creation allows selection from the configured providers and their models

## SSE Event Subscription

The `subscribeToEvents()` function in `electron/opencode.ts`:

- Opens a fetch connection to `${proxyUrl}/event`
- Reads the SSE stream using a `ReadableStream` reader
- Parses `data:` lines as JSON events
- Implements auto-reconnect with exponential backoff (1s initial, 30s maximum)
- Uses `AbortController` for cleanup
- Event types: `session.*` (created, deleted, updated), `permission.*` (request, resolved), `question.*` (request, answered)

## Renderer Polling

The `useOpenCode.ts` hook polls OpenCode state every 1.5 seconds:

- Health checks
- Permission requests
- Question requests
- Session lists
- Busy-session debug information

This polling generates significant IPC and network traffic. Changes to polling frequency or scope should be made carefully.

## OpenCode CLI Integration

The "Open terminal" button generates a command to attach using the OpenCode CLI:

```bash
opencode attach http://localhost:4096/{sandboxId}
```

Optionally includes `--session {sessionId}` for attaching to a specific session.

The command opens in a new terminal window:

| Platform | Terminal |
|----------|----------|
| Windows | cmd.exe |
| macOS | Terminal.app |
| Linux | x-terminal-emulator, gnome-terminal, or xterm |

# Security Model

## Mount Path Validation

The `validateMountPath()` function in `electron/docker.ts` enforces that any mounted project path resides under the user's home directory.

- Symlinks are resolved to their real path before validation.
- `findSymlinks()` recursively scans the mount path (up to depth 12) for symlinks that point outside the project directory.
- If any offending symlink is found, an error listing all of them is thrown.
- Path normalization is OS-aware: case-insensitive on Windows.

```typescript
if (!normalize(realPath).startsWith(normalize(home))) {
  throw new Error('Mount path must be under home directory')
}
```

## Port Security

- All container ports are bound exclusively to `127.0.0.1`. No sandbox service is exposed to the network.
- The reverse proxy also listens only on `127.0.0.1:4096`.

## Dockerfile Injection Prevention

The named pipe REST API explicitly rejects two sensitive fields:

```typescript
// In api.ts
if (config?.generatedDockerfile) {
  return { status: 400, body: { error: "generatedDockerfile not accepted via API" } }
}
if (config?.customCommands) {
  return { status: 400, body: { error: "customCommands not accepted via API" } }
}
```

Custom Dockerfile commands and instructions are only accepted through the Electron UI, which requires the user to be physically at the keyboard. The UI displays a warning about malformed or malicious commands before allowing the build to proceed.

## API Key Encryption

- Provider API keys are encrypted using Electron's `safeStorage` API before being persisted.
- Encrypted keys are stored in the SQLite database.
- Keys are decrypted at runtime and injected into the running container via the Docker API (PostStart hook).
- Keys are **never** written to Docker environment variables, image layers, or exposed through `docker inspect`.

## Container Isolation

| Measure                 | Main Container      | Sidecars            |
|-------------------------|---------------------|---------------------|
| Capabilities            | `--cap-drop=ALL`    | `--cap-drop=ALL`    |
| Root filesystem         | Read-only (except `/workspace`) | Read-only |
| CPU limit               | 2                   | 1                   |
| Memory limit            | 2 GB                | 512 MB              |

Containers are ephemeral by design. Persistent workspace data lives on the host mount at `/workspace`.

## Named Pipe Access Control

- The named pipe (Windows) or Unix socket is only accessible to processes running on the same machine.
- No authentication is required; the security model is based on same-machine trust.
- Pipe paths:
  - Windows: `//./pipe/paratoolz-arcypelabox`
  - Unix: `/tmp/paratoolz-arcypelabox.sock`

## SSRF Protection

- The reverse proxy validates that all target ports are bound to `127.0.0.1`.
- Container-to-container communication uses Docker's internal DNS.
- External URL fetching by the AI agent is governed by the `webfetch` permission, not by the proxy.

## OpenCode Permission System

Arcypelabox exposes 15 configurable permission keys, each settable to one of three modes:

| Permission Key       | Default  | Description                            |
|----------------------|----------|----------------------------------------|
| `read`               | allow    | Read file contents                     |
| `edit`               | allow    | Edit files                             |
| `write`              | allow    | Write new files                        |
| `glob`               | allow    | Search filenames by pattern            |
| `grep`               | allow    | Search file contents by regex          |
| `bash`               | allow    | Execute shell commands                 |
| `task`               | allow    | Use subtask management                 |
| `skill`              | allow    | Load specialized skills                |
| `question`           | allow    | Ask the user questions                 |
| `todowrite`          | allow    | Write todo entries                     |
| `webfetch`           | allow    | Fetch external URLs                    |
| `websearch`          | allow    | Search the web                         |
| `lsp`                | allow    | Use language server features           |
| `external_directory` | allow    | Access directories outside workspace   |
| `doom_loop`          | deny     | Execute open-ended automated loops     |

When a permission is set to `ask`, the user is prompted via a UI banner with three choices: Allow Once, Always Allow, or Reject. Permissions are configured at sandbox creation time.

## Database Security

- The SQLite database is stored at `%APPDATA%/sandbox-manager/sandbox.db`.
- Only sandbox metadata is stored; API keys are never stored in plaintext.
- Chat messages are stored locally and scoped to individual sandboxes.

## Container Name Sanitization

Sandbox names are validated before use:

- Must start with a letter or number.
- May only contain `a-z`, `0-9`, `-`, `_`, `.`.
- Maximum length: 64 characters.

Validated names are used to generate the Docker image tag: `arcypelabox-base:{name}`.

## Security Recommendations

1. Keep Docker Desktop updated to the latest version.
2. Review custom Dockerfile commands carefully before building an image.
3. Do not share the named pipe socket path with untrusted applications.

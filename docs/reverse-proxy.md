# Reverse Proxy System

## Problem

Each sandbox container exposes OpenCode on a dynamically assigned host port. Tracking these ports and managing direct container access is cumbersome for both external tools and the OpenCode SDK.

## Solution: Path-Based HTTP Proxy

Arcypelabox runs an HTTP reverse proxy on `127.0.0.1:4096` that routes requests based on the sandbox UUID embedded in the URL path:

```
http://localhost:4096/{sandboxId}/api/...
```

## Implementation

The proxy is implemented in `electron/proxy.ts` as the `SandboxProxy` class, which wraps `http.Server`.

### Core Data Structure

A `routes` map (`Map<string, ContainerTarget>`) associates each sandbox UUID with a target `{ host, port }` pair.

### Request Handling

1. Parse the URL path and extract the first segment as the `sandboxId`.
2. Look up the `sandboxId` in the routes map.
3. Rewrite the path by removing the leading `sandboxId` segment.
4. Proxy the rewritten request to the container's actual `host:port`.

### HTTP Upgrade Support

The proxy handles the `upgrade` event to support SSE streaming and other WebSocket-like protocols. When an upgrade request arrives, the proxy forwards it to the target container, enabling real-time event streaming from the OpenCode server to the UI.

### Debug Endpoint

```
GET http://localhost:4096/__proxy/routes
```

Returns a JSON map of all registered sandbox IDs and their target containers.

### Error Handling

| Status Code | Condition                                    |
|-------------|----------------------------------------------|
| 404         | Unknown or unregistered sandbox ID           |
| 502         | Target container is unreachable or refusing   |

## Container Registration

- **On create**: `proxy.register(sandboxId, target)` is called from `docker.ts` after the container starts.
- **On startup**: `registerExistingSandboxes()` scans all containers with the `sandobox.manager=true` label and re-registers them with the proxy.
- **On removal**: `proxy.unregister(sandboxId)` is called to remove the route.

The proxy follows a singleton pattern exposed via `setProxy()` and `getProxy()`.

## Usage with OpenCode SDK

All OpenCode SDK calls use the proxy URL instead of connecting directly to the container:

```typescript
// In opencode.ts
const client = createOpencodeClient({
  baseUrl: getProxy().getUrl(sandboxId),
  // Resolves to: http://127.0.0.1:4096/{sandboxId}
})
```

## SSE Event Streaming

The `subscribeToEvents()` function in `opencode.ts` connects via `fetch` to the proxy URL at the `/event` path:

```
GET http://localhost:4096/{sandboxId}/event
```

The proxy forwards the HTTP upgrade to the target container, enabling real-time streaming of AI agent events to the UI.

## Proxy URL in the UI

The sandbox detail view (Info tab) displays the proxy URL as the "SDK URL." Users can click to copy:

```
http://localhost:4096/{sandboxId}
```

This URL is also used for the "Open Web UI" link.

## Debugging

```bash
# List all registered routes
curl http://localhost:4096/__proxy/routes
```

Example response:

```json
{
  "a1b2c3d4-e5f6-7890-abcd-ef1234567890": {
    "host": "127.0.0.1",
    "port": 54321
  }
}
```

## Architecture Note

The proxy enables external applications and the OpenCode CLI to connect to any sandbox without knowledge of the underlying Docker port mapping:

```bash
opencode attach http://localhost:4096/{sandboxId}
```

This is how the "Open terminal" button works -- it launches a terminal with the `opencode attach` command pre-configured with the proxy URL.

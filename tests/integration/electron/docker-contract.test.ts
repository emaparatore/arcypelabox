import { EventEmitter } from "node:events"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const dockerState = vi.hoisted(() => {
  const state = {
    createdContainers: [] as any[],
    createdNetworks: [] as any[],
    networkConnects: [] as any[],
    spawnCalls: [] as any[],
    proxyRegisters: [] as any[],
    dbRecord: null as Record<string, unknown> | null,
    mainContainer: null as any,
    serviceContainers: new Map<string, any>(),
  }

  const createContainerHandle = (id: string, image: string) => ({
    id,
    start: vi.fn(async () => undefined),
    inspect: vi.fn(async () => ({
      Id: id,
      Config: { Image: image, Labels: { "sandobox.id": "sandbox-1" } },
      NetworkSettings: { Ports: { "4096/tcp": [{ HostPort: "49123" }] } },
    })),
  })

  return {
    state,
    reset() {
      state.createdContainers = []
      state.createdNetworks = []
      state.networkConnects = []
      state.spawnCalls = []
      state.proxyRegisters = []
      state.dbRecord = null
      state.mainContainer = createContainerHandle("container-main", "arcypelabox-base:test")
      state.serviceContainers = new Map()
    },
    createContainerHandle,
  }
})

vi.mock("dockerode", () => {
  return {
    default: class DockerMock {
      createContainer = vi.fn(async (payload: any) => {
        dockerState.state.createdContainers.push(payload)
        if (payload.ExposedPorts?.["4096/tcp"]) {
          dockerState.state.mainContainer = dockerState.createContainerHandle("container-main", payload.Image)
          return dockerState.state.mainContainer
        }

        const serviceId = `${payload.name}-id`
        const handle = dockerState.createContainerHandle(serviceId, payload.Image)
        dockerState.state.serviceContainers.set(payload.name, handle)
        return handle
      })

      getContainer = vi.fn((name: string) => {
        if (dockerState.state.serviceContainers.has(name)) return dockerState.state.serviceContainers.get(name)
        return {
          inspect: vi.fn(async () => {
            throw new Error("not found")
          }),
          start: vi.fn(async () => undefined),
        }
      })

      getNetwork = vi.fn((_name: string) => ({
        inspect: vi.fn(async () => {
          throw new Error("missing network")
        }),
        connect: vi.fn(async (payload: any) => {
          dockerState.state.networkConnects.push(payload)
        }),
      }))

      createNetwork = vi.fn(async (payload: any) => {
        dockerState.state.createdNetworks.push(payload)
      })
    },
  }
})

vi.mock("node:child_process", () => ({
  spawn: vi.fn((command: string, args: string[]) => {
    dockerState.state.spawnCalls.push([command, args])
    const proc = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter
      stderr: EventEmitter
    }
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()

    if (args[0] === "build") {
      queueMicrotask(() => {
        proc.stdout.emit("data", Buffer.from("#1 load metadata for docker.io/library/node\n"))
        proc.emit("exit", 0)
      })
    }

    return proc
  }),
}))

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")
  return {
    ...actual,
    writeFile: vi.fn(async () => undefined),
    mkdtemp: vi.fn(async () => "C:/tmp/sandobox-build-123"),
    rm: vi.fn(async () => undefined),
    lstat: vi.fn(async () => {
      throw new Error("missing path")
    }),
    readdir: vi.fn(async () => []),
    readlink: vi.fn(async () => ""),
  }
})

vi.mock("../../../electron/proxy.js", () => ({
  getProxy: () => ({
    register: vi.fn((sandboxId: string, target: any) => {
      dockerState.state.proxyRegisters.push({ sandboxId, target })
    }),
    unregister: vi.fn(),
    getUrl: vi.fn((sandboxId: string) => `http://127.0.0.1:4096/${sandboxId}`),
  }),
}))

vi.mock("../../../electron/database.js", () => ({
  getSandboxRecordFull: vi.fn((sandboxId: string) => {
    if (sandboxId === "sandbox-1") return dockerState.state.dbRecord
    return null
  }),
}))

function makeSandboxRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "sandbox-1",
    name: "My Sandbox",
    image_tag: "arcypelabox-base:my-sandbox",
    project_mount: null,
    runtimes: ["node"],
    tools: ["git"],
    services: [],
    providers: null,
    permissions: { read: "allow", bash: "ask", webfetch: "deny" },
    generated_dockerfile: "FROM node:20-bookworm-slim",
    git_config: null,
    docker_container_id: "container-main",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeCreateConfig(overrides: Record<string, unknown> = {}) {
  return {
    sandboxId: "sandbox-1",
    name: "My Sandbox",
    image: "arcypelabox-base:my-sandbox",
    generatedDockerfile: "FROM node:20-bookworm-slim",
    permissions: { read: "allow", bash: "ask", webfetch: "deny" },
    runtimes: ["node"],
    tools: ["git"],
    services: [],
    ...overrides,
  }
}

function extractMainPayload() {
  const payload = dockerState.state.createdContainers.find((entry) => entry.ExposedPorts?.["4096/tcp"])
  if (!payload) throw new Error("Missing main container payload")
  return payload
}

function expectComposeContainsCoreContract(compose: string) {
  expect(compose).toContain("cap_drop:")
  expect(compose).toContain("- ALL")
  expect(compose).toContain('cpus: "2"')
  expect(compose).toContain("memory: 2GB")
  expect(compose).toContain("opencode serve --port 4096 --hostname 0.0.0.0")
  expect(compose).toContain("printf '%s' \"$$OPENCODE_CONFIG\"")
  expect(compose).toContain("driver: bridge")
}

function expectCreatePayloadMatchesContract(payload: any) {
  expect(payload.HostConfig.CapDrop).toEqual(["ALL"])
  expect(payload.HostConfig.NanoCpus).toBe(2_000_000_000)
  expect(payload.HostConfig.Memory).toBe(2 * 1024 * 1024 * 1024)
  expect(payload.Env).toContain("SANDBOX_WORKSPACE=/workspace")
  expect(payload.Cmd[2]).toContain("printf '%s' \"$OPENCODE_CONFIG\"")
  expect(payload.Cmd[2]).toContain("opencode serve --port 4096 --hostname 0.0.0.0")
}

beforeEach(() => {
  dockerState.reset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("electron/docker contract", () => {
  it("keeps the core sandbox contract aligned between createSandbox and buildDockerCompose", async () => {
    dockerState.state.dbRecord = makeSandboxRecord()
    const docker = await import("../../../electron/docker.js")

    const compose = docker.buildDockerCompose("sandbox-1")
    await docker.createSandbox(makeCreateConfig() as any)

    const payload = extractMainPayload()
    const composeConfig = JSON.parse(compose.match(/OPENCODE_CONFIG: '([^']+)'/)?.[1] ?? "{}")
    const payloadConfig = JSON.parse((payload.Env.find((entry: string) => entry.startsWith("OPENCODE_CONFIG=")) as string).slice("OPENCODE_CONFIG=".length))

    expectComposeContainsCoreContract(compose)
    expectCreatePayloadMatchesContract(payload)
    expect(compose).toContain("SANDBOX_WORKSPACE: /workspace")
    expect(payload.Env).toContain("SANDBOX_WORKSPACE=/workspace")
    expect(composeConfig.permission).toEqual(payloadConfig.permission)
    expect(dockerState.state.networkConnects).toContainEqual({
      Container: "container-main",
      EndpointConfig: { Aliases: ["sandbox"] },
    })
  })

  it("keeps postgres sidecar env and aliases aligned", async () => {
    dockerState.state.dbRecord = makeSandboxRecord({ services: ["postgres"] })
    const docker = await import("../../../electron/docker.js")

    const compose = docker.buildDockerCompose("sandbox-1")
    await docker.createSandbox(makeCreateConfig({ services: ["postgres"] }) as any)

    const payload = extractMainPayload()
    const postgresPayload = dockerState.state.createdContainers.find((entry) => entry.Image === "postgres:16-alpine")

    expect(compose).toContain("POSTGRES_HOST: postgres")
    expect(compose).toContain("POSTGRES_PORT: \"5432\"")
    expect(payload.Env).toContain("POSTGRES_HOST=postgres")
    expect(payload.Env).toContain("POSTGRES_PORT=5432")
    expect(postgresPayload.Env).toEqual([
      "POSTGRES_USER=sandbox",
      "POSTGRES_PASSWORD=sandbox",
      "POSTGRES_DB=sandbox",
    ])
    expect(dockerState.state.networkConnects).toContainEqual({
      Container: postgresPayload.name + "-id",
      EndpointConfig: { Aliases: ["postgres"] },
    })
  })

  it("keeps redis sidecar env, aliases and memory aligned", async () => {
    dockerState.state.dbRecord = makeSandboxRecord({ services: ["redis"] })
    const docker = await import("../../../electron/docker.js")

    const compose = docker.buildDockerCompose("sandbox-1")
    await docker.createSandbox(makeCreateConfig({ services: ["redis"] }) as any)

    const payload = extractMainPayload()
    const redisPayload = dockerState.state.createdContainers.find((entry) => entry.Image === "redis:7-alpine")

    expect(compose).toContain("REDIS_HOST: redis")
    expect(compose).toContain("REDIS_PORT: \"6379\"")
    expect(compose).toContain("memory: 512M")
    expect(payload.Env).toContain("REDIS_HOST=redis")
    expect(payload.Env).toContain("REDIS_PORT=6379")
    expect(redisPayload.HostConfig.Memory).toBe(512 * 1024 * 1024)
    expect(dockerState.state.networkConnects).toContainEqual({
      Container: redisPayload.name + "-id",
      EndpointConfig: { Aliases: ["redis"] },
    })
  })

  it("keeps provider config and permissions aligned inside OPENCODE_CONFIG", async () => {
    const providers = [{ id: "openai", apiKey: "sk-1" }, { id: "anthropic", apiKey: "sk-2" }]
    const permissions = { read: "allow", bash: "deny", task: "ask" }
    dockerState.state.dbRecord = makeSandboxRecord({ providers, permissions })
    const docker = await import("../../../electron/docker.js")

    const compose = docker.buildDockerCompose("sandbox-1")
    await docker.createSandbox(makeCreateConfig({ providers, permissions }) as any)

    const payload = extractMainPayload()
    const composeConfig = JSON.parse(compose.match(/OPENCODE_CONFIG: '([^']+)'/)?.[1] ?? "{}")
    const payloadConfig = JSON.parse((payload.Env.find((entry: string) => entry.startsWith("OPENCODE_CONFIG=")) as string).slice("OPENCODE_CONFIG=".length))

    expect(composeConfig.provider).toEqual(payloadConfig.provider)
    expect(composeConfig.permission).toEqual(payloadConfig.permission)
    expect(payloadConfig.permission.doom_loop).toBe("deny")
  })

  it("keeps project mount configuration aligned and omits volumes when absent", async () => {
    dockerState.state.dbRecord = makeSandboxRecord({ project_mount: "C:/Users/emapa/project" })
    const docker = await import("../../../electron/docker.js")

    const composeWithMount = docker.buildDockerCompose("sandbox-1")
    await docker.createSandbox(makeCreateConfig({ projectMount: "C:/Users/emapa/project" }) as any)
    const payloadWithMount = extractMainPayload()

    expect(composeWithMount).toContain("C:/Users/emapa/project:/workspace")
    expect(payloadWithMount.HostConfig.Binds).toEqual(["C:/Users/emapa/project:/workspace"])

    dockerState.reset()
    dockerState.state.dbRecord = makeSandboxRecord({ project_mount: null })
    const composeWithoutMount = docker.buildDockerCompose("sandbox-1")
    await docker.createSandbox(makeCreateConfig() as any)
    const payloadWithoutMount = extractMainPayload()

    expect(composeWithoutMount).not.toContain("volumes:")
    expect(payloadWithoutMount.HostConfig.Binds).toBeUndefined()
  })

  it("creates a bridge network and registers the sandbox with the proxy", async () => {
    dockerState.state.dbRecord = makeSandboxRecord()
    const docker = await import("../../../electron/docker.js")

    const compose = docker.buildDockerCompose("sandbox-1")
    await docker.createSandbox(makeCreateConfig() as any)

    expect(compose).toContain("driver: bridge")
    expect(dockerState.state.createdNetworks).toEqual([
      { Name: "sandobox-my-sandbox-net", Labels: { "sandobox.network": "true" } },
    ])
    expect(dockerState.state.proxyRegisters).toEqual([
      { sandboxId: "sandbox-1", target: { host: "127.0.0.1", port: 49123 } },
    ])
  })
})

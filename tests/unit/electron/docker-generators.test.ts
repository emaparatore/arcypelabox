import { describe, it, expect } from "vitest"
import {
  buildGeneratedDockerfile,
  buildOpenCodeConfig,
  sanitizeContainerName,
  createGroupName,
  parseDockerLogs,
  sanitizeError,
  describeBuildStep,
} from "../../../electron/docker.js"
import type { SandboxConfig } from "../../../electron/docker.js"

describe("buildGeneratedDockerfile", () => {
  it("produces a valid Dockerfile with defaults", () => {
    const df = buildGeneratedDockerfile({})
    expect(df).toContain("FROM node:20-bookworm-slim")
    expect(df).toContain("WORKDIR /workspace")
    expect(df).toContain("npm install -g opencode-ai")
    expect(df).toContain("CMD")
  })

  it("includes requested runtimes", () => {
    const df = buildGeneratedDockerfile({ runtimes: ["python", "go"] })
    expect(df).toContain("python3")
    expect(df).toContain("golang")
  })

  it("includes requested tools as apt packages", () => {
    const df = buildGeneratedDockerfile({ tools: ["vim", "curl", "git"] })
    expect(df).toContain("vim")
    expect(df).toContain("ca-certificates")
  })

  it("includes tool-specific setup steps", () => {
    const df = buildGeneratedDockerfile({ tools: ["pnpm", "bun", "gh"] })
    expect(df).toContain("corepack enable")
    expect(df).toContain("npm install -g bun")
    expect(df).toContain("githubcli")
  })

  it("includes git config when git is selected", () => {
    const df = buildGeneratedDockerfile({
      tools: ["git"],
      gitConfig: { userName: "Test", userEmail: "test@example.com", autocrlf: "input" },
    })
    expect(df).toContain('user.name "Test"')
    expect(df).toContain('user.email "test@example.com"')
    expect(df).toContain("core.autocrlf input")
    expect(df).toContain("safe.directory /workspace")
  })

  it("escapes double quotes in git config values", () => {
    const df = buildGeneratedDockerfile({
      tools: ["git"],
      gitConfig: { userName: 'Te"st', userEmail: "test@example.com", autocrlf: "input" },
    })
    expect(df).toContain('Te\\"st')
  })

  it("includes custom commands verbatim", () => {
    const df = buildGeneratedDockerfile({ customCommands: "RUN echo hello\nRUN echo world" })
    expect(df).toContain("RUN echo hello")
    expect(df).toContain("RUN echo world")
  })

  it("throws for invalid runtime", () => {
    expect(() => buildGeneratedDockerfile({ runtimes: ["nonexistent" as any] })).toThrow("Invalid runtime")
  })

  it("throws for invalid tool", () => {
    expect(() => buildGeneratedDockerfile({ tools: ["nonexistent" as any] })).toThrow("Invalid tool")
  })

  it("throws for invalid service", () => {
    expect(() => buildGeneratedDockerfile({ services: ["nonexistent" as any] })).toThrow("Invalid service")
  })
})

describe("buildOpenCodeConfig", () => {
  const baseConfig = {
    name: "test",
    image: "test:latest",
    generatedDockerfile: "",
    runtimes: ["node"],
    tools: ["git"],
    services: [],
    permissions: { read: "allow", bash: "allow" },
  } satisfies SandboxConfig

  it("produces config with permissions", () => {
    const config = JSON.parse(buildOpenCodeConfig(baseConfig))
    expect(config.permission.read).toBe("allow")
    expect(config.permission.bash).toBe("allow")
    expect(config.permission.doom_loop).toBe("deny")
    expect(config.agent.build.steps).toBe(100)
  })

  it("includes provider map when providers are set", () => {
    const config = buildOpenCodeConfig({
      ...baseConfig,
      providers: [{ id: "anthropic", apiKey: "sk-xxx" }],
    })
    const parsed = JSON.parse(config)
    expect(parsed.provider.anthropic).toBeDefined()
    expect(parsed.provider.anthropic.options).toEqual({})
  })

  it("converts 'ask' permission value correctly", () => {
    const config = JSON.parse(buildOpenCodeConfig({
      ...baseConfig,
      permissions: { read: "ask" },
    }))
    expect(config.permission.read).toBe("ask")
  })

  it("converts 'deny' permission value correctly", () => {
    const config = JSON.parse(buildOpenCodeConfig({
      ...baseConfig,
      permissions: { read: "deny" },
    }))
    expect(config.permission.read).toBe("deny")
  })
})

describe("sanitizeContainerName", () => {
  it("normalizes name to lowercase alphanumeric and hyphens", () => {
    expect(sanitizeContainerName("My Sandbox")).toBe("my-sandbox")
  })

  it("removes leading/trailing hyphens", () => {
    expect(sanitizeContainerName("--hello--")).toBe("hello")
  })

  it("throws for empty result", () => {
    expect(() => sanitizeContainerName("---")).toThrow("at least one alphanumeric character")
  })

  it("throws for name exceeding 64 characters", () => {
    expect(() => sanitizeContainerName("a".repeat(65))).toThrow("64 characters or fewer")
  })
})

describe("createGroupName", () => {
  it("creates a group name prefixed with sandobox-", () => {
    const name = createGroupName("test-sandbox")
    expect(name).toMatch(/^sandobox-test-sandbox$/)
  })

  it("normalizes special characters", () => {
    const name = createGroupName("My Sandbox!")
    expect(name).toMatch(/^sandobox-my-sandbox/)
  })
})

describe("parseDockerLogs", () => {
  it("parses lines with timestamp prefix", () => {
    const raw = "2024-01-01T00:00:00Z Container started\n2024-01-01T00:00:01Z Health check passed"
    const logs = parseDockerLogs(raw)
    expect(logs).toHaveLength(2)
    expect(logs[0].time).toBe("2024-01-01T00:00:00Z")
    expect(logs[0].message).toBe("Container started")
  })

  it("handles lines without timestamp", () => {
    const logs = parseDockerLogs("hello")
    expect(logs).toHaveLength(1)
    expect(logs[0].time).toBe("")
    expect(logs[0].message).toBe("hello")
  })

  it("filters empty lines", () => {
    const logs = parseDockerLogs("line1\n\n\nline2")
    expect(logs).toHaveLength(2)
  })
})

describe("sanitizeError", () => {
  it("masks sk- API keys in error text", () => {
    const result = sanitizeError("Error: invalid key sk-abc123def456")
    expect(result).toContain("sk-***")
    expect(result).not.toContain("sk-abc123def456")
  })

  it("masks api_key patterns", () => {
    const result = sanitizeError('api_key: "secret-key-here"')
    expect(result).toContain('api_key: "***')
  })

  it("passes through text without keys", () => {
    const result = sanitizeError("Everything is fine")
    expect(result).toBe("Everything is fine")
  })
})

describe("describeBuildStep", () => {
  it("detects metadata download step", () => {
    const step = describeBuildStep("#1 load metadata for docker.io/library/node")
    expect(step).toContain("Downloading base Docker image metadata")
  })

  it("detects registry auth step", () => {
    const step = describeBuildStep("[auth] authenticating with registry")
    expect(step).toContain("Authenticating")
  })

  it("detects apt-get update step", () => {
    const step = describeBuildStep("#5 3/5] RUN apt-get update && apt-get install -y git")
    expect(step).toBe("Installing system packages via apt-get…")
  })

  it("detects zig install step", () => {
    const step = describeBuildStep("#3 2/5] RUN curl -fsSL https://ziglang.org/download/...")
    expect(step).toBe("Downloading and installing Zig…")
  })

  it("returns null for unknown steps", () => {
    const step = describeBuildStep("#10 RUN echo hello")
    expect(step).toBeNull()
  })
})

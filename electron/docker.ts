import Docker from "dockerode"
import { randomUUID } from "node:crypto"
import { execFile } from "node:child_process"
import { readdir, lstat, readlink, writeFile, mkdtemp, rm } from "node:fs/promises"
import { realpathSync } from "node:fs"
import { tmpdir, homedir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

const docker = new Docker()
const execFileAsync = promisify(execFile)

async function findSymlinks(root: string, maxDepth = 12): Promise<string[]> {
  const results: string[] = []
  const normalize = (p: string) => (process.platform === "win32" ? p.toLowerCase() : p)
  const rootNormalized = normalize(path.resolve(root))
  const visited = new Set<string>()

  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return
    const dirNormalized = normalize(path.resolve(dir))
    if (visited.has(dirNormalized)) return
    visited.add(dirNormalized)

    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry)
      try {
        const stat = await lstat(fullPath)
        if (stat.isSymbolicLink()) {
          const target = await readlink(fullPath)
          const absoluteTarget = path.resolve(path.dirname(fullPath), target)
          if (!normalize(absoluteTarget).startsWith(rootNormalized)) {
            results.push(`${fullPath} -> ${target} (outside project mount)`)
          } else {
            const targetStat = await lstat(absoluteTarget)
            if (targetStat.isDirectory()) {
              await walk(absoluteTarget, depth + 1)
            }
          }
        } else if (stat.isDirectory()) {
          await walk(fullPath, depth + 1)
        }
      } catch {
        /* skip unreadable */
      }
    }
  }

  await walk(root, 0)
  return results
}

async function validateMountPath(projectMount: string): Promise<void> {
  const resolved = path.resolve(projectMount)
  let realPath: string
  try {
    realPath = realpathSync(resolved)
  } catch {
    realPath = resolved
  }

  const home = homedir()
  const normalize = (p: string) => (process.platform === "win32" ? p.toLowerCase() : p)

  if (!normalize(realPath).startsWith(normalize(home))) {
    throw new Error(
      `Mount path must be under your home directory (${home}). ` +
        `Path "${projectMount}" resolves to "${realPath}".`
    )
  }

  let isDir = false
  try {
    isDir = (await lstat(realPath)).isDirectory()
  } catch {
    /* path doesn't exist yet, OK */
  }

  if (isDir) {
    const symlinks = await findSymlinks(realPath)
    if (symlinks.length > 0) {
      throw new Error(
        `Mount path contains symlinks pointing outside the project directory.\n` +
          `Remove or replace them with direct copies:\n` +
          symlinks.map((s) => `  - ${s}`).join("\n")
      )
    }
  }
}

export interface ProviderConfig {
  id: string
  apiKey: string
}

export interface SandboxConfig {
  sandboxId?: string
  name: string
  image: string
  opencodePort: number
  generatedDockerfile: string
  projectMount?: string
  permissions: Record<string, string>
  runtimes: Array<"node" | "python" | "dotnet">
  tools: Array<"git" | "curl" | "wget" | "vim" | "build-essential" | "sqlite" | "pnpm" | "bun">
  services: Array<"postgres" | "redis">
  providers?: ProviderConfig[]
}

export interface SandboxInfo {
  id: string
  sandboxId: string
  name: string
  image: string
  opencodePort: number
  status: string
  projectMount?: string
  createdAt: string
}

export interface ContainerLog {
  time: string
  message: string
}

export async function listSandboxes(): Promise<SandboxInfo[]> {
  const containers = await docker.listContainers({ all: true })
  return containers
    .filter((c) => c.Labels?.["sandobox.manager"] === "true")
    .map((c) => ({
      id: c.Id,
      sandboxId: c.Labels?.["sandobox.id"] ?? c.Id,
      name: (c.Names?.[0] ?? "").replace(/^\//, ""),
      image: c.Image,
      opencodePort: parseInt(c.Labels?.["sandobox.opencode.port"] ?? "0"),
      status: c.State ?? "unknown",
      projectMount: c.Labels?.["sandobox.project.mount"],
      createdAt: c.Created?.toString() ?? "",
    }))
}

function sanitizeError(text: string): string {
  return text.replace(/(sk-|api[_-]?key["']?\s*:\s*["']?)[a-zA-Z0-9_-]+/gi, "$1***")
}

async function injectApiKey(
  port: number,
  providerId: string,
  apiKey: string,
  maxAttempts = 15,
): Promise<void> {
  const baseUrl = `http://127.0.0.1:${port}`

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const healthRes = await fetch(`${baseUrl}/global/health`, { signal: AbortSignal.timeout(3000) })
      if (!healthRes.ok) {
        await new Promise((r) => setTimeout(r, 1000))
        continue
      }

      const authRes = await fetch(`${baseUrl}/auth/${encodeURIComponent(providerId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "api", key: apiKey }),
        signal: AbortSignal.timeout(5000),
      })

      if (!authRes.ok) {
        const text = await authRes.text()
        console.error(`[docker] Auth injection failed (${authRes.status}): ${sanitizeError(text)}`)
        return
      }

      return
    } catch (err) {
      if (attempt === maxAttempts) {
        console.error(`[docker] Auth injection failed after ${maxAttempts} attempts:`, err)
        return
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

export async function createSandbox(config: SandboxConfig): Promise<string> {
  if (config.projectMount) {
    await validateMountPath(config.projectMount)
  }

  const containerName = sanitizeContainerName(config.name)
  const image = await buildImage(config.image, config.generatedDockerfile)
  const opencodeConfig = buildOpenCodeConfig(config)
  const group = createGroupName(config.name)
  const networkName = `${group}-net`

  await ensureNetwork(networkName)
  await ensureServiceContainers(containerName, config, group, networkName)

  const container = await docker.createContainer({
    name: containerName,
    Image: image,
    Labels: {
      "sandobox.manager": "true",
      "sandobox.id": config.sandboxId ?? "",
      "sandobox.group": group,
      "sandobox.opencode.port": config.opencodePort.toString(),
      "sandobox.project.mount": config.projectMount ?? "",
      "sandobox.services": config.services.join(","),
    },
    ExposedPorts: {
      [`${config.opencodePort}/tcp`]: {},
    },
    HostConfig: {
      PortBindings: {
        [`${config.opencodePort}/tcp`]: [{ HostPort: config.opencodePort.toString(), HostIp: "127.0.0.1" }],
      },
      ...(config.projectMount
        ? {
            Binds: [`${config.projectMount}:/workspace`],
          }
        : {}),
    },
    Env: [
      `OPENCODE_CONFIG=${opencodeConfig}`,
      "SANDBOX_WORKSPACE=/workspace",
      ...(config.services.includes("postgres")
        ? [
            "POSTGRES_HOST=postgres",
            "POSTGRES_PORT=5432",
            "POSTGRES_USER=sandbox",
            "POSTGRES_PASSWORD=sandbox",
            "POSTGRES_DB=sandbox",
          ]
        : []),
      ...(config.services.includes("redis") ? ["REDIS_HOST=redis", "REDIS_PORT=6379"] : []),
    ],
    Cmd: [
      "sh",
      "-c",
      `mkdir -p /root/.config/opencode && printf '%s' "$OPENCODE_CONFIG" > /root/.config/opencode/opencode.json && unset OPENCODE_CONFIG && opencode serve --port ${config.opencodePort} --hostname 0.0.0.0`,
    ],
  })

  await docker.getNetwork(networkName).connect({
    Container: container.id,
    EndpointConfig: {
      Aliases: ["sandbox"],
    },
  })

  await container.start()

  if (config.providers) {
    for (const p of config.providers) {
      injectApiKey(config.opencodePort, p.id, p.apiKey).catch((err) =>
        console.error(`[docker] injectApiKey for ${p.id} failed:`, err),
      )
    }
  }

  return container.id
}

export async function startSandbox(id: string): Promise<void> {
  const container = docker.getContainer(id)
  const info = await container.inspect()
  const group = info.Config.Labels?.["sandobox.group"]
  await startGroupContainers(group ?? id)
}

export async function stopSandbox(id: string): Promise<void> {
  const container = docker.getContainer(id)
  const info = await container.inspect()
  const group = info.Config.Labels?.["sandobox.group"]
  await stopGroupContainers(group ?? id)
}

export async function removeSandbox(id: string): Promise<void> {
  const container = docker.getContainer(id)
  const info = await container.inspect()
  const group = info.Config.Labels?.["sandobox.group"] ?? id
  const networkName = `${group}-net`

  const groupContainers = await findGroupContainers(group)
  await Promise.all(
    groupContainers.map(async (entry) => {
      try {
        await docker.getContainer(entry.Id).remove({ force: true })
      } catch {
        return
      }
    })
  )

  try {
    await docker.getNetwork(networkName).remove()
  } catch {
    return
  }
}

export async function getSandboxLogs(id: string): Promise<ContainerLog[]> {
  const container = docker.getContainer(id)
  const logs = await container.logs({
    stdout: true,
    stderr: true,
    tail: 100,
    timestamps: true,
  })
  return parseDockerLogs(logs.toString())
}

export async function getSandboxInfo(id: string): Promise<SandboxInfo | null> {
  try {
    const container = docker.getContainer(id)
    const info = await container.inspect()
    return {
      id: info.Id,
      sandboxId: info.Config.Labels?.["sandobox.id"] ?? info.Id,
      name: info.Name.replace(/^\//, ""),
      image: info.Config.Image,
      opencodePort: parseInt(info.Config.Labels?.["sandobox.opencode.port"] ?? "0"),
      status: info.State.Status,
      projectMount: info.Config.Labels?.["sandobox.project.mount"],
      createdAt: info.Created,
    }
  } catch {
    return null
  }
}

export async function execInSandbox(id: string, command: string): Promise<string> {
  const container = docker.getContainer(id)
  const exec = await container.exec({
    Cmd: ["sh", "-c", command],
    AttachStdout: true,
    AttachStderr: true,
  })
  const stream = await exec.start({ Detach: false, Tty: false })
  return new Promise((resolve, reject) => {
    let output = ""
    stream.on("data", (chunk: Buffer) => {
      output += chunk.toString()
    })
    stream.on("end", () => resolve(output))
    stream.on("error", reject)
  })
}

async function buildImage(tag: string, dockerfile: string): Promise<string> {
  const buildDir = await mkdtemp(path.join(tmpdir(), "sandobox-build-"))

  try {
    await writeFile(path.join(buildDir, "Dockerfile"), dockerfile, "utf8")

    try {
      await execFileAsync("docker", ["build", "-t", tag, buildDir], { windowsHide: true })
    } catch (error) {
      const stderr = error && typeof error === "object" && "stderr" in error ? error.stderr : ""
      const stdout = error && typeof error === "object" && "stdout" in error ? error.stdout : ""
      throw new Error(String(stderr || stdout || error))
    }

    return tag
  } finally {
    await rm(buildDir, { recursive: true, force: true })
  }
}

function buildOpenCodeConfig(config: SandboxConfig): string {
  const permissionEntries = Object.entries(config.permissions).map(([key, value]) => {
    const action = value === "allow" ? "allow" : value === "deny" ? "deny" : "ask"
    return `"${key}": ${JSON.stringify(action)}`
  })

  const opencodeConfig: Record<string, unknown> = {
    permission: JSON.parse(`{${permissionEntries.join(",")}}`),
  }

  if (config.providers && config.providers.length > 0) {
    const providerMap: Record<string, { options: Record<string, never> }> = {}
    for (const p of config.providers) {
      providerMap[p.id] = { options: {} }
    }
    opencodeConfig.provider = providerMap
  }

  return JSON.stringify(opencodeConfig)
}

function sanitizeContainerName(name: string): string {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  if (!normalized) {
    throw new Error("Container name must contain at least one alphanumeric character")
  }
  if (normalized.length > 64) {
    throw new Error(`Container name must be 64 characters or fewer (got ${normalized.length})`)
  }
  return normalized
}

function createGroupName(name: string) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  return `sandobox-${normalized || randomUUID().slice(0, 8)}`
}

async function ensureNetwork(name: string) {
  try {
    await docker.getNetwork(name).inspect()
  } catch {
    await docker.createNetwork({ Name: name, Labels: { "sandobox.network": "true" } })
  }
}

async function ensureServiceContainers(containerName: string, config: SandboxConfig, group: string, networkName: string) {
  for (const service of config.services) {
    const name = `${containerName}-${service}`
    try {
      const existing = docker.getContainer(name)
      await existing.inspect()
      await existing.start().catch(() => undefined)
      continue
    } catch {
      // create below
    }

    if (service === "postgres") {
      const container = await docker.createContainer({
        name,
        Image: "postgres:16-alpine",
        Labels: {
          "sandobox.service": "true",
          "sandobox.group": group,
          "sandobox.service.name": "postgres",
        },
        Env: [
          "POSTGRES_USER=sandbox",
          "POSTGRES_PASSWORD=sandbox",
          "POSTGRES_DB=sandbox",
        ],
      })
      await docker.getNetwork(networkName).connect({
        Container: container.id,
        EndpointConfig: {
          Aliases: ["postgres"],
        },
      })
      await container.start()
      continue
    }

    if (service === "redis") {
      const container = await docker.createContainer({
        name,
        Image: "redis:7-alpine",
        Labels: {
          "sandobox.service": "true",
          "sandobox.group": group,
          "sandobox.service.name": "redis",
        },
      })
      await docker.getNetwork(networkName).connect({
        Container: container.id,
        EndpointConfig: {
          Aliases: ["redis"],
        },
      })
      await container.start()
    }
  }
}

async function findGroupContainers(group: string) {
  const containers = await docker.listContainers({ all: true })
  return containers.filter((entry) => entry.Labels?.["sandobox.group"] === group)
}

async function startGroupContainers(group: string) {
  const containers = await findGroupContainers(group)
  for (const entry of containers) {
    if (entry.State !== "running") {
      await docker.getContainer(entry.Id).start()
    }
  }
}

async function stopGroupContainers(group: string) {
  const containers = await findGroupContainers(group)
  for (const entry of containers) {
    if (entry.State === "running") {
      await docker.getContainer(entry.Id).stop()
    }
  }
}

function parseDockerLogs(raw: string): ContainerLog[] {
  const lines = raw.split("\n").filter(Boolean)
  return lines.map((line) => {
    const spaceIdx = line.indexOf(" ")
    if (spaceIdx > 0) {
      return {
        time: line.slice(0, spaceIdx),
        message: line.slice(spaceIdx + 1),
      }
    }
    return { time: "", message: line }
  })
}

export function buildGeneratedDockerfile(config: { runtimes?: string[]; tools?: string[]; services?: string[] }) {
  const packages = new Set<string>(["ca-certificates"])
  const runtimes = config.runtimes ?? ["node"]
  const tools = config.tools ?? ["git", "curl", "pnpm"]
  const services = config.services ?? []

  for (const tool of tools) {
    if (tool === "git") packages.add("git")
    if (tool === "curl") packages.add("curl")
    if (tool === "wget") packages.add("wget")
    if (tool === "vim") packages.add("vim")
    if (tool === "build-essential") packages.add("build-essential")
    if (tool === "sqlite") packages.add("sqlite3")
  }

  if (runtimes.includes("python")) {
    packages.add("python3")
    packages.add("python3-pip")
    packages.add("python3-venv")
  }

  if (services.includes("postgres")) {
    packages.add("postgresql-client")
  }

  if (services.includes("redis")) {
    packages.add("redis-tools")
  }

  const installPackages = Array.from(packages).sort()
  const lines = [
    "FROM node:20-bookworm-slim",
    "",
    "ENV DEBIAN_FRONTEND=noninteractive",
    "WORKDIR /workspace",
  ]

  if (installPackages.length > 0) {
    lines.push(
      "",
      `RUN apt-get update && apt-get install -y --no-install-recommends ${installPackages.join(" ")} && rm -rf /var/lib/apt/lists/*`,
    )
  }

  if (runtimes.includes("dotnet")) {
    lines.push(
      "",
      "RUN curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh \\",
      "  && bash /tmp/dotnet-install.sh --channel 8.0 --install-dir /usr/share/dotnet \\",
      "  && ln -s /usr/share/dotnet/dotnet /usr/local/bin/dotnet \\",
      "  && rm /tmp/dotnet-install.sh",
    )
  }

  if (tools.includes("pnpm")) {
    lines.push("", "RUN corepack enable && corepack prepare pnpm@latest --activate")
  }

  if (tools.includes("bun")) {
    lines.push(
      "",
      "RUN curl -fsSL https://bun.sh/install | bash \\",
      "  && ln -s /root/.bun/bin/bun /usr/local/bin/bun",
    )
  }

  lines.push(
    "",
    "RUN npm install -g opencode-ai",
    "",
    "RUN mkdir -p /root/.config/opencode",
    "",
    'CMD ["sh", "-c", "opencode --help && sleep infinity"]',
  )

  return lines.join("\n")
}

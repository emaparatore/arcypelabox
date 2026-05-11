import Docker from "dockerode"

const docker = new Docker()

export interface SandboxConfig {
  name: string
  image: string
  opencodePort: number
  projectMount?: string
  permissions: Record<string, string>
  providerApiKey?: string
  providerId?: string
  modelId?: string
}

export interface SandboxInfo {
  id: string
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
      name: (c.Names?.[0] ?? "").replace(/^\//, ""),
      image: c.Image,
      opencodePort: parseInt(c.Labels?.["sandobox.opencode.port"] ?? "0"),
      status: c.State ?? "unknown",
      projectMount: c.Labels?.["sandobox.project.mount"],
      createdAt: c.Created?.toString() ?? "",
    }))
}

export async function createSandbox(config: SandboxConfig): Promise<string> {
  const opencodeConfig = buildOpenCodeConfig(config)

  const container = await docker.createContainer({
    name: config.name,
    Image: config.image,
    Labels: {
      "sandobox.manager": "true",
      "sandobox.opencode.port": config.opencodePort.toString(),
      "sandobox.project.mount": config.projectMount ?? "",
    },
    ExposedPorts: {
      [`${config.opencodePort}/tcp`]: {},
    },
    HostConfig: {
      PortBindings: {
        [`${config.opencodePort}/tcp`]: [{ HostPort: config.opencodePort.toString() }],
      },
      ...(config.projectMount
        ? {
            Binds: [`${config.projectMount}:/workspace/project`],
          }
        : {}),
    },
    Env: [
      `OPENCODE_CONFIG=${opencodeConfig}`,
      ...(config.providerApiKey ? [`OPENCODE_PROVIDER_API_KEY=${config.providerApiKey}`] : []),
    ],
    Cmd: ["sh", "-c", `echo '${opencodeConfig}' > /root/.config/opencode/config.json && opencode serve --port ${config.opencodePort} --hostname 0.0.0.0`],
  })

  await container.start()
  return container.id
}

function buildOpenCodeConfig(config: SandboxConfig): string {
  const permissionEntries = Object.entries(config.permissions).map(([key, value]) => {
    const action = value === "allow" ? "allow" : value === "deny" ? "deny" : "ask"
    return `"${key}": ${JSON.stringify(action)}`
  })

  const opencodeConfig: Record<string, unknown> = {
    permission: JSON.parse(`{${permissionEntries.join(",")}}`),
  }

  if (config.providerId) {
    opencodeConfig.provider = config.providerId
  }

  if (config.modelId) {
    opencodeConfig.model = config.modelId
  }

  return JSON.stringify(opencodeConfig)
}

export async function startSandbox(id: string): Promise<void> {
  const container = docker.getContainer(id)
  await container.start()
}

export async function stopSandbox(id: string): Promise<void> {
  const container = docker.getContainer(id)
  await container.stop()
}

export async function removeSandbox(id: string): Promise<void> {
  const container = docker.getContainer(id)
  await container.remove({ force: true })
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

export async function listImages(): Promise<string[]> {
  const images = await docker.listImages()
  return images.map((i) => (i.RepoTags ?? []).filter(Boolean)).flat()
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

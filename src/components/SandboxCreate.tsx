import { useMemo, useState } from "react"
import type {
  SandboxConfig,
  SandboxRuntime,
  SandboxService,
  SandboxTool,
} from "../types"
import {
  PERMISSION_ACTIONS,
  PERMISSION_KEYS,
  SANDBOX_RUNTIMES,
  SANDBOX_SERVICES,
  SANDBOX_TOOLS,
} from "../types"

interface Props {
  onCreated: () => void
  onCancel: () => void
}

type Step = 0 | 1 | 2 | 3

const STEP_TITLES = ["Base", "Technology", "Workspace", "Review"]

const RUNTIME_LABELS: Record<SandboxRuntime, string> = {
  node: "Node.js",
  python: "Python",
  dotnet: ".NET SDK",
}

const TOOL_LABELS: Record<SandboxTool, string> = {
  git: "git",
  curl: "curl",
  wget: "wget",
  vim: "vim",
  "build-essential": "build tools",
  sqlite: "sqlite",
  pnpm: "pnpm",
  bun: "bun",
}

const SERVICE_LABELS: Record<SandboxService, string> = {
  postgres: "Postgres",
  redis: "Redis",
}

const TOOL_DESCRIPTIONS: Record<SandboxTool, string> = {
  git: "Repository operations inside the sandbox",
  curl: "Quick HTTP checks and downloads",
  wget: "Alternative file downloader",
  vim: "Terminal editor for quick changes",
  "build-essential": "gcc, g++, make and native build headers",
  sqlite: "Local sqlite3 database tooling",
  pnpm: "Fast package manager for Node projects",
  bun: "Bun runtime and package manager",
}

const SERVICE_DESCRIPTIONS: Record<SandboxService, string> = {
  postgres: "Separate Postgres container on the sandbox network",
  redis: "Separate Redis container on the sandbox network",
}

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]
}

function buildGeneratedDockerfile(config: {
  runtimes: SandboxRuntime[]
  tools: SandboxTool[]
  services: SandboxService[]
}) {
  const packages = new Set<string>(["ca-certificates"])

  for (const tool of config.tools) {
    if (tool === "git") packages.add("git")
    if (tool === "curl") packages.add("curl")
    if (tool === "wget") packages.add("wget")
    if (tool === "vim") packages.add("vim")
    if (tool === "build-essential") packages.add("build-essential")
    if (tool === "sqlite") packages.add("sqlite3")
  }

  if (config.runtimes.includes("python")) {
    packages.add("python3")
    packages.add("python3-pip")
    packages.add("python3-venv")
  }

  if (config.services.includes("postgres")) {
    packages.add("postgresql-client")
  }

  if (config.services.includes("redis")) {
    packages.add("redis-tools")
  }

  const installPackages = Array.from(packages).sort()
  const installPackageList = installPackages.join(" ")
  const lines = [
    "FROM node:20-bookworm-slim",
    "",
    "ENV DEBIAN_FRONTEND=noninteractive",
    "WORKDIR /workspace",
  ]

  if (installPackages.length > 0) {
    lines.push(
      "",
      `RUN apt-get update && apt-get install -y --no-install-recommends ${installPackageList} && rm -rf /var/lib/apt/lists/*`
    )
  }

  if (config.runtimes.includes("dotnet")) {
    lines.push(
      "",
      "RUN curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh \\",
      "  && bash /tmp/dotnet-install.sh --channel 8.0 --install-dir /usr/share/dotnet \\",
      "  && ln -s /usr/share/dotnet/dotnet /usr/local/bin/dotnet \\",
      "  && rm /tmp/dotnet-install.sh"
    )
  }

  if (config.tools.includes("pnpm")) {
    lines.push("", "RUN corepack enable && corepack prepare pnpm@latest --activate")
  }

  if (config.tools.includes("bun")) {
    lines.push(
      "",
      "RUN curl -fsSL https://bun.sh/install | bash \\",
      "  && ln -s /root/.bun/bin/bun /usr/local/bin/bun"
    )
  }

  lines.push(
    "",
    "RUN npm install -g opencode-ai",
    "",
    "RUN mkdir -p /root/.config/opencode",
    "",
    "CMD [\"sh\", \"-c\", \"opencode --help && sleep infinity\"]"
  )

  return lines.join("\n")
}

export function SandboxCreate({ onCreated, onCancel }: Props) {
  const [step, setStep] = useState<Step>(0)
  const [name, setName] = useState("")
  const [image, setImage] = useState("sandobox-base:latest")
  const [opencodePort, setOpencodePort] = useState(4096)
  const [projectMount, setProjectMount] = useState("")
  const [runtimes, setRuntimes] = useState<SandboxRuntime[]>(["node"])
  const [tools, setTools] = useState<SandboxTool[]>(["git", "curl", "pnpm"])
  const [services, setServices] = useState<SandboxService[]>([])
  const [providerId, setProviderId] = useState("")
  const [modelId, setModelId] = useState("")
  const [providerApiKey, setProviderApiKey] = useState("")
  const [permissions, setPermissions] = useState<Record<string, string>>({
    read: "allow",
    edit: "allow",
    write: "allow",
    glob: "allow",
    grep: "allow",
    bash: "allow",
    task: "allow",
    skill: "allow",
    question: "allow",
    todowrite: "allow",
    webfetch: "allow",
    websearch: "allow",
    lsp: "allow",
    external_directory: "allow",
    doom_loop: "deny",
  })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generatedDockerfile = useMemo(
    () => buildGeneratedDockerfile({ runtimes, tools, services }),
    [runtimes, tools, services]
  )

  const configPreview = useMemo(
    () => ({
      image,
      opencodePort,
      projectMount: projectMount || null,
      runtimes,
      tools,
      services,
      providerId: providerId || null,
      modelId: modelId || null,
    }),
    [image, modelId, opencodePort, projectMount, providerId, runtimes, services, tools]
  )

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Name is required")
      return
    }

    if (!image.trim()) {
      setError("Image tag is required")
      return
    }

    if (!projectMount.trim()) {
      setError("Project path to mount is required")
      return
    }

    setCreating(true)
    setError(null)

    const config: SandboxConfig = {
      name: name.trim(),
      image: image.trim(),
      opencodePort,
      generatedDockerfile,
      permissions,
      runtimes,
      tools,
      services,
      ...(projectMount.trim() ? { projectMount: projectMount.trim() } : {}),
      ...(providerId ? { providerId } : {}),
      ...(modelId ? { modelId } : {}),
      ...(providerApiKey ? { providerApiKey } : {}),
    }

    try {
      const result = await window.sandobox.createSandbox(config)
      if (result && typeof result === "object" && !("error" in result)) {
        setError(null)
        onCreated()
      } else {
        setError((result as { error?: string })?.error ?? "Failed to create sandbox")
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const updatePermission = (key: string, value: string) => {
    setPermissions((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="wizard-shell">
      <div className="wizard-header">
        <div>
          <h2>Create Sandbox</h2>
          <p>
            Start from a minimal OpenCode-ready template, then layer runtimes, tools and
            services.
          </p>
        </div>
        <div className="wizard-steps">
          {STEP_TITLES.map((title, index) => (
            <button
              key={title}
              className={`wizard-step ${step === index ? "active" : ""}`}
              onClick={() => setStep(index as Step)}
              type="button"
            >
              <span>{index + 1}</span>
              {title}
            </button>
          ))}
        </div>
      </div>

      <div className="wizard-body">
        {step === 0 && (
          <div className="wizard-panel">
            <div className="template-card selected">
              <div className="template-card-badge">Base template</div>
              <h3>OpenCode Minimal</h3>
              <p>
                Debian slim with Node.js, OpenCode CLI, workspace folders and room for optional
                tooling.
              </p>
              <ul className="template-list">
                <li>OpenCode preinstalled</li>
                <li>Node.js included as part of the base</li>
                <li>Ready for mounted local projects</li>
              </ul>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Sandbox Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-sandbox" />
              </div>
              <div className="form-group">
                <label>Image Tag</label>
                <input
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="sandobox-base:latest"
                />
              </div>
            </div>

            <div className="form-group">
              <label>OpenCode Port</label>
              <input
                type="number"
                value={opencodePort}
                onChange={(e) => setOpencodePort(parseInt(e.target.value, 10) || 4096)}
              />
            </div>

            <div className="form-group">
              <label>Project Path to Mount <span style={{ color: "var(--text-secondary)" }}>(required)</span></label>
              <input
                value={projectMount}
                onChange={(e) => setProjectMount(e.target.value)}
                placeholder="C:\Users\emapa\Desktop\my-project"
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="wizard-panel">
            <div className="wizard-section">
              <h3>Runtimes</h3>
              <p className="wizard-muted">Node.js is already included in the base image.</p>
              <div className="option-grid">
                {SANDBOX_RUNTIMES.map((runtime) => {
                  const selected = runtimes.includes(runtime)
                  const locked = runtime === "node"
                  return (
                    <button
                      key={runtime}
                      type="button"
                      className={`option-card ${selected ? "selected" : ""} ${locked ? "locked" : ""}`}
                      onClick={() => {
                        if (!locked) setRuntimes((prev) => toggleValue(prev, runtime))
                      }}
                    >
                      <strong>{RUNTIME_LABELS[runtime]}</strong>
                      <span>{locked ? "Required by the base OpenCode template" : "Install into the sandbox image"}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="wizard-section">
              <h3>Common Tools</h3>
              <div className="option-grid">
                {SANDBOX_TOOLS.map((tool) => {
                  const selected = tools.includes(tool)
                  return (
                    <button
                      key={tool}
                      type="button"
                      className={`option-card ${selected ? "selected" : ""}`}
                      onClick={() => setTools((prev) => toggleValue(prev, tool))}
                    >
                      <strong>{TOOL_LABELS[tool]}</strong>
                      <span>{TOOL_DESCRIPTIONS[tool]}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="wizard-section">
              <h3>Services</h3>
              <p className="wizard-muted">These run as separate containers on the same sandbox network.</p>
              <div className="option-grid">
                {SANDBOX_SERVICES.map((service) => {
                  const selected = services.includes(service)
                  return (
                    <button
                      key={service}
                      type="button"
                      className={`option-card ${selected ? "selected" : ""}`}
                      onClick={() => setServices((prev) => toggleValue(prev, service))}
                    >
                      <strong>{SERVICE_LABELS[service]}</strong>
                      <span>{SERVICE_DESCRIPTIONS[service]}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-panel">
            <div className="form-row">
              <div className="form-group">
                <label>Provider ID (optional)</label>
                <input
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                  placeholder="anthropic"
                />
              </div>

              <div className="form-group">
                <label>Model ID (optional)</label>
                <input
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  placeholder="claude-sonnet-4-20250514"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Provider API Key (optional)</label>
              <input
                type="password"
                value={providerApiKey}
                onChange={(e) => setProviderApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>

            <div className="form-group">
              <label>OpenCode Permissions</label>
              <div className="permission-grid">
                {PERMISSION_KEYS.map((key) => (
                  <div key={key} className="permission-row">
                    <label>{key}</label>
                    <select
                      value={permissions[key] ?? "ask"}
                      onChange={(e) => updatePermission(key, e.target.value)}
                    >
                      {PERMISSION_ACTIONS.map((action) => (
                        <option key={action} value={action}>
                          {action}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="wizard-panel">
            <div className="wizard-review-grid">
              <div className="review-card">
                <h3>Sandbox Plan</h3>
                <pre className="code-preview">{JSON.stringify(configPreview, null, 2)}</pre>
              </div>
              <div className="review-card">
                <h3>Generated Dockerfile</h3>
                <pre className="code-preview">{generatedDockerfile}</pre>
              </div>
            </div>
          </div>
        )}

        {error && <div style={{ color: "var(--danger)", marginTop: 12, fontSize: 13 }}>{error}</div>}
      </div>

      <div className="modal-actions wizard-actions">
        <button className="btn" onClick={onCancel} disabled={creating}>
          Cancel
        </button>
        <button className="btn" onClick={() => setStep((prev) => Math.max(0, prev - 1) as Step)} disabled={creating || step === 0}>
          Back
        </button>
        {step < 3 ? (
          <button className="btn btn-primary" onClick={() => setStep((prev) => Math.min(3, prev + 1) as Step)} disabled={creating}>
            Next
          </button>
        ) : (
          <button className="btn btn-primary" onClick={handleSubmit} disabled={creating}>
            {creating ? "Building sandbox..." : "Build and Create Sandbox"}
          </button>
        )}
      </div>
    </div>
  )
}

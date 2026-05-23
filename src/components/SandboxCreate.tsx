import { useEffect, useMemo, useRef, useState } from "react"
import type {
  ProviderConfig,
  SandboxConfig,
  SandboxRecord,
  SandboxRuntime,
  SandboxService,
  SandboxTool,
} from "../types"
import {
  OPENCODE_PROVIDERS,
  PERMISSION_ACTIONS,
  PERMISSION_KEYS,
  SANDBOX_RUNTIMES,
  SANDBOX_SERVICES,
  SANDBOX_TOOLS,
} from "../types"
import { BuildProgressModal } from "./BuildProgressModal"
import { InfoPopover } from "./InfoPopover"

interface Props {
  onCreated: (sandboxId: string, containerId: string) => void
  onCancel: () => void
  editRecord?: SandboxRecord | null
}

type Step = 0 | 1 | 2 | 3

const STEP_TITLES = ["Base", "Technology", "Workspace", "Review"]

const RUNTIME_LABELS: Record<SandboxRuntime, string> = {
  node: "Node.js",
  python: "Python",
  dotnet: ".NET SDK",
  go: "Go",
  java: "Java",
  ruby: "Ruby",
  php: "PHP",
  rust: "Rust",
  zig: "Zig",
}

const TOOL_LABELS: Record<SandboxTool, string> = {
  git: "git",
  curl: "curl",
  vim: "vim",
  "build-essential": "build tools",
  sqlite: "sqlite",
  pnpm: "pnpm",
  bun: "bun",
  nvm: "nvm",
  jq: "jq",
  gh: "GitHub CLI",
  unzip: "unzip",
  tree: "tree",
  make: "make",
  zip: "zip",
  ripgrep: "ripgrep",
  cmake: "CMake",
}

const SERVICE_LABELS: Record<SandboxService, string> = {
  postgres: "Postgres",
  redis: "Redis",
}

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]
}

const IMAGE_NAME = "arcypelabox-base"

export function SandboxCreate({ onCreated, onCancel, editRecord }: Props) {
  const [step, setStep] = useState<Step>(0)
  const [name, setName] = useState("")
  const [imageTag, setImageTag] = useState("latest")
  const [projectMount, setProjectMount] = useState("")
  const [runtimes, setRuntimes] = useState<SandboxRuntime[]>(["node"])
  const [tools, setTools] = useState<SandboxTool[]>(["git"])
  const [services, setServices] = useState<SandboxService[]>([])
  const [gitUserName, setGitUserName] = useState("")
  const [gitUserEmail, setGitUserEmail] = useState("")
  const [gitAutocrlf, setGitAutocrlf] = useState<"input" | "true" | "false">("input")
  const [providers, setProviders] = useState<ProviderConfig[]>([{ id: "", apiKey: "" }])
  const [openProviderIndex, setOpenProviderIndex] = useState<number | null>(null)
  const [highlightedProviderOption, setHighlightedProviderOption] = useState(0)
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
  const [buildStatus, setBuildStatus] = useState<"idle" | "building" | "success">("idle")
  const [buildLogs, setBuildLogs] = useState<{ type: "step" | "log"; text: string }[]>([])
  const [buildResult, setBuildResult] = useState<{ sandboxId: string; containerId: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [generatedDockerfile, setGeneratedDockerfile] = useState("")
  const [customCommands, setCustomCommands] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showWarning, setShowWarning] = useState(true)
  const [showDockerWarning, setShowDockerWarning] = useState(true)
  const [runtimeFilter, setRuntimeFilter] = useState("")
  const [toolFilter, setToolFilter] = useState("")
  const [serviceFilter, setServiceFilter] = useState("")

  useEffect(() => {
    if (!editRecord) return
    setShowWarning(true)
    setName(editRecord.name)
    const colonIdx = (editRecord.image_tag ?? "").lastIndexOf(":")
    setImageTag(colonIdx >= 0 ? editRecord.image_tag.slice(colonIdx + 1) : editRecord.image_tag || "latest")
    setProjectMount(editRecord.project_mount ?? "")
    setRuntimes(editRecord.runtimes)
    setTools(editRecord.tools)
    setServices(editRecord.services)
    if (editRecord.providers && editRecord.providers.length > 0) {
      setProviders(editRecord.providers.map((p) => ({ id: p.id, apiKey: p.apiKey })))
    }
    if (editRecord.permissions) {
      setPermissions((prev) => ({ ...prev, ...editRecord.permissions }))
    }
    if (editRecord.git_config) {
      setGitUserName(editRecord.git_config.userName ?? "")
      setGitUserEmail(editRecord.git_config.userEmail ?? "")
      setGitAutocrlf((editRecord.git_config.autocrlf as "input" | "true" | "false") ?? "input")
    }
    setCustomCommands("")
  }, [editRecord])

  const gitConfig = tools.includes("git")
    ? { userName: gitUserName, userEmail: gitUserEmail, autocrlf: gitAutocrlf }
    : undefined

  useEffect(() => {
    window.sandobox.generateDockerfile({ runtimes, tools, services, customCommands: customCommands || undefined, gitConfig }).then(setGeneratedDockerfile)
  }, [runtimes, tools, services, customCommands, gitConfig])

  const progressCleanup = useRef<(() => void) | undefined>(undefined)

  useEffect(() => {
    if (buildStatus === "building") {
      setBuildLogs([])
      progressCleanup.current = window.sandobox.onBuildProgress((event) => {
        setBuildLogs((prev) => [...prev, event])
      })
    }
    return () => {
      progressCleanup.current?.()
      progressCleanup.current = undefined
    }
  }, [buildStatus])

  useEffect(() => {
    if (buildStatus === "success" && buildResult) {
      const timer = setTimeout(() => onCreated(buildResult.sandboxId, buildResult.containerId), 2500)
      return () => clearTimeout(timer)
    }
  }, [buildStatus, buildResult, onCreated])

  const fullImage = `${IMAGE_NAME}:${imageTag}`
  const configPreview = useMemo(
    () => ({
      image: fullImage,
      projectMount: projectMount || null,
      runtimes,
      tools,
      services,
      providers: providers.length > 0
        ? providers.map((p) => ({ id: p.id, apiKey: "****" }))
        : null,
      ...(gitConfig ? { gitConfig } : {}),
      allowedPermissions: Object.entries(permissions)
        .filter(([, v]) => v === "allow")
        .map(([k]) => k),
    }),
    [fullImage, projectMount, providers, runtimes, services, tools, gitConfig, permissions]
  )

  const handleSubmit = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError("Name is required")
      return
    }

    const nameValid = /^[a-z0-9][a-z0-9_.-]*$/.test(trimmedName.toLowerCase())
    if (!nameValid) {
      setError("Name must start with a letter or number and contain only letters, numbers, hyphens, underscores, or dots")
      return
    }
    if (trimmedName.length > 64) {
      setError("Name must be 64 characters or fewer")
      return
    }

    const trimmedTag = imageTag.trim()
    if (!trimmedTag) {
      setError("Image tag is required")
      return
    }

    if (!projectMount.trim()) {
      setError("Project path to mount is required")
      return
    }

    const fullImage = `${IMAGE_NAME}:${trimmedTag}`
    try {
      const exists = await window.sandobox.checkImage(fullImage)
      if (typeof exists === "object" && "error" in exists) {
        // check itself failed — continue, docker build will surface the real issue
      } else if (exists) {
        setError(`An image with tag "${trimmedTag}" already exists in Docker. Please use a different tag.`)
        return
      }
    } catch {
      // fall through
    }

    setBuildStatus("building")
    setError(null)

    const config: SandboxConfig = {
      name: trimmedName,
      image: fullImage,
      generatedDockerfile,
      permissions,
      runtimes,
      tools,
      services,
      ...(projectMount.trim() ? { projectMount: projectMount.trim() } : {}),
      ...(providers.length > 0 ? { providers } : {}),
      ...(customCommands.trim() ? { customCommands: customCommands.trim() } : {}),
      ...(gitConfig ? { gitConfig } : {}),
    }

    try {
      const result = editRecord
        ? await window.sandobox.updateSandbox(editRecord.id, config)
        : await window.sandobox.createSandbox(config)
      if (result && typeof result === "object" && !("error" in result)) {
        setError(null)
        setBuildResult({ sandboxId: result.sandboxId, containerId: result.containerId })
        setBuildStatus("success")
      } else {
        setError((result as { error?: string })?.error ?? "Failed to create sandbox")
        setBuildStatus("idle")
      }
    } catch (err) {
      setError((err as Error).message)
      setBuildStatus("idle")
    }
  }

  const updatePermission = (key: string, value: string) => {
    setPermissions((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <>
      <div className="wizard-shell">
        <div className="wizard-header">
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

        <div className={`wizard-body ${step === 0 ? "wizard-body-small" : step === 1 ? "wizard-body-small" : ""}`}>
          {editRecord && showWarning && (
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                padding: "12px 16px",
                marginBottom: 16,
                border: "1px solid var(--warning, #f0a030)",
                borderRadius: 6,
                background: "rgba(240, 160, 48, 0.1)",
                color: "var(--warning, #f0a030)",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <div style={{ flex: 1 }}>
                <strong>⚠️ Sandbox will be recreated.</strong> Any changes made inside the
                container outside of Arcypelabox (installed packages, modified files, etc.)
                will be lost. Your mounted project folder <code>/workspace</code> will not be
                affected.
              </div>
              <button
                type="button"
                onClick={() => setShowWarning(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--warning, #f0a030)",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                  padding: 0,
                  opacity: 0.7,
                }}
                aria-label="Close warning"
              >
                ×
              </button>
            </div>
          )}
          {step === 0 && (
            <div className="wizard-panel">
              <div className="wizard-step-intro">
                <h2>{editRecord ? "Edit Sandbox" : "Create Sandbox"}</h2>
                <p>
                  {editRecord
                    ? "Modify the sandbox configuration. The container will be rebuilt from scratch."
                    : "Start from a minimal OpenCode-ready template, then layer runtimes, tools and services."}
                </p>
              </div>

              <div className="template-card selected">
                <div className="template-card-badge">Base template</div>
                <h3>OpenCode Minimal</h3>
                <p>
                  Debian slim with Node.js, OpenCode CLI, workspace folders and room for optional
                  tooling.
                </p>
                <ul className="template-list">
                  <li>OpenCode preinstalled</li>
                  <li>Node.js and Git included as part of the base</li>
                  <li>Ready for mounted local projects</li>
                </ul>
              </div>

              <div className="wizard-divider" aria-hidden="true" />

              <div className="wizard-form-block">
                <div className="form-stack-half">
                  <div className="form-group form-group-inline">
                    <label>Sandbox Name</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-sandbox" />
                  </div>

                  <div className="form-group form-group-inline">
                    <label>Image Tag</label>
                    <div className="image-tag-input">
                      <span className="image-tag-prefix">{IMAGE_NAME}:</span>
                      <input
                        value={imageTag}
                        onChange={(e) => setImageTag(e.target.value)}
                        placeholder="latest"
                      />
                    </div>
                  </div>

                  <div className="form-group form-group-inline">
                    <label>Project Path to Mount <span style={{ color: "var(--text-secondary)" }}>(required)</span></label>
                    <input
                      value={projectMount}
                      onChange={(e) => setProjectMount(e.target.value)}
                      placeholder="C:\Users\emapa\Desktop\my-project"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="wizard-panel technology-panel">
              <div className="technology-column-header">
                <div className="section-title-row">
                  <h3>Runtimes</h3>
                  <InfoPopover label="Show runtimes info">
                    Language runtimes let agents compile, run and debug project code in the languages you select. Node.js is always included in the base image.
                  </InfoPopover>
                </div>
                <input
                  className="technology-filter-input"
                  type="text"
                  placeholder="Filter runtimes…"
                  value={runtimeFilter}
                  onChange={(e) => setRuntimeFilter(e.target.value)}
                />
              </div>
              <div className="technology-column-header">
                <div className="section-title-row">
                  <h3>Common Tools</h3>
                  <InfoPopover label="Show common tools info">
                    CLI utilities that agents can use inside the sandbox for editing, building, searching, compression and version control. Git is always included in the base image.
                  </InfoPopover>
                </div>
                <input
                  className="technology-filter-input"
                  type="text"
                  placeholder="Filter tools…"
                  value={toolFilter}
                  onChange={(e) => setToolFilter(e.target.value)}
                />
              </div>
              <div className="technology-column-header">
                <div className="section-title-row">
                  <h3>Services</h3>
                  <InfoPopover label="Show services info">
                    Infrastructure services that run as separate sidecar containers on the sandbox network. Agents connect to them via the container hostname — no port mapping needed.
                  </InfoPopover>
                </div>
                <input
                  className="technology-filter-input"
                  type="text"
                  placeholder="Filter services…"
                  value={serviceFilter}
                  onChange={(e) => setServiceFilter(e.target.value)}
                />
              </div>
              <div className="technology-column-body compact-option-list compact-option-list-grid">
                {SANDBOX_RUNTIMES.filter((runtime) => {
                  if (runtime === "node") return true
                  if (!runtimeFilter) return true
                  const q = runtimeFilter.toLowerCase()
                  return RUNTIME_LABELS[runtime].toLowerCase().includes(q)
                }).map((runtime) => {
                  const selected = runtimes.includes(runtime)
                  const locked = runtime === "node"
                  return (
                    <button
                      key={runtime}
                      type="button"
                      className={`compact-option-row ${selected ? "selected" : ""} ${locked ? "locked" : ""}`}
                      onClick={() => {
                        if (!locked) setRuntimes((prev) => toggleValue(prev, runtime))
                      }}
                    >
                      <div className="compact-option-copy">
                        <div className="compact-option-title">
                          <strong>{RUNTIME_LABELS[runtime]}</strong>
                          {locked && <span className="option-inline-tag">Included</span>}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="technology-column-body dense-option-grid technology-tool-grid">
                {SANDBOX_TOOLS.filter((tool) => {
                  if (tool === "git") return true
                  if (!toolFilter) return true
                  const q = toolFilter.toLowerCase()
                  return TOOL_LABELS[tool].toLowerCase().includes(q)
                }).map((tool) => {
                  const selected = tools.includes(tool)
                  const locked = tool === "git"
                  return (
                    <button
                      key={tool}
                      type="button"
                      className={`option-card dense-option-card ${selected ? "selected" : ""} ${locked ? "locked" : ""}`}
                      onClick={() => {
                        if (!locked) setTools((prev) => toggleValue(prev, tool))
                      }}
                    >
                      <div className="compact-option-title">
                        <strong>{TOOL_LABELS[tool]}</strong>
                        {locked && <span className="option-inline-tag">Included</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="technology-column-body compact-option-list compact-option-list-grid compact-option-list-services">
                {SANDBOX_SERVICES.filter((service) => {
                  if (!serviceFilter) return true
                  const q = serviceFilter.toLowerCase()
                  return SERVICE_LABELS[service].toLowerCase().includes(q)
                }).map((service) => {
                  const selected = services.includes(service)
                  return (
                    <button
                      key={service}
                      type="button"
                      className={`compact-option-row ${selected ? "selected" : ""}`}
                      onClick={() => setServices((prev) => toggleValue(prev, service))}
                    >
                      <strong>{SERVICE_LABELS[service]}</strong>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="wizard-panel">
              <div className="wizard-review-grid">
                <div className="review-card" style={{ maxWidth: 400 }}>
                  <h3>Sandbox Plan</h3>
                  <div className="code-preview" style={{ padding: "12px 14px" }}>
                    <div className="plan-row">
                      <span className="plan-label">Image</span>
                      <span>{configPreview.image}</span>
                    </div>
                    <div className="plan-row" style={{ alignItems: "center" }}>
                      <span className="plan-label">Mount</span>
                      <span
                        title={configPreview.projectMount || undefined}
                        style={{
                          color: configPreview.projectMount ? undefined : "var(--text-secondary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: "1",
                          minWidth: 0,
                        }}
                      >
                        {configPreview.projectMount || "\u2014"}
                      </span>
                    </div>
                    <div className="plan-row">
                      <span className="plan-label" style={{ alignSelf: "flex-start", paddingTop: 1 }}>Runtimes</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {configPreview.runtimes.map((r) => (
                          <span key={r} className="plan-chip" style={{ background: "rgba(var(--accent-rgb), 0.12)", color: "var(--accent)" }}>
                            {RUNTIME_LABELS[r] || r}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="plan-row">
                      <span className="plan-label" style={{ alignSelf: "flex-start", paddingTop: 1 }}>Tools</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {configPreview.tools.map((t) => (
                          <span key={t} className="plan-chip" style={{ background: "rgba(var(--white-rgb), 0.07)", color: "var(--text-secondary)" }}>
                            {TOOL_LABELS[t] || t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="plan-row">
                      <span className="plan-label" style={{ alignSelf: "flex-start", paddingTop: 1 }}>Services</span>
                      {configPreview.services.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {configPreview.services.map((s) => (
                            <span key={s} className="plan-chip" style={{ background: "rgba(var(--success-rgb), 0.12)", color: "var(--success)" }}>
                              {SERVICE_LABELS[s] || s}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-secondary)" }}>{"\u2014"}</span>
                      )}
                    </div>
                    <div className="plan-row" style={{ alignItems: "center" }}>
                      <span className="plan-label">Providers</span>
                      {configPreview.providers && configPreview.providers.length > 0 ? (
                        <span>
                          {configPreview.providers.map((p) => p.id).join(", ")}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-secondary)" }}>{"\u2014"}</span>
                      )}
                    </div>
                    <div className="plan-row" style={{ alignItems: "flex-start" }}>
                      <span className="plan-label">Git</span>
                      {configPreview.gitConfig ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          {configPreview.gitConfig.userName && (
                            <span style={{ fontSize: 12 }}>user.name: {configPreview.gitConfig.userName}</span>
                          )}
                          {configPreview.gitConfig.userEmail && (
                            <span style={{ fontSize: 12 }}>user.email: {configPreview.gitConfig.userEmail}</span>
                          )}
                          {configPreview.gitConfig.autocrlf && (
                            <span style={{ fontSize: 12 }}>autocrlf: {configPreview.gitConfig.autocrlf}</span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-secondary)" }}>{"\u2014"}</span>
                      )}
                    </div>
                    <div className="plan-row" style={{ alignItems: "flex-start" }}>
                      <span className="plan-label">Permissions</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {configPreview.allowedPermissions.length === PERMISSION_KEYS.length
                          ? <span className="plan-chip" style={{ background: "rgba(var(--success-rgb), 0.12)", color: "var(--success)" }}>All</span>
                          : configPreview.allowedPermissions.map((k) => (
                            <span key={k} className="plan-chip" style={{ background: "rgba(var(--accent-rgb), 0.12)", color: "var(--accent)" }}>{k}</span>
                          ))
                        }
                      </div>
                    </div>
                  </div>
                </div>
                <div className="review-card">
                  <h3>Generated Dockerfile</h3>
                  <pre className="code-preview">{generatedDockerfile}</pre>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <button
                  className="collapsible-header"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                  <span className={`collapsible-chevron ${showAdvanced ? "open" : ""}`}>&#9654;</span>
                  Advanced: Custom Dockerfile commands
                </button>
                {showAdvanced && (
                  <>
                    {showDockerWarning && (
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "var(--warning, #f0a030)", marginTop: 8, marginBottom: 8, padding: "6px 10px", border: "1px solid var(--warning, #f0a030)", borderRadius: 6, background: "rgba(240, 160, 48, 0.1)" }}>
                        <div style={{ flex: 1 }}>
                          ⚠️ <strong>Warning:</strong> These commands run as <code>RUN</code> instructions during <code>docker build</code>.
                          You are responsible for what you paste here. Malformed or malicious commands can break your sandbox
                          or compromise your system.
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowDockerWarning(false)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--warning, #f0a030)",
                            cursor: "pointer",
                            fontSize: 16,
                            lineHeight: 1,
                            padding: 0,
                            opacity: 0.7,
                          }}
                          aria-label="Close warning"
                        >
                          ×
                        </button>
                      </div>
                    )}
                    <textarea
                      value={customCommands}
                      onChange={(e) => setCustomCommands(e.target.value)}
                      placeholder={`# Example: install a specific tool version\nRUN curl -fsSL https://go.dev/dl/go1.24.1.linux-amd64.tar.gz | tar -C /usr/local -xz\nENV PATH=/usr/local/go/bin:$PATH`}
                      style={{
                        width: "100%",
                        minHeight: 80,
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: 12,
                        padding: 8,
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        background: "var(--bg-secondary)",
                        color: "var(--text-primary)",
                        resize: "vertical",
                      }}
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="wizard-panel workspace-panel">
              <div className="workspace-layout">
                <div className="wizard-section workspace-card workspace-permissions">
                  <div className="section-title-row">
                    <h3>OpenCode Permissions</h3>
                    <InfoPopover label="Show permissions info">
                      Controls which OpenCode actions the sandbox can perform without asking.
                      Each permission can be set to <em>allow</em> (auto-approve), <em>deny</em> (block),
                      or <em>ask</em> (prompt the user).
                    </InfoPopover>
                  </div>
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

                <div className="wizard-section workspace-card workspace-providers">
                  <div className="section-title-row">
                    <h3>LLM Providers</h3>
                    <InfoPopover label="Show provider info">
                      Add one or more AI providers. API keys are injected securely via the OpenCode API after container start - never stored in env vars or image layers.
                    </InfoPopover>
                  </div>
                  {providers.map((p, i) => (
                    <div key={i} className="form-row provider-row" style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                      {(() => {
                        const filteredProviders = OPENCODE_PROVIDERS.filter((id) =>
                          id.toLowerCase().includes(p.id.toLowerCase()),
                        )
                        return (
                          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                            <label>Provider</label>
                            <div className="provider-combobox">
                              <input
                                className="provider-combobox-input"
                                value={p.id}
                                onFocus={() => {
                                  setOpenProviderIndex(i)
                                  setHighlightedProviderOption(0)
                                }}
                                onBlur={() => setTimeout(() => setOpenProviderIndex((current) => (current === i ? null : current)), 120)}
                                onChange={(e) => {
                                  setProviders((prev) =>
                                    prev.map((pp, ii) => (ii === i ? { ...pp, id: e.target.value } : pp)),
                                  )
                                  setOpenProviderIndex(i)
                                  setHighlightedProviderOption(0)
                                }
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "ArrowDown") {
                                    e.preventDefault()
                                    setOpenProviderIndex(i)
                                    setHighlightedProviderOption((current) =>
                                      Math.min(current + 1, Math.max(filteredProviders.length - 1, 0)),
                                    )
                                  }
                                  if (e.key === "ArrowUp") {
                                    e.preventDefault()
                                    setOpenProviderIndex(i)
                                    setHighlightedProviderOption((current) => Math.max(current - 1, 0))
                                  }
                                  if (e.key === "Enter" && openProviderIndex === i && filteredProviders[highlightedProviderOption]) {
                                    e.preventDefault()
                                    const id = filteredProviders[highlightedProviderOption]
                                    setProviders((prev) =>
                                      prev.map((pp, ii) => (ii === i ? { ...pp, id } : pp)),
                                    )
                                    setOpenProviderIndex(null)
                                  }
                                  if (e.key === "Escape") {
                                    setOpenProviderIndex(null)
                                  }
                                }}
                                placeholder="Select provider..."
                              />
                              <button
                                type="button"
                                className="provider-combobox-toggle"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setOpenProviderIndex((current) => (current === i ? null : i))
                                  setHighlightedProviderOption(0)
                                }}
                                aria-label="Toggle provider list"
                              >
                                <span className="provider-combobox-caret" />
                              </button>
                              {openProviderIndex === i && (
                                <div className="provider-combobox-menu">
                                  {filteredProviders.map((id, optionIndex) => (
                                    <button
                                      key={id}
                                      type="button"
                                      className={`provider-combobox-option ${optionIndex === highlightedProviderOption || id === p.id ? "selected" : ""}`}
                                      onMouseDown={(e) => {
                                        e.preventDefault()
                                        setProviders((prev) =>
                                          prev.map((pp, ii) => (ii === i ? { ...pp, id } : pp)),
                                        )
                                        setOpenProviderIndex(null)
                                      }}
                                      onMouseEnter={() => setHighlightedProviderOption(optionIndex)}
                                    >
                                      {id}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })()}
                      <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                        <label>API Key</label>
                        <input
                          type="password"
                          value={p.apiKey}
                          onChange={(e) =>
                            setProviders((prev) =>
                              prev.map((pp, ii) => (ii === i ? { ...pp, apiKey: e.target.value } : pp)),
                            )
                          }
                          placeholder="sk-..."
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ visibility: "hidden" }}>Remove</label>
                        <button
                          className="btn icon-btn btn-small"
                          type="button"
                          onClick={() => setProviders((prev) => prev.filter((_, ii) => ii !== i))}
                          title="Remove"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h12" /><path d="M5 4V2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5V4" /><path d="M3 4v9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4" /><path d="M6 7v4" /><path d="M10 7v4" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    className="btn btn-small"
                    type="button"
                    onClick={() => setProviders((prev) => [...prev, { id: "", apiKey: "" }])}
                    style={{ marginTop: 2 }}
                  >
                    + Add Provider
                  </button>
                </div>
              </div>

              {tools.includes("git") && (
                    <div className="wizard-section workspace-card " style={{ marginTop: 10 }}>
                      <div className="section-title-row">
                        <h3 style={{ marginTop: 0 }}>Git Configuration</h3>
                        <InfoPopover label="Show git config info">
                          These credentials are embedded via <code>git config --global</code> in the sandbox image.
                        </InfoPopover>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Git User Name</label>
                          <input value={gitUserName} onChange={(e) => setGitUserName(e.target.value)} placeholder="Your Name (sandbox)" />
                        </div>
                        <div className="form-group">
                          <label>Git User Email</label>
                          <input value={gitUserEmail} onChange={(e) => setGitUserEmail(e.target.value)} placeholder="your@email.com" />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>core.autocrlf</label>
                        <select value={gitAutocrlf} onChange={(e) => setGitAutocrlf(e.target.value as "input" | "true" | "false")}>
                          <option value="input">input (recommended for Linux/macOS)</option>
                          <option value="true">true (recommended for Windows)</option>
                          <option value="false">false (disabled)</option>
                        </select>
                      </div>
                    </div>
                  )}


            </div>
          )}

          {error && <div style={{ color: "var(--danger)", marginTop: 12, fontSize: 13 }}>{error}</div>}
        </div>

        <div className="modal-actions wizard-actions">
          <button className="btn" onClick={onCancel} disabled={buildStatus !== "idle"}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l8 8" /><path d="M12 4l-8 8" /></svg>
            Cancel
          </button>
          <button className="btn" onClick={() => setStep((prev) => Math.max(0, prev - 1) as Step)} disabled={buildStatus !== "idle" || step === 0}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 4L6 8l4 4" /></svg>
            Back
          </button>
          {step < 3 ? (
            <button className="btn btn-primary" onClick={() => setStep((prev) => Math.min(3, prev + 1) as Step)} disabled={buildStatus !== "idle"}>
              Next
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4l4 4-4 4" /></svg>
            </button>
          ) : (
            <button className="btn btn-build" onClick={handleSubmit} disabled={buildStatus !== "idle"}>
              {buildStatus === "building" ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="spinner-icon"><path d="M8 2v3" /><path d="M8 11v3" /><path d="M3.5 3.5l2 2" /><path d="M10.5 10.5l2 2" /><path d="M2 8h3" /><path d="M11 8h3" /><path d="M3.5 12.5l2-2" /><path d="M10.5 5.5l2-2" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3,2 14,8 3,14" fill="currentColor" /></svg>
              )}
              {buildStatus === "building" ? "Building sandbox..." : editRecord ? "Build and Update Sandbox" : "Build and Create Sandbox"}
            </button>
          )}
        </div>
      </div>
      {buildStatus !== "idle" && <BuildProgressModal status={buildStatus} logs={buildLogs} />}
    </>
  )
}

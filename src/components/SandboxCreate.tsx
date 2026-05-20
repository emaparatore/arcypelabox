import { useEffect, useMemo, useState } from "react"
import type {
  ProviderConfig,
  SandboxConfig,
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

export function SandboxCreate({ onCreated, onCancel }: Props) {
  const [step, setStep] = useState<Step>(0)
  const [name, setName] = useState("")
  const [image, setImage] = useState("sandobox-base:latest")
  const [opencodePort, setOpencodePort] = useState(4096)
  const [projectMount, setProjectMount] = useState("")
  const [runtimes, setRuntimes] = useState<SandboxRuntime[]>(["node"])
  const [tools, setTools] = useState<SandboxTool[]>(["git", "curl", "pnpm"])
  const [services, setServices] = useState<SandboxService[]>([])
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
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [generatedDockerfile, setGeneratedDockerfile] = useState("")

  useEffect(() => {
    window.sandobox.generateDockerfile({ runtimes, tools, services }).then(setGeneratedDockerfile)
  }, [runtimes, tools, services])

  const configPreview = useMemo(
    () => ({
      image,
      opencodePort,
      projectMount: projectMount || null,
      runtimes,
      tools,
      services,
      providers: providers.length > 0
        ? providers.map((p) => ({ id: p.id, apiKey: "****" }))
        : null,
    }),
    [image, opencodePort, projectMount, providers, runtimes, services, tools]
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
      name: trimmedName,
      image: image.trim(),
      opencodePort,
      generatedDockerfile,
      permissions,
      runtimes,
      tools,
      services,
      ...(projectMount.trim() ? { projectMount: projectMount.trim() } : {}),
      ...(providers.length > 0 ? { providers } : {}),
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
            <div className="wizard-section">
              <h3>LLM Providers</h3>
              <p className="wizard-muted">Add one or more AI providers. API keys are injected securely via the OpenCode API after container start — never stored in env vars or image layers.</p>
              {providers.map((p, i) => (
                <div key={i} className="form-row" style={{ alignItems: "end", marginBottom: 8 }}>
                  {(() => {
                    const filteredProviders = OPENCODE_PROVIDERS.filter((id) =>
                      id.toLowerCase().includes(p.id.toLowerCase()),
                    )
                    return (
                  <div className="form-group" style={{ flex: 1 }}>
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
                        onChange={(e) =>
                          {
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
                  <div className="form-group" style={{ flex: 2 }}>
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
                  <button
                    className="btn"
                    type="button"
                    onClick={() => setProviders((prev) => prev.filter((_, ii) => ii !== i))}
                    style={{ marginBottom: 1 }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                className="btn"
                type="button"
                onClick={() => setProviders((prev) => [...prev, { id: "", apiKey: "" }])}
                style={{ marginTop: 4 }}
              >
                + Add Provider
              </button>
            </div>

            <div className="wizard-section">
              <h3>OpenCode Permissions</h3>
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

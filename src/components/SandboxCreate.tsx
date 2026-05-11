import { useState, useEffect } from "react"
import type { SandboxConfig } from "../types"
import { PERMISSION_KEYS, PERMISSION_ACTIONS } from "../types"

interface Props {
  onCreated: () => void
  onCancel: () => void
}

export function SandboxCreate({ onCreated, onCancel }: Props) {
  const [name, setName] = useState("")
  const [image, setImage] = useState("sandobox-base:latest")
  const [opencodePort, setOpencodePort] = useState(4096)
  const [projectMount, setProjectMount] = useState("")
  const [images, setImages] = useState<string[]>([])
  const [permissions, setPermissions] = useState<Record<string, string>>({
    read: "allow",
    edit: "ask",
    glob: "allow",
    grep: "allow",
    bash: "ask",
    task: "ask",
    webfetch: "ask",
    websearch: "ask",
    external_directory: "ask",
  })
  const [providerId, setProviderId] = useState("")
  const [modelId, setModelId] = useState("")
  const [providerApiKey, setProviderApiKey] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.sandobox.listImages().then((result) => {
      if (Array.isArray(result)) setImages(result)
    })
  }, [])

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Name is required")
      return
    }

    setCreating(true)
    setError(null)

    const config: SandboxConfig = {
      name: name.trim(),
      image,
      opencodePort,
      permissions,
      ...(projectMount.trim() ? { projectMount: projectMount.trim() } : {}),
      ...(providerId ? { providerId } : {}),
      ...(modelId ? { modelId } : {}),
      ...(providerApiKey ? { providerApiKey } : {}),
    }

    try {
      const result = await window.sandobox.createSandbox(config)
      if (typeof result === "string") {
        onCreated()
      } else {
        setError(result.error ?? "Failed to create sandbox")
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
    <div>
      <h2>Create New Sandbox</h2>

      <div className="form-group">
        <label>Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-sandbox"
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Docker Image</label>
          <input
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="sandobox-base:latest"
          />
          {images.length > 0 && (
            <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-secondary)" }}>
              Available: {images.join(", ")}
            </div>
          )}
        </div>

        <div className="form-group">
          <label>OpenCode Port</label>
          <input
            type="number"
            value={opencodePort}
            onChange={(e) => setOpencodePort(parseInt(e.target.value) || 4096)}
          />
        </div>
      </div>

      <div className="form-group">
        <label>Project Mount Path (optional)</label>
        <input
          value={projectMount}
          onChange={(e) => setProjectMount(e.target.value)}
          placeholder="/home/user/my-project"
        />
      </div>

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
                {PERMISSION_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>{error}</div>
      )}

      <div className="modal-actions">
        <button className="btn" onClick={onCancel} disabled={creating}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={creating}>
          {creating ? "Creating..." : "Create Sandbox"}
        </button>
      </div>
    </div>
  )
}

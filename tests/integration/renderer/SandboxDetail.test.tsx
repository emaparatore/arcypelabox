// @vitest-environment jsdom
import "../../setup/renderer.setup"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SandboxDetail } from "../../../src/components/SandboxDetail"
import { createSandoboxMock } from "../../setup/sandobox.mock"
import type { SandboxInfo, SandboxRecord } from "../../../src/types"

vi.mock("../../../src/components/OpenCodePanel", () => ({
  OpenCodePanel: ({ sandboxId }: { sandboxId: string }) => <div>OpenCode Panel {sandboxId}</div>,
}))

vi.mock("../../../src/components/OpenCodeCLIButton", () => ({
  OpenCodeCLIButton: ({ sandboxId }: { sandboxId: string }) => <button>CLI {sandboxId}</button>,
}))

function makeSandbox(overrides: Partial<SandboxInfo> = {}): SandboxInfo {
  return {
    id: "container-1",
    sandboxId: "sandbox-1",
    name: "Sandbox One",
    image: "arcypelabox-base:sandbox-one",
    status: "running",
    projectMount: "C:/work/project",
    createdAt: "2024-01-01T10:00:00.000Z",
    ...overrides,
  }
}

function makeFullRecord(overrides: Partial<SandboxRecord> = {}): SandboxRecord {
  return {
    id: "sandbox-1",
    name: "Sandbox One",
    image_tag: "arcypelabox-base:sandbox-one",
    project_mount: "C:/work/project",
    runtimes: ["node"],
    tools: ["git", "curl"],
    services: ["postgres"],
    providers: [{ id: "openai", apiKey: "sk-1" }],
    permissions: { bash: "allow" },
    generated_dockerfile: "FROM node:20\nWORKDIR /workspace",
    git_config: { userName: "Marta", userEmail: "marta@example.com" },
    docker_container_id: "container-1",
    created_at: "2024-01-01T10:00:00.000Z",
    updated_at: "2024-01-01T11:00:00.000Z",
    ...overrides,
  }
}

describe("SandboxDetail", () => {
  beforeEach(() => {
    const sandobox = createSandoboxMock()
    vi.mocked(sandobox.db.getFullSandboxRecord).mockResolvedValue(makeFullRecord())
    vi.mocked(sandobox.getProxyTarget).mockResolvedValue({ host: "127.0.0.1", port: 4321 })
    vi.mocked(sandobox.generateCompose).mockResolvedValue("services:\n  app: {}")
    vi.mocked(sandobox.getSandboxLogs).mockResolvedValue([{ time: "10:00", message: "container started" }])
    vi.mocked(sandobox.startSandbox).mockResolvedValue({ success: true })
    vi.mocked(sandobox.stopSandbox).mockResolvedValue({ success: true })
    vi.mocked(sandobox.removeSandbox).mockResolvedValue({ success: true })
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn() },
    })
  })

  it("loads full record and proxy target details", async () => {
    render(<SandboxDetail sandbox={makeSandbox()} sandboxId="sandbox-1" onRefresh={vi.fn()} onDeleted={vi.fn()} />)

    await waitFor(() => {
      expect(window.sandobox.db.getFullSandboxRecord).toHaveBeenCalledWith("sandbox-1")
      expect(window.sandobox.getProxyTarget).toHaveBeenCalledWith("sandbox-1")
      expect(screen.getByText("git, curl")).toBeInTheDocument()
      expect(screen.getByRole("link", { name: /http:\/\/127\.0\.0\.1:4321/i })).toBeInTheDocument()
    })
  })

  it("loads logs when switching to the logs tab and refreshes them", async () => {
    render(<SandboxDetail sandbox={makeSandbox()} sandboxId="sandbox-1" onRefresh={vi.fn()} onDeleted={vi.fn()} />)

    fireEvent.click(screen.getByText("Logs"))
    await waitFor(() => {
      expect(window.sandobox.getSandboxLogs).toHaveBeenCalledWith("container-1")
      expect(screen.getByText("container started")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Refresh Logs"))
    await waitFor(() => {
      expect(window.sandobox.getSandboxLogs).toHaveBeenCalledTimes(2)
    })
  })

  it("starts a stopped sandbox and refreshes the parent", async () => {
    const onRefresh = vi.fn()
    render(<SandboxDetail sandbox={makeSandbox({ status: "stopped" })} sandboxId="sandbox-1" onRefresh={onRefresh} onDeleted={vi.fn()} />)

    fireEvent.click(screen.getByTitle("Start"))
    await waitFor(() => {
      expect(window.sandobox.startSandbox).toHaveBeenCalledWith("container-1")
      expect(onRefresh).toHaveBeenCalled()
    })
  })

  it("confirms stop and delete flows", async () => {
    const onRefresh = vi.fn()
    const onDeleted = vi.fn()
    render(<SandboxDetail sandbox={makeSandbox()} sandboxId="sandbox-1" onRefresh={onRefresh} onDeleted={onDeleted} />)

    fireEvent.click(screen.getByTitle("Stop"))
    fireEvent.click(screen.getByText("Stop"))
    await waitFor(() => {
      expect(window.sandobox.stopSandbox).toHaveBeenCalledWith("container-1")
      expect(onRefresh).toHaveBeenCalled()
    })

    fireEvent.click(screen.getByTitle("Delete"))
    fireEvent.click(screen.getByText("Delete"))
    await waitFor(() => {
      expect(window.sandobox.removeSandbox).toHaveBeenCalledWith("container-1")
      expect(onDeleted).toHaveBeenCalled()
    })
  })

  it("shows backend errors for lifecycle actions", async () => {
    vi.mocked(window.sandobox.startSandbox).mockResolvedValue({ error: "Docker is not running" })
    render(<SandboxDetail sandbox={makeSandbox({ status: "stopped" })} sandboxId="sandbox-1" onRefresh={vi.fn()} onDeleted={vi.fn()} />)

    fireEvent.click(screen.getByTitle("Start"))
    await waitFor(() => {
      expect(screen.getByText("Docker is not running")).toBeInTheDocument()
    })
  })

  it("opens the project folder and terminal from workspace actions", async () => {
    render(<SandboxDetail sandbox={makeSandbox()} sandboxId="sandbox-1" onRefresh={vi.fn()} onDeleted={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTitle("Open folder")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle("Open folder"))
    fireEvent.click(screen.getByTitle("Open in terminal"))

    expect(window.sandobox.openPath).toHaveBeenCalledWith("C:/work/project")
    expect(window.sandobox.openInTerminal).toHaveBeenCalledWith("C:/work/project")
  })

  it("toggles dockerfile and compose and copies their content", async () => {
    render(<SandboxDetail sandbox={makeSandbox()} sandboxId="sandbox-1" onRefresh={vi.fn()} onDeleted={vi.fn()} />)

    await waitFor(() => {
      expect(window.sandobox.generateCompose).toHaveBeenCalledWith("sandbox-1")
    })

    fireEvent.click(screen.getByText("Dockerfile"))
    expect(screen.getByText((content) => content.includes("FROM node:20") && content.includes("WORKDIR /workspace"))).toBeInTheDocument()

    const copyIcons = document.querySelectorAll(".dockerfile-copy svg")
    fireEvent.click(copyIcons[0])
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("FROM node:20\nWORKDIR /workspace")

    fireEvent.click(screen.getByText("Docker Compose"))
    expect(screen.getByText((content) => content.includes("services:") && content.includes("app: {}"))).toBeInTheDocument()

    fireEvent.click(document.querySelectorAll(".dockerfile-copy svg")[1])
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("services:\n  app: {}")
  })

  it("copies the SDK URL from general info", async () => {
    render(<SandboxDetail sandbox={makeSandbox()} sandboxId="sandbox-1" onRefresh={vi.fn()} onDeleted={vi.fn()} />)

    fireEvent.click(screen.getByTitle("Copy URL"))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("http://localhost:4096/sandbox-1")
  })

  it("renders the OpenCode panel only when the sandbox is running", async () => {
    const { rerender } = render(<SandboxDetail sandbox={makeSandbox()} sandboxId="sandbox-1" onRefresh={vi.fn()} onDeleted={vi.fn()} />)

    fireEvent.click(screen.getByText("OpenCode Panel"))
    expect(screen.getByText("OpenCode Panel sandbox-1")).toBeInTheDocument()
    expect(screen.getByText("CLI sandbox-1")).toBeInTheDocument()

    rerender(<SandboxDetail sandbox={makeSandbox({ status: "stopped" })} sandboxId="sandbox-1" onRefresh={vi.fn()} onDeleted={vi.fn()} />)
    fireEvent.click(screen.getByText("OpenCode Panel"))

    expect(screen.getByText("Sandbox is not running")).toBeInTheDocument()
    expect(screen.getByText("Start the sandbox to interact with OpenCode.")).toBeInTheDocument()
  })
})

// @vitest-environment jsdom
import "../../setup/renderer.setup"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SandboxCreate } from "../../../src/components/SandboxCreate"
import { createSandoboxMock } from "../../setup/sandobox.mock"
import type { SandboxRecord } from "../../../src/types"

function advanceToReview() {
  fireEvent.click(screen.getByText("Next"))
  fireEvent.click(screen.getByText("Next"))
  fireEvent.click(screen.getByText("Next"))
}

function fillBaseFields() {
  fireEvent.change(screen.getByPlaceholderText("my-sandbox"), { target: { value: "my-sandbox" } })
  fireEvent.change(screen.getByPlaceholderText("C:\\Users\\emapa\\Desktop\\my-project"), { target: { value: "C:/Users/emapa/project" } })
}

function makeEditRecord(): SandboxRecord {
  return {
    id: "sandbox-1",
    name: "edited-box",
    image_tag: "arcypelabox-base:edited-box",
    project_mount: "C:/Users/emapa/project",
    runtimes: ["node", "python"],
    tools: ["git", "curl"],
    services: ["postgres"],
    providers: [{ id: "openai", apiKey: "sk-1" }],
    permissions: { read: "allow", bash: "deny" },
    generated_dockerfile: "FROM node:20-bookworm-slim",
    git_config: { userName: "Marta", userEmail: "marta@example.com", autocrlf: "input" },
    docker_container_id: "container-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

describe("SandboxCreate", () => {
  beforeEach(() => {
    const sandobox = createSandoboxMock()
    vi.mocked(sandobox.generateDockerfile).mockResolvedValue("FROM node:20-bookworm-slim")
    vi.mocked(sandobox.checkSandboxName).mockResolvedValue(false)
    vi.mocked(sandobox.createSandbox).mockResolvedValue({ sandboxId: "sandbox-1", containerId: "container-1" })
    vi.mocked(sandobox.updateSandbox).mockResolvedValue({ sandboxId: "sandbox-1", containerId: "container-2" })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows validation errors for invalid submit states", async () => {
    render(<SandboxCreate onCreated={vi.fn()} onCancel={vi.fn()} />)
    advanceToReview()

    fireEvent.click(screen.getByText("Build and Create Sandbox"))
    expect(screen.getByText("Name is required")).toBeInTheDocument()

    fireEvent.click(screen.getByText("Back"))
    fireEvent.click(screen.getByText("Back"))
    fireEvent.click(screen.getByText("Back"))

    fireEvent.change(screen.getByPlaceholderText("my-sandbox"), { target: { value: "Bad Name" } })
    fireEvent.change(screen.getByPlaceholderText("C:\\Users\\emapa\\Desktop\\my-project"), { target: { value: "" } })
    advanceToReview()
    fireEvent.click(screen.getByText("Build and Create Sandbox"))

    expect(screen.getByText(/Name must start with a letter or number/)).toBeInTheDocument()
  })

  it("checks for duplicate names before creating", async () => {
    vi.mocked(window.sandobox.checkSandboxName).mockResolvedValue(true)
    render(<SandboxCreate onCreated={vi.fn()} onCancel={vi.fn()} />)

    fillBaseFields()
    advanceToReview()
    fireEvent.click(screen.getByText("Build and Create Sandbox"))

    await waitFor(() => {
      expect(window.sandobox.checkSandboxName).toHaveBeenCalledWith("my-sandbox", undefined)
    })
    expect(screen.getByText('A sandbox with the name "my-sandbox" already exists. Please use a different name.')).toBeInTheDocument()
  })

  it("submits createSandbox with the expected config", async () => {
    render(<SandboxCreate onCreated={vi.fn()} onCancel={vi.fn()} />)

    fillBaseFields()
    advanceToReview()
    fireEvent.click(screen.getByText("Build and Create Sandbox"))

    await waitFor(() => {
      expect(window.sandobox.createSandbox).toHaveBeenCalledTimes(1)
    })

    expect(window.sandobox.createSandbox).toHaveBeenCalledWith(expect.objectContaining({
      name: "my-sandbox",
      image: "arcypelabox-base:my-sandbox",
      projectMount: "C:/Users/emapa/project",
      runtimes: ["node"],
      tools: ["git"],
      services: [],
    }))
  })

  it("uses updateSandbox and pre-populates fields in edit mode", async () => {
    render(<SandboxCreate onCreated={vi.fn()} onCancel={vi.fn()} editRecord={makeEditRecord()} />)

    expect(screen.getByDisplayValue("edited-box")).toBeInTheDocument()
    expect(screen.getByDisplayValue("C:/Users/emapa/project")).toBeInTheDocument()

    advanceToReview()
    fireEvent.click(screen.getByText("Build and Update Sandbox"))

    await waitFor(() => {
      expect(window.sandobox.updateSandbox).toHaveBeenCalledWith(
        "sandbox-1",
        expect.objectContaining({
          name: "edited-box",
          projectMount: "C:/Users/emapa/project",
          providers: [{ id: "openai", apiKey: "sk-1" }],
        }),
      )
    })
  })

  it("shows build progress events and calls onCreated after success", async () => {
    vi.useFakeTimers()
    const onCreated = vi.fn()
    let resolveCreate: ((value: { sandboxId: string; containerId: string }) => void) | null = null
    vi.mocked(window.sandobox.createSandbox).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve
        }),
    )
    render(<SandboxCreate onCreated={onCreated} onCancel={vi.fn()} />)

    fillBaseFields()
    advanceToReview()
    await act(async () => {
      fireEvent.click(screen.getByText("Build and Create Sandbox"))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.sandobox.onBuildProgress).toHaveBeenCalledTimes(1)

    const callback = vi.mocked(window.sandobox.onBuildProgress).mock.calls[0][0]
    act(() => {
      callback({ type: "step", text: "Creating sandbox container" })
      callback({ type: "log", text: "docker build output" })
    })

    expect(screen.getByText("Building Sandbox")).toBeInTheDocument()
    expect(screen.getByText("docker build output")).toBeInTheDocument()
    expect(screen.getByText("Creating sandbox container")).toBeInTheDocument()

    await act(async () => {
      resolveCreate?.({ sandboxId: "sandbox-1", containerId: "container-1" })
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
    })

    expect(onCreated).toHaveBeenCalledWith("sandbox-1", "container-1")
  })

  it("shows backend errors from createSandbox", async () => {
    vi.mocked(window.sandobox.createSandbox).mockResolvedValue({ error: "Docker is not running" })
    render(<SandboxCreate onCreated={vi.fn()} onCancel={vi.fn()} />)

    fillBaseFields()
    advanceToReview()
    fireEvent.click(screen.getByText("Build and Create Sandbox"))

    await waitFor(() => {
      expect(screen.getByText("Docker is not running")).toBeInTheDocument()
    })
  })
})

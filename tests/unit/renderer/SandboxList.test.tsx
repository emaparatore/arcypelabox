// @vitest-environment jsdom
import "../../setup/renderer.setup"
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SandboxList } from "../../../src/components/SandboxList"
import type { SandboxInfo } from "../../../src/types"

const sandboxes: SandboxInfo[] = [
  { id: "1", sandboxId: "s1", name: "test-sandbox", image: "test:latest", status: "running", createdAt: "2024-01-01" },
  { id: "2", sandboxId: "s2", name: "dev-env", image: "dev:latest", status: "exited", projectMount: "/home/user/project", createdAt: "2024-01-02" },
]

describe("SandboxList", () => {
  it("renders sandbox names", () => {
    render(<SandboxList sandboxes={sandboxes} selectedId={null} loading={false} error={null} onSelect={vi.fn()} onRefresh={vi.fn()} onNewSandbox={vi.fn()} />)
    expect(screen.getByText("test-sandbox")).toBeInTheDocument()
    expect(screen.getByText("dev-env")).toBeInTheDocument()
  })

  it("filters by search query", () => {
    render(<SandboxList sandboxes={sandboxes} selectedId={null} loading={false} error={null} onSelect={vi.fn()} onRefresh={vi.fn()} onNewSandbox={vi.fn()} />)
    const searchInput = screen.getByPlaceholderText("Search sandboxes…")
    fireEvent.change(searchInput, { target: { value: "dev" } })
    expect(screen.getByText("dev-env")).toBeInTheDocument()
    expect(screen.queryByText("test-sandbox")).not.toBeInTheDocument()
  })

  it("shows empty state when no sandboxes", () => {
    render(<SandboxList sandboxes={[]} selectedId={null} loading={false} error={null} onSelect={vi.fn()} onRefresh={vi.fn()} onNewSandbox={vi.fn()} />)
    expect(screen.getByText("No sandboxes yet")).toBeInTheDocument()
  })

  it("shows loading state", () => {
    render(<SandboxList sandboxes={[]} selectedId={null} loading={true} error={null} onSelect={vi.fn()} onRefresh={vi.fn()} onNewSandbox={vi.fn()} />)
    expect(screen.getByText("Loading sandboxes...")).toBeInTheDocument()
  })

  it("shows error state", () => {
    render(<SandboxList sandboxes={[]} selectedId={null} loading={false} error={"Connection failed"} onSelect={vi.fn()} onRefresh={vi.fn()} onNewSandbox={vi.fn()} />)
    expect(screen.getByText("Connection failed")).toBeInTheDocument()
  })

  it("shows project mount folder name", () => {
    render(<SandboxList sandboxes={sandboxes} selectedId={null} loading={false} error={null} onSelect={vi.fn()} onRefresh={vi.fn()} onNewSandbox={vi.fn()} />)
    expect(screen.getByText("project")).toBeInTheDocument()
  })

  it("calls onSelect when a sandbox card is clicked", () => {
    const onSelect = vi.fn()
    render(<SandboxList sandboxes={sandboxes} selectedId={null} loading={false} error={null} onSelect={onSelect} onRefresh={vi.fn()} onNewSandbox={vi.fn()} />)
    fireEvent.click(screen.getByText("test-sandbox"))
    expect(onSelect).toHaveBeenCalledWith("1", "s1")
  })

  it("calls onNewSandbox when the new button is clicked", () => {
    const onNewSandbox = vi.fn()
    render(<SandboxList sandboxes={sandboxes} selectedId={null} loading={false} error={null} onSelect={vi.fn()} onRefresh={vi.fn()} onNewSandbox={onNewSandbox} />)
    const newBtn = screen.getByTitle("New Sandbox")
    fireEvent.click(newBtn)
    expect(onNewSandbox).toHaveBeenCalledTimes(1)
  })

  it("shows no-results message when filter matches nothing", () => {
    render(<SandboxList sandboxes={sandboxes} selectedId={null} loading={false} error={null} onSelect={vi.fn()} onRefresh={vi.fn()} onNewSandbox={vi.fn()} />)
    const searchInput = screen.getByPlaceholderText("Search sandboxes…")
    fireEvent.change(searchInput, { target: { value: "zzzz" } })
    expect(screen.getByText("No sandboxes match your search")).toBeInTheDocument()
  })
})

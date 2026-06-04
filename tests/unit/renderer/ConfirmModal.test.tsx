// @vitest-environment jsdom
import "../../setup/renderer.setup"
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ConfirmModal } from "../../../src/components/ConfirmModal"

describe("ConfirmModal", () => {
  it("renders title and message", () => {
    render(<ConfirmModal title="Delete Sandbox" message="Are you sure?" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText("Delete Sandbox")).toBeInTheDocument()
    expect(screen.getByText("Are you sure?")).toBeInTheDocument()
  })

  it("calls onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn()
    render(<ConfirmModal title="Test" message="test" onConfirm={onConfirm} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByText("Confirm"))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn()
    render(<ConfirmModal title="Test" message="test" onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByText("Cancel"))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("calls onCancel when overlay is clicked", () => {
    const onCancel = vi.fn()
    render(<ConfirmModal title="Test" message="test" onConfirm={vi.fn()} onCancel={onCancel} />)
    const overlay = document.querySelector(".modal-overlay")!
    fireEvent.click(overlay)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("stops propagation on modal click", () => {
    const onCancel = vi.fn()
    render(<ConfirmModal title="Test" message="test" onConfirm={vi.fn()} onCancel={onCancel} />)
    const modal = screen.getByRole("heading", { name: "Test" }).parentElement!
    fireEvent.click(modal)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it("uses custom button labels", () => {
    render(<ConfirmModal title="Test" message="test" confirmLabel="Yes" cancelLabel="No" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText("Yes")).toBeInTheDocument()
    expect(screen.getByText("No")).toBeInTheDocument()
  })

  it("applies danger variant by default", () => {
    render(<ConfirmModal title="Test" message="test" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText("Confirm").classList.contains("btn-danger")).toBe(true)
  })

  it("applies warning variant when specified", () => {
    render(<ConfirmModal title="Test" message="test" variant="warning" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText("Confirm").classList.contains("btn-primary")).toBe(true)
  })
})

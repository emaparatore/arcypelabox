// @vitest-environment jsdom
import "../../setup/renderer.setup"
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { BuildProgressModal } from "../../../src/components/BuildProgressModal"

describe("BuildProgressModal", () => {
  it("shows building state with logs", () => {
    const logs = [
      { type: "step" as const, text: "Downloading base image…" },
      { type: "log" as const, text: "#1 pulling from docker.io" },
    ]
    render(<BuildProgressModal status="building" logs={logs} />)
    expect(screen.getByText("Building Sandbox")).toBeInTheDocument()
    expect(screen.getByText("#1 pulling from docker.io")).toBeInTheDocument()
    expect(screen.getByText("Downloading base image…")).toBeInTheDocument()
  })

  it("shows success state when build completes", () => {
    render(<BuildProgressModal status="success" logs={[]} />)
    expect(screen.getByText("Sandbox ready!")).toBeInTheDocument()
    expect(screen.getByText("Your sandbox has been created successfully.")).toBeInTheDocument()
  })

  it("does not render building content in success state", () => {
    render(<BuildProgressModal status="success" logs={[{ type: "log" as const, text: "build step" }]} />)
    expect(screen.queryByText("Building Sandbox")).not.toBeInTheDocument()
  })

  it("filters out step entries from log display", () => {
    const logs = [
      { type: "step" as const, text: "Installing packages…" },
      { type: "log" as const, text: "#5 RUN apt-get install" },
      { type: "log" as const, text: "#6 RUN npm install" },
    ]
    render(<BuildProgressModal status="building" logs={logs} />)
    expect(screen.queryByText("Installing packages…")).toBeInTheDocument()
    expect(screen.getByText("#5 RUN apt-get install")).toBeInTheDocument()
    expect(screen.getByText("#6 RUN npm install")).toBeInTheDocument()
  })
})

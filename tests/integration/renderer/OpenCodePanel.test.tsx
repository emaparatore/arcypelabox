// @vitest-environment jsdom
import "../../setup/renderer.setup"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OpenCodePanel } from "../../../src/components/OpenCodePanel"

const hookState = vi.hoisted(() => ({
  value: null as any,
}))

vi.mock("../../../src/hooks/useOpenCode", () => ({
  useOpenCode: vi.fn(() => hookState.value),
}))

vi.mock("../../../src/components/OpenCodeCLIButton", () => ({
  OpenCodeCLIButton: () => <button>CLI</button>,
}))

function makeUseOpenCodeState(overrides: Record<string, unknown> = {}) {
  return {
    messages: [],
    messagesEndRef: { current: document.createElement("div") },
    connected: true,
    loading: false,
    providers: [
      { id: "openai", name: "OpenAI", models: [{ id: "gpt-4.1", name: "GPT-4.1", providerId: "openai", variants: [] }] },
    ],
    sessions: [
      { id: "session-1", title: "First Session", model: { providerID: "openai", id: "gpt-4.1" }, status: "idle" },
      { id: "session-2", title: "Busy Session", model: null, status: "busy" },
    ],
    selectedSessionId: "session-1",
    setSelectedSessionId: vi.fn(),
    pendingPermissions: [],
    pendingQuestions: [],
    sessionDebug: null,
    setSessionDebug: vi.fn(),
    diagnostic: null,
    sendPrompt: vi.fn(async () => undefined),
    createSession: vi.fn(async () => undefined),
    deleteSession: vi.fn(async () => undefined),
    abortSession: vi.fn(async () => undefined),
    replyQuestion: vi.fn(async () => undefined),
    replyPermission: vi.fn(async () => undefined),
    refreshSessionDebug: vi.fn(),
    refreshAll: vi.fn(),
    ...overrides,
  }
}

describe("OpenCodePanel", () => {
  beforeEach(() => {
    hookState.value = makeUseOpenCodeState()
  })

  it("renders connection state and sessions", () => {
    render(<OpenCodePanel sandboxId="sandbox-1" containerId="container-1" />)

    expect(screen.getByText("Connected")).toBeInTheDocument()
    expect(screen.getByText("First Session")).toBeInTheDocument()
    expect(screen.getByText("Busy Session")).toBeInTheDocument()
  })

  it("blocks sending when the selected session is busy", async () => {
    hookState.value = makeUseOpenCodeState({ selectedSessionId: "session-2" })
    render(<OpenCodePanel sandboxId="sandbox-1" containerId="container-1" />)

    fireEvent.change(screen.getByPlaceholderText("Ask OpenCode to do something..."), { target: { value: "hello" } })
    expect(screen.getByTitle("Send message")).toBeDisabled()
  })

  it("renders permission banner and replies to permission requests", async () => {
    const replyPermission = vi.fn(async () => undefined)
    hookState.value = makeUseOpenCodeState({
      pendingPermissions: [{ id: "perm-1", sessionId: "session-1", permission: "bash", patterns: ["npm *"] }],
      replyPermission,
    })
    render(<OpenCodePanel sandboxId="sandbox-1" containerId="container-1" />)

    expect(screen.getByText("OpenCode is waiting for permission")).toBeInTheDocument()
    fireEvent.click(screen.getByText("Always Allow"))

    await waitFor(() => {
      expect(replyPermission).toHaveBeenCalledWith("perm-1", "always")
    })
  })

  it("renders question banner and submits answers", async () => {
    const replyQuestion = vi.fn(async () => undefined)
    hookState.value = makeUseOpenCodeState({
      pendingQuestions: [{
        id: "question-1",
        sessionId: "session-1",
        questions: [{
          header: "Deploy?",
          question: "Proceed with deployment?",
          multiple: false,
          options: [{ label: "Yes", description: "Continue" }, { label: "No", description: "Stop" }],
        }],
      }],
      replyQuestion,
    })
    render(<OpenCodePanel sandboxId="sandbox-1" containerId="container-1" />)

    fireEvent.click(screen.getByText("Yes"))
    fireEvent.click(screen.getByText("Submit Answer"))

    await waitFor(() => {
      expect(replyQuestion).toHaveBeenCalledWith("question-1", [["Yes"]])
    })
  })

  it("shows diagnostic errors", () => {
    hookState.value = makeUseOpenCodeState({ diagnostic: "OpenCode server unreachable" })
    render(<OpenCodePanel sandboxId="sandbox-1" containerId="container-1" />)

    expect(screen.getByText("OpenCode server unreachable")).toBeInTheDocument()
  })

  it("creates a new session with the selected model", async () => {
    const createSession = vi.fn(async () => undefined)
    hookState.value = makeUseOpenCodeState({ createSession })
    render(<OpenCodePanel sandboxId="sandbox-1" containerId="container-1" />)

    fireEvent.click(screen.getByText("+ New"))
    fireEvent.change(screen.getByPlaceholderText("Session title..."), { target: { value: "Deploy chat" } })
    fireEvent.click(screen.getByText("Create"))

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledWith({
        title: "Deploy chat",
        model: { providerID: "openai", id: "gpt-4.1" },
      })
    })
  })

  it("confirms session deletion before calling deleteSession", async () => {
    const deleteSession = vi.fn(async () => undefined)
    hookState.value = makeUseOpenCodeState({ deleteSession })
    render(<OpenCodePanel sandboxId="sandbox-1" containerId="container-1" />)

    fireEvent.click(screen.getAllByTitle("Delete session")[0])
    expect(screen.getByText("Delete session")).toBeInTheDocument()
    fireEvent.click(screen.getByText("Delete"))

    await waitFor(() => {
      expect(deleteSession).toHaveBeenCalledWith("session-1")
    })
  })
})

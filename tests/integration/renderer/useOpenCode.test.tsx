// @vitest-environment jsdom
import "../../setup/renderer.setup"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { createSandoboxMock } from "../../setup/sandobox.mock"
import { useOpenCode } from "../../../src/hooks/useOpenCode"

const sandboxId = "test-sandbox-uuid"

beforeEach(() => {
  vi.useFakeTimers()
  createSandoboxMock()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("useOpenCode", () => {
  it("subscribes to events on mount", () => {
    renderHook(() => useOpenCode(sandboxId))
    expect(window.sandobox.opencode.subscribeEvents).toHaveBeenCalledWith(sandboxId)
  })

  it("unsubscribes from events on unmount", () => {
    const { unmount } = renderHook(() => useOpenCode(sandboxId))
    unmount()
    expect(window.sandobox.opencode.unsubscribeEvents).toHaveBeenCalledWith(sandboxId)
  })

  it("starts heartbeat interval on mount", async () => {
    renderHook(() => useOpenCode(sandboxId))
    expect(window.sandobox.opencode.checkHealth).not.toHaveBeenCalled()
    // advance + flush microtasks
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000)
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(window.sandobox.opencode.checkHealth).toHaveBeenCalledWith(sandboxId)
  })

  it("sets connected=false when health check returns false", async () => {
    vi.mocked(window.sandobox.opencode.checkHealth).mockResolvedValue(false)
    const { result } = renderHook(() => useOpenCode(sandboxId))
    // Advance hearbeat and flush all microtasks
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000)
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.connected).toBe(false)
  })

  it("starts polling interval for sessions", async () => {
    vi.mocked(window.sandobox.getOpenCodeSessions).mockResolvedValue([])
    renderHook(() => useOpenCode(sandboxId))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(window.sandobox.getOpenCodeSessions).toHaveBeenCalledWith(sandboxId)
  })

  it("updates sessions from polling", async () => {
    const sessions = [{ id: "s1", title: "Session 1", model: null, status: "idle" as const }]
    vi.mocked(window.sandobox.getOpenCodeSessions).mockResolvedValue(sessions)
    const { result } = renderHook(() => useOpenCode(sandboxId))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.sessions).toEqual(sessions)
  })

  it("updates selectedSessionId via onState", () => {
    const sessions = [
      { id: "s1", title: "Session 1", model: null, status: "idle" as const },
      { id: "s2", title: "Session 2", model: null, status: "busy" as const },
    ]
    const { result } = renderHook(() => useOpenCode(sandboxId))
    const stateCallback = vi.mocked(window.sandobox.opencode.onState).mock.calls[0][0]

    act(() => {
      stateCallback(sandboxId, {
        sessions,
        permissions: [],
        questions: [],
        providers: [],
      })
    })

    expect(result.current.selectedSessionId).toBe("s1")
  })

  it("handles state updates via onState subscription", () => {
    const { result } = renderHook(() => useOpenCode(sandboxId))
    const stateCallback = vi.mocked(window.sandobox.opencode.onState).mock.calls[0][0]

    act(() => {
      stateCallback(sandboxId, {
        sessions: [{ id: "s1", title: "New", model: null, status: "idle" }],
        permissions: [{ id: "p1", sessionId: "s1", permission: "bash", patterns: [] }],
        questions: [],
        providers: [],
      })
    })

    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.sessions[0].id).toBe("s1")
    expect(result.current.pendingPermissions).toHaveLength(1)
    expect(result.current.pendingPermissions[0].permission).toBe("bash")
  })

  it("sendPrompt sends message and appends assistant response", async () => {
    vi.useRealTimers()
    vi.mocked(window.sandobox.opencode.sendPrompt).mockResolvedValue("Assistant reply")
    const { result } = renderHook(() => useOpenCode(sandboxId))
    const stateCallback = vi.mocked(window.sandobox.opencode.onState).mock.calls[0][0]

    act(() => {
      stateCallback(sandboxId, {
        sessions: [{ id: "s1", title: "Session", model: null, status: "idle" }],
        permissions: [],
        questions: [],
        providers: [],
      })
    })

    await act(async () => {
      await result.current.sendPrompt("Hello")
    })

    expect(window.sandobox.opencode.sendPrompt).toHaveBeenCalledWith(sandboxId, "s1", "Hello")
    const msgs = result.current.messages
    expect(msgs.length).toBeGreaterThanOrEqual(1)
    expect(msgs[msgs.length - 1].role).toBe("assistant")
  })

  it("sendPrompt handles errors gracefully", async () => {
    vi.useRealTimers()
    vi.mocked(window.sandobox.opencode.sendPrompt).mockRejectedValue(new Error("API error"))
    const { result } = renderHook(() => useOpenCode(sandboxId))
    const stateCallback = vi.mocked(window.sandobox.opencode.onState).mock.calls[0][0]

    act(() => {
      stateCallback(sandboxId, {
        sessions: [{ id: "s1", title: "Session", model: null, status: "idle" }],
        permissions: [],
        questions: [],
        providers: [],
      })
    })

    await act(async () => {
      await result.current.sendPrompt("Hello")
    })

    expect(result.current.diagnostic).toBe("API error")
    const msgs = result.current.messages
    expect(msgs.length).toBeGreaterThanOrEqual(1)
    expect(msgs[msgs.length - 1].content).toContain("Error")
  })

  it("createSession calls API and refreshes sessions", async () => {
    const newSession = { id: "new-s1", title: "New Session", model: null, status: "idle" as const }
    vi.mocked(window.sandobox.createOpenCodeSession).mockResolvedValue(newSession)
    vi.mocked(window.sandobox.getOpenCodeSessions).mockResolvedValue([newSession])
    const { result } = renderHook(() => useOpenCode(sandboxId))

    await act(async () => {
      await result.current.createSession({ title: "New Session" })
    })

    expect(window.sandobox.createOpenCodeSession).toHaveBeenCalledWith(sandboxId, { title: "New Session" })
    expect(result.current.selectedSessionId).toBe("new-s1")
  })

  it("deleteSession removes session from state", async () => {
    vi.mocked(window.sandobox.deleteOpenCodeSession).mockResolvedValue({ success: true })
    const { result } = renderHook(() => useOpenCode(sandboxId))
    const stateCallback = vi.mocked(window.sandobox.opencode.onState).mock.calls[0][0]

    act(() => {
      stateCallback(sandboxId, {
        sessions: [{ id: "s1", title: "Session", model: null, status: "idle" }],
        permissions: [],
        questions: [],
        providers: [],
      })
    })

    expect(result.current.selectedSessionId).toBe("s1")

    await act(async () => {
      await result.current.deleteSession("s1")
    })

    expect(window.sandobox.deleteOpenCodeSession).toHaveBeenCalledWith(sandboxId, "s1")
  })

  it("clears event listeners and subscriptions on unmount", () => {
    const { unmount } = renderHook(() => useOpenCode(sandboxId))
    const onEventCleanup = vi.mocked(window.sandobox.opencode.onEvent).mock.results[0].value
    const onStateCleanup = vi.mocked(window.sandobox.opencode.onState).mock.results[0].value

    unmount()

    expect(window.sandobox.opencode.unsubscribeEvents).toHaveBeenCalledWith(sandboxId)
    expect(onEventCleanup).toHaveBeenCalled()
    expect(onStateCleanup).toHaveBeenCalled()
  })

  it("does not subscribe when no sandboxId", () => {
    renderHook(() => useOpenCode())
    expect(window.sandobox.opencode.subscribeEvents).not.toHaveBeenCalled()
  })
})

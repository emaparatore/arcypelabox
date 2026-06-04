import { vi } from "vitest"
import type { SandboxWindowApi } from "../../src/types"

export function createSandoboxMock(): SandboxWindowApi {
  const sandobox = {
    generateDockerfile: vi.fn(),
    generateCompose: vi.fn(),
    checkImage: vi.fn(),
    checkSandboxName: vi.fn(),
    listSandboxes: vi.fn(),
    createSandbox: vi.fn(),
    updateSandbox: vi.fn(),
    startSandbox: vi.fn(),
    stopSandbox: vi.fn(),
    removeSandbox: vi.fn(),
    getSandboxLogs: vi.fn(),
    getSandboxInfo: vi.fn(),
    getProxyTarget: vi.fn(),
    execInSandbox: vi.fn(),
    listPendingPermissions: vi.fn(),
    replyPermission: vi.fn(),
    listPendingQuestions: vi.fn(),
    replyQuestion: vi.fn(),
    getOpenCodeSessions: vi.fn(),
    createOpenCodeSession: vi.fn(),
    deleteOpenCodeSession: vi.fn(() => ({ success: true })),
    abortOpenCodeSession: vi.fn(),
    getOpenCodeSessionDebug: vi.fn(),
    getAvailableSessionId: vi.fn(),
    getSessionMessages: vi.fn(() => Promise.resolve([])),
    opencode: {
      checkHealth: vi.fn(() => Promise.resolve(true)),
      sendPrompt: vi.fn(),
      sendPromptAsync: vi.fn(),
      runShell: vi.fn(),
      openCLI: vi.fn(),
      listProviders: vi.fn(),
      subscribeEvents: vi.fn(() => Promise.resolve({ success: true })),
      unsubscribeEvents: vi.fn(() => Promise.resolve({ success: true })),
      onEvent: vi.fn(() => vi.fn()),
      onState: vi.fn(() => vi.fn()),
    },
    openPath: vi.fn(),
    openInTerminal: vi.fn(),
    onBuildProgress: vi.fn(() => vi.fn()),
    db: {
      getSandboxById: vi.fn(),
      getSandboxByContainerId: vi.fn(),
      getFullSandboxRecord: vi.fn(),
      listSandboxes: vi.fn(),
      deleteSandbox: vi.fn(),
      getChatMessages: vi.fn(),
      addChatMessage: vi.fn(),
      clearChatMessages: vi.fn(),
      getSetting: vi.fn(),
      setSetting: vi.fn(),
    },
  }

  Object.defineProperty(window, "sandobox", {
    value: sandobox,
    writable: true,
    configurable: true,
  })

  return sandobox as unknown as SandboxWindowApi
}

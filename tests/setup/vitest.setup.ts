import * as matchers from "@testing-library/jest-dom/matchers"
import { expect, vi } from "vitest"
expect.extend(matchers)

// Polyfill scrollIntoView for jsdom
Element.prototype.scrollIntoView = vi.fn()

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/fake/path"),
    isPackaged: true,
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    getAppPath: vi.fn(() => "/fake/app/path"),
  },
  BrowserWindow: vi.fn(() => ({
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    webContents: {
      send: vi.fn(),
      on: vi.fn(),
      toggleDevTools: vi.fn(),
    },
    on: vi.fn(),
    isDestroyed: vi.fn(() => false),
  })),
  ipcMain: {
    handle: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  },
  shell: {
    openPath: vi.fn(),
  },
}))

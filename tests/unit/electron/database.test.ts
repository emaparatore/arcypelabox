import path from "node:path"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SandboxConfig } from "../../../electron/docker.js"

type SandboxRow = Record<string, any>
type ChatRow = Record<string, any>

const fakeDbState = vi.hoisted(() => {
  type Store = {
    columns: Set<string>
    sandboxes: SandboxRow[]
    chatMessages: ChatRow[]
    settings: Record<string, string>
  }

  const stores = new Map<string, Store>()

  const createStore = (): Store => ({
    columns: new Set([
      "id",
      "name",
      "image_tag",
      "project_mount",
      "runtimes",
      "tools",
      "services",
      "providers",
      "permissions",
      "generated_dockerfile",
      "git_config",
      "docker_container_id",
      "created_at",
      "updated_at",
    ]),
    sandboxes: [],
    chatMessages: [],
    settings: {},
  })

  return {
    stores,
    getStore(dbPath: string) {
      let store = stores.get(dbPath)
      if (!store) {
        store = createStore()
        stores.set(dbPath, store)
      }
      return store
    },
    reset() {
      stores.clear()
    },
    seedLegacySchema(dbPath: string) {
      stores.set(dbPath, {
        columns: new Set([
          "id",
          "name",
          "image_tag",
          "project_mount",
          "runtimes",
          "tools",
          "services",
          "permissions",
          "generated_dockerfile",
          "docker_container_id",
          "created_at",
          "updated_at",
          "provider_id",
          "model_id",
          "provider_api_key_enc",
          "opencode_port",
        ]),
        sandboxes: [],
        chatMessages: [],
        settings: {},
      })
    },
  }
})

const electronState = vi.hoisted(() => ({
  userDataDir: "",
  encryptionAvailable: false,
  encryptString: vi.fn((value: string) => Buffer.from(`enc:${value}`)),
  decryptString: vi.fn((value: Buffer) => value.toString().replace(/^enc:/, "")),
}))

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => electronState.userDataDir),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => electronState.encryptionAvailable),
    encryptString: electronState.encryptString,
    decryptString: electronState.decryptString,
  },
}))

vi.mock("better-sqlite3", () => {
  class FakeDatabase {
    private store

    constructor(private dbPath: string) {
      this.store = fakeDbState.getStore(dbPath)
    }

    pragma() {}

    exec(sql: string) {
      if (sql.includes("ALTER TABLE sandboxes ADD COLUMN providers")) {
        this.store.columns.add("providers")
      }
      if (sql.includes("ALTER TABLE sandboxes ADD COLUMN git_config")) {
        this.store.columns.add("git_config")
      }
      if (sql.includes("ALTER TABLE sandboxes DROP COLUMN opencode_port")) {
        this.store.columns.delete("opencode_port")
      }
    }

    prepare(query: string) {
      const q = query.replace(/\s+/g, " ").trim()
      const store = this.store

      return {
        run: (...args: any[]) => {
          if (q.startsWith("INSERT INTO sandboxes")) {
            const [id, name, imageTag, projectMount, runtimes, tools, services, providers, permissions, dockerfile, gitConfig, containerId, createdAt, updatedAt] = args
            store.sandboxes.push({
              id,
              name,
              image_tag: imageTag,
              project_mount: projectMount,
              runtimes,
              tools,
              services,
              providers,
              permissions,
              generated_dockerfile: dockerfile,
              git_config: gitConfig,
              docker_container_id: containerId,
              created_at: createdAt,
              updated_at: updatedAt,
            })
            return
          }

          if (q.startsWith("UPDATE sandboxes SET")) {
            const [name, imageTag, projectMount, runtimes, tools, services, providers, permissions, dockerfile, gitConfig, containerId, updatedAt, id] = args
            const row = store.sandboxes.find((entry) => entry.id === id)
            if (!row) return
            Object.assign(row, {
              name,
              image_tag: imageTag,
              project_mount: projectMount,
              runtimes,
              tools,
              services,
              providers,
              permissions,
              generated_dockerfile: dockerfile,
              git_config: gitConfig,
              docker_container_id: containerId,
              updated_at: updatedAt,
            })
            return
          }

          if (q === "DELETE FROM sandboxes WHERE id = ?") {
            const [id] = args
            store.sandboxes = store.sandboxes.filter((entry) => entry.id !== id)
            store.chatMessages = store.chatMessages.filter((entry) => entry.sandbox_id !== id)
            return
          }

          if (q === "DELETE FROM sandboxes WHERE docker_container_id = ?") {
            const [containerId] = args
            const deletedIds = new Set(store.sandboxes.filter((entry) => entry.docker_container_id === containerId).map((entry) => entry.id))
            store.sandboxes = store.sandboxes.filter((entry) => entry.docker_container_id !== containerId)
            store.chatMessages = store.chatMessages.filter((entry) => !deletedIds.has(entry.sandbox_id))
            return
          }

          if (q.startsWith("INSERT INTO chat_messages")) {
            const [id, sandboxId, role, content, timestamp] = args
            store.chatMessages.push({ id, sandbox_id: sandboxId, role, content, timestamp })
            return
          }

          if (q === "DELETE FROM chat_messages WHERE sandbox_id = ?") {
            const [sandboxId] = args
            store.chatMessages = store.chatMessages.filter((entry) => entry.sandbox_id !== sandboxId)
            return
          }

          if (q.startsWith("INSERT INTO app_settings")) {
            const [key, value] = args
            store.settings[key] = value
          }
        },

        get: (...args: any[]) => {
          if (q.includes("pragma_table_info('sandboxes')") && q.includes("name IN ('provider_id', 'model_id', 'provider_api_key_enc')")) {
            const cnt = ["provider_id", "model_id", "provider_api_key_enc"].filter((name) => store.columns.has(name)).length
            return { cnt }
          }

          if (q.includes("pragma_table_info('sandboxes')") && q.includes("name = 'providers'")) {
            return { cnt: store.columns.has("providers") ? 1 : 0 }
          }

          if (q.includes("pragma_table_info('sandboxes')") && q.includes("name = 'git_config'")) {
            return { cnt: store.columns.has("git_config") ? 1 : 0 }
          }

          if (q.includes("pragma_table_info('sandboxes')") && q.includes("name = 'opencode_port'")) {
            return { cnt: store.columns.has("opencode_port") ? 1 : 0 }
          }

          if (q === "SELECT * FROM sandboxes WHERE id = ?") {
            return store.sandboxes.find((entry) => entry.id === args[0])
          }

          if (q === "SELECT * FROM sandboxes WHERE docker_container_id = ?") {
            return store.sandboxes.find((entry) => entry.docker_container_id === args[0])
          }

          if (q === "SELECT providers FROM sandboxes WHERE id = ?") {
            const row = store.sandboxes.find((entry) => entry.id === args[0])
            return row ? { providers: row.providers } : undefined
          }

          if (q === "SELECT id FROM sandboxes WHERE name = ? AND id != ?") {
            const row = store.sandboxes.find((entry) => entry.name === args[0] && entry.id !== args[1])
            return row ? { id: row.id } : undefined
          }

          if (q === "SELECT id FROM sandboxes WHERE name = ?") {
            const row = store.sandboxes.find((entry) => entry.name === args[0])
            return row ? { id: row.id } : undefined
          }

          if (q === "SELECT value FROM app_settings WHERE key = ?") {
            const value = store.settings[args[0]]
            return value === undefined ? undefined : { value }
          }

          return undefined
        },

        all: (...args: any[]) => {
          if (q === "SELECT * FROM sandboxes ORDER BY created_at DESC") {
            return [...store.sandboxes].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
          }

          if (q === "SELECT * FROM chat_messages WHERE sandbox_id = ? ORDER BY timestamp ASC") {
            return store.chatMessages
              .filter((entry) => entry.sandbox_id === args[0])
              .sort((a, b) => a.timestamp - b.timestamp)
          }

          if (q === "PRAGMA table_info('sandboxes')") {
            return [...store.columns].map((name) => ({ name }))
          }

          return []
        },
      }
    }
  }

  return {
    default: FakeDatabase,
  }
})

function makeSandboxConfig(overrides: Partial<SandboxConfig & { sandboxId?: string }> = {}): SandboxConfig & { sandboxId?: string } {
  return {
    sandboxId: "sandbox-1",
    name: "sandbox-one",
    image: "arcypelabox-base:sandbox-one",
    generatedDockerfile: "FROM node:20-bookworm-slim",
    projectMount: "C:/Users/emapa/project",
    permissions: { read: "allow", bash: "ask" },
    runtimes: ["node", "python"],
    tools: ["git", "curl"],
    services: ["postgres"],
    ...overrides,
  }
}

async function loadDatabaseModule() {
  vi.resetModules()
  return import("../../../electron/database.js")
}

function getDbPath() {
  return path.join(electronState.userDataDir, "sandobox.db")
}

beforeEach(() => {
  fakeDbState.reset()
  electronState.userDataDir = mkdtempSync(path.join(tmpdir(), "sandobox-db-test-"))
  electronState.encryptionAvailable = false
  electronState.encryptString.mockClear()
  electronState.decryptString.mockClear()
})

afterEach(() => {
  rmSync(electronState.userDataDir, { recursive: true, force: true })
})

describe("electron/database", () => {
  it("creates, reads, lists, updates and deletes sandbox records", async () => {
    const db = await loadDatabaseModule()
    db.initDatabase()

    const firstId = db.createSandboxRecord(makeSandboxConfig({ sandboxId: "sandbox-1", name: "alpha" }), "container-1")
    const secondId = db.createSandboxRecord(makeSandboxConfig({ sandboxId: "sandbox-2", name: "beta", services: [] }), "container-2")

    const firstRecord = db.getSandboxRecord(firstId) as any
    expect(firstRecord.name).toBe("alpha")
    expect(firstRecord.runtimes).toEqual(["node", "python"])
    expect(firstRecord.permissions).toEqual({ read: "allow", bash: "ask" })

    expect((db.getSandboxByContainerId("container-2") as any).id).toBe(secondId)

    const listed = db.listSandboxRecords() as any[]
    expect(listed.map((record) => record.name)).toEqual(["beta", "alpha"])

    db.updateSandboxRecord(firstId, makeSandboxConfig({ name: "alpha-updated", tools: ["git"], services: ["redis"] }), "container-3")
    const updated = db.getSandboxRecord(firstId) as any
    expect(updated.name).toBe("alpha-updated")
    expect(updated.tools).toEqual(["git"])
    expect(updated.services).toEqual(["redis"])
    expect(updated.docker_container_id).toBe("container-3")

    db.deleteSandboxByContainerId("container-2")
    expect(db.getSandboxByContainerId("container-2")).toBeNull()

    db.deleteSandboxRecord(firstId)
    expect(db.getSandboxRecord(firstId)).toBeNull()
  })

  it("parses nullable git config and stores full records with decrypted providers", async () => {
    const db = await loadDatabaseModule()
    electronState.encryptionAvailable = true
    db.initDatabase()

    const sandboxId = db.createSandboxRecord(
      makeSandboxConfig({
        sandboxId: "sandbox-1",
        providers: [{ id: "openai", apiKey: "sk-secret" }],
        gitConfig: { userName: "Marta", userEmail: "marta@example.com", autocrlf: "input" },
      }),
      "container-1",
    )

    const fullRecord = db.getSandboxRecordFull(sandboxId) as any
    expect(electronState.encryptString).toHaveBeenCalledTimes(1)
    expect(fullRecord.providers).toEqual([{ id: "openai", apiKey: "sk-secret" }])
    expect(fullRecord.git_config).toEqual({ userName: "Marta", userEmail: "marta@example.com", autocrlf: "input" })

    const plainId = db.createSandboxRecord(makeSandboxConfig({ sandboxId: "sandbox-2", gitConfig: undefined }), "container-2")
    expect((db.getSandboxRecord(plainId) as any).git_config).toBeNull()
  })

  it("handles provider decryption failures by returning null", async () => {
    const db = await loadDatabaseModule()
    electronState.encryptionAvailable = true
    db.initDatabase()
    const sandboxId = db.createSandboxRecord(
      makeSandboxConfig({ sandboxId: "sandbox-1", providers: [{ id: "anthropic", apiKey: "sk-key" }] }),
      "container-1",
    )
    electronState.decryptString.mockImplementationOnce(() => {
      throw new Error("broken decrypt")
    })

    expect(db.getDecryptedProviders(sandboxId)).toBeNull()
  })

  it("finds name conflicts and respects excludeId", async () => {
    const db = await loadDatabaseModule()
    db.initDatabase()

    const sandboxId = db.createSandboxRecord(makeSandboxConfig({ sandboxId: "sandbox-1", name: "my-box" }), "container-1")
    expect(db.findNameConflict("my-box")).toBe(true)
    expect(db.findNameConflict("other-box")).toBe(false)
    expect(db.findNameConflict("my-box", sandboxId)).toBe(false)
  })

  it("adds, lists, clears and cascades chat messages", async () => {
    const db = await loadDatabaseModule()
    db.initDatabase()

    const sandboxOne = db.createSandboxRecord(makeSandboxConfig({ sandboxId: "sandbox-1", name: "alpha" }), "container-1")
    const sandboxTwo = db.createSandboxRecord(makeSandboxConfig({ sandboxId: "sandbox-2", name: "beta" }), "container-2")
    const firstMessage = db.addChatMessage(sandboxOne, "user", "hello", 100)
    db.addChatMessage(sandboxOne, "assistant", "world", 101)
    db.addChatMessage(sandboxTwo, "user", "other", 200)

    const messages = db.getChatMessages(sandboxOne)
    expect(messages.map((message) => message.id)).toContain(firstMessage)
    expect(messages.map((message) => message.content)).toEqual(["hello", "world"])

    db.clearChatMessages(sandboxTwo)
    expect(db.getChatMessages(sandboxTwo)).toEqual([])

    db.deleteSandboxRecord(sandboxOne)
    expect(db.getChatMessages(sandboxOne)).toEqual([])
  })

  it("upserts settings", async () => {
    const db = await loadDatabaseModule()
    db.initDatabase()

    expect(db.getSetting("theme")).toBeNull()
    db.setSetting("theme", "dark")
    expect(db.getSetting("theme")).toBe("dark")
    db.setSetting("theme", "light")
    expect(db.getSetting("theme")).toBe("light")
  })

  it("returns null providers and warns when encryption is unavailable", async () => {
    const db = await loadDatabaseModule()
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    db.initDatabase()

    const sandboxId = db.createSandboxRecord(
      makeSandboxConfig({ sandboxId: "sandbox-1", providers: [{ id: "openai", apiKey: "sk-key" }] }),
      "container-1",
    )

    expect(warnSpy).toHaveBeenCalled()
    expect(db.getDecryptedProviders(sandboxId)).toBeNull()
    warnSpy.mockRestore()
  })

  it("migrates old sandbox schemas to the current shape", async () => {
    fakeDbState.seedLegacySchema(getDbPath())
    const db = await loadDatabaseModule()
    db.initDatabase()

    const columns = fakeDbState.getStore(getDbPath()).columns
    expect(columns.has("providers")).toBe(true)
    expect(columns.has("git_config")).toBe(true)
    expect(columns.has("opencode_port")).toBe(false)
  })

  it("does not crash when the schema is already current", async () => {
    const db = await loadDatabaseModule()
    db.initDatabase()
    expect(() => db.initDatabase()).not.toThrow()
  })
})

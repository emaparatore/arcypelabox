import { app, safeStorage } from "electron"
import Database from "better-sqlite3"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { SandboxConfig } from "./docker.js"

let db: Database.Database

export function initDatabase(): void {
  const dbPath = path.join(app.getPath("userData"), "sandobox.db")
  db = new Database(dbPath)
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  createTables()
  try {
    migrateSchema()
  } catch (err) {
    console.error("[db] Migration failed (non-critical):", err)
  }
}

function migrateSchema(): void {
  const hasOldColumns = db.prepare(
    "SELECT count(*) as cnt FROM pragma_table_info('sandboxes') WHERE name IN ('provider_id', 'model_id', 'provider_api_key_enc')",
  ).get() as { cnt: number } | undefined

  if (hasOldColumns && hasOldColumns.cnt > 0) {
    const hasProviders = db.prepare(
      "SELECT count(*) as cnt FROM pragma_table_info('sandboxes') WHERE name = 'providers'",
    ).get() as { cnt: number } | undefined

    if (!hasProviders || hasProviders.cnt === 0) {
      db.exec(`
        ALTER TABLE sandboxes ADD COLUMN providers TEXT;
      `)
      console.log("[db] Migrated schema: added providers column")
    }
  }
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sandboxes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      image_tag TEXT NOT NULL,
      opencode_port INTEGER NOT NULL,
      project_mount TEXT,
      runtimes TEXT NOT NULL DEFAULT '[]',
      tools TEXT NOT NULL DEFAULT '[]',
      services TEXT NOT NULL DEFAULT '[]',
      providers TEXT,
      permissions TEXT NOT NULL DEFAULT '{}',
      generated_dockerfile TEXT NOT NULL,
      docker_container_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      sandbox_id TEXT NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_sandbox ON chat_messages(sandbox_id);
    CREATE INDEX IF NOT EXISTS idx_chat_ts ON chat_messages(timestamp);
  `)
}

function encrypt(plaintext: string): string | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn("[db] safeStorage encryption not available — API key will not be encrypted")
      return null
    }
    return safeStorage.encryptString(plaintext).toString("base64")
  } catch (err) {
    console.error("[db] encryption failed:", err)
    return null
  }
}

function decrypt(encrypted: string): string {
  return safeStorage.decryptString(Buffer.from(encrypted, "base64"))
}

export function createSandboxRecord(config: SandboxConfig, dockerContainerId: string): string {
  const id = config.sandboxId ?? randomUUID()
  const now = new Date().toISOString()
  const providersJson = config.providers && config.providers.length > 0
    ? encrypt(JSON.stringify(config.providers))
    : null

  db.prepare(`
    INSERT INTO sandboxes (id, name, image_tag, opencode_port, project_mount,
      runtimes, tools, services, providers,
      permissions, generated_dockerfile, docker_container_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    config.name,
    config.image,
    config.opencodePort,
    config.projectMount ?? null,
    JSON.stringify(config.runtimes),
    JSON.stringify(config.tools),
    JSON.stringify(config.services),
    providersJson,
    JSON.stringify(config.permissions),
    config.generatedDockerfile,
    dockerContainerId,
    now,
    now,
  )

  return id
}

export function getSandboxRecord(id: string): Record<string, unknown> | null {
  const row = db.prepare("SELECT * FROM sandboxes WHERE id = ?").get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return parseRecord(row)
}

export function getSandboxByContainerId(containerId: string): Record<string, unknown> | null {
  const row = db.prepare("SELECT * FROM sandboxes WHERE docker_container_id = ?").get(containerId) as Record<string, unknown> | undefined
  if (!row) return null
  return parseRecord(row)
}

export function deleteSandboxRecord(id: string): void {
  db.prepare("DELETE FROM sandboxes WHERE id = ?").run(id)
}

function parseRecord(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    runtimes: JSON.parse(row.runtimes as string),
    tools: JSON.parse(row.tools as string),
    services: JSON.parse(row.services as string),
    permissions: JSON.parse(row.permissions as string),
  }
}

export function listSandboxRecords(): Record<string, unknown>[] {
  const rows = db.prepare("SELECT * FROM sandboxes ORDER BY created_at DESC").all() as Record<string, unknown>[]
  return rows.map(parseRecord)
}

export function deleteSandboxByContainerId(containerId: string): void {
  db.prepare("DELETE FROM sandboxes WHERE docker_container_id = ?").run(containerId)
}

export function getDecryptedProviders(sandboxId: string): Array<{ id: string; apiKey: string }> | null {
  const row = db.prepare("SELECT providers FROM sandboxes WHERE id = ?").get(sandboxId) as { providers: string | null } | undefined
  if (!row?.providers) return null
  try {
    const json = decrypt(row.providers)
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function getChatMessages(sandboxId: string) {
  return db.prepare(
    "SELECT * FROM chat_messages WHERE sandbox_id = ? ORDER BY timestamp ASC",
  ).all(sandboxId) as Array<{
    id: string
    sandbox_id: string
    role: "user" | "assistant"
    content: string
    timestamp: number
  }>
}

export function addChatMessage(
  sandboxId: string,
  role: "user" | "assistant",
  content: string,
  timestamp: number,
): string {
  const id = randomUUID()
  db.prepare(
    "INSERT INTO chat_messages (id, sandbox_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)",
  ).run(id, sandboxId, role, content, timestamp)
  return id
}

export function clearChatMessages(sandboxId: string): void {
  db.prepare("DELETE FROM chat_messages WHERE sandbox_id = ?").run(sandboxId)
}

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value)
}

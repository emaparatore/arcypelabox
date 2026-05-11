export interface SandboxInfo {
  id: string
  name: string
  image: string
  opencodePort: number
  status: string
  projectMount?: string
  createdAt: string
}

export interface SandboxConfig {
  name: string
  image: string
  opencodePort: number
  projectMount?: string
  permissions: Record<string, string>
  providerApiKey?: string
  providerId?: string
  modelId?: string
}

export interface ContainerLog {
  time: string
  message: string
}

export interface SandboxMessage {
  role: "user" | "assistant"
  content: string
  timestamp: number
}

export const PERMISSION_ACTIONS = ["allow", "ask", "deny"] as const
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]

export const PERMISSION_KEYS = [
  "read",
  "edit",
  "glob",
  "grep",
  "bash",
  "task",
  "webfetch",
  "websearch",
  "external_directory",
] as const

export interface SandboxWindowApi {
  listSandboxes: () => Promise<SandboxInfo[] | { error: string }>
  createSandbox: (config: SandboxConfig) => Promise<string | { error: string }>
  startSandbox: (id: string) => Promise<{ success: boolean } | { error: string }>
  stopSandbox: (id: string) => Promise<{ success: boolean } | { error: string }>
  removeSandbox: (id: string) => Promise<{ success: boolean } | { error: string }>
  getSandboxLogs: (id: string) => Promise<ContainerLog[] | { error: string }>
  getSandboxInfo: (id: string) => Promise<SandboxInfo | null | { error: string }>
  execInSandbox: (id: string, command: string) => Promise<string | { error: string }>
  listImages: () => Promise<string[] | { error: string }>
  opencode: {
    checkHealth: (port: number) => Promise<boolean>
    sendPrompt: (port: number, text: string) => Promise<string>
    runShell: (port: number, command: string) => Promise<string>
  }
}

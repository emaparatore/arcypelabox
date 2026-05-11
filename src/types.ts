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
  generatedDockerfile: string
  projectMount?: string
  permissions: Record<string, string>
  runtimes: SandboxRuntime[]
  tools: SandboxTool[]
  services: SandboxService[]
  providerApiKey?: string
  providerId?: string
  modelId?: string
}

export type SandboxRuntime = "node" | "python" | "dotnet"

export type SandboxTool =
  | "git"
  | "curl"
  | "wget"
  | "vim"
  | "build-essential"
  | "sqlite"
  | "pnpm"
  | "bun"

export type SandboxService = "postgres" | "redis"

export interface ContainerLog {
  time: string
  message: string
}

export interface SandboxMessage {
  role: "user" | "assistant"
  content: string
  timestamp: number
}

export interface PermissionRequestInfo {
  id: string
  sessionId: string
  permission: string
  patterns: string[]
}

export interface OpenCodeSessionInfo {
  id: string
  title: string
  status: "idle" | "busy" | "retry" | "unknown"
  statusMessage?: string
}

export interface OpenCodeSessionDebugInfo {
  sessionId: string
  lastMessageRole?: string
  lastMessageId?: string
  toolName?: string
  toolStatus?: string
  toolInput?: string
  assistantText?: string
  error?: string
}

export interface OpenCodeQuestionOption {
  label: string
  description: string
}

export interface OpenCodeQuestionItem {
  question: string
  header: string
  options: OpenCodeQuestionOption[]
  multiple: boolean
}

export interface OpenCodeQuestionRequest {
  id: string
  sessionId?: string
  questions: OpenCodeQuestionItem[]
}

export const PERMISSION_ACTIONS = ["allow", "ask", "deny"] as const
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]

export const PERMISSION_KEYS = [
  "read",
  "edit",
  "list",
  "write",
  "glob",
  "grep",
  "bash",
  "task",
  "question",
  "todowrite",
  "webfetch",
  "websearch",
  "lsp",
  "external_directory",
] as const

export const SANDBOX_RUNTIMES: SandboxRuntime[] = ["node", "python", "dotnet"]
export const SANDBOX_TOOLS: SandboxTool[] = [
  "git",
  "curl",
  "wget",
  "vim",
  "build-essential",
  "sqlite",
  "pnpm",
  "bun",
]
export const SANDBOX_SERVICES: SandboxService[] = ["postgres", "redis"]

export interface SandboxWindowApi {
  listSandboxes: () => Promise<SandboxInfo[] | { error: string }>
  createSandbox: (config: SandboxConfig) => Promise<string | { error: string }>
  startSandbox: (id: string) => Promise<{ success: boolean } | { error: string }>
  stopSandbox: (id: string) => Promise<{ success: boolean } | { error: string }>
  removeSandbox: (id: string) => Promise<{ success: boolean } | { error: string }>
  getSandboxLogs: (id: string) => Promise<ContainerLog[] | { error: string }>
  getSandboxInfo: (id: string) => Promise<SandboxInfo | null | { error: string }>
  execInSandbox: (id: string, command: string) => Promise<string | { error: string }>
  listPendingPermissions: (port: number) => Promise<PermissionRequestInfo[] | { error: string }>
  replyPermission: (
    port: number,
    requestId: string,
    reply: "once" | "always" | "reject"
  ) => Promise<boolean | { error: string }>
  getOpenCodeSessions: (port: number) => Promise<OpenCodeSessionInfo[] | { error: string }>
  abortOpenCodeSession: (port: number, sessionId: string) => Promise<boolean | { error: string }>
  getOpenCodeSessionDebug: (
    port: number,
    sessionId: string
  ) => Promise<OpenCodeSessionDebugInfo | { error: string }>
  listPendingQuestions: (port: number) => Promise<OpenCodeQuestionRequest[] | { error: string }>
  replyQuestion: (
    port: number,
    requestId: string,
    answers: string[][]
  ) => Promise<boolean | { error: string }>
  opencode: {
    checkHealth: (port: number) => Promise<boolean>
    sendPrompt: (port: number, text: string) => Promise<string>
    runShell: (port: number, command: string) => Promise<string>
  }
}

export interface SandboxInfo {
  id: string
  sandboxId: string
  name: string
  image: string
  opencodePort: number
  status: string
  projectMount?: string
  createdAt: string
}

export interface ProviderConfig {
  id: string
  apiKey: string
}

export interface GitConfig {
  userName: string
  userEmail: string
  autocrlf: "input" | "true" | "false"
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
  providers?: ProviderConfig[]
  customCommands?: string
  gitConfig?: GitConfig
}

export type SandboxRuntime = "node" | "python" | "dotnet" | "go" | "java" | "ruby" | "php" | "rust" | "zig"

export type SandboxTool =
  | "git"
  | "curl"
  | "vim"
  | "build-essential"
  | "sqlite"
  | "pnpm"
  | "bun"
  | "nvm"
  | "jq"
  | "gh"
  | "unzip"
  | "tree"
  | "make"
  | "zip"
  | "ripgrep"
  | "cmake"

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
  "write",
  "glob",
  "grep",
  "bash",
  "task",
  "skill",
  "question",
  "todowrite",
  "webfetch",
  "websearch",
  "lsp",
  "external_directory",
] as const

export const SANDBOX_RUNTIMES: SandboxRuntime[] = ["node", "python", "dotnet", "go", "java", "ruby", "php", "rust", "zig"]
export const SANDBOX_TOOLS: SandboxTool[] = [
  "git",
  "curl",
  "vim",
  "build-essential",
  "sqlite",
  "pnpm",
  "bun",
  "nvm",
  "jq",
  "gh",
  "unzip",
  "tree",
  "make",
  "zip",
  "ripgrep",
  "cmake",
]
export const SANDBOX_SERVICES: SandboxService[] = ["postgres", "redis"]

export const OPENCODE_PROVIDERS = [
  "opencode-go",
  "opencode-zen",
  "openrouter",
  "anthropic",
  "openai",
  "deepseek",
  "google",
  "groq",
  "together",
  "fireworks",
  "cerebras",
  "deepinfra",
  "huggingface",
  "mistral",
  "github-copilot",
  "gitlab",
  "amazon-bedrock",
  "azure-openai",
  "ollama",
  "github",
  "nebius",
  "xai",
] as const

export type OpenCodeProviderId = (typeof OPENCODE_PROVIDERS)[number]

export interface SandboxRecord {
  id: string
  name: string
  image_tag: string
  opencode_port: number
  project_mount: string | null
  runtimes: SandboxRuntime[]
  tools: SandboxTool[]
  services: SandboxService[]
  providers: ProviderConfig[] | null
  permissions: Record<string, string>
  generated_dockerfile: string
  docker_container_id: string | null
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  sandbox_id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
}

export interface CreateSandboxResult {
  sandboxId: string
  containerId: string
}

export interface SandboxWindowApi {
  generateDockerfile: (config: { runtimes: string[]; tools: string[]; services: string[]; customCommands?: string; gitConfig?: { userName: string; userEmail: string; autocrlf: string } }) => Promise<string>
  listSandboxes: () => Promise<SandboxInfo[] | { error: string }>
  createSandbox: (config: SandboxConfig) => Promise<CreateSandboxResult | { error: string }>
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
  db: {
    getSandboxById: (id: string) => Promise<SandboxRecord | null | { error: string }>
    getSandboxByContainerId: (containerId: string) => Promise<SandboxRecord | null | { error: string }>
    listSandboxes: () => Promise<SandboxRecord[] | { error: string }>
    deleteSandbox: (id: string) => Promise<{ success: boolean } | { error: string }>
    getChatMessages: (sandboxId: string) => Promise<ChatMessage[] | { error: string }>
    addChatMessage: (sandboxId: string, role: string, content: string, timestamp: number) => Promise<string | { error: string }>
    clearChatMessages: (sandboxId: string) => Promise<{ success: boolean } | { error: string }>
    getSetting: (key: string) => Promise<string | null | { error: string }>
    setSetting: (key: string, value: string) => Promise<{ success: boolean } | { error: string }>
  }
}

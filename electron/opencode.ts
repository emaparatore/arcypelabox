import { createOpencodeClient } from "@opencode-ai/sdk"

export async function checkHealth(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/global/health`)
    return res.ok
  } catch {
    return false
  }
}

export async function sendPrompt(port: number, text: string): Promise<string> {
  const client = createOpencodeClient({
    baseUrl: `http://localhost:${port}`,
  })

  const sessions = await (client.session as any).list()
  let sessionId: string

  if (sessions.data && sessions.data.length > 0) {
    sessionId = sessions.data[0].id
  } else {
    const session = await (client.session as any).create({
      body: { title: "Sandbox Chat" },
    })
    sessionId = session.data.id
  }

  const result = await (client.session as any).prompt({
    path: { id: sessionId },
    body: { parts: [{ type: "text", text }] },
  })

  const response = result.data
  const textParts =
    response?.parts
      ?.filter((p: { type: string }) => p.type === "text")
      .map((p: { text?: string }) => p.text ?? "")
      .join("\n") ?? JSON.stringify(response?.info ?? result.data)

  return textParts
}

export async function runShell(port: number, command: string): Promise<string> {
  const client = createOpencodeClient({
    baseUrl: `http://localhost:${port}`,
  })

  const sessions = await (client.session as any).list()
  if (!sessions.data || sessions.data.length === 0) return "No active session"

  const result = await (client.session as any).shell({
    path: { id: sessions.data[0].id },
    body: { agent: "default", command },
  })

  return JSON.stringify(result.data)
}

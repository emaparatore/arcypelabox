interface Props {
  port: number
  sessionId?: string
  className?: string
}

export function OpenCodeCLIButton({ port, sessionId, className }: Props) {
  return (
    <button
      className={`btn icon-btn${className ? ` ${className}` : ""}`}
      onClick={() => window.sandobox.opencode.openCLI(port, sessionId)}
      title={`Open terminal with opencode attach http://localhost:${port}${sessionId ? ` --session ${sessionId}` : ""}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    </button>
  )
}

import { useEffect, useRef } from "react"

interface Props {
  logs: { type: "step" | "log"; text: string }[]
}

export function BuildProgressModal({ logs }: Props) {
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs.length])

  const currentStep = [...logs].reverse().find((e) => e.type === "step")

  return (
    <div className="modal-overlay">
      <div className="modal build-progress-modal">
        <div className="build-progress-header">
          <div className="build-progress-spinner" />
          <h2>Building Sandbox</h2>
        </div>
        <div className="build-log-container">
          <div className="build-log-scroll">
            {logs
              .filter((e) => e.type === "log")
              .map((entry, i) => (
                <div key={i} className="build-log-line">{entry.text}</div>
              ))}
            <div ref={logEndRef} />
          </div>
        </div>
        {currentStep && <div className="build-current-step">{currentStep.text}</div>}
        <div className="build-progress-track">
          <div className="build-progress-bar" />
        </div>
      </div>
    </div>
  )
}

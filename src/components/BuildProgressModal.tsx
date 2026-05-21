import { useEffect, useRef } from "react"

interface Props {
  status: "building" | "success"
  logs: { type: "step" | "log"; text: string }[]
}

export function BuildProgressModal({ status, logs }: Props) {
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs.length])

  const currentStep = [...logs].reverse().find((e) => e.type === "step")

  return (
    <div className="modal-overlay">
      <div className="modal build-progress-modal">
        {status === "building" ? (
          <>
            <div className="build-progress-spinner" />
            <div className="build-progress-header">
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
          </>
        ) : (
          <div className="build-success">
            <svg className="build-success-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--brand-sun)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <h2>Sandbox ready!</h2>
            <p className="build-success-sub">Your sandbox has been created successfully.</p>
          </div>
        )}
      </div>
    </div>
  )
}

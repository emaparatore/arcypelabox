import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"

interface Props {
  label: string
  children: ReactNode
}

export function InfoPopover({ label, children }: Props) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (
        !btnRef.current?.contains(event.target as Node) &&
        !contentRef.current?.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }

    const handleScroll = () => {
      setOpen(false)
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    document.addEventListener("scroll", handleScroll, { capture: true })

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("scroll", handleScroll, { capture: true })
    }
  }, [open])

  useEffect(() => {
    if (!open || !btnRef.current || !contentRef.current) return

    const btnRect = btnRef.current.getBoundingClientRect()
    const popover = contentRef.current
    const vw = document.documentElement.clientWidth
    const btnCenter = btnRect.left + btnRect.width / 2

    popover.style.position = "fixed"
    popover.style.top = `${btnRect.bottom + 6}px`
    popover.style.bottom = "auto"

    if (btnCenter < vw / 2) {
      popover.style.left = `${btnRect.left}px`
      popover.style.right = "auto"
    } else {
      popover.style.right = `${vw - btnRect.right}px`
      popover.style.left = "auto"
    }
  }, [open])

  return (
    <div className="info-popover">
      <button
        ref={btnRef}
        type="button"
        className="info-popover-btn"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 7.25v3.5" />
          <path d="M8 4.75h.01" />
        </svg>
      </button>
      {open && createPortal(
        <div ref={contentRef} className="info-popover-content">
          {children}
        </div>,
        document.body,
      )}
    </div>
  )
}

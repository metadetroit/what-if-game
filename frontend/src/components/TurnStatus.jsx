import React from "react"

const STATUS = {
  active: {
    dot: "bg-emerald-300",
    accent: "text-emerald-100",
    panel: "border-emerald-400/60 bg-gradient-to-br from-emerald-950/95 via-emerald-950/80 to-emerald-900/45 shadow-emerald-950/40",
    label: "YOUR TURN",
    text: "Act now"
  },
  next: {
    dot: "bg-amber-300",
    accent: "text-amber-100",
    panel: "border-amber-300/60 bg-gradient-to-br from-amber-950/90 via-amber-950/70 to-amber-900/35 shadow-amber-950/40",
    label: "UP NEXT",
    text: "Get ready"
  },
  watch: {
    dot: "bg-sky-300",
    accent: "text-sky-100",
    panel: "border-sky-400/45 bg-gradient-to-br from-slate-900/95 via-slate-900/85 to-sky-950/55 shadow-sky-950/30",
    label: "WATCHING",
    text: "No action needed"
  }
}

export default function TurnStatus({ status, sub, children }) {
  const current = STATUS[status] || STATUS.watch
  return (
    <div className={`turn-status ${current.panel}`} role="status">
      <div className="turn-status__role">
        <span className={`turn-status__dot ${current.dot}`} aria-hidden="true" />
        <span className={`turn-status__label ${current.accent}`}>{current.label}</span>
      </div>
      <span className="turn-status__title">{children || current.text}</span>
      {sub && <span className="turn-status__sub">{sub}</span>}
    </div>
  )
}

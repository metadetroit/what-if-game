import React from "react"

const STATUS = {
  active: { dot: "bg-emerald-400", panel: "border-emerald-400/40 bg-emerald-950/40", label: "YOUR TURN", text: "Act now" },
  next: { dot: "bg-amber-300", panel: "border-amber-300/40 bg-amber-950/30", label: "UP NEXT", text: "Get ready" },
  watch: { dot: "bg-slate-400", panel: "border-slate-500/40 bg-slate-900/60", label: "WATCHING", text: "No action needed" }
}

export default function TurnStatus({ status, children }) {
  const current = STATUS[status] || STATUS.watch
  return (
    <div className={`flex items-center justify-center gap-2 rounded-full border px-3 py-1.5 ${current.panel}`} role="status">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${current.dot}`} aria-hidden="true" />
      <span className="text-[11px] font-black tracking-[0.18em] text-white">{current.label}</span>
      <span className="text-xs text-gray-300">{children || current.text}</span>
    </div>
  )
}

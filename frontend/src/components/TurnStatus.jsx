import React from "react"

const STATUS = {
  active: { dot: "bg-emerald-400", panel: "border-emerald-400/40 bg-emerald-950/40", label: "YOUR TURN", text: "Act now" },
  next: { dot: "bg-amber-300", panel: "border-amber-300/40 bg-amber-950/30", label: "UP NEXT", text: "Get ready" },
  watch: { dot: "bg-slate-400", panel: "border-slate-500/40 bg-slate-900/60", label: "WATCHING", text: "No action needed" }
}

export default function TurnStatus({ status, sub, children }) {
  const current = STATUS[status] || STATUS.watch
  return (
    <div className={`inline-flex flex-col items-center justify-center rounded-xl border px-3 py-1.5 max-w-full ${current.panel}`} role="status">
      <div className="flex flex-wrap items-center justify-center gap-2 min-w-0">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${current.dot}`} aria-hidden="true" />
        <span className="text-[11px] font-black tracking-[0.18em] text-white">{current.label}</span>
        <span className="text-xs text-gray-300 text-center min-w-0">{children || current.text}</span>
      </div>
      {sub && <span className="text-[11px] text-gray-400 text-center break-words max-w-full mt-0.5 leading-tight">{sub}</span>}
    </div>
  )
}

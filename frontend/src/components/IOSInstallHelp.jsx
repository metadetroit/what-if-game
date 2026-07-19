import React from "react"

export default function IOSInstallHelp({ onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ios-install-title"
      onClick={onClose}
    >
      <div
        className="bg-black/50 border border-white/10 rounded-2xl p-6 max-w-xs w-full text-center shadow-2xl shadow-purple-900/30 backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="ios-install-title" className="font-bubble text-lg font-bold text-gradient-chaos mb-2">Add Fluke to Home Screen</p>
        <p className="text-sm text-[#E6E1FF]/85 mb-4">
          Tap the <span className="font-semibold text-white">Share</span> button in Safari, then choose{" "}
          <span className="font-semibold text-white">Add to Home Screen</span>.
        </p>
        <div className="flex justify-center gap-2 text-2xl mb-4">
          <span>📱</span>
          <span>→</span>
          <span>⬆️</span>
          <span>→</span>
          <span>🏠</span>
        </div>
        <button
          onClick={onClose}
          className="btn-primary w-full py-2 text-sm bg-purple-600 hover:bg-purple-700 min-h-[44px]"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

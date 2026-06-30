import React from "react"
import { saveDraft } from "../utils/gameUtils"

export default function WritingPhase({
  submitted,
  anonymousMode,
  question,
  setQuestion,
  roomCodeRef,
  error,
  submitQuestion,
  progress,
  canForceAdvance,
  setForceConfirm,
  forceConfirm,
  forceConfirmTrapRef,
  forceProgress,
  renderWaitingPanel
}) {
  return (
    <div className="game-container game-container--active py-2">
      {forceConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="force-title">
          <div ref={forceConfirmTrapRef} className="bg-gray-900 border border-red-700 rounded-xl p-6 max-w-xs w-full text-center">
            <p id="force-title" className="text-lg font-bold text-white mb-2">Force Advance?</p>
            <p className="text-sm text-gray-400 mb-4">Players who haven't submitted will be removed from the game.</p>
            <div className="flex gap-3">
              <button onClick={() => setForceConfirm(false)} className="btn-secondary flex-1 py-2 text-sm">Cancel</button>
              <button onClick={forceProgress} className="btn-primary flex-1 py-2 text-sm bg-red-700 hover:bg-red-800">Confirm</button>
            </div>
          </div>
        </div>
      )}
      {!submitted ? (
        <div className="flex-1 flex flex-col min-h-0">
          {anonymousMode && (
            <div className="mb-3 p-2 bg-purple-900/30 border border-purple-700 rounded-lg text-center">
              <p className="text-xs font-bold text-purple-300">🔒 This round is anonymized!</p>
            </div>
          )}
          <div className="phase-banner mb-2">
            <span>Phase 1</span>
            <strong>Question Time</strong>
          </div>
          <div className="text-center mb-1">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0">Your Turn</p>
            <h2 className="font-bubble text-base font-bold text-white leading-tight">Write a Question</h2>
            <p className="text-[10px] text-indigo-400 leading-tight">Must begin with "What if..."</p>
          </div>
          <label htmlFor="question-input" className="sr-only">Your question</label>
          <textarea id="question-input" value={question} onChange={(e) => { setQuestion(e.target.value); saveDraft(roomCodeRef.current, "writing", e.target.value) }} placeholder="Type your question here" autoCapitalize="sentences" aria-label="Your question" className="input-field h-24 resize-none mb-2 text-base leading-snug md:h-28" maxLength={300} />
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">{question.length}/300</span>
            {question && !question.toLowerCase().startsWith("what if") && (<span className="text-xs text-red-500 font-semibold">Must start with "What if"</span>)}
          </div>
          {error && (<div className="p-2 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-xs text-center mb-2">{error}</div>)}
          <button onClick={submitQuestion} disabled={!question.trim() || !question.toLowerCase().startsWith("what if")} className="btn-primary py-3 text-base mb-2">Submit Question</button>
          <div className="w-full">
            <div className={"flex justify-between text-[10px] mb-0.5 " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "text-red-400 font-semibold" : "text-gray-500")}><span>Submissions</span><span>{progress.submitted}/{progress.total}</span></div>
            <div className={"w-full h-1.5 rounded-full overflow-hidden " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "bg-red-900/30" : "bg-gray-800")}><div className={"h-full transition-all duration-500 " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "bg-red-500 animate-pulse" : "bg-indigo-500")} style={{ width: (progress.total > 0 ? (progress.submitted / progress.total) * 100 : 0) + "%" }} /></div>
          </div>
          {canForceAdvance && (
            <button onClick={() => setForceConfirm(true)} className="mt-4 text-xs text-red-500 border border-red-800 rounded-lg px-4 py-2 hover:bg-red-900/20 transition-colors">
              ⚡ Force Advance (skip waiting players)
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center text-center gap-3 min-h-0 overflow-hidden">
          <div className="flex-1 flex flex-col items-center text-center gap-3 overflow-hidden min-h-0 w-full">
            <div className="w-12 h-12 bg-green-900/30 rounded-full flex items-center justify-center mb-3"><span className="text-2xl">✓</span></div>
            <h3 className="font-bubble text-xl font-bold text-white mb-1">Submitted!</h3>
            {renderWaitingPanel('writing')}
            {error && (<div className="p-2 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-xs text-center mt-3 max-w-xs">{error}</div>)}
          </div>
          {canForceAdvance && (
            <div className="host-nudge shrink-0 mt-2">
              <div>
                <p>Host option</p>
                <span>Only use this if someone disappeared.</span>
              </div>
              <button onClick={() => setForceConfirm(true)}>Skip waiting players</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

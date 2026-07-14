import React from "react"
import { saveDraft } from "../utils/gameUtils"

export default function AnsweringPhase({
  submitted,
  assignedQuestion,
  answer,
  setAnswer,
  roomCodeRef,
  error,
  submitAnswer,
  progress,
  canForceAdvance,
  setForceConfirm,
  forceConfirm,
  forceConfirmTrapRef,
  forceProgress,
  renderWaitingPanel,
  speedScoringEnabled
}) {
  const canSubmit = answer.trim()

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      if (canSubmit) submitAnswer()
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (canSubmit) submitAnswer()
  }

  return (
    <div className="game-container game-container--active game-container--keyboard-aware py-2 flex flex-col">
      {speedScoringEnabled && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-amber-900/30 border border-amber-700/40 rounded-full px-2 py-0.5" title="Blitz Mode: Speed counts this round">
          <span className="text-xs">⚡</span>
          <span className="text-xs text-amber-400 font-semibold uppercase tracking-wide hidden sm:inline">Blitz</span>
        </div>
      )}
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
        <div className="flex-1 flex flex-col min-h-0 active-fill-gap">
          <div className="phase-banner active-fill-mt">
            <span>Phase 2</span>
            <strong className="active-heading-text">Answer this question</strong>
          </div>
          <div className="card active-card-padding active-fill-mt bg-gradient-to-br from-indigo-900/30 to-purple-900/30 border-2 border-indigo-700">
            <p className="active-body-text font-bold text-white leading-snug text-center">{assignedQuestion}</p>
          </div>
          <form onSubmit={handleSubmit} className="contents">
            <label htmlFor="answer-input" className="sr-only">Your answer</label>
            <textarea id="answer-input" value={answer} onChange={(e) => { setAnswer(e.target.value); saveDraft(roomCodeRef.current, "answering", e.target.value) }} onKeyDown={handleKeyDown} placeholder="Type your answer here..." autoComplete="off" autoCapitalize="sentences" aria-label="Your answer" className="input-field active-textarea-height resize-none active-fill-mt active-input-text leading-snug" maxLength={400} />
            <div className="flex justify-between items-center active-fill-mt">
              <span className="active-body-text text-gray-500">{answer.length}/400 characters</span>
            </div>
            {error && (<div className="p-2 bg-red-900/30 border border-red-700 rounded-lg text-red-400 active-body-text text-center active-fill-mt">{error}</div>)}
            <button type="submit" disabled={!canSubmit} className="btn-primary active-fill-py active-input-text active-fill-mt">Submit Answer</button>
          </form>
          <div className="w-full active-fill-mt">
            <div className={"flex justify-between text-xs mb-0.5 " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "text-red-400 font-semibold" : "text-gray-500")}><span>{progress.submitted}/{progress.total}</span></div>
            <div className={"w-full h-1.5 rounded-full overflow-hidden " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "bg-red-900/30" : "bg-gray-800")}><div className={"h-full transition-all duration-500 " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "bg-red-500 animate-pulse" : "bg-indigo-500")} style={{ width: (progress.total > 0 ? (progress.submitted / progress.total) * 100 : 0) + "%" }} /></div>
          </div>
          {canForceAdvance && (
            <button onClick={() => setForceConfirm(true)} className="active-fill-mt active-body-text text-red-500 border-2 border-fuchsia-500/30 bg-fuchsia-950/10 rounded-lg px-4 py-3 hover:bg-red-900/20 transition-colors">
              <span>⚡ Force Advance (skip waiting players)</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center text-center gap-2 min-h-0">
          <div className="flex-1 flex flex-col items-center text-center gap-2 min-h-0 w-full">
            <div className="w-10 h-10 bg-green-900/30 rounded-full flex items-center justify-center mb-1"><span className="text-xl">✓</span></div>
            <h3 className="font-bubble text-lg font-bold text-white mb-0.5">Answer Submitted!</h3>
            {renderWaitingPanel('answering')}
            {error && (<div className="p-2 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-xs text-center mt-2 max-w-xs">{error}</div>)}
          </div>
          {canForceAdvance && (
            <div className="host-nudge shrink-0 mt-1 justify-center">
              <button onClick={() => setForceConfirm(true)}>Skip waiting players</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

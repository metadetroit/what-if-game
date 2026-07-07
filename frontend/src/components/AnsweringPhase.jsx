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
  renderWaitingPanel
}) {
  return (
    <div className="game-container game-container--active game-container--keyboard-aware py-2 flex flex-col">
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
          <label htmlFor="answer-input" className="sr-only">Your answer</label>
          <textarea id="answer-input" value={answer} onChange={(e) => { setAnswer(e.target.value); saveDraft(roomCodeRef.current, "answering", e.target.value) }} placeholder="Type your answer here..." autoComplete="off" autoCapitalize="sentences" aria-label="Your answer" className="input-field active-textarea-height resize-none active-fill-mt active-input-text leading-snug md:h-28" maxLength={400} />
          <div className="flex justify-between items-center active-fill-mt">
            <span className="active-body-text text-gray-500">{answer.length}/400 characters</span>
          </div>
          {error && (<div className="p-2 bg-red-900/30 border border-red-700 rounded-lg text-red-400 active-body-text text-center active-fill-mt">{error}</div>)}
          <button onClick={submitAnswer} disabled={!answer.trim()} className="btn-primary active-fill-py active-input-text active-fill-mt">Submit Answer</button>
          <div className="w-full active-fill-mt">
            <div className={"flex justify-between text-[10px] mb-0.5 " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "text-red-400 font-semibold" : "text-gray-500")}><span>Submissions</span><span>{progress.submitted}/{progress.total}</span></div>
            <div className={"w-full h-1.5 rounded-full overflow-hidden " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "bg-red-900/30" : "bg-gray-800")}><div className={"h-full transition-all duration-500 " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "bg-red-500 animate-pulse" : "bg-indigo-500")} style={{ width: (progress.total > 0 ? (progress.submitted / progress.total) * 100 : 0) + "%" }} /></div>
          </div>
          {canForceAdvance && (
            <button onClick={() => setForceConfirm(true)} className="active-fill-mt active-body-text text-red-500 border border-red-800 rounded-lg px-4 py-2 hover:bg-red-900/20 transition-colors">
              ⚡ Force Advance (skip waiting players)
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center text-center gap-4 min-h-0 overflow-hidden">
          <div className="flex-1 flex flex-col items-center text-center gap-3 overflow-hidden min-h-0 w-full">
            <div className="w-12 h-12 bg-green-900/30 rounded-full flex items-center justify-center mb-3"><span className="text-2xl">✓</span></div>
            <h3 className="font-bubble text-xl font-bold text-white mb-1">Answer Submitted!</h3>
            {renderWaitingPanel('answering')}
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

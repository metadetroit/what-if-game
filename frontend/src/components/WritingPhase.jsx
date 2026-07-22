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
  renderWaitingPanel,
  speedScoringEnabled
}) {
  const canSubmit = question.trim() && question.toLowerCase().startsWith("what if")
  const isUrgent = !submitted && progress.submitted === progress.total - 1 && progress.total > 1

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      if (canSubmit) submitQuestion()
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (canSubmit) submitQuestion()
  }

  return (
    <div className="game-container game-container--active game-container--writing game-container--keyboard-aware py-2 flex flex-col">
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
          <div className="active-phase-header active-phase-header--writing active-fill-mt" data-phase="writing">
            <div className="active-phase-header__title">
              <span className="active-phase-header__phase">Phase 1</span>
              <strong className="active-phase-header__task">Write your question</strong>
            </div>
            {(anonymousMode || speedScoringEnabled) && (
              <div className="active-phase-header__badges">
                {anonymousMode && <div className="active-phase-header__badge active-phase-header__badge--anonymous" aria-label="Anonymous mode">🔒 Anonymous</div>}
                {speedScoringEnabled && <div className="active-phase-header__badge active-phase-header__badge--blitz" title="Blitz Mode: Speed counts this round" aria-label="Blitz Mode: Speed counts this round">⚡ Blitz</div>}
              </div>
            )}
          </div>
          <form onSubmit={handleSubmit} className="contents">
            <label htmlFor="question-input" className="sr-only">Your question</label>
            <div className="input-field-shell phase-input-shell phase-input-shell--writing active-textarea-height active-fill-mt">
              <textarea id="question-input" value={question} onChange={(e) => { setQuestion(e.target.value); saveDraft(roomCodeRef.current, "writing", e.target.value) }} onKeyDown={handleKeyDown} placeholder="Must begin with 'What if'" autoComplete="off" autoCapitalize="sentences" enterKeyHint="send" aria-label="Your question" className="input-field-shell__textarea resize-none active-input-text leading-snug" maxLength={300} />
              <div className="input-field-shell__footer active-counter-text" aria-label={`${question.length} of 300 characters used`}>
                <span>{question.length}/300</span>
              </div>
            </div>
            {question && !question.toLowerCase().startsWith("what if") && (
              <div className="flex items-center justify-end active-fill-mt">
                <span className="active-body-text text-red-500 font-semibold">Must start with "What if"</span>
              </div>
            )}
            {error && (<div className="p-2 bg-red-900/30 border border-red-700 rounded-lg text-red-400 active-body-text text-center active-fill-mt">{error}</div>)}
            <button type="submit" disabled={!canSubmit} className="btn-primary phase-action phase-action--writing active-fill-py active-input-text active-fill-mt">Submit Question</button>
          </form>
          <div className={`phase-progress phase-progress--writing active-fill-mt ${isUrgent ? "phase-progress--urgent" : ""}`}>
            <div className="phase-progress__count"><span>{progress.submitted}/{progress.total}</span></div>
            <div className="phase-progress__track"><div className="phase-progress__fill" style={{ width: (progress.total > 0 ? (progress.submitted / progress.total) * 100 : 0) + "%" }} /></div>
          </div>
          {canForceAdvance && (
            <button onClick={() => setForceConfirm(true)} className="active-fill-mt active-body-text text-red-500 border-2 border-fuchsia-500/30 bg-fuchsia-950/10 rounded-lg px-4 py-3 min-h-[44px] hover:bg-red-900/20 transition-colors">
              <span>⚡ Force Advance</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="active-waiting-stage active-waiting-stage--writing">
            {renderWaitingPanel('writing')}
            {error && (<div className="p-2 bg-red-900/30 border border-red-700 rounded-lg text-red-300 active-secondary-text text-center mt-2 max-w-xs">{error}</div>)}
          </div>
          {canForceAdvance && (
            <button onClick={() => setForceConfirm(true)} className="active-fill-mt active-body-text text-red-500 border-2 border-fuchsia-500/30 bg-fuchsia-950/10 rounded-lg px-4 py-3 min-h-[44px] hover:bg-red-900/20 transition-colors shrink-0">
              <span>⚡ Force Advance</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

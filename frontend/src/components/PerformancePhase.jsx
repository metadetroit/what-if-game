import React, { useState, useEffect } from "react"
import TurnStatus from "./TurnStatus"

export default function PerformancePhase({
  currentTurn,
  socket,
  socketRef,
  hasRead,
  completeReading,
  rewindPerformance,
  gameStats,
  error,
  forceConfirm,
  forceConfirmTrapRef,
  setForceConfirm,
  forceProgress,
  isHost,
  currentContent,
  myReactions,
  reactionCounts,
  setReactions,
  setMyReactions
}) {
  const [showPrompt, setShowPrompt] = useState(false)

  const isQuestionReaderSocket = currentTurn && socket?.id === currentTurn?.questionReader?.id
  const isAnswerReaderSocket = currentTurn && socket?.id === currentTurn?.answerReader?.id
  const isQuestionReader = currentTurn?.isQuestionTurn && isQuestionReaderSocket
  const isAnswerReader = currentTurn && !currentTurn.isQuestionTurn && isAnswerReaderSocket
  const isActiveReader = currentTurn && !hasRead && (isQuestionReader || isAnswerReader)

  useEffect(() => {
    if (!isActiveReader) {
      setShowPrompt(false)
      return
    }
    setShowPrompt(false)
    const id = setTimeout(() => setShowPrompt(true), 13000)
    return () => clearTimeout(id)
  }, [isActiveReader])

  return (
    <div className="game-container game-container--active game-container--performance py-2 flex flex-col">
      {forceConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4" role="dialog" aria-modal="true" aria-labelledby="force-title">
          <div ref={forceConfirmTrapRef} className="bg-gray-900 border border-red-700 rounded-xl p-6 max-w-xs w-full text-center">
            <p id="force-title" className="text-lg font-bold text-white mb-2">Skip This Turn?</p>
            <p className="text-sm text-gray-400 mb-4">The current reader will be skipped and the next player will read.</p>
            <div className="flex gap-3">
              <button onClick={() => setForceConfirm(false)} className="btn-secondary flex-1 py-2 text-sm">Cancel</button>
              <button onClick={forceProgress} className="btn-primary flex-1 py-2 text-sm bg-red-700 hover:bg-red-800">Confirm</button>
            </div>
          </div>
        </div>
      )}
      {currentTurn ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="active-phase-header active-phase-header--performance active-fill-mt" data-phase="performance">
            <div className="active-phase-header__title">
              <span className="active-phase-header__phase">Phase 3</span>
              <strong className="active-phase-header__task">Performance Time</strong>
            </div>
          </div>
          <div className="performance-stage">
            {(isQuestionReader || isAnswerReader) ? (
              <div className="performance-reading-stack">
                <TurnStatus status="active" sub="Read aloud, then tap Done">
                  {isQuestionReader ? "Read the question" : "Read the answer"}
                </TurnStatus>
                {isQuestionReader && (
                  <div className="card performance-content-card performance-content-card--question active-card-padding" role="region" aria-label="Question to read" tabIndex={0}>
                    <span className="performance-content-card__label">Question</span>
                    <p className="performance-reading-text text-center font-bold text-white break-words">
                      <span className="performance-reading-text__quote" aria-hidden="true">“</span>
                      {currentTurn.question}
                      <span className="performance-reading-text__quote" aria-hidden="true">”</span>
                    </p>
                  </div>
                )}
                {isAnswerReader && currentTurn.answer && (
                  <div className="card performance-content-card performance-content-card--answer active-card-padding" role="region" aria-label="Answer to read" tabIndex={0}>
                    <span className="performance-content-card__label">Answer</span>
                    <p className="performance-reading-text text-center font-bold text-white break-words">
                      <span className="performance-reading-text__quote" aria-hidden="true">“</span>
                      {currentTurn.answer}
                      <span className="performance-reading-text__quote" aria-hidden="true">”</span>
                    </p>
                  </div>
                )}
                {!hasRead && isQuestionReader && (
                  <button onClick={completeReading} aria-label="Done reading question" className={`btn-primary done-reading-button done-reading-button--question essential-reduced-motion active-fill-py active-input-text shrink-0 ${showPrompt ? "ring-4 ring-white/60 animate-pulse" : ""}`}>Done Reading →</button>
                )}
                {!hasRead && isAnswerReader && (
                  <button onClick={completeReading} aria-label="Done reading answer" className={`btn-primary done-reading-button done-reading-button--answer essential-reduced-motion active-fill-py active-input-text shrink-0 ${showPrompt ? "ring-4 ring-white/60 animate-pulse" : ""}`}>Done Reading →</button>
                )}
              </div>
            ) : (
              <div className="performance-status-stage">
                {currentTurn.isQuestionTurn && isAnswerReaderSocket ? (
                  <TurnStatus status="next" sub={`${currentTurn.questionReader.name} is reading the question`}>
                    You read the answer next
                  </TurnStatus>
                ) : currentTurn.isQuestionTurn ? (
                  <TurnStatus status="watch" sub={`Next: ${currentTurn.answerReader.name} reads the answer`}>
                    {currentTurn.questionReader.name} is reading the question
                  </TurnStatus>
                ) : (
                  <TurnStatus status="watch" sub={`Question read by ${currentTurn.questionReader.name}`}>
                    {currentTurn.answerReader.name} is reading the answer
                  </TurnStatus>
                )}
              </div>
            )}
          </div>
          <div className="performance-footer shrink-0">
            <div className="performance-footer__turn">
              <span className="active-secondary-text text-gray-400">Turn {gameStats.round}/{gameStats.total}</span>
              <div className="flex justify-center gap-1">
                {Array.from({ length: gameStats.total }).map((_, i) => (
                  <div key={i} className={"w-2.5 h-2.5 md:w-2 md:h-2 rounded-full " + (i < gameStats.round ? "bg-indigo-500" : i === gameStats.round - 1 ? "bg-white animate-pulse" : "bg-gray-700")} />
                ))}
              </div>
            </div>
            {error && (<div className="p-2 bg-red-900/30 border border-red-700 rounded-lg text-red-300 active-secondary-text text-center mt-2">{error}</div>)}
            {(() => {
              const isSelfContent = currentContent && socketRef.current?.id === currentContent.authorId
              const alreadyReacted = currentContent && myReactions.has(currentContent.dbId)
              const currentCounts = currentContent ? reactionCounts[currentContent.dbId] : null
              const canReact = !isSelfContent && !alreadyReacted
              return (
                <div className="flex justify-center gap-2 mt-2">
                  {isSelfContent && (
                    <span className="active-secondary-text text-gray-400 self-center mr-1">You wrote this — no self-reactions</span>
                  )}
                  {alreadyReacted && !isSelfContent && (
                    <span className="active-secondary-text text-gray-400 self-center mr-1">You reacted ✓</span>
                  )}
                  {['❤️', '😂', '❓'].map(emoji => {
                    const count = currentCounts?.[emoji] || 0
                    return (
                      <button
                        key={emoji}
                        onClick={() => {
                          if (!canReact || !currentContent) return
                          const x = 20 + Math.random() * 60
                          const y = 20 + Math.random() * 60
                          socketRef.current?.emit('reaction', { emoji, x, y, contentDbId: currentContent.dbId })
                          setReactions(prev => [...prev, { id: Math.random().toString(36).slice(2), emoji, x, y, createdAt: Date.now() }])
                          setMyReactions(prev => new Set(prev).add(currentContent.dbId))
                        }}
                        disabled={!canReact}
                        className={`text-xl bg-gray-800 border border-gray-700 rounded-full w-11 h-11 md:w-9 md:h-9 flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none relative ${canReact ? 'hover:bg-gray-700' : 'opacity-30 cursor-not-allowed'}`}
                        aria-label={`React with ${emoji}${count > 0 ? ` (${count})` : ''}`}
                        title={`React with ${emoji}${count > 0 ? ` — ${count} reaction${count === 1 ? '' : 's'}` : ''}`}
                      >
                        {emoji}
                        {count > 0 && (
                          <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">{count}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })()}
            {isHost && (
              <div className="host-controls-group mt-2">
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={rewindPerformance} className="active-body-text text-indigo-200 border-2 border-indigo-500/30 bg-indigo-950/20 rounded-lg px-3 py-3 hover:bg-indigo-900/30 transition-colors min-h-[44px]">
                    <span>↩ Back</span>
                  </button>
                  <button onClick={() => setForceConfirm(true)} className="active-body-text text-red-500 border-2 border-fuchsia-500/30 bg-fuchsia-950/10 rounded-lg px-3 py-3 hover:bg-red-900/20 transition-colors min-h-[44px]">
                    <span>⚡ Skip</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center animate-pulse">
          <div className="text-6xl mb-4">🎭</div>
          <h3 className="font-bubble active-heading-text font-bold text-white mb-2 text-2xl">Get Ready!</h3>
          <p className="text-gray-400 active-body-text text-base font-semibold">Reading round starting soon...</p>
        </div>
      )}
    </div>
  )
}

import React from "react"

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
  return (
    <div className="game-container game-container--active py-2 flex flex-col">
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
          <div className="phase-banner active-fill-mt">
            <span>Phase 3</span>
            <strong className="active-heading-text">Performance Time</strong>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <div className="shrink-0 mb-1">
              {currentTurn.isQuestionTurn && socket?.id === currentTurn.questionReader.id && (
                <div className="py-2 rounded-xl text-center bg-green-500 border-4 border-green-300 shadow-lg shadow-green-900/40">
                  <span className="font-bubble active-heading-text font-black text-white tracking-wider">READ QUESTION</span>
                  <p className="text-green-100 active-body-text mt-1">Read aloud, then tap Done</p>
                </div>
              )}
              {!currentTurn.isQuestionTurn && socket?.id === currentTurn.questionReader.id && (
                <div className="py-2 rounded-lg text-center bg-gray-700 border border-gray-600">
                  <span className="font-bubble active-heading-text font-bold text-gray-400">WAITING</span>
                  <p className="text-gray-500 active-body-text mt-1 truncate px-2">{currentTurn.answerReader.name} is reading the answer</p>
                </div>
              )}
              {currentTurn.isQuestionTurn && socket?.id === currentTurn.answerReader.id && (
                <div>
                  <div className="text-center mb-2">
                    <span className="inline-flex items-center gap-1.5 active-body-text text-purple-300 bg-purple-900/40 px-3 py-1.5 rounded-full border border-purple-700/30 max-w-full min-w-0">
                      <span className="text-base">🎤</span>
                      <span className="truncate min-w-0"><span className="font-medium truncate">{currentTurn.questionReader.name}</span> is reading the question to you</span>
                    </span>
                  </div>
                  <div className="py-2 rounded-xl text-center bg-purple-500 border-4 border-purple-300 shadow-lg shadow-purple-900/40">
                    <span className="font-bubble active-heading-text font-black text-white tracking-wider">GET READY</span>
                    <p className="text-purple-100 active-body-text mt-1">You're reading the answer next</p>
                  </div>
                </div>
              )}
              {!currentTurn.isQuestionTurn && socket?.id === currentTurn.answerReader.id && (
                <div className="py-2 rounded-xl text-center bg-purple-500 border-4 border-purple-300 shadow-lg shadow-purple-900/40">
                  <span className="font-bubble active-heading-text font-black text-white tracking-wider">READ ANSWER</span>
                  <p className="text-purple-100 active-body-text mt-1">Read aloud, then tap Done</p>
                </div>
              )}
              {socket?.id !== currentTurn.questionReader.id && socket?.id !== currentTurn.answerReader.id && (
                <div className="card bg-gray-800 border-2 border-gray-700 mb-2 py-3 px-4 text-center">
                  <p className="text-gray-300 active-body-text truncate">
                    <span className="text-green-400 font-bold active-heading-text truncate">{currentTurn.questionReader.name}</span>
                    <span className="text-gray-500 mx-2">→</span>
                    <span className="text-purple-400 font-bold active-heading-text truncate">{currentTurn.answerReader.name}</span>
                  </p>
                  <p className="text-gray-500 active-body-text mt-2">{currentTurn.isQuestionTurn ? "Question being read" : "Answer being read"}</p>
                </div>
              )}
            </div>
            {currentTurn.isQuestionTurn && socket?.id === currentTurn.questionReader.id && (
              <div className="card active-card-padding bg-gradient-to-br from-green-600 to-green-800 border-4 border-green-400 shadow-lg active-fill-mt overflow-y-auto min-h-0">
                <p className="text-center active-body-text font-bold text-white leading-relaxed break-words">
                  <span className="text-white/50 active-heading-text mx-1">"</span>
                  {currentTurn.question}
                  <span className="text-white/50 active-heading-text mx-1">"</span>
                </p>
              </div>
            )}
            {!currentTurn.isQuestionTurn && socket?.id === currentTurn.answerReader.id && currentTurn.answer && (
              <div className="card active-card-padding bg-gradient-to-br from-purple-600 to-purple-800 border-4 border-purple-400 shadow-lg active-fill-mt overflow-y-auto min-h-0">
                <p className="text-center active-body-text font-bold text-white leading-relaxed break-words">
                  <span className="text-white/50 active-heading-text mx-1">"</span>
                  {currentTurn.answer}
                  <span className="text-white/50 active-heading-text mx-1">"</span>
                </p>
              </div>
            )}
            {!hasRead && currentTurn.isQuestionTurn && socket?.id === currentTurn.questionReader.id && (
              <button onClick={completeReading} className="btn-primary active-fill-mt bg-green-600 hover:bg-green-700 active-fill-py active-input-text shrink-0">Done Reading →</button>
            )}
            {!hasRead && !currentTurn.isQuestionTurn && socket?.id === currentTurn.answerReader.id && (
              <button onClick={completeReading} className="btn-primary active-fill-mt bg-purple-600 hover:bg-purple-700 active-fill-py active-input-text shrink-0">Done Reading →</button>
            )}
          </div>
          <div className="shrink-0 pt-2 border-t border-gray-800">
            <div className="flex justify-center gap-1 mb-2">
              {Array.from({ length: gameStats.total }).map((_, i) => (
                <div key={i} className={"w-2.5 h-2.5 md:w-2 md:h-2 rounded-full " + (i < gameStats.round ? "bg-indigo-500" : i === gameStats.round - 1 ? "bg-white animate-pulse" : "bg-gray-700")} />
              ))}
            </div>
            <div className="flex items-center justify-between text-xs md:text-sm text-gray-500 mb-2">
              <span>Turn {gameStats.round}/{gameStats.total}</span>
              <div className="flex-1 mx-3 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: (gameStats.total > 0 ? (gameStats.round / gameStats.total) * 100 : 0) + "%" }} />
              </div>
            </div>
            {error && (<div className="p-2 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-xs text-center mt-2">{error}</div>)}
            {(() => {
              const isSelfContent = currentContent && socketRef.current?.id === currentContent.authorId
              const alreadyReacted = currentContent && myReactions.has(currentContent.dbId)
              const currentCounts = currentContent ? reactionCounts[currentContent.dbId] : null
              const canReact = !isSelfContent && !alreadyReacted
              return (
                <div className="flex justify-center gap-2 mt-2">
                  {isSelfContent && (
                    <span className="text-xs text-gray-500 self-center mr-1">You wrote this — no self-reactions</span>
                  )}
                  {alreadyReacted && !isSelfContent && (
                    <span className="text-xs text-gray-500 self-center mr-1">You reacted ✓</span>
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
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button onClick={rewindPerformance} className="active-body-text text-indigo-200 border-2 border-indigo-500/30 bg-indigo-950/20 rounded-lg px-3 py-3 hover:bg-indigo-900/30 transition-colors min-h-[44px]">
                  <span className="text-sm md:text-sm font-bold text-indigo-300 uppercase tracking-wider">HOST</span>
                  <span className="ml-2">↩ Repeat</span>
                </button>
                <button onClick={() => setForceConfirm(true)} className="active-body-text text-red-500 border-2 border-fuchsia-500/30 bg-fuchsia-950/10 rounded-lg px-3 py-3 hover:bg-red-900/20 transition-colors min-h-[44px]">
                  <span className="text-sm md:text-sm font-bold text-fuchsia-300 uppercase tracking-wider">HOST</span>
                  <span className="ml-2">⚡ Skip</span>
                </button>
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

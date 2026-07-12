import React, { useState, useEffect, useRef } from "react"
import { noticeFor } from "../utils/gameUtils"
import Countdown from "./Countdown"

export default function SummaryPhase({
  hideGameConfirm,
  hideGameTrapRef,
  setHideGameConfirm,
  handleHideGame,
  roundHistory,
  showRoundHistory,
  setShowRoundHistory,
  expandedHistoryRounds,
  setExpandedHistoryRounds,
  players,
  votersCount,
  gameSummary,
  summaryAnonymousMode,
  anonymousMode,
  summaryVotes,
  userVotes,
  summaryPairVoteId,
  pendingVoteRef,
  handleVote,
  roundLeader,
  fastestTyper,
  slowestTyper,
  mostAdoredWriter,
  isHost,
  socketRef,
  noSelfReading,
  setNoSelfReading,
  disbandGame,
  adminKey,
  handleAbandonGame,
  setNotice,
  tournament,
  authorReveals,
  playerName
}) {
  const [viewMode, setViewMode] = useState("paired")
  const [voteConfirm, setVoteConfirm] = useState(null) // { pairDbId, question } when confirming a vote
  const [hostControlsFocused, setHostControlsFocused] = useState(false)
  const [liveText, setLiveText] = useState("")
  const prevCountdownActiveRef = useRef(false)

  const countdownActive = Boolean(tournament?.votingDeadlineAt)

  const currentRound = tournament?.currentRound
  const targetRounds = tournament?.targetRounds

  useEffect(() => {
    if (countdownActive && !prevCountdownActiveRef.current) {
      setLiveText(
        currentRound && targetRounds
          ? `Voting countdown started for round ${currentRound} of ${targetRounds}.`
          : "Voting countdown started."
      )
    } else if (!countdownActive && prevCountdownActiveRef.current) {
      setLiveText("")
    }
    prevCountdownActiveRef.current = countdownActive
  }, [countdownActive, currentRound, targetRounds])

  const handleHostControlsFocus = () => setHostControlsFocused(true)
  const handleHostControlsBlur = (e) => {
    const next = e.relatedTarget
    if (!next || !e.currentTarget.contains(next)) {
      setHostControlsFocused(false)
    }
  }

  return (
    <div className="game-container game-container--summary py-4">
      {hideGameConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4" role="dialog" aria-modal="true" aria-labelledby="hide-game-title">
          <div ref={hideGameTrapRef} className="bg-gray-900 border border-red-700 rounded-xl p-6 max-w-xs w-full text-center">
            <p id="hide-game-title" className="text-lg font-bold text-white mb-2">Hide from Best Of?</p>
            <p className="text-sm text-gray-400 mb-4">This will prevent any content from this game from appearing on the public Best Of page.</p>
            <div className="flex gap-3">
              <button onClick={() => setHideGameConfirm(false)} className="btn-secondary flex-1 py-2 text-sm">Cancel</button>
              <button onClick={handleHideGame} className="btn-primary flex-1 py-2 text-sm bg-red-700 hover:bg-red-800">Confirm</button>
            </div>
          </div>
        </div>
      )}
      <div className="summary-header--compact" data-testid="summary-header">
        <span aria-live="polite" className="sr-only">{liveText}</span>
        <div className="summary-header--compact__row">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">
              {tournament ? `Round ${tournament.currentRound} of ${tournament.targetRounds}` : 'Round Complete'}
            </p>
            {countdownActive && (
              <>
                <span className="text-xs text-gray-500">·</span>
                <Countdown deadlineAt={tournament.votingDeadlineAt} serverNow={tournament.serverNow} className="font-bold text-xs md:text-sm text-indigo-300" />
              </>
            )}
          </div>
          <div className="flex items-center gap-1 md:gap-2">
            <div className="inline-flex items-center rounded-full border border-gray-700 bg-gray-800/60 p-[2px] text-xs md:text-sm">
              <button
                onClick={() => setViewMode("paired")}
                className={`w-24 sm:w-28 rounded-full px-2 py-0.5 font-semibold text-center transition-colors duration-200 min-h-[40px] md:min-h-[44px] flex items-center justify-center ${
                  viewMode === "paired" ? "bg-indigo-600 text-white shadow-sm" : "text-gray-300 hover:text-white hover:bg-gray-700/50"
                }`}
              >
                Pairings
              </button>
              <button
                onClick={() => setViewMode("actual")}
                className={`w-24 sm:w-28 rounded-full px-2 py-0.5 font-semibold text-center transition-colors duration-200 min-h-[40px] md:min-h-[44px] flex items-center justify-center ${
                  viewMode === "actual" ? "bg-indigo-600 text-white shadow-sm" : "text-gray-300 hover:text-white hover:bg-gray-700/50"
                }`}
              >
                Actual Q/A
              </button>
            </div>
            {roundHistory.length > 0 && (
              <button onClick={() => setShowRoundHistory(true)} className="text-xs md:text-sm text-indigo-300 hover:text-indigo-200 underline min-h-[40px] md:min-h-[44px] inline-flex items-center px-1">
                {roundHistory.length} past
              </button>
            )}
          </div>
        </div>
        {countdownActive && (
          <div className="summary-meta-inline mt-1">
            <span className="text-gray-300">Vote for the best pair</span>
            <span>·</span>
            <span>Players {players.length}</span>
            <span>·</span>
            <span className={votersCount >= players.length ? "text-emerald-300" : "text-amber-300"}>
              Votes {votersCount >= players.length ? "✓ All" : `${votersCount}/${players.length}`} {votersCount >= players.length ? "Ready" : "Waiting"}
            </span>
          </div>
        )}
      </div>

      <div className="summary-scroll pb-4">
        {gameSummary && gameSummary.length > 0 ? (
          <div className="summary-grid content-visibility-auto">
            {gameSummary.map((pair, i) => {
              const maskNames = typeof summaryAnonymousMode === 'boolean' ? summaryAnonymousMode : anonymousMode
              const isTournamentVoting = tournament && tournament.enabled
              // Tournament voting: always mask. Classic: mask if anonymous.
              const effectiveMask = isTournamentVoting || maskNames
              const questionAuthor = effectiveMask ? '???' : (pair.questionAuthorName || 'Unknown')
              const pairedAuthor = effectiveMask ? '???' : (pair.pairedAnswerAuthorName || 'Unknown')
              const actualAuthor = effectiveMask ? '???' : (pair.actualAnswerAuthorName || 'Unknown')
              const pairKey = pair.pairDbId || `${pair.question}-${i}`
              const voteCount = pair.pairDbId ? (summaryVotes[pair.pairDbId] || 0) : 0
              const hasPairId = Boolean(pair.pairDbId)
              const userVotedForPair = hasPairId ? Boolean(userVotes[pair.pairDbId]) : false
              const userLockedToDifferentPair = summaryPairVoteId && hasPairId && summaryPairVoteId !== pair.pairDbId
              const inFlight = pendingVoteRef.current && pendingVoteRef.current.type === 'qa_pair' && pendingVoteRef.current.targetId === pair.pairDbId
              const voteDisabled = userLockedToDifferentPair || inFlight
              const isWinner = roundLeader && roundLeader.pairDbId === pair.pairDbId && !roundLeader.tied

              return (
                <article key={pairKey} id={hasPairId ? `pair-${pair.pairDbId}` : undefined} className={"summary-card " + (userVotedForPair ? "summary-card--active " : "") + (isWinner ? "summary-card--winner" : "")}>
                  <div className="summary-card__body">
                    {isWinner && <div className="text-right"><span className="text-sm" title="Top voted!">👑</span></div>}
                    <p className="summary-question">{pair.question}</p>
                    {viewMode === "paired" ? (
                      <>
                        <div className="summary-paired">
                          <p className="summary-paired__answer">{pair.pairedAnswer || 'No pairing was performed'}</p>
                        </div>
                        <p className="summary-authors">
                          Q by {questionAuthor}{pair.pairedAnswer && <> · Paired by {pairedAuthor}</>}
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="summary-actual">
                          <p className="summary-actual__text">{pair.actualAnswer || <span className="text-gray-500 italic text-sm">No actual answer</span>}</p>
                        </div>
                        <p className="summary-authors">
                          Q by {questionAuthor}{pair.actualAnswer && <> · A by {actualAuthor}</>}
                        </p>
                      </>
                    )}
                    {effectiveMask && (
                      <div className="inline-flex items-center gap-1 text-xs text-purple-300 bg-purple-900/30 border border-purple-700/50 rounded-full px-2 py-0.5 w-fit">
                        <span>🙈</span>
                        <span>Anonymous</span>
                      </div>
                    )}
                  </div>

                  {viewMode === "paired" ? (
                    <div className="summary-card__footer">
                      <div className="summary-vote-meta">
                        <span className="text-gray-400 text-xs uppercase tracking-widest leading-none">Votes</span>
                        <p className="text-xl font-black text-amber-300 leading-none">{voteCount}</p>
                        {userVotedForPair && (<span className="you-badge">You</span>)}
                      </div>
                      <div className="flex items-center gap-1.5 flex-1 justify-end">
                        {((pair.questionReactions && Object.keys(pair.questionReactions).length > 0) || (pair.answerReactions && Object.keys(pair.answerReactions).length > 0)) && (
                          <div className="flex flex-wrap gap-0.5 text-xs">
                            {pair.questionReactions && Object.entries(pair.questionReactions).map(([emoji, count]) => (
                              <span key={emoji} className="bg-gray-800 rounded-full px-1.5 py-0.5 flex items-center gap-1 text-gray-300">{emoji} {count}</span>
                            ))}
                            {pair.answerReactions && Object.entries(pair.answerReactions).map(([emoji, count]) => (
                              <span key={emoji} className="bg-gray-800 rounded-full px-1.5 py-0.5 flex items-center gap-1 text-gray-300">{emoji} {count}</span>
                            ))}
                          </div>
                        )}
                        {hasPairId ? (
                          <button
                            onClick={() => {
                              if (isTournamentVoting && !userVotedForPair) {
                                setVoteConfirm({ pairDbId: pair.pairDbId, question: pair.question })
                              } else {
                                handleVote('qa_pair', pair.pairDbId)
                              }
                            }}
                            className={`summary-vote-icon ${
                              userVotedForPair ? 'summary-vote-icon--active' : ''
                            } ${voteDisabled ? 'summary-vote-icon--disabled' : ''}`}
                            title={userVotedForPair ? 'You voted for this pair' : userLockedToDifferentPair ? 'Locked to another pair' : inFlight ? 'Submitting…' : 'Vote for best pairing'}
                            disabled={voteDisabled}
                            aria-busy={inFlight ? 'true' : 'false'}
                            aria-label={userVotedForPair ? 'Voted' : userLockedToDifferentPair ? 'Locked' : inFlight ? 'Submitting' : 'Vote'}
                          >
                            {inFlight ? '…' : userVotedForPair ? '✓' : userLockedToDifferentPair ? '🔒' : '👍'}
                          </button>
                        ) : (
                          <button disabled className="summary-vote-icon summary-vote-icon--disabled" title="Unavailable" aria-label="Unavailable">−</button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="summary-card__footer">
                      <div className="flex items-center gap-1.5 flex-1">
                        {((pair.questionReactions && Object.keys(pair.questionReactions).length > 0) || (pair.answerReactions && Object.keys(pair.answerReactions).length > 0)) && (
                          <div className="flex flex-wrap gap-0.5 text-xs">
                            {pair.questionReactions && Object.entries(pair.questionReactions).map(([emoji, count]) => (
                              <span key={emoji} className="bg-gray-800 rounded-full px-1.5 py-0.5 flex items-center gap-1 text-gray-300">{emoji} {count}</span>
                            ))}
                            {pair.answerReactions && Object.entries(pair.answerReactions).map(([emoji, count]) => (
                              <span key={emoji} className="bg-gray-800 rounded-full px-1.5 py-0.5 flex items-center gap-1 text-gray-300">{emoji} {count}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </article>
              )
            })}
          </div>
        ) : (
          <div className="card text-center py-6">
            <p className="text-sm text-gray-400">No pairings available. Finish a round to unlock voting.</p>
          </div>
        )}
      {showRoundHistory && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-lg w-full max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h3 className="text-lg font-bold text-white">Round History</h3>
              <button onClick={() => setShowRoundHistory(false)} className="text-gray-400 hover:text-white text-sm">✕ Close</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {roundHistory.map((round, idx) => {
                const isExpanded = expandedHistoryRounds.has(idx)
                const visiblePairs = isExpanded ? round.summary : round.summary.slice(0, 3)
                return (
                  <div key={idx} className="card p-3">
                    <p className="text-xs text-gray-400 mb-2">Round {idx + 1} — {new Date(round.timestamp).toLocaleTimeString()}</p>
                    <div className="space-y-2">
                      {visiblePairs.map((pair, pIdx) => (
                        <div key={pIdx} className="text-sm">
                          <p className="text-white font-medium">{pair.question}</p>
                          <p className="text-gray-400 text-xs">↗ {pair.pairedAnswer || 'No pairing'}</p>
                        </div>
                      ))}
                      {round.summary.length > 3 && (
                        <button
                          onClick={() => setExpandedHistoryRounds(prev => {
                            const next = new Set(prev)
                            if (next.has(idx)) next.delete(idx)
                            else next.add(idx)
                            return next
                          })}
                          className="text-xs text-indigo-300 hover:text-indigo-200 underline"
                        >
                          {isExpanded ? 'Show less' : `+${round.summary.length - 3} more pairings`}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {roundLeader && (
        <div className="summary-winner-banner" data-testid="leader-banner">
          <p className="leading-snug">
            <span className="text-rose-300">🔥</span>
            <span className="ml-1 text-gray-300">
              {roundLeader.tied ? 'Top (tied):' : 'Top:'}
            </span>
            <span className="ml-1 text-white font-medium">{roundLeader.question}</span>
            <span className="text-gray-500 ml-1">— {roundLeader.pairedAnswer || 'No pairing'} — {roundLeader.voteCount} vote{roundLeader.voteCount === 1 ? '' : 's'}</span>
          </p>
        </div>
      )}

      {(fastestTyper || slowestTyper || mostAdoredWriter) && (
        <div className="summary-awards--inline" data-testid="awards-row">
          {fastestTyper && (
            <span className="text-amber-300">🏆 Fastest: {fastestTyper}</span>
          )}
          {slowestTyper && (
            <span className="text-sky-300">⏰ Slowest: {slowestTyper}</span>
          )}
          {mostAdoredWriter && (
            <span className="text-yellow-300">
              💖 Adored:{
                (typeof summaryAnonymousMode === 'boolean' ? summaryAnonymousMode : anonymousMode) || (tournament && tournament.enabled)
                  ? ' ???'
                  : (() => {
                      const sorted = [...mostAdoredWriter.names].sort((a, b) => a.localeCompare(b))
                      if (sorted.length <= 3) return ` ${sorted.join(' & ')}`
                      return ` ${sorted[0]} & ${sorted.length - 1} other${sorted.length - 1 === 1 ? '' : 's'}`
                    })()
              }
            </span>
          )}
        </div>
      )}

      {voteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4" role="dialog" aria-modal="true" aria-labelledby="vote-confirm-title">
          <div className="bg-gray-900 border border-indigo-700 rounded-xl p-6 max-w-xs w-full text-center">
            <p id="vote-confirm-title" className="text-lg font-bold text-white mb-2">Lock in vote?</p>
            <p className="text-sm text-gray-400 mb-1">You're voting for:</p>
            <p className="text-sm text-indigo-300 font-medium mb-4 line-clamp-2">{voteConfirm.question}</p>
            <div className="flex gap-3">
              <button onClick={() => setVoteConfirm(null)} className="btn-secondary flex-1 py-2 text-sm">Cancel</button>
              <button
                onClick={() => {
                  handleVote('qa_pair', voteConfirm.pairDbId)
                  setVoteConfirm(null)
                }}
                className="btn-primary flex-1 py-2 text-sm"
              >
                Lock In
              </button>
            </div>
          </div>
        </div>
      )}

      {!isHost && (
        <div className="summary-actions--compact">
          <p className="summary-guest--compact">
            {tournament && tournament.enabled
              ? 'Waiting for votes or timer…'
              : 'Please wait for the host to start a new round. Your screen will automatically refresh.'}
          </p>
          <button onClick={handleAbandonGame} className="btn-secondary py-2 text-xs md:text-sm w-full max-w-xs mx-auto min-h-[44px]">
            Abandon game (exit to main screen)
          </button>
        </div>
      )}
      {isHost && (
        <div
          className="summary-host-controls card mb-2"
          onFocus={handleHostControlsFocus}
          onBlur={handleHostControlsBlur}
        >
          {tournament && tournament.enabled ? (
            <div className="summary-actions--compact__row">
              <button
                onClick={() => socketRef.current?.emit("finish-voting")}
                className="btn-primary flex-1 py-2.5 md:py-3 text-sm md:text-base min-h-[44px]"
              >
                ⚡ Finish Voting & Tally
              </button>
              <button onClick={disbandGame} className="btn-secondary flex-1 py-2.5 md:py-3 text-xs md:text-sm whitespace-normal leading-tight min-h-[44px]">
                🏠 Abandon Tournament
              </button>
            </div>
          ) : (
            <>
              <div className="summary-actions__toggles">
                <div className="summary-toggle card !p-2.5 md:!p-3">
                  <div>
                    <p className="text-xs text-white font-semibold">Anonymous Results</p>
                    <p className="text-xs md:text-xs text-gray-400 leading-tight">Hide names in summary + Best Of.</p>
                  </div>
                  <button onClick={() => socketRef.current?.emit("toggle-anonymous")} aria-pressed={anonymousMode} aria-label="Toggle anonymous results" className={"toggle-switch " + (anonymousMode ? "toggle-switch--on" : "")}>
                    <span />
                  </button>
                </div>
                <div className="summary-toggle card !p-2.5 md:!p-3">
                  <div>
                    <p className="text-xs text-white font-semibold">No Self-Reading</p>
                    <p className="text-xs md:text-xs text-gray-400 leading-tight">Players won't read their own content.</p>
                  </div>
                  <button onClick={() => setNoSelfReading(!noSelfReading)} aria-pressed={noSelfReading} aria-label="Toggle no self-reading" className={"toggle-switch " + (noSelfReading ? "toggle-switch--on" : "")}>
                    <span />
                  </button>
                </div>
                <button onClick={() => { setNotice(noticeFor('Starting new game…', 'info', 1000)); socketRef.current?.emit("replay-game", { noSelfReading }) }} className="summary-quick-btn order-first">
                  🔄 Replay
                </button>
              </div>
              <div className="summary-actions--compact__row">
                <button onClick={disbandGame} className="btn-secondary flex-1 py-2.5 md:py-3 text-xs md:text-sm whitespace-normal leading-tight min-h-[44px]">
                  🏠 New game (change players)
                </button>
                {adminKey && (
                  <button onClick={() => setHideGameConfirm(true)} className="btn-secondary flex-1 py-2.5 md:py-3 text-xs md:text-sm whitespace-normal leading-tight min-h-[44px]">
                    🚫 Hide from Best Of
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
      {gameSummary && gameSummary.length > 0 && (
        <div className="flex justify-center mt-4">
          <button
            onClick={() => {
              const lines = gameSummary.map((pair, i) => {
                const q = pair.question || 'No question'
                const a = pair.pairedAnswer || 'No pairing'
                const votes = pair.pairDbId ? (summaryVotes[pair.pairDbId] || 0) : 0
                return `${i + 1}. ${q}\n   → ${a} (${votes} vote${votes === 1 ? '' : 's'})`
              })
              const text = `What If Game — Round Summary\n\n${lines.join('\n\n')}`
              navigator.clipboard?.writeText(text)
              setNotice(noticeFor('Summary copied as text', 'success', 1500))
            }}
            className="text-xs text-gray-400 hover:text-white underline"
          >
            📋 Copy summary as text
          </button>
        </div>
      )}
      </div>
    </div>
  )
}

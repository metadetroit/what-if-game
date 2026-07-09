import React, { useState } from "react"
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
      <div className="summary-header card !p-3 md:!p-4">
        <div className="flex flex-col gap-0.5 md:gap-1">
          <p className="text-[10px] md:text-xs uppercase tracking-[0.3em] text-emerald-300">{tournament ? `Tournament — Round ${tournament.currentRound} of ${tournament.targetRounds}` : 'Round Complete'}</p>
          <h2 className="font-bubble text-xl md:text-2xl font-black text-white leading-tight">Vote for the best pair</h2>
          {tournament && tournament.votingDeadlineAt && (
            <div className="mt-0.5 flex items-center justify-center gap-2 text-xs md:text-sm text-gray-400">
              <span>Time to vote:</span>
              <Countdown deadlineAt={tournament.votingDeadlineAt} serverNow={tournament.serverNow} className="font-bold text-base" />
            </div>
          )}
          <div className="mt-1.5 flex justify-center">
            <div className="inline-flex items-center rounded-full border border-gray-700 bg-gray-800/60 p-0.5 text-[10px] md:text-xs">
              <button
                onClick={() => setViewMode("paired")}
                className={`w-24 sm:w-28 rounded-full px-2.5 py-1 font-semibold text-center transition-colors duration-200 ${
                  viewMode === "paired" ? "bg-indigo-600 text-white shadow-sm" : "text-gray-300 hover:text-white hover:bg-gray-700/50"
                }`}
              >
                Pairings
              </button>
              <button
                onClick={() => setViewMode("actual")}
                className={`w-24 sm:w-28 rounded-full px-2.5 py-1 font-semibold text-center transition-colors duration-200 ${
                  viewMode === "actual" ? "bg-indigo-600 text-white shadow-sm" : "text-gray-300 hover:text-white hover:bg-gray-700/50"
                }`}
              >
                Actual Q/A
              </button>
            </div>
          </div>
        </div>
        <div className="summary-header__meta !py-2 md:!py-3 !px-3 md:!px-4">
          {roundHistory.length > 0 && (
            <div>
              <p className="summary-pill">History</p>
              <button onClick={() => setShowRoundHistory(true)} className="text-[10px] md:text-xs text-indigo-300 hover:text-indigo-200 underline">
                {roundHistory.length} past round{roundHistory.length === 1 ? '' : 's'}
              </button>
            </div>
          )}
          <div>
            <p className="summary-pill">Players</p>
            <p className="summary-meta-value text-base md:text-lg">{players.length}</p>
          </div>
          <div>
            <p className="summary-pill">Votes</p>
            <p className={"summary-meta-value text-base md:text-lg " + (votersCount >= players.length ? "text-emerald-300" : "text-amber-300")}>{votersCount >= players.length ? "✓ All" : `${votersCount}/${players.length}`}</p>
            <p className="summary-meta-note">{votersCount >= players.length ? "Ready" : "Waiting"}</p>
          </div>
        </div>
      </div>

      <div className="summary-scroll">
        {gameSummary && gameSummary.length > 0 ? (
          <div className="summary-grid">
            {gameSummary.map((pair, i) => {
              const maskNames = typeof summaryAnonymousMode === 'boolean' ? summaryAnonymousMode : anonymousMode
              const isTournamentVoting = tournament && tournament.enabled
              const reveal = isTournamentVoting ? authorReveals[pair.pairDbId] : null
              const questionAuthor = reveal ? reveal.qAuthor : (maskNames ? '???' : (pair.questionAuthorName || 'Unknown'))
              const pairedAuthor = reveal ? reveal.aAuthor : (maskNames ? '???' : (pair.pairedAnswerAuthorName || 'Unknown'))
              const actualAuthor = reveal ? reveal.aAuthor : (maskNames ? '???' : (pair.actualAnswerAuthorName || 'Unknown'))
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
                        <p className="text-xs text-gray-400">
                          Q by {questionAuthor}{pair.pairedAnswer && <> · Paired by {pairedAuthor}</>}
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="summary-paired">
                          <p className="font-hand text-base md:text-lg leading-snug text-emerald-100/90 break-words">{pair.actualAnswer || <span className="text-gray-500 italic text-sm">No actual answer</span>}</p>
                        </div>
                        <p className="text-xs text-gray-400">
                          Q by {questionAuthor}{pair.actualAnswer && <> · A by {actualAuthor}</>}
                        </p>
                      </>
                    )}
                    {maskNames && (
                      <div className="inline-flex items-center gap-1 text-xs text-purple-300 bg-purple-900/30 border border-purple-700/50 rounded-full px-2 py-0.5 w-fit">
                        <span>🙈</span>
                        <span>Anonymous</span>
                      </div>
                    )}
                  </div>

                  {viewMode === "paired" ? (
                    <div className="summary-card__footer">
                      <div className="summary-vote-meta">
                        <span className="text-gray-400 text-xs uppercase tracking-widest">Votes</span>
                        <p className="text-2xl font-black text-amber-300">{voteCount}</p>
                        {userVotedForPair && (<span className="you-badge">You</span>)}
                      </div>
                      <div className="flex items-center gap-2 flex-1">
                        {((pair.questionReactions && Object.keys(pair.questionReactions).length > 0) || (pair.answerReactions && Object.keys(pair.answerReactions).length > 0)) && (
                          <div className="flex flex-wrap gap-1 text-xs">
                            {pair.questionReactions && Object.entries(pair.questionReactions).map(([emoji, count]) => (
                              <span key={emoji} className="bg-gray-800 rounded-full px-2 py-0.5 flex items-center gap-1 text-gray-300">{emoji} {count}</span>
                            ))}
                            {pair.answerReactions && Object.entries(pair.answerReactions).map(([emoji, count]) => (
                              <span key={emoji} className="bg-gray-800 rounded-full px-2 py-0.5 flex items-center gap-1 text-gray-300">{emoji} {count}</span>
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
                            className={`summary-vote-btn ${
                              userVotedForPair ? 'summary-vote-btn--active' : ''
                            } ${voteDisabled ? 'summary-vote-btn--disabled' : ''}`}
                            title="Vote for best game pairing"
                            disabled={voteDisabled}
                            aria-busy={inFlight ? 'true' : 'false'}
                          >
                            {inFlight ? '…' : userVotedForPair ? 'Voted' : userLockedToDifferentPair ? 'Locked' : 'Vote'}
                          </button>
                        ) : (
                          <button disabled className="summary-vote-btn summary-vote-btn--disabled">Unavailable</button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="summary-card__footer">
                      <div className="flex items-center gap-2 flex-1">
                        {((pair.questionReactions && Object.keys(pair.questionReactions).length > 0) || (pair.answerReactions && Object.keys(pair.answerReactions).length > 0)) && (
                          <div className="flex flex-wrap gap-1 text-xs">
                            {pair.questionReactions && Object.entries(pair.questionReactions).map(([emoji, count]) => (
                              <span key={emoji} className="bg-gray-800 rounded-full px-2 py-0.5 flex items-center gap-1 text-gray-300">{emoji} {count}</span>
                            ))}
                            {pair.answerReactions && Object.entries(pair.answerReactions).map(([emoji, count]) => (
                              <span key={emoji} className="bg-gray-800 rounded-full px-2 py-0.5 flex items-center gap-1 text-gray-300">{emoji} {count}</span>
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
      </div>

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
        <div className="summary-leader card">
          <div className="summary-leader__icon">🔥</div>
          <div className="min-w-0">
            <p className="text-sm text-rose-200">{roundLeader.tied ? 'Current tie for top pairing' : 'Current top pairing'}</p>
            <p className="text-base md:text-lg font-extrabold text-white leading-snug break-words">{roundLeader.question}</p>
            <p className="text-sm text-rose-100/80 leading-snug break-words">Performed with: {roundLeader.pairedAnswer || 'No pairing was performed'}</p>
          </div>
          <div className="summary-leader__badge">{roundLeader.voteCount} vote{roundLeader.voteCount === 1 ? '' : 's'}</div>
        </div>
      )}

      {fastestTyper && (
        <div className="summary-fastest card">
          <div className="summary-fastest__icon">🏆</div>
          <div className="min-w-0">
            <p className="text-sm text-amber-200">Fastest typer in both rounds</p>
            <p className="text-xl font-extrabold text-white truncate">{fastestTyper}</p>
            <p className="text-xs text-amber-100/70">First to submit both their question and answer!</p>
          </div>
          <div className="summary-fastest__badge">Fastest Typer!</div>
        </div>
      )}

      {slowestTyper && (
        <div className="summary-slowest card">
          <div className="summary-slowest__icon">⏰</div>
          <div className="min-w-0">
            <p className="text-sm text-sky-200">Slowest typer in both rounds</p>
            <p className="text-xl font-extrabold text-white truncate">{slowestTyper}</p>
            <p className="text-xs text-sky-100/70">Last to finish both the question and the answer.</p>
          </div>
          <div className="summary-slowest__badge">Slowest Typer!</div>
        </div>
      )}

      {mostAdoredWriter ? (
        <div className="summary-mvp card">
          <div className="summary-mvp__icon">💖</div>
          <div className="min-w-0">
            <p className="text-sm text-yellow-200">Round's most-adored writer</p>
            {mostAdoredWriter.tied ? (
              <>
                <p className="text-xl font-extrabold text-white truncate">{summaryAnonymousMode ? '???' : mostAdoredWriter.names.join(' & ')}</p>
                <p className="text-xs text-yellow-100/70">Tied with {mostAdoredWriter.total} adored reaction{mostAdoredWriter.total === 1 ? '' : 's'} each!</p>
              </>
            ) : (
              <>
                <p className="text-xl font-extrabold text-white truncate">{summaryAnonymousMode ? '???' : (mostAdoredWriter.names[0] || 'Unknown')}</p>
                <p className="text-xs text-yellow-100/70">{mostAdoredWriter.total} adored reaction{mostAdoredWriter.total === 1 ? '' : 's'}!</p>
              </>
            )}
          </div>
          <div className="summary-mvp__badge">{mostAdoredWriter.tied ? 'Tied!' : 'Adored!'}</div>
        </div>
      ) : (
        <div className="summary-mvp card" style={{ opacity: 0.6 }}>
          <div className="summary-mvp__icon">💭</div>
          <div className="min-w-0">
            <p className="text-sm text-yellow-200">Round's most-adored writer</p>
            <p className="text-xl font-extrabold text-white truncate">No reactions yet</p>
            <p className="text-xs text-yellow-100/70">Send ❤️ and 😂 during the next round!</p>
          </div>
        </div>
      )}

      {voteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4" role="dialog" aria-modal="true" aria-labelledby="vote-confirm-title">
          <div className="bg-gray-900 border border-indigo-700 rounded-xl p-6 max-w-xs w-full text-center">
            <p id="vote-confirm-title" className="text-lg font-bold text-white mb-2">Lock in vote?</p>
            <p className="text-sm text-gray-400 mb-1">You're voting for:</p>
            <p className="text-sm text-indigo-300 font-medium mb-4 line-clamp-2">{voteConfirm.question}</p>
            <p className="text-xs text-gray-500 mb-4">Authors will be revealed after you lock in.</p>
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

      {isHost ? (
        <div className="summary-actions">
          {tournament && tournament.enabled ? (
            <>
              <div className="summary-actions__cta">
                <button
                  onClick={() => socketRef.current?.emit("finish-voting")}
                  className="btn-primary py-3 text-base border-2 border-fuchsia-500/30 bg-fuchsia-950/10"
                >
                  <span className="text-xs font-bold text-fuchsia-300 uppercase tracking-wider">HOST CONTROL</span>
                  <span className="ml-2">⚡ Finish Voting & Tally</span>
                </button>
                <button onClick={disbandGame} className="btn-secondary py-3 text-sm whitespace-normal leading-tight border-2 border-fuchsia-500/30 bg-fuchsia-950/10">
                  <span className="text-xs font-bold text-fuchsia-300 uppercase tracking-wider">HOST CONTROL</span>
                  <span className="ml-2">🏠 Abandon Tournament</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="summary-actions__toggles">
                <div className="summary-toggle card">
                  <div>
                    <p className="text-xs text-white font-semibold">Anonymous Results</p>
                    <p className="text-xs text-gray-400">Hide names in next game's summary + Best Of.</p>
                  </div>
                  <button onClick={() => socketRef.current?.emit("toggle-anonymous")} aria-pressed={anonymousMode} aria-label="Toggle anonymous results" className={"toggle-switch " + (anonymousMode ? "toggle-switch--on" : "")}>
                    <span />
                  </button>
                </div>
                <div className="summary-toggle card">
                  <div>
                    <p className="text-xs text-white font-semibold">No Self-Reading</p>
                    <p className="text-xs text-gray-400">Players won't read their own content next round.</p>
                  </div>
                  <button onClick={() => setNoSelfReading(!noSelfReading)} aria-pressed={noSelfReading} aria-label="Toggle no self-reading" className={"toggle-switch " + (noSelfReading ? "toggle-switch--on" : "")}>
                    <span />
                  </button>
                </div>
                <button onClick={() => { setNotice(noticeFor('Starting new game…', 'info', 1000)); socketRef.current?.emit("replay-game", { noSelfReading }) }} className="summary-quick-btn order-first">
                  🔄 Replay (same players)
                </button>
              </div>
              <div className="summary-actions__cta">
                <button onClick={disbandGame} className="btn-secondary py-3 text-sm whitespace-normal leading-tight">
                  🏠 New game (change number of players)
                </button>
                {adminKey && (
                  <button onClick={() => setHideGameConfirm(true)} className="summary-hide-btn border-2 border-fuchsia-500/30 bg-fuchsia-950/10">
                    <span className="text-xs font-bold text-fuchsia-300 uppercase tracking-wider">HOST CONTROL</span>
                    <span className="ml-2">🚫 Hide from Best Of</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="summary-actions">
          {tournament && tournament.enabled ? (
            <div className="card text-center py-5 px-6 animate-pulse">
              <p className="text-base text-gray-200 mb-1 font-semibold">Waiting for votes or timer…</p>
              {tournament.votingDeadlineAt && (
                <Countdown deadlineAt={tournament.votingDeadlineAt} serverNow={tournament.serverNow} className="text-lg font-bold text-indigo-300" />
              )}
              <button onClick={handleAbandonGame} className="btn-secondary py-2.5 text-sm w-full max-w-xs mt-3">
                Abandon game (exit to main screen)
              </button>
            </div>
          ) : (
            <div className="card text-center py-5 px-6 animate-pulse">
              <p className="text-base text-gray-200 mb-1 font-semibold">Please wait for the host to start a new round</p>
              <p className="text-sm text-gray-500 mb-5 font-semibold">Your screen will automatically refresh</p>
              <button onClick={handleAbandonGame} className="btn-secondary py-2.5 text-sm w-full max-w-xs">
                Abandon game (exit to main screen)
              </button>
            </div>
          )}
        </div>
      )}
      {gameSummary && gameSummary.length > 0 && (
        <div className="flex justify-center">
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
  )
}

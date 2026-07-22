import React, { useState, useEffect, useRef } from "react"
import Countdown from "./Countdown"

const RANK_ICONS = { 1: "🥇", 2: "🥈", 3: "🥉" }

export default function ScoreboardView({
  scoreboardData,
  isHost,
  socketRef,
  playerName,
  setNotice
}) {
  const { standings, roundWinnerDetails, currentRound, targetRounds, isFinalRound, deadlineAt, serverNow, speedDetails, scoringRules } = scoreboardData
  const prevRanksRef = useRef({})
  const [showAll, setShowAll] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [revealWinners, setRevealWinners] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState(null)

  const speedEnabled = scoringRules?.speedScoringEnabled
  const isCompact = standings.length > 8

  // Delay reveal of winners for drama
  useEffect(() => {
    const t = setTimeout(() => setRevealWinners(true), 2000)
    return () => clearTimeout(t)
  }, [])

  // Close modal on Escape
  useEffect(() => {
    if (!selectedPlayer) return
    const onKey = (e) => { if (e.key === "Escape") setSelectedPlayer(null) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedPlayer])

  // Track rank changes for delta indicators
  useEffect(() => {
    if (standings) {
      const newRanks = {}
      standings.forEach(s => { newRanks[s.name] = s.rank })
      prevRanksRef.current = newRanks
    }
  }, [standings])

  if (!standings) return null

  // Determine which standings to show (relative leaderboard for >8 players)
  const myIndex = standings.findIndex(s => s.name === playerName)
  const showRelative = standings.length > 8 && !showAll
  let visibleStandings = standings
  if (showRelative && myIndex >= 0) {
    const indices = new Set([0, 1, 2])
    const start = Math.max(3, myIndex - 1)
    const end = Math.min(standings.length - 1, myIndex + 1)
    for (let i = start; i <= end; i++) {
      indices.add(i)
    }
    visibleStandings = Array.from(indices).sort((a, b) => a - b).map(i => standings[i])
  }

  return (
    <div className="game-container game-container--summary py-4">
      <div className="summary-header--compact" data-testid="scoreboard-header">
        <div className="summary-header--compact__row">
          <div className="flex items-center gap-2">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Round {currentRound} of {targetRounds}</p>
            <span className="text-xs text-gray-500">·</span>
            <h2 className="text-sm md:text-base font-black text-white">Scoreboard</h2>
          </div>
          <div className="flex items-center gap-1.5 text-xs md:text-sm text-gray-400">
            <span>Next {isFinalRound ? "results" : "round"}</span>
            <Countdown deadlineAt={deadlineAt} serverNow={serverNow} className="font-bold text-sm md:text-base" />
          </div>
        </div>
      </div>

      {roundWinnerDetails && roundWinnerDetails.length > 0 && (
        <div className="summary-winner-banner" data-testid="winner-banner">
          {roundWinnerDetails.map((winner, i) => {
            const base = winner.pointsBreakdown?.base ?? (winner.isFluke ? winner.votes * 2 + 2 + 3 : winner.votes + 2)
            const speed = winner.pointsBreakdown?.speed ?? 0
            const speedText = speed !== 0 ? ` · ⚡${speed > 0 ? "+" : ""}${speed}` : ""
            const winnerQ = revealWinners ? winner.questionAuthor : "???"
            const winnerA = revealWinners ? winner.answerAuthor : "???"

            return (
              <p key={i} className="leading-snug text-sm md:text-base animate-in fade-in slide-in-from-bottom-2 duration-700">
                {winner.isFluke ? (
                  <span className={"summary-winner-banner__fluke transition-all duration-500 " + (revealWinners ? "opacity-100" : "opacity-70 scale-95")}>
                    🎯 <span className="vote-now-logo text-base md:text-lg align-middle mx-1"><span style={{ color: "#c026d3" }}>F</span><span style={{ color: "#f97316" }}>l</span><span style={{ color: "#facc15" }}>u</span><span style={{ color: "#f43f5e" }}>k</span><span style={{ color: "#a855f7" }}>e</span><span style={{ color: "#facc15" }} className="animate-pop-wiggle">!</span></span> +{base} pts — <span className={revealWinners ? "text-white font-bold" : "text-gray-500"}>{winnerQ}</span>
                  </span>
                ) : (
                  <span className={"summary-winner-banner__normal transition-all duration-500 " + (revealWinners ? "opacity-100" : "opacity-70 scale-95")}>
                    🏆 Winner: +{base} pts — <span className={revealWinners ? "text-white font-bold" : "text-gray-500"}>{winnerQ}</span> & <span className={revealWinners ? "text-white font-bold" : "text-gray-500"}>{winnerA}</span>
                  </span>
                )}
                <span className="text-gray-500 ml-1">({winner.votes} vote{winner.votes === 1 ? "" : "s"}{speedText})</span>
              </p>
            )
          })}
        </div>
      )}

      {speedEnabled && speedDetails && !roundWinnerDetails?.length && (
        <div className="summary-winner-banner" data-testid="speed-banner">
          <p className="leading-snug text-sm md:text-base">
            <span className="text-amber-300">⚡</span>
            <span className="ml-1">
              {speedDetails.fastestQ && <>Fastest Q: {speedDetails.fastestQ} </>}
              {speedDetails.fastestA && <>· Fastest A: {speedDetails.fastestA} </>}
              {speedDetails.slowestQ && <>· Slowest Q: {speedDetails.slowestQ} </>}
              {speedDetails.slowestA && <>· Slowest A: {speedDetails.slowestA}</>}
              {!speedDetails.fastestQ && !speedDetails.fastestA && !speedDetails.slowestQ && !speedDetails.slowestA && "No speed data this round"}
            </span>
          </p>
        </div>
      )}

      <div className="summary-scroll">
        <div className="space-y-0.5 content-visibility-auto">
          {visibleStandings.map((s, idx) => {
            const icon = RANK_ICONS[s.rank] || null
            const isMe = s.name === playerName
            const prevRank = prevRanksRef.current[s.name]
            const delta = prevRank && prevRank !== s.rank ? (prevRank > s.rank ? "▲" : "▼") : null
            const showSeparator = showRelative && idx === 3 && !showAll
            const roundIdx = currentRound - 1
            const speedBonus = s.roundSpeedBonuses?.[roundIdx] ?? 0

            return (
              <React.Fragment key={s.name}>
                {showSeparator && (
                  <div className="text-center text-xs text-gray-600 py-1">· · ·</div>
                )}
                <button type="button" onClick={() => setSelectedPlayer(s)} className={
                  "w-full text-left flex items-center gap-3 rounded-xl transition-all duration-300 focus-visible:ring-2 focus-visible:ring-indigo-400 " +
                  (isMe ? "bg-indigo-900/40 border border-indigo-700" : "bg-gray-800/60") +
                  (s.leftGame ? " opacity-50" : "") +
                  (isCompact ? " py-1 px-2" : " py-1.5 px-2.5")
                }>
                  <div className={"flex flex-col items-center justify-center shrink-0 " + (isCompact ? "w-8 h-8" : "w-10 h-10")}>
                    {icon ? (
                      <span className={isCompact ? "text-lg" : "text-xl"}>{icon}</span>
                    ) : (
                      <span className={(isCompact ? "text-sm" : "text-base") + " font-bold text-gray-400"}>{s.rank}</span>
                    )}
                    {delta && (
                      <span className={"text-[10px] leading-none " + (delta === "▲" ? "text-emerald-400" : "text-rose-400")}>{delta}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={(isCompact ? "text-sm md:text-base" : "text-base md:text-lg") + " font-semibold truncate " + (isMe ? "text-indigo-300" : "text-white")}>
                      {s.name}{isMe && " (you)"}{s.leftGame && " (left)"}
                    </p>
                    <p className={(isCompact ? "text-xs" : "text-sm") + " text-gray-500"}>
                      {s.firstPlaces > 0 && `${s.firstPlaces}× 1st · `}{s.votesReceived} votes received
                      {speedEnabled && speedBonus !== 0 && <span className={"ml-1 " + (speedBonus > 0 ? "text-amber-400" : "text-gray-500")}>· ⚡{speedBonus > 0 ? "+" : ""}{speedBonus}</span>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={(isCompact ? "text-xl" : "text-2xl") + " font-black text-amber-300"}>{s.total}</p>
                  </div>
                </button>
              </React.Fragment>
            )
          })}
        </div>
        {showRelative && (
          <div className="text-center mt-3">
            <button onClick={() => setShowAll(true)} className="text-sm text-indigo-300 hover:text-indigo-200 underline py-1 min-h-[44px] px-2">
              Show all {standings.length} players
            </button>
          </div>
        )}
      </div>

      {selectedPlayer && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="player-breakdown-title" onClick={(e) => { if (e.target === e.currentTarget) setSelectedPlayer(null) }}>
          <div className="w-full max-w-md rounded-2xl border border-indigo-500/40 bg-gray-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 id="player-breakdown-title" className="text-lg font-bold text-white">{selectedPlayer.name}</h3>
                <p className="text-sm text-gray-400">{selectedPlayer.total} points · {selectedPlayer.votesReceived} votes received</p>
              </div>
              <button type="button" onClick={() => setSelectedPlayer(null)} className="min-h-[44px] px-3 text-gray-300" aria-label="Close player breakdown">✕</button>
            </div>
            <div className="mt-4 space-y-2">
              {(selectedPlayer.roundScores?.length ? selectedPlayer.roundScores : [0]).map((rawScore, index) => {
                const score = rawScore ?? 0
                const speed = selectedPlayer.roundSpeedBonuses?.[index] || 0
                return <div key={index} className="flex items-center justify-between rounded-lg bg-gray-800/70 px-3 py-2 text-sm"><span className="text-gray-300">Round {index + 1}</span><span className="text-white">Base {score - speed >= 0 ? "+" : ""}{score - speed}{speed !== 0 && <span className="ml-2 text-amber-300">Speed {speed > 0 ? "+" : ""}{speed}</span>} <strong className="ml-2 text-amber-300">= {score > 0 ? "+" : ""}{score}</strong></span></div>
              })}
            </div>
          </div>
        </div>
      )}

      {/* Scoring History — expandable breakdown */}
      {standings.some(s => (s.roundScores?.[currentRound - 1] ?? 0) !== 0 || (s.roundSpeedBonuses?.[currentRound - 1] ?? 0) !== 0) && (
        <div className="text-center">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors py-1 min-h-[44px] px-2"
          >
            {showHistory ? "▾ Hide Scoring History" : "▸ Show Scoring History"}
          </button>
          {showHistory && (
            <div className="card mt-1 py-2 px-3 space-y-1">
              {standings.map(s => {
                const roundIdx = currentRound - 1
                const roundScore = s.roundScores?.[roundIdx] ?? 0
                const speedBonus = s.roundSpeedBonuses?.[roundIdx] ?? 0
                const baseScore = roundScore - speedBonus
                const isMe = s.name === playerName
                return (
                  <div key={s.name} className={"flex items-center justify-between text-xs md:text-sm py-1 " + (isMe ? "text-indigo-300" : "text-gray-400")}>
                    <span className="truncate max-w-[120px] md:max-w-[160px]">{s.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-gray-500">Base: {baseScore > 0 ? "+" : ""}{baseScore}</span>
                      {speedBonus !== 0 && <span className={speedBonus > 0 ? "text-amber-400" : "text-gray-500"}>⚡ {speedBonus > 0 ? "+" : ""}{speedBonus}</span>}
                      <span className="text-white font-semibold">= {roundScore > 0 ? "+" : ""}{roundScore}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {isHost ? (
        <div className="summary-actions">
          <button
            onClick={() => socketRef.current?.emit("next-round")}
            className="btn-primary py-2.5 md:py-3 text-sm md:text-base min-h-[44px]"
          >
            {isFinalRound ? "🏆 See Final Results →" : "Next Round →"}
          </button>
        </div>
      ) : (
        <div className="summary-actions--compact">
          <p className="summary-guest--compact">Waiting for host or timer…</p>
        </div>
      )}
    </div>
  )
}

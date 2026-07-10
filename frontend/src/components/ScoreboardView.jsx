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

  const speedEnabled = scoringRules?.speedScoringEnabled

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
    const top3 = standings.slice(0, 3)
    const aroundMe = standings.filter((s, i) => {
      if (i < 3) return false
      return Math.abs(i - myIndex) <= 1
    })
    visibleStandings = [...top3, ...aroundMe]
  }

  return (
    <div className="game-container game-container--summary py-4">
      <div className="summary-header card">
        <div className="flex flex-col gap-1 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">Round {currentRound} of {targetRounds}</p>
          <h2 className="font-bubble text-2xl font-black text-white leading-tight">Scoreboard</h2>
          <div className="mt-1 flex items-center justify-center gap-2 text-sm text-gray-400">
            <span>Next {isFinalRound ? "results" : "round"} in</span>
            <Countdown deadlineAt={deadlineAt} serverNow={serverNow} className="font-bold text-lg" />
          </div>
        </div>
      </div>

      {roundWinnerDetails && roundWinnerDetails.length > 0 && (
        <div className="card mb-3 py-3 px-4">
          <p className="text-xs text-amber-300 uppercase tracking-widest mb-2 text-center">Round Winner{roundWinnerDetails.length > 1 ? "s" : ""}</p>
          {roundWinnerDetails.map((winner, i) => {
            const base = winner.pointsBreakdown?.base ?? (winner.isFluke ? winner.votes * 2 + 2 + 3 : winner.votes + 2)
            const speed = winner.pointsBreakdown?.speed ?? 0
            return (
              <div key={i} className="text-center">
                {winner.isFluke ? (
                  <div className="inline-flex items-center gap-2 bg-purple-900/40 border border-purple-700/50 rounded-full px-3 py-1">
                    <span className="text-sm font-bold text-purple-200">🎯 FLUKE! +{base}</span>
                    <span className="text-xs text-purple-300">{winner.questionAuthor}</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 bg-indigo-900/40 border border-indigo-700/50 rounded-full px-3 py-1">
                    <span className="text-sm font-bold text-indigo-200">+{base} each</span>
                    <span className="text-xs text-indigo-300">{winner.questionAuthor} & {winner.answerAuthor}</span>
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">{winner.votes} vote{winner.votes === 1 ? "" : "s"}{speed !== 0 && <span className="text-amber-400"> · ⚡{speed > 0 ? "+" : ""}{speed} speed</span>}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Round Highlights — Speed badges (only if blitz was enabled for this round) */}
      {speedEnabled && speedDetails && (
        <div className="card mb-3 py-2 px-3">
          <p className="text-xs text-amber-400 uppercase tracking-widest mb-1.5 text-center">⚡ Round Highlights</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {speedDetails.fastestQ && (
              <div className="inline-flex items-center gap-1 bg-amber-900/30 border border-amber-700/40 rounded-full px-2 py-0.5">
                <span className="text-xs">⚡</span>
                <span className="text-xs text-amber-300 font-semibold">Fastest Q</span>
                <span className="text-xs text-amber-200">{speedDetails.fastestQ}</span>
              </div>
            )}
            {speedDetails.fastestA && (
              <div className="inline-flex items-center gap-1 bg-amber-900/30 border border-amber-700/40 rounded-full px-2 py-0.5">
                <span className="text-xs">⚡</span>
                <span className="text-xs text-amber-300 font-semibold">Fastest A</span>
                <span className="text-xs text-amber-200">{speedDetails.fastestA}</span>
              </div>
            )}
            {speedDetails.slowestQ && (
              <div className="inline-flex items-center gap-1 bg-gray-800 border border-gray-600/40 rounded-full px-2 py-0.5">
                <span className="text-xs">🐢</span>
                <span className="text-xs text-gray-400 font-semibold">Slowest Q</span>
                <span className="text-xs text-gray-300">{speedDetails.slowestQ}</span>
              </div>
            )}
            {speedDetails.slowestA && (
              <div className="inline-flex items-center gap-1 bg-gray-800 border border-gray-600/40 rounded-full px-2 py-0.5">
                <span className="text-xs">🐢</span>
                <span className="text-xs text-gray-400 font-semibold">Slowest A</span>
                <span className="text-xs text-gray-300">{speedDetails.slowestA}</span>
              </div>
            )}
            {!speedDetails.fastestQ && !speedDetails.fastestA && !speedDetails.slowestQ && !speedDetails.slowestA && (
              <span className="text-xs text-gray-500">No speed data this round</span>
            )}
          </div>
        </div>
      )}

      <div className="summary-scroll">
        <div className="space-y-1.5 content-visibility-auto">
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
                <div className={
                  "flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all duration-300 " +
                  (isMe ? "bg-indigo-900/40 border border-indigo-700" : "bg-gray-800/60") +
                  (s.leftGame ? " opacity-50" : "")
                }>
                  <div className="w-8 h-8 flex items-center justify-center shrink-0">
                    {icon ? (
                      <span className="text-xl">{icon}</span>
                    ) : (
                      <span className="text-sm font-bold text-gray-400">{s.rank}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={"text-sm md:text-base font-semibold truncate " + (isMe ? "text-indigo-300" : "text-white")}>
                      {s.name}{isMe && " (you)"}{s.leftGame && " (left)"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {s.firstPlaces > 0 && `${s.firstPlaces}× 1st · `}{s.votesReceived} votes
                      {speedEnabled && speedBonus !== 0 && <span className={"ml-1 " + (speedBonus > 0 ? "text-amber-400" : "text-gray-500")}>· ⚡{speedBonus > 0 ? "+" : ""}{speedBonus}</span>}
                    </p>
                  </div>
                  {delta && (
                    <span className={"text-xs " + (delta === "▲" ? "text-emerald-400" : "text-rose-400")}>{delta}</span>
                  )}
                  <div className="text-right shrink-0">
                    <p className="text-xl font-black text-amber-300">{s.total}</p>
                    <p className="text-xs md:text-sm text-gray-500">pts</p>
                  </div>
                </div>
              </React.Fragment>
            )
          })}
        </div>
        {showRelative && (
          <div className="text-center mt-3">
            <button onClick={() => setShowAll(true)} className="text-xs text-indigo-300 hover:text-indigo-200 underline">
              Show all {standings.length} players
            </button>
          </div>
        )}
      </div>

      {/* Scoring History — expandable breakdown */}
      {speedEnabled && (
        <div className="mt-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full text-center text-xs text-indigo-400 hover:text-indigo-300 transition-colors py-1"
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
                  <div key={s.name} className={"flex items-center justify-between text-xs py-0.5 " + (isMe ? "text-indigo-300" : "text-gray-400")}>
                    <span className="truncate max-w-[80px]">{s.name}</span>
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
            className="btn-primary py-3 text-base border-2 border-fuchsia-500/30 bg-fuchsia-950/10 min-h-[44px]"
          >
            <span className="text-xs font-bold text-fuchsia-300 uppercase tracking-wider">HOST CONTROL</span>
            <span className="ml-2">{isFinalRound ? "🏆 See Final Results →" : "Next Round →"}</span>
          </button>
        </div>
      ) : (
        <div className="summary-actions">
          <div className="card text-center py-5 px-6 animate-pulse">
            <p className="text-base md:text-lg text-gray-200 mb-1 font-semibold">Waiting for host or timer…</p>
            <Countdown deadlineAt={deadlineAt} serverNow={serverNow} className="text-lg font-bold text-indigo-300" />
          </div>
        </div>
      )}
    </div>
  )
}

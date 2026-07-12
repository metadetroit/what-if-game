import React, { useState, useEffect } from "react"

function getOrdinal(n) {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

const RANK_ICONS = { 1: "\u{1F947}", 2: "\u{1F948}", 3: "\u{1F949}" }

export default function PersonalRankReveal({
  rankRevealData,
  isHost,
  socketRef,
  playerName
}) {
  const { rank, total, totalPlayers, isChampion, isTie, champions } = rankRevealData
  const [showContent, setShowContent] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setShowContent(true), 200)
    return () => clearTimeout(t)
  }, [])

  if (!rank) return null

  const rankEmoji = RANK_ICONS[rank] || null
  const ordinalRank = getOrdinal(rank)

  let headline = ""
  let subtext = ""
  if (isChampion && isTie) {
    headline = `\u{1F3C6} Co-Champion!`
    subtext = `You tied for 1st with ${champions.filter(c => c !== playerName).join(", ")}`
  } else if (isChampion) {
    headline = `\u{1F3C6} Champion!`
    subtext = `You won the tournament!`
  } else if (rank <= 3) {
    headline = `${rankEmoji || "\u{1F389}"} Podium Finish!`
    subtext = `You placed ${ordinalRank} out of ${totalPlayers} players`
  } else if (rank <= Math.ceil(totalPlayers / 2)) {
    headline = `\u{1F44D} Top Half!`
    subtext = `You finished ${ordinalRank} out of ${totalPlayers} players`
  } else {
    headline = `\u{1F3AF} ${ordinalRank} Place`
    subtext = `Out of ${totalPlayers} players with ${total} pts`
  }

  return (
    <div className="game-container game-container--summary py-4 flex flex-col items-center justify-center min-h-[50vh]">
      {isChampion && (
        <div className="confetti-container" aria-hidden="true">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="confetti-piece"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
                backgroundColor: ["#fbbf24", "#6366f1", "#ec4899", "#10b981", "#f97316"][i % 5]
              }}
            />
          ))}
        </div>
      )}
      <div
        className={`text-center transition-all duration-700 ${showContent ? "opacity-100 scale-100" : "opacity-0 scale-90"}`}
      >
        <div className="text-6xl mb-4 animate-pop-wiggle inline-block">
          {rankEmoji || (isChampion ? "\u{1F3C6}" : "\u{1F389}")}
        </div>
        <h2 className="font-bubble text-3xl md:text-4xl font-black text-white mb-2 heading-pulse inline-block">
          {headline}
        </h2>
        <p className="text-lg text-gray-300 mb-4">{subtext}</p>
        <div className="inline-flex items-center gap-2 bg-gray-800/60 border border-gray-700 rounded-full px-4 py-2">
          <span className="text-3xl font-black text-amber-300">{total}</span>
          <span className="text-base text-gray-400">total points</span>
        </div>
      </div>
      {isHost ? (
        <button
          onClick={() => socketRef.current?.emit("next-round")}
          className="btn-primary py-2.5 md:py-3 text-sm md:text-base min-h-[44px] mt-8"
        >
          {"\u{1F3C5} See Final Results \u2192"}
        </button>
      ) : (
        <p className="text-sm text-gray-500 mt-8 animate-pulse">Waiting for final results...</p>
      )}
    </div>
  )
}

import React from "react"

const RANK_ICONS = { 1: "🥇", 2: "🥈", 3: "🥉" }

export default function TournamentCompleteView({
  tournamentCompleteData,
  isHost,
  socketRef,
  disbandGame,
  playerName
}) {
  if (!tournamentCompleteData) return null
  const { champions, isTie, standings } = tournamentCompleteData
  const isCompact = standings.length > 8

  return (
    <div className="game-container game-container--summary py-4">
      <div className="summary-header--compact text-center" data-testid="champion-header">
        {isTie ? (
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className="text-2xl animate-bounce">🏆</span>
            <h2 className="font-bubble text-xl md:text-2xl font-black text-amber-300 leading-tight">Co-Champions</h2>
            <span className="text-sm md:text-base font-bold text-white px-2 text-center">{champions.join(" & ")}</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className="text-2xl animate-bounce">🏆</span>
            <h2 className="font-bubble text-xl md:text-2xl font-black text-amber-300 leading-tight">Tournament Champion</h2>
            <span className="text-lg md:text-xl font-black text-white truncate px-2">{champions[0]}</span>
          </div>
        )}
      </div>

      <div className="summary-scroll">
        <div className="space-y-1 content-visibility-auto">
          {standings.map(s => {
            const icon = RANK_ICONS[s.rank] || null
            const isMe = s.name === playerName
            return (
              <div
                key={s.name}
                className={
                  "flex items-center gap-3 rounded-xl " +
                  (isMe ? "bg-indigo-900/40 border border-indigo-700" : "bg-gray-800/60") +
                  (s.leftGame ? " opacity-50" : "") +
                  (isCompact ? " py-1.5 px-2.5" : " py-2 px-3")
                }
              >
                <div className={"flex items-center justify-center shrink-0 " + (isCompact ? "w-8 h-8" : "w-10 h-10")}>
                  {icon ? (
                    <span className={isCompact ? "text-lg" : "text-xl"}>{icon}</span>
                  ) : (
                    <span className={(isCompact ? "text-sm" : "text-base") + " font-bold text-gray-400"}>{s.rank}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={(isCompact ? "text-sm md:text-base" : "text-base md:text-lg") + " font-semibold truncate " + (isMe ? "text-indigo-300" : "text-white")}>
                    {s.name}{isMe && " (you)"}{s.leftGame && " (left)"}
                  </p>
                  <p className={(isCompact ? "text-xs" : "text-sm") + " text-gray-500"}>
                    {s.firstPlaces > 0 && `${s.firstPlaces}× 1st · `}{s.votesReceived} votes
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={(isCompact ? "text-xl" : "text-2xl") + " font-black text-amber-300"}>{s.total}</p>
                  <p className={(isCompact ? "text-xs" : "text-sm") + " text-gray-500"}>pts</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {isHost ? (
        <div className="summary-actions--compact">
          <div className="summary-actions--compact__row">
            <button
              onClick={() => socketRef.current?.emit("new-tournament")}
              className="btn-primary flex-1 py-2.5 md:py-3 text-sm md:text-base min-h-[44px]"
            >
              🔁 New Tournament (same players)
            </button>
            <button onClick={disbandGame} className="btn-secondary flex-1 py-2.5 md:py-3 text-xs md:text-sm whitespace-normal leading-tight min-h-[44px]">
              🏠 New game (change players)
            </button>
          </div>
        </div>
      ) : (
        <div className="summary-actions--compact">
          <p className="summary-guest--compact">Waiting for host to start a new tournament or disband…</p>
        </div>
      )}
    </div>
  )
}

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

  return (
    <div className="game-container game-container--summary py-4">
      <div className="summary-header--compact text-center" data-testid="champion-header">
        {isTie ? (
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className="text-xl">🏆</span>
            <h2 className="font-bubble text-xl md:text-2xl font-black text-amber-300 leading-tight">Co-Champions</h2>
            <span className="text-sm md:text-base font-bold text-white truncate px-2">{champions.join(" & ")}</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className="text-xl">🏆</span>
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
                  "flex items-center gap-3 py-2 px-3 rounded-xl " +
                  (isMe ? "bg-indigo-900/40 border border-indigo-700" : "bg-gray-800/60") +
                  (s.leftGame ? " opacity-50" : "")
                }
              >
                <div className="w-8 h-8 flex items-center justify-center shrink-0">
                  {icon ? <span className="text-xl">{icon}</span> : <span className="text-sm font-bold text-gray-400">{s.rank}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={"text-sm md:text-base font-semibold truncate " + (isMe ? "text-indigo-300" : "text-white")}>
                    {s.name}{isMe && " (you)"}{s.leftGame && " (left)"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {s.firstPlaces > 0 && `${s.firstPlaces}× 1st · `}{s.votesReceived} votes
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-black text-amber-300">{s.total}</p>
                  <p className="text-xs md:text-sm text-gray-500">pts</p>
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

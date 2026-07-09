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
      <div className="summary-header card text-center">
        <p className="text-4xl mb-2">🏆</p>
        {isTie ? (
          <>
            <h2 className="font-bubble text-2xl font-black text-amber-300 leading-tight">Co-Champions!</h2>
            <p className="text-lg md:text-xl font-bold text-white mt-2 truncate px-2">{champions.join(" & ")}</p>
          </>
        ) : (
          <>
            <h2 className="font-bubble text-2xl font-black text-amber-300 leading-tight">Tournament Champion!</h2>
            <p className="text-2xl md:text-3xl font-black text-white mt-2 truncate px-2">{champions[0]}</p>
          </>
        )}
      </div>

      <div className="summary-scroll">
        <div className="space-y-1.5">
          {standings.map(s => {
            const icon = RANK_ICONS[s.rank] || null
            const isMe = s.name === playerName
            return (
              <div
                key={s.name}
                className={
                  "flex items-center gap-3 py-2.5 px-3 rounded-xl " +
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
                  <p className="text-xs md:text-sm text-gray-500">
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
        <div className="summary-actions">
          <div className="summary-actions__cta">
            <button
              onClick={() => socketRef.current?.emit("new-tournament")}
              className="btn-primary py-3 text-base min-h-[44px]"
            >
              🔁 New Tournament (same players)
            </button>
            <button onClick={disbandGame} className="btn-secondary py-3 text-sm whitespace-normal leading-tight min-h-[44px]">
              🏠 New game (change players)
            </button>
          </div>
        </div>
      ) : (
        <div className="summary-actions">
          <div className="card text-center py-5 px-6">
            <p className="text-base md:text-lg text-gray-200 mb-1">Waiting for host…</p>
            <p className="text-sm md:text-base text-gray-500">Host can start a new tournament or disband</p>
          </div>
        </div>
      )}
    </div>
  )
}

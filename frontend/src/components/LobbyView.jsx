import React from "react"
import { noticeFor } from "../utils/gameUtils"

export default function LobbyView({
  roomCode,
  players,
  socket,
  isHost,
  soundMuted,
  kickConfirm,
  kickTrapRef,
  anonymousMode,
  noSelfReading,
  setNoSelfReading,
  startGame,
  setKickConfirm,
  setSoundMuted,
  writeSoundMuted,
  setNotice,
  socketRef
}) {
  return (
    <div className="game-container game-container--active py-2">
      {kickConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="kick-title">
          <div ref={kickTrapRef} className="bg-gray-900 border border-red-700 rounded-xl p-6 max-w-xs w-full text-center">
            <p id="kick-title" className="text-lg font-bold text-white mb-2">Kick Player?</p>
            <p className="text-sm text-gray-400 mb-4">Remove <span className="text-white font-semibold">{kickConfirm.name}</span> from the room?</p>
            <div className="flex gap-3">
              <button onClick={() => setKickConfirm(null)} className="btn-secondary flex-1 py-2 text-sm">Cancel</button>
              <button onClick={() => { socketRef.current?.emit("host-kick-player", { playerId: kickConfirm.id }); setKickConfirm(null) }} className="btn-primary flex-1 py-2 text-sm bg-red-700 hover:bg-red-800">Kick</button>
            </div>
          </div>
        </div>
      )}
      <div className="card mb-2 py-2">
        <div className="text-center">
          <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Room Code</p>
          <div className="flex items-center justify-center gap-2">
            <div className="text-3xl font-black text-gradient tracking-[0.2em]">{roomCode}</div>
            <button
              onClick={() => { navigator.clipboard?.writeText(roomCode); setNotice(noticeFor('Room code copied', 'success', 1200)) }}
              className="shrink-0 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm hover:bg-gray-700 transition-colors"
              title="Copy room code"
              aria-label="Copy room code"
            >
              📋
            </button>
            <button
              onClick={() => {
                const next = !soundMuted
                writeSoundMuted(next)
                setSoundMuted(next)
              }}
              className="shrink-0 bg-gray-800 border border-gray-700 rounded-lg w-8 h-8 flex items-center justify-center text-sm hover:bg-gray-700 transition-colors"
              title={soundMuted ? "Sounds muted — click to unmute" : "Sounds on — click to mute"}
              aria-label={soundMuted ? "Unmute sounds" : "Mute sounds"}
            >
              {soundMuted ? "🔇" : "🔊"}
            </button>
          </div>
          <p className="text-[10px] text-gray-600 mt-1">Tap to copy and share</p>
        </div>
      </div>
      <div className="card flex-1 min-h-0 py-2 px-2 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Players</span>
          <span className="text-[10px] text-gray-400">{players.length}/15</span>
        </div>
        <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
          {players.map((player, index) => (
            <div key={player.id} className={"flex items-center gap-2 py-0.5 px-1.5 rounded-lg " + (player.id === socket?.id ? "bg-indigo-900/40 border border-indigo-700" : "bg-gray-800")}>
              <div className="w-5 h-5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-[10px] font-bold">{index + 1}</div>
              <span className={"text-sm truncate leading-tight " + (player.id === socket?.id ? "text-indigo-300 font-semibold" : "text-white")}>{player.name}{player.id === socket?.id && " (you)"}</span>
              {player.isHost && (<span className="ml-auto text-[9px] bg-indigo-900/50 text-indigo-400 px-1.5 py-0.5 rounded font-semibold">HOST</span>)}
              {isHost && player.id !== socket?.id && (
                <button onClick={() => setKickConfirm({ id: player.id, name: player.name })} className="ml-1 text-[10px] text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-red-900/30 transition-colors" title="Kick player" aria-label={`Kick ${player.name}`}>✕</button>
              )}
            </div>
          ))}
        </div>
      </div>
      {isHost && (
        <div className="grid grid-cols-2 gap-2">
          <div className="card py-2 px-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white font-medium leading-tight">Anonymous Results</p>
                <p className="text-[9px] text-gray-500 leading-tight">Hide names in end-game summary</p>
              </div>
              <button onClick={() => socketRef.current?.emit("toggle-anonymous")} aria-pressed={anonymousMode} aria-label="Toggle anonymous results" className={"relative w-10 h-5 rounded-full transition-colors duration-200 shrink-0 ml-2 " + (anonymousMode ? "bg-indigo-600" : "bg-gray-600")}>
                <div className={"absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 " + (anonymousMode ? "translate-x-5" : "translate-x-0.5")} />
              </button>
            </div>
          </div>
          <div className="card py-2 px-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white font-medium leading-tight">No Self-Reading</p>
                <p className="text-[9px] text-gray-500 leading-tight">Players won't read their own content</p>
              </div>
              <button onClick={() => setNoSelfReading(!noSelfReading)} aria-pressed={noSelfReading} aria-label="Toggle no self-reading" className={"relative w-10 h-5 rounded-full transition-colors duration-200 shrink-0 ml-2 " + (noSelfReading ? "bg-indigo-600" : "bg-gray-600")}>
                <div className={"absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 " + (noSelfReading ? "translate-x-5" : "translate-x-0.5")} />
              </button>
            </div>
          </div>
        </div>
      )}
      {isHost ? (
        <button onClick={startGame} disabled={players.length < 3} className="btn-primary py-3 text-base">
          {players.length < 3 ? "Need " + (3 - players.length) + " more player" + (3 - players.length === 1 ? "" : "s") : "Start Game!"}
        </button>
      ) : (
        <div className="text-center py-2"><span className="text-sm text-indigo-400 animate-pulse">Waiting for host to start...</span></div>
      )}
    </div>
  )
}

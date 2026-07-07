import React, { useState, useEffect } from "react"
import { noticeFor } from "../utils/gameUtils"

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  return isMobile
}

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
  socketRef,
  tournamentConfig,
  setTournamentConfig
}) {
  const isMobile = useIsMobile()
  const [configOpen, setConfigOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const toggleTournamentEnabled = () => {
    setTournamentConfig(prev => ({ ...prev, enabled: !prev.enabled }))
  }

  const blitzLabel = tournamentConfig.speedScoringEnabled ? "ON" : "OFF"
  const summaryText = `Tournament: ${tournamentConfig.targetRounds} Rounds · ${tournamentConfig.votingTimerSeconds}s Votes · Blitz: ${blitzLabel}`

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
              onClick={() => {
                const url = `${window.location.origin}?room=${roomCode}`
                if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
                  navigator.share({ title: "Fluke!", text: "Join my Fluke game!", url }).catch(() => {})
                } else {
                  navigator.clipboard?.writeText(url)
                  setNotice(noticeFor('Invite link copied', 'success', 1200))
                }
              }}
              className="shrink-0 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm hover:bg-gray-700 transition-colors"
              title={typeof navigator !== "undefined" && typeof navigator.share === "function" ? "Share invite link" : "Copy invite link"}
              aria-label={typeof navigator !== "undefined" && typeof navigator.share === "function" ? "Share invite link" : "Copy invite link"}
            >
              🔗
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
          <p className="text-[10px] text-gray-600 mt-1">Tap to share invite link</p>
        </div>
      </div>

      {tournamentConfig.enabled && (
        <div className="flex justify-center mb-2">
          <div className="inline-flex items-center gap-1.5 bg-indigo-900/30 border border-indigo-700/30 rounded-full px-2.5 py-1">
            <span className="text-[10px] text-indigo-300 font-medium tracking-wide">{summaryText}</span>
          </div>
        </div>
      )}

      <div className="card flex-1 min-h-0 py-2 px-2 flex flex-col mb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Players</span>
          <span className="text-[10px] text-gray-400">{players.length}/15</span>
        </div>
        <div className="space-y-1 overflow-y-auto flex-1 min-h-0 pb-24">
          {players.map((player, index) => (
            <div key={player.id} className={"flex items-center gap-2 py-0.5 px-1.5 rounded-lg " + (player.id === socket?.id ? "bg-indigo-900/40 border border-indigo-700" : "bg-gray-800")}>
              <div className="w-5 h-5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-[10px] font-bold">{index + 1}</div>
              <span className={"text-sm truncate leading-tight " + (player.id === socket?.id ? "text-indigo-300 font-semibold" : "text-white")}>{player.name}{player.id === socket?.id && " (you)"}</span>
              {player.isHost && (<span className="ml-auto text-[9px] bg-indigo-900/50 text-indigo-400 px-1.5 py-0.5 rounded font-semibold">HOST</span>)}
              {player.role === 'spectator' && (<span className="ml-auto text-[9px] bg-amber-900/50 text-amber-400 px-1.5 py-0.5 rounded font-semibold">SPECTATOR</span>)}
              {isHost && player.role === 'spectator' && (
                <button onClick={() => socketRef.current?.emit("promote-player", { playerName: player.name })} className="ml-1 text-[10px] bg-emerald-800/50 text-emerald-300 px-2 py-0.5 rounded font-semibold hover:bg-emerald-700/50 transition-colors" title="Promote to player next round">↑ Promote</button>
              )}
              {isHost && player.id !== socket?.id && (
                <button onClick={() => setKickConfirm({ id: player.id, name: player.name })} className="ml-1 min-w-[44px] min-h-[44px] flex items-center justify-center text-red-400 hover:text-red-300 rounded hover:bg-red-900/30 transition-colors" title="Kick player" aria-label={`Kick ${player.name}`}>✕</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {isHost && (
        <div className="card py-2 px-3 mb-2">
          <button
            onClick={() => setConfigOpen(!configOpen)}
            className="w-full flex items-center justify-between text-left group"
            aria-expanded={configOpen}
            aria-label={configOpen ? "Collapse game options" : "Expand game options"}
          >
            <div>
              <p className="text-xs text-white font-medium leading-tight">Game Options</p>
              <p className="text-[9px] text-gray-500 leading-tight">Anonymous, self-reading, tournament</p>
            </div>
            <span className={"text-gray-400 transition-transform duration-200 " + (configOpen ? "rotate-180" : "")}>▾</span>
          </button>
          {configOpen && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between py-1.5 px-2 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                <div>
                  <p className="text-xs text-white font-medium leading-tight">Anonymous Results</p>
                  <p className="text-[9px] text-gray-500 leading-tight">Hide names in end-game summary</p>
                </div>
                <button onClick={() => socketRef.current?.emit("toggle-anonymous")} aria-pressed={anonymousMode} aria-label="Toggle anonymous results" className={"relative w-10 h-5 rounded-full transition-colors duration-200 shrink-0 ml-2 " + (anonymousMode ? "bg-indigo-600" : "bg-gray-600")}>
                  <div className={"absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 " + (anonymousMode ? "translate-x-5" : "translate-x-0.5")} />
                </button>
              </div>
              <div className="flex items-center justify-between py-1.5 px-2 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                <div>
                  <p className="text-xs text-white font-medium leading-tight">No Self-Reading</p>
                  <p className="text-[9px] text-gray-500 leading-tight">Players won't read their own content</p>
                </div>
                <button onClick={() => setNoSelfReading(!noSelfReading)} aria-pressed={noSelfReading} aria-label="Toggle no self-reading" className={"relative w-10 h-5 rounded-full transition-colors duration-200 shrink-0 ml-2 " + (noSelfReading ? "bg-indigo-600" : "bg-gray-600")}>
                  <div className={"absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 " + (noSelfReading ? "translate-x-5" : "translate-x-0.5")} />
                </button>
              </div>
              <div className="flex items-center justify-between py-1.5 px-2 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors group">
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="flex-1 min-w-0 text-left"
                  aria-label="Open tournament settings"
                >
                  <p className="text-xs text-white font-medium leading-tight">Tournament Mode</p>
                  <p className="text-[9px] text-gray-500 leading-tight">Multi-round scoring with leaderboard</p>
                  {tournamentConfig.enabled && (
                    <p className="text-[9px] text-indigo-300 mt-0.5 truncate">{tournamentConfig.targetRounds} Rounds · {tournamentConfig.votingTimerSeconds}s · Blitz {tournamentConfig.speedScoringEnabled ? "ON" : "OFF"}</p>
                  )}
                </button>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <button
                    onClick={() => toggleTournamentEnabled()}
                    aria-pressed={tournamentConfig.enabled}
                    aria-label="Toggle tournament mode"
                    className={"relative w-10 h-5 rounded-full transition-colors duration-200 " + (tournamentConfig.enabled ? "bg-indigo-600" : "bg-gray-600")}
                  >
                    <div className={"absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 " + (tournamentConfig.enabled ? "translate-x-5" : "translate-x-0.5")} />
                  </button>
                  <button
                    onClick={() => setSettingsOpen(true)}
                    className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-300 transition-colors"
                    aria-label="Open tournament settings"
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!isHost && tournamentConfig.enabled && (
        <div className="card py-2 px-3 text-center mb-2">
          <p className="text-xs text-indigo-300 font-medium">Tournament Mode: {tournamentConfig.targetRounds} rounds{tournamentConfig.speedScoringEnabled ? " · ⚡ Blitz" : ""}</p>
        </div>
      )}

      {settingsOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex md:items-center md:justify-center md:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tournament-settings-title"
          onClick={(e) => { if (e.currentTarget === e.target) setSettingsOpen(false) }}
        >
          <div
            className={
              "bg-gray-900 border border-white/10 w-full max-w-md flex flex-col shadow-2xl " +
              (isMobile
                ? "absolute bottom-0 left-0 right-0 rounded-t-3xl max-h-[80vh] min-h-[50vh]"
                : "rounded-3xl max-h-[90vh]")
            }
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
              <p id="tournament-settings-title" className="text-base font-black text-white">Tournament Settings</p>
              <button onClick={() => setSettingsOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors" aria-label="Close tournament settings">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              <div className="flex items-center justify-between py-2 px-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                <div>
                  <p className="text-xs text-white font-medium leading-tight">Tournament Mode</p>
                  <p className="text-[9px] text-gray-500 leading-tight">Enable multi-round scoring</p>
                </div>
                <button
                  onClick={() => toggleTournamentEnabled()}
                  aria-pressed={tournamentConfig.enabled}
                  aria-label="Toggle tournament mode"
                  className={"relative w-10 h-5 rounded-full transition-colors duration-200 shrink-0 ml-2 " + (tournamentConfig.enabled ? "bg-indigo-600" : "bg-gray-600")}
                >
                  <div className={"absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 " + (tournamentConfig.enabled ? "translate-x-5" : "translate-x-0.5")} />
                </button>
              </div>
              {tournamentConfig.enabled && (
                <>
                  <div>
                    <p className="text-[9px] text-gray-500 mb-1 uppercase tracking-wider">Rounds</p>
                    <div className="inline-flex rounded-full border border-gray-700 bg-gray-800/60 p-1 text-xs">
                      {[3, 5, 7].map(n => (
                        <button
                          key={n}
                          onClick={() => setTournamentConfig(prev => ({ ...prev, targetRounds: n }))}
                          className={"rounded-full px-3 py-1.5 font-semibold transition-colors duration-200 " + (tournamentConfig.targetRounds === n ? "bg-indigo-600 text-white" : "text-gray-300 hover:text-white hover:bg-gray-700/50")}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-500 mb-1 uppercase tracking-wider">Vote Timer</p>
                    <div className="inline-flex rounded-full border border-gray-700 bg-gray-800/60 p-1 text-xs">
                      {[30, 60, 90].map(s => (
                        <button
                          key={s}
                          onClick={() => setTournamentConfig(prev => ({ ...prev, votingTimerSeconds: s }))}
                          className={"rounded-full px-3 py-1.5 font-semibold transition-colors duration-200 " + (tournamentConfig.votingTimerSeconds === s ? "bg-indigo-600 text-white" : "text-gray-300 hover:text-white hover:bg-gray-700/50")}
                        >
                          {s}s
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2 px-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                    <div>
                      <p className="text-xs text-white font-medium leading-tight flex items-center gap-1">
                        <span className="text-amber-400">⚡</span> Blitz Mode
                      </p>
                      <p className="text-[9px] text-gray-500 leading-tight">Speed scoring: +1 fastest, -1 slowest</p>
                    </div>
                    <button
                      onClick={() => setTournamentConfig(prev => ({ ...prev, speedScoringEnabled: !prev.speedScoringEnabled }))}
                      aria-pressed={tournamentConfig.speedScoringEnabled}
                      aria-label="Toggle blitz mode"
                      className={"relative w-10 h-5 rounded-full transition-colors duration-200 shrink-0 ml-2 " + (tournamentConfig.speedScoringEnabled ? "bg-amber-500" : "bg-gray-600")}
                    >
                      <div className={"absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 " + (tournamentConfig.speedScoringEnabled ? "translate-x-5" : "translate-x-0.5")} />
                    </button>
                  </div>
                  <p className="text-[9px] text-gray-600 italic">Blitz Mode awards bonus points to the fastest submissions each round.</p>
                </>
              )}
            </div>
            <div className="p-4 border-t border-white/10 shrink-0 space-y-2">
              <button onClick={() => setSettingsOpen(false)} className="btn-primary py-3 text-base">Done</button>
              <button onClick={() => setTournamentConfig({ enabled: false, targetRounds: 3, votingTimerSeconds: 60, speedScoringEnabled: false })} className="w-full text-[10px] text-gray-500 hover:text-gray-300 transition-colors py-1">Reset to Defaults</button>
            </div>
          </div>
        </div>
      )}

      <div className="h-[76px] shrink-0" aria-hidden="true" />

      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0c0617]/90 backdrop-blur-xl border-t border-white/10 shadow-[0_-4px_20px_rgba(0,0,0,0.4)]">
        <div className="max-w-md mx-auto px-3 py-3">
          {isHost ? (
            <button onClick={startGame} disabled={players.length < 3} className="btn-primary py-3 text-base">
              {players.length < 3 ? "Need " + (3 - players.length) + " more player" + (3 - players.length === 1 ? "" : "s") : "Start Game!"}
            </button>
          ) : (
            <div className="btn-secondary py-3 text-base flex items-center justify-center gap-2 opacity-80">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <span className="text-sm text-indigo-100">Waiting for host to start...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

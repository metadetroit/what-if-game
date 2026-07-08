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
  const [settingsOpen, setSettingsOpen] = useState(false)

  const toggleTournamentEnabled = () => {
    setTournamentConfig(prev => ({ ...prev, enabled: !prev.enabled }))
  }

  const blitzLabel = tournamentConfig.speedScoringEnabled ? "ON" : "OFF"
  const summaryText = `Tournament: ${tournamentConfig.targetRounds} Rounds · ${tournamentConfig.votingTimerSeconds}s Votes · Blitz: ${blitzLabel}`

  const copyInviteLink = () => {
    const url = `${window.location.origin}?room=${roomCode}`
    if (typeof navigator !== "undefined" && typeof navigator.share === "function" && isMobile) {
      navigator.share({ title: "Fluke!", text: "Join my Fluke game!", url }).catch(() => {})
    } else {
      navigator.clipboard?.writeText(url)
      setNotice(noticeFor('Invite link copied!', 'success', 1500))
    }
  }

  return (
    <div className="game-container game-container--active min-h-screen bg-fluke">
      {/* Kick Confirmation Modal */}
      {kickConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4 backdrop-blur-md" role="dialog" aria-modal="true">
          <div ref={kickTrapRef} className="bg-gray-900 border border-red-500/30 rounded-3xl p-8 max-w-xs w-full text-center shadow-2xl">
            <p className="text-2xl font-black text-white mb-2 font-bubble">Kick Player?</p>
            <p className="text-gray-400 mb-6">Remove <span className="text-white font-bold">{kickConfirm.name}</span> from the room?</p>
            <div className="flex flex-col gap-3">
              <button onClick={() => { socketRef.current?.emit("host-kick-player", { playerId: kickConfirm.id }); setKickConfirm(null) }} className="btn-primary py-3 bg-red-600 border-red-500 shadow-red-900/20">Kick Player</button>
              <button onClick={() => setKickConfirm(null)} className="btn-secondary py-3">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Scrollable Content */}
      <div className="lobby-main-content">
        {/* Room Code Header */}
        <div className="room-code-display pt-8 pb-4">
          <p className="room-code-label">Room Code</p>
          <div className="flex flex-col items-center justify-center gap-4 mt-2">
            <h1 className="room-code-value">{roomCode}</h1>
            <div className="flex items-center gap-3">
              <button 
                onClick={copyInviteLink}
                className="hero-mini-pill px-6 py-2 flex items-center gap-2 font-bold"
              >
                <span>🔗</span> Copy Link
              </button>
              <button 
                onClick={() => {
                  const next = !soundMuted
                  writeSoundMuted(next)
                  setSoundMuted(next)
                }}
                className="hero-mini-pill w-12 h-10 flex items-center justify-center"
                title={soundMuted ? "Unmute" : "Mute"}
              >
                {soundMuted ? "🔇" : "🔊"}
              </button>
            </div>
          </div>
        </div>

        {/* Global Tournament Badge */}
        {tournamentConfig.enabled && (
          <div className="flex justify-center mb-8 px-4">
            <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-400/30 rounded-full px-4 py-2 backdrop-blur-xl">
              <span className="text-xs text-indigo-200 font-black tracking-widest uppercase">🏆 {summaryText}</span>
            </div>
          </div>
        )}

        {/* Lobby Content Grid */}
        <div className="lobby-grid px-4">
          {/* Players Section */}
          <section className="lobby-section">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xs uppercase tracking-[0.3em] font-black text-white/50">Players</h2>
              <span className="text-[10px] font-black bg-white/10 px-2 py-0.5 rounded-full text-white/60">{players.length} / 15</span>
            </div>
            <div className="lobby-card lobby-card--players">
              <div className="space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                {players.map((player, index) => (
                  <div 
                    key={player.id} 
                    className={`lobby-player-row ${player.id === socket?.id ? "lobby-player-row--me" : "lobby-player-row--other"}`}
                  >
                    <div className="w-8 h-8 shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-black shadow-lg">
                      {index + 1}
                    </div>
                    <span className={`text-sm flex-1 truncate font-bold ${player.id === socket?.id ? "text-indigo-200" : "text-white"}`}>
                      {player.name}{player.id === socket?.id && " (you)"}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {player.isHost && <span className="lobby-badge lobby-badge--host">Host</span>}
                      {player.role === 'spectator' && <span className="lobby-badge lobby-badge--spectator">Spectator</span>}
                      {isHost && player.id !== socket?.id && (
                        <button 
                          onClick={() => setKickConfirm({ id: player.id, name: player.name })}
                          className="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors"
                          title="Kick"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Settings Section */}
          <section className="lobby-section">
            <div className="px-2">
              <h2 className="text-xs uppercase tracking-[0.3em] font-black text-white/50">Game Rules</h2>
            </div>
            <div className="lobby-card space-y-6">
              {isHost ? (
                <div className="lobby-toggle-group">
                  <div className="lobby-toggle-item">
                    <div>
                      <p className="text-sm font-black text-white leading-tight">Anonymous Mode</p>
                      <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider mt-1">Hide names in results</p>
                    </div>
                    <button 
                      onClick={() => socketRef.current?.emit("toggle-anonymous")} 
                      className={`toggle-switch ${anonymousMode ? "toggle-switch--on" : ""}`}
                    >
                      <span />
                    </button>
                  </div>
                  <div className="lobby-toggle-item">
                    <div>
                      <p className="text-sm font-black text-white leading-tight">No Self-Reading</p>
                      <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider mt-1">Don't read your own content</p>
                    </div>
                    <button 
                      onClick={() => setNoSelfReading(!noSelfReading)} 
                      className={`toggle-switch ${noSelfReading ? "toggle-switch--on" : ""}`}
                    >
                      <span />
                    </button>
                  </div>
                  <div className="lobby-toggle-item bg-indigo-500/5 border-indigo-500/20">
                    <button 
                      onClick={() => setSettingsOpen(true)}
                      className="flex-1 text-left"
                    >
                      <p className="text-sm font-black text-white leading-tight">Tournament Mode</p>
                      <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider mt-1">
                        {tournamentConfig.enabled ? `${tournamentConfig.targetRounds} Rounds · Blitz ${blitzLabel}` : "Off"}
                      </p>
                    </button>
                    <button 
                      onClick={toggleTournamentEnabled} 
                      className={`toggle-switch ${tournamentConfig.enabled ? "toggle-switch--on" : ""}`}
                    >
                      <span />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="lobby-toggle-item opacity-80">
                    <p className="text-sm font-black text-white">Anonymous Results</p>
                    <span className="text-xs font-black text-indigo-300">{anonymousMode ? "ENABLED" : "DISABLED"}</span>
                  </div>
                  <div className="lobby-toggle-item opacity-80">
                    <p className="text-sm font-black text-white">Self-Reading</p>
                    <span className="text-xs font-black text-indigo-300">{noSelfReading ? "DISABLED" : "ENABLED"}</span>
                  </div>
                  <div className={`lobby-toggle-item ${tournamentConfig.enabled ? "bg-indigo-500/10 border-indigo-400/30" : "opacity-80"}`}>
                    <p className="text-sm font-black text-white">Tournament Mode</p>
                    <span className="text-xs font-black text-indigo-300">{tournamentConfig.enabled ? "ENABLED" : "DISABLED"}</span>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Tournament Settings Bottom Sheet */}
      {settingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-sm" onClick={() => setSettingsOpen(false)}>
          <div className="w-full max-w-md bg-gray-900 rounded-t-[3rem] border-t border-white/10 p-8 shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-8" />
            <h2 className="text-3xl font-black text-white mb-8 font-bubble text-center">Tournament Settings</h2>
            
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <label className="text-sm font-black text-white/60 uppercase tracking-widest">Rounds: {tournamentConfig.targetRounds}</label>
                </div>
                <input
                  type="range"
                  min="1" max="10" step="1"
                  value={tournamentConfig.targetRounds}
                  onChange={(e) => setTournamentConfig(prev => ({ ...prev, targetRounds: parseInt(e.target.value) }))}
                  className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <div className="space-y-4">
                <p className="text-sm font-black text-white/60 uppercase tracking-widest px-2 text-center">Voting Timer</p>
                <div className="flex justify-center gap-3">
                  {[30, 60, 90].map(s => (
                    <button
                      key={s}
                      onClick={() => setTournamentConfig(prev => ({ ...prev, votingTimerSeconds: s }))}
                      className={`px-6 py-3 rounded-2xl font-black text-sm transition-all ${tournamentConfig.votingTimerSeconds === s ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40" : "bg-white/5 text-white/40 hover:bg-white/10"}`}
                    >
                      {s}s
                    </button>
                  ))}
                </div>
              </div>

              <div className="lobby-toggle-item bg-amber-500/5 border-amber-500/20 py-5">
                <div>
                  <p className="text-lg font-black text-white leading-tight flex items-center gap-2">
                    <span className="text-xl">⚡</span> Blitz Mode
                  </p>
                  <p className="text-xs text-amber-200/50 font-bold uppercase tracking-wider mt-1">+1 fastest / -1 slowest</p>
                </div>
                <button 
                  onClick={() => setTournamentConfig(prev => ({ ...prev, speedScoringEnabled: !prev.speedScoringEnabled }))} 
                  className={`toggle-switch ${tournamentConfig.speedScoringEnabled ? "bg-amber-500" : ""}`}
                >
                  <span className={tournamentConfig.speedScoringEnabled ? "translate-x-6" : ""} />
                </button>
              </div>

              <button onClick={() => setSettingsOpen(false)} className="btn-primary py-4 text-lg">Apply Settings</button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Footer Actions */}
      <footer className="lobby-footer">
        <div className="lobby-footer-content">
          {isHost ? (
            <button 
              onClick={startGame} 
              disabled={players.length < 3} 
              className="btn-primary py-4 text-xl font-black tracking-widest shadow-fuchsia-500/20"
            >
              {players.length < 3 ? `NEED ${3 - players.length} MORE...` : "LAUNCH GAME! 🚀"}
            </button>
          ) : (
            <div className="btn-secondary py-4 text-lg flex items-center justify-center gap-3 opacity-90 cursor-default">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse shadow-[0_0_10px_rgba(129,140,248,0.5)]" />
              <span className="font-black text-indigo-100 tracking-widest uppercase text-sm">Waiting for host...</span>
            </div>
          )}
        </div>
      </footer>
    </div>
  )
}

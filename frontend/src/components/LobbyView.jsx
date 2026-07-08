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
    <div className="lobby-container bg-fluke">
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

      {/* Room Code Header */}
      <div className="lobby-header">
        <p className="lobby-room-label">Room Code</p>
        <h1 className="lobby-room-code">{roomCode}</h1>
        <div className="lobby-header-actions">
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
        {tournamentConfig.enabled && (
          <div className="lobby-tournament-badge">
            <span>🏆 {summaryText}</span>
          </div>
        )}
      </div>

      {/* Players Section */}
      <div className="lobby-section-label">
        <span>Players</span>
        <span className="text-[10px] font-black bg-white/10 px-2 py-0.5 rounded-full text-white/60">{players.length} / 15</span>
      </div>
      <div className="lobby-player-grid">
        {players.map((player, index) => (
          <div
            key={player.id}
            className={`lobby-player-card ${player.id === socket?.id ? "lobby-player-card--me" : "lobby-player-card--other"}`}
          >
            {isHost && player.id !== socket?.id && (
              <button
                onClick={() => setKickConfirm({ id: player.id, name: player.name })}
                className="lobby-kick-btn"
                title="Kick"
              >
                ✕
              </button>
            )}
            <div className="lobby-player-avatar">
              {index + 1}
            </div>
            <span className={`lobby-player-name ${player.id === socket?.id ? "text-indigo-200" : "text-white"}`}>
              {player.name}{player.id === socket?.id && " (you)"}
            </span>
            <div className="lobby-player-badges">
              {player.isHost && <span className="lobby-badge lobby-badge--host">Host</span>}
              {player.role === 'spectator' && <span className="lobby-badge lobby-badge--spectator">Spectator</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Game Rules Section */}
      <div className="lobby-section-label">
        <span>Game Rules</span>
      </div>
      <div className="lobby-settings-grid">
        {isHost ? (
          <>
            {/* Anonymous Mode */}
            <div className="lobby-setting-card">
              <div className="lobby-setting-header">
                <div>
                  <p className="lobby-setting-title">Anonymous Mode</p>
                  <p className="lobby-setting-desc mt-1">Hide names in results</p>
                </div>
                <button
                  onClick={() => socketRef.current?.emit("toggle-anonymous")}
                  className={`toggle-switch ${anonymousMode ? "toggle-switch--on" : ""}`}
                >
                  <span />
                </button>
              </div>
            </div>

            {/* No Self-Reading */}
            <div className="lobby-setting-card">
              <div className="lobby-setting-header">
                <div>
                  <p className="lobby-setting-title">No Self-Reading</p>
                  <p className="lobby-setting-desc mt-1">Don't read your own content</p>
                </div>
                <button
                  onClick={() => setNoSelfReading(!noSelfReading)}
                  className={`toggle-switch ${noSelfReading ? "toggle-switch--on" : ""}`}
                >
                  <span />
                </button>
              </div>
            </div>

            {/* Tournament Mode */}
            <div className="lobby-setting-card lobby-setting-card--tournament">
              <div className="lobby-setting-header">
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="flex-1 text-left"
                >
                  <p className="lobby-setting-title">Tournament Mode</p>
                  <p className="lobby-setting-desc mt-1 text-indigo-300">
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
          </>
        ) : (
          <>
            {/* Non-host: Anonymous */}
            <div className="lobby-setting-card">
              <div className="lobby-setting-header">
                <div>
                  <p className="lobby-setting-title">Anonymous Results</p>
                  <p className="lobby-setting-desc mt-1">Hide names in results</p>
                </div>
                <span className="lobby-setting-status">{anonymousMode ? "ENABLED" : "DISABLED"}</span>
              </div>
            </div>

            {/* Non-host: Self-Reading */}
            <div className="lobby-setting-card">
              <div className="lobby-setting-header">
                <div>
                  <p className="lobby-setting-title">Self-Reading</p>
                  <p className="lobby-setting-desc mt-1">Read your own content</p>
                </div>
                <span className="lobby-setting-status">{noSelfReading ? "DISABLED" : "ENABLED"}</span>
              </div>
            </div>

            {/* Non-host: Tournament */}
            <div className={`lobby-setting-card ${tournamentConfig.enabled ? "lobby-setting-card--tournament" : ""}`}>
              <div className="lobby-setting-header">
                <div>
                  <p className="lobby-setting-title">Tournament Mode</p>
                  <p className="lobby-setting-desc mt-1">
                    {tournamentConfig.enabled ? `${tournamentConfig.targetRounds} Rounds · Blitz ${blitzLabel}` : "Off"}
                  </p>
                </div>
                <span className="lobby-setting-status">{tournamentConfig.enabled ? "ENABLED" : "DISABLED"}</span>
              </div>
            </div>
          </>
        )}
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

              <div className="lobby-setting-card lobby-setting-card--blitz py-5">
                <div className="lobby-setting-header">
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
              </div>

              <button onClick={() => setSettingsOpen(false)} className="btn-primary py-4 text-lg">Apply Settings</button>
            </div>
          </div>
        </div>
      )}

      {/* Launch Bar */}
      <div className="lobby-launch-bar">
        <div className="lobby-launch-content">
          {isHost ? (
            <button
              onClick={startGame}
              disabled={players.length < 3}
              className="btn-primary py-4 text-xl font-black tracking-widest"
            >
              {players.length < 3 ? `NEED ${3 - players.length} MORE...` : "LAUNCH GAME! 🚀"}
            </button>
          ) : (
            <div className="lobby-waiting-indicator">
              <span className="lobby-waiting-dot" />
              <span className="lobby-waiting-text">Waiting for host...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

import React, { useEffect, useRef, useState } from "react"
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
  setTournamentConfig,
  connectionStatus,
  disconnectedPlayerMeta
}) {
  const isMobile = useIsMobile()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [leaveConfirm, setLeaveConfirm] = useState(false)
  const [disbandConfirm, setDisbandConfirm] = useState(false)
  const [showToast, setShowToast] = useState(null)

  const myId = socket?.id
  const isMe = (player) => player.id === myId

  const toggleTournamentEnabled = () => {
    const next = !tournamentConfig.enabled
    setTournamentConfig(prev => ({ ...prev, enabled: next }))
    if (isHost) {
      socketRef.current?.emit("update-lobby-settings", { tournamentConfig: { enabled: next } })
    }
  }

  const blitzLabel = tournamentConfig.speedScoringEnabled ? "ON" : "OFF"
  const tournamentSummary = `🏆 ${tournamentConfig.targetRounds} Rounds · ${tournamentConfig.votingTimerSeconds}s Votes · Blitz: ${blitzLabel}`

  const copyInviteLink = () => {
    const url = `https://playfluke.com?room=${roomCode}`
    if (typeof navigator !== "undefined" && typeof navigator.share === "function" && isMobile) {
      navigator.share({ title: "Fluke!", text: "Join my Fluke game!", url }).catch(() => {})
    } else {
      navigator.clipboard?.writeText(url)
      setNotice(noticeFor('Invite link copied!', 'success', 1500))
    }
  }

  const handleSoundToggle = () => {
    const next = !soundMuted
    writeSoundMuted(next)
    setSoundMuted(next)
  }

  const handleLeave = () => {
    socketRef.current?.emit("leave-room")
  }

  const handleDisband = () => {
    socketRef.current?.emit("disband-room")
  }

  const handleKick = () => {
    if (!kickConfirm) return
    socketRef.current?.emit("host-kick-player", { playerId: kickConfirm.id })
    setKickConfirm(null)
  }

  const handleSpectatorToggle = (player) => {
    if (!isHost || player.id === myId) return
    const isSpectator = player.role !== "spectator"
    socketRef.current?.emit("host-set-spectator", { playerId: player.id, isSpectator })
  }

  // Host transfer toast (triggered when a new host is detected from the roster)
  const previousHostIdRef = useRef(null)
  useEffect(() => {
    const currentHost = players.find(p => p.isHost)
    if (!currentHost) return
    if (previousHostIdRef.current && previousHostIdRef.current !== currentHost.id) {
      setShowToast(`Host transferred to ${currentHost.name}`)
      const t = setTimeout(() => setShowToast(null), 3000)
      previousHostIdRef.current = currentHost.id
      return () => clearTimeout(t)
    }
    previousHostIdRef.current = currentHost.id
  }, [players])

  // ─── Sub-components ───

  const RoomCodePill = () => (
    <div 
      className="lobby-room-code-pill"
      onClick={copyInviteLink} 
      role="button" 
      tabIndex={0}
    >
      <span className="lobby-room-code-pill__label">ROOM CODE</span>
      <span className="lobby-room-code-pill__code">{roomCode}</span>
    </div>
  )

  const RoomCodeHero = () => (
    <div className="lobby-room-hero" onClick={copyInviteLink} role="button" tabIndex={0}>
      <span className="lobby-room-hero__label">Room Code</span>
      <span className="lobby-room-hero__code">{roomCode}</span>
    </div>
  )

  const TournamentBadge = () => (
    tournamentConfig.enabled ? (
      <div className="lobby-tournament-badge">
        <span>{tournamentSummary}</span>
      </div>
    ) : null
  )

  const TournamentDetails = () => (
    <div className="lobby-glass p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="lobby-section-title">Tournament Details</span>
        <span className={`lobby-badge ${tournamentConfig.enabled ? "lobby-badge--host" : "lobby-badge--disconnected"}`}>
          {tournamentConfig.enabled ? "ON" : "OFF"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="lobby-glass p-2">
          <div className="text-lg font-black" style={{ color: "var(--color-orange)" }}>{tournamentConfig.targetRounds}</div>
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Rounds</div>
        </div>
        <div className="lobby-glass p-2">
          <div className="text-lg font-black" style={{ color: "var(--color-purple)" }}>{tournamentConfig.votingTimerSeconds}s</div>
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Votes</div>
        </div>
        <div className="lobby-glass p-2">
          <div className="text-lg font-black" style={{ color: tournamentConfig.speedScoringEnabled ? "var(--color-yellow)" : "var(--text-muted)" }}>{blitzLabel}</div>
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Blitz</div>
        </div>
      </div>
    </div>
  )

  const PlayerRow = ({ player }) => {
    const meta = disconnectedPlayerMeta[player.name]
    const [secondsLeft, setSecondsLeft] = useState(0)

    useEffect(() => {
      if (!meta) {
        setSecondsLeft(0)
        return
      }
      const update = () => {
        const remaining = Math.max(0, Math.ceil((meta.disconnectedAt + meta.graceMs - Date.now()) / 1000))
        setSecondsLeft(remaining)
        return remaining
      }
      update()
      const interval = setInterval(() => {
        if (update() <= 0) clearInterval(interval)
      }, 1000)
      return () => clearInterval(interval)
    }, [meta])

    const isReconnecting = meta !== undefined && secondsLeft > 0
    const isDisconnected = meta !== undefined && secondsLeft <= 0
    const isSpectator = player.role === "spectator"
    const className = `lobby-player-row ${isMe(player) ? "lobby-player-row--me" : ""} ${isReconnecting ? "lobby-player-row--reconnecting" : ""} ${isDisconnected ? "lobby-player-row--disconnected" : ""}`

    return (
      <div className={className}>
        {isHost && !isMe(player) && (
          <div className="lobby-player-row__actions">
            <button
              className={`lobby-player-row__spectator ${isSpectator ? "lobby-player-row__spectator--on" : ""}`}
              onClick={() => handleSpectatorToggle(player)}
              title={isSpectator ? "Remove spectator" : "Mark spectator"}
              aria-label={isSpectator ? "Remove spectator" : "Mark spectator"}
            >
              {isSpectator ? "S" : "S"}
            </button>
            <button
              className="lobby-player-row__kick"
              onClick={() => setKickConfirm({ id: player.id, name: player.name })}
              title="Kick player"
              aria-label="Kick player"
            >
              ✕
            </button>
          </div>
        )}
        <div className="lobby-player-row__name">
          {player.name}
          {isMe(player) && <span className="lobby-player-row__you"> (you)</span>}
        </div>
        <div className="lobby-player-row__meta">
          {player.isHost && <span className="lobby-badge lobby-badge--host">Host</span>}
          {isSpectator && <span className="lobby-badge lobby-badge--spectator">Spectator</span>}
          {isReconnecting && (
            <>
              <span className="lobby-badge lobby-badge--reconnecting">Reconnecting</span>
              <span className="lobby-player-row__countdown">{secondsLeft}s</span>
            </>
          )}
          {isDisconnected && <span className="lobby-badge lobby-badge--disconnected">Disconnected</span>}
        </div>
      </div>
    )
  }

  const Roster = () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="lobby-section-title">Players</span>
        <span className="lobby-section-meta">{players.length}/15</span>
      </div>
      <div className="lobby-player-grid">
        {players.map(player => (
          <PlayerRow key={player.id} player={player} />
        ))}
      </div>
    </div>
  )

  const Toggle = ({ value, onChange }) => (
    <button
      className={`lobby-toggle ${value ? "lobby-toggle--on" : ""}`}
      onClick={onChange}
      aria-checked={value}
      role="switch"
    >
      <span className="lobby-toggle__knob" />
    </button>
  )

  const GameSettingsPanel = () => (
    <div className="lobby-glass p-4 space-y-4">
      <div className="lobby-section-title">Game Settings</div>
      {isHost ? (
        <>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-bold text-sm text-white">Anonymous Mode</div>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Hide names in results</div>
            </div>
            <Toggle value={anonymousMode} onChange={() => socketRef.current?.emit("toggle-anonymous")} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-bold text-sm text-white">No Self-Reading</div>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Don't read your own content</div>
            </div>
            <Toggle value={noSelfReading} onChange={() => {
              const next = !noSelfReading
              setNoSelfReading(next)
              if (isHost) {
                socketRef.current?.emit("update-lobby-settings", { noSelfReading: next })
              }
            }} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-bold text-sm text-white">Tournament Mode</div>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                {tournamentConfig.enabled ? `${tournamentConfig.targetRounds} Rounds · Blitz ${blitzLabel}` : "Off"}
              </div>
            </div>
            <Toggle value={tournamentConfig.enabled} onChange={toggleTournamentEnabled} />
          </div>
          <button
            onClick={() => setSheetOpen(true)}
            className="w-full py-2.5 rounded-2xl font-bold text-sm transition-all duration-200"
            style={{ background: "var(--glass-fill-strong)", border: "1px solid var(--glass-border)", color: "var(--text-primary)" }}
          >
            Configure Tournament
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4">
            <div className="font-bold text-sm text-white">Anonymous Results</div>
            <span className="text-xs font-black" style={{ color: anonymousMode ? "var(--color-green)" : "var(--text-muted)" }}>{anonymousMode ? "ON" : "OFF"}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="font-bold text-sm text-white">Self-Reading</div>
            <span className="text-xs font-black" style={{ color: noSelfReading ? "var(--text-muted)" : "var(--color-green)" }}>{noSelfReading ? "OFF" : "ON"}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="font-bold text-sm text-white">Tournament Mode</div>
            <span className="text-xs font-black" style={{ color: tournamentConfig.enabled ? "var(--color-green)" : "var(--text-muted)" }}>{tournamentConfig.enabled ? "ON" : "OFF"}</span>
          </div>
          {tournamentConfig.enabled && <TournamentDetails />}
        </>
      )}
    </div>
  )

  const TournamentSettingsSheet = () => (
    <div className="lobby-sheet" onClick={() => setSheetOpen(false)} role="dialog" aria-modal="true">
      <div className="lobby-sheet__panel" onClick={e => e.stopPropagation()}>
        <div className="lobby-sheet__handle" />
        <h2 className="text-2xl font-black text-center mb-6">Tournament Settings</h2>
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Rounds</span>
              <span className="font-black text-lg" style={{ color: "var(--color-orange)" }}>{tournamentConfig.targetRounds}</span>
            </div>
            <input
              type="range"
              min="1" max="10" step="1"
              value={tournamentConfig.targetRounds}
              onChange={(e) => {
                const val = parseInt(e.target.value)
                setTournamentConfig(prev => ({ ...prev, targetRounds: val }))
                if (isHost) {
                  socketRef.current?.emit("update-lobby-settings", { tournamentConfig: { targetRounds: val } })
                }
              }}
              className="lobby-slider"
            />
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-center mb-3" style={{ color: "var(--text-muted)" }}>Voting Timer</div>
            <div className="flex justify-center gap-3">
              {[30, 60, 90].map(s => (
                <button
                  key={s}
                  onClick={() => {
                    setTournamentConfig(prev => ({ ...prev, votingTimerSeconds: s }))
                    if (isHost) {
                      socketRef.current?.emit("update-lobby-settings", { tournamentConfig: { votingTimerSeconds: s } })
                    }
                  }}
                  className={`lobby-segment ${tournamentConfig.votingTimerSeconds === s ? "lobby-segment--selected" : ""}`}
                >
                  {s}s
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 p-4 rounded-2xl" style={{ background: "rgba(253, 224, 71, 0.08)", border: "1px solid rgba(253, 224, 71, 0.25)" }}>
            <div>
              <div className="font-bold text-sm text-white">Blitz Mode</div>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>+1 fastest · -1 slowest</div>
            </div>
            <Toggle value={tournamentConfig.speedScoringEnabled} onChange={() => {
              const next = !tournamentConfig.speedScoringEnabled
              setTournamentConfig(prev => ({ ...prev, speedScoringEnabled: next }))
              if (isHost) {
                socketRef.current?.emit("update-lobby-settings", { tournamentConfig: { speedScoringEnabled: next } })
              }
            }} />
          </div>
          <button onClick={() => setSheetOpen(false)} className="lobby-cta">Apply</button>
        </div>
      </div>
    </div>
  )

  const KickConfirmModal = () => (
    <div className="lobby-modal" role="dialog" aria-modal="true">
      <div ref={kickTrapRef} className="lobby-modal__card">
        <div className="lobby-modal__title">Kick Player?</div>
        <div className="lobby-modal__body">Remove <strong className="text-white">{kickConfirm.name}</strong> from the room?</div>
        <button onClick={handleKick} className="lobby-modal__destructive">Kick Player</button>
        <button onClick={() => setKickConfirm(null)} className="lobby-modal__secondary">Cancel</button>
      </div>
    </div>
  )

  const LeaveConfirmModal = () => (
    <div className="lobby-modal" role="dialog" aria-modal="true" onClick={() => setLeaveConfirm(false)}>
      <div className="lobby-modal__card" onClick={e => e.stopPropagation()}>
        <div className="lobby-modal__title">Leave Room?</div>
        <div className="lobby-modal__body">You will exit the lobby and return to the welcome screen.</div>
        <button onClick={handleLeave} className="lobby-modal__destructive">Leave Room</button>
        <button onClick={() => setLeaveConfirm(false)} className="lobby-modal__secondary">Stay</button>
      </div>
    </div>
  )

  const DisbandConfirmModal = () => (
    <div className="lobby-modal" role="dialog" aria-modal="true" onClick={() => setDisbandConfirm(false)}>
      <div className="lobby-modal__card" onClick={e => e.stopPropagation()}>
        <div className="lobby-modal__title">Disband Room?</div>
        <div className="lobby-modal__body">This will end the game for everyone and delete the room. This cannot be undone.</div>
        <button onClick={handleDisband} className="lobby-modal__destructive">Disband Room</button>
        <button onClick={() => setDisbandConfirm(false)} className="lobby-modal__secondary">Cancel</button>
      </div>
    </div>
  )

  const StartButton = () => (
    <button
      onClick={startGame}
      disabled={players.length < 3}
      className="lobby-cta"
    >
      {players.length < 3 ? `Need ${3 - players.length} more...` : "Start Game"}
    </button>
  )

  const WaitingIndicator = () => (
    <div className="lobby-waiting">
      <span className="lobby-waiting__dot" />
      <span className="lobby-waiting__text">Waiting for host to start...</span>
    </div>
  )

  const ActionFooter = () => (
    <div className="flex items-center justify-center gap-4 py-2">
      {isHost ? (
        <button onClick={() => setDisbandConfirm(true)} className="lobby-link">Disband Room</button>
      ) : (
        <button onClick={() => setLeaveConfirm(true)} className="lobby-link">Leave Room</button>
      )}
    </div>
  )

  const TopBar = () => (
    <div className="lobby-top-bar">
      <div className="lobby-logo font-bubble glow-title">
        <span style={{ color: "#c026d3" }}>F</span>
        <span style={{ color: "#f97316" }}>l</span>
        <span style={{ color: "#facc15" }}>u</span>
        <span style={{ color: "#f43f5e" }}>k</span>
        <span style={{ color: "#a855f7" }}>e</span>
        <span style={{ color: "#facc15" }} className="ml-1 animate-pop-wiggle">!</span>
      </div>
      <RoomCodePill />
      <div className="flex items-center gap-2">
        <button onClick={copyInviteLink} className="lobby-icon-btn text-sm font-bold px-4" style={{ width: "auto" }}>Copy Link</button>
        <button onClick={handleSoundToggle} className="lobby-icon-btn" title={soundMuted ? "Unmute" : "Mute"} aria-label={soundMuted ? "Unmute" : "Mute"}>
          {soundMuted ? "🔇" : "🔊"}
        </button>
      </div>
    </div>
  )

  // ─── Mobile Layout ───
  const MobileLayout = () => (
    <div className="flex flex-col h-full">
      <TopBar />
      <div className="lobby-scroll px-4 pb-4 space-y-4">
        <RoomCodeHero />
        <TournamentBadge />
        <Roster />
        <GameSettingsPanel />
      </div>
      <div className="px-4 py-3 z-40" style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(12px)", borderTop: "1px solid var(--glass-border)" }}>
        {isHost ? <StartButton /> : <WaitingIndicator />}
        <div className="lobby-cta-hint">
          {players.length < 3 ? "Need at least 3 players to start" : "Ready when you are!"}
        </div>
        <ActionFooter />
      </div>
    </div>
  )

  // ─── Desktop Layout ───
  const DesktopLayout = () => (
    <div className="flex flex-col">
      <TopBar />
      <div className="lobby-desktop-grid">
        <div className="lobby-desktop-left lobby-scroll space-y-4 pr-2">
          <TournamentBadge />
          <Roster />
        </div>
        <div className="lobby-desktop-right space-y-4">
          <div className="flex-1 lobby-scroll space-y-4 pl-2">
            <GameSettingsPanel />
            {tournamentConfig.enabled && isHost && <TournamentDetails />}
          </div>
          <div className="pt-2">
            {isHost ? <StartButton /> : <WaitingIndicator />}
            <div className="lobby-cta-hint">
              {players.length < 3 ? "Need at least 3 players to start" : "Ready when you are!"}
            </div>
            <ActionFooter />
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="lobby-root">
      <div className="lobby-glow" />
      {isMobile ? <MobileLayout /> : <DesktopLayout />}
      {sheetOpen && <TournamentSettingsSheet />}
      {kickConfirm && <KickConfirmModal />}
      {leaveConfirm && <LeaveConfirmModal />}
      {disbandConfirm && <DisbandConfirmModal />}
      {showToast && <div className="lobby-toast">{showToast}</div>}
    </div>
  )
}

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
  disconnectedPlayerMeta,
  leaveConfirm,
  setLeaveConfirm,
  disbandConfirm,
  setDisbandConfirm
}) {
  const isMobile = useIsMobile()
  const [gameSettingsOpen, setGameSettingsOpen] = useState(false)
  const [infoExpanded, setInfoExpanded] = useState(false)
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
        <div className="lobby-player-row__content">
          <span className="lobby-player-row__name truncate">{player.name}</span>
          <div className="lobby-player-row__badges">
            {isMe(player) && <span className="lobby-badge lobby-badge--you">you</span>}
            {player.isHost && <span className="lobby-badge lobby-badge--host">Host</span>}
            {isSpectator && <span className="lobby-badge lobby-badge--spectator">Spectator</span>}
            {isReconnecting && <span className="lobby-badge lobby-badge--reconnecting">Reconnecting</span>}
            {isDisconnected && <span className="lobby-badge lobby-badge--disconnected">Disconnected</span>}
          </div>
        </div>
        {isHost && !isMe(player) && (
          <div className="lobby-player-row__actions">
            <button
              className={`lobby-player-row__spectator ${isSpectator ? "lobby-player-row__spectator--on" : ""}`}
              onClick={() => handleSpectatorToggle(player)}
              title={isSpectator ? "Remove spectator" : "Mark spectator"}
              aria-label={isSpectator ? "Remove spectator" : "Mark spectator"}
            >
              S
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
        {isReconnecting && <span className="lobby-player-row__countdown">{secondsLeft}s</span>}
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

  const GameSettingsSummary = () => {
    const chips = (
      <>
        <span className="lobby-house-rules__chip">Anonymous: {anonymousMode ? "ON" : "OFF"}</span>
        <span className="lobby-house-rules__chip">No Self-Reading: {noSelfReading ? "ON" : "OFF"}</span>
        <span className="lobby-house-rules__chip">Tournament: {tournamentConfig.enabled ? "ON" : "OFF"}</span>
      </>
    )

    return (
      <div className="lobby-house-rules">
        <div className="lobby-house-rules__main">
          <div className="lobby-house-rules__title-row">
            <div className="lobby-house-rules__icon">
              <span aria-hidden="true">⚙</span>
            </div>
            <span className="lobby-house-rules__label">Game Settings</span>
          </div>
          <div className="lobby-house-rules__chips">
            {chips}
          </div>
        </div>
        {isHost ? (
          <button
            className="lobby-house-rules__manage"
            onClick={(e) => {
              e.stopPropagation()
              setGameSettingsOpen(true)
            }}
            aria-label="Manage game settings"
          >
            Manage
            <span aria-hidden="true">›</span>
          </button>
        ) : tournamentConfig.enabled ? (
          <button
            className="lobby-house-rules__expand"
            onClick={() => setInfoExpanded(e => !e)}
            aria-expanded={infoExpanded}
            aria-label={infoExpanded ? "Hide tournament details" : "Show tournament details"}
          >
            {infoExpanded ? "▲" : "▼"}
          </button>
        ) : null}
        {infoExpanded && !isHost && tournamentConfig.enabled && (
          <div className="lobby-house-rules__info">
            <span>{tournamentConfig.targetRounds} Rounds</span>
            <span>{tournamentConfig.votingTimerSeconds}s Votes</span>
            <span>Blitz: {tournamentConfig.speedScoringEnabled ? "ON" : "OFF"}</span>
          </div>
        )}
      </div>
    )
  }

  const GameSettingsDrawer = () => {
    const panelRef = useRef(null)
    const closeBtnRef = useRef(null)
    const touchStartY = useRef(null)

    const handleTouchStart = (e) => {
      touchStartY.current = e.touches?.[0]?.clientY ?? null
    }
    const handleTouchEnd = (e) => {
      if (touchStartY.current == null || !isMobile) return
      const endY = e.changedTouches?.[0]?.clientY ?? touchStartY.current
      const delta = endY - touchStartY.current
      if (delta > 60) setGameSettingsOpen(false)
      touchStartY.current = null
    }

    useEffect(() => {
      if (!gameSettingsOpen) return
      const active = document.activeElement
      closeBtnRef.current?.focus()

      const handleKey = (e) => {
        if (e.key === "Escape") {
          e.preventDefault()
          setGameSettingsOpen(false)
          return
        }
        if (e.key === "Tab" && panelRef.current) {
          const focusable = Array.from(panelRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )).filter(el => !el.disabled)
          if (focusable.length === 0) return
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault()
            last.focus()
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }

      document.addEventListener("keydown", handleKey)
      return () => {
        document.removeEventListener("keydown", handleKey)
        if (active && typeof active.focus === "function") active.focus()
      }
    }, [gameSettingsOpen])

    if (!gameSettingsOpen) return null

    const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

    return (
      <div
        className={`lobby-drawer ${reducedMotion ? "lobby-drawer--no-motion" : ""}`}
        onClick={(e) => {
          e.stopPropagation()
          e.nativeEvent.stopImmediatePropagation()
          setGameSettingsOpen(false)
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-settings-title"
      >
        <div
          ref={panelRef}
          className={`lobby-drawer__panel ${isMobile ? "lobby-drawer__panel--bottom" : "lobby-drawer__panel--right"}`}
          onClick={e => e.stopPropagation()}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="lobby-drawer__header">
            <h2 id="game-settings-title" className="lobby-drawer__title">Game Settings</h2>
            <button
              ref={closeBtnRef}
              className="lobby-drawer__close"
              onClick={() => setGameSettingsOpen(false)}
              aria-label="Close game settings"
            >
              ✕
            </button>
          </div>

          <div className="lobby-drawer__content">
            <div className="lobby-drawer__row">
              <div className="lobby-drawer__label">
                <div className="lobby-drawer__label-title">Anonymous Mode</div>
                <div className="lobby-drawer__label-sub">Hide names in results</div>
              </div>
              <Toggle value={anonymousMode} onChange={() => socketRef.current?.emit("toggle-anonymous")} />
            </div>

            <div className="lobby-drawer__row">
              <div className="lobby-drawer__label">
                <div className="lobby-drawer__label-title">No Self-Reading</div>
                <div className="lobby-drawer__label-sub">Don't read your own content</div>
              </div>
              <Toggle value={noSelfReading} onChange={() => {
                const next = !noSelfReading
                setNoSelfReading(next)
                if (isHost) socketRef.current?.emit("update-lobby-settings", { noSelfReading: next })
              }} />
            </div>

            <div className="lobby-drawer__row">
              <div className="lobby-drawer__label">
                <div className="lobby-drawer__label-title">Tournament Mode</div>
                <div className="lobby-drawer__label-sub">Enable rounds & voting</div>
              </div>
              <Toggle value={tournamentConfig.enabled} onChange={toggleTournamentEnabled} />
            </div>

            {tournamentConfig.enabled && (
              <div className="lobby-drawer__nested">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="lobby-drawer__nested-label">Rounds</span>
                    <span className="lobby-drawer__nested-value">{tournamentConfig.targetRounds}</span>
                  </div>
                  <input
                    type="range"
                    min="1" max="10" step="1"
                    value={tournamentConfig.targetRounds}
                    onChange={(e) => {
                      const val = parseInt(e.target.value)
                      setTournamentConfig(prev => ({ ...prev, targetRounds: val }))
                      if (isHost) socketRef.current?.emit("update-lobby-settings", { tournamentConfig: { targetRounds: val } })
                    }}
                    className="lobby-slider"
                  />
                </div>

                <div>
                  <div className="lobby-drawer__nested-label lobby-drawer__nested-label--center">Voting Timer</div>
                  <div className="flex justify-center gap-3">
                    {[30, 60, 90].map(s => (
                      <button
                        key={s}
                        onClick={() => {
                          setTournamentConfig(prev => ({ ...prev, votingTimerSeconds: s }))
                          if (isHost) socketRef.current?.emit("update-lobby-settings", { tournamentConfig: { votingTimerSeconds: s } })
                        }}
                        className={`lobby-segment ${tournamentConfig.votingTimerSeconds === s ? "lobby-segment--selected" : ""}`}
                      >
                        {s}s
                      </button>
                    ))}
                  </div>
                </div>

                <div className="lobby-drawer__row lobby-drawer__row--nested">
                  <div className="lobby-drawer__label">
                    <div className="lobby-drawer__label-title">Blitz Mode</div>
                    <div className="lobby-drawer__label-sub">+1 fastest · -1 slowest</div>
                  </div>
                  <Toggle value={tournamentConfig.speedScoringEnabled} onChange={() => {
                    const next = !tournamentConfig.speedScoringEnabled
                    setTournamentConfig(prev => ({ ...prev, speedScoringEnabled: next }))
                    if (isHost) socketRef.current?.emit("update-lobby-settings", { tournamentConfig: { speedScoringEnabled: next } })
                  }} />
                </div>
              </div>
            )}
          </div>

          <div className="lobby-drawer__footer">
            <button onClick={() => setGameSettingsOpen(false)} className="lobby-cta">Apply & Close</button>
          </div>
        </div>
      </div>
    )
  }

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
      <div className="lobby-scroll px-4 pb-6 space-y-4">
        <TournamentBadge />
        <Roster />
        <HouseRulesSummary />
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
          <div className="flex-1 lobby-scroll space-y-4 pl-2 pb-6">
            <GameSettingsSummary />
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
      {gameSettingsOpen && <GameSettingsDrawer />}
      {kickConfirm && <KickConfirmModal />}
      {leaveConfirm && <LeaveConfirmModal />}
      {disbandConfirm && <DisbandConfirmModal />}
      {showToast && <div className="lobby-toast">{showToast}</div>}
    </div>
  )
}

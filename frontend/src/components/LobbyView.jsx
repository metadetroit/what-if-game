import React, { memo, useEffect, useRef, useState } from "react"
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

function Toggle({ value, onChange }) {
  return (
    <button
      className={`lobby-toggle ${value ? "lobby-toggle--on" : ""}`}
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }}
      aria-checked={value}
      role="switch"
    >
      <span className="lobby-toggle__knob" />
    </button>
  )
}

function RoomCodePill({ roomCode, onClick }) {
  return (
    <div
      className="lobby-room-code-pill"
      onClick={onClick}
      role="button"
      tabIndex={0}
      title="Click to copy invite link"
    >
      <span className="lobby-room-code-pill__label">ROOM CODE</span>
      <span className="lobby-room-code-pill__code">{roomCode}</span>
    </div>
  )
}

function PlayerRow({ player, meta, isHost, myId, onSpectatorToggle, onKick }) {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [badgeHidden, setBadgeHidden] = useState(false)

  useEffect(() => {
    if (!meta) {
      setSecondsLeft(0)
      setBadgeHidden(false)
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
    const badgeTimer = setTimeout(() => setBadgeHidden(true), 2000)
    return () => { clearInterval(interval); clearTimeout(badgeTimer) }
  }, [meta])

  const isMe = player.id === myId
  const isReconnecting = meta !== undefined && secondsLeft > 0
  const isDisconnected = meta !== undefined && secondsLeft <= 0
  const isSpectator = player.role === "spectator"
  const className = `lobby-player-row ${isMe ? "lobby-player-row--me" : ""} ${isReconnecting ? "lobby-player-row--reconnecting" : ""} ${isDisconnected ? "lobby-player-row--disconnected" : ""}`

  return (
    <div className={className}>
      <div className="lobby-player-row__content">
        <span className="lobby-player-row__name truncate">{player.name}</span>
        <div className="lobby-player-row__badges">
          {isMe && <span className="lobby-badge lobby-badge--you">you</span>}
          {player.isHost && <span className="lobby-badge lobby-badge--host">Host</span>}
          {isSpectator && <span className="lobby-badge lobby-badge--spectator">Spectator</span>}
          {isReconnecting && !badgeHidden && <span className="lobby-badge lobby-badge--reconnecting">Reconnecting</span>}
          {isDisconnected && !badgeHidden && <span className="lobby-badge lobby-badge--disconnected">Disconnected</span>}
        </div>
      </div>
      {isHost && !isMe && (
        <div className="lobby-player-row__actions">
          <button
            className={`lobby-player-row__spectator ${isSpectator ? "lobby-player-row__spectator--on" : ""}`}
            onClick={() => onSpectatorToggle(player)}
            title={isSpectator ? "Remove spectator" : "Mark spectator"}
            aria-label={isSpectator ? "Remove spectator" : "Mark spectator"}
          >
            S
          </button>
          <button
            className="lobby-player-row__kick"
            onClick={() => onKick(player)}
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

function LobbyStatusBadge({ anonymousMode, noSelfReading, tournamentConfig }) {
  const rules = []
  if (anonymousMode) rules.push("Anonymous")
  if (noSelfReading) rules.push("No Self-Reading")
  if (tournamentConfig.enabled) {
    rules.push(`${tournamentConfig.targetRounds} Rounds`)
    rules.push(`${tournamentConfig.votingTimerSeconds}s`)
    if (tournamentConfig.speedScoringEnabled) rules.push("BLITZ")
  }

  if (rules.length === 0) return null

  return (
    <div className="lobby-status-badge">
      <span className="lobby-status-badge__text">
        {rules.join(" · ")}
      </span>
    </div>
  )
}

function StartButton({ players, onStart }) {
  return (
    <button
      onClick={onStart}
      disabled={players.length < 3}
      className="lobby-cta"
    >
      {players.length < 3 ? `Need ${3 - players.length} more...` : "Start Game"}
    </button>
  )
}

function WaitingIndicator() {
  return (
    <div className="lobby-waiting">
      <span className="lobby-waiting__dot" />
      <span className="lobby-waiting__text">Waiting for host to start...</span>
    </div>
  )
}

function TopBar({ roomCode, onCopyRoomCode, onOpenSettings }) {
  return (
    <div className="lobby-top-bar">
      <div className="lobby-logo font-bubble glow-title">
        <span style={{ color: "#c026d3" }}>F</span>
        <span style={{ color: "#f97316" }}>l</span>
        <span style={{ color: "#facc15" }}>u</span>
        <span style={{ color: "#f43f5e" }}>k</span>
        <span style={{ color: "#a855f7" }}>e</span>
        <span style={{ color: "#facc15" }} className="ml-1 animate-pop-wiggle">!</span>
      </div>
      <div className="lobby-top-bar__center">
        <RoomCodePill roomCode={roomCode} onClick={onCopyRoomCode} />
      </div>
      <div className="lobby-top-bar__actions">
        <button
          onClick={onOpenSettings}
          className="lobby-icon-btn lobby-icon-btn--gear"
          aria-label="Settings"
        >
          <span aria-hidden="true" className="text-xl">⚙️</span>
        </button>
      </div>
    </div>
  )
}

function KickConfirmModal({ kickConfirm, kickTrapRef, onKick, onCancel }) {
  return (
    <div className="lobby-modal" role="dialog" aria-modal="true">
      <div ref={kickTrapRef} className="lobby-modal__card">
        <div className="lobby-modal__title">Kick Player?</div>
        <div className="lobby-modal__body">Remove <strong className="text-white">{kickConfirm.name}</strong> from the room?</div>
        <button onClick={onKick} className="lobby-modal__destructive">Kick Player</button>
        <button onClick={onCancel} className="lobby-modal__secondary">Cancel</button>
      </div>
    </div>
  )
}

function GameSettingsDrawer({
  open,
  onClose,
  isMobile,
  isHost,
  soundMuted,
  onSoundToggle,
  prefillWhatIf,
  onPrefillToggle,
  socketRef,
  tournamentConfig,
  setTournamentConfig,
  noSelfReading,
  onNoSelfReadingToggle,
  anonymousMode,
  onToggleAnonymous,
}) {
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
    if (delta > 60) onClose()
    touchStartY.current = null
  }

  useEffect(() => {
    if (!open) return
    const active = document.activeElement
    closeBtnRef.current?.focus()

    const handleKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
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
  }, [open, onClose])

  if (!open) return null

  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

  return (
    <div
      className={`lobby-drawer ${reducedMotion ? "lobby-drawer--no-motion" : ""}`}
      onClick={(e) => {
        e.stopPropagation()
        e.nativeEvent.stopImmediatePropagation()
        onClose()
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
            onClick={onClose}
            aria-label="Close game settings"
          >
            ✕
          </button>
        </div>

        <div className="lobby-drawer__content">
          <div className="lobby-drawer__row">
            <div className="lobby-drawer__label">
              <div className="lobby-drawer__label-title">Sound Effects</div>
              <div className="lobby-drawer__label-sub">Play game sounds</div>
            </div>
            <Toggle value={!soundMuted} onChange={onSoundToggle} />
          </div>

          <div className="lobby-drawer__row">
            <div className="lobby-drawer__label">
              <div className="lobby-drawer__label-title">Pre-fill "What if..."</div>
              <div className="lobby-drawer__label-sub">Start with sample text</div>
            </div>
            <Toggle value={prefillWhatIf} onChange={onPrefillToggle} />
          </div>

          {isHost && (
            <>
              <div className="lobby-drawer__divider" />
              <h3 className="lobby-drawer__section-title">Host Options</h3>

              <div className="lobby-drawer__row">
                <div className="lobby-drawer__label">
                  <div className="lobby-drawer__label-title">Anonymous Mode</div>
                  <div className="lobby-drawer__label-sub">Hide names in results</div>
                </div>
                <Toggle value={anonymousMode} onChange={onToggleAnonymous} />
              </div>

              <div className="lobby-drawer__row">
                <div className="lobby-drawer__label">
                  <div className="lobby-drawer__label-title">No Self-Reading</div>
                  <div className="lobby-drawer__label-sub">Don't read your own content</div>
                </div>
                <Toggle value={noSelfReading} onChange={onNoSelfReadingToggle} />
              </div>

              <div className="lobby-drawer__row">
                <div className="lobby-drawer__label">
                  <div className="lobby-drawer__label-title">Tournament Mode</div>
                  <div className="lobby-drawer__label-sub">Enable rounds & voting</div>
                </div>
                <Toggle value={tournamentConfig.enabled} onChange={() => {
                  const next = !tournamentConfig.enabled
                  setTournamentConfig(prev => ({ ...prev, enabled: next }))
                  if (isHost) socketRef.current?.emit("update-lobby-settings", { tournamentConfig: { enabled: next } })
                }} />
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
            </>
          )}

        </div>

        <div className="lobby-drawer__footer">
          <button onClick={onClose} className="lobby-cta">Apply & Close</button>
        </div>
      </div>
    </div>
  )
}

function LobbyView({
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
  prefillWhatIf,
  setPrefillWhatIf,
  setPrefillWhatIfStorage
}) {
  const isMobile = useIsMobile()
  const [gameSettingsOpen, setGameSettingsOpen] = useState(false)
  const [showToast, setShowToast] = useState(null)

  const myId = socket?.id

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

  const handleKickRequest = (player) => setKickConfirm({ id: player.id, name: player.name })

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

  const onPrefillToggle = () => {
    const next = !prefillWhatIf
    setPrefillWhatIf(next)
    setPrefillWhatIfStorage(next)
  }

  const onNoSelfReadingToggle = () => {
    const next = !noSelfReading
    setNoSelfReading(next)
    if (isHost) socketRef.current?.emit("update-lobby-settings", { noSelfReading: next })
  }

  const onToggleAnonymous = () => {
    socketRef.current?.emit("toggle-anonymous")
  }

  return (
    <div className="lobby-root">
      <div className="lobby-glow" />

      {isMobile ? (
        <div className="flex flex-col h-full overflow-hidden">
          <TopBar roomCode={roomCode} onCopyRoomCode={copyInviteLink} onOpenSettings={() => setGameSettingsOpen(true)} />
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            <LobbyStatusBadge anonymousMode={anonymousMode} noSelfReading={noSelfReading} tournamentConfig={tournamentConfig} />
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="lobby-section-title">Players</span>
                <span className="lobby-section-meta">{players.length}/15</span>
              </div>
              <div className="lobby-player-grid">
                {players.map(player => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    meta={disconnectedPlayerMeta[player.name]}
                    isHost={isHost}
                    myId={myId}
                    onSpectatorToggle={handleSpectatorToggle}
                    onKick={handleKickRequest}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="px-4 py-4 z-40 bg-black/40 backdrop-blur-xl border-t border-white/10">
            {isHost ? <StartButton players={players} onStart={startGame} /> : <WaitingIndicator />}
          </div>
        </div>
      ) : (
        <div className="flex flex-col h-full overflow-hidden max-w-2xl mx-auto w-full">
          <TopBar roomCode={roomCode} onCopyRoomCode={copyInviteLink} onOpenSettings={() => setGameSettingsOpen(true)} />
          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
            <LobbyStatusBadge anonymousMode={anonymousMode} noSelfReading={noSelfReading} tournamentConfig={tournamentConfig} />
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="lobby-section-title">Players</span>
                <span className="lobby-section-meta">{players.length}/15</span>
              </div>
              <div className="lobby-player-grid">
                {players.map(player => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    meta={disconnectedPlayerMeta[player.name]}
                    isHost={isHost}
                    myId={myId}
                    onSpectatorToggle={handleSpectatorToggle}
                    onKick={handleKickRequest}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="px-4 py-6 z-40 bg-black/40 backdrop-blur-xl border-t border-white/10 rounded-t-3xl">
            {isHost ? <StartButton players={players} onStart={startGame} /> : <WaitingIndicator />}
          </div>
        </div>
      )}

      <GameSettingsDrawer
        open={gameSettingsOpen}
        onClose={() => setGameSettingsOpen(false)}
        isMobile={isMobile}
        isHost={isHost}
        soundMuted={soundMuted}
        onSoundToggle={handleSoundToggle}
        prefillWhatIf={prefillWhatIf}
        onPrefillToggle={onPrefillToggle}
        socketRef={socketRef}
        tournamentConfig={tournamentConfig}
        setTournamentConfig={setTournamentConfig}
        noSelfReading={noSelfReading}
        onNoSelfReadingToggle={onNoSelfReadingToggle}
        anonymousMode={anonymousMode}
        onToggleAnonymous={onToggleAnonymous}
      />

      {kickConfirm && <KickConfirmModal kickConfirm={kickConfirm} kickTrapRef={kickTrapRef} onKick={handleKick} onCancel={() => setKickConfirm(null)} />}
      {showToast && <div className="lobby-toast">{showToast}</div>}
    </div>
  )
}

export default memo(LobbyView)

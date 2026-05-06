import React, { useState, useEffect, useCallback, useRef } from "react"
import { io } from "socket.io-client"

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin

// Notice channel: tone is "success" | "info" | "warn" — not the same as a hard error.
function noticeFor(message, tone = "info", durationMs = 3000) {
  return { message, tone, expiresAt: Date.now() + durationMs }
}

function draftKey(roomCode, phase) {
  return `whatif-draft:${roomCode}:${phase}`
}

function App() {
  const [socket, setSocket] = useState(null)
  const [gameState, setGameState] = useState("welcome")
  const [playerName, setPlayerName] = useState("")
  const [roomCode, setRoomCode] = useState("")
  const [players, setPlayers] = useState([])
  const [isHost, setIsHost] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState(null)
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [assignedQuestion, setAssignedQuestion] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [progress, setProgress] = useState({ submitted: 0, total: 0 })
  const [currentTurn, setCurrentTurn] = useState(null)
  const [gameStats, setGameStats] = useState({ round: 0, total: 0 })
  const [hasRead, setHasRead] = useState(false)
  const [gameSummary, setGameSummary] = useState(null)
  const [anonymousMode, setAnonymousMode] = useState(false)
  const [reconnectInfo, setReconnectInfo] = useState(null)
  const [playerStatuses, setPlayerStatuses] = useState([])
  const [forceConfirm, setForceConfirm] = useState(false)
  const [kickConfirm, setKickConfirm] = useState(null) // { id, name } when host wants to confirm a kick
  const [reconnectPrompt, setReconnectPrompt] = useState(null) // { roomCode, playerName } on page-load reconnect

  // Refs survive remounts/state-update batches
  const reconnectAttemptedRef = useRef(false)
  const roomCodeRef = useRef("")
  const gameStateRef = useRef("welcome")

  useEffect(() => { roomCodeRef.current = roomCode }, [roomCode])
  useEffect(() => { gameStateRef.current = gameState }, [gameState])

  // Auto-clear notice
  useEffect(() => {
    if (!notice) return
    const remaining = Math.max(0, notice.expiresAt - Date.now())
    const t = setTimeout(() => setNotice(null), remaining)
    return () => clearTimeout(t)
  }, [notice])

  useEffect(() => {
    const newSocket = io(SOCKET_URL)
    setSocket(newSocket)

    newSocket.on("connect", () => {
      console.log("Connected to server")
      // Show "Back online" if we previously emitted a "Connection lost" notice
      if (reconnectAttemptedRef.current && gameStateRef.current !== "welcome") {
        setNotice(noticeFor("Back online", "success", 1500))
      }

      const savedSession = sessionStorage.getItem("gameSession")
      if (!savedSession) {
        console.log("No saved session found")
        return
      }
      // Guard: only attempt reconnect-player once per session entry, even if
      // socket.io fires multiple "connect" events (transport upgrade, etc.).
      if (reconnectAttemptedRef.current) {
        console.log("Reconnect already attempted - skipping duplicate emit")
        return
      }
      const session = JSON.parse(savedSession)
      if (!session.roomCode || !session.playerName) {
        console.log("Session invalid, clearing...")
        sessionStorage.removeItem("gameSession")
        return
      }
      reconnectAttemptedRef.current = true
      console.log("Prompting reconnect to room:", session.roomCode, "for player:", session.playerName)
      setReconnectPrompt({ roomCode: session.roomCode, playerName: session.playerName })
    })

    newSocket.on("disconnect", () => {
      console.log("Socket disconnected")
      // Only show notice if user is mid-game; pre-game disconnect is silent.
      if (gameStateRef.current !== "welcome" && gameStateRef.current !== "reconnect-failed") {
        setNotice(noticeFor("Connection lost — trying to reconnect…", "warn", 8000))
      }
      const savedSession = sessionStorage.getItem("gameSession")
      if (savedSession) {
        const session = JSON.parse(savedSession)
        session.timestamp = Date.now()
        sessionStorage.setItem("gameSession", JSON.stringify(session))
      }
    })

    const handleBeforeUnload = () => {
      const savedSession = sessionStorage.getItem("gameSession")
      if (savedSession) {
        const session = JSON.parse(savedSession)
        session.timestamp = Date.now()
        sessionStorage.setItem("gameSession", JSON.stringify(session))
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload)

    newSocket.on("player-joined", (playerList) => { setPlayers(playerList) })
    newSocket.on("player-left", (playerList) => { setPlayers(playerList) })
    newSocket.on("game-started", () => { setGameState("writing"); setSubmitted(false) })
    newSocket.on("progress-update", (data) => {
      setProgress(data)
      if (data.playerStatuses) { setPlayerStatuses(data.playerStatuses) }
    })
    newSocket.on("answer-submitted", () => { setSubmitted(true); setError("") })

    newSocket.on("answer-phase", (data) => {
      console.log("Answer-phase event received:", data)
      if (!data || !data.question) {
        console.log("ERROR: Invalid answer-phase data received:", data)
        setError("Invalid question data received")
        return
      }
      setAssignedQuestion(data.question)
      setGameState("answering")
      setSubmitted(false)
      setProgress({ submitted: 0, total: players.length })
      setPlayerStatuses(players.map(p => ({ name: p.name, submitted: false })))
    })

    newSocket.on("performance-phase", (data) => {
      setGameState("performing")
      setGameStats({ round: 1, total: data.totalRounds })
      setProgress({ submitted: 0, total: 0 })
      setPlayerStatuses([])
      setForceConfirm(false)
    })

    newSocket.on("reading-turn", (data) => {
      setCurrentTurn(data)
      setGameStats({ round: data.round, total: data.total })
      setHasRead(false)
    })

    newSocket.on("game-ended", (data) => {
      setGameState("ended")
      if (data.summary) { setGameSummary(data.summary) }
    })

    newSocket.on("game-restarted", () => {
      setGameState("writing")
      setSubmitted(false)
      setQuestion("")
      setAnswer("")
      setAssignedQuestion("")
      setCurrentTurn(null)
      setGameStats({ round: 0, total: 0 })
      setHasRead(false)
      setProgress({ submitted: 0, total: 0 })
      setError("")
      setGameSummary(null)
      setPlayerStatuses([])
      setForceConfirm(false)
    })

    newSocket.on("game-disbanded", (data) => {
      console.log("Game disbanded:", data.message)
      sessionStorage.removeItem("gameSession")
      setGameState("welcome")
      setRoomCode("")
      setPlayers([])
      setIsHost(false)
      setQuestion("")
      setAnswer("")
      setAssignedQuestion("")
      setSubmitted(false)
      setProgress({ submitted: 0, total: 0 })
      setCurrentTurn(null)
      setGameStats({ round: 0, total: 0 })
      setHasRead(false)
      setGameSummary(null)
      setPlayerStatuses([])
      setForceConfirm(false)
      setError(data.message)
      setTimeout(() => setError(""), 6000)
    })

    newSocket.on("anonymous-toggled", (data) => {
      setAnonymousMode(data.anonymousMode)
    })

    newSocket.on("player-disconnected", (data) => {
      setPlayers(data.players)
      setNotice(noticeFor(`${data.disconnectedPlayer} disconnected (90s to reconnect)`, "warn", 4000))
    })

    newSocket.on("player-rejoined", (data) => {
      setPlayers(data.players)
      setNotice(noticeFor(`${data.playerName} reconnected`, "success", 2000))
    })

    // Host transferred during game (e.g. previous host disconnected)
    newSocket.on("host-changed", (data) => {
      // Only react when this client is the new host or current host changed identity
      if (newSocket.id === data.hostId) {
        setIsHost(true)
        setNotice(noticeFor("You're the host now", "info", 3000))
      } else {
        setIsHost(false)
        setNotice(noticeFor(`${data.hostName} is now the host`, "info", 2500))
      }
    })

    // Player was kicked (force-progress non-submitter or host-kick)
    newSocket.on("kicked-from-game", (data) => {
      console.log("kicked-from-game received:", data)
      sessionStorage.removeItem("gameSession")
      // Clear any drafts for the active room
      try {
        const code = roomCodeRef.current
        if (code) {
          sessionStorage.removeItem(draftKey(code, "writing"))
          sessionStorage.removeItem(draftKey(code, "answering"))
        }
      } catch (e) { /* ignore */ }
      reconnectAttemptedRef.current = false
      setGameState("welcome")
      setRoomCode("")
      setPlayers([])
      setIsHost(false)
      setQuestion("")
      setAnswer("")
      setAssignedQuestion("")
      setSubmitted(false)
      setProgress({ submitted: 0, total: 0 })
      setCurrentTurn(null)
      setGameStats({ round: 0, total: 0 })
      setHasRead(false)
      setGameSummary(null)
      setPlayerStatuses([])
      setForceConfirm(false)
      setKickConfirm(null)
      setError(data?.reason || "You were removed from the game.")
      setTimeout(() => setError(""), 6000)
    })

    newSocket.on("reconnected", (data) => {
      console.log("Reconnected event received:", data)
      setReconnectPrompt(null)
      if (data.success) {
        const savedSession = sessionStorage.getItem("gameSession")
        if (savedSession) {
          const session = JSON.parse(savedSession)
          setPlayerName(session.playerName)
        }
        setReconnectInfo(null)
        setRoomCode(data.roomCode)
        setIsHost(!!data.isHost)
        setPlayers(data.players)
        setGameState(data.phase)
        if (typeof data.anonymousMode === "boolean") setAnonymousMode(data.anonymousMode)
        if (data.assignedQuestion && data.assignedQuestion.text) {
          setAssignedQuestion(data.assignedQuestion.text)
        }
        if (data.alreadySubmittedQuestion || data.alreadyAnswered) {
          setSubmitted(true)
        } else {
          setSubmitted(false)
          // Try to restore in-flight drafts for the current phase
          try {
            const code = data.roomCode
            if (data.phase === "writing") {
              const draft = sessionStorage.getItem(draftKey(code, "writing"))
              if (draft) setQuestion(draft)
            } else if (data.phase === "answering") {
              const draft = sessionStorage.getItem(draftKey(code, "answering"))
              if (draft) setAnswer(draft)
            }
          } catch (e) { /* ignore */ }
        }
        if (data.progress) {
          setProgress({ submitted: data.progress.submitted, total: data.progress.total })
          if (data.progress.playerStatuses) setPlayerStatuses(data.progress.playerStatuses)
        }
        if (data.summary) { setGameSummary(data.summary) }
        setNotice(noticeFor("Reconnected", "success", 2000))
      } else {
        console.log("Reconnection failed:", data)
      }
    })

    newSocket.on("reconnect-failed", (data) => {
      console.log("Reconnect failed:", data)
      sessionStorage.removeItem("gameSession")
      reconnectAttemptedRef.current = false
      setReconnectInfo({ roomCode: data.roomCode, playerName: data.playerName, reason: data.reason })
      setGameState("reconnect-failed")
    })

    newSocket.on("error", (message) => {
      console.log("Socket error received:", message)
      setError(message)
      setTimeout(() => setError(""), 5000)
    })

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      newSocket.close()
    }
  }, [])

  const createRoom = useCallback(() => {
    if (!playerName.trim()) { setError("Please enter your name"); return }
    if (!socket) { setError("Not connected to server"); return }
    sessionStorage.removeItem("gameSession")
    reconnectAttemptedRef.current = false
    socket.emit("create-room", playerName, (response) => {
      if (response.success) {
        setRoomCode(response.roomCode)
        setIsHost(true)
        setGameState("lobby")
        setError("")
        setAnonymousMode(false)
        sessionStorage.setItem("gameSession", JSON.stringify({
          roomCode: response.roomCode,
          playerName: playerName,
          timestamp: Date.now()
        }))
      } else {
        setError(response.error || "Failed to create room")
      }
    })
  }, [socket, playerName])

  const joinRoom = useCallback(() => {
    if (!playerName.trim()) { setError("Please enter your name"); return }
    if (!roomCode.trim()) { setError("Please enter a room code"); return }
    if (!socket) { setError("Not connected to server"); return }
    sessionStorage.removeItem("gameSession")
    reconnectAttemptedRef.current = false
    socket.emit("join-room", roomCode, playerName, (response) => {
      if (response.success) {
        setIsHost(false)
        setGameState("lobby")
        setError("")
        sessionStorage.setItem("gameSession", JSON.stringify({
          roomCode: roomCode,
          playerName: playerName,
          timestamp: Date.now()
        }))
      } else {
        setError(response.error || "Failed to join room")
      }
    })
  }, [socket, playerName, roomCode])

  const startGame = useCallback(() => { socket.emit("start-game") }, [socket])

  const submitQuestion = useCallback(() => {
    if (!question.trim() || !question.toLowerCase().startsWith("what if")) {
      setError("Question must start with \"What if...\"")
      return
    }
    socket.emit("submit-question", question)
    setSubmitted(true)
    setError("")
    try { sessionStorage.removeItem(draftKey(roomCodeRef.current, "writing")) } catch (e) { /* ignore */ }
  }, [socket, question])

  const submitAnswer = useCallback(() => {
    if (!answer.trim()) { setError("Please enter an answer"); return }
    socket.emit("submit-answer", answer)
    setError("")
    try { sessionStorage.removeItem(draftKey(roomCodeRef.current, "answering")) } catch (e) { /* ignore */ }
  }, [socket, answer])

  const completeReading = useCallback(() => {
    socket.emit("reading-complete")
    setHasRead(true)
  }, [socket])

  const forceProgress = useCallback(() => {
    socket.emit("force-progress")
    setForceConfirm(false)
  }, [socket])

  const disbandGame = useCallback(() => {
    if (socket && roomCodeRef.current) { socket.emit("disband-room") }
    sessionStorage.removeItem("gameSession")
    reconnectAttemptedRef.current = false
    setGameState("welcome")
    setPlayerName("")
    setRoomCode("")
    setPlayers([])
    setIsHost(false)
    setError("")
    setNotice(null)
    setQuestion("")
    setAnswer("")
    setAssignedQuestion("")
    setSubmitted(false)
    setProgress({ submitted: 0, total: 0 })
    setCurrentTurn(null)
    setGameStats({ round: 0, total: 0 })
    setHasRead(false)
    setGameSummary(null)
    setAnonymousMode(false)
    setReconnectInfo(null)
    setPlayerStatuses([])
    setForceConfirm(false)
    setKickConfirm(null)
    setReconnectPrompt(null)
  }, [socket])

  const resetGame = useCallback(() => {
    if (socket && roomCodeRef.current) { socket.emit("leave-room") }
    sessionStorage.removeItem("gameSession")
    reconnectAttemptedRef.current = false
    setGameState("welcome")
    setPlayerName("")
    setRoomCode("")
    setPlayers([])
    setIsHost(false)
    setError("")
    setNotice(null)
    setQuestion("")
    setAnswer("")
    setAssignedQuestion("")
    setSubmitted(false)
    setProgress({ submitted: 0, total: 0 })
    setCurrentTurn(null)
    setGameStats({ round: 0, total: 0 })
    setHasRead(false)
    setGameSummary(null)
    setAnonymousMode(false)
    setReconnectInfo(null)
    setPlayerStatuses([])
    setForceConfirm(false)
    setKickConfirm(null)
    setReconnectPrompt(null)
  }, [socket])

  const renderContent = () => {
    switch (gameState) {
      case "reconnect-failed":
        return (
          <div className="game-container justify-center py-1">
            <div className="text-center mb-4">
              <div className="w-12 h-12 mx-auto mb-2 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-xl">⚠️</span>
              </div>
              <h1 className="text-xl font-extrabold text-white mb-1">Couldn't Reconnect</h1>
              <p className="text-gray-500 text-xs mt-1">{reconnectInfo?.reason || "Session expired"}</p>
            </div>
            <div className="card space-y-4 py-4">
              {reconnectInfo?.roomCode && (
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Your previous room</p>
                  <div className="text-3xl font-black text-gradient tracking-[0.2em]">{reconnectInfo.roomCode}</div>
                </div>
              )}
              <p className="text-sm text-gray-400 text-center">Would you like to try rejoining, or start fresh?</p>
              <button
                onClick={() => {
                  const name = reconnectInfo?.playerName || ""
                  const code = reconnectInfo?.roomCode || ""
                  sessionStorage.setItem("gameSession", JSON.stringify({ roomCode: code, playerName: name, timestamp: Date.now() }))
                  setPlayerName(name)
                  setRoomCode(code)
                  setGameState("welcome")
                  setReconnectInfo(null)
                  socket.emit("reconnect-player", { roomCode: code, playerName: name })
                }}
                className="btn-primary py-3 text-base w-full"
              >
                🔄 Try Rejoining Room {reconnectInfo?.roomCode}
              </button>
              <button onClick={resetGame} className="btn-secondary py-3 text-sm w-full">
                Start New Game
              </button>
            </div>
          </div>
        )

      case "welcome":
        return (
          <div className="game-container justify-center py-1 relative">
            {reconnectPrompt && (
              <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                <div className="bg-gray-900 border border-indigo-700 rounded-xl p-6 max-w-sm w-full text-center shadow-2xl">
                  <div className="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                    <span className="text-2xl">🎮</span>
                  </div>
                  <h2 className="text-lg font-bold text-white mb-1">Active Game Found</h2>
                  <p className="text-sm text-gray-400 mb-3">You have a game in progress</p>
                  <div className="text-center mb-4">
                    <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Room Code</p>
                    <div className="text-3xl font-black text-gradient tracking-[0.2em]">{reconnectPrompt.roomCode}</div>
                  </div>
                  <div className="space-y-3">
                    <button
                      onClick={() => {
                        socket.emit("reconnect-player", {
                          roomCode: reconnectPrompt.roomCode,
                          playerName: reconnectPrompt.playerName
                        })
                        setReconnectPrompt(null)
                      }}
                      className="btn-primary py-3 text-base w-full"
                    >
                      🔄 Rejoin Game
                    </button>
                    <button
                      onClick={() => {
                        sessionStorage.removeItem("gameSession")
                        reconnectAttemptedRef.current = false
                        setReconnectPrompt(null)
                      }}
                      className="btn-secondary py-3 text-sm w-full"
                    >
                      Start New Game
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="text-center mb-4">
              <div className="w-12 h-12 mx-auto mb-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-xl">🤔</span>
              </div>
              <h1 className="text-xl font-extrabold text-gradient mb-0">The What if? Game</h1>
              <p className="text-gray-500 text-[10px] mt-1">3-15 players • 10-15 min</p>
            </div>
            <div className="card space-y-3 py-3">
              <input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Your name" className="input-field py-2 text-lg" maxLength={20} />
              <div className="space-y-2">
                <label className="text-sm text-indigo-400 font-semibold uppercase tracking-wider">Room Code</label>
                <input type="text" value={roomCode} onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, "").slice(0, 4))} onKeyDown={(e) => { if (e.key === "Enter" && roomCode.trim().length === 4) joinRoom() }} placeholder="1234" className="input-field py-3 text-2xl font-bold text-center tracking-[0.2em]" maxLength={4} />
              </div>
              <div className="flex gap-3">
                <button onClick={joinRoom} className="btn-primary py-3 px-5 text-lg whitespace-nowrap flex-1" disabled={!socket}>{socket ? "Join Game" : "..."}</button>
                <button onClick={createRoom} className="btn-secondary py-4 px-4 text-base whitespace-nowrap flex-1" disabled={!socket}>{socket ? "Create" : "..."}</button>
              </div>
              {error && (<div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm text-center">{error}</div>)}
            </div>
          </div>
        )

      case "lobby":
        return (
          <div className="game-container py-2">
            {kickConfirm && (
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                <div className="bg-gray-900 border border-red-700 rounded-xl p-6 max-w-xs w-full text-center">
                  <p className="text-lg font-bold text-white mb-2">Kick Player?</p>
                  <p className="text-sm text-gray-400 mb-4">Remove <span className="text-white font-semibold">{kickConfirm.name}</span> from the room?</p>
                  <div className="flex gap-3">
                    <button onClick={() => setKickConfirm(null)} className="btn-secondary flex-1 py-2 text-sm">Cancel</button>
                    <button onClick={() => { socket.emit("host-kick-player", { playerId: kickConfirm.id }); setKickConfirm(null) }} className="btn-primary flex-1 py-2 text-sm bg-red-700 hover:bg-red-800">Kick</button>
                  </div>
                </div>
              </div>
            )}
            <div className="card mb-2 py-2">
              <div className="text-center">
                <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Room Code</p>
                <div className="text-3xl font-black text-gradient tracking-[0.2em] cursor-pointer active:scale-95 transition-transform" onClick={() => { navigator.clipboard?.writeText(roomCode) }} title="Tap to copy">{roomCode}</div>
                <p className="text-[10px] text-gray-600 mt-1">Tap to copy and share</p>
              </div>
            </div>
            <div className="card flex-1 min-h-0 py-2 px-2 mb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Players</span>
                <span className="text-[10px] text-gray-400">{players.length}/15</span>
              </div>
              <div className="space-y-1 overflow-y-auto">
                {players.map((player, index) => (
                  <div key={player.id} className={"flex items-center gap-2 py-0.5 px-1.5 rounded-lg " + (player.id === socket?.id ? "bg-indigo-900/40 border border-indigo-700" : "bg-gray-800")}>
                    <div className="w-5 h-5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-[10px] font-bold">{index + 1}</div>
                    <span className={"text-sm truncate leading-tight " + (player.id === socket?.id ? "text-indigo-300 font-semibold" : "text-white")}>{player.name}{player.id === socket?.id && " (you)"}</span>
                    {player.isHost && (<span className="ml-auto text-[9px] bg-indigo-900/50 text-indigo-400 px-1.5 py-0.5 rounded font-semibold">HOST</span>)}
                    {isHost && player.id !== socket?.id && (
                      <button onClick={() => setKickConfirm({ id: player.id, name: player.name })} className="ml-1 text-[10px] text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-red-900/30 transition-colors" title="Kick player">✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {isHost && (
              <div className="card mb-2 py-2 px-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-white font-medium leading-tight">Anonymous Results</p>
                    <p className="text-[9px] text-gray-500 leading-tight">Hide names in end-game summary</p>
                  </div>
                  <button onClick={() => socket.emit("toggle-anonymous")} className={"relative w-10 h-5 rounded-full transition-colors duration-200 " + (anonymousMode ? "bg-indigo-600" : "bg-gray-600")}>
                    <div className={"absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 " + (anonymousMode ? "translate-x-5" : "translate-x-0.5")} />
                  </button>
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

      case "writing":
        return (
          <div className="game-container py-2">
            {forceConfirm && (
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                <div className="bg-gray-900 border border-red-700 rounded-xl p-6 max-w-xs w-full text-center">
                  <p className="text-lg font-bold text-white mb-2">Force Advance?</p>
                  <p className="text-sm text-gray-400 mb-4">Players who haven't submitted will be removed from the game.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setForceConfirm(false)} className="btn-secondary flex-1 py-2 text-sm">Cancel</button>
                    <button onClick={forceProgress} className="btn-primary flex-1 py-2 text-sm bg-red-700 hover:bg-red-800">Confirm</button>
                  </div>
                </div>
              </div>
            )}
            {!submitted ? (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="text-center mb-1">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0">Your Turn</p>
                  <h2 className="text-base font-bold text-white leading-tight">Write a Question</h2>
                  <p className="text-[10px] text-indigo-400 leading-tight">Must begin with "What if..."</p>
                </div>
                <textarea value={question} onChange={(e) => { setQuestion(e.target.value); try { sessionStorage.setItem(draftKey(roomCodeRef.current, "writing"), e.target.value) } catch (err) { /* ignore */ } }} placeholder="Type your question here" className="input-field h-28 resize-none mb-2 text-base leading-snug" maxLength={300} />
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">{question.length}/300</span>
                  {question && !question.toLowerCase().startsWith("what if") && (<span className="text-xs text-red-500 font-semibold">Must start with "What if"</span>)}
                </div>
                {error && (<div className="p-2 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-xs text-center mb-2">{error}</div>)}
                <button onClick={submitQuestion} disabled={!question.trim() || !question.toLowerCase().startsWith("what if")} className="btn-primary py-3 text-base mb-2">Submit Question</button>
                <div className="w-full">
                  <div className={"flex justify-between text-[10px] mb-0.5 " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "text-red-400 font-semibold" : "text-gray-500")}><span>Submissions</span><span>{progress.submitted}/{progress.total}</span></div>
                  <div className={"w-full h-1.5 rounded-full overflow-hidden " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "bg-red-900/30" : "bg-gray-800")}><div className={"h-full transition-all duration-500 " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "bg-red-500 animate-pulse" : "bg-indigo-500")} style={{ width: (progress.total > 0 ? (progress.submitted / progress.total) * 100 : 0) + "%" }} /></div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-green-900/30 rounded-full flex items-center justify-center mb-3"><span className="text-3xl">✓</span></div>
                <h3 className="text-xl font-bold text-white mb-1">Submitted!</h3>
                <p className="text-gray-400 text-sm mb-4">Waiting for others...</p>
                {playerStatuses.length > 0 && (
                  <div className="w-full max-w-xs mb-4 space-y-1">
                    {playerStatuses.map((p, i) => (
                      <div key={i} className={"flex items-center justify-between px-3 py-1.5 rounded-lg text-sm " + (p.submitted ? "bg-green-900/30 border border-green-800" : "bg-gray-800 border border-gray-700")}>
                        <span className={p.submitted ? "text-green-300" : "text-gray-400"}>{p.name}</span>
                        <span className={p.submitted ? "text-green-400" : "text-gray-600"}>{p.submitted ? "✓ Done" : "waiting..."}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="w-full max-w-xs">
                  <div className={"flex justify-between text-xs mb-1 " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "text-red-400 font-semibold" : "text-gray-500")}><span>Progress</span><span>{progress.submitted}/{progress.total}</span></div>
                  <div className={"w-full h-2 rounded-full overflow-hidden " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "bg-red-900/30" : "bg-gray-800")}><div className={"h-full transition-all duration-500 " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "bg-red-500 animate-pulse" : "bg-indigo-500")} style={{ width: (progress.total > 0 ? (progress.submitted / progress.total) * 100 : 0) + "%" }} /></div>
                </div>
                {error && (<div className="p-2 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-xs text-center mt-3 max-w-xs">{error}</div>)}
                {isHost && progress.submitted >= 3 && progress.submitted < progress.total && (
                  <button onClick={() => setForceConfirm(true)} className="mt-4 text-xs text-red-500 border border-red-800 rounded-lg px-4 py-2 hover:bg-red-900/20 transition-colors">
                    ⚡ Force Advance (skip waiting players)
                  </button>
                )}
              </div>
            )}
          </div>
        )

      case "answering":
        return (
          <div className="game-container py-2">
            {forceConfirm && (
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                <div className="bg-gray-900 border border-red-700 rounded-xl p-6 max-w-xs w-full text-center">
                  <p className="text-lg font-bold text-white mb-2">Force Advance?</p>
                  <p className="text-sm text-gray-400 mb-4">Players who haven't submitted will be removed from the game.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setForceConfirm(false)} className="btn-secondary flex-1 py-2 text-sm">Cancel</button>
                    <button onClick={forceProgress} className="btn-primary flex-1 py-2 text-sm bg-red-700 hover:bg-red-800">Confirm</button>
                  </div>
                </div>
              </div>
            )}
            {!submitted ? (
              <div className="flex-1 flex flex-col min-h-0">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 text-center">Answer This Question</p>
                <div className="card mb-2 py-2 px-3 bg-gradient-to-br from-indigo-900/30 to-purple-900/30 border-2 border-indigo-700">
                  <p className="text-base font-bold text-white leading-snug text-center">{assignedQuestion}</p>
                </div>
                <textarea value={answer} onChange={(e) => { setAnswer(e.target.value); try { sessionStorage.setItem(draftKey(roomCodeRef.current, "answering"), e.target.value) } catch (err) { /* ignore */ } }} placeholder="Type your answer here..." className="input-field h-28 resize-none mb-2 text-base leading-snug" maxLength={400} />
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-gray-500">{answer.length}/400 characters</span>
                </div>
                {error && (<div className="p-2 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-xs text-center mb-2">{error}</div>)}
                <button onClick={submitAnswer} disabled={!answer.trim()} className="btn-primary py-3 text-base mb-2">Submit Answer</button>
                <div className="w-full">
                  <div className={"flex justify-between text-[10px] mb-0.5 " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "text-red-400 font-semibold" : "text-gray-500")}><span>Submissions</span><span>{progress.submitted}/{progress.total}</span></div>
                  <div className={"w-full h-1.5 rounded-full overflow-hidden " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "bg-red-900/30" : "bg-gray-800")}><div className={"h-full transition-all duration-500 " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "bg-red-500 animate-pulse" : "bg-indigo-500")} style={{ width: (progress.total > 0 ? (progress.submitted / progress.total) * 100 : 0) + "%" }} /></div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-green-900/30 rounded-full flex items-center justify-center mb-3"><span className="text-3xl">✓</span></div>
                <h3 className="text-xl font-bold text-white mb-1">Answer Submitted!</h3>
                <p className="text-gray-400 text-sm mb-4">Waiting for others...</p>
                {playerStatuses.length > 0 && (
                  <div className="w-full max-w-xs mb-4 space-y-1">
                    {playerStatuses.map((p, i) => (
                      <div key={i} className={"flex items-center justify-between px-3 py-1.5 rounded-lg text-sm " + (p.submitted ? "bg-green-900/30 border border-green-800" : "bg-gray-800 border border-gray-700")}>
                        <span className={p.submitted ? "text-green-300" : "text-gray-400"}>{p.name}</span>
                        <span className={p.submitted ? "text-green-400" : "text-gray-600"}>{p.submitted ? "✓ Done" : "writing..."}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="w-full max-w-xs">
                  <div className={"flex justify-between text-xs mb-1 " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "text-red-400 font-semibold" : "text-gray-500")}><span>Progress</span><span>{progress.submitted}/{progress.total}</span></div>
                  <div className={"w-full h-2 rounded-full overflow-hidden " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "bg-red-900/30" : "bg-gray-800")}><div className={"h-full transition-all duration-500 " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "bg-red-500 animate-pulse" : "bg-indigo-500")} style={{ width: (progress.total > 0 ? (progress.submitted / progress.total) * 100 : 0) + "%" }} /></div>
                </div>
                {error && (<div className="p-2 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-xs text-center mt-3 max-w-xs">{error}</div>)}
                {isHost && progress.submitted >= 2 && progress.submitted < progress.total && (
                  <button onClick={() => setForceConfirm(true)} className="mt-4 text-xs text-red-500 border border-red-800 rounded-lg px-4 py-2 hover:bg-red-900/20 transition-colors">
                    ⚡ Force Advance (skip waiting players)
                  </button>
                )}
              </div>
            )}
          </div>
        )

      case "performing":
        return (
          <div className="game-container py-2">
            {forceConfirm && (
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                <div className="bg-gray-900 border border-red-700 rounded-xl p-6 max-w-xs w-full text-center">
                  <p className="text-lg font-bold text-white mb-2">Skip This Turn?</p>
                  <p className="text-sm text-gray-400 mb-4">The current reader will be skipped and the next player will read.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setForceConfirm(false)} className="btn-secondary flex-1 py-2 text-sm">Cancel</button>
                    <button onClick={forceProgress} className="btn-primary flex-1 py-2 text-sm bg-red-700 hover:bg-red-800">Confirm</button>
                  </div>
                </div>
              </div>
            )}
            {currentTurn ? (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="mb-3">
                  {currentTurn.isQuestionTurn && socket.id === currentTurn.questionReader.id && (
                    <div className="py-4 rounded-xl text-center bg-green-500 border-4 border-green-300 shadow-xl shadow-green-900/50">
                      <span className="text-3xl font-black text-white tracking-wider">READ QUESTION</span>
                      <p className="text-green-100 text-sm mt-1">Read aloud, then tap Done</p>
                    </div>
                  )}
                  {!currentTurn.isQuestionTurn && socket.id === currentTurn.questionReader.id && (
                    <div className="py-3 rounded-lg text-center bg-gray-700 border border-gray-600">
                      <span className="text-lg font-bold text-gray-400">WAITING</span>
                      <p className="text-gray-500 text-sm mt-1">{currentTurn.answerReader.name} is reading the answer</p>
                    </div>
                  )}
                  {currentTurn.isQuestionTurn && socket.id === currentTurn.answerReader.id && (
                    <div className="py-4 rounded-xl text-center bg-purple-500 border-4 border-purple-300 shadow-xl shadow-purple-900/50">
                      <span className="text-3xl font-black text-white tracking-wider">GET READY</span>
                      <p className="text-purple-100 text-sm mt-1">You're reading the answer next</p>
                    </div>
                  )}
                  {!currentTurn.isQuestionTurn && socket.id === currentTurn.answerReader.id && (
                    <div className="py-4 rounded-xl text-center bg-purple-500 border-4 border-purple-300 shadow-xl shadow-purple-900/50">
                      <span className="text-3xl font-black text-white tracking-wider">READ ANSWER</span>
                      <p className="text-purple-100 text-sm mt-1">Read aloud, then tap Done</p>
                    </div>
                  )}
                  {socket.id !== currentTurn.questionReader.id && socket.id !== currentTurn.answerReader.id && (
                    <div className="py-3 rounded-lg text-center bg-gray-700 border border-gray-600">
                      <span className="text-lg font-bold text-gray-400">LISTEN</span>
                      <p className="text-gray-500 text-sm mt-1">{currentTurn.questionReader.name} &​rarr; {currentTurn.answerReader.name}</p>
                    </div>
                  )}
                </div>
                {currentTurn.isQuestionTurn && socket.id === currentTurn.questionReader.id && (
                  <div className="card bg-gradient-to-br from-green-600 to-green-800 border-4 border-green-400 shadow-2xl mb-3 py-6 px-5">
                    <p className="text-center text-lg text-green-100 font-bold uppercase tracking-widest mb-3">📖 Read Aloud</p>
                    <p className="text-center text-2xl font-bold text-white leading-relaxed">{currentTurn.question}</p>
                  </div>
                )}
                {!currentTurn.isQuestionTurn && socket.id === currentTurn.answerReader.id && currentTurn.answer && (
                  <div className="card bg-gradient-to-br from-purple-600 to-purple-800 border-4 border-purple-400 shadow-2xl mb-3 py-6 px-5">
                    <p className="text-center text-lg text-purple-100 font-bold uppercase tracking-widest mb-3">💬 Read Aloud</p>
                    <p className="text-center text-2xl font-bold text-white leading-relaxed">{currentTurn.answer}</p>
                  </div>
                )}
                {!hasRead && currentTurn.isQuestionTurn && socket.id === currentTurn.questionReader.id && (
                  <button onClick={completeReading} className="btn-primary mb-3 bg-green-600 hover:bg-green-700 text-xl py-5">Done Reading →</button>
                )}
                {!hasRead && !currentTurn.isQuestionTurn && socket.id === currentTurn.answerReader.id && (
                  <button onClick={completeReading} className="btn-primary mb-3 bg-purple-600 hover:bg-purple-700 text-xl py-5">Done Reading →</button>
                )}
                {socket.id !== currentTurn.questionReader.id && socket.id !== currentTurn.answerReader.id && (
                  <div className="card bg-gray-800 border-2 border-gray-700 mb-3 py-4 px-5 text-center">
                    <p className="text-gray-300 text-lg">
                      <span className="text-green-400 font-bold text-xl">{currentTurn.questionReader.name}</span>
                      <span className="text-gray-500 mx-3">→</span>
                      <span className="text-purple-400 font-bold text-xl">{currentTurn.answerReader.name}</span>
                    </p>
                    <p className="text-gray-500 text-base mt-2">{currentTurn.isQuestionTurn ? "Question being read" : "Answer being read"}</p>
                  </div>
                )}
                <div className="mt-auto pt-3 border-t border-gray-800">
                  <div className="flex justify-center gap-1 mb-2">
                    {Array.from({ length: gameStats.total }).map((_, i) => (
                      <div key={i} className={"w-2 h-2 rounded-full " + (i < gameStats.round ? "bg-indigo-500" : i === gameStats.round - 1 ? "bg-white animate-pulse" : "bg-gray-700")} />
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
                    <span>Turn {gameStats.round}/{gameStats.total}</span>
                    <div className="flex-1 mx-3 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: (gameStats.total > 0 ? (gameStats.round / gameStats.total) * 100 : 0) + "%" }} />
                    </div>
                  </div>
                  {error && (<div className="p-2 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-xs text-center mt-2">{error}</div>)}
                  {isHost && (
                    <button onClick={() => setForceConfirm(true)} className="w-full text-xs text-red-500 border border-red-800 rounded-lg px-3 py-1.5 hover:bg-red-900/20 transition-colors mt-2">
                      ⚡ Skip Current Turn
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="text-6xl mb-4">🎭</div>
                <h3 className="text-2xl font-bold text-white mb-2">Get Ready!</h3>
                <p className="text-gray-400 text-base">Reading round starting soon...</p>
              </div>
            )}
          </div>
        )

      case "ended":
        return (
          <div className="game-container py-2">
            <div className="text-center mb-4">
              <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-xl">
                <span className="text-3xl">🎉</span>
              </div>
              <h2 className="text-3xl font-black text-white mb-1">Game Over!</h2>
              <p className="text-gray-400 text-sm">Thanks for playing!</p>
            </div>

            {gameSummary && gameSummary.length > 0 && (
              <div className="card mb-3 py-3 px-3 flex-1 min-h-0 overflow-y-auto">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 text-center">Game Summary</p>
                <div className="space-y-3">
                  {gameSummary.map((pair, i) => (
                    <div key={i} className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 rounded-xl p-4 border border-gray-700/50 shadow-lg">
                      <div className="mb-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">{i + 1}</span>
                          <p className="text-[10px] text-indigo-400 uppercase tracking-wider font-semibold">Question</p>
                        </div>
                        <p className="text-sm text-white leading-relaxed font-medium">{pair.question}</p>
                        <p className="text-[10px] text-gray-500 mt-1">— {pair.questionAuthorName}</p>
                      </div>
                      <div className="border-t border-gray-700/50 pt-3 mb-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-xs font-bold text-white">✓</span>
                          <p className="text-[10px] text-green-400 uppercase tracking-wider font-semibold">Actual Answer</p>
                        </div>
                        <p className="text-sm text-white leading-relaxed font-medium">{pair.actualAnswer}</p>
                        <p className="text-[10px] text-gray-500 mt-1">— {pair.actualAnswerAuthorName}</p>
                      </div>
                      {pair.pairedAnswer && (
                        <div className="border-t border-gray-700/50 pt-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold text-white">?</span>
                            <p className="text-[10px] text-purple-400 uppercase tracking-wider font-semibold">Paired Answer</p>
                          </div>
                          <p className="text-sm text-white leading-relaxed font-medium">{pair.pairedAnswer}</p>
                          <p className="text-[10px] text-gray-500 mt-1">— {pair.pairedAnswerAuthorName}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {gameSummary[0]?.anonymousMode && (
                  <p className="text-center text-[10px] text-gray-600 mt-3 italic">Names hidden by host</p>
                )}
              </div>
            )}

            {isHost ? (
              <div className="space-y-2">
                <button onClick={() => socket.emit("replay-game")} className="btn-primary py-3 text-base w-full">
                  🔄 Play Again (Same Players)
                </button>
                <button onClick={disbandGame} className="btn-secondary py-3 text-sm w-full">
                  🏠 New Game (All Players)
                </button>
              </div>
            ) : (
              <div className="py-3">
                <span className="text-base text-indigo-400 animate-pulse">Waiting for host...</span>
              </div>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900 relative">
      {notice && (
        <div className={"fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-all " + (notice.tone === "success" ? "bg-green-900/90 border border-green-600 text-green-100" : notice.tone === "warn" ? "bg-yellow-900/90 border border-yellow-600 text-yellow-100" : "bg-indigo-900/90 border border-indigo-600 text-indigo-100")}>
          {notice.message}
        </div>
      )}
      {renderContent()}
    </div>
  )
}

export default App
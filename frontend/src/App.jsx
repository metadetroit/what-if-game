import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
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
  const [hostId, setHostId] = useState(null)
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
  const [noSelfReading, setNoSelfReading] = useState(false)
  const [reconnectInfo, setReconnectInfo] = useState(null)
  const [playerStatuses, setPlayerStatuses] = useState([])
  const [forceConfirm, setForceConfirm] = useState(false)
  const [kickConfirm, setKickConfirm] = useState(null) // { id, name } when host wants to confirm a kick
  const [reconnectPrompt, setReconnectPrompt] = useState(null) // { roomCode, playerName } on page-load reconnect
  const [helpTab, setHelpTab] = useState("how-to-play") // "how-to-play" | "faq" | "tips" | "about"
  const [firstSubmitter, setFirstSubmitter] = useState(null) // { name } for the first player to submit
  const [lastQuestionSubmitter, setLastQuestionSubmitter] = useState(null) // { name } for the last player to submit a question
  const [showLastSubmitterIndicator, setShowLastSubmitterIndicator] = useState(false) // show ⏰ indicator after 10 seconds
  const [gameAwards, setGameAwards] = useState({ firstQuestionSubmitter: null, firstAnswerSubmitter: null, lastQuestionSubmitter: null, lastAnswerSubmitter: null }) // awards for summary page
  const [performanceVotes, setPerformanceVotes] = useState({}) // Track votes during performing phase: { questionId: count, answerId: count }
  const [userVotes, setUserVotes] = useState({}) // Track user's votes: { questionId: true, answerId: true, pairId: true }
  const [summaryVotes, setSummaryVotes] = useState({}) // Track votes on summary page: { questionId: count, answerId: count, pairId: count }
  const [summaryPairVoteId, setSummaryPairVoteId] = useState(null)
  const [summaryAnonymousMode, setSummaryAnonymousMode] = useState(false) // Locks the anonymity of the completed round
  const [bestOfData, setBestOfData] = useState(null) // Data for best of page
  const [hideGameConfirm, setHideGameConfirm] = useState(false) // Confirmation for hiding game from best of
  const [bestOfSort, setBestOfSort] = useState(() => sessionStorage.getItem('bestOfSort') || 'votes')
  const [bestOfLimit, setBestOfLimit] = useState(20)
  const [bestOfOffset, setBestOfOffset] = useState(0)
  const [bestOfHasMore, setBestOfHasMore] = useState(true)
  const [bestOfLoading, setBestOfLoading] = useState(false)
  const scrollBestOfIdRef = useRef(null)
  const bestOfSentinelRef = useRef(null)
  const [showCountdown, setShowCountdown] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [showBackToTop, setShowBackToTop] = useState(false)

  // Refs survive remounts/state-update batches
  const reconnectAttemptedRef = useRef(false)
  const roomCodeRef = useRef("")
  const gameStateRef = useRef("welcome")
  const socketRef = useRef(null)
  const lastSubmitterTimerRef = useRef(null)
  const pendingVoteRef = useRef(null)

  useEffect(() => { roomCodeRef.current = roomCode }, [roomCode])
  useEffect(() => { gameStateRef.current = gameState }, [gameState])

  // Auto-clear notice
  useEffect(() => {
    if (!notice) return
    const remaining = Math.max(0, notice.expiresAt - Date.now())
    const t = setTimeout(() => setNotice(null), remaining)
    return () => clearTimeout(t)
  }, [notice])

  const fetchBestOfData = async (opts = {}) => {
    try {
      if (bestOfLoading) return
      setBestOfLoading(true)
      const sort = opts.sort || bestOfSort
      const limit = opts.limit || bestOfLimit
      const offset = opts.offset ?? bestOfOffset
      const url = `${SOCKET_URL}/api/best-of?type=qa_pairs&limit=${limit}&sort=${sort}&offset=${offset}`
      const response = await fetch(url)
      const data = await response.json()
      if (offset === 0) {
        setBestOfData(data)
      } else {
        setBestOfData(prev => Array.isArray(prev) ? [...prev, ...data] : data)
      }
      setBestOfHasMore(Array.isArray(data) ? data.length === limit : false)
    } catch (error) {
      console.error('Failed to fetch best of data:', error)
      setNotice(noticeFor('Failed to load best of content', 'warn', 3000))
    } finally { setBestOfLoading(false) }
  }

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const view = params.get('view')
      const pairId = params.get('pair')
      if (view === 'best-of') {
        setGameState('best-of')
        if (pairId) scrollBestOfIdRef.current = pairId
        setBestOfOffset(0)
        fetchBestOfData({ offset: 0 })
      }
    } catch (_) {}
  }, [])

  useEffect(() => {
    if (Array.isArray(bestOfData) && scrollBestOfIdRef.current) {
      const el = document.getElementById(`bestof-${scrollBestOfIdRef.current}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      scrollBestOfIdRef.current = null
    }
  }, [bestOfData])

  useEffect(() => {
    if (gameState !== 'best-of') return
    const sentinel = bestOfSentinelRef.current
    if (!sentinel) return
    const io = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry.isIntersecting && bestOfHasMore && !bestOfLoading) {
        const nextOffset = bestOfOffset + bestOfLimit
        setBestOfOffset(nextOffset)
        fetchBestOfData({ offset: nextOffset })
      }
    }, { root: null, rootMargin: '0px 0px 400px 0px', threshold: 0.01 })
    io.observe(sentinel)
    return () => io.disconnect()
  }, [gameState, bestOfHasMore, bestOfLoading, bestOfOffset, bestOfLimit, bestOfSort, bestOfData])

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 200)
    window.addEventListener('scroll', onScroll)
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (["writing", "answering", "performing"].includes(gameState)) {
      setShowCountdown(true)
      setCountdown(3)
      const iv = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) { clearInterval(iv); setShowCountdown(false); return 0 }
          return c - 1
        })
      }, 1000)
      return () => clearInterval(iv)
    }
  }, [gameState])

  const handleHideGame = async () => {
    console.log('handleHideGame called:', { roomCode, SOCKET_URL })
    try {
      const response = await fetch(`${SOCKET_URL}/api/hide-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode })
      })
      console.log('hide-game response status:', response.status)
      const result = await response.json()
      console.log('hide-game result:', result)
      if (result.success) {
        setNotice(noticeFor('Game hidden from Best Of page', 'success', 2000))
        setHideGameConfirm(false)
      } else {
        setNotice(noticeFor('Failed to hide game', 'warn', 3000))
      }
    } catch (error) {
      console.error('Failed to hide game:', error)
      setNotice(noticeFor('Failed to hide game', 'warn', 3000))
    }
  }

  const applySummaryData = useCallback((summary, fallbackAnon = false) => {
    setGameSummary(summary)
    if (Array.isArray(summary) && summary.length > 0) {
      const derivedAnon = typeof summary[0].anonymousMode === 'boolean' ? summary[0].anonymousMode : fallbackAnon
      setSummaryAnonymousMode(derivedAnon)
    } else {
      setSummaryAnonymousMode(fallbackAnon)
    }
  }, [])

  const handleVote = (type, targetId) => {
    if (pendingVoteRef.current) {
      setNotice(noticeFor('Please wait…', 'info', 1200))
      return
    }
    console.log('handleVote called:', { type, targetId, userVotes: userVotes[targetId], socket: !!socketRef.current, socketId: socketRef.current?.id, roomCode: roomCodeRef.current, socketRoomCode: socketRef.current?.roomCode })
    if (type === 'qa_pair' && summaryPairVoteId && summaryPairVoteId !== targetId) {
      setNotice(noticeFor('You already voted for a different pairing', 'warn', 2500))
      return
    }
    if (!socketRef.current) {
      console.log('Vote rejected: socket not connected')
      return // Socket not connected
    }
    if (!roomCodeRef.current) {
      console.log('Vote rejected: roomCode not set')
      return // Room code not set
    }
    console.log('Emitting submit-vote:', { type, targetId })
    pendingVoteRef.current = { type, targetId }
    socketRef.current.emit("submit-vote", { type, targetId })
  }

  useEffect(() => {
    const newSocket = io(SOCKET_URL)
    setSocket(newSocket)
    socketRef.current = newSocket

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

    const updatePlayersAndHost = (payload) => {
      if (!payload) return;
      const playerList = Array.isArray(payload) ? payload : payload.players || [];
      const nextHostId = !Array.isArray(payload) ? payload.hostId : null;
      console.log("updatePlayersAndHost called with:", payload)
      console.log("nextHostId:", nextHostId, "Socket ID:", newSocket.id)
      setPlayers(playerList)
      // Only update host state if hostId is provided in the payload
      // This prevents overriding the correct host state set during reconnection
      if (nextHostId) {
        console.log("Updating host state from updatePlayersAndHost")
        setHostId(nextHostId)
        setIsHost(newSocket.id === nextHostId)
      } else {
        console.log("No hostId in payload, not updating host state")
      }
    }

    newSocket.on("player-joined", (payload) => {
      console.log("player-joined event received:", payload)
      updatePlayersAndHost(payload)
    })
    newSocket.on("player-left", updatePlayersAndHost)
    newSocket.on("game-started", (data) => { setGameState("writing"); setSubmitted(false); setFirstSubmitter(null); if (typeof data.anonymousMode === "boolean") setAnonymousMode(data.anonymousMode) })
    newSocket.on("progress-update", (data) => {
      console.log("Progress-update received:", data)
      setProgress(data)
      if (data.playerStatuses) { setPlayerStatuses(data.playerStatuses) }
      if (data.firstSubmitter) { setFirstSubmitter(data.firstSubmitter) }
      if (data.lastQuestionSubmitter) {
        console.log("Setting lastQuestionSubmitter to:", data.lastQuestionSubmitter)
        setLastQuestionSubmitter(data.lastQuestionSubmitter)
      }
    })
    newSocket.on("question-submitted", () => { setSubmitted(true); setError("") })
    newSocket.on("answer-submitted", () => { setSubmitted(true); setError("") })

    newSocket.on("answer-phase", (data) => {
      console.log("Answer-phase event received:", data)
      if (!data || !data.question) {
        console.log("ERROR: Invalid answer-phase data received:", data)
        setError("Invalid question data received")
        return
      }
      if (data.lastQuestionSubmitter) {
        console.log("Setting lastQuestionSubmitter from answer-phase to:", data.lastQuestionSubmitter)
        setLastQuestionSubmitter(data.lastQuestionSubmitter)
      }
      setAssignedQuestion(data.question)
      setGameState("answering")
      setSubmitted(false)
      setProgress({ submitted: 0, total: players.length })
      setPlayerStatuses(players.map(p => ({ name: p.name, submitted: false })))
      setFirstSubmitter(null)
      setShowLastSubmitterIndicator(false)
    })

    newSocket.on("performance-phase", (data) => {
      setGameState("performing")
      setGameStats({ round: 1, total: data.totalRounds })
      setProgress({ submitted: 0, total: 0 })
      setPlayerStatuses([])
      setForceConfirm(false)
      setShowLastSubmitterIndicator(false)
      setLastQuestionSubmitter(null)
    })

    newSocket.on("reading-turn", (data) => {
      setCurrentTurn(data)
      setGameStats({ round: data.round, total: data.total })
      setHasRead(false)
      // Reset performance votes for new turn
      setPerformanceVotes({})
    })

    newSocket.on("vote-update", (data) => {
      setSummaryVotes(prev => ({
        ...prev,
        [data.targetId]: data.voteCount
      }))
    })

    newSocket.on("vote-submitted", (data) => {
      const pendingVote = pendingVoteRef.current
      pendingVoteRef.current = null
      if (data.success) {
        const isVoted = typeof data.isVoted === 'boolean' ? data.isVoted : true
        setUserVotes(prev => ({
          ...prev,
          [data.targetId]: isVoted
        }))
        if (pendingVote?.type === 'qa_pair') {
          setSummaryPairVoteId(isVoted ? data.targetId : null)
          const el = document.getElementById(`pair-${data.targetId}`)
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }
        setNotice(noticeFor(isVoted ? 'Vote saved' : 'Vote removed', 'success', 1200))
      } else {
        setNotice(noticeFor(data.message || 'Vote failed', 'warn', 2000))
      }
    })

    newSocket.on("game-ended", (data) => {
      setGameState("ended")
      if (data.summary) { applySummaryData(data.summary, anonymousMode) }
      if (data.firstQuestionSubmitter || data.firstAnswerSubmitter || data.lastQuestionSubmitter || data.lastAnswerSubmitter) {
        setGameAwards({
          firstQuestionSubmitter: data.firstQuestionSubmitter,
          firstAnswerSubmitter: data.firstAnswerSubmitter,
          lastQuestionSubmitter: data.lastQuestionSubmitter,
          lastAnswerSubmitter: data.lastAnswerSubmitter
        })
      }
    })

    newSocket.on("game-restarted", (data) => {
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
      applySummaryData(null, false)
      setPlayerStatuses([])
      setForceConfirm(false)
      setShowLastSubmitterIndicator(false)
      setLastQuestionSubmitter(null)
      setGameAwards({ firstQuestionSubmitter: null, firstAnswerSubmitter: null, lastQuestionSubmitter: null, lastAnswerSubmitter: null })
      setPerformanceVotes({})
      setUserVotes({})
      setSummaryVotes({})
      setSummaryPairVoteId(null)

      // Carry over lastQuestionSubmitter from prior round (if provided) so the "you were last" nudge shows on the writing screen after replay
      const carried = data && data.lastQuestionSubmitter ? data.lastQuestionSubmitter : null
      if (carried) {
        setLastQuestionSubmitter(carried)
        setShowLastSubmitterIndicator(false)
      }
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
      applySummaryData(null, false)
      setPlayerStatuses([])
      setForceConfirm(false)
      setError(data.message)
      setTimeout(() => setError(""), 6000)
      setPerformanceVotes({})
      setUserVotes({})
      setSummaryVotes({})
      setSummaryPairVoteId(null)
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
      if (data.hostId) {
        setHostId(data.hostId)
        setIsHost(newSocket.id === data.hostId)
      }
      setNotice(noticeFor(`${data.playerName} reconnected`, "success", 2000))
    })

    // Host transferred during game (e.g. previous host disconnected)
    newSocket.on("host-changed", (data) => {
      if (data.hostId) setHostId(data.hostId)
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
      applySummaryData(null, false)
      setPlayerStatuses([])
      setForceConfirm(false)
      setKickConfirm(null)
      setError(data?.reason || "You were removed from the game.")
      setTimeout(() => setError(""), 6000)
      setPerformanceVotes({})
      setUserVotes({})
      setSummaryVotes({})
      setSummaryPairVoteId(null)
    })

    newSocket.on("reconnected", (data) => {
      console.log("Reconnected event received:", data)
      console.log("Socket ID:", newSocket.id, "Host ID from data:", data.hostId)
      console.log("Should be host?", newSocket.id === data.hostId)
      setReconnectPrompt(null)
      if (data.success) {
        const savedSession = sessionStorage.getItem("gameSession")
        if (savedSession) {
          const session = JSON.parse(savedSession)
          setPlayerName(session.playerName)
        }
        setReconnectInfo(null)
        setRoomCode(data.roomCode)
        // Set socket.roomCode on client side for voting and other socket events
        newSocket.roomCode = data.roomCode
        if (data.hostId) {
          console.log("Setting hostId to:", data.hostId)
          console.log("Is host?", newSocket.id === data.hostId)
          setHostId(data.hostId)
          setIsHost(newSocket.id === data.hostId)
        } else {
          console.log("No hostId in data, using isHost flag:", !!data.isHost)
          setIsHost(!!data.isHost)
        }
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
        if (data.summary) { applySummaryData(data.summary, typeof data.anonymousMode === "boolean" ? data.anonymousMode : anonymousMode) }
        if (data.currentTurn) { setCurrentTurn(data.currentTurn) }
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

  const startGame = useCallback(() => { socket.emit("start-game", { noSelfReading }) }, [socket, noSelfReading])

  const canForceAdvance = isHost && submitted && (progress.total === 0 || progress.submitted < progress.total)

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
    applySummaryData(null, false)
    setAnonymousMode(false)
    setReconnectInfo(null)
    setPlayerStatuses([])
    setForceConfirm(false)
    setKickConfirm(null)
    setReconnectPrompt(null)
    setPerformanceVotes({})
    setUserVotes({})
    setSummaryVotes({})
    setSummaryPairVoteId(null)
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
    applySummaryData(null, false)
    setAnonymousMode(false)
    setReconnectInfo(null)
    setPlayerStatuses([])
    setForceConfirm(false)
    setKickConfirm(null)
    setReconnectPrompt(null)
    setPerformanceVotes({})
    setUserVotes({})
    setSummaryVotes({})
    setSummaryPairVoteId(null)
  }, [socket])

  useEffect(() => {
    return () => {
      if (lastSubmitterTimerRef.current) {
        clearTimeout(lastSubmitterTimerRef.current)
        lastSubmitterTimerRef.current = null
      }
    }
  }, [])

  const fastestTyper = useMemo(() => {
    if (!gameAwards.firstQuestionSubmitter || !gameAwards.firstAnswerSubmitter) return null
    if (gameAwards.firstQuestionSubmitter !== gameAwards.firstAnswerSubmitter) return null
    return gameAwards.firstQuestionSubmitter
  }, [gameAwards.firstQuestionSubmitter, gameAwards.firstAnswerSubmitter])

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
                  socketRef.current?.emit("reconnect-player", { roomCode: code, playerName: name })
                }}
                className="btn-primary py-3 text-base w-full"
              >
                🔄 Try Rejoining Room {reconnectInfo?.roomCode}
              </button>
              <button onClick={resetGame} className="btn-secondary py-3 text-sm w-full">
                Return to Main Screen
              </button>
            </div>
          </div>
        )

      case "best-of":
        return (
          <div className="game-container justify-center py-1">
            <div className="text-center mb-4">
              <div className="w-12 h-12 mx-auto mb-2 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-xl">🏆</span>
              </div>
              <h1 className="text-xl font-extrabold text-gradient mb-1">Best Of</h1>
              <p className="text-gray-500 text-[10px] mt-1">Top-voted game pairings from all games</p>
              <div className="mt-2 inline-flex rounded-lg border border-gray-700 bg-gray-800/60 overflow-hidden text-[10px]">
                <button
                  onClick={() => { setBestOfSort('votes'); sessionStorage.setItem('bestOfSort', 'votes'); setBestOfOffset(0); fetchBestOfData({ sort: 'votes', offset: 0 }) }}
                  className={"px-3 py-1 " + (bestOfSort === 'votes' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700')}
                >Most votes</button>
                <button
                  onClick={() => { setBestOfSort('newest'); sessionStorage.setItem('bestOfSort', 'newest'); setBestOfOffset(0); fetchBestOfData({ sort: 'newest', offset: 0 }) }}
                  className={"px-3 py-1 border-l border-gray-700 " + (bestOfSort === 'newest' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700')}
                >Newest</button>
              </div>
            </div>
            <div className="card py-3">
              {/* Content */}
              {bestOfData === null ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm">Loading...</p>
                </div>
              ) : bestOfData.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm">No content yet. Play some games to see the best content here!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {bestOfData.map((item, i) => (
                    <div key={i} id={`bestof-${item.id}`} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                      {item.type === 'qa_pair' && (
                        <>
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-bold text-amber-400">🎯 GAME PAIRING</span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}?view=best-of&pair=${item.id}`); setNotice(noticeFor('Link copied', 'success', 1200)) }}
                                className="text-[10px] text-indigo-300 hover:text-indigo-200 underline"
                                title="Copy shareable link"
                              >🔗 Copy link</button>
                              <span className="text-xs text-gray-400">🏆 {item.vote_count}</span>
                            </div>
                          </div>
                          <p className="text-sm text-white mb-1"><span className="text-indigo-400">Q:</span> {item.question}</p>
                          <p className="text-sm text-white mb-2"><span className="text-purple-400">A:</span> {item.answer}</p>
                          <p className="text-[10px] text-gray-500">— {item.question_author} → {item.answer_author}</p>
                        </>
                      )}
                    </div>
                  ))}
                  <div ref={bestOfSentinelRef} className="h-8" />
                  {bestOfLoading && (
                    <div className="pt-2 text-center text-[12px] text-gray-400">Loading…</div>
                  )}
                </div>
              )}
            </div>
            <button onClick={() => setGameState("welcome")} className="btn-secondary py-3 text-sm w-full mt-3">
              Back to Main Screen
            </button>
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
                        socketRef.current?.emit("reconnect-player", {
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
                      Return to Main Screen
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="text-center mb-4">
              <div className="w-12 h-12 mx-auto mb-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-xl">🤔</span>
              </div>
              <h1 className="text-xl font-extrabold text-gradient mb-0">Fluke! The Game</h1>
              <p className="text-gray-500 text-[10px] mt-1">playfluke.com</p>
              <p className="text-gray-500 text-[10px] mt-0">3-15 players</p>
              <div className="flex justify-center gap-4 mt-2">
                <button onClick={() => setGameState("help")} className="text-[10px] text-indigo-400 hover:text-indigo-300 underline">
                  How to Play
                </button>
                <button onClick={() => { setGameState("best-of"); fetchBestOfData() }} className="text-[10px] text-yellow-400 hover:text-yellow-300 underline">
                  View Best Of
                </button>
              </div>
            </div>
            <div className="card space-y-3 py-3">
              <input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Your name" className="input-field py-2 text-lg" maxLength={20} />
              <div className="space-y-2">
                <label className="text-sm text-indigo-400 font-semibold uppercase tracking-wider">Room Code</label>
                <input type="text" inputMode="numeric" value={roomCode} onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, "").slice(0, 4))} onKeyDown={(e) => { if (e.key === "Enter" && roomCode.trim().length === 4) joinRoom() }} placeholder="1234" className="input-field py-3 text-2xl font-bold text-center tracking-[0.2em]" maxLength={4} />
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
                    <button onClick={() => { socketRef.current?.emit("host-kick-player", { playerId: kickConfirm.id }); setKickConfirm(null) }} className="btn-primary flex-1 py-2 text-sm bg-red-700 hover:bg-red-800">Kick</button>
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
                  <button onClick={() => socketRef.current?.emit("toggle-anonymous")} className={"relative w-10 h-5 rounded-full transition-colors duration-200 " + (anonymousMode ? "bg-indigo-600" : "bg-gray-600")}>
                    <div className={"absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 " + (anonymousMode ? "translate-x-5" : "translate-x-0.5")} />
                  </button>
                </div>
              </div>
            )}
            {isHost && (
              <div className="card mb-2 py-2 px-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-white font-medium leading-tight">No Self-Reading</p>
                    <p className="text-[9px] text-gray-500 leading-tight">Players won't read their own content</p>
                  </div>
                  <button onClick={() => setNoSelfReading(!noSelfReading)} className={"relative w-10 h-5 rounded-full transition-colors duration-200 " + (noSelfReading ? "bg-indigo-600" : "bg-gray-600")}>
                    <div className={"absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 " + (noSelfReading ? "translate-x-5" : "translate-x-0.5")} />
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
                {anonymousMode && (
                  <div className="mb-3 p-2 bg-purple-900/30 border border-purple-700 rounded-lg text-center">
                    <p className="text-xs font-bold text-purple-300">🔒 This round is anonymized!</p>
                  </div>
                )}
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
                {canForceAdvance && (
                  <button onClick={() => setForceConfirm(true)} className="mt-4 text-xs text-red-500 border border-red-800 rounded-lg px-4 py-2 hover:bg-red-900/20 transition-colors">
                    ⚡ Force Advance (skip waiting players)
                  </button>
                )}
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
                        <div className="flex items-center gap-2">
                          {firstSubmitter && p.name === firstSubmitter && (
                            <span className="text-lg" title="First to submit!">🏆</span>
                          )}
                          {showLastSubmitterIndicator && lastQuestionSubmitter && p.name === lastQuestionSubmitter && (
                            <span className="text-lg" title="You were last to submit your question - don't be the last this time!">⏰</span>
                          )}
                          <span className={p.submitted ? "text-green-300" : "text-gray-400"}>{p.name}</span>
                        </div>
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
                {canForceAdvance && (
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
                {canForceAdvance && (
                  <button onClick={() => setForceConfirm(true)} className="mt-4 text-xs text-red-500 border border-red-800 rounded-lg px-4 py-2 hover:bg-red-900/20 transition-colors">
                    ⚡ Force Advance (skip waiting players)
                  </button>
                )}
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
                        <div className="flex items-center gap-2">
                          {firstSubmitter && p.name === firstSubmitter && (
                            <span className="text-lg" title="First to submit!">🏆</span>
                          )}
                          {showLastSubmitterIndicator && lastQuestionSubmitter && p.name === lastQuestionSubmitter && (
                            <span className="text-lg" title="Last question submitter warning active">⏰</span>
                          )}
                          <span className={p.submitted ? "text-green-300" : "text-gray-400"}>{p.name}</span>
                        </div>
                        <span className={p.submitted ? "text-green-400" : "text-gray-600"}>{p.submitted ? "✓ Done" : "answering..."}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="w-full max-w-xs">
                  <div className={"flex justify-between text-xs mb-1 " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "text-red-400 font-semibold" : "text-gray-500")}><span>Progress</span><span>{progress.submitted}/{progress.total}</span></div>
                  <div className={"w-full h-2 rounded-full overflow-hidden " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "bg-red-900/30" : "bg-gray-800")}><div className={"h-full transition-all duration-500 " + (!submitted && progress.submitted === progress.total - 1 && progress.total > 1 ? "bg-red-500 animate-pulse" : "bg-indigo-500")} style={{ width: (progress.total > 0 ? (progress.submitted / progress.total) * 100 : 0) + "%" }} /></div>
                </div>
                {error && (<div className="p-2 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-xs text-center mt-3 max-w-xs">{error}</div>)}
                {canForceAdvance && (
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
                      <p className="text-gray-500 text-sm mt-1">{currentTurn.questionReader.name} &rarr; {currentTurn.answerReader.name}</p>
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
          <div className="game-container game-container--summary py-4">
            {hideGameConfirm && (
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                <div className="bg-gray-900 border border-red-700 rounded-xl p-6 max-w-xs w-full text-center">
                  <p className="text-lg font-bold text-white mb-2">Hide from Best Of?</p>
                  <p className="text-sm text-gray-400 mb-4">This will prevent any content from this game from appearing on the public Best Of page.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setHideGameConfirm(false)} className="btn-secondary flex-1 py-2 text-sm">Cancel</button>
                    <button onClick={handleHideGame} className="btn-primary flex-1 py-2 text-sm bg-red-700 hover:bg-red-800">Confirm</button>
                  </div>
                </div>
              </div>
            )}
            <div className="summary-header card">
              <div className="flex flex-col gap-1">
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">Round Complete</p>
                <h2 className="text-2xl font-black text-white leading-tight">Vote for the best question/answer pair</h2>
                <p className="text-sm text-gray-400">Scroll through and vote for the best game-paired combo</p>
              </div>
              {isHost && (
                <div className="summary-header__meta">
                  <div>
                    <p className="summary-pill">Players</p>
                    <p className="summary-meta-value">{players.length}</p>
                  </div>
                  <div>
                    <p className="summary-pill">Finished Round</p>
                    <p className={"summary-meta-value " + (summaryAnonymousMode ? "text-amber-300" : "text-emerald-300")}>{summaryAnonymousMode ? "Anonymous" : "Names shown"}</p>
                    <p className="summary-meta-note">Captured when the round ended</p>
                  </div>
                  <div>
                    <p className="summary-pill">Next Round Setting</p>
                    <p className={"summary-meta-value " + (anonymousMode ? "text-amber-300" : "text-emerald-300")}>{anonymousMode ? "Anonymous" : "Names shown"}</p>
                    <p className="summary-meta-note">Host toggle updates this for the upcoming game</p>
                  </div>
                </div>
              )}
            </div>

            {fastestTyper && (
              <div className="summary-fastest card">
                <div className="summary-fastest__icon">🏆</div>
                <div>
                  <p className="text-sm text-amber-200">Fastest typer in both rounds</p>
                  <p className="text-xl font-extrabold text-white">{fastestTyper}</p>
                  <p className="text-xs text-amber-100/70">Crushed both the question and answer timers.</p>
                </div>
                <div className="summary-fastest__badge">Fastest Typer!</div>
              </div>
            )}

            <div className="summary-scroll">
              {gameSummary && gameSummary.length > 0 ? (
                <div className="summary-grid">
                  {gameSummary.map((pair, i) => {
                    const maskNames = typeof summaryAnonymousMode === 'boolean' ? summaryAnonymousMode : anonymousMode
                    const questionAuthor = maskNames ? '???' : (pair.questionAuthorName || 'Unknown')
                    const pairedAuthor = maskNames ? '???' : (pair.pairedAnswerAuthorName || 'Unknown')
                    const actualAuthor = maskNames ? '???' : (pair.actualAnswerAuthorName || 'Unknown')
                    const pairKey = pair.pairDbId || `${pair.question}-${i}`
                    const voteCount = pair.pairDbId ? (summaryVotes[pair.pairDbId] || 0) : 0
                    const hasPairId = Boolean(pair.pairDbId)
                    const userVotedForPair = hasPairId ? Boolean(userVotes[pair.pairDbId]) : false
                    const userLockedToDifferentPair = summaryPairVoteId && hasPairId && summaryPairVoteId !== pair.pairDbId
                    const inFlight = pendingVoteRef.current && pendingVoteRef.current.type === 'qa_pair' && pendingVoteRef.current.targetId === pair.pairDbId
                    const voteDisabled = userLockedToDifferentPair || inFlight

                    return (
                      <article key={pairKey} id={hasPairId ? `pair-${pair.pairDbId}` : undefined} className={"summary-card " + (userVotedForPair ? "summary-card--active" : "")}>
                        <div className="summary-card__body">
                          <div className="summary-pill summary-pill--accent">
                            <span className="text-xs font-semibold tracking-widest">Game Pairing</span>
                          </div>
                          <p className="summary-question">{pair.question}</p>
                          <div className="summary-paired">
                            <p className="summary-paired__label">Performed with</p>
                            <p className="summary-paired__answer">{pair.pairedAnswer || 'No pairing was performed'}</p>
                          </div>
                          <div className="summary-authors">
                            <span>Q by {questionAuthor}</span>
                            {pair.pairedAnswer && <span>↗ Paired by {pairedAuthor}</span>}
                          </div>
                        </div>

                        <div className="summary-card__footer">
                          <div className="summary-vote-meta">
                            <span className="text-gray-400 text-xs uppercase tracking-widest">Live Votes</span>
                            <p className="text-2xl font-black text-amber-300">{voteCount}</p>
                            {userVotedForPair && (<span className="you-badge">You</span>)}
                          </div>
                          {hasPairId ? (
                            <button
                              onClick={() => handleVote('qa_pair', pair.pairDbId)}
                              className={`summary-vote-btn ${
                                userVotedForPair ? 'summary-vote-btn--active' : ''
                              } ${voteDisabled ? 'summary-vote-btn--disabled' : ''}`}
                              title="Vote for best game pairing"
                              disabled={voteDisabled}
                              aria-busy={inFlight ? 'true' : 'false'}
                            >
                              {userVotedForPair ? 'Voted (click to undo)' : userLockedToDifferentPair ? 'Already voted' : 'Vote for this pairing'}
                            </button>
                          ) : (
                            <button disabled className="summary-vote-btn summary-vote-btn--disabled">Voting unavailable</button>
                          )}
                        </div>

                        <div className="summary-actual">
                          <p className="summary-actual__label">Actual Answer</p>
                          <p className="summary-actual__text">{pair.actualAnswer}</p>
                          {pair.actualAnswerAuthorName && (
                            <p className="summary-actual__author">— {actualAuthor}</p>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="card text-center py-6">
                  <p className="text-sm text-gray-400">No pairings available. Finish a round to unlock voting.</p>
                </div>
              )}
            </div>

            {isHost ? (
              <div className="summary-actions">
                <div className="summary-actions__toggles">
                  <div className="summary-toggle card">
                    <div>
                      <p className="text-xs text-white font-semibold">Anonymous Results (next round)</p>
                      <p className="text-[11px] text-gray-400">Toggling only affects future summaries + Best Of.</p>
                    </div>
                    <button onClick={() => socketRef.current?.emit("toggle-anonymous")} className={"toggle-switch " + (anonymousMode ? "toggle-switch--on" : "")}> 
                      <span />
                    </button>
                  </div>
                  <div className="summary-toggle card">
                    <div>
                      <p className="text-xs text-white font-semibold">No Self-Reading</p>
                      <p className="text-[11px] text-gray-400">Keep performances anonymous next round.</p>
                    </div>
                    <button onClick={() => setNoSelfReading(!noSelfReading)} className={"toggle-switch " + (noSelfReading ? "toggle-switch--on" : "")}>
                      <span />
                    </button>
                  </div>
                  <button onClick={() => { setNotice(noticeFor('Starting new game…', 'info', 1000)); socketRef.current?.emit("replay-game", { noSelfReading }) }} className="summary-quick-btn order-first">
                    🔄 Replay (same players)
                  </button>
                </div>
                <div className="summary-actions__cta">
                  <button onClick={disbandGame} className="btn-secondary py-3 text-sm whitespace-normal leading-tight">
                    🏠 New game (change number of players)
                  </button>
                  <button onClick={() => setHideGameConfirm(true)} className="summary-hide-btn">
                    🚫 Hide from Best Of
                  </button>
                </div>
              </div>
            ) : (null)}
          </div>
        )

      case "help":
        return (
          <div className="game-container py-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-white">Help & Info</h2>
              <button onClick={() => setGameState("welcome")} className="text-gray-400 hover:text-white text-sm">
                ✕ Close
              </button>
            </div>
            
            <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
              {[
                { id: "how-to-play", label: "How to Play", icon: "📝" },
                { id: "faq", label: "FAQ", icon: "❓" },
                { id: "tips", label: "Tips & Tricks", icon: "💡" },
                { id: "about", label: "About", icon: "📖" }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setHelpTab(tab.id)}
                  className={"flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors " + 
                    (helpTab === tab.id 
                      ? "bg-indigo-600 text-white" 
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700")}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            <div className="card flex-1 min-h-0 overflow-y-auto py-3 px-4">
              {helpTab === "how-to-play" && (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <div className="w-10 h-10 mx-auto mb-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                      <span className="text-xl">🎮</span>
                    </div>
                    <h3 className="text-base font-bold text-white">Quick Overview</h3>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    Fluke! The Game is a party game where you write absurd questions, give each other ridiculous answers, then perform the results. It's like Cards Against Humanity meets improv comedy, but with more chaos and less reading from cards.
                  </p>
                  
                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">Getting Started</h4>
                    <ol className="space-y-2 text-sm text-gray-300">
                      <li className="flex gap-2">
                        <span className="text-indigo-400 font-bold">1.</span>
                        <span><strong>Join or Create a Room</strong> - Enter a 4-digit room code to join a friend's game, or create your own room and share the code</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-indigo-400 font-bold">2.</span>
                        <span><strong>Wait for Players</strong> - You need at least 3 players to start (max 15)</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-indigo-400 font-bold">3.</span>
                        <span><strong>Host Starts the Game</strong> - Only the host can click "Start Game"</span>
                      </li>
                    </ol>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">Phase 1: Question Writing 📝</h4>
                    <ul className="space-y-1 text-sm text-gray-300">
                      <li>• Everyone writes a "What if..." question</li>
                      <li>• Be creative! The weirder, the better</li>
                      <li>• Example: "What if cats could talk but only about taxes?"</li>
                      <li>• You have a time limit, so don't overthink it!</li>
                    </ul>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">Phase 2: Answer Writing 🤔</h4>
                    <ul className="space-y-1 text-sm text-gray-300">
                      <li>• Each person gets someone else's question to answer</li>
                      <li>• You won't see who wrote the question (unless anonymous mode is off)</li>
                      <li>• Give the most ridiculous answer you can think of</li>
                      <li>• Example: "They'd form a union and demand deductions for naps"</li>
                    </ul>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">Phase 3: Performance Time 🎭</h4>
                    <ul className="space-y-1 text-sm text-gray-300">
                      <li>• One person at a time reads the question and their assigned answer</li>
                      <li>• Perform it! Add flair, voices, dramatic pauses</li>
                      <li>• The host can skip turns if someone is taking too long</li>
                      <li>• Everyone votes on their favorite performance (coming soon!)</li>
                    </ul>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">Game Over 🎉</h4>
                    <ul className="space-y-1 text-sm text-gray-300">
                      <li>• See the full summary of all questions and answers</li>
                      <li>• Find out who wrote what (unless anonymous mode is on)</li>
                      <li>• Play again with the same group or start fresh!</li>
                    </ul>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">Host Controls</h4>
                    <p className="text-xs text-gray-500 mb-2">(Only the host sees these)</p>
                    <ul className="space-y-1 text-sm text-gray-300">
                      <li>• <strong>Anonymous Results</strong> - Hide names in the end-game summary for extra mystery</li>
                      <li>• <strong>No Self-Reading</strong> - Ensure players never perform their own content</li>
                      <li>• <strong>Force Advance</strong> - Skip waiting for stragglers (they get removed, so use carefully!)</li>
                      <li>• <strong>Kick Player</strong> - Remove someone who's being a party pooper</li>
                    </ul>
                  </div>
                </div>
              )}

              {helpTab === "faq" && (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <div className="w-10 h-10 mx-auto mb-2 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-lg flex items-center justify-center">
                      <span className="text-xl">❓</span>
                    </div>
                    <h3 className="text-base font-bold text-white">Frequently Asked Questions</h3>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-indigo-400 mb-1">How many players do I need?</h4>
                      <p className="text-sm text-gray-300">At least 3 players, up to 15. The more players, the more chaos (and fun)!</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-indigo-400 mb-1">How long does a game take?</h4>
                      <p className="text-sm text-gray-300">Usually 20-40 minutes depending on how many players and how dramatic everyone gets during the performance phase.</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-indigo-400 mb-1">Can I play with friends who aren't in the same room?</h4>
                      <p className="text-sm text-gray-300">Absolutely! Just share your 4-digit room code with them. They can join from anywhere.</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-indigo-400 mb-1">What if someone disconnects?</h4>
                      <p className="text-sm text-gray-300">Don't panic! They have 90 seconds to reconnect. If they don't make it back in time, they'll be removed from the game (but their questions/answers stay in the game).</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-indigo-400 mb-1">Can we play again with the same group?</h4>
                      <p className="text-sm text-gray-300">Yes! After the game ends, the host can click "New game with same players" to keep the party going.</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-indigo-400 mb-1">What are those toggle things only the host sees?</h4>
                      <p className="text-sm text-gray-300">
                        <strong>Anonymous Results</strong> - Hides everyone's names in the final summary, so you won't know who wrote what until after you vote (or never, if you want to keep it mysterious)
                        <br /><br />
                        <strong>No Self-Reading</strong> - Makes sure nobody ever has to perform their own question or answer during the performance phase. Great for avoiding awkward moments.
                      </p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-indigo-400 mb-1">Is this game free?</h4>
                      <p className="text-sm text-gray-300">Yes! 100% free. No ads, no microtransactions, no hidden fees. Just pure, unadulterated chaos.</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-indigo-400 mb-1">Can I play on my phone?</h4>
                      <p className="text-sm text-gray-300">Yep! The game works on any device with a web browser. Mobile, tablet, desktop - whatever you've got.</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-indigo-400 mb-1">What if someone is taking forever to write their question/answer?</h4>
                      <p className="text-sm text-gray-300">The host has a "Force Advance" button that skips the waiting period. Anyone who hasn't submitted gets removed from the game (their content stays, though). Use this power responsibly!</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-indigo-400 mb-1">Can I kick a player?</h4>
                      <p className="text-sm text-gray-300">Only the host can kick players. Click the "X" next to their name in the lobby. They won't be able to rejoin that game.</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-indigo-400 mb-1">What's the difference between "New game with same players" and "New game (change players)"?</h4>
                      <p className="text-sm text-gray-300">
                        <strong>New game with same players</strong> - Everyone stays in the room, ready for round 2
                        <br /><br />
                        <strong>New game (change players)</strong> - Clears the room so you can start fresh with new people
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {helpTab === "tips" && (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <div className="w-10 h-10 mx-auto mb-2 bg-gradient-to-br from-green-500 to-teal-600 rounded-lg flex items-center justify-center">
                      <span className="text-xl">💡</span>
                    </div>
                    <h3 className="text-base font-bold text-white">Tips & Tricks</h3>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">For Question Writers 🖊️</h4>
                    <ul className="space-y-1 text-sm text-gray-300">
                      <li>• <strong>Think absurd, not realistic</strong> - "What if gravity reversed for 5 seconds?" is better than "What if it rained tomorrow?"</li>
                      <li>• <strong>Keep it open-ended</strong> - Questions that can go in wild directions are more fun</li>
                      <li>• <strong>Draw from your life</strong> - The funniest prompts often come from weird thoughts you've actually had</li>
                      <li>• <strong>Don't be afraid to be silly</strong> - This is a party game, not a philosophy exam</li>
                      <li>• <strong>Avoid inside jokes</strong> - Unless everyone in the group will get it, keep it universally weird</li>
                    </ul>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">For Answer Writers 💡</h4>
                    <ul className="space-y-1 text-sm text-gray-300">
                      <li>• <strong>Commit to the bit</strong> - If the question is absurd, give an equally absurd answer</li>
                      <li>• <strong>Be specific</strong> - "They'd hire a tax lawyer" is okay, but "They'd form a feline tax union and demand nap deductions" is better</li>
                      <li>• <strong>Surprise yourself</strong> - Try to come up with something you wouldn't normally think of</li>
                      <li>• <strong>Read it out loud</strong> - If it's not funny when you say it, it won't be funny when someone performs it</li>
                      <li>• <strong>Embrace the chaos</strong> - The weirder the answer, the better the performance will be</li>
                    </ul>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">For Performers 🎭</h4>
                    <ul className="space-y-1 text-sm text-gray-300">
                      <li>• <strong>Commit 100%</strong> - Even if the answer is ridiculous, sell it like it's the most profound thing ever said</li>
                      <li>• <strong>Use voices</strong> - Accents, character voices, dramatic readings - anything to make it memorable</li>
                      <li>• <strong>Add physical comedy</strong> - Hand gestures, facial expressions, dramatic pauses</li>
                      <li>• <strong>Don't rush</strong> - Build tension, make people wait for the punchline</li>
                      <li>• <strong>Have fun with it</strong> - The more you enjoy performing, the more everyone else will enjoy watching</li>
                    </ul>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">For Hosts 🎮</h4>
                    <ul className="space-y-1 text-sm text-gray-300">
                      <li>• <strong>Use Anonymous mode for mystery</strong> - It adds an extra layer of fun when nobody knows who wrote what</li>
                      <li>• <strong>Enable No Self-Reading</strong> - It's almost always better to avoid people performing their own content</li>
                      <li>• <strong>Be patient with Force Advance</strong> - Only use it if someone is clearly AFK or taking way too long</li>
                      <li>• <strong>Keep the energy up</strong> - If things are dragging, encourage people to be more dramatic</li>
                      <li>• <strong>Kick only when necessary</strong> - Nobody likes being kicked, so save it for actual problem players</li>
                    </ul>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">General Advice 🌟</h4>
                    <ul className="space-y-1 text-sm text-gray-300">
                      <li>• <strong>The funnier, the better</strong> - This game rewards creativity and humor</li>
                      <li>• <strong>Don't take it seriously</strong> - The moment someone gets competitive or upset, the fun dies</li>
                      <li>• <strong>Laugh at everything</strong> - Even bad answers can become great with the right performance</li>
                      <li>• <strong>Play with the right people</strong> - This game is best with friends who can laugh at themselves</li>
                      <li>• <strong>Embrace the awkward</strong> - The most memorable moments often come from the most ridiculous combinations</li>
                    </ul>
                  </div>
                </div>
              )}

              {helpTab === "about" && (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <div className="w-10 h-10 mx-auto mb-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                      <span className="text-xl">📖</span>
                    </div>
                    <h3 className="text-base font-bold text-white">About / The Story</h3>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">The Origin Story</h4>
                    <p className="text-sm text-gray-300 leading-relaxed mb-3">
                      Fluke! The 'What If...?' Game didn't start as an app - it started as a stack of napkins and a pen at a house party.
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed mb-3">
                      One night, hanging out with friends, someone asked a completely ridiculous question: "What if dogs could only communicate through interpretive dance?" We spent the next hour answering it, then coming up with more absurd questions and even more ridiculous answers. We were laughing so hard our faces hurt.
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      That night became a tradition. Every time we hung out, someone would inevitably ask "What if..." and we'd spend hours exploring the weirdest hypothetical scenarios we could think of. It became our go-to icebreaker at parties, our way to break the tension after a long week, our secret weapon for making new friends feel welcome.
                    </p>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">Why I Built It</h4>
                    <p className="text-sm text-gray-300 leading-relaxed mb-3">
                      After playing this game for years with pen, paper, and way too many napkins, I realized something: this shouldn't just be for us. The whole world deserves to laugh as hard as we have.
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed mb-3">
                      So I decided to replicate the experience digitally as Fluke! The 'What If...?' Game. No more passing around a single notebook. No more trying to read someone else's handwriting. No more losing the best questions because someone spilled their drink.
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      Fluke! The 'What If...?' Game is my gift to the internet. It's the icebreaker that never gets old, the party game that works with any group, the excuse to be absurd that everyone needs.
                    </p>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">The Philosophy</h4>
                    <p className="text-sm text-gray-300 leading-relaxed mb-3">
                      Life is serious enough. Work is stressful enough. The news is heavy enough.
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed mb-3">
                      Sometimes, you just need to ask: What if?
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed mb-3">
                      What if aliens invaded but they were just really confused tourists?
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed mb-3">
                      What if your pet could talk but only about their dreams?
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed mb-3">
                      What if time travel was real but you could only travel to really awkward moments in history?
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      The answers don't matter. The point is the laughter, the creativity, the connection with other human beings who are all just trying to make sense of this weird world together.
                    </p>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">Credits</h4>
                    <p className="text-sm text-gray-300 leading-relaxed mb-2">
                      Built with love, laughter, and way too much coffee.
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed mb-2">
                      Inspired by countless nights with friends who are way funnier than I am.
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      Made possible by everyone who ever asked "What if..." and meant it.
                    </p>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">Thank You</h4>
                    <p className="text-sm text-gray-300 leading-relaxed mb-2">
                      To everyone who played the pen-and-paper version and didn't tell me I was crazy.
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed mb-2">
                      To everyone who's played the digital version and kept the chaos alive.
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      To you, for reading this and (hopefully) about to play the game.
                    </p>
                  </div>

                  <div className="text-center pt-4">
                    <span className="text-4xl">🎉</span>
                  </div>
                </div>
              )}
            </div>

            <button onClick={() => setGameState("welcome")} className="btn-secondary py-3 text-sm w-full mt-3">
              Back to Main Screen
            </button>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900 relative">
      {notice && (
        <div
          className={"notice-banner " + (notice.tone === "success" ? "notice-banner--success" : notice.tone === "warn" ? "notice-banner--warn" : "notice-banner--info")}
          role="status"
          aria-live="polite"
        >
          <span>{notice.message}</span>
        </div>
      )}
      {showCountdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="bg-black/70 border border-gray-700 rounded-2xl px-8 py-6 text-center">
            <div className="text-5xl font-black text-white">{countdown}</div>
            {isHost && (
              <button onClick={() => { setShowCountdown(false); setCountdown(0) }} className="mt-3 text-xs text-indigo-300 underline">
                Skip
              </button>
            )}
          </div>
        </div>
      )}
      {showBackToTop && (
        <button
          className="back-to-top"
          aria-label="Back to top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          title="Back to top"
        >↑</button>
      )}
      {renderContent()}
    </div>
  )
}

export default App
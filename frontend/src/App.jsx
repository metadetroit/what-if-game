import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { io } from "socket.io-client"
import LandingPage from "./LandingPage"

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin

// Notice channel: tone is "success" | "info" | "warn" — not the same as a hard error.
// Pass durationMs = null for a persistent notice that must be cleared manually.
function noticeFor(message, tone = "info", durationMs = 3000) {
  return { message, tone, expiresAt: durationMs == null ? null : Date.now() + durationMs }
}

function draftKey(roomCode, phase) {
  return `whatif-draft:${roomCode}:${phase}`
}

// Persisted session + drafts use localStorage so they survive a mobile browser
// killing/evicting a backgrounded tab (sessionStorage is wiped on full tab close).
const SESSION_KEY = "gameSession"
// TTL keeps a returning player auto-rejoining within a reasonable window while
// avoiding stale auto-rejoins to long-dead rooms (the server is the final authority).
const SESSION_TTL_MS = 1000 * 60 * 3 // 3 minutes — matches server reconnection grace period

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw)
    if (!session || !session.roomCode || !session.playerName) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    if (session.timestamp && Date.now() - session.timestamp > SESSION_TTL_MS) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return session
  } catch (e) {
    return null
  }
}

function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, timestamp: Date.now() }))
  } catch (e) { /* ignore */ }
}

function touchSession() {
  const session = loadSession()
  if (session) saveSession(session)
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY) } catch (e) { /* ignore */ }
}

function saveDraft(roomCode, phase, value) {
  try { localStorage.setItem(draftKey(roomCode, phase), value) } catch (e) { /* ignore */ }
}

function loadDraft(roomCode, phase) {
  try { return localStorage.getItem(draftKey(roomCode, phase)) } catch (e) { return null }
}

function clearDraft(roomCode, phase) {
  try { localStorage.removeItem(draftKey(roomCode, phase)) } catch (e) { /* ignore */ }
}

// Human-readable label naming the player(s) currently disconnected.
function waitingForLabel(names) {
  if (!names || names.length === 0) return ""
  if (names.length === 1) return `${names[0]} disconnected — waiting for them to reconnect…`
  return `${names.join(", ")} disconnected — waiting for them to reconnect…`
}

function formatTimeLeft(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

// Simple Web Audio API tone generator (no external assets).
// AudioContext is lazily created on first user interaction to avoid autoplay blocks.
let audioCtx = null
function ensureAudioContext() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)() } catch (e) { /* ignore */ }
  }
  return audioCtx
}

function isSoundMuted() {
  try { return localStorage.getItem("fluke-muted") === "1" } catch (e) { return false }
}

function writeSoundMuted(muted) {
  try { localStorage.setItem("fluke-muted", muted ? "1" : "0") } catch (e) { /* ignore */ }
}

function getPrefillWhatIf() {
  try { return localStorage.getItem("fluke-prefill") === "1" } catch (e) { return false }
}

function setPrefillWhatIfStorage(enabled) {
  try { localStorage.setItem("fluke-prefill", enabled ? "1" : "0") } catch (e) { /* ignore */ }
}

function playSound(type) {
  if (isSoundMuted()) return
  const ctx = ensureAudioContext()
  if (!ctx) return
  if (ctx.state === "suspended") ctx.resume()

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)

  const now = ctx.currentTime
  switch (type) {
    case "ding": // your turn
      osc.type = "sine"
      osc.frequency.setValueAtTime(523, now)
      osc.frequency.exponentialRampToValueAtTime(784, now + 0.1)
      gain.gain.setValueAtTime(0.15, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
      osc.start(now)
      osc.stop(now + 0.3)
      break
    case "chime": // phase transition / all submitted
      osc.type = "sine"
      osc.frequency.setValueAtTime(440, now)
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.15)
      gain.gain.setValueAtTime(0.12, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
      osc.start(now)
      osc.stop(now + 0.4)
      break
    case "success": // vote for your pairing / reconnected
      osc.type = "sine"
      osc.frequency.setValueAtTime(523, now)
      osc.frequency.setValueAtTime(659, now + 0.1)
      osc.frequency.setValueAtTime(784, now + 0.2)
      gain.gain.setValueAtTime(0.12, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
      osc.start(now)
      osc.stop(now + 0.5)
      break
    case "warn": // subtle alert
      osc.type = "triangle"
      osc.frequency.setValueAtTime(300, now)
      osc.frequency.linearRampToValueAtTime(200, now + 0.2)
      gain.gain.setValueAtTime(0.08, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
      osc.start(now)
      osc.stop(now + 0.25)
      break
    default:
      osc.stop(now)
  }
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
  const [mostAdoredWriter, setMostAdoredWriter] = useState(null) // { name, total, tied } from backend
  const [roundHistory, setRoundHistory] = useState([]) // Past round summaries
  const [showRoundHistory, setShowRoundHistory] = useState(false)
  const [expandedHistoryRounds, setExpandedHistoryRounds] = useState(new Set())
  const [soundMuted, setSoundMuted] = useState(() => { try { return localStorage.getItem("fluke-muted") === "1" } catch (e) { return false } })
  const [prefillWhatIf, setPrefillWhatIf] = useState(() => getPrefillWhatIf())
  const [tick, setTick] = useState(0) // Forces re-render every second for live countdowns
  const [reactions, setReactions] = useState([]) // { id, emoji, x, y, createdAt }
  const [reactionCounts, setReactionCounts] = useState({}) // { contentDbId: { emoji: count } }
  const [myReactions, setMyReactions] = useState(new Set()) // Set<contentDbId> that this player reacted to
  const [currentContent, setCurrentContent] = useState(null) // { dbId, authorId, type } for the currently-read content
  const [bestOfData, setBestOfData] = useState(null) // Data for best of page
  const [votersCount, setVotersCount] = useState(0)
  const [hideGameConfirm, setHideGameConfirm] = useState(false) // Confirmation for hiding game from best of
  const [bestOfSort, setBestOfSort] = useState(() => sessionStorage.getItem('bestOfSort') || 'votes')
  const [bestOfLimit, setBestOfLimit] = useState(20)
  const [bestOfOffset, setBestOfOffset] = useState(0)
  const [bestOfHasMore, setBestOfHasMore] = useState(true)
  const [bestOfLoading, setBestOfLoading] = useState(false)
  const scrollBestOfIdRef = useRef(null)
  const wakeLockRef = useRef(null)
  const bestOfSentinelRef = useRef(null)
  const bestOfScrollRef = useRef(null)
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
  const playerNameRef = useRef("")
  // Names of OTHER players currently disconnected (within their reconnect grace window).
  const disconnectedPlayersRef = useRef([])
  const disconnectDeadlineRef = useRef(null)
  const disconnectNoticeTimerRef = useRef(null)
  const prefillWhatIfRef = useRef(getPrefillWhatIf())
  const skipNextCountdownRef = useRef(false)

  useEffect(() => { roomCodeRef.current = roomCode }, [roomCode])
  useEffect(() => { prefillWhatIfRef.current = prefillWhatIf }, [prefillWhatIf])
  useEffect(() => { gameStateRef.current = gameState }, [gameState])
  useEffect(() => { playerNameRef.current = playerName }, [playerName])
  // Outside an active game there is no one to "wait for" — clear the disconnected list.
  const activeGameplayStates = ["lobby", "writing", "answering", "performing"]
  useEffect(() => {
    if (!activeGameplayStates.includes(gameState)) {
      disconnectedPlayersRef.current = []
      disconnectDeadlineRef.current = null
      if (disconnectNoticeTimerRef.current) {
        clearTimeout(disconnectNoticeTimerRef.current)
        disconnectNoticeTimerRef.current = null
      }
    }
  }, [gameState])

  // Auto-clear notice
  useEffect(() => {
    if (!notice) return
    if (notice.expiresAt == null) return // persistent notice; cleared manually
    const remaining = Math.max(0, notice.expiresAt - Date.now())
    const t = setTimeout(() => setNotice(null), remaining)
    return () => clearTimeout(t)
  }, [notice])

  // Live countdown tick — increments every second so the notice banner can render a live timer.
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (gameState !== 'ended') {
      setVotersCount(0)
      setSummaryVotes({})
      setSummaryPairVoteId(null)
    }
  }, [gameState])

  useEffect(() => {
    if (gameState === 'ended' && gameSummary && Array.isArray(gameSummary)) {
      const derivedVotes = {}
      gameSummary.forEach(pair => {
        if (pair.pairDbId && typeof pair.voteCount === 'number') {
          derivedVotes[pair.pairDbId] = pair.voteCount
        }
      })
      setSummaryVotes(prev => ({ ...derivedVotes, ...prev }))
    }
  }, [gameState, gameSummary])

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
        setBestOfData(prev => {
          if (!Array.isArray(prev)) return data
          const seen = new Set(prev.map(i => `${i.type}:${i.id}`))
          const deduped = data.filter(i => !seen.has(`${i.type}:${i.id}`))
          return [...prev, ...deduped]
        })
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
    const root = bestOfScrollRef.current || null
    const io = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry.isIntersecting && bestOfHasMore && !bestOfLoading) {
        const nextOffset = bestOfOffset + bestOfLimit
        setBestOfOffset(nextOffset)
        fetchBestOfData({ offset: nextOffset })
      }
    }, { root, rootMargin: '0px 0px 400px 0px', threshold: 0.01 })
    io.observe(sentinel)
    return () => io.disconnect()
  }, [gameState, bestOfHasMore, bestOfLoading, bestOfOffset, bestOfLimit, bestOfSort, bestOfData])

  useEffect(() => {
    if (gameState !== 'best-of') { setShowBackToTop(false); return }
    const container = bestOfScrollRef.current
    if (!container) return
    const onScroll = () => setShowBackToTop(container.scrollTop > 200)
    container.addEventListener('scroll', onScroll)
    onScroll()
    return () => container.removeEventListener('scroll', onScroll)
  }, [gameState, bestOfData])

  useEffect(() => {
    if (["writing", "answering", "performing"].includes(gameState)) {
      if (skipNextCountdownRef.current) {
        skipNextCountdownRef.current = false
        return
      }
      setShowCountdown(true)
      setCountdown(3)
      const iv = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) { clearInterval(iv); setShowCountdown(false); return 0 }
          return c - 1
        })
      }, 1000)
      return () => { clearInterval(iv); setShowCountdown(false) }
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

  const handleDeleteBestOf = async (type, id, index) => {
    try {
      const response = await fetch(`${SOCKET_URL}/api/delete-best-of`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id })
      })
      const result = await response.json()
      if (result.success) {
        setBestOfData(prev => prev.filter((_, i) => i !== index))
        setNotice(noticeFor('Item deleted from Best Of', 'success', 2000))
      } else {
        setNotice(noticeFor('Failed to delete item', 'warn', 3000))
      }
    } catch (error) {
      console.error('Failed to delete best-of item:', error)
      setNotice(noticeFor('Failed to delete item', 'warn', 3000))
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
    const newSocket = io(SOCKET_URL, {
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    })
    setSocket(newSocket)
    socketRef.current = newSocket

    newSocket.on("connect", () => {
      console.log("Connected to server")
      const activeGameplay = ['lobby', 'writing', 'answering', 'performing'].includes(gameStateRef.current)
      // Clear the persistent "Connection lost" notice now that we're back online.
      if (activeGameplay) {
        setNotice(noticeFor("Back online", "success", 1500))
      } else {
        setNotice((prev) => (prev && prev.tone === "warn" ? null : prev))
      }

      const session = loadSession()
      if (!session) {
        console.log("No saved session found")
        return
      }
      // Guard: only attempt reconnect-player once per session entry, even if
      // socket.io fires multiple "connect" events (transport upgrade, etc.).
      if (reconnectAttemptedRef.current) {
        console.log("Reconnect already attempted - skipping duplicate emit")
        return
      }
      reconnectAttemptedRef.current = true
      if (gameStateRef.current !== "welcome") {
        // Mid-session reconnect (e.g. phone woke up): re-register silently without showing the prompt
        console.log("Mid-game socket reconnect — auto-emitting reconnect-player")
        newSocket.emit("reconnect-player", { roomCode: session.roomCode, playerName: session.playerName })
      } else {
        console.log("Prompting reconnect to room:", session.roomCode, "for player:", session.playerName)
        setReconnectPrompt({ roomCode: session.roomCode, playerName: session.playerName })
      }
    })

    newSocket.on("disconnect", () => {
      console.log("Socket disconnected")
      // CRITICAL: reset so the next 'connect' event can re-emit reconnect-player
      reconnectAttemptedRef.current = false
      // Only show notice during active gameplay; welcome/summary screens stay silent.
      // Persistent (no auto-expiry) so it stays visible until we actually reconnect.
      const activeGameplay = ['lobby', 'writing', 'answering', 'performing'].includes(gameStateRef.current)
      if (activeGameplay) {
        setNotice(noticeFor("You disconnected. If you don't automatically reconnect, try refreshing your screen.", "warn", null))
      }
      touchSession()
    })

    const handleBeforeUnload = () => {
      touchSession()
    }
    window.addEventListener("beforeunload", handleBeforeUnload)

    // Re-validate our presence with the server after the page becomes visible
    // again (phone wake-up / tab switch) or is restored from the bfcache.
    const revalidatePresence = () => {
      const state = gameStateRef.current
      if (state === "welcome" || state === "reconnect-failed") return
      const session = loadSession()
      if (!session) return
      if (socketRef.current?.connected) {
        console.log("[presence] Page active — sending check-presence")
        socketRef.current.emit("check-presence", { roomCode: session.roomCode, playerName: session.playerName })
      } else {
        // Socket not connected yet — ensure reconnect-player fires when it does
        reconnectAttemptedRef.current = false
        console.log("[presence] Page active — socket offline, cleared reconnect flag")
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return
      revalidatePresence()
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    // iOS Safari restores pages from the back/forward cache without firing
    // "connect"; pageshow is a more reliable trigger to re-validate presence.
    const handlePageShow = () => {
      revalidatePresence()
    }
    window.addEventListener("pageshow", handlePageShow)

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
    newSocket.on("player-left", (payload) => {
      updatePlayersAndHost(payload)
      // A player was removed (left/abandoned, or dropped after the grace window).
      // Stop showing any stale "waiting for…" notice for disconnected players.
      if (disconnectedPlayersRef.current.length > 0) {
        disconnectedPlayersRef.current = []
        disconnectDeadlineRef.current = null
        if (disconnectNoticeTimerRef.current) {
          clearTimeout(disconnectNoticeTimerRef.current)
          disconnectNoticeTimerRef.current = null
        }
        setNotice((prev) => (prev && prev.expiresAt == null && (prev.tone === "warn" || prev.tone === "info") ? null : prev))
      }
    })
    newSocket.on("game-started", (data) => { setGameState("writing"); setSubmitted(false); setFirstSubmitter(null); setCurrentContent(null); setMyReactions(new Set()); setReactionCounts({}); setProgress({ submitted: 0, total: data.totalPlayers || players.length }); const prefill = prefillWhatIfRef.current; setQuestion(prefill ? "What if" : ""); if (prefill) saveDraft(roomCodeRef.current, "writing", "What if"); playSound("chime"); if (typeof data.anonymousMode === "boolean") setAnonymousMode(data.anonymousMode) })
    newSocket.on("progress-update", (data) => {
      console.log("Progress-update received:", data)
      setProgress(data)
      if (data.playerStatuses) { setPlayerStatuses(data.playerStatuses) }
      // Sounds only at phase transitions, not on all-submitted
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
      playSound("chime")
      setProgress({ submitted: 0, total: players.length })
      setPlayerStatuses(players.map(p => ({ name: p.name, submitted: false })))
      setFirstSubmitter(null)
      setShowLastSubmitterIndicator(false)
    })

    newSocket.on("performance-phase", (data) => {
      setGameState("performing")
      setGameStats({ round: 1, total: data.totalRounds })
      setReactionCounts({})
      setMyReactions(new Set())
      setCurrentContent(null)
      playSound("chime")
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
      // Track what content is currently being read (for reaction self-checks)
      if (data.currentContentDbId) {
        setCurrentContent({
          dbId: data.currentContentDbId,
          authorId: data.currentContentAuthorId,
          type: data.currentContentType
        })
      }
      // No sounds between individual readings to avoid interrupting the flow
      // Reset performance votes for new turn
      setPerformanceVotes({})
    })

    newSocket.on("reaction", (data) => {
      const id = Math.random().toString(36).slice(2)
      setReactions(prev => [...prev, { id, emoji: data.emoji, x: data.x, y: data.y, createdAt: Date.now() }])
    })

    newSocket.on("reaction-counts", (data) => {
      setReactionCounts(prev => ({ ...prev, [data.contentDbId]: data.counts }))
    })

    newSocket.on("vote-update", (data) => {
      setSummaryVotes(prev => ({
        ...prev,
        [data.targetId]: data.voteCount
      }))
      if (typeof data.votersCount === 'number') setVotersCount(data.votersCount)
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
        }
        setNotice(noticeFor(isVoted ? 'Vote saved' : 'Vote removed', 'success', 1200))
      } else {
        setNotice(noticeFor(data.message || 'Vote failed', 'warn', 2000))
      }
    })

    newSocket.on("game-ended", (data) => {
      setGameState("ended")
      setCurrentContent(null)
      setMyReactions(new Set())
      playSound("chime")
      if (data.summary) {
        applySummaryData(data.summary, anonymousMode)
        setRoundHistory(prev => [...prev, { summary: data.summary, anonymousMode, timestamp: Date.now() }])
      }
      if (typeof data.votersCount === 'number') setVotersCount(data.votersCount)
      if (data.mostAdoredWriter) setMostAdoredWriter(data.mostAdoredWriter)
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
      const prefill = prefillWhatIfRef.current
      setQuestion(prefill ? "What if " : "")
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
      setMostAdoredWriter(null)

      // Carry over lastQuestionSubmitter from prior round (if provided) so the "you were last" nudge shows on the writing screen after replay
      const carried = data && data.lastQuestionSubmitter ? data.lastQuestionSubmitter : null
      if (carried) {
        setLastQuestionSubmitter(carried)
        setShowLastSubmitterIndicator(false)
      }
    })

    newSocket.on("game-disbanded", (data) => {
      console.log("Game disbanded:", data.message)
      clearSession()
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
      setMostAdoredWriter(null)
    })

    newSocket.on("anonymous-toggled", (data) => {
      setAnonymousMode(data.anonymousMode)
    })

    newSocket.on("player-disconnected", (data) => {
      setPlayers(data.players)
      // Track every other player currently disconnected so the notice can name
      // all of them, and persist until they reconnect (or are removed).
      const name = data.disconnectedPlayer
      if (name && !disconnectedPlayersRef.current.includes(name)) {
        disconnectedPlayersRef.current = [...disconnectedPlayersRef.current, name]
      }
      if (typeof data.gracePeriod === "number" && !disconnectDeadlineRef.current) {
        disconnectDeadlineRef.current = Date.now() + data.gracePeriod * 1000
      }
      const activeGameplay = ['lobby', 'writing', 'answering', 'performing'].includes(gameStateRef.current)
      if (activeGameplay) {
        if (disconnectNoticeTimerRef.current) clearTimeout(disconnectNoticeTimerRef.current)
        disconnectNoticeTimerRef.current = setTimeout(() => {
          setNotice((prev) => (prev && prev.expiresAt == null && prev.tone === "warn" ? null : prev))
          disconnectNoticeTimerRef.current = null
        }, 150000)
        setNotice(noticeFor(waitingForLabel(disconnectedPlayersRef.current), "warn", null))
      }
    })

    newSocket.on("player-rejoined", (data) => {
      setPlayers(data.players)
      if (data.hostId) {
        setHostId(data.hostId)
        setIsHost(newSocket.id === data.hostId)
      }
      // Drop the reconnected player from the waiting list.
      disconnectedPlayersRef.current = disconnectedPlayersRef.current.filter((n) => n !== data.playerName)
      // Don't announce our own reconnection here — the "reconnected" handler covers that.
      if (data.playerName === playerNameRef.current) return
      const activeGameplay = ['lobby', 'writing', 'answering', 'performing'].includes(gameStateRef.current)
      const remaining = disconnectedPlayersRef.current
      if (remaining.length === 0) {
        disconnectDeadlineRef.current = null
        if (disconnectNoticeTimerRef.current) {
          clearTimeout(disconnectNoticeTimerRef.current)
          disconnectNoticeTimerRef.current = null
        }
        if (activeGameplay) {
          setNotice(noticeFor(`${data.playerName} reconnected`, "success", 2500))
        }
      } else {
        // Someone reconnected but others are still gone — keep naming who we're waiting on.
        if (activeGameplay) {
          setNotice(noticeFor(`${data.playerName} reconnected — still waiting for ${remaining.join(", ")}…`, "info", null))
        }
      }
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
      clearSession()
      // Clear any drafts for the active room
      const kickCode = roomCodeRef.current
      if (kickCode) {
        clearDraft(kickCode, "writing")
        clearDraft(kickCode, "answering")
      }
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
      setMostAdoredWriter(null)
    })

    newSocket.on("reconnected", (data) => {
      console.log("Reconnected event received:", data)
      console.log("Socket ID:", newSocket.id, "Host ID from data:", data.hostId)
      console.log("Should be host?", newSocket.id === data.hostId)
      setReconnectPrompt(null)
      // Prevent phase-start countdown from flashing when restoring an in-progress phase.
      skipNextCountdownRef.current = true
      if (data.success) {
        playSound("success")
        // Fresh authoritative state on our own reconnect — drop any stale waiting list.
        disconnectedPlayersRef.current = []
        disconnectDeadlineRef.current = null
        const savedSession = loadSession()
        if (savedSession) {
          setPlayerName(savedSession.playerName)
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
          // Restore the text of what they already submitted so they can see it
          if (data.alreadySubmittedQuestion && data.submittedQuestion?.text) {
            setQuestion(data.submittedQuestion.text)
          }
        } else {
          setSubmitted(false)
          // Try to restore in-flight drafts for the current phase
          try {
            const code = data.roomCode
            if (data.phase === "writing") {
              const draft = loadDraft(code, "writing")
              if (draft) setQuestion(draft)
            } else if (data.phase === "answering") {
              const draft = loadDraft(code, "answering")
              if (draft) setAnswer(draft)
            }
          } catch (e) { /* ignore */ }
        }
        if (data.progress) {
          setProgress({ submitted: data.progress.submitted, total: data.progress.total })
          if (data.progress.playerStatuses) setPlayerStatuses(data.progress.playerStatuses)
        }
        if (data.summary) { applySummaryData(data.summary, typeof data.anonymousMode === "boolean" ? data.anonymousMode : anonymousMode) }
        if (data.mostAdoredWriter) setMostAdoredWriter(data.mostAdoredWriter)
        if (typeof data.votersCount === 'number') setVotersCount(data.votersCount)
        if (data.currentTurn) {
          setCurrentTurn(data.currentTurn)
          if (data.currentTurn.currentContentDbId) {
            setCurrentContent({
              dbId: data.currentTurn.currentContentDbId,
              authorId: data.currentTurn.currentContentAuthorId,
              type: data.currentTurn.currentContentType
            })
          }
        }
        const activeGameplay = ['lobby', 'writing', 'answering', 'performing'].includes(data.phase)
        if (activeGameplay) {
          setNotice(noticeFor("Reconnected", "success", 2000))
        }
      } else {
        console.log("Reconnection failed:", data)
      }
    })

    // Server tells us we are no longer active in the room (detected via check-presence).
    // Silently re-emit reconnect-player so the server restores our state.
    newSocket.on("presence-stale", () => {
      const session = loadSession()
      if (!session) return
      try {
        console.log("[presence-stale] Re-registering with server")
        reconnectAttemptedRef.current = true
        newSocket.emit("reconnect-player", { roomCode: session.roomCode, playerName: session.playerName })
      } catch (e) {}
    })

    newSocket.on("reconnect-failed", (data) => {
      console.log("Reconnect failed:", data)
      clearSession()
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
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("pageshow", handlePageShow)
      newSocket.close()
    }
  }, [])

  // Screen Wake Lock: keep the screen on during active game phases so the phone
  // doesn't blank and drop the connection mid-round.
  useEffect(() => {
    const activePhases = ["writing", "answering", "performing"]
    if (!activePhases.includes(gameState) || !("wakeLock" in navigator)) {
      if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null }
      return
    }
    let cancelled = false
    navigator.wakeLock.request("screen").then(lock => {
      if (cancelled) { lock.release(); return }
      wakeLockRef.current = lock
      lock.addEventListener("release", () => { if (!cancelled) wakeLockRef.current = null })
    }).catch(() => {})
    const onVisible = () => {
      if (document.visibilityState === "visible" && activePhases.includes(gameStateRef.current) && !wakeLockRef.current) {
        navigator.wakeLock.request("screen").then(lock => {
          if (cancelled) { lock.release(); return }
          wakeLockRef.current = lock
          lock.addEventListener("release", () => { if (!cancelled) wakeLockRef.current = null })
        }).catch(() => {})
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisible)
      if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null }
    }
  }, [gameState])

  const createRoom = useCallback(() => {
    if (!playerName.trim()) { setError("Please enter your name"); return }
    if (!socket) { setError("Not connected to server"); return }
    clearSession()
    reconnectAttemptedRef.current = false
    socket.emit("create-room", playerName, (response) => {
      if (response.success) {
        setRoomCode(response.roomCode)
        setIsHost(true)
        setGameState("lobby")
        setError("")
        setAnonymousMode(false)
        saveSession({ roomCode: response.roomCode, playerName: playerName })
      } else {
        setError(response.error || "Failed to create room")
      }
    })
  }, [socket, playerName])

  const joinRoom = useCallback(() => {
    if (!playerName.trim()) { setError("Please enter your name"); return }
    if (!roomCode.trim()) { setError("Please enter a room code"); return }
    if (!socket) { setError("Not connected to server"); return }
    clearSession()
    reconnectAttemptedRef.current = false
    socket.emit("join-room", roomCode, playerName, (response) => {
      if (response.success) {
        setIsHost(false)
        setGameState("lobby")
        setError("")
        saveSession({ roomCode: roomCode, playerName: playerName })
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
    clearDraft(roomCodeRef.current, "writing")
  }, [socket, question])

  const submitAnswer = useCallback(() => {
    if (!answer.trim()) { setError("Please enter an answer"); return }
    socket.emit("submit-answer", answer)
    setError("")
    clearDraft(roomCodeRef.current, "answering")
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
    clearSession()
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
    setMostAdoredWriter(null)
    setRoundHistory([])
    setShowRoundHistory(false)
    setCurrentContent(null)
    setMyReactions(new Set())
    setReactionCounts({})
  }, [socket])

  const resetGame = useCallback(() => {
    if (socket && roomCodeRef.current) { socket.emit("leave-room") }
    clearSession()
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
    setMostAdoredWriter(null)
    setRoundHistory([])
    setShowRoundHistory(false)
    setCurrentContent(null)
    setMyReactions(new Set())
    setReactionCounts({})
  }, [socket])

  const handleAbandonGame = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit("player-abandon")
    }
    clearSession()
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
    setMostAdoredWriter(null)
    setRoundHistory([])
    setShowRoundHistory(false)
    setCurrentContent(null)
    setMyReactions(new Set())
    setReactionCounts({})
  }, [])

  useEffect(() => {
    return () => {
      if (lastSubmitterTimerRef.current) {
        clearTimeout(lastSubmitterTimerRef.current)
        lastSubmitterTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setReactions(prev => prev.filter(r => Date.now() - r.createdAt < 3000))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // Keyboard navigation for summary voting: Arrow Up/Down moves between vote buttons.
  useEffect(() => {
    if (gameState !== 'ended') return
    const handleKeyDown = (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter' && e.key !== ' ') return
      const buttons = Array.from(document.querySelectorAll('.summary-vote-btn:not([disabled])'))
      if (buttons.length === 0) return
      const active = document.activeElement
      let idx = buttons.findIndex((b) => b === active)
      if (e.key === 'Enter' || e.key === ' ') {
        if (idx >= 0) { e.preventDefault(); buttons[idx].click() }
        return
      }
      if (idx < 0) { idx = 0 } // Nothing focused yet; start at top
      else if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, buttons.length - 1) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0) }
      buttons[idx].focus()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [gameState])

  const fastestTyper = useMemo(() => {
    if (!gameAwards.firstQuestionSubmitter || !gameAwards.firstAnswerSubmitter) return null
    if (gameAwards.firstQuestionSubmitter !== gameAwards.firstAnswerSubmitter) return null
    return gameAwards.firstQuestionSubmitter
  }, [gameAwards.firstQuestionSubmitter, gameAwards.firstAnswerSubmitter])

  const slowestTyper = useMemo(() => {
    if (!gameAwards.lastQuestionSubmitter || !gameAwards.lastAnswerSubmitter) return null
    if (gameAwards.lastQuestionSubmitter !== gameAwards.lastAnswerSubmitter) return null
    if (fastestTyper && gameAwards.lastQuestionSubmitter === fastestTyper) return null
    return gameAwards.lastQuestionSubmitter
  }, [gameAwards.lastQuestionSubmitter, gameAwards.lastAnswerSubmitter, fastestTyper])

  const roundLeader = useMemo(() => {
    if (!Array.isArray(gameSummary) || gameSummary.length === 0) return null
    const ranked = gameSummary
      .filter(pair => pair.pairDbId)
      .map(pair => ({ ...pair, voteCount: summaryVotes[pair.pairDbId] || 0 }))
      .filter(pair => pair.voteCount > 0)
      .sort((a, b) => b.voteCount - a.voteCount)
    if (ranked.length === 0) return null
    const top = ranked[0]
    return { ...top, tied: ranked.filter(pair => pair.voteCount === top.voteCount).length > 1 }
  }, [gameSummary, summaryVotes])

  const getWaitingMessage = (phase) => {
    const remaining = Math.max((progress.total || 0) - (progress.submitted || 0), 0)
    if (remaining <= 0) return phase === 'writing' ? 'Everyone is in — answers are loading.' : 'Everyone is in — performance is loading.'
    if (remaining === 1) return 'One player left. Almost there.'
    return `${remaining} players are still finishing up.`
  }

  const getWaitingTip = () => {
    const remaining = Math.max((progress.total || 0) - (progress.submitted || 0), 0)
    if (remaining <= 0) return 'The next phase should start any second.'
    return ''
  }

  const renderWaitingPanel = (phase) => {
    const visiblePlayers = playerStatuses.slice(0, 6)
    const remainingPlayers = playerStatuses.length - visiblePlayers.length

    return (
    <div className="waiting-panel waiting-panel--compact">
      <div className="waiting-panel__top">
        <div>
          <p className="summary-pill">Waiting Room</p>
          <h3 className="waiting-panel__title">{getWaitingMessage(phase)}</h3>
        </div>
        <span className="waiting-panel__count">{progress.submitted}/{progress.total}</span>
      </div>
      {getWaitingTip() && (<p className="waiting-panel__tip">{getWaitingTip()}</p>)}
      {playerStatuses.length > 0 && (
        <div className="waiting-panel__players">
          {visiblePlayers.map((p, i) => (
            <div key={i} className={"waiting-player waiting-player--compact " + (p.submitted ? "waiting-player--done" : "")}>
              <div className="flex items-center gap-2 min-w-0">
                {firstSubmitter && p.name === firstSubmitter && (
                  <span className="text-lg" title="First to submit!"><span className="sr-only">First to submit</span>🏆</span>
                )}
                {showLastSubmitterIndicator && lastQuestionSubmitter && p.name === lastQuestionSubmitter && (
                  <span className="text-lg" title={phase === 'writing' ? "You were last to submit your question" : "Last question submitter warning active"}><span className="sr-only">{phase === 'writing' ? "You were last to submit your question" : "Last question submitter"}</span>⏰</span>
                )}
                <span className={p.submitted ? "text-green-300 truncate" : "text-gray-300 truncate"}>{p.name}</span>
              </div>
              <span className={p.submitted ? "text-green-400" : "text-gray-400"}>{p.submitted ? "✓ Done" : phase === 'writing' ? "writing..." : "answering..."}</span>
            </div>
          ))}
          {remainingPlayers > 0 && (
            <div className="waiting-panel__more">+{remainingPlayers} more player{remainingPlayers === 1 ? "" : "s"}</div>
          )}
        </div>
      )}
      <div className="waiting-panel__bar">
        <div style={{ width: (progress.total > 0 ? (progress.submitted / progress.total) * 100 : 0) + "%" }} />
      </div>
    </div>
    )
  }

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
                  saveSession({ roomCode: code, playerName: name })
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
          <div ref={bestOfScrollRef} className="game-container game-container--scroll py-4">
            <div className="text-center mb-4 relative">
              <button
                onClick={() => setGameState("welcome")}
                className="absolute top-0 right-0 text-gray-400 hover:text-white text-sm px-2 py-1"
                aria-label="Close Best Of and return to main screen"
              >
                ✕ Close
              </button>
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
                              <button
                                onClick={() => handleDeleteBestOf(item.type, item.id, i)}
                                className="text-[10px] text-red-400 hover:text-red-300 underline"
                                title="Delete this item"
                              >🗑 Delete</button>
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
          <div className="relative">
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
                        clearSession()
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
            <LandingPage
              playerName={playerName}
              setPlayerName={setPlayerName}
              roomCode={roomCode}
              setRoomCode={setRoomCode}
              createRoom={createRoom}
              joinRoom={joinRoom}
              setGameState={setGameState}
              soundMuted={soundMuted}
              setSoundMuted={setSoundMuted}
              writeSoundMuted={writeSoundMuted}
              prefillWhatIf={prefillWhatIf}
              setPrefillWhatIf={setPrefillWhatIf}
              setPrefillWhatIfStorage={setPrefillWhatIfStorage}
              socket={socket}
              error={error}
            />
          </div>
        )

      case "lobby":
        return (
          <div className="game-container game-container--active py-2">
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
                </div>
                <p className="text-[10px] text-gray-600 mt-1">Tap to copy and share</p>
                {(anonymousMode || noSelfReading) && (
                  <div className="flex justify-center gap-2 mt-2">
                    {anonymousMode && (
                      <span className="text-[10px] bg-purple-900/40 text-purple-300 border border-purple-700/50 rounded-full px-2 py-0.5">🙈 Anonymous</span>
                    )}
                    {noSelfReading && (
                      <span className="text-[10px] bg-indigo-900/40 text-indigo-300 border border-indigo-700/50 rounded-full px-2 py-0.5">🚫 No Self-Read</span>
                    )}
                  </div>
                )}
              </div>
              <div className={"lobby-ready mt-2 " + (players.length >= 3 ? "lobby-ready--ready" : "")}>
                <span className="lobby-ready__icon">{players.length >= 3 ? "✅" : "⏳"}</span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white leading-tight">{players.length >= 3 ? "Ready to start" : "Waiting for players"}</p>
                  <p className="text-[10px] text-gray-400 leading-tight">{players.length >= 3 ? (isHost ? "You can start whenever everyone is settled." : "The host can start whenever everyone is settled.") : `Need ${3 - players.length} more player${3 - players.length === 1 ? "" : "s"} to begin.`}</p>
                </div>
              </div>
            </div>
            <div className="card flex-1 min-h-0 py-2 px-2 mb-2 flex flex-col">
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
              <div className="grid grid-cols-2 gap-2 mb-2">
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

      case "writing":
        return (
          <div className="game-container game-container--active py-2">
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
                <div className="phase-banner mb-2">
                  <span>Phase 1</span>
                  <strong>Question Time</strong>
                </div>
                <div className="text-center mb-1">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0">Your Turn</p>
                  <h2 className="text-base font-bold text-white leading-tight">Write a Question</h2>
                  <p className="text-[10px] text-indigo-400 leading-tight">Must begin with "What if..."</p>
                </div>
                <label htmlFor="question-input" className="sr-only">Your question</label>
                <textarea id="question-input" value={question} onChange={(e) => { setQuestion(e.target.value); saveDraft(roomCodeRef.current, "writing", e.target.value) }} placeholder="Type your question here" autoCapitalize="sentences" aria-label="Your question" className="input-field h-24 resize-none mb-2 text-[15px] leading-snug md:h-28" maxLength={300} />
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
              <div className="flex-1 flex flex-col items-center text-center gap-3 min-h-0 overflow-hidden">
                <div className="flex-1 flex flex-col items-center text-center gap-3 overflow-hidden min-h-0 w-full">
                  <div className="w-12 h-12 bg-green-900/30 rounded-full flex items-center justify-center mb-3"><span className="text-2xl">✓</span></div>
                  <h3 className="text-xl font-bold text-white mb-1">Submitted!</h3>
                  {renderWaitingPanel('writing')}
                  {error && (<div className="p-2 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-xs text-center mt-3 max-w-xs">{error}</div>)}
                </div>
                {canForceAdvance && (
                  <div className="host-nudge shrink-0 mt-2">
                    <div>
                      <p>Host option</p>
                      <span>Only use this if someone disappeared.</span>
                    </div>
                    <button onClick={() => setForceConfirm(true)}>Skip waiting players</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )

      case "answering":
        return (
          <div className="game-container game-container--active py-2">
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
                <div className="phase-banner mb-2">
                  <span>Phase 2</span>
                  <strong>Answer this question</strong>
                </div>
                <div className="card mb-2 py-2 px-3 bg-gradient-to-br from-indigo-900/30 to-purple-900/30 border-2 border-indigo-700">
                  <p className="text-base font-bold text-white leading-snug text-center">{assignedQuestion}</p>
                </div>
                <label htmlFor="answer-input" className="sr-only">Your answer</label>
                <textarea id="answer-input" value={answer} onChange={(e) => { setAnswer(e.target.value); saveDraft(roomCodeRef.current, "answering", e.target.value) }} placeholder="Type your answer here..." autoCapitalize="sentences" aria-label="Your answer" className="input-field h-24 resize-none mb-2 text-[15px] leading-snug md:h-28" maxLength={400} />
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
              <div className="flex-1 flex flex-col items-center text-center gap-4 min-h-0 overflow-hidden">
                <div className="flex-1 flex flex-col items-center text-center gap-3 overflow-hidden min-h-0 w-full">
                  <div className="w-12 h-12 bg-green-900/30 rounded-full flex items-center justify-center mb-3"><span className="text-2xl">✓</span></div>
                  <h3 className="text-xl font-bold text-white mb-1">Answer Submitted!</h3>
                  {renderWaitingPanel('answering')}
                  {error && (<div className="p-2 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-xs text-center mt-3 max-w-xs">{error}</div>)}
                </div>
                {canForceAdvance && (
                  <div className="host-nudge shrink-0 mt-2">
                    <div>
                      <p>Host option</p>
                      <span>Only use this if someone disappeared.</span>
                    </div>
                    <button onClick={() => setForceConfirm(true)}>Skip waiting players</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )

      case "performing":
        return (
          <div className="game-container game-container--active py-2">
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
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="phase-banner mb-2">
                  <span>Phase 3</span>
                  <strong>Performance Time</strong>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <div className="mb-1">
                    {currentTurn.isQuestionTurn && socket.id === currentTurn.questionReader.id && (
                    <div className="py-2 rounded-xl text-center bg-green-500 border-4 border-green-300 shadow-xl shadow-green-900/50">
                      <span className="text-xl md:text-2xl font-black text-white tracking-wider">READ QUESTION</span>
                      <p className="text-green-100 text-xs md:text-sm mt-1">Read aloud, then tap Done</p>
                    </div>
                  )}
                  {!currentTurn.isQuestionTurn && socket.id === currentTurn.questionReader.id && (
                    <div className="py-2 rounded-lg text-center bg-gray-700 border border-gray-600">
                      <span className="text-base md:text-lg font-bold text-gray-400">WAITING</span>
                      <p className="text-gray-500 text-xs md:text-sm mt-1">{currentTurn.answerReader.name} is reading the answer</p>
                    </div>
                  )}
                  {currentTurn.isQuestionTurn && socket.id === currentTurn.answerReader.id && (
                    <div>
                      <div className="text-center mb-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-purple-300 bg-purple-900/40 px-3 py-1.5 rounded-full border border-purple-700/30">
                          <span className="text-base">🎤</span>
                          <span className="font-medium">{currentTurn.questionReader.name}</span> is reading the question to you
                        </span>
                      </div>
                      <div className="py-2 rounded-xl text-center bg-purple-500 border-4 border-purple-300 shadow-xl shadow-purple-900/50">
                        <span className="text-xl md:text-2xl font-black text-white tracking-wider">GET READY</span>
                        <p className="text-purple-100 text-xs md:text-sm mt-1">You're reading the answer next</p>
                      </div>
                    </div>
                  )}
                  {!currentTurn.isQuestionTurn && socket.id === currentTurn.answerReader.id && (
                    <div className="py-2 rounded-xl text-center bg-purple-500 border-4 border-purple-300 shadow-xl shadow-purple-900/50">
                      <span className="text-xl md:text-2xl font-black text-white tracking-wider">READ ANSWER</span>
                      <p className="text-purple-100 text-xs md:text-sm mt-1">Read aloud, then tap Done</p>
                    </div>
                  )}
                  {socket.id !== currentTurn.questionReader.id && socket.id !== currentTurn.answerReader.id && (
                    <div className="card bg-gray-800 border-2 border-gray-700 mb-2 py-3 px-4 text-center">
                      <p className="text-gray-300 text-base md:text-lg">
                        <span className="text-green-400 font-bold text-lg md:text-xl">{currentTurn.questionReader.name}</span>
                        <span className="text-gray-500 mx-3">→</span>
                        <span className="text-purple-400 font-bold text-lg md:text-xl">{currentTurn.answerReader.name}</span>
                      </p>
                      <p className="text-gray-500 text-sm md:text-base mt-2">{currentTurn.isQuestionTurn ? "Question being read" : "Answer being read"}</p>
                    </div>
                  )}
                </div>
                {currentTurn.isQuestionTurn && socket.id === currentTurn.questionReader.id && (
                  <div className="card bg-gradient-to-br from-green-600 to-green-800 border-4 border-green-400 shadow-2xl mb-2 py-3 px-4">
                    <p className="text-center text-sm md:text-base text-green-100 font-bold uppercase tracking-widest mb-2">📖 Read Aloud</p>
                    <p className="text-center text-lg md:text-xl font-bold text-white leading-relaxed">{currentTurn.question}</p>
                  </div>
                )}
                {!currentTurn.isQuestionTurn && socket.id === currentTurn.answerReader.id && currentTurn.answer && (
                  <div className="card bg-gradient-to-br from-purple-600 to-purple-800 border-4 border-purple-400 shadow-2xl mb-2 py-3 px-4">
                    <p className="text-center text-sm md:text-base text-purple-100 font-bold uppercase tracking-widest mb-2">💬 Read Aloud</p>
                    <p className="text-center text-lg md:text-xl font-bold text-white leading-relaxed">{currentTurn.answer}</p>
                  </div>
                )}
                {!hasRead && currentTurn.isQuestionTurn && socket.id === currentTurn.questionReader.id && (
                  <button onClick={completeReading} className="btn-primary mb-2 bg-green-600 hover:bg-green-700 text-base py-3">Done Reading →</button>
                )}
                {!hasRead && !currentTurn.isQuestionTurn && socket.id === currentTurn.answerReader.id && (
                  <button onClick={completeReading} className="btn-primary mb-2 bg-purple-600 hover:bg-purple-700 text-base py-3">Done Reading →</button>
                )}
                </div>
                <div className="shrink-0 pt-2 border-t border-gray-800">
                  <div className="flex justify-center gap-1 mb-2">
                    {Array.from({ length: gameStats.total }).map((_, i) => (
                      <div key={i} className={"w-2 h-2 rounded-full " + (i < gameStats.round ? "bg-indigo-500" : i === gameStats.round - 1 ? "bg-white animate-pulse" : "bg-gray-700")} />
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs md:text-sm text-gray-500 mb-2">
                    <span>Turn {gameStats.round}/{gameStats.total}</span>
                    <div className="flex-1 mx-3 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: (gameStats.total > 0 ? (gameStats.round / gameStats.total) * 100 : 0) + "%" }} />
                    </div>
                  </div>
                  {error && (<div className="p-2 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-xs text-center mt-2">{error}</div>)}
                  {(() => {
                    const isSelfContent = currentContent && socketRef.current?.id === currentContent.authorId
                    const alreadyReacted = currentContent && myReactions.has(currentContent.dbId)
                    const currentCounts = currentContent ? reactionCounts[currentContent.dbId] : null
                    const canReact = !isSelfContent && !alreadyReacted
                    return (
                      <div className="flex justify-center gap-2 mt-2">
                        {isSelfContent && (
                          <span className="text-[10px] text-gray-500 self-center mr-1">You wrote this — no self-reactions</span>
                        )}
                        {alreadyReacted && !isSelfContent && (
                          <span className="text-[10px] text-gray-500 self-center mr-1">You reacted ✓</span>
                        )}
                        {['❤️', '😂', '❓'].map(emoji => {
                          const count = currentCounts?.[emoji] || 0
                          return (
                            <button
                              key={emoji}
                              onClick={() => {
                                if (!canReact || !currentContent) return
                                const x = 20 + Math.random() * 60
                                const y = 20 + Math.random() * 60
                                socketRef.current?.emit('reaction', { emoji, x, y, contentDbId: currentContent.dbId })
                                setReactions(prev => [...prev, { id: Math.random().toString(36).slice(2), emoji, x, y, createdAt: Date.now() }])
                                setMyReactions(prev => new Set(prev).add(currentContent.dbId))
                              }}
                              disabled={!canReact}
                              className={`text-xl bg-gray-800 border border-gray-700 rounded-full w-9 h-9 flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none relative ${canReact ? 'hover:bg-gray-700' : 'opacity-30 cursor-not-allowed'}`}
                              aria-label={`React with ${emoji}${count > 0 ? ` (${count})` : ''}`}
                              title={`React with ${emoji}${count > 0 ? ` — ${count} reaction${count === 1 ? '' : 's'}` : ''}`}
                            >
                              {emoji}
                              {count > 0 && (
                                <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">{count}</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )
                  })()}
                  {isHost && (
                    <button onClick={() => setForceConfirm(true)} className="w-full text-xs text-red-500 border border-red-800 rounded-lg px-3 py-1.5 hover:bg-red-900/20 transition-colors mt-1">
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
              <div className="summary-header__meta">
                {roundHistory.length > 0 && (
                  <div>
                    <p className="summary-pill">History</p>
                    <button onClick={() => setShowRoundHistory(true)} className="text-xs text-indigo-300 hover:text-indigo-200 underline">
                      {roundHistory.length} past round{roundHistory.length === 1 ? '' : 's'}
                    </button>
                  </div>
                )}
                <div>
                  <p className="summary-pill">Players</p>
                  <p className="summary-meta-value">{players.length}</p>
                </div>
                <div>
                  <p className="summary-pill">Voting Status</p>
                  <p className={"summary-meta-value " + (votersCount >= players.length ? "text-emerald-300" : "text-amber-300")}>{votersCount >= players.length ? "✓ Everyone voted" : `${votersCount}/${players.length} voted`}</p>
                  <p className="summary-meta-note">{votersCount >= players.length ? "Ready to start next round" : "Waiting for votes"}</p>
                </div>
              </div>
            </div>

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
                    const isWinner = roundLeader && roundLeader.pairDbId === pair.pairDbId && !roundLeader.tied

                    return (
                      <article key={pairKey} id={hasPairId ? `pair-${pair.pairDbId}` : undefined} className={"summary-card " + (userVotedForPair ? "summary-card--active " : "") + (isWinner ? "summary-card--winner" : "")}>
                        <div className="summary-card__body">
                          {isWinner && <div className="text-right"><span className="text-sm" title="Top voted!">👑</span></div>}
                          <p className="summary-question">{pair.question}</p>
                          <div className="summary-paired">
                            <p className="summary-paired__answer">{pair.pairedAnswer || 'No pairing was performed'}</p>
                          </div>
                          <p className="text-[11px] text-gray-400">
                            Q by {questionAuthor}{pair.pairedAnswer && <> · Paired by {pairedAuthor}</>}
                            {pair.actualAnswer && <> · <span className="text-emerald-300/80">Actual: {pair.actualAnswer}</span>{pair.actualAnswerAuthorName && <> — {actualAuthor}</>}</>}
                          </p>
                          {maskNames && (
                            <div className="inline-flex items-center gap-1 text-[10px] text-purple-300 bg-purple-900/30 border border-purple-700/50 rounded-full px-2 py-0.5 w-fit">
                              <span>🙈</span>
                              <span>Anonymous</span>
                            </div>
                          )}
                        </div>

                        <div className="summary-card__footer">
                          <div className="summary-vote-meta">
                            <span className="text-gray-400 text-xs uppercase tracking-widest">Votes</span>
                            <p className="text-2xl font-black text-amber-300">{voteCount}</p>
                            {userVotedForPair && (<span className="you-badge">You</span>)}
                          </div>
                          <div className="flex items-center gap-2 flex-1">
                            {((pair.questionReactions && Object.keys(pair.questionReactions).length > 0) || (pair.answerReactions && Object.keys(pair.answerReactions).length > 0)) && (
                              <div className="flex flex-wrap gap-1 text-[10px]">
                                {pair.questionReactions && Object.entries(pair.questionReactions).map(([emoji, count]) => (
                                  <span key={emoji} className="bg-gray-800 rounded-full px-2 py-0.5 flex items-center gap-1 text-gray-300">{emoji} {count}</span>
                                ))}
                                {pair.answerReactions && Object.entries(pair.answerReactions).map(([emoji, count]) => (
                                  <span key={emoji} className="bg-gray-800 rounded-full px-2 py-0.5 flex items-center gap-1 text-gray-300">{emoji} {count}</span>
                                ))}
                              </div>
                            )}
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
                                {inFlight ? '…' : userVotedForPair ? 'Voted' : userLockedToDifferentPair ? 'Locked' : 'Vote'}
                              </button>
                            ) : (
                              <button disabled className="summary-vote-btn summary-vote-btn--disabled">Unavailable</button>
                            )}
                          </div>
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

            {showRoundHistory && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-lg w-full max-h-[80vh] flex flex-col shadow-2xl">
                  <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 className="text-lg font-bold text-white">Round History</h3>
                    <button onClick={() => setShowRoundHistory(false)} className="text-gray-400 hover:text-white text-sm">✕ Close</button>
                  </div>
                  <div className="overflow-y-auto flex-1 p-4 space-y-4">
                    {roundHistory.map((round, idx) => {
                      const isExpanded = expandedHistoryRounds.has(idx)
                      const visiblePairs = isExpanded ? round.summary : round.summary.slice(0, 3)
                      return (
                        <div key={idx} className="card p-3">
                          <p className="text-xs text-gray-400 mb-2">Round {idx + 1} — {new Date(round.timestamp).toLocaleTimeString()}</p>
                          <div className="space-y-2">
                            {visiblePairs.map((pair, pIdx) => (
                              <div key={pIdx} className="text-sm">
                                <p className="text-white font-medium">{pair.question}</p>
                                <p className="text-gray-400 text-xs">↗ {pair.pairedAnswer || 'No pairing'}</p>
                              </div>
                            ))}
                            {round.summary.length > 3 && (
                              <button
                                onClick={() => setExpandedHistoryRounds(prev => {
                                  const next = new Set(prev)
                                  if (next.has(idx)) next.delete(idx)
                                  else next.add(idx)
                                  return next
                                })}
                                className="text-xs text-indigo-300 hover:text-indigo-200 underline"
                              >
                                {isExpanded ? 'Show less' : `+${round.summary.length - 3} more pairings`}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {roundLeader && (
              <div className="summary-leader card">
                <div className="summary-leader__icon">🔥</div>
                <div>
                  <p className="text-sm text-rose-200">{roundLeader.tied ? 'Current tie for top pairing' : 'Current top pairing'}</p>
                  <p className="text-base font-extrabold text-white leading-snug">{roundLeader.question}</p>
                  <p className="text-sm text-rose-100/80 leading-snug">Performed with: {roundLeader.pairedAnswer || 'No pairing was performed'}</p>
                </div>
                <div className="summary-leader__badge">{roundLeader.voteCount} vote{roundLeader.voteCount === 1 ? '' : 's'}</div>
              </div>
            )}

            {fastestTyper && (
              <div className="summary-fastest card">
                <div className="summary-fastest__icon">🏆</div>
                <div>
                  <p className="text-sm text-amber-200">Fastest typer in both rounds</p>
                  <p className="text-xl font-extrabold text-white">{fastestTyper}</p>
                  <p className="text-xs text-amber-100/70">First to submit both their question and answer!</p>
                </div>
                <div className="summary-fastest__badge">Fastest Typer!</div>
              </div>
            )}

            {slowestTyper && (
              <div className="summary-slowest card">
                <div className="summary-slowest__icon">⏰</div>
                <div>
                  <p className="text-sm text-sky-200">Slowest typer in both rounds</p>
                  <p className="text-xl font-extrabold text-white">{slowestTyper}</p>
                  <p className="text-xs text-sky-100/70">Last to finish both the question and the answer.</p>
                </div>
                <div className="summary-slowest__badge">Slowest Typer!</div>
              </div>
            )}

            {mostAdoredWriter ? (
              <div className="summary-mvp card">
                <div className="summary-mvp__icon">💖</div>
                <div>
                  <p className="text-sm text-yellow-200">Round's most-adored writer</p>
                  {mostAdoredWriter.tied ? (
                    <>
                      <p className="text-xl font-extrabold text-white">{summaryAnonymousMode ? '???' : mostAdoredWriter.names.join(' & ')}</p>
                      <p className="text-xs text-yellow-100/70">Tied with {mostAdoredWriter.total} adored reaction{mostAdoredWriter.total === 1 ? '' : 's'} each!</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xl font-extrabold text-white">{summaryAnonymousMode ? '???' : (mostAdoredWriter.names[0] || 'Unknown')}</p>
                      <p className="text-xs text-yellow-100/70">{mostAdoredWriter.total} adored reaction{mostAdoredWriter.total === 1 ? '' : 's'}!</p>
                    </>
                  )}
                </div>
                <div className="summary-mvp__badge">{mostAdoredWriter.tied ? 'Tied!' : 'Adored!'}</div>
              </div>
            ) : (
              <div className="summary-mvp card" style={{ opacity: 0.6 }}>
                <div className="summary-mvp__icon">💭</div>
                <div>
                  <p className="text-sm text-yellow-200">Round's most-adored writer</p>
                  <p className="text-xl font-extrabold text-white">No reactions yet</p>
                  <p className="text-xs text-yellow-100/70">Send ❤️ and 😂 during the next round!</p>
                </div>
              </div>
            )}

            {isHost ? (
              <div className="summary-actions">
                <div className="summary-actions__toggles">
                  <div className="summary-toggle card">
                    <div>
                      <p className="text-xs text-white font-semibold">Anonymous Results</p>
                      <p className="text-[11px] text-gray-400">Hide names in next summary + Best Of.</p>
                    </div>
                    <button onClick={() => socketRef.current?.emit("toggle-anonymous")} aria-pressed={anonymousMode} aria-label="Toggle anonymous results" className={"toggle-switch " + (anonymousMode ? "toggle-switch--on" : "")}>
                      <span />
                    </button>
                  </div>
                  <div className="summary-toggle card">
                    <div>
                      <p className="text-xs text-white font-semibold">No Self-Reading</p>
                      <p className="text-[11px] text-gray-400">Keep performances anonymous next round.</p>
                    </div>
                    <button onClick={() => setNoSelfReading(!noSelfReading)} aria-pressed={noSelfReading} aria-label="Toggle no self-reading" className={"toggle-switch " + (noSelfReading ? "toggle-switch--on" : "")}>
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
            ) : (
              <div className="summary-actions">
                <div className="card text-center py-5 px-6">
                  <p className="text-sm text-gray-200 mb-1">Please wait for the host to start a new round</p>
                  <p className="text-xs text-gray-500 mb-5">Your screen will automatically refresh</p>
                  <button onClick={handleAbandonGame} className="btn-secondary py-2.5 text-xs w-full max-w-xs">
                    Abandon game (exit to main screen)
                  </button>
                </div>
              </div>
            )}
            {gameSummary && gameSummary.length > 0 && (
              <div className="flex justify-center">
                <button
                  onClick={() => {
                    const lines = gameSummary.map((pair, i) => {
                      const q = pair.question || 'No question'
                      const a = pair.pairedAnswer || 'No pairing'
                      const votes = pair.pairDbId ? (summaryVotes[pair.pairDbId] || 0) : 0
                      return `${i + 1}. ${q}\n   → ${a} (${votes} vote${votes === 1 ? '' : 's'})`
                    })
                    const text = `What If Game — Round Summary\n\n${lines.join('\n\n')}`
                    navigator.clipboard?.writeText(text)
                    setNotice(noticeFor('Summary copied as text', 'success', 1500))
                  }}
                  className="text-xs text-gray-400 hover:text-white underline"
                >
                  📋 Copy summary as text
                </button>
              </div>
            )}
          </div>
        )

      case "help":
        return (
          <div className="game-container game-container--help py-2">
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

            <div className="card flex-1 min-h-0 overflow-y-auto py-3 px-3 md:px-4 space-y-3 text-[13px] md:text-sm leading-relaxed">
              {helpTab === "how-to-play" && (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <div className="w-10 h-10 mx-auto mb-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                      <span className="text-xl">🎮</span>
                    </div>
                    <h3 className="text-base font-bold text-white">How Fluke Works</h3>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    Fluke is a fast party game about writing weird “What if…” questions, answering someone else’s prompt, then reading mixed-up question/answer pairings out loud. React, vote, laugh, and see the round summary at the end.
                  </p>
                  
                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">Getting Started</h4>
                    <ol className="space-y-2 text-sm text-gray-300">
                      <li className="flex gap-2">
                        <span className="text-indigo-400 font-bold">1.</span>
                        <span><strong>Join or create a room</strong> - Use a 4-digit room code. The host can share the code with everyone else.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-indigo-400 font-bold">2.</span>
                        <span><strong>Gather players</strong> - You need 3-15 players.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-indigo-400 font-bold">3.</span>
                        <span><strong>Start the round</strong> - The host starts when everyone is ready.</span>
                      </li>
                    </ol>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">1. Write Questions 📝</h4>
                    <ul className="space-y-1 text-sm text-gray-300">
                      <li>• Everyone writes one question that starts with “What if”.</li>
                      <li>• Keep it short, clear, and open-ended.</li>
                      <li>• Example: “What if cats could talk, but only about taxes?”</li>
                      <li>• The optional pre-fill setting starts your box with “What if ”.</li>
                    </ul>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">2. Write Answers 🤔</h4>
                    <ul className="space-y-1 text-sm text-gray-300">
                      <li>• Each player receives someone else’s question.</li>
                      <li>• Write an answer that will be fun to hear out loud.</li>
                      <li>• Your answer may later be performed with a different question.</li>
                      <li>• Example: “They’d form a union and demand nap deductions.”</li>
                    </ul>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">3. Perform & React 🎭</h4>
                    <ul className="space-y-1 text-sm text-gray-300">
                      <li>• Players take turns reading the question/answer pairings.</li>
                      <li>• Read with energy: voices, timing, and commitment help.</li>
                      <li>• Everyone can react with ❤️, 😂, or ❓ during the reading.</li>
                      <li>• ❤️ and 😂 count toward the most-adored writer award.</li>
                    </ul>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">4. Vote & Review 🎉</h4>
                    <ul className="space-y-1 text-sm text-gray-300">
                      <li>• Vote for your favorite question/answer pairing.</li>
                      <li>• The summary shows pairings, votes, reactions, and round awards.</li>
                      <li>• Anonymous rounds hide names in the summary.</li>
                      <li>• The host can replay with the same group or start fresh.</li>
                    </ul>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">Host Controls</h4>
                    <p className="text-xs text-gray-500 mb-2">(Only the host sees these)</p>
                    <ul className="space-y-1 text-sm text-gray-300">
                      <li>• <strong>Anonymous Results</strong> - Hide writer names for the completed round’s summary.</li>
                      <li>• <strong>No Self-Reading</strong> - Try to prevent players from reading their own content.</li>
                      <li>• <strong>Force Advance</strong> - Move forward when submitted players are ready; non-submitters may be removed.</li>
                      <li>• <strong>Kick Player</strong> - Remove a player from the lobby before the game starts.</li>
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
                      <p className="text-sm text-gray-300">Usually 10-25 minutes, depending on player count and how theatrical the readings get.</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-indigo-400 mb-1">Can I play with friends who aren't in the same room?</h4>
                      <p className="text-sm text-gray-300">Yes. Share the 4-digit room code. Everyone can join from their own phone, tablet, or computer.</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-indigo-400 mb-1">What if someone disconnects?</h4>
                      <p className="text-sm text-gray-300">They have a short reconnect window. If they return in time, they can resume. If not, they may be removed so the room can keep playing.</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-indigo-400 mb-1">Can we play again with the same group?</h4>
                      <p className="text-sm text-gray-300">Yes. After the summary, the host can replay with the same players or start a fresh room setup.</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-indigo-400 mb-1">What do the host toggles do?</h4>
                      <p className="text-sm text-gray-300">
                        <strong>Anonymous Results</strong> - Hides writer names in the round summary and awards.
                        <br /><br />
                        <strong>No Self-Reading</strong> - Tries to avoid assigning players a pairing that includes their own writing.
                      </p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-indigo-400 mb-1">How do reactions work?</h4>
                      <p className="text-sm text-gray-300">During readings, players can react with ❤️, 😂, or ❓. Hearts and laughs count toward “Round’s most-adored writer”; question marks are just for fun/confusion.</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-indigo-400 mb-1">Can I play on my phone?</h4>
                      <p className="text-sm text-gray-300">Yes. The game is designed for mobile and desktop browsers.</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-indigo-400 mb-1">What if someone is taking too long?</h4>
                      <p className="text-sm text-gray-300">The host can force advance once enough players have submitted. Players who did not submit may be removed from that round.</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-indigo-400 mb-1">Can I kick a player?</h4>
                      <p className="text-sm text-gray-300">Only the host can kick players, and only from the lobby player list.</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-indigo-400 mb-1">What do the summary awards mean?</h4>
                      <p className="text-sm text-gray-300">
                        <strong>Current top pairing</strong> - The question/answer pairing with the most summary votes.
                        <br /><br />
                        <strong>Round’s most-adored writer</strong> - The writer whose questions and answers received the most ❤️ and 😂 reactions.
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
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">Writing Good Questions 🖊️</h4>
                    <ul className="space-y-1 text-sm text-gray-300">
                      <li>• <strong>Start with a clear “What if”</strong> - The game requires it.</li>
                      <li>• <strong>Leave room for answers</strong> - Broad prompts create better surprises.</li>
                      <li>• <strong>Use one funny idea</strong> - Too many twists can make it hard to answer.</li>
                      <li>• <strong>Avoid tiny inside jokes</strong> - Unless the whole room will understand them.</li>
                    </ul>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">Writing Good Answers 💡</h4>
                    <ul className="space-y-1 text-sm text-gray-300">
                      <li>• <strong>Make it readable</strong> - Someone else may have to perform it.</li>
                      <li>• <strong>Be specific</strong> - Details usually beat vague punchlines.</li>
                      <li>• <strong>Think like a performer</strong> - Give them something fun to say.</li>
                      <li>• <strong>Keep it punchy</strong> - Shorter answers often land better.</li>
                    </ul>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">Performing 🎭</h4>
                    <ul className="space-y-1 text-sm text-gray-300">
                      <li>• <strong>Read both parts clearly</strong> - The room needs to hear the setup and payoff.</li>
                      <li>• <strong>Commit to the bit</strong> - Even nonsense is funnier when performed seriously.</li>
                      <li>• <strong>Pause before the answer</strong> - Timing helps the reveal.</li>
                      <li>• <strong>React to others</strong> - Use ❤️, 😂, and ❓ while they read.</li>
                    </ul>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">Hosting 🎮</h4>
                    <ul className="space-y-1 text-sm text-gray-300">
                      <li>• <strong>Set expectations early</strong> - Tell players to write answers that are easy to read aloud.</li>
                      <li>• <strong>Use anonymity intentionally</strong> - It hides names in the summary and awards.</li>
                      <li>• <strong>Force advance carefully</strong> - It can remove players who did not submit.</li>
                      <li>• <strong>Replay quickly</strong> - “Same players” keeps the room together for another round.</li>
                    </ul>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">Winning the Room 🌟</h4>
                    <ul className="space-y-1 text-sm text-gray-300">
                      <li>• Vote for the pairing you most want preserved in the summary.</li>
                      <li>• Send ❤️ and 😂 to reward writing you genuinely liked.</li>
                      <li>• Use ❓ when something is confusing, cursed, or beautifully unhinged.</li>
                      <li>• The best rounds are playful, quick, and not too overthought.</li>
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
                    <h3 className="text-base font-bold text-white">About Fluke</h3>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">What It Is</h4>
                    <p className="text-sm text-gray-300 leading-relaxed mb-3">
                      Fluke is a browser-based party game built around one simple prompt: “What if…?”
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed mb-3">
                      Everyone writes a question, answers someone else’s question, then the game shuffles those ideas into read-aloud pairings. The fun comes from the mismatch: a strange setup, an unexpected answer, and the person brave enough to perform it.
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      It works best when players write quickly, commit to the bit, and react generously.
                    </p>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">What Makes This Version Different</h4>
                    <p className="text-sm text-gray-300 leading-relaxed mb-3">
                      The app handles the room code, player flow, shuffled assignments, live reactions, summary votes, reconnects, and host controls.
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed mb-3">
                      At the end, the summary highlights the current top pairing and the round’s most-adored writer, based on ❤️ and 😂 reactions to the questions and answers each player wrote.
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      Anonymous mode can hide names, so groups can choose mystery over credit.
                    </p>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">The Spirit</h4>
                    <p className="text-sm text-gray-300 leading-relaxed mb-3">
                      Fluke is not about perfect jokes. It is about giving the room something to play with.
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed mb-3">
                      A good question invites chaos. A good answer gives someone else a moment. A good performance turns whatever happened into a shared laugh.
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      Keep it kind, keep it moving, and let the weirdness do the work.
                    </p>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">Best With</h4>
                    <p className="text-sm text-gray-300 leading-relaxed mb-2">
                      Friends, family, coworkers, remote groups, or any room that can handle a little absurdity.
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed mb-2">
                      Use phones for easy writing and reacting. Use a shared screen if you want the summary to feel like a scoreboard.
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      Three players is enough; bigger groups create more surprising pairings.
                    </p>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">Thanks</h4>
                    <p className="text-sm text-gray-300 leading-relaxed mb-2">
                      Thanks for playing, testing, reacting, voting, and making the questions stranger than expected.
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      Now go ask something ridiculous.
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

      case "support":
        return (
          <div className="game-container py-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-white">Support the Project</h2>
              <button onClick={() => setGameState("welcome")} className="text-gray-400 hover:text-white text-sm">
                ✕ Close
              </button>
            </div>

            <div className="card flex-1 min-h-0 overflow-y-auto py-3 px-4 space-y-4">
              <div className="text-center mb-4">
                <div className="w-10 h-10 mx-auto mb-2 bg-gradient-to-br from-pink-500 to-rose-600 rounded-lg flex items-center justify-center">
                  <span className="text-xl">🎁</span>
                </div>
                <h3 className="text-base font-bold text-white">Value for Value</h3>
              </div>

              <p className="text-sm text-gray-300 leading-relaxed">
                If Fluke gave you a good laugh, a memorable night, or a reason to reconnect with friends, consider returning some of that value back. This game is free to play, but it is not free to build, host, and improve.
              </p>

              <div className="border-t border-gray-700 pt-4">
                <h4 className="text-sm font-bold text-pink-400 mb-2">Send a Tip</h4>
                <p className="text-sm text-gray-300 leading-relaxed mb-3">
                  A small donation helps cover server costs and keeps the game online. No amount is too small.
                </p>

                {/* Desktop: QR + Web button */}
                <div className="hidden md:flex md:items-center md:gap-4">
                  <div className="flex-1 flex flex-col items-center gap-2">
                    <img
                      src="https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=https://cash.app/$playfluke"
                      alt="Cash App QR code for $playfluke"
                      className="w-52 h-52 rounded-lg bg-white p-2"
                    />
                    <p className="text-xs font-semibold text-gray-300 text-center max-w-[10rem] leading-relaxed">
                      Playing on PC? Scan with your phone camera to open Cash App instantly.
                    </p>
                  </div>
                  <div className="flex-1 flex flex-col items-center gap-2">
                    <a
                      href="https://square.link/u/YPi6d86H"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-3 bg-[#00D632] hover:bg-[#00bd2c] text-black text-sm font-bold rounded-xl transition-colors shadow-lg"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                      </svg>
                      pay with any credit card (no account needed) or Cash App
                    </a>
                    <p className="text-xs font-semibold text-gray-300 text-center leading-relaxed">
                      Opens in a new tab — works without the app.
                    </p>
                  </div>
                </div>

                {/* Mobile: QR + button */}
                <div className="md:hidden flex flex-col gap-3">
                  <div className="flex flex-col items-center gap-2">
                    <img
                      src="https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=https://cash.app/$playfluke"
                      alt="Cash App QR code for $playfluke"
                      className="w-44 h-44 rounded-lg bg-white p-2"
                    />
                    <p className="text-xs font-semibold text-gray-300 text-center max-w-[12rem] leading-relaxed">
                      Scan with your phone camera to open Cash App instantly.
                    </p>
                  </div>
                  <a
                    href="https://square.link/u/YPi6d86H"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#00D632] hover:bg-[#00bd2c] text-black text-sm font-bold rounded-xl transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                    </svg>
                    pay with any credit card (no account needed) or Cash App
                  </a>
                  <p className="text-[10px] text-gray-500 text-center">
                    Opens the Cash App if installed, or a secure web checkout otherwise.
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-700 pt-4">
                <h4 className="text-sm font-bold text-pink-400 mb-2">Beta Test & Feedback</h4>
                <p className="text-sm text-gray-300 leading-relaxed mb-3">
                  Spotted a bug? Have an idea? Want to test new features before they go live? Your feedback shapes what Fluke becomes next.
                </p>
                <a
                  href="mailto:hello@playfluke.com"
                  className="text-sm text-indigo-300 hover:text-indigo-200 underline"
                >
                  hello@playfluke.com
                </a>
              </div>

              <div className="border-t border-gray-700 pt-4">
                <h4 className="text-sm font-bold text-pink-400 mb-2">Share the Game</h4>
                <p className="text-sm text-gray-300 leading-relaxed">
                  The easiest way to support Fluke is to bring more people into the room. Share the link, teach a friend, or bring it to your next group hangout.
                </p>
              </div>

              <div className="border-t border-gray-700 pt-4">
                <h4 className="text-sm font-bold text-pink-400 mb-2">Thank You</h4>
                <p className="text-sm text-gray-300 leading-relaxed">
                  However you choose to give back — whether it is a donation, a bug report, or simply playing another round — it matters. Thanks for being part of this.
                </p>
              </div>
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
          <span className="flex-1 text-center leading-tight">
            {notice.message}
            {notice.tone === "warn" && disconnectedPlayersRef.current.length > 0 && disconnectDeadlineRef.current && (
              <span className="ml-1">({formatTimeLeft(Math.max(0, disconnectDeadlineRef.current - Date.now()))})</span>
            )}
          </span>
          <button
            onClick={() => setNotice(null)}
            className="notice-banner__close"
            aria-label="Dismiss notice"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      {showCountdown && ["writing", "answering", "performing"].includes(gameState) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" role="alert" aria-live="assertive">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl px-8 py-8 text-center shadow-2xl max-w-xs">
            <p className="text-sm text-indigo-300 uppercase tracking-widest font-bold mb-3">
              {gameState === 'writing' ? 'Starting new round…' : gameState === 'answering' ? 'Answer time!' : 'Reading time!'}
            </p>
            <div className="text-6xl font-black text-white">{countdown}</div>
            {isHost && (
              <button onClick={() => { setShowCountdown(false); setCountdown(0) }} className="mt-4 text-xs text-indigo-300 underline">
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
          onClick={() => { const c = bestOfScrollRef.current; if (c) c.scrollTo({ top: 0, behavior: 'smooth' }); else window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          title="Back to top"
        >↑</button>
      )}
      <main aria-label="Game" className="contents">
        {renderContent()}
      </main>
      {reactions.map(r => (
        <div
          key={r.id}
          className="fixed z-40 text-3xl pointer-events-none animate-bounce"
          style={{ left: `${r.x}%`, top: `${r.y}%`, transform: 'translate(-50%, -50%)' }}
          aria-hidden="true"
        >
          {r.emoji}
        </div>
      ))}
    </div>
  )
}

export default App
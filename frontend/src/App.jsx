import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import LandingPage from "./LandingPage"
import BestOfView from "./components/BestOfView"
import UncutBestOfView from "./components/UncutBestOfView"
import AgeGate from "./components/AgeGate"
import HelpPage from "./components/HelpPage"
import SupportPage from "./components/SupportPage"
import LobbyView from "./components/LobbyView"
import WritingPhase from "./components/WritingPhase"
import AnsweringPhase from "./components/AnsweringPhase"
import PerformancePhase from "./components/PerformancePhase"
import SummaryPhase from "./components/SummaryPhase"
import ScoreboardView from "./components/ScoreboardView"
import TournamentCompleteView from "./components/TournamentCompleteView"
import {
  noticeFor,
  loadSession,
  saveSession,
  touchSession,
  clearSession,
  saveDraft,
  loadDraft,
  clearDraft,
  waitingForLabel,
  formatTimeLeft,
  getPrefillWhatIf,
  setPrefillWhatIfStorage,
  isSoundMuted,
  writeSoundMuted,
  playSound
} from "./utils/gameUtils"
import { useFocusTrap } from "./hooks/useFocusTrap"
import { useSocketEvents } from "./hooks/useSocketEvents"

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin

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
  const [tournamentConfig, setTournamentConfig] = useState({ enabled: false, targetRounds: 3, votingTimerSeconds: 60, speedScoringEnabled: false })
  const [tournament, setTournament] = useState(null) // server-side tournament state { enabled, currentRound, targetRounds, votingDeadlineAt, serverNow }
  const [scoreboardData, setScoreboardData] = useState(null)
  const [tournamentCompleteData, setTournamentCompleteData] = useState(null)
  const [authorReveals, setAuthorReveals] = useState({}) // { pairDbId: { qAuthor, aAuthor } } revealed after voting in tournament
  const [reconnectInfo, setReconnectInfo] = useState(null)
  const [playerStatuses, setPlayerStatuses] = useState([])
  const [forceConfirm, setForceConfirm] = useState(false)
  const [kickConfirm, setKickConfirm] = useState(null) // { id, name } when host wants to confirm a kick
  const [disconnectedPlayerMeta, setDisconnectedPlayerMeta] = useState({}) // { [name]: { disconnectedAt, graceMs } }
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
  const [bestOfLimit, setBestOfLimit] = useState(50)
  const [bestOfOffset, setBestOfOffset] = useState(0)
  const [bestOfHasMore, setBestOfHasMore] = useState(false)
  const [bestOfLoading, setBestOfLoading] = useState(false)
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem('adminKey') || '')
  const [isAuthChecking, setIsAuthChecking] = useState(true)
  const [bestOfViewMode, setBestOfViewMode] = useState('approved') // 'approved' | 'pending'
  const [pendingData, setPendingData] = useState(null)
  const [pendingLoading, setPendingLoading] = useState(false)
  const scrollBestOfIdRef = useRef(null)
  const wakeLockRef = useRef(null)
  const bestOfSentinelRef = useRef(null)
  const bestOfScrollRef = useRef(null)
  const [showCountdown, setShowCountdown] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [showDisconnectOverlay, setShowDisconnectOverlay] = useState(false)
  const [disconnectOverlayDeadline, setDisconnectOverlayDeadline] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState("connected")
  const [ageGatePassed, setAgeGatePassed] = useState(false)

  // Refs survive remounts/state-update batches
  const reconnectAttemptedRef = useRef(false)
  const roomCodeRef = useRef("")
  const gameStateRef = useRef("welcome")
  const socketRef = useRef(null)
  const lastSubmitterTimerRef = useRef(null)
  const pendingVoteRef = useRef(null)
  const playerNameRef = useRef("")
  const playersRef = useRef([])
  // Names of OTHER players currently disconnected (within their reconnect grace window).
  const disconnectedPlayersRef = useRef([])
  const disconnectDeadlineRef = useRef(null)
  const disconnectNoticeTimerRef = useRef(null)
  const prefillWhatIfRef = useRef(getPrefillWhatIf())
  const skipNextCountdownRef = useRef(false)
  const wakeLockNoticeShownRef = useRef(false)

  const reconnectTrapRef = useFocusTrap(!!reconnectPrompt)
  const kickTrapRef = useFocusTrap(!!kickConfirm)
  const forceConfirmTrapRef = useFocusTrap(!!forceConfirm)
  const hideGameTrapRef = useFocusTrap(!!hideGameConfirm)
  const countdownTrapRef = useFocusTrap(!!showCountdown)
  const disconnectTrapRef = useFocusTrap(!!showDisconnectOverlay)

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
      setDisconnectedPlayerMeta({})
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
    const key = sessionStorage.getItem('adminKey') || ''
    setAdminKey(key)
    setIsAuthChecking(false)
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
      if (bestOfLoading && !opts.force) return
      setBestOfLoading(true)
      const sort = opts.sort || bestOfSort
      const limit = opts.limit || bestOfLimit
      const offset = opts.offset ?? bestOfOffset
      const url = `${SOCKET_URL}/api/best-of?type=qa_pairs&limit=${limit}&sort=${sort}&offset=${offset}`
      const response = await fetch(url)
      const data = await response.json()
      const items = Array.isArray(data) ? data : []
      if (offset === 0) {
        setBestOfData(items)
      } else {
        setBestOfData(prev => {
          if (!Array.isArray(prev)) return items
          const seen = new Set(prev.map(i => `${i.type}:${i.id}`))
          const deduped = items.filter(i => !seen.has(`${i.type}:${i.id}`))
          return [...prev, ...deduped]
        })
      }
      setBestOfHasMore(false)
    } catch (error) {
      console.error('Failed to fetch best of data:', error)
      setNotice(noticeFor('Failed to load best of content', 'warn', 3000))
    } finally { setBestOfLoading(false) }
  }

  const fetchPendingData = async (opts = {}) => {
    try {
      if (pendingLoading && !opts.force) return
      if (!adminKey) {
        setPendingLoading(false)
        return
      }
      setPendingLoading(true)
      const limit = opts.limit || 50
      const offset = opts.offset || 0
      const url = `${SOCKET_URL}/api/admin/pending?limit=${limit}&offset=${offset}`
      const response = await fetch(url, {
        headers: { 'x-admin-key': adminKey }
      })
      const data = await response.json()
      const items = Array.isArray(data) ? data : []

      if (offset === 0) {
        setPendingData(items)
      } else {
        setPendingData(prev => {
          if (!Array.isArray(prev)) return items
          const seen = new Set(prev.map(i => `${i.type}:${i.id}`))
          const deduped = items.filter(i => !seen.has(`${i.type}:${i.id}`))
          return [...prev, ...deduped]
        })
      }
    } catch (error) {
      console.error('Failed to fetch pending data:', error)
    } finally { setPendingLoading(false) }
  }

  const handleBestOfSortChange = useCallback((sort) => {
    sessionStorage.setItem('bestOfSort', sort)
    setBestOfSort(sort)
    setBestOfOffset(0)
    setBestOfData(null)
    fetchBestOfData({ sort, offset: 0, force: true })
  }, [fetchBestOfData])

  const handleAdminToggle = useCallback(() => {
    if (adminKey) {
      sessionStorage.removeItem('adminKey')
      setAdminKey('')
      setBestOfViewMode('approved')
      return
    }
    const key = window.prompt('Enter admin key:')
    if (key) {
      sessionStorage.setItem('adminKey', key)
      setAdminKey(key)
    }
  }, [adminKey])

  const handleApproveSFW = useCallback(async (id, index) => {
    // Optimistic UI update
    if (bestOfViewMode === 'pending') {
      const item = Array.isArray(pendingData) ? pendingData.find(i => i.id === id) : null
      setPendingData(prev => (Array.isArray(prev) ? prev.filter(item => item.id !== id) : prev))
      if (item) {
        setBestOfData(prev => {
          if (!Array.isArray(prev)) return prev
          if (prev.some(i => i.id === id)) return prev
          return [...prev, { ...item, is_nsfw: false }]
        })
      }
    } else {
      setBestOfData(prev => (Array.isArray(prev) ? prev.filter(item => item.id !== id) : prev))
    }

    try {
      const response = await fetch(`${SOCKET_URL}/api/admin/approve-sfw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey
        },
        body: JSON.stringify({ id })
      })

      if (!response.ok) {
        // Revert on error
        if (bestOfViewMode === 'pending') {
          fetchPendingData({ force: true })
        } else {
          fetchBestOfData({ force: true })
        }
        setNotice(noticeFor('Failed to approve as SFW', 'warn', 3000))
      } else {
        setNotice(noticeFor('Approved as SFW', 'success', 2000))
        setTimeout(() => fetchBestOfData({ force: true }), 300)
      }
    } catch (error) {
      console.error('Failed to approve as SFW:', error)
      // Revert on error
      if (bestOfViewMode === 'pending') {
        fetchPendingData({ force: true })
      } else {
        fetchBestOfData({ force: true })
      }
      setNotice(noticeFor('Failed to approve as SFW', 'warn', 3000))
    }
  }, [adminKey, bestOfViewMode, pendingData, bestOfData])

  const handleApproveNSFW = useCallback(async (id, index) => {
    // Optimistic UI update
    if (bestOfViewMode === 'pending') {
      setPendingData(prev => (Array.isArray(prev) ? prev.filter(item => item.id !== id) : prev))
    } else {
      setBestOfData(prev => (Array.isArray(prev) ? prev.filter(item => item.id !== id) : prev))
    }

    try {
      const response = await fetch(`${SOCKET_URL}/api/admin/approve-nsfw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey
        },
        body: JSON.stringify({ id })
      })

      if (!response.ok) {
        // Revert on error
        if (bestOfViewMode === 'pending') {
          fetchPendingData({ force: true })
        } else {
          fetchBestOfData({ force: true })
        }
        setNotice(noticeFor('Failed to approve as NSFW', 'warn', 3000))
      } else {
        setNotice(noticeFor('Approved as NSFW', 'success', 2000))
        setTimeout(() => fetchBestOfData({ force: true }), 300)
      }
    } catch (error) {
      console.error('Failed to approve as NSFW:', error)
      // Revert on error
      if (bestOfViewMode === 'pending') {
        fetchPendingData({ force: true })
      } else {
        fetchBestOfData({ force: true })
      }
      setNotice(noticeFor('Failed to approve as NSFW', 'warn', 3000))
    }
  }, [adminKey, bestOfViewMode])

  const handleViewModeChange = useCallback((mode) => {
    setBestOfViewMode(mode)
    if (mode === 'pending') {
      setPendingData(null)
    } else {
      setBestOfData(null)
    }
  }, [])

  const handleCopyBestOfLink = useCallback((pairId) => {
    if (!pairId) return
    const url = `${window.location.origin}?view=best-of&pair=${pairId}`
    navigator.clipboard?.writeText(url)
    setNotice(noticeFor('Link copied', 'success', 1200))
  }, [])

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const view = params.get('view')
      const pairId = params.get('pair')
      if (view === 'best-of') {
        setGameState('best-of')
        if (pairId) scrollBestOfIdRef.current = pairId
        sessionStorage.removeItem('bestOfSort')
        setBestOfSort('votes')
        setBestOfOffset(0)
        setBestOfLoading(false)
        setBestOfData(null)
      }
      const room = params.get('room')
      if (room && /^\d{4}$/.test(room)) {
        setRoomCode(room)
        history.replaceState(null, '', window.location.pathname)
      }
      // Handle /fword route
      if (window.location.pathname === '/fword') {
        setGameState('fword')
      }
    } catch (_) {}
  }, [])

  // Push browser history entry when entering sub-pages from landing
  const SUB_PAGES = ['best-of', 'help', 'support']
  const prevGameStateRef = useRef(null)
  useEffect(() => {
    const prev = prevGameStateRef.current
    prevGameStateRef.current = gameState
    if (gameState === 'best-of' && prev !== 'best-of') {
      sessionStorage.removeItem('bestOfSort')
      setBestOfSort('votes')
      setBestOfOffset(0)
      setBestOfLoading(false)
      setBestOfData(null)
    }
    if (SUB_PAGES.includes(gameState) && (prev === 'welcome' || prev === null)) {
      history.pushState({ flukeSubPage: gameState }, '')
    }
  }, [gameState])

  useEffect(() => {
    const handlePop = () => {
      if (SUB_PAGES.includes(gameStateRef.current)) {
        setGameState('welcome')
      }
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [])

  useEffect(() => {
    if (isAuthChecking) return
    if (gameState === 'best-of') {
      if (bestOfViewMode === 'pending' && pendingData === null && !pendingLoading && adminKey) {
        fetchPendingData({ force: true })
      } else if (bestOfViewMode === 'approved' && bestOfData === null && !bestOfLoading) {
        fetchBestOfData({ sort: 'votes', offset: 0, force: true })
      }
    }
  }, [gameState, bestOfData, bestOfLoading, pendingData, pendingLoading, bestOfViewMode, adminKey, isAuthChecking])

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
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ roomCode })
      })
      if (response.status === 403) {
        sessionStorage.removeItem('adminKey')
        setAdminKey('')
        setNotice(noticeFor('Admin key invalid', 'warn', 3000))
        return
      }
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
      const response = await fetch(`${SOCKET_URL}/api/admin/delete-pair`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ type, id })
      })
      if (response.status === 403) {
        sessionStorage.removeItem('adminKey')
        setAdminKey('')
        setNotice(noticeFor('Admin key invalid', 'warn', 3000))
        return
      }
      const result = await response.json()
      if (result.success) {
        if (bestOfViewMode === 'pending') {
          setPendingData(prev => (Array.isArray(prev) ? prev.filter(item => item.id !== id) : prev))
          setNotice(noticeFor('Item deleted from Pending', 'success', 2000))
        } else {
          setBestOfData(prev => (Array.isArray(prev) ? prev.filter(item => item.id !== id) : prev))
          setNotice(noticeFor('Item deleted from Best Of', 'success', 2000))
        }
      } else {
        setNotice(noticeFor('Failed to delete item', 'warn', 3000))
      }
    } catch (error) {
      console.error('Failed to delete best-of item:', error)
      setNotice(noticeFor('Failed to delete item', 'warn', 3000))
    }
  }

  const handleRejectFactual = async (id, index) => {
    try {
      const response = await fetch(`${SOCKET_URL}/api/admin/reject-factual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ id })
      })
      if (response.status === 403) {
        sessionStorage.removeItem('adminKey')
        setAdminKey('')
        setNotice(noticeFor('Admin key invalid', 'warn', 3000))
        return
      }
      const result = await response.json()
      if (result.success) {
        setPendingData(prev => (Array.isArray(prev) ? prev.filter(item => item.id !== id) : prev))
        setNotice(noticeFor('Rejected as factual', 'success', 2000))
      } else {
        setNotice(noticeFor('Failed to reject as factual', 'warn', 3000))
      }
    } catch (error) {
      console.error('Failed to reject as factual:', error)
      setNotice(noticeFor('Failed to reject as factual', 'warn', 3000))
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

  const { handleVote } = useSocketEvents({
    socketUrl: SOCKET_URL,
    refs: {
      socketRef,
      reconnectAttemptedRef,
      roomCodeRef,
      gameStateRef,
      prefillWhatIfRef,
      disconnectedPlayersRef,
      disconnectDeadlineRef,
      disconnectNoticeTimerRef,
      playerNameRef,
      skipNextCountdownRef,
      pendingVoteRef,
      playersRef
    },
    actions: {
      setSocket,
      setShowDisconnectOverlay,
      setDisconnectOverlayDeadline,
      setNotice,
      setReconnectPrompt,
      setReconnectInfo,
      setPlayers,
      setHostId,
      setIsHost,
      setGameState,
      setSubmitted,
      setFirstSubmitter,
      setCurrentContent,
      setMyReactions,
      setReactionCounts,
      setProgress,
      setQuestion,
      setAnonymousMode,
      setPlayerStatuses,
      setAssignedQuestion,
      setShowLastSubmitterIndicator,
      setAnswer,
      setGameStats,
      setForceConfirm,
      setLastQuestionSubmitter,
      setPerformanceVotes,
      setSummaryVotes,
      setSummaryPairVoteId,
      setMostAdoredWriter,
      setGameAwards,
      setUserVotes,
      setRoundHistory,
      setVotersCount,
      setRoomCode,
      setPlayerName,
      setHasRead,
      setKickConfirm,
      setError,
      setReactions,
      setCurrentTurn,
      setConnectionStatus,
      setTournament,
      setScoreboardData,
      setTournamentCompleteData,
      setAuthorReveals
    },
    helpers: { applySummaryData, playSound },
    voteState: { summaryPairVoteId }
  })

  // Track per-player disconnect timestamps so the lobby can show reconnect countdowns.
  useEffect(() => {
    const s = socketRef.current
    if (!s) return
    const onDisconnected = (data) => {
      const name = data?.disconnectedPlayer
      if (!name) return
      const graceMs = (typeof data?.gracePeriod === "number" ? data.gracePeriod : 180) * 1000
      setDisconnectedPlayerMeta(prev => ({
        ...prev,
        [name]: { disconnectedAt: Date.now(), graceMs }
      }))
    }
    const clearName = (name) => {
      setDisconnectedPlayerMeta(prev => {
        if (!prev[name]) return prev
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
    const onRejoined = (data) => {
      if (data?.playerName) clearName(data.playerName)
    }
    const onLeft = (data) => {
      const list = Array.isArray(data) ? data : data?.players || []
      const names = new Set(list.map(p => p.name))
      setDisconnectedPlayerMeta(prev => {
        const next = {}
        Object.entries(prev).forEach(([name, meta]) => {
          if (!names.has(name)) next[name] = meta
        })
        return next
      })
    }
    s.on("player-disconnected", onDisconnected)
    s.on("player-rejoined", onRejoined)
    s.on("player-left", onLeft)
    return () => {
      s.off("player-disconnected", onDisconnected)
      s.off("player-rejoined", onRejoined)
      s.off("player-left", onLeft)
    }
  }, [socket])

  // Screen Wake Lock: keep the screen on during active game phases so the phone
  // doesn't blank and drop the connection mid-round.
  useEffect(() => {
    const activePhases = ["writing", "answering", "performing", "ended", "scoreboard", "tournament_complete"]
    if (!activePhases.includes(gameState) || !("wakeLock" in navigator)) {
      if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null }
      return
    }
    let cancelled = false
    const requestWakeLock = () => {
      if (cancelled || document.visibilityState !== "visible" || !activePhases.includes(gameStateRef.current)) return
      navigator.wakeLock.request("screen").then(lock => {
        if (cancelled) { lock.release(); return }
        wakeLockRef.current = lock
        lock.addEventListener("release", () => {
          if (!cancelled) {
            wakeLockRef.current = null
            // The browser may release the lock automatically (e.g. screen dim).
            // Re-acquire if we are still in an active phase and visible.
            requestWakeLock()
          }
        })
      }).catch(() => {})
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") requestWakeLock()
    }
    requestWakeLock()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisible)
      if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null }
      wakeLockNoticeShownRef.current = false
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

  const startGame = useCallback(() => { socket.emit("start-game", { noSelfReading, tournament: tournamentConfig.enabled ? tournamentConfig : null }) }, [socket, noSelfReading, tournamentConfig])

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
    setShowDisconnectOverlay(false)
    setDisconnectOverlayDeadline(null)
  }, [socket])

  const resetGame = useCallback(() => {
    if (socket && roomCodeRef.current) { socket.emit("leave-room") }
    clearSession()
    reconnectAttemptedRef.current = false
    setGameState("welcome")
    setPlayerName("")
    setRoomCode("")
    setPlayers([])
    playersRef.current = []
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
    setShowDisconnectOverlay(false)
    setDisconnectOverlayDeadline(null)
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
    playersRef.current = []
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
    setShowDisconnectOverlay(false)
    setDisconnectOverlayDeadline(null)
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

  const getWaitingMessage = (phase, remainingNames) => {
    const remaining = remainingNames.length
    if (remaining <= 0) return phase === 'writing' ? 'Everyone is in — answers are loading.' : 'Everyone is in — performance is loading.'
    if (remaining === 1) return `${remainingNames[0]} is still finishing up.`
    if (remaining <= 4) {
      const last = remainingNames[remaining - 1]
      const rest = remainingNames.slice(0, -1)
      return `${rest.join(', ')}${rest.length > 0 ? ' and ' : ''}${last} are still finishing up.`
    }
    const preview = remainingNames.slice(0, 4)
    const more = remaining - preview.length
    return `${preview.join(', ')} and ${more} more are still finishing up.`
  }

  const getWaitingTip = (remainingNames) => {
    const remaining = remainingNames.length
    if (remaining <= 0) return 'The next phase should start any second.'
    return ''
  }

  const renderWaitingPanel = (phase) => {
    const remainingNames = playerStatuses.filter(p => !p.submitted).map(p => p.name)
    const visiblePlayers = playerStatuses.slice(0, 6)
    const remainingPlayers = playerStatuses.length - visiblePlayers.length

    return (
    <div className="waiting-panel waiting-panel--compact animate-pulse">
      <div className="waiting-panel__top">
        <div>
          <p className="summary-pill text-sm font-bold">Waiting Room</p>
          <h3 className="waiting-panel__title text-base font-bold">{getWaitingMessage(phase, remainingNames)}</h3>
        </div>
        <span className="waiting-panel__count text-base font-bold">{progress.submitted}/{progress.total}</span>
      </div>
      {getWaitingTip(remainingNames) && (<p className="waiting-panel__tip text-sm font-semibold">{getWaitingTip(remainingNames)}</p>)}
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
                <span className={p.submitted ? "text-green-300 truncate text-sm font-semibold" : "text-gray-300 truncate text-sm font-semibold"}>{p.name}</span>
              </div>
              <span className={p.submitted ? "text-green-400 text-sm font-semibold" : "text-gray-400 text-sm font-semibold"}>{p.submitted ? "✓ Done" : phase === 'writing' ? "writing..." : "answering..."}</span>
            </div>
          ))}
          {remainingPlayers > 0 && (
            <div className="waiting-panel__more text-sm font-semibold">+{remainingPlayers} more player{remainingPlayers === 1 ? "" : "s"}</div>
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
                  if (socketRef.current?.connected) {
                    socketRef.current.emit("reconnect-player", { roomCode: code, playerName: name })
                  } else {
                    socketRef.current?.connect()
                  }
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
          <BestOfView
            bestOfScrollRef={bestOfScrollRef}
            bestOfSentinelRef={bestOfSentinelRef}
            bestOfData={bestOfViewMode === 'pending' ? pendingData : bestOfData}
            bestOfSort={bestOfSort}
            bestOfLoading={bestOfViewMode === 'pending' ? pendingLoading : bestOfLoading}
            adminKey={adminKey}
            onBack={() => setGameState("welcome")}
            onSortChange={handleBestOfSortChange}
            onToggleAdmin={handleAdminToggle}
            onCopyLink={handleCopyBestOfLink}
            onDeleteItem={handleDeleteBestOf}
            onApproveSFW={handleApproveSFW}
            onApproveNSFW={handleApproveNSFW}
            onRejectFactual={handleRejectFactual}
            viewMode={bestOfViewMode}
            onViewModeChange={handleViewModeChange}
          />
        )

      case "fword":
        return (
          <>
            {!ageGatePassed && <AgeGate onConfirm={() => setAgeGatePassed(true)} />}
            {ageGatePassed && <UncutBestOfView onBack={() => setGameState("welcome")} />}
          </>
        )

      case "welcome":
        return (
          <div className="relative h-full">
            {reconnectPrompt && (
              <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="reconnect-title">
                <div ref={reconnectTrapRef} className="bg-gray-900 border border-indigo-700 rounded-xl p-6 max-w-sm w-full text-center shadow-2xl">
                  <div className="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                    <span className="text-2xl">🎮</span>
                  </div>
                  <h2 id="reconnect-title" className="text-lg font-bold text-white mb-1">Active Game Found</h2>
                  <p className="text-sm text-gray-400 mb-3">You have a game in progress</p>
                  <div className="text-center mb-4">
                    <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Room Code</p>
                    <div className="text-3xl font-black text-gradient tracking-[0.2em]">{reconnectPrompt.roomCode}</div>
                  </div>
                  <div className="space-y-3">
                    <button
                      onClick={() => {
                        if (socketRef.current?.connected) {
                          socketRef.current.emit("reconnect-player", {
                            roomCode: reconnectPrompt.roomCode,
                            playerName: reconnectPrompt.playerName
                          })
                          setReconnectPrompt(null)
                        } else {
                          socketRef.current?.connect()
                        }
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
          <LobbyView
            roomCode={roomCode}
            players={players}
            socket={socket}
            isHost={isHost}
            soundMuted={soundMuted}
            kickConfirm={kickConfirm}
            kickTrapRef={kickTrapRef}
            anonymousMode={anonymousMode}
            noSelfReading={noSelfReading}
            setNoSelfReading={setNoSelfReading}
            startGame={startGame}
            setKickConfirm={setKickConfirm}
            setSoundMuted={setSoundMuted}
            writeSoundMuted={writeSoundMuted}
            setNotice={setNotice}
            socketRef={socketRef}
            tournamentConfig={tournamentConfig}
            setTournamentConfig={setTournamentConfig}
            connectionStatus={connectionStatus}
            disconnectedPlayerMeta={disconnectedPlayerMeta}
          />
        )

      case "writing":
        return (
          <WritingPhase
            submitted={submitted}
            anonymousMode={anonymousMode}
            question={question}
            setQuestion={setQuestion}
            roomCodeRef={roomCodeRef}
            error={error}
            submitQuestion={submitQuestion}
            progress={progress}
            canForceAdvance={canForceAdvance}
            setForceConfirm={setForceConfirm}
            forceConfirm={forceConfirm}
            forceConfirmTrapRef={forceConfirmTrapRef}
            forceProgress={forceProgress}
            renderWaitingPanel={renderWaitingPanel}
            speedScoringEnabled={!!tournament?.speedScoringEnabled}
          />
        )

      case "answering":
        return (
          <AnsweringPhase
            submitted={submitted}
            assignedQuestion={assignedQuestion}
            answer={answer}
            setAnswer={setAnswer}
            roomCodeRef={roomCodeRef}
            error={error}
            submitAnswer={submitAnswer}
            progress={progress}
            canForceAdvance={canForceAdvance}
            setForceConfirm={setForceConfirm}
            forceConfirm={forceConfirm}
            forceConfirmTrapRef={forceConfirmTrapRef}
            forceProgress={forceProgress}
            renderWaitingPanel={renderWaitingPanel}
            speedScoringEnabled={!!tournament?.speedScoringEnabled}
          />
        )

      case "performing":
        return (
          <PerformancePhase
            currentTurn={currentTurn}
            socket={socket}
            socketRef={socketRef}
            hasRead={hasRead}
            completeReading={completeReading}
            gameStats={gameStats}
            error={error}
            forceConfirm={forceConfirm}
            forceConfirmTrapRef={forceConfirmTrapRef}
            setForceConfirm={setForceConfirm}
            forceProgress={forceProgress}
            isHost={isHost}
            currentContent={currentContent}
            myReactions={myReactions}
            reactionCounts={reactionCounts}
            setReactions={setReactions}
            setMyReactions={setMyReactions}
          />
        )
      case "ended":
        return (
          <SummaryPhase
            hideGameConfirm={hideGameConfirm}
            hideGameTrapRef={hideGameTrapRef}
            setHideGameConfirm={setHideGameConfirm}
            handleHideGame={handleHideGame}
            roundHistory={roundHistory}
            showRoundHistory={showRoundHistory}
            setShowRoundHistory={setShowRoundHistory}
            expandedHistoryRounds={expandedHistoryRounds}
            setExpandedHistoryRounds={setExpandedHistoryRounds}
            players={players}
            votersCount={votersCount}
            gameSummary={gameSummary}
            summaryAnonymousMode={summaryAnonymousMode}
            anonymousMode={anonymousMode}
            summaryVotes={summaryVotes}
            userVotes={userVotes}
            summaryPairVoteId={summaryPairVoteId}
            pendingVoteRef={pendingVoteRef}
            handleVote={handleVote}
            roundLeader={roundLeader}
            fastestTyper={fastestTyper}
            slowestTyper={slowestTyper}
            mostAdoredWriter={mostAdoredWriter}
            isHost={isHost}
            socketRef={socketRef}
            noSelfReading={noSelfReading}
            setNoSelfReading={setNoSelfReading}
            disbandGame={disbandGame}
            adminKey={adminKey}
            handleAbandonGame={handleAbandonGame}
            setNotice={setNotice}
            tournament={tournament}
            authorReveals={authorReveals}
            playerName={playerName}
          />
        )

      case "scoreboard":
        return (
          <ScoreboardView
            scoreboardData={scoreboardData}
            isHost={isHost}
            socketRef={socketRef}
            playerName={playerName}
            setNotice={setNotice}
          />
        )

      case "tournament_complete":
        return (
          <TournamentCompleteView
            tournamentCompleteData={tournamentCompleteData}
            isHost={isHost}
            socketRef={socketRef}
            disbandGame={disbandGame}
            playerName={playerName}
          />
        )

      case "help":
        return (
          <HelpPage
            helpTab={helpTab}
            onTabChange={setHelpTab}
            onBack={() => setGameState("welcome")}
            onOpenSupport={() => setGameState("support")}
          />
        )

      case "support":
        return <SupportPage onBack={() => setGameState("welcome")} />

      default:
        return null
    }
  }

  return (
    <div className="h-dvh overflow-auto bg-gradient-to-br from-gray-950 to-gray-900 relative">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="countdown-title">
          <div ref={countdownTrapRef} className="bg-gray-900 border border-gray-700 rounded-2xl px-8 py-8 text-center shadow-2xl max-w-xs">
            <p id="countdown-title" className="text-sm text-indigo-300 uppercase tracking-widest font-bold mb-3">
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
      {showDisconnectOverlay && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="disconnect-title">
          <div ref={disconnectTrapRef} className="bg-gray-900 border border-amber-500/40 rounded-2xl px-6 py-8 text-center shadow-2xl max-w-sm w-full">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/15 flex items-center justify-center">
              <span className="text-3xl">⚠️</span>
            </div>
            <p id="disconnect-title" className="text-lg font-bold text-white mb-2">Connection lost</p>
            <p className="text-sm text-gray-400 mb-4">Trying to reconnect you to the game. You can close this tab and rejoin within the next 3 minutes.</p>
            <div className="text-3xl font-black text-amber-400 tracking-wider">
              {formatTimeLeft(Math.max(0, (disconnectOverlayDeadline || 0) - Date.now()))}
            </div>
            <p className="text-xs text-gray-500 mt-3">Refresh if the timer runs out.</p>
          </div>
        </div>
      )}
      {gameState !== "welcome" && gameState !== "best-of" && gameState !== "help" && gameState !== "support" && (
        <div className="fixed bottom-2 left-2 z-40 flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-900/80 border border-gray-700 text-xs font-medium backdrop-blur-sm">
          <span className={"w-2 h-2 rounded-full " + (connectionStatus === "connected" ? "bg-green-500" : connectionStatus === "reconnecting" ? "bg-yellow-400 animate-pulse" : "bg-red-500")} />
          <span className={connectionStatus === "connected" ? "text-green-400" : connectionStatus === "reconnecting" ? "text-yellow-400" : "text-red-400"}>
            {connectionStatus === "connected" ? "Online" : connectionStatus === "reconnecting" ? "Reconnecting…" : "Offline"}
          </span>
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
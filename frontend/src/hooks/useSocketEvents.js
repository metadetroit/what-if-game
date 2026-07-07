import { useCallback, useEffect } from "react"
import { io } from "socket.io-client"
import {
  loadSession,
  touchSession,
  clearSession,
  saveDraft,
  loadDraft,
  clearDraft,
  noticeFor,
  waitingForLabel
} from "../utils/gameUtils"

const ACTIVE_GAMEPLAY = ['lobby', 'writing', 'answering', 'performing', 'ended', 'scoreboard', 'tournament_complete']

export function useSocketEvents({ socketUrl, refs, actions, helpers, voteState }) {
  const {
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
  } = refs

  const {
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
  } = actions

  const { applySummaryData, playSound } = helpers
  const { summaryPairVoteId } = voteState

  const handleVote = useCallback((type, targetId) => {
    if (pendingVoteRef.current) {
      setNotice(noticeFor("Please wait…", "info", 1200))
      return
    }
    if (type === "qa_pair" && summaryPairVoteId && summaryPairVoteId !== targetId) {
      setNotice(noticeFor("You already voted for a different pairing", "warn", 2500))
      return
    }
    if (!socketRef.current || !roomCodeRef.current) {
      return
    }
    pendingVoteRef.current = { type, targetId }
    socketRef.current.emit("submit-vote", { type, targetId })
  }, [summaryPairVoteId, setNotice, socketRef, roomCodeRef, pendingVoteRef])

  useEffect(() => {
    const newSocket = io(socketUrl, {
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    })
    setSocket(newSocket)
    socketRef.current = newSocket

    newSocket.on("connect", () => {
      setConnectionStatus("connected")
      const activeGameplay = ACTIVE_GAMEPLAY.includes(gameStateRef.current)
      setShowDisconnectOverlay(false)
      setDisconnectOverlayDeadline(null)
      if (activeGameplay) {
        setNotice(noticeFor("Back online", "success", 1500))
      } else {
        setNotice(prev => (prev && prev.tone === "warn" ? null : prev))
      }

      const session = loadSession()
      if (!session || reconnectAttemptedRef.current) {
        return
      }
      reconnectAttemptedRef.current = true
      if (gameStateRef.current !== "welcome") {
        newSocket.emit("reconnect-player", { roomCode: session.roomCode, playerName: session.playerName })
      } else {
        setReconnectPrompt({ roomCode: session.roomCode, playerName: session.playerName })
      }
    })

    newSocket.on("reconnecting", () => {
      setConnectionStatus("reconnecting")
    })

    newSocket.on("disconnect", () => {
      setConnectionStatus("disconnected")
      reconnectAttemptedRef.current = false
      const activeGameplay = ACTIVE_GAMEPLAY.includes(gameStateRef.current)
      if (activeGameplay) {
        setShowDisconnectOverlay(true)
        setDisconnectOverlayDeadline(Date.now() + 180000)
        setNotice(noticeFor("You disconnected. If you don't automatically reconnect, try refreshing your screen.", "warn", null))
      }
      touchSession()
    })

    const handleBeforeUnload = () => touchSession()
    window.addEventListener("beforeunload", handleBeforeUnload)

    let revalidateTimer = null
    const revalidatePresence = () => {
      if (revalidateTimer) return
      revalidateTimer = setTimeout(() => {
        revalidateTimer = null
        const state = gameStateRef.current
        if (state === "welcome" || state === "reconnect-failed") return
        const session = loadSession()
        if (!session) return
        if (socketRef.current?.connected) {
          socketRef.current.emit("check-presence", { roomCode: session.roomCode, playerName: session.playerName })
        } else {
          reconnectAttemptedRef.current = false
        }
      }, 200)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return
      // If the socket is disconnected, force a connection attempt immediately.
      // The connect handler will then run the reconnect logic automatically.
      if (socketRef.current && !socketRef.current.connected) {
        reconnectAttemptedRef.current = false
        socketRef.current.connect()
      }
      revalidatePresence()
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    const handlePageShow = () => revalidatePresence()
    window.addEventListener("pageshow", handlePageShow)

    const updatePlayersAndHost = (payload) => {
      if (!payload) return
      const playerList = Array.isArray(payload) ? payload : payload.players || []
      playersRef.current = playerList
      const nextHostId = !Array.isArray(payload) ? payload.hostId : null
      setPlayers(playerList)
      if (nextHostId) {
        setHostId(nextHostId)
        setIsHost(newSocket.id === nextHostId)
      }
    }

    newSocket.on("player-joined", updatePlayersAndHost)
    newSocket.on("player-left", (payload) => {
      updatePlayersAndHost(payload)
      if (disconnectedPlayersRef.current.length > 0) {
        disconnectedPlayersRef.current = []
        disconnectDeadlineRef.current = null
        if (disconnectNoticeTimerRef.current) {
          clearTimeout(disconnectNoticeTimerRef.current)
          disconnectNoticeTimerRef.current = null
        }
        setNotice(prev => (prev && prev.expiresAt == null && (prev.tone === "warn" || prev.tone === "info") ? null : prev))
      }
    })

    newSocket.on("game-started", (data) => {
      setGameState("writing")
      setSubmitted(false)
      setFirstSubmitter(null)
      setCurrentContent(null)
      setMyReactions(new Set())
      setReactionCounts({})
      setProgress({ submitted: 0, total: data.totalPlayers || playersRef.current.length })
      const prefill = prefillWhatIfRef.current
      setQuestion(prefill ? "What if" : "")
      if (prefill) saveDraft(roomCodeRef.current, "writing", "What if")
      playSound("chime")
      if (typeof data.anonymousMode === "boolean") setAnonymousMode(data.anonymousMode)
      if (data.tournament) setTournament(data.tournament)
    })

    newSocket.on("progress-update", (data) => {
      setProgress(data)
      if (data.playerStatuses) { setPlayerStatuses(data.playerStatuses) }
      if (data.firstSubmitter) { setFirstSubmitter(data.firstSubmitter) }
      if (data.lastQuestionSubmitter) {
        setLastQuestionSubmitter(data.lastQuestionSubmitter)
      }
    })

    newSocket.on("question-submitted", () => { setSubmitted(true); setError("") })
    newSocket.on("answer-submitted", () => { setSubmitted(true); setError("") })

    newSocket.on("answer-phase", (data) => {
      if (!data || !data.question) {
        setError("Invalid question data received")
        return
      }
      if (data.lastQuestionSubmitter) {
        setLastQuestionSubmitter(data.lastQuestionSubmitter)
      }
      setAssignedQuestion(data.question)
      setGameState("answering")
      setSubmitted(false)
      playSound("chime")
      const playerCount = playersRef.current.length
      setProgress({ submitted: 0, total: playerCount })
      setPlayerStatuses(playersRef.current.map(p => ({ name: p.name, submitted: false })))
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
      setCurrentContent(null)
      setGameStats({ round: data.round, total: data.total })
      setHasRead(false)
      if (data.currentContentDbId) {
        setCurrentContent({
          dbId: data.currentContentDbId,
          authorId: data.currentContentAuthorId,
          type: data.currentContentType || 'question'
        })
      }
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
      setSummaryVotes(prev => ({ ...prev, [data.targetId]: data.voteCount }))
      if (typeof data.votersCount === 'number') setVotersCount(data.votersCount)
    })

    newSocket.on("vote-submitted", (data) => {
      const pendingVote = pendingVoteRef.current
      pendingVoteRef.current = null
      if (data.success) {
        const isVoted = typeof data.isVoted === 'boolean' ? data.isVoted : true
        setUserVotes(prev => ({ ...prev, [data.targetId]: isVoted }))
        if (pendingVote?.type === 'qa_pair') {
          setSummaryPairVoteId(isVoted ? data.targetId : null)
        }
        if (data.authorReveal && isVoted) {
          setAuthorReveals(prev => ({ ...prev, [data.targetId]: data.authorReveal }))
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
        applySummaryData(data.summary, typeof data.anonymousMode === "boolean" ? data.anonymousMode : false)
        setRoundHistory(prev => [...prev, { summary: data.summary, anonymousMode: typeof data.anonymousMode === "boolean" ? data.anonymousMode : false, timestamp: Date.now() }])
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
      if (data.tournament) {
        setTournament(data.tournament)
      }
    })

    newSocket.on("game-restarted", (data) => {
      setGameState("writing")
      setSubmitted(false)
      const prefill = prefillWhatIfRef.current
      setQuestion(prefill ? "What if " : "")
      setAnswer("")
      setAssignedQuestion("")
      setCurrentContent(null)
      setGameStats({ round: 0, total: 0 })
      setHasRead(false)
      setProgress({ submitted: 0, total: 0 })
      setError("")
      applySummaryData(null, false)
      setPlayerStatuses([])
      setForceConfirm(false)
      setShowLastSubmitterIndicator(false)
      setLastQuestionSubmitter(data?.lastQuestionSubmitter || null)
      setGameAwards({ firstQuestionSubmitter: null, firstAnswerSubmitter: null, lastQuestionSubmitter: null, lastAnswerSubmitter: null })
      setPerformanceVotes({})
      setUserVotes({})
      setSummaryVotes({})
      setSummaryPairVoteId(null)
      setMostAdoredWriter(null)
      if (data?.tournament) {
        setTournament({ enabled: true, currentRound: data.tournament.currentRound, targetRounds: data.tournament.targetRounds })
      }
    })

    newSocket.on("scoreboard", (data) => {
      setGameState("scoreboard")
      setScoreboardData(data)
      setTournament({
        enabled: true,
        currentRound: data.currentRound,
        targetRounds: data.targetRounds
      })
    })

    newSocket.on("tournament-complete", (data) => {
      setGameState("tournament_complete")
      setTournamentCompleteData(data)
    })

    newSocket.on("tournament-reset", (data) => {
      setGameState("lobby")
      setTournamentCompleteData(null)
      setScoreboardData(null)
      setTournament(data?.tournament || null)
      setSubmitted(false)
      setQuestion("")
      setAnswer("")
      setAssignedQuestion("")
      applySummaryData(null, false)
      setProgress({ submitted: 0, total: 0 })
      setPlayerStatuses([])
      setPerformanceVotes({})
      setUserVotes({})
      setSummaryVotes({})
      setSummaryPairVoteId(null)
      setMostAdoredWriter(null)
      setRoundHistory([])
    })

    newSocket.on("promotion-queued", (data) => {
      setNotice(noticeFor(`${data.playerName} will join next round`, "info", 2500))
    })

    newSocket.on("game-disbanded", (data) => {
      clearSession()
      setGameState("welcome")
      setRoomCode("")
      setPlayers([])
      playersRef.current = []
      setIsHost(false)
      setQuestion("")
      setAnswer("")
      setAssignedQuestion("")
      setSubmitted(false)
      setProgress({ submitted: 0, total: 0 })
      setCurrentContent(null)
      setCurrentTurn(null)
      setGameStats({ round: 0, total: 0 })
      setHasRead(false)
      applySummaryData(null, false)
      setPlayerStatuses([])
      setForceConfirm(false)
      setNotice(noticeFor(data.message || "The host returned everyone to the main screen.", "info", 5000))
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
      playersRef.current = data.players
      const name = data.disconnectedPlayer
      if (name === playerNameRef.current) return
      if (name && !disconnectedPlayersRef.current.includes(name)) {
        disconnectedPlayersRef.current = [...disconnectedPlayersRef.current, name]
      }
      if (typeof data.gracePeriod === "number" && !disconnectDeadlineRef.current) {
        disconnectDeadlineRef.current = Date.now() + data.gracePeriod * 1000
      }
      const activeGameplay = ACTIVE_GAMEPLAY.includes(gameStateRef.current)
      if (activeGameplay) {
        if (disconnectNoticeTimerRef.current) clearTimeout(disconnectNoticeTimerRef.current)
        disconnectNoticeTimerRef.current = setTimeout(() => {
          setNotice(prev => (prev && prev.expiresAt == null && prev.tone === "warn" ? null : prev))
          disconnectNoticeTimerRef.current = null
        }, 150000)
        setNotice(noticeFor(waitingForLabel(disconnectedPlayersRef.current), "warn", null))
      }
    })

    newSocket.on("player-rejoined", (data) => {
      setPlayers(data.players)
      playersRef.current = data.players
      if (data.hostId) {
        setHostId(data.hostId)
        setIsHost(newSocket.id === data.hostId)
      }
      disconnectedPlayersRef.current = disconnectedPlayersRef.current.filter((n) => n !== data.playerName)
      if (data.playerName === playerNameRef.current) return
      const activeGameplay = ACTIVE_GAMEPLAY.includes(gameStateRef.current)
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
      } else if (activeGameplay) {
        setNotice(noticeFor(`${data.playerName} reconnected — still waiting for ${remaining.join(", ")}…`, "info", null))
      }
    })

    newSocket.on("host-changed", (data) => {
      if (data.hostId) setHostId(data.hostId)
      if (newSocket.id === data.hostId) {
        setIsHost(true)
        setNotice(noticeFor("You're the host now", "info", 3000))
      } else {
        setIsHost(false)
        setNotice(noticeFor(`${data.hostName} is now the host`, "info", 2500))
      }
    })

    newSocket.on("kicked-from-game", (data) => {
      clearSession()
      const kickCode = roomCodeRef.current
      if (kickCode) {
        clearDraft(kickCode, "writing")
        clearDraft(kickCode, "answering")
      }
      reconnectAttemptedRef.current = false
      setGameState("welcome")
      setRoomCode("")
      setPlayers([])
      playersRef.current = []
      setIsHost(false)
      setQuestion("")
      setAnswer("")
      setAssignedQuestion("")
      setSubmitted(false)
      setProgress({ submitted: 0, total: 0 })
      setCurrentContent(null)
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
      setReconnectPrompt(null)
      skipNextCountdownRef.current = true
      if (data.success) {
        playSound("success")
        disconnectedPlayersRef.current = []
        disconnectDeadlineRef.current = null
        setShowDisconnectOverlay(false)
        setDisconnectOverlayDeadline(null)
        if (Array.isArray(data.reactedContentIds)) {
          setMyReactions(new Set(data.reactedContentIds))
        }
        const savedSession = loadSession()
        if (savedSession) {
          setPlayerName(savedSession.playerName)
        }
        setReconnectInfo(null)
        setRoomCode(data.roomCode)
        newSocket.roomCode = data.roomCode
        if (data.hostId) {
          setHostId(data.hostId)
          setIsHost(newSocket.id === data.hostId)
        } else {
          setIsHost(!!data.isHost)
        }
        setPlayers(data.players)
        playersRef.current = data.players
        setGameState(data.phase)
        if (typeof data.anonymousMode === "boolean") setAnonymousMode(data.anonymousMode)
        if (data.assignedQuestion && data.assignedQuestion.text) {
          setAssignedQuestion(data.assignedQuestion.text)
        }
        if (data.alreadySubmittedQuestion || data.alreadyAnswered) {
          setSubmitted(true)
          if (data.alreadySubmittedQuestion && data.submittedQuestion?.text) {
            setQuestion(data.submittedQuestion.text)
          }
        } else {
          setSubmitted(false)
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
        if (data.summary) { applySummaryData(data.summary, typeof data.anonymousMode === "boolean" ? data.anonymousMode : false) }
        if (data.mostAdoredWriter) setMostAdoredWriter(data.mostAdoredWriter)
        if (typeof data.votersCount === 'number') setVotersCount(data.votersCount)
        if (data.firstQuestionSubmitter || data.firstAnswerSubmitter || data.lastQuestionSubmitter || data.lastAnswerSubmitter) {
          setGameAwards({
            firstQuestionSubmitter: data.firstQuestionSubmitter || null,
            firstAnswerSubmitter: data.firstAnswerSubmitter || null,
            lastQuestionSubmitter: data.lastQuestionSubmitter || null,
            lastAnswerSubmitter: data.lastAnswerSubmitter || null
          })
        }
        if (data.userVotes) setUserVotes(data.userVotes)
        if (data.summaryVotes) setSummaryVotes(data.summaryVotes)
        if (data.summaryPairVoteId) setSummaryPairVoteId(data.summaryPairVoteId)
        if (Array.isArray(data.roundHistory)) setRoundHistory(data.roundHistory)
        if (data.tournament) setTournament(data.tournament)
        if (data.scoreboardData) setScoreboardData(data.scoreboardData)
        if (data.tournamentCompleteData) setTournamentCompleteData(data.tournamentCompleteData)
        // Map server 'voting' phase to frontend 'ended' gameState (SummaryPhase handles voting UI)
        if (data.phase === 'voting') {
          setGameState('ended')
        }
        setReactions([])
        if (ACTIVE_GAMEPLAY.includes(data.phase)) {
          setNotice(noticeFor("Reconnected", "success", 2000))
        }
      }
    })

    newSocket.on("presence-stale", () => {
      const session = loadSession()
      if (!session) return
      try {
        // Let the connect handler own the reconnectAttemptedRef flag.
        // If the socket is already connected, this emits immediately; if not,
        // the next connect event will retry automatically.
        newSocket.emit("reconnect-player", { roomCode: session.roomCode, playerName: session.playerName })
      } catch (e) {}
    })

    newSocket.on("reconnect-failed", (data) => {
      clearSession()
      reconnectAttemptedRef.current = false
      setShowDisconnectOverlay(false)
      setDisconnectOverlayDeadline(null)
      setReconnectInfo({ roomCode: data.roomCode, playerName: data.playerName, reason: data.reason })
      setGameState("reconnect-failed")
    })

    newSocket.on("error", (message) => {
      setError(message)
      setTimeout(() => setError(""), 5000)
    })

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("pageshow", handlePageShow)
      if (revalidateTimer) clearTimeout(revalidateTimer)
      newSocket.close()
    }
  }, [socketUrl, setSocket, socketRef, gameStateRef, setShowDisconnectOverlay, setDisconnectOverlayDeadline, setNotice, setReconnectPrompt, setPlayers, setHostId, setIsHost, setGameState, setSubmitted, setFirstSubmitter, setCurrentContent, setMyReactions, setReactionCounts, setProgress, setQuestion, setAnonymousMode, setPlayerStatuses, setAssignedQuestion, setShowLastSubmitterIndicator, setAnswer, setGameStats, setForceConfirm, setLastQuestionSubmitter, setPerformanceVotes, setSummaryVotes, setSummaryPairVoteId, setMostAdoredWriter, setGameAwards, setUserVotes, setRoundHistory, setVotersCount, setRoomCode, setPlayerName, setHasRead, setKickConfirm, setError, playersRef, setCurrentTurn, setReactions, setConnectionStatus, setTournament, setScoreboardData, setTournamentCompleteData, setAuthorReveals])

  return { handleVote }
}

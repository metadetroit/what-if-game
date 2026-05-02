import React, { useState, useEffect, useCallback } from 'react'
import { io } from 'socket.io-client'

// Initialize socket connection
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001'

function App() {
  const [socket, setSocket] = useState(null)
  const [gameState, setGameState] = useState('welcome') // welcome, lobby, writing, answering, performing, ended
  const [playerName, setPlayerName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [players, setPlayers] = useState([])
  const [isHost, setIsHost] = useState(false)
  const [error, setError] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [assignedQuestion, setAssignedQuestion] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [progress, setProgress] = useState({ submitted: 0, total: 0 })
  const [currentTurn, setCurrentTurn] = useState(null)
  const [gameStats, setGameStats] = useState({ round: 0, total: 0 })
  const [hasRead, setHasRead] = useState(false)

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(SOCKET_URL)
    setSocket(newSocket)

    newSocket.on('connect', () => {
      console.log('Connected to server')
    })

    newSocket.on('disconnect', () => {
      setError('Disconnected from server')
    })

    newSocket.on('player-joined', (playerList) => {
      setPlayers(playerList)
    })

    newSocket.on('player-left', (playerList) => {
      setPlayers(playerList)
    })

    newSocket.on('game-started', () => {
      setGameState('writing')
      setSubmitted(false)
    })

    newSocket.on('progress-update', (data) => {
      setProgress(data)
    })

    newSocket.on('answer-phase', (data) => {
      setAssignedQuestion(data.question)
      setGameState('answering')
      setSubmitted(false)
    })

    newSocket.on('performance-phase', (data) => {
      setGameState('performing')
      setGameStats({ round: 1, total: data.totalRounds })
    })

    newSocket.on('reading-turn', (data) => {
      setCurrentTurn(data)
      setGameStats({ round: data.round, total: data.total })
      setHasRead(false)
    })

    newSocket.on('game-ended', () => {
      setGameState('ended')
    })

    newSocket.on('game-restarted', () => {
      setGameState('writing')
      setSubmitted(false)
      setQuestion('')
      setAnswer('')
      setAssignedQuestion('')
      setCurrentTurn(null)
      setGameStats({ round: 0, total: 0 })
      setHasRead(false)
      setProgress({ submitted: 0, total: 0 })
      setError('')
    })

    newSocket.on('error', (message) => {
      setError(message)
    })

    return () => {
      newSocket.close()
    }
  }, [])

  const createRoom = useCallback(() => {
    if (!playerName.trim()) {
      setError('Please enter your name')
      return
    }
    
    if (!socket) {
      setError('Not connected to server')
      return
    }
    
    socket.emit('create-room', playerName, (response) => {
      if (response.success) {
        setRoomCode(response.roomCode)
        setIsHost(true)
        setGameState('lobby')
        setError('')
      } else {
        setError(response.error || 'Failed to create room')
      }
    })
  }, [socket, playerName])

  const joinRoom = useCallback(() => {
    if (!playerName.trim()) {
      setError('Please enter your name')
      return
    }
    if (!roomCode.trim()) {
      setError('Please enter a room code')
      return
    }
    
    if (!socket) {
      setError('Not connected to server')
      return
    }

    socket.emit('join-room', roomCode.toUpperCase(), playerName, (response) => {
      if (response.success) {
        setIsHost(false)
        setGameState('lobby')
        setError('')
      } else {
        setError(response.error || 'Failed to join room')
      }
    })
  }, [socket, playerName, roomCode])

  const startGame = useCallback(() => {
    socket.emit('start-game')
  }, [socket])

  const submitQuestion = useCallback(() => {
    if (!question.trim() || !question.toLowerCase().startsWith('what if')) {
      setError('Question must start with "What if..."')
      return
    }

    socket.emit('submit-question', question)
    setSubmitted(true)
    setError('')
  }, [socket, question])

  const submitAnswer = useCallback(() => {
    if (!answer.trim()) {
      setError('Please enter an answer')
      return
    }

    socket.emit('submit-answer', answer)
    setSubmitted(true)
    setError('')
  }, [socket, answer])

  // Player confirms they finished reading
  const completeReading = useCallback(() => {
    socket.emit('reading-complete')
    setHasRead(true)
  }, [socket])

  const resetGame = useCallback(() => {
    // Leave the old room on the server
    if (socket && socket.roomCode) {
      socket.emit('leave-room')
    }
    setGameState('welcome')
    setPlayerName('')
    setRoomCode('')
    setPlayers([])
    setIsHost(false)
    setError('')
    setQuestion('')
    setAnswer('')
    setAssignedQuestion('')
    setSubmitted(false)
    setProgress({ submitted: 0, total: 0 })
    setCurrentTurn(null)
    setGameStats({ round: 0, total: 0 })
    setHasRead(false)
  }, [socket])

  // Render different screens based on game state
  const renderContent = () => {
    switch (gameState) {
      case 'welcome':
        return (
          <div className="game-container justify-center py-2">
            {/* SMALL: Header info */}
            <div className="text-center mb-6">
              <div className="w-12 h-12 mx-auto mb-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-xl">🤔</span>
              </div>
              <h1 className="text-xl font-extrabold text-gradient mb-0">The What if? Game</h1>
              <p className="text-gray-500 text-[10px] mt-1">3-15 players • 10-15 min</p>
            </div>

            <div className="card space-y-4 py-4">
              {/* MEDIUM: Name input */}
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Your name"
                className="input-field py-3 text-lg"
                maxLength={20}
              />

              {/* BIG: Room code - the primary focus */}
              <div className="space-y-2">
                <label className="text-sm text-indigo-400 font-semibold uppercase tracking-wider">Room Code</label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  className="input-field py-4 text-2xl font-bold text-center tracking-[0.2em] uppercase"
                  maxLength={6}
                />
              </div>

              {/* BIG: Action buttons side by side, Join first */}
              <div className="flex gap-3">
                <button 
                  onClick={joinRoom} 
                  className="btn-primary py-4 px-6 text-lg whitespace-nowrap flex-1"
                  disabled={!socket}
                >
                  {socket ? 'Join Game' : '...'}
                </button>
                <button 
                  onClick={createRoom} 
                  className="btn-secondary py-4 px-4 text-base whitespace-nowrap flex-1"
                  disabled={!socket}
                >
                  {socket ? 'Create' : '...'}
                </button>
              </div>

              {error && (
                <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm text-center">
                  {error}
                </div>
              )}
            </div>
          </div>
        )

      case 'lobby':
        return (
          <div className="game-container py-2">
            {/* BIG: Room code - primary focus */}
            <div className="card mb-3 py-4">
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Room Code</p>
                <div 
                  className="text-4xl font-black text-gradient tracking-[0.2em] cursor-pointer active:scale-95 transition-transform"
                  onClick={() => { navigator.clipboard?.writeText(roomCode) }}
                  title="Tap to copy"
                >
                  {roomCode}
                </div>
                <p className="text-[10px] text-gray-600 mt-2">Tap to copy and share</p>
              </div>
            </div>

            {/* MEDIUM: Players list */}
            <div className="card flex-1 min-h-0 py-3 px-3 mb-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Players</span>
                <span className="text-xs text-gray-400">{players.length}/15</span>
              </div>
              <div className="space-y-2 overflow-y-auto max-h-40">
                {players.map((player, index) => (
                  <div
                    key={player.id}
                    className={`flex items-center gap-3 py-2 px-3 rounded-lg ${
                      player.id === socket?.id 
                        ? 'bg-indigo-900/40 border border-indigo-700' 
                        : 'bg-gray-800'
                    }`}
                  >
                    <div className="w-6 h-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                      {index + 1}
                    </div>
                    <span className={`text-base truncate ${
                      player.id === socket?.id ? 'text-indigo-300 font-semibold' : 'text-white'
                    }`}>
                      {player.name}
                      {player.id === socket?.id && ' (you)'}
                    </span>
                    {player.isHost && (
                      <span className="ml-auto text-[10px] bg-indigo-900/50 text-indigo-400 px-2 py-1 rounded font-semibold">
                        HOST
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* BIG: Start button or waiting message */}
            {isHost ? (
              <button
                onClick={startGame}
                disabled={players.length < 3}
                className="btn-primary py-4 text-lg"
              >
                {players.length < 3 
                  ? `Need ${3 - players.length} more player${3 - players.length === 1 ? '' : 's'}` 
                  : 'Start Game!'}
              </button>
            ) : (
              <div className="text-center py-4">
                <span className="text-base text-indigo-400 animate-pulse">Waiting for host to start...</span>
              </div>
            )}
          </div>
        )

      case 'writing':
        return (
          <div className="game-container py-2">
            {!submitted ? (
              <div className="flex-1 flex flex-col min-h-0">
                {/* SMALL: Header */}
                <div className="text-center mb-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Your Turn</p>
                  <h2 className="text-lg font-bold text-white">Write a Question</h2>
                  <p className="text-xs text-indigo-400">Must begin with "What if..."</p>
                </div>

                {/* BIG: Question input - primary focus */}
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="What if lightning struck humans more regularly?"
                  className="input-field flex-1 min-h-32 resize-none mb-3 text-lg leading-relaxed"
                  maxLength={200}
                />
                
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-500">{question.length}/200</span>
                  {question && !question.toLowerCase().startsWith('what if') && (
                    <span className="text-sm text-red-500 font-semibold">Must start with "What if"</span>
                  )}
                </div>

                {error && (
                  <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm text-center mb-3">
                    {error}
                  </div>
                )}

                {/* BIG: Submit button */}
                <button
                  onClick={submitQuestion}
                  disabled={!question.trim() || !question.toLowerCase().startsWith('what if')}
                  className="btn-primary py-4 text-lg"
                >
                  Submit Question
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                {/* BIG: Success indicator */}
                <div className="w-20 h-20 bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                  <span className="text-3xl">✓</span>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Submitted!</h3>
                <p className="text-gray-400 text-base mb-6">Waiting for others...</p>
                
                {/* MEDIUM: Progress */}
                <div className="w-full max-w-xs">
                  <div className="flex justify-between text-sm text-gray-500 mb-2">
                    <span>Progress</span>
                    <span>{progress.submitted}/{progress.total}</span>
                  </div>
                  <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500 transition-all duration-500"
                      style={{ width: `${progress.total > 0 ? (progress.submitted / progress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )

      case 'answering':
        return (
          <div className="game-container py-2">
            {!submitted ? (
              <div className="flex-1 flex flex-col min-h-0">
                {/* SMALL: Label */}
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 text-center">Answer This Question</p>

                {/* BIG: Question card */}
                <div className="card mb-4 py-4 px-4 bg-gradient-to-br from-indigo-900/30 to-purple-900/30 border-2 border-indigo-700">
                  <p className="text-xl font-bold text-white leading-relaxed text-center">{assignedQuestion}</p>
                </div>

                {/* BIG: Answer textarea - primary focus */}
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Type your funny answer here..."
                  className="input-field flex-1 min-h-28 resize-none mb-3 text-lg leading-relaxed"
                  maxLength={300}
                />
                
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm text-gray-500">{answer.length}/300 characters</span>
                </div>

                {error && (
                  <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm text-center mb-3">
                    {error}
                  </div>
                )}

                {/* BIG: Submit button */}
                <button
                  onClick={submitAnswer}
                  disabled={!answer.trim()}
                  className="btn-primary py-4 text-lg"
                >
                  Submit Answer
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                {/* BIG: Success indicator */}
                <div className="w-20 h-20 bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                  <span className="text-3xl">✓</span>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Answer Submitted!</h3>
                <p className="text-gray-400 text-base mb-6">Waiting for others...</p>
                
                {/* MEDIUM: Progress */}
                <div className="w-full max-w-xs">
                  <div className="flex justify-between text-sm text-gray-500 mb-2">
                    <span>Progress</span>
                    <span>{progress.submitted}/{progress.total}</span>
                  </div>
                  <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500 transition-all duration-500"
                      style={{ width: `${progress.total > 0 ? (progress.submitted / progress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )

      case 'performing':
        return (
          <div className="game-container py-2">
            {currentTurn ? (
              <div className="flex-1 flex flex-col min-h-0">
                {/* BIG: Role banner - primary focus */}
                <div className="mb-3">
                  {/* Question Reader - Question Turn */}
                  {currentTurn.isQuestionTurn && socket.id === currentTurn.questionReader.id && (
                    <div className="py-4 rounded-xl text-center bg-green-500 border-4 border-green-300 shadow-xl shadow-green-900/50">
                      <span className="text-3xl font-black text-white tracking-wider">READ QUESTION</span>
                      <p className="text-green-100 text-sm mt-1">Read aloud, then tap Done</p>
                    </div>
                  )}

                  {/* Question Reader - Answer Turn (waiting) */}
                  {!currentTurn.isQuestionTurn && socket.id === currentTurn.questionReader.id && (
                    <div className="py-3 rounded-lg text-center bg-gray-700 border border-gray-600">
                      <span className="text-lg font-bold text-gray-400">WAITING</span>
                      <p className="text-gray-500 text-sm mt-1">{currentTurn.answerReader.name} is reading the answer</p>
                    </div>
                  )}

                  {/* Answer Reader - Question Turn (waiting) */}
                  {currentTurn.isQuestionTurn && socket.id === currentTurn.answerReader.id && (
                    <div className="py-4 rounded-xl text-center bg-purple-500 border-4 border-purple-300 shadow-xl shadow-purple-900/50">
                      <span className="text-3xl font-black text-white tracking-wider">GET READY</span>
                      <p className="text-purple-100 text-sm mt-1">You're reading the answer next</p>
                    </div>
                  )}

                  {/* Answer Reader - Answer Turn (reading) */}
                  {!currentTurn.isQuestionTurn && socket.id === currentTurn.answerReader.id && (
                    <div className="py-4 rounded-xl text-center bg-purple-500 border-4 border-purple-300 shadow-xl shadow-purple-900/50">
                      <span className="text-3xl font-black text-white tracking-wider">READ ANSWER</span>
                      <p className="text-purple-100 text-sm mt-1">Read aloud, then tap Done</p>
                    </div>
                  )}

                  {/* Others - waiting */}
                  {socket.id !== currentTurn.questionReader.id && socket.id !== currentTurn.answerReader.id && (
                    <div className="py-3 rounded-lg text-center bg-gray-700 border border-gray-600">
                      <span className="text-lg font-bold text-gray-400">LISTEN</span>
                      <p className="text-gray-500 text-sm mt-1">{currentTurn.questionReader.name} &rarr; {currentTurn.answerReader.name}</p>
                    </div>
                  )}
                </div>

                {/* BIG: Content cards */}
                
                {/* Question Reader sees question */}
                {currentTurn.isQuestionTurn && socket.id === currentTurn.questionReader.id && (
                  <div className="card bg-gradient-to-br from-green-600 to-green-800 border-4 border-green-400 shadow-2xl mb-3 py-6 px-5">
                    <p className="text-center text-lg text-green-100 font-bold uppercase tracking-widest mb-3">📖 Read Aloud</p>
                    <p className="text-center text-2xl font-bold text-white leading-relaxed">{currentTurn.question}</p>
                  </div>
                )}

                {/* Answer Reader sees answer */}
                {!currentTurn.isQuestionTurn && socket.id === currentTurn.answerReader.id && currentTurn.answer && (
                  <div className="card bg-gradient-to-br from-purple-600 to-purple-800 border-4 border-purple-400 shadow-2xl mb-3 py-6 px-5">
                    <p className="text-center text-lg text-purple-100 font-bold uppercase tracking-widest mb-3">💬 Read Aloud</p>
                    <p className="text-center text-2xl font-bold text-white leading-relaxed">{currentTurn.answer}</p>
                  </div>
                )}

                {/* BIG: Done button for active readers */}
                {!hasRead && currentTurn.isQuestionTurn && socket.id === currentTurn.questionReader.id && (
                  <button
                    onClick={completeReading}
                    className="btn-primary mb-3 bg-green-600 hover:bg-green-700 text-xl py-5"
                  >
                    Done Reading →
                  </button>
                )}
                
                {!hasRead && !currentTurn.isQuestionTurn && socket.id === currentTurn.answerReader.id && (
                  <button
                    onClick={completeReading}
                    className="btn-primary mb-3 bg-purple-600 hover:bg-purple-700 text-xl py-5"
                  >
                    Done Reading →
                  </button>
                )}

                {/* MEDIUM: Listeners view */}
                {socket.id !== currentTurn.questionReader.id && socket.id !== currentTurn.answerReader.id && (
                  <div className="card bg-gray-800 border-2 border-gray-700 mb-3 py-4 px-5 text-center">
                    <p className="text-gray-300 text-lg">
                      <span className="text-green-400 font-bold text-xl">{currentTurn.questionReader.name}</span>
                      <span className="text-gray-500 mx-3">→</span>
                      <span className="text-purple-400 font-bold text-xl">{currentTurn.answerReader.name}</span>
                    </p>
                    <p className="text-gray-500 text-base mt-2">
                      {currentTurn.isQuestionTurn ? 'Question being read' : 'Answer being read'}
                    </p>
                  </div>
                )}

                {/* SMALL: Progress info at bottom */}
                <div className="mt-auto pt-3 border-t border-gray-800">
                  <div className="flex justify-center gap-1 mb-2">
                    {Array.from({ length: gameStats.total }).map((_, i) => (
                      <div 
                        key={i}
                        className={`w-2 h-2 rounded-full ${
                          i < gameStats.round 
                            ? 'bg-indigo-500' 
                            : i === gameStats.round - 1 
                              ? 'bg-white animate-pulse' 
                              : 'bg-gray-700'
                        }`}
                      />
                    ))}
                  </div>
                  
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>Turn {gameStats.round}/{gameStats.total}</span>
                    <div className="flex-1 mx-3 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-indigo-500 transition-all duration-500"
                        style={{ width: `${gameStats.total > 0 ? (gameStats.round / gameStats.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
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

      case 'ended':
        return (
          <div className="game-container justify-center py-4">
            <div className="text-center">
              {/* BIG: Game over celebration */}
              <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-xl">
                <span className="text-5xl">🎉</span>
              </div>
              <h2 className="text-4xl font-black text-white mb-2">Game Over!</h2>
              <p className="text-gray-400 mb-6 text-base">
                Thanks for playing!
              </p>
              
              {/* Host options */}
              {isHost ? (
                <div className="space-y-3">
                  {/* BIG: Play again with same players */}
                  <button 
                    onClick={() => socket.emit('replay-game')} 
                    className="btn-primary py-4 text-lg w-full"
                  >
                    🔄 Play Again (Same Players)
                  </button>
                  
                  {/* MEDIUM: Start fresh */}
                  <button 
                    onClick={resetGame} 
                    className="btn-secondary py-3 text-base w-full"
                  >
                    Leave & New Game
                  </button>
                </div>
              ) : (
                <div className="py-4">
                  <span className="text-lg text-indigo-400 animate-pulse">Waiting for host...</span>
                </div>
              )}
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900">
      {renderContent()}
    </div>
  )
}

export default App

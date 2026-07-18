import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ScoreboardView from './ScoreboardView'

function makeScoreboard(overrides = {}) {
  const base = {
    standings: [
      { name: 'A', rank: 1, total: 10, votesReceived: 0, firstPlaces: 0, roundScores: [10], roundSpeedBonuses: [0], leftGame: false },
      { name: 'B', rank: 2, total: 8, votesReceived: 0, firstPlaces: 0, roundScores: [8], roundSpeedBonuses: [0], leftGame: false },
      { name: 'C', rank: 3, total: 6, votesReceived: 0, firstPlaces: 0, roundScores: [6], roundSpeedBonuses: [0], leftGame: false },
      { name: 'D', rank: 4, total: 5, votesReceived: 0, firstPlaces: 0, roundScores: [5], roundSpeedBonuses: [0], leftGame: false },
      { name: 'E', rank: 5, total: 4, votesReceived: 0, firstPlaces: 0, roundScores: [4], roundSpeedBonuses: [0], leftGame: false },
      { name: 'F', rank: 6, total: 3, votesReceived: 0, firstPlaces: 0, roundScores: [3], roundSpeedBonuses: [0], leftGame: false },
      { name: 'G', rank: 7, total: 2, votesReceived: 0, firstPlaces: 0, roundScores: [2], roundSpeedBonuses: [0], leftGame: false },
      { name: 'H', rank: 8, total: 1, votesReceived: 0, firstPlaces: 0, roundScores: [1], roundSpeedBonuses: [0], leftGame: false },
      { name: 'I', rank: 9, total: 0, votesReceived: 0, firstPlaces: 0, roundScores: [0], roundSpeedBonuses: [0], leftGame: false },
    ],
    roundWinnerDetails: [],
    currentRound: 1,
    targetRounds: 3,
    isFinalRound: false,
    deadlineAt: Date.now() + 20000,
    serverNow: Date.now(),
    scoringRules: { speedScoringEnabled: false },
    ...overrides,
  }
  return base
}

describe('ScoreboardView relative leaderboard', () => {
  it('renders current player once when ranked 4th', () => {
    const scoreboardData = makeScoreboard()
    const { container } = render(
      <ScoreboardView
        scoreboardData={scoreboardData}
        isHost={false}
        socketRef={{ current: { emit: () => {} } }}
        playerName="D"
        setNotice={() => {}}
      />
    )
    const rows = container.querySelectorAll('[class*="bg-gray-800/60"], [class*="bg-indigo-900/40"]')
    const names = Array.from(rows).map((row) => row.textContent)
    const playerRows = names.filter((n) => n.includes('D'))
    expect(playerRows.length).toBe(1)
  })

  it('renders top 3 plus current player and neighbours when > 8 players', () => {
    const scoreboardData = makeScoreboard()
    const { container } = render(
      <ScoreboardView
        scoreboardData={scoreboardData}
        isHost={false}
        socketRef={{ current: { emit: () => {} } }}
        playerName="E"
        setNotice={() => {}}
      />
    )
    const rows = container.querySelectorAll('[class*="bg-gray-800/60"], [class*="bg-indigo-900/40"]')
    expect(rows.length).toBe(6)
  })
})

describe('ScoreboardView round winner', () => {
  it('shows round winner details and speed bonus', async () => {
    const scoreboardData = makeScoreboard({
      scoringRules: { speedScoringEnabled: true },
      roundWinnerDetails: [
        {
          questionAuthor: 'A',
          answerAuthor: 'B',
          votes: 3,
          isFluke: false,
          pointsBreakdown: { base: 8, speed: 2 },
        },
      ],
    })
    render(
      <ScoreboardView
        scoreboardData={scoreboardData}
        isHost={false}
        socketRef={{ current: { emit: () => {} } }}
        playerName="A"
        setNotice={() => {}}
      />
    )
    await waitFor(() => {
      const banner = screen.getByTestId('winner-banner')
      expect(banner.textContent).toMatch(/A & B/)
    }, { timeout: 3000 })
    const banner = screen.getByTestId('winner-banner')
    expect(banner.textContent).toMatch(/⚡\+2/)
  })
})

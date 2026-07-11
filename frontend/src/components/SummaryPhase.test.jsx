import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SummaryPhase from './SummaryPhase'

const noop = () => {}
const baseProps = {
  hideGameConfirm: false,
  hideGameTrapRef: { current: false },
  setHideGameConfirm: noop,
  handleHideGame: noop,
  roundHistory: [],
  showRoundHistory: false,
  setShowRoundHistory: noop,
  expandedHistoryRounds: [],
  setExpandedHistoryRounds: noop,
  players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
  votersCount: 0,
  gameSummary: [
    {
      pairDbId: 1,
      question: 'What if cats could fly?',
      pairedAnswer: 'The sky would be full of fur.',
      questionAuthorName: 'Alice',
      pairedAnswerAuthorName: 'Bob',
      actualAnswerAuthorName: 'Bob',
    },
  ],
  summaryAnonymousMode: undefined,
  anonymousMode: true,
  summaryVotes: {},
  userVotes: {},
  summaryPairVoteId: null,
  pendingVoteRef: { current: null },
  handleVote: noop,
  roundLeader: null,
  fastestTyper: null,
  slowestTyper: null,
  mostAdoredWriter: null,
  isHost: false,
  socketRef: { current: { emit: noop } },
  noSelfReading: false,
  setNoSelfReading: noop,
  disbandGame: noop,
  adminKey: '',
  handleAbandonGame: noop,
  setNotice: noop,
  tournament: { enabled: true, currentRound: 1, targetRounds: 3 },
  authorReveals: {},
  playerName: 'A',
}

describe('SummaryPhase author reveal', () => {
  it('masks authors in tournament voting without authorReveals', () => {
    render(<SummaryPhase {...baseProps} />)
    expect(screen.getByText(/Q by \?\?\?/)).toBeInTheDocument()
  })

  it('reveals authors when authorReveals entry is present', () => {
    const props = {
      ...baseProps,
      authorReveals: { 1: { qAuthor: 'Alice', aAuthor: 'Bob' } },
    }
    render(<SummaryPhase {...props} />)
    expect(screen.getByText(/Q by Alice/)).toBeInTheDocument()
    expect(screen.getByText(/Paired by Bob/)).toBeInTheDocument()
  })
})

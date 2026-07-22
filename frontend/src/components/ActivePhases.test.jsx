import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import WritingPhase from './WritingPhase'
import AnsweringPhase from './AnsweringPhase'
import PerformancePhase from './PerformancePhase'

const noop = () => {}
const progress = { submitted: 1, total: 4 }
const roomCodeRef = { current: 'ABCD' }

function writingProps(overrides = {}) {
  return {
    submitted: false,
    anonymousMode: false,
    question: 'What if cats could fly?',
    setQuestion: noop,
    roomCodeRef,
    error: '',
    submitQuestion: noop,
    progress,
    canForceAdvance: false,
    setForceConfirm: noop,
    forceConfirm: false,
    forceConfirmTrapRef: { current: null },
    forceProgress: noop,
    renderWaitingPanel: () => <div>Waiting Room</div>,
    speedScoringEnabled: false,
    ...overrides,
  }
}

function answeringProps(overrides = {}) {
  return {
    submitted: false,
    assignedQuestion: 'What if cats could fly?',
    answer: 'Every roof would need a landing pad.',
    setAnswer: noop,
    roomCodeRef,
    error: '',
    submitAnswer: noop,
    progress,
    canForceAdvance: false,
    setForceConfirm: noop,
    forceConfirm: false,
    forceConfirmTrapRef: { current: null },
    forceProgress: noop,
    renderWaitingPanel: () => <div>Waiting Room</div>,
    speedScoringEnabled: false,
    anonymousMode: false,
    ...overrides,
  }
}

const currentTurn = {
  isQuestionTurn: true,
  question: 'What if cats could fly?',
  answer: 'Every roof would need a landing pad.',
  questionReader: { id: 'question-reader', name: 'Alexandria With A Very Long Name' },
  answerReader: { id: 'answer-reader', name: 'Benjamin With Another Very Long Name' },
}

function performanceProps(overrides = {}) {
  return {
    currentTurn,
    socket: { id: 'spectator' },
    socketRef: { current: { id: 'spectator', emit: noop } },
    hasRead: false,
    completeReading: noop,
    rewindPerformance: noop,
    gameStats: { round: 1, total: 4 },
    error: '',
    forceConfirm: false,
    forceConfirmTrapRef: { current: null },
    setForceConfirm: noop,
    forceProgress: noop,
    isHost: false,
    currentContent: null,
    myReactions: new Set(),
    reactionCounts: {},
    setReactions: noop,
    setMyReactions: noop,
    ...overrides,
  }
}

describe('Writing and Answering active phases', () => {
  it('renders the unified Writing header, mode badges, and submit behavior without duplicate turn status', () => {
    const submitQuestion = vi.fn()
    const { container } = render(
      <WritingPhase {...writingProps({ anonymousMode: true, speedScoringEnabled: true, submitQuestion })} />
    )

    expect(screen.getByText('Phase 1')).toBeInTheDocument()
    expect(screen.getByText('Write your question')).toBeInTheDocument()
    expect(screen.getByLabelText('Anonymous mode')).toBeInTheDocument()
    expect(screen.getByLabelText('Blitz Mode: Speed counts this round')).toBeInTheDocument()
    expect(screen.queryByText('YOUR TURN')).not.toBeInTheDocument()
    expect(container.querySelector('[data-phase="writing"]')).toHaveClass('active-phase-header--writing')

    fireEvent.click(screen.getByRole('button', { name: 'Submit Question' }))
    expect(submitQuestion).toHaveBeenCalledOnce()
  })

  it('renders the unified Answering header and locally scrollable assigned question', () => {
    const submitAnswer = vi.fn()
    const { container } = render(
      <AnsweringPhase {...answeringProps({ anonymousMode: true, speedScoringEnabled: true, submitAnswer })} />
    )

    expect(screen.getByText('Phase 2')).toBeInTheDocument()
    expect(screen.getByText('Write your answer')).toBeInTheDocument()
    expect(screen.queryByText('YOUR TURN')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Question to answer' })).toHaveClass('answer-prompt-card')
    expect(container.querySelector('[data-phase="answering"]')).toHaveClass('active-phase-header--answering')

    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }))
    expect(submitAnswer).toHaveBeenCalledOnce()
  })

  it('uses the Waiting Room as the only submitted status surface', () => {
    const { rerender } = render(<WritingPhase {...writingProps({ submitted: true })} />)
    expect(screen.getByText('Waiting Room')).toBeInTheDocument()
    expect(screen.queryByText(/WATCHING|Submitted —/i)).not.toBeInTheDocument()

    rerender(<AnsweringPhase {...answeringProps({ submitted: true })} />)
    expect(screen.getByText('Waiting Room')).toBeInTheDocument()
    expect(screen.queryByText(/WATCHING|Submitted —/i)).not.toBeInTheDocument()
  })
})

describe('Performance phase roles and content', () => {
  it('renders the question reader state and accessible Done action', () => {
    const completeReading = vi.fn()
    render(
      <PerformancePhase
        {...performanceProps({
          socket: { id: 'question-reader' },
          socketRef: { current: { id: 'question-reader', emit: noop } },
          completeReading,
        })}
      />
    )

    expect(screen.getByText('Phase 3')).toBeInTheDocument()
    expect(screen.getByText('Performance Time')).toBeInTheDocument()
    expect(screen.getByText('YOUR TURN')).toBeInTheDocument()
    expect(screen.getByText('Read the question')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Question to read' })).toHaveClass('performance-content-card--question')

    fireEvent.click(screen.getByRole('button', { name: 'Done reading question' }))
    expect(completeReading).toHaveBeenCalledOnce()
  })

  it('renders the answer reader state with distinct labeled content', () => {
    render(
      <PerformancePhase
        {...performanceProps({
          currentTurn: { ...currentTurn, isQuestionTurn: false },
          socket: { id: 'answer-reader' },
          socketRef: { current: { id: 'answer-reader', emit: noop } },
        })}
      />
    )

    expect(screen.getByText('YOUR TURN')).toBeInTheDocument()
    expect(screen.getByText('Read the answer')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Answer to read' })).toHaveClass('performance-content-card--answer')
    expect(screen.getByRole('button', { name: 'Done reading answer' })).toBeInTheDocument()
  })

  it('renders explicit up-next and spectator handoff wording for both turn halves', () => {
    const { rerender } = render(
      <PerformancePhase
        {...performanceProps({
          socket: { id: 'answer-reader' },
          socketRef: { current: { id: 'answer-reader', emit: noop } },
        })}
      />
    )

    expect(screen.getByText('UP NEXT')).toBeInTheDocument()
    expect(screen.getByText('You read the answer next')).toBeInTheDocument()
    expect(screen.getByText(`${currentTurn.questionReader.name} is reading the question`)).toBeInTheDocument()

    rerender(<PerformancePhase {...performanceProps()} />)
    expect(screen.getByText('WATCHING')).toBeInTheDocument()
    expect(screen.getByText(`Next: ${currentTurn.answerReader.name} reads the answer`)).toBeInTheDocument()

    rerender(<PerformancePhase {...performanceProps({ currentTurn: { ...currentTurn, isQuestionTurn: false } })} />)
    expect(screen.getByText(`${currentTurn.answerReader.name} is reading the answer`)).toBeInTheDocument()
    expect(screen.getByText(`Question read by ${currentTurn.questionReader.name}`)).toBeInTheDocument()
  })
})

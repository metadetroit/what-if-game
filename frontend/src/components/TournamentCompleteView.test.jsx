import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TournamentCompleteView from './TournamentCompleteView'

describe('TournamentCompleteView', () => {
  const baseProps = {
    isHost: false,
    socketRef: { current: { emit: vi.fn() } },
    disbandGame: vi.fn(),
    playerName: 'Alice',
  }

  it('renders single champion correctly', () => {
    render(
      <TournamentCompleteView
        {...baseProps}
        tournamentCompleteData={{
          champions: ['Alice'],
          isTie: false,
          standings: [
            { name: 'Alice', rank: 1, total: 15, firstPlaces: 2, votesReceived: 8, leftGame: false },
            { name: 'Bob', rank: 2, total: 10, firstPlaces: 1, votesReceived: 5, leftGame: false },
          ],
        }}
      />
    )
    expect(screen.getByText('Tournament Champion')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('🥇')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('renders co-champions when isTie is true', () => {
    render(
      <TournamentCompleteView
        {...baseProps}
        tournamentCompleteData={{
          champions: ['Alice', 'Bob'],
          isTie: true,
          standings: [
            { name: 'Alice', rank: 1, total: 15, firstPlaces: 2, votesReceived: 8, leftGame: false },
            { name: 'Bob', rank: 1, total: 15, firstPlaces: 2, votesReceived: 8, leftGame: false },
            { name: 'Carol', rank: 3, total: 5, firstPlaces: 0, votesReceived: 2, leftGame: false },
          ],
        }}
      />
    )
    expect(screen.getByText('Co-Champions')).toBeInTheDocument()
    expect(screen.getByText('Alice & Bob')).toBeInTheDocument()
  })

  it('shows (left) label and reduced opacity for leftGame players', () => {
    render(
      <TournamentCompleteView
        {...baseProps}
        tournamentCompleteData={{
          champions: ['Alice'],
          isTie: false,
          standings: [
            { name: 'Alice', rank: 1, total: 15, firstPlaces: 2, votesReceived: 8, leftGame: false },
            { name: 'Dave', rank: 2, total: 10, firstPlaces: 1, votesReceived: 5, leftGame: true },
          ],
        }}
      />
    )
    expect(screen.getByText(/Dave.*\(left\)/)).toBeInTheDocument()
  })

  it('shows host controls when isHost is true', () => {
    const emit = vi.fn()
    const disbandGame = vi.fn()
    render(
      <TournamentCompleteView
        {...baseProps}
        isHost={true}
        socketRef={{ current: { emit } }}
        disbandGame={disbandGame}
        tournamentCompleteData={{
          champions: ['Alice'],
          isTie: false,
          standings: [
            { name: 'Alice', rank: 1, total: 15, firstPlaces: 2, votesReceived: 8, leftGame: false },
          ],
        }}
      />
    )
    const newTournamentBtn = screen.getByText(/New Tournament/)
    fireEvent.click(newTournamentBtn)
    expect(emit).toHaveBeenCalledWith('new-tournament')

    const disbandBtn = screen.getByText(/New game/)
    fireEvent.click(disbandBtn)
    expect(disbandGame).toHaveBeenCalled()
  })

  it('shows waiting message for non-host', () => {
    render(
      <TournamentCompleteView
        {...baseProps}
        tournamentCompleteData={{
          champions: ['Alice'],
          isTie: false,
          standings: [
            { name: 'Alice', rank: 1, total: 15, firstPlaces: 2, votesReceived: 8, leftGame: false },
          ],
        }}
      />
    )
    expect(screen.getByText(/Waiting for host/)).toBeInTheDocument()
  })

  it('returns null when tournamentCompleteData is missing', () => {
    const { container } = render(
      <TournamentCompleteView
        {...baseProps}
        tournamentCompleteData={null}
      />
    )
    expect(container.firstChild).toBeNull()
  })
})

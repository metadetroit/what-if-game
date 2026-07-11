import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import Countdown from './Countdown'

describe('Countdown', () => {
  it('renders the remaining time', () => {
    const now = Date.now()
    render(<Countdown deadlineAt={now + 65000} serverNow={now} />)
    expect(screen.getByText('1:05')).toBeInTheDocument()
  })

  it('updates skew when serverNow changes', () => {
    const now = Date.now()
    const { rerender } = render(<Countdown deadlineAt={now + 60000} serverNow={now} />)
    expect(screen.getByText('1:00')).toBeInTheDocument()

    // Simulate a server re-sync that pushes the deadline 5s later
    const laterServerNow = now + 5000
    const newDeadline = now + 65000
    rerender(<Countdown deadlineAt={newDeadline} serverNow={laterServerNow} />)
    expect(screen.getByText('1:00')).toBeInTheDocument()
  })

  it('calls onExpire when countdown reaches zero', () => {
    vi.useFakeTimers()
    const now = Date.now()
    const onExpire = vi.fn()
    render(<Countdown deadlineAt={now + 1000} serverNow={now} onExpire={onExpire} />)
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(onExpire).toHaveBeenCalled()
    vi.useRealTimers()
  })
})

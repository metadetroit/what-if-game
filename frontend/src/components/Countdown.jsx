import React, { useState, useEffect, useRef } from "react"

/**
 * Server-synced countdown component.
 * Renders mm:ss from a server-provided deadline timestamp.
 * Corrects for client/server clock skew using serverNow.
 *
 * Props:
 *   deadlineAt  - epoch ms (server clock) when countdown reaches zero
 *   serverNow   - epoch ms (server clock) at payload send time
 *   onExpire    - optional callback when countdown reaches 0
 *   className   - optional className for styling
 *   warnAt      - seconds threshold to switch to amber (default 10)
 */
export default function Countdown({ deadlineAt, serverNow, onExpire, className = "", warnAt = 10 }) {
  const skewRef = useRef(0)
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (!deadlineAt || !serverNow) return
    skewRef.current = serverNow - Date.now()
    const update = () => {
      const ms = deadlineAt - (Date.now() + skewRef.current)
      setRemaining(Math.max(0, ms))
      if (ms <= 0 && onExpire) onExpire()
    }
    update()
    const interval = setInterval(update, 250)
    return () => clearInterval(interval)
  }, [deadlineAt, serverNow, onExpire])

  const totalSeconds = Math.ceil(remaining / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const isWarn = totalSeconds <= warnAt && totalSeconds > 0

  return (
    <span className={className + (isWarn ? " text-amber-300" : "")}>
      {minutes}:{seconds.toString().padStart(2, "0")}
    </span>
  )
}

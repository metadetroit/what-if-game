let audioCtx = null

export function noticeFor(message, tone = "info", durationMs = 3000) {
  return { message, tone, expiresAt: durationMs == null ? null : Date.now() + durationMs }
}

export function draftKey(roomCode, phase) {
  return `whatif-draft:${roomCode}:${phase}`
}

const SESSION_KEY = "gameSession"
const SESSION_TTL_MS = 1000 * 60 * 3

export function loadSession() {
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

export function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, timestamp: Date.now() }))
  } catch (e) { /* ignore */ }
}

export function touchSession() {
  const session = loadSession()
  if (session) saveSession(session)
}

export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY) } catch (e) { /* ignore */ }
}

export function saveDraft(roomCode, phase, value) {
  try { localStorage.setItem(draftKey(roomCode, phase), value) } catch (e) { /* ignore */ }
}

export function loadDraft(roomCode, phase) {
  try { return localStorage.getItem(draftKey(roomCode, phase)) } catch (e) { return null }
}

export function clearDraft(roomCode, phase) {
  try { localStorage.removeItem(draftKey(roomCode, phase)) } catch (e) { /* ignore */ }
}

export function waitingForLabel(names) {
  if (!names || names.length === 0) return ""
  if (names.length === 1) return `${names[0]} disconnected — waiting for them to reconnect…`
  return `${names.join(", ")} disconnected — waiting for them to reconnect…`
}

export function formatTimeLeft(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

function ensureAudioContext() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)() } catch (e) { /* ignore */ }
  }
  return audioCtx
}

export function isSoundMuted() {
  try { return localStorage.getItem("fluke-muted") === "1" } catch (e) { return false }
}

export function writeSoundMuted(muted) {
  try { localStorage.setItem("fluke-muted", muted ? "1" : "0") } catch (e) { /* ignore */ }
}

export function getPrefillWhatIf() {
  try { return localStorage.getItem("fluke-prefill") === "1" } catch (e) { return false }
}

export function setPrefillWhatIfStorage(enabled) {
  try { localStorage.setItem("fluke-prefill", enabled ? "1" : "0") } catch (e) { /* ignore */ }
}

export function playSound(type) {
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
    case "ding":
      osc.type = "sine"
      osc.frequency.setValueAtTime(523, now)
      osc.frequency.exponentialRampToValueAtTime(784, now + 0.1)
      gain.gain.setValueAtTime(0.15, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
      osc.start(now)
      osc.stop(now + 0.3)
      break
    case "chime":
      osc.type = "sine"
      osc.frequency.setValueAtTime(440, now)
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.15)
      gain.gain.setValueAtTime(0.12, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
      osc.start(now)
      osc.stop(now + 0.4)
      break
    case "success":
      osc.type = "sine"
      osc.frequency.setValueAtTime(523, now)
      osc.frequency.setValueAtTime(659, now + 0.1)
      osc.frequency.setValueAtTime(784, now + 0.2)
      gain.gain.setValueAtTime(0.12, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
      osc.start(now)
      osc.stop(now + 0.5)
      break
    case "warn":
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

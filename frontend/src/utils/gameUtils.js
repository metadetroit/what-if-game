let audioCtx = null

export function noticeFor(message, tone = "info", durationMs = 3000) {
  return { message, tone, expiresAt: durationMs == null ? null : Date.now() + durationMs }
}

export function draftKey(roomCode, phase) {
  return `whatif-draft:${roomCode}:${phase}`
}

const SESSION_KEY = "gameSession"
const SESSION_TTL_MS = 1000 * 60 * 60

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

const SOUND_THROTTLE_MS = 300
const lastPlayedAt = {}

// Each sound is a list of notes: { freq, t (start offset s), dur (s), type, vol, slideTo }
const SOUND_DEFS = {
  ding: [
    { freq: 523, t: 0, dur: 0.3, vol: 0.15, slideTo: 784 }
  ],
  chime: [
    { freq: 440, t: 0, dur: 0.4, vol: 0.12, slideTo: 660 }
  ],
  success: [
    { freq: 523, t: 0, dur: 0.5, vol: 0.12 },
    { freq: 659, t: 0.1, dur: 0.4, vol: 0.12 },
    { freq: 784, t: 0.2, dur: 0.3, vol: 0.12 }
  ],
  warn: [
    { freq: 300, t: 0, dur: 0.25, type: "triangle", vol: 0.08, slideTo: 200 }
  ],
  // Game start / restart — rising arpeggio
  start: [
    { freq: 392, t: 0, dur: 0.14, vol: 0.13 },
    { freq: 523, t: 0.09, dur: 0.14, vol: 0.13 },
    { freq: 659, t: 0.18, dur: 0.35, vol: 0.13 }
  ],
  // Answer phase — gentle down-step
  phase: [
    { freq: 523, t: 0, dur: 0.12, vol: 0.11 },
    { freq: 440, t: 0.1, dur: 0.3, vol: 0.11 }
  ],
  // Performance phase — low swell with rising slide
  stage: [
    { freq: 220, t: 0, dur: 0.18, type: "triangle", vol: 0.1 },
    { freq: 440, t: 0.14, dur: 0.35, vol: 0.12, slideTo: 550 }
  ],
  // Voting opens — descending settle
  "vote-open": [
    { freq: 659, t: 0, dur: 0.12, vol: 0.11 },
    { freq: 523, t: 0.11, dur: 0.12, vol: 0.11 },
    { freq: 392, t: 0.22, dur: 0.35, vol: 0.11 }
  ],
  // Your turn to read — bright ascending sting
  turn: [
    { freq: 784, t: 0, dur: 0.1, type: "triangle", vol: 0.14 },
    { freq: 988, t: 0.08, dur: 0.1, type: "triangle", vol: 0.14 },
    { freq: 1319, t: 0.16, dur: 0.32, type: "triangle", vol: 0.14 }
  ],
  // You're up next — soft two-note heads-up
  upnext: [
    { freq: 587, t: 0, dur: 0.12, vol: 0.07 },
    { freq: 880, t: 0.1, dur: 0.25, vol: 0.07 }
  ],
  // Vote confirmed — tiny pop
  vote: [
    { freq: 880, t: 0, dur: 0.07, vol: 0.06 }
  ],
  // Fluke moment — sparkle arpeggio crowd reaction
  fluke: [
    { freq: 1047, t: 0, dur: 0.1, type: "triangle", vol: 0.1 },
    { freq: 1319, t: 0.07, dur: 0.1, type: "triangle", vol: 0.1 },
    { freq: 1568, t: 0.14, dur: 0.1, type: "triangle", vol: 0.1 },
    { freq: 2093, t: 0.21, dur: 0.4, type: "triangle", vol: 0.11 },
    { freq: 2637, t: 0.26, dur: 0.35, vol: 0.05 }
  ],
  // Round/tournament winner — fanfare
  winner: [
    { freq: 523, t: 0, dur: 0.14, vol: 0.13 },
    { freq: 659, t: 0.1, dur: 0.14, vol: 0.13 },
    { freq: 784, t: 0.2, dur: 0.14, vol: 0.13 },
    { freq: 1047, t: 0.3, dur: 0.45, vol: 0.14 }
  ]
}

export function playSound(type) {
  if (isSoundMuted()) return
  const def = SOUND_DEFS[type]
  if (!def) return
  const now = Date.now()
  if (lastPlayedAt[type] && now - lastPlayedAt[type] < SOUND_THROTTLE_MS) return
  lastPlayedAt[type] = now
  const ctx = ensureAudioContext()
  if (!ctx) return
  if (ctx.state === "suspended") ctx.resume()

  const base = ctx.currentTime + 0.01
  for (const note of def) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    const start = base + note.t
    osc.type = note.type || "sine"
    osc.frequency.setValueAtTime(note.freq, start)
    if (note.slideTo) {
      osc.frequency.exponentialRampToValueAtTime(note.slideTo, start + note.dur * 0.6)
    }
    gain.gain.setValueAtTime(note.vol, start)
    gain.gain.exponentialRampToValueAtTime(0.001, start + note.dur)
    osc.start(start)
    osc.stop(start + note.dur + 0.02)
  }
}

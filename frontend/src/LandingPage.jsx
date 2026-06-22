import { useState, useEffect, useRef } from "react"

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin

const DECK = [
  { prompt: "What if all the genealogy was found out to be wrong?", answer: "Then here there'd be dragons 🐉!" },
  { prompt: "What if everyday were like a dothraki wedding (you know, from game of thrones)?", answer: "It would be like Where's Waldo? (but Waldo is a fugitive from the law)" },
  { prompt: "What if you poured your heart out to people on the internet that were only voices in your ear?", answer: "I would be friends with them" },
  { prompt: "What if giraffes and dolphins weren't deviants?", answer: "Impossible. They're FEDs" },
  { prompt: "What if Bourbon was caffeinated?", answer: "I would eventually learn that these voices were just AI bots and develop a severe case of anti-social behavior disorder" },
  { prompt: "What if god was one of us?", answer: "It would be like a messed up sesame street but slightly less messed up (and less heartful)" },
]

export default function LandingPage({
  playerName,
  setPlayerName,
  roomCode,
  setRoomCode,
  createRoom,
  joinRoom,
  setGameState,
  soundMuted,
  setSoundMuted,
  writeSoundMuted,
  prefillWhatIf,
  setPrefillWhatIf,
  setPrefillWhatIfStorage,
  socket,
  error,
}) {
  const [idx, setIdx] = useState(0)
  const [bannerSrc, setBannerSrc] = useState("/hero-chaos.jpg")
  const [dbPairs, setDbPairs] = useState([])
  const fetchedRef = useRef(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    fetch(`${SOCKET_URL}/api/random-pairs?count=8`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setDbPairs(data.map(p => ({ prompt: p.question, answer: p.answer })))
        }
      })
      .catch(() => {})
  }, [])

  const combinedDeck = [...DECK, ...dbPairs]
  const current = combinedDeck[idx % combinedDeck.length]
  const fluke = () => setIdx(i => (i + 1) % combinedDeck.length)

  const exampleCards = [...combinedDeck].sort(() => Math.random() - 0.5).slice(0, 3)

  const scrollToPlay = () => {
    const container = scrollRef.current
    const section = document.getElementById("play")
    if (!container || !section) return
    const target = Math.max(section.offsetTop - 12, 0)
    const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
    container.scrollTo({ top: target, behavior: isIOS ? "auto" : "smooth" })
  }

  return (
    <div ref={scrollRef} className="fixed inset-0 bg-fluke overflow-y-auto overflow-x-hidden z-0" style={{ touchAction: 'pan-y', overscrollBehaviorX: 'none' }}>
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
        <button
          onClick={() => setGameState("support")}
          className="bg-black/30 border border-white/20 rounded-full px-3 h-10 flex items-center gap-1.5 text-sm font-bold text-white/90 hover:bg-white/10 hover:text-white transition-colors"
          aria-label="Support this project"
          title="Support this project"
        >
          <span className="text-base leading-none">💜</span>
          <span className="hidden sm:inline">Support</span>
        </button>
        <button
          onClick={() => {
            const next = !soundMuted
            writeSoundMuted(next)
            setSoundMuted(next)
          }}
          className="bg-black/30 border border-white/20 rounded-full w-10 h-10 flex items-center justify-center text-lg hover:bg-white/10 transition-colors"
          aria-label={soundMuted ? "Unmute sounds" : "Mute sounds"}
          title={soundMuted ? "Sounds muted — click to unmute" : "Sounds on — click to mute"}
        >
          {soundMuted ? "🔇" : "🔊"}
        </button>
      </div>

      <section className="relative flex flex-col items-center justify-center overflow-hidden px-4 py-10 text-center" style={{ height: 'calc(var(--vh, 1vh) * 100)' }}>
        <img
          src={bannerSrc}
          onError={() => setBannerSrc("/hero-chaos.jpg")}
          alt="A laughing crowd of friends celebrating under vivid purple stage light"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#1a0b2e]/75 via-[#2a0f45]/55 to-[#1a0b2e]/95" />

        <div className="relative z-10 mx-auto max-w-3xl">
          <h1 className="font-bubble glow-title text-[18vw] leading-[0.82] md:text-[140px] md:leading-[0.88]">
            <span style={{ color: "#c026d3" }}>F</span>
            <span style={{ color: "#f97316" }}>l</span>
            <span style={{ color: "#facc15" }}>u</span>
            <span style={{ color: "#f43f5e" }}>k</span>
            <span style={{ color: "#a855f7" }}>e</span>
            <span style={{ color: "#facc15" }}>!</span>
          </h1>

          <p className="mx-auto mt-3 max-w-xl text-base font-bold leading-relaxed text-white/85 md:text-lg">
            <span>What if </span>
            <span className="italic">...the possibilities were endless?</span>
          </p>

          <div className="mt-6 flex flex-nowrap items-center justify-center gap-2 md:gap-3 max-w-full">
            <button
              onClick={scrollToPlay}
              className="btn-primary flex-[1.4] rounded-full px-4 py-2.5 text-xs font-bold tracking-wide whitespace-nowrap md:px-6 md:py-3 md:text-sm"
            >
              ▶ PLAY
            </button>
            <button
              onClick={() => setGameState("best-of")}
              className="btn-secondary flex-1 rounded-full px-2 py-2.5 text-xs font-bold tracking-wide whitespace-nowrap md:px-4 md:py-3 md:text-sm"
            >
              View Best Of
            </button>
            <button
              onClick={() => setGameState("help")}
              className="btn-secondary flex-1 rounded-full px-2 py-2.5 text-xs font-bold tracking-wide whitespace-nowrap md:px-4 md:py-3 md:text-sm"
            >
              How to Play
            </button>
          </div>
          <p className="mt-4 text-center text-[11px] tracking-[0.3em] text-white/60">
            NO SIGNUP · NO DOWNLOAD · NO IDEA WHAT HAPPENS NEXT
          </p>
        </div>

        <button
          onClick={scrollToPlay}
          className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/50 hover:text-white/80 text-[10px] tracking-[0.3em] animate-pulse transition-colors"
          aria-label="Scroll to play"
        >
          SCROLL ↓
        </button>
      </section>

      <section className="relative overflow-hidden px-4 py-10 md:py-12">
        <div className="mx-auto grid max-w-5xl items-center gap-6 md:grid-cols-2">
          <div className="space-y-4 overflow-hidden">
            <PromptCard text={exampleCards?.[0]?.prompt || DECK[0].prompt} rotate={-4} />
            <AnswerCard text={exampleCards?.[0]?.answer || DECK[0].answer} rotate={3} />
            <PromptCard text={exampleCards?.[2]?.prompt || DECK[2].prompt} rotate={2} />
            <AnswerCard text={exampleCards?.[2]?.answer || DECK[2].answer} rotate={-3} />
          </div>
          <div className="space-y-4 overflow-hidden">
            <PromptCard text={exampleCards?.[1]?.prompt || DECK[1].prompt} rotate={3} />
            <div className="py-1 text-center text-[10px] tracking-[0.4em] text-white/40">
              ─── COLLIDES WITH ───
            </div>
            <AnswerCard text={exampleCards?.[1]?.answer || DECK[1].answer} rotate={-2} />
          </div>
        </div>
      </section>

      <section id="live" className="relative overflow-hidden px-4 py-12 md:py-16">
        <div className="mx-auto max-w-4xl text-center">
          <p className="mb-3 text-[10px] tracking-[0.4em] text-purple-300">— LIVE CHAOS</p>
          <h2 className="font-bubble text-4xl md:text-6xl">
            <span className="text-white">Press the button. </span>
            <span className="text-gradient-chaos">See what collides.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-white/60">
            No signup. No rules. One button between you and a perfectly stupid combination.
          </p>

          <div className="font-hand mt-8 text-5xl text-yellow-300" style={{ textShadow: "0 0 30px rgba(250,204,21,0.6)" }}>
            try it
            <div className="mt-1 text-2xl">↓</div>
          </div>

          <div className="mt-8 rounded-3xl border border-white/10 bg-black/30 p-6 backdrop-blur md:p-10">
            <div className="grid gap-4 md:grid-cols-2">
              <PromptCard text={current.prompt} />
              <AnswerCard text={current.answer} />
            </div>

            <p className="mt-6 text-xs tracking-[0.3em] text-white/40">ready</p>
            <button
              onClick={fluke}
              className="btn-primary font-bubble mt-3 inline-block w-full max-w-xl rounded-full px-8 py-5 text-2xl text-center"
            >
              ✦ Fluke It! ✦
            </button>

            <p className="mt-6 text-[10px] tracking-[0.4em] text-white/40">SHARE</p>
            <div className="mt-3 flex justify-center gap-3">
              {["f", "♪", "◎", "𝕏"].map((c) => (
                <span key={c} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm text-white/70">
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="play" className="relative overflow-hidden px-4 pt-2 pb-12 md:pt-4 md:pb-16">
        <div className="mx-auto max-w-6xl text-center">
          <h2 className="font-bubble text-4xl md:text-6xl">
            <span className="text-white">Ready when </span>
            <span className="text-gradient-chaos">you are.</span>
          </h2>

          <div className="mt-10 grid gap-5 md:grid-cols-2 md:max-w-4xl md:mx-auto">
            <PanelCard title="Start a game" description="Spin up a fresh room. Get a 4-digit code. Invite your group.">
              <div className="w-full space-y-3">
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Your name"
                  aria-label="Your name"
                  className="input-field py-3 text-base font-semibold placeholder:text-gray-500 text-white"
                  maxLength={20}
                />
                <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-gray-300">
                  <span>Pre-fill "What if..."</span>
                  <button
                    onClick={() => {
                      const next = !prefillWhatIf
                      setPrefillWhatIf(next)
                      setPrefillWhatIfStorage(next)
                    }}
                    aria-pressed={prefillWhatIf}
                    aria-label="Toggle pre-fill What if"
                    className={"relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 " + (prefillWhatIf ? "bg-indigo-600" : "bg-gray-600")}
                  >
                    <span className={"absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 " + (prefillWhatIf ? "translate-x-5" : "translate-x-0")} />
                  </button>
                </div>
                <button
                  onClick={createRoom}
                  disabled={!socket}
                  className="btn-primary w-full rounded-full px-5 py-3 text-sm font-bold inline-block"
                >
                  {socket ? "▶ START NOW" : "..."}
                </button>
              </div>
            </PanelCard>

            <PanelCard title="Join a game">
              <div className="w-full space-y-3">
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Your name"
                  aria-label="Your name"
                  className="input-field py-3 text-base font-semibold placeholder:text-gray-500 text-white"
                  maxLength={20}
                />
                <input
                  type="text"
                  inputMode="numeric"
                  enterKeyHint="done"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  onKeyDown={(e) => { if (e.key === "Enter" && roomCode.trim().length === 4) joinRoom() }}
                  placeholder="4-digit code"
                  aria-label="Room code"
                  className="input-field py-3 text-base font-semibold placeholder:text-gray-500 text-white"
                  maxLength={4}
                />
                <div className="flex items-center justify-center gap-2">
                  <span className="text-sm text-gray-300">Pre-fill "What if..."</span>
                  <button
                    onClick={() => {
                      const next = !prefillWhatIf
                      setPrefillWhatIf(next)
                      setPrefillWhatIfStorage(next)
                    }}
                    aria-pressed={prefillWhatIf}
                    aria-label="Toggle pre-fill What if"
                    className={"relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 " + (prefillWhatIf ? "bg-indigo-600" : "bg-gray-600")}
                  >
                    <span className={"absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 " + (prefillWhatIf ? "translate-x-5" : "translate-x-0")} />
                  </button>
                </div>
                <button
                  onClick={joinRoom}
                  disabled={!socket}
                  className="btn-primary w-full mt-2 inline-block rounded-full px-5 py-3 text-sm font-bold"
                >
                  {socket ? "JOIN THE ROOM →" : "..."}
                </button>
              </div>
            </PanelCard>
          </div>

          {error && (
            <div className="mt-6 mx-auto max-w-md p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm text-center">
              {error}
            </div>
          )}
        </div>
      </section>

      <footer className="border-t border-white/5 px-4 py-10 text-center text-sm text-white/50 overflow-hidden">
        <p className="font-bubble text-lg text-white">fluke</p>
        <p className="mt-1">— chaos that connects.</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button onClick={() => setGameState("help")} className="text-purple-300 hover:text-purple-200">
            How to play →
          </button>
          <button onClick={() => setGameState("best-of")} className="text-purple-300 hover:text-purple-200">
            Best Of →
          </button>
          <button onClick={() => setGameState("support")} className="text-purple-300 hover:text-purple-200">
            Support this project →
          </button>
          <span className="text-purple-300 hover:text-purple-200">
            Copyright Fluke Games
          </span>
        </div>
      </footer>
    </div>
  )
}

function PromptCard({ text, rotate = 0 }) {
  return (
    <div className="card-prompt rounded-2xl p-5 text-left" style={{ transform: `rotate(${rotate}deg)` }}>
      <p className="mb-2 text-[10px] font-semibold tracking-[0.3em] text-purple-300">● PROMPT</p>
      <p className="text-lg font-semibold text-white md:text-xl">{text}</p>
    </div>
  )
}

function AnswerCard({ text, rotate = 0 }) {
  return (
    <div className="card-answer rounded-2xl p-5 text-left" style={{ transform: `rotate(${rotate}deg)` }}>
      <p className="mb-2 text-[10px] font-semibold tracking-[0.3em] text-rose-500">● ANSWER</p>
      <p className="font-hand text-2xl leading-snug md:text-3xl">{text}</p>
    </div>
  )
}

function PanelCard({ title, description, children }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/30 p-8 text-center backdrop-blur">
      <h3 className="font-bubble text-2xl text-white">{title}</h3>
      {description && <p className="mx-auto mt-2 max-w-xs text-sm text-white/60">{description}</p>}
      <div className="mt-6 flex flex-col items-center">{children}</div>
    </div>
  )
}

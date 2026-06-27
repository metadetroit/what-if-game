import { useState, useEffect, useRef, useMemo } from "react"

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
  prefillWhatIf,
  setPrefillWhatIf,
  setPrefillWhatIfStorage,
  socket,
  error,
}) {
  const [idx, setIdx] = useState(0)
  const [bannerSrc, setBannerSrc] = useState("/hero-chaos-v3.png")
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

  const exampleCards = useMemo(() => [...combinedDeck].sort(() => Math.random() - 0.5).slice(0, 3), [combinedDeck.length])

  const scrollToPlay = () => {
    const container = scrollRef.current
    const section = document.getElementById("play")
    if (!container || !section) return
    const target = Math.max(section.offsetTop - 12, 0)
    const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
    container.scrollTo({ top: target, behavior: isIOS ? "auto" : "smooth" })
  }

  return (
    <div ref={scrollRef} className="absolute inset-0 bg-fluke overflow-y-auto overflow-x-hidden">
      <section className="relative flex flex-col items-center justify-center overflow-hidden px-4 py-10 text-center" style={{ height: '100svh', minHeight: '100svh' }}>
        <picture>
          <source media="(max-width: 768px)" srcSet="/hero-chaos-v3-mobile.png" />
          <img
            src={bannerSrc}
            onError={() => setBannerSrc("/hero-chaos-v2.png")}
            alt="A laughing crowd of friends celebrating with confetti, sparks, and emojis"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-b from-[#1a0b2e]/75 via-[#2a0f45]/55 to-[#1a0b2e]/95" />

        <div className="relative z-10 mx-auto max-w-3xl">
          <h1 className="font-bubble glow-title text-[28vw] leading-[0.82] md:text-[160px] md:leading-[0.88] drop-shadow-[4px_4px_0px_rgba(20,5,35,0.85)]">
            <span style={{ color: "#c026d3" }}>F</span>
            <span style={{ color: "#f97316" }}>l</span>
            <span style={{ color: "#facc15" }}>u</span>
            <span style={{ color: "#f43f5e" }}>k</span>
            <span style={{ color: "#a855f7" }}>e</span>
            <span style={{ color: "#facc15" }} className="ml-1 md:ml-2 animate-pop-wiggle">!</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg font-black leading-relaxed hero-readable-text md:text-xl">
            <span>What if </span>
            <span className="italic">...the possibilities were endless?</span>
          </p>

          <div className="mt-8 max-w-xl mx-auto w-full flex flex-col gap-4">
            <button
              onClick={scrollToPlay}
              className="btn-primary w-full rounded-full px-6 py-4 text-lg font-black tracking-wider whitespace-nowrap md:py-4 md:text-xl shadow-lg shadow-fuchsia-900/40 hover:shadow-fuchsia-900/60"
            >
              START GAME
            </button>
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <button
                onClick={() => setGameState("best-of")}
                className="hero-mini-pill px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap md:px-4 md:py-3 md:text-sm"
              >
                View Best Of
              </button>
              <button
                onClick={() => setGameState("help")}
                className="hero-mini-pill px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap md:px-4 md:py-3 md:text-sm"
              >
                How to Play
              </button>
              <button
                onClick={() => setGameState("support")}
                className="hero-mini-pill px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap md:px-4 md:py-3 md:text-sm"
              >
                💜 Support
              </button>
            </div>
          </div>
          <p className="mt-6 text-center text-base font-bold leading-relaxed hero-readable-text md:text-lg">
            No signup · No download · No idea what happens next
          </p>
        </div>

      </section>

      <section className="relative overflow-hidden px-4 py-10 md:py-12 -mt-16 sm:-mt-20 md:mt-0">
        <div className="mx-auto grid max-w-5xl items-center gap-6 md:grid-cols-2">
          <div className="space-y-4 overflow-hidden">
            <PromptCard text={exampleCards?.[0]?.prompt || DECK[0].prompt} rotate={-4} />
            <AnswerCard text={exampleCards?.[0]?.answer || DECK[0].answer} rotate={3} />
            <PromptCard text={exampleCards?.[2]?.prompt || DECK[2].prompt} rotate={2} />
            <AnswerCard text={exampleCards?.[2]?.answer || DECK[2].answer} rotate={-3} />
          </div>
          <div className="space-y-4 overflow-hidden">
            <PromptCard text={exampleCards?.[1]?.prompt || DECK[1].prompt} rotate={3} />
            <div className="py-1 text-center text-[10px] tracking-[0.4em] text-[#E6E1FF]/40">
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
            <span className="text-[#E6E1FF]">Press the button. </span>
            <span className="text-gradient-chaos">See what collides.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[#E6E1FF]/60">
            No signup. No rules. One button between you and a perfectly stupid combination.
          </p>

          <div className="font-hand mt-8 text-5xl text-yellow-300" style={{ textShadow: "0 0 30px rgba(250,204,21,0.6)" }}>
            try it
            <div className="mt-1 text-2xl">↓</div>
          </div>

          <div className="mt-8 rounded-3xl border border-white/10 bg-black/50 p-6 md:p-10">
            <div className="grid gap-4 md:grid-cols-2">
              <PromptCard text={current.prompt} />
              <AnswerCard text={current.answer} />
            </div>

            <p className="mt-6 text-xs tracking-[0.3em] text-[#E6E1FF]/40">ready</p>
            <button
              onClick={fluke}
              className="btn-primary font-bubble mt-3 inline-block w-full max-w-xl rounded-full px-8 py-5 text-2xl text-center"
            >
              ✦ Fluke It! ✦
            </button>

            <p className="mt-6 text-[10px] tracking-[0.4em] text-[#E6E1FF]/40">SHARE</p>
            <div className="mt-3 flex justify-center gap-3">
              {["f", "♪", "◎", "𝕏"].map((c) => (
                <span key={c} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm text-[#E6E1FF]/70">
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
            <span className="text-gradient-chaos">Let's get it started</span>
          </h2>

          <div className="mt-10 grid gap-5 md:grid-cols-2 md:max-w-4xl md:mx-auto items-stretch">
            <PanelCard title="Start a game (3–15 players)">
              <div className="w-full flex flex-col gap-3 flex-1">
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Your name"
                  aria-label="Your name"
                  className="input-field py-3 text-base font-semibold placeholder:text-gray-500 text-[#E6E1FF]"
                  maxLength={20}
                />
                {/* Spacer matching room-code field height so rows align on desktop */}
                <div className="hidden md:block" style={{ height: '54px' }} />
                <div className="flex items-center justify-start gap-3 text-sm text-gray-300">
                  <span className="mr-1">Pre-fill "What if..."</span>
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
                  className="btn-primary w-full rounded-full px-5 py-3 text-sm font-bold"
                >
                  {socket ? "START NOW" : "..."}
                </button>
              </div>
            </PanelCard>

            <PanelCard title="Join a game">
              <div className="w-full flex flex-col gap-3 flex-1">
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Your name"
                  aria-label="Your name"
                  className="input-field py-3 text-base font-semibold placeholder:text-gray-500 text-[#E6E1FF]"
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
                  className="input-field py-3 text-base font-semibold placeholder:text-gray-500 text-[#E6E1FF]"
                  maxLength={4}
                />
                <div className="flex items-center justify-start gap-3">
                  <span className="text-sm text-gray-300 mr-1">Pre-fill "What if..."</span>
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
                  className="btn-primary w-full rounded-full px-5 py-3 text-sm font-bold"
                >
                  {socket ? "JOIN NOW" : "..."}
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

      <footer className="border-t border-white/5 px-4 py-10 text-center text-sm text-[#E6E1FF]/50 overflow-hidden">
        <p className="font-bubble text-lg text-[#E6E1FF]">fluke</p>
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
      <p className="text-lg font-semibold text-[#E6E1FF] md:text-xl">{text}</p>
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

function PanelCard({ title, children }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/50 p-8 text-center h-full flex flex-col">
      <h3 className="font-bubble text-2xl text-[#E6E1FF]">{title}</h3>
      <div className="mt-6 flex flex-col items-center flex-1">{children}</div>
    </div>
  )
}

import { useState, useEffect, useRef } from "react"
import usePWAInstall from "./hooks/usePWAInstall"
import IOSInstallHelp from "./components/IOSInstallHelp"

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin
const SHARE_URL = "https://www.playfluke.com"
const SHARE_TEXT = "Let's play Fluke! Chaos that connects"

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
  const [idxA, setIdxA] = useState(0)
  const [idxB, setIdxB] = useState(1)
  const [bannerSrc, setBannerSrc] = useState("/hero-chaos-v3.png")
  const [dbPairs, setDbPairs] = useState([])
  const [showIOSHelp, setShowIOSHelp] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768)
  const fetchedRef = useRef(false)
  const scrollRef = useRef(null)
  const { showInstallLink, isIOS, promptInstall } = usePWAInstall()

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 768)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

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
  const currentA = combinedDeck[idxA % combinedDeck.length]
  const currentB = combinedDeck[idxB % combinedDeck.length]

  const fluke = () => {
    const len = combinedDeck.length
    if (len <= 1) return
    let nextA = Math.floor(Math.random() * len)
    while (nextA === idxA % len) nextA = Math.floor(Math.random() * len)
    setIdxA(nextA)
    if (isDesktop) {
      let nextB = Math.floor(Math.random() * len)
      while (nextB === nextA || nextB === idxB % len) nextB = Math.floor(Math.random() * len)
      setIdxB(nextB)
    }
  }

  const scrollToPlay = () => {
    const container = scrollRef.current
    const section = document.getElementById("play")
    if (!container || !section) return
    const target = Math.max(section.offsetTop - 12, 0)
    const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
    container.scrollTo({ top: target, behavior: isIOS ? "auto" : "smooth" })
  }

  useEffect(() => {
    if (roomCode && roomCode.length === 4) {
      const t = setTimeout(scrollToPlay, 100)
      return () => clearTimeout(t)
    }
  }, [roomCode])

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
          <p className="mt-4 text-center text-base font-bold leading-relaxed hero-readable-text md:mt-6 md:text-lg">
            No signup · No download · No idea what happens next
          </p>
        </div>

      </section>

      <section id="live" className="relative overflow-hidden px-4 pt-2 pb-4 md:py-6">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="font-bubble text-4xl md:text-6xl">
            <span className="text-[#E6E1FF]">Press the button. </span>
            <span className="text-gradient-chaos">See what collides.</span>
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#E6E1FF]/60 md:text-base">
            Pulled straight from games people actually played.
          </p>

          <div className="mt-4 rounded-3xl border border-white/10 bg-black/50 p-4 md:p-6">
            <div className="grid gap-2 md:grid-cols-2 md:gap-4">
              <CollisionPair prompt={currentA.prompt} answer={currentA.answer} rotateP={-3} rotateA={2} />
              <div className="hidden md:block">
                <CollisionPair prompt={currentB.prompt} answer={currentB.answer} rotateP={2} rotateA={-3} />
              </div>
            </div>

            <button
              onClick={fluke}
              className="btn-primary font-bubble mt-2 inline-block w-full max-w-xl rounded-full px-8 py-5 text-2xl text-center"
            >
              ✦ Fluke It! ✦
            </button>

            <p className="mt-3 text-[10px] tracking-[0.4em] text-[#E6E1FF]/40">SHARE</p>
            <div className="mt-2 flex justify-center gap-3">
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(SHARE_URL)}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Share on X (Twitter)"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm text-[#E6E1FF]/70 hover:bg-white/10 hover:text-[#E6E1FF] transition-colors"
              >
                𝕏
              </a>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SHARE_URL)}&quote=${encodeURIComponent(SHARE_TEXT)}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Share on Facebook"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm text-[#E6E1FF]/70 hover:bg-white/10 hover:text-[#E6E1FF] transition-colors"
              >
                f
              </a>
              <a
                href={`https://www.instagram.com/?url=${encodeURIComponent(SHARE_URL)}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Share on Instagram"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm text-[#E6E1FF]/70 hover:bg-white/10 hover:text-[#E6E1FF] transition-colors"
              >
                📷
              </a>
              <button
                onClick={() => {
                  const text = `${SHARE_TEXT} — ${SHARE_URL}`
                  navigator.clipboard?.writeText(text).then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  })
                }}
                aria-label="Copy share text"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm text-[#E6E1FF]/70 hover:bg-white/10 hover:text-[#E6E1FF] transition-colors"
              >
                {copied ? "✓" : "📋"}
              </button>
              {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
                <button
                  onClick={() => {
                    navigator.share({ title: "Fluke!", text: "Let's play Fluke! Chaos that connects", url: window.location.origin }).catch(() => {})
                  }}
                  aria-label="Share via device"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm text-[#E6E1FF]/70 hover:bg-white/10 hover:text-[#E6E1FF] transition-colors"
                >
                  📤
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="play" className="relative overflow-hidden px-4 pt-2 pb-6 md:pt-4 md:pb-16">
        <div className="mx-auto max-w-6xl text-center">
          <h2 className="font-bubble text-4xl md:text-6xl heading-pulse">
            <span className="text-gradient-chaos">Let's get it started</span>
          </h2>

          <div className="mt-4 grid gap-3 md:grid-cols-2 md:mt-10 md:gap-5 md:max-w-4xl md:mx-auto items-stretch">
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
              {roomCode && roomCode.length === 4 && (
                <div className="mb-3 text-sm text-purple-300 font-semibold">
                  Joining room {roomCode} — enter your name
                </div>
              )}
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

      <footer className="border-t border-white/5 px-4 py-6 text-center text-sm text-[#E6E1FF]/50 overflow-hidden md:py-10">
        <p className="font-bubble text-lg text-[#E6E1FF] inline-flex items-baseline gap-2">
          fluke!
          <span className="font-sans text-sm font-normal italic text-[#E6E1FF]/60">chaos that connects.</span>
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button onClick={() => setGameState("help")} className="text-purple-300 hover:text-purple-200">
            How to play →
          </button>
          <button onClick={() => setGameState("best-of")} className="text-purple-300 hover:text-purple-200">
            Best Of →
          </button>
          {showInstallLink && (
            <button
              onClick={() => (isIOS ? setShowIOSHelp(true) : promptInstall())}
              className="text-purple-300 hover:text-purple-200"
            >
              Play fullscreen (Install app) →
            </button>
          )}
          <button onClick={() => setGameState("support")} className="text-purple-300 hover:text-purple-200">
            Support this project →
          </button>
          <span className="text-purple-300 hover:text-purple-200">
            Copyright Fluke Games
          </span>
        </div>
      </footer>

      {showIOSHelp && <IOSInstallHelp onClose={() => setShowIOSHelp(false)} />}
    </div>
  )
}

function PromptCard({ text, rotate = 0 }) {
  return (
    <div className="card-prompt rounded-2xl p-3 text-left md:p-5" style={{ transform: `rotate(${rotate}deg)` }}>
      <p className="mb-1 text-[10px] font-semibold tracking-[0.3em] text-purple-300 md:mb-2">● PROMPT</p>
      <p className="text-base font-semibold text-[#E6E1FF] md:text-lg">{text}</p>
    </div>
  )
}

function CollisionPair({ prompt, answer, rotateP = 0, rotateA = 0 }) {
  return (
    <div className="space-y-0 overflow-hidden md:space-y-1">
      <PromptCard text={prompt} rotate={rotateP} />
      <AnswerCard text={answer} rotate={rotateA} />
    </div>
  )
}

function AnswerCard({ text, rotate = 0 }) {
  return (
    <div className="card-answer rounded-2xl p-3 text-left md:p-5" style={{ transform: `rotate(${rotate}deg)` }}>
      <p className="mb-1 text-[10px] font-semibold tracking-[0.3em] text-rose-500 md:mb-2">● ANSWER</p>
      <p className="font-hand text-xl leading-snug md:text-2xl">{text}</p>
    </div>
  )
}

function PanelCard({ title, children }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/50 p-6 text-center h-full flex flex-col md:p-8">
      <h3 className="font-bubble text-2xl text-[#E6E1FF]">{title}</h3>
      <div className="mt-4 flex flex-col items-center flex-1 md:mt-6">{children}</div>
    </div>
  )
}

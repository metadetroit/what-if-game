import { useState, useEffect, useRef } from "react"
import usePWAInstall from "./hooks/usePWAInstall"
import IOSInstallHelp from "./components/IOSInstallHelp"

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin
const SHARE_URL = "https://www.playfluke.com"
const SHARE_TEXT = "Let's play Fluke! Chaos that connects"

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
  const [pairsLoading, setPairsLoading] = useState(true)
  const [showIOSHelp, setShowIOSHelp] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768)
  const [revealedSections, setRevealedSections] = useState(new Set())
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
      .finally(() => setPairsLoading(false))
  }, [])

  const currentA = dbPairs[idxA % dbPairs.length] || null
  const currentB = dbPairs[idxB % dbPairs.length] || null

  const fluke = () => {
    const len = dbPairs.length
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

  const scrollToSection = (id) => {
    const container = scrollRef.current
    const section = document.getElementById(id)
    if (!container || !section) return
    const target = Math.max(section.offsetTop - 12, 0)
    const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
    container.scrollTo({ top: target, behavior: isIOS ? "auto" : "smooth" })
  }

  useEffect(() => {
    if (roomCode && roomCode.length === 4) {
      const t = setTimeout(() => scrollToSection("play"), 100)
      return () => clearTimeout(t)
    }
  }, [roomCode])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setRevealedSections((prev) => new Set(prev).add(entry.target.id))
          }
        })
      },
      { threshold: 0.1 }
    )
    ;["live", "play"].forEach((id) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={scrollRef} className="absolute inset-0 bg-fluke overflow-y-auto overflow-x-hidden">
      <section className="relative flex flex-col items-center justify-center overflow-hidden px-4 py-10 text-center min-h-[100svh]" style={{ height: '100svh' }}>
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
          <h1 className="font-bubble glow-title hero-logo-text md:text-[160px] md:leading-[0.88] drop-shadow-[4px_4px_0px_rgba(20,5,35,0.85)]">
            <span style={{ color: "#c026d3" }}>F</span>
            <span style={{ color: "#f97316" }}>l</span>
            <span style={{ color: "#facc15" }}>u</span>
            <span style={{ color: "#f43f5e" }}>k</span>
            <span style={{ color: "#a855f7" }}>e</span>
            <span style={{ color: "#facc15" }} className="ml-1 md:ml-2 animate-pop-wiggle">!</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl font-black leading-relaxed hero-readable-text hero-body-text md:text-xl">
            <span>What if </span>
            <span className="italic">...the possibilities were endless?</span>
          </p>

          <div className="mobile-fill-mt max-w-xl mx-auto w-full flex flex-col mobile-fill-gap">
            <button
              onClick={() => scrollToSection("play")}
              className="btn-primary w-full rounded-full px-6 mobile-fill-py text-lg font-black tracking-wider whitespace-nowrap transition-transform duration-150 active:scale-95 md:py-4 md:text-xl shadow-lg shadow-fuchsia-900/40 hover:shadow-fuchsia-900/60"
            >
              START GAME
            </button>
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <button
                onClick={() => setGameState("best-of")}
                className="hero-mini-pill px-3 py-3 text-sm font-semibold whitespace-nowrap md:px-4 md:py-3 md:text-sm"
              >
                View Best Of
              </button>
              <button
                onClick={() => setGameState("help")}
                className="hero-mini-pill px-3 py-3 text-sm font-semibold whitespace-nowrap md:px-4 md:py-3 md:text-sm"
              >
                How to Play
              </button>
              <button
                onClick={() => setGameState("support")}
                className="hero-mini-pill px-3 py-3 text-sm font-semibold whitespace-nowrap md:px-4 md:py-3 md:text-sm"
              >
                💜 Support
              </button>
            </div>
          </div>
          <p className="mobile-fill-mt text-center text-base font-bold leading-relaxed hero-readable-text md:mt-6 md:text-lg">
            No signup · No download · No idea what happens next
          </p>
        </div>

        <button
          onClick={() => scrollToSection("live")}
          aria-label="Scroll to game examples"
          className="scroll-cue absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-[#E6E1FF]/50 hover:text-[#E6E1FF] transition-colors"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

      </section>

      <section id="live" className={`reveal-section relative flex flex-col items-center justify-center min-h-[100svh] overflow-hidden px-4 py-4 ${revealedSections.has("live") ? "revealed" : ""}`}>
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-3 md:gap-2 text-center">
          <h2 className="font-bubble live-heading-text leading-none md:text-6xl md:leading-none">
            <span className="text-[#E6E1FF]">What if you could be </span>
            <span className="text-gradient-chaos gradient-underline">automatically</span>
            <span className="text-gradient-chaos"> hilarious</span>
            <span className="text-[#E6E1FF]">?</span>
          </h2>

          <div className="flex-1 flex flex-col justify-center w-full rounded-3xl border border-white/10 bg-black/50 p-4 mobile-fill-card md:p-5">
            {dbPairs.length > 0 ? (
              <>
                <div className="grid gap-2 md:grid-cols-2 md:gap-4">
                  {pairsLoading ? (
                    <SkeletonPair />
                  ) : (
                    <CollisionPair key={`a-${idxA}`} prompt={currentA.prompt} answer={currentA.answer} rotateP={-1.5} rotateA={1} />
                  )}
                  <div className="hidden md:block">
                    {pairsLoading ? (
                      <SkeletonPair />
                    ) : (
                      <CollisionPair key={`b-${idxB}`} prompt={currentB.prompt} answer={currentB.answer} rotateP={1} rotateA={-1.5} />
                    )}
                  </div>
                </div>

                <button
                  onClick={fluke}
                  className="btn-primary font-bubble mobile-fill-mt inline-block w-full max-w-xl self-center rounded-full px-8 mobile-fill-py text-2xl text-center transition-transform duration-150 active:scale-95"
                >
                  ✦ See more Flukes! ✦
                </button>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-400 text-lg">No examples yet. Play some games to see the best content here!</p>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => scrollToSection("play")}
          aria-label="Scroll to start game"
          className="scroll-cue absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-[#E6E1FF]/50 hover:text-[#E6E1FF] transition-colors"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </section>

      <section id="play" className={`reveal-section relative flex flex-col items-center justify-center min-h-[100svh] overflow-hidden px-4 py-4 md:py-6 ${revealedSections.has("play") ? "revealed" : ""}`}>
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center text-center overflow-hidden" style={{ maxHeight: '100%' }}>
          <h2 className="font-bubble play-heading-text heading-pulse md:text-6xl">
            <span className="text-gradient-chaos">What if we started?</span>
          </h2>

          <div className="mt-3 grid w-full gap-3 overflow-y-auto md:mt-6 md:max-w-4xl md:grid-cols-2 md:items-stretch md:overflow-visible" style={{ maxHeight: '100%' }}>
            <PanelCard title="Start a game (3–15 players)">
              <div className="w-full flex flex-col gap-3 flex-1">
                <input
                  type="text"
                  autoComplete="off"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Your name"
                  aria-label="Your name"
                  className="input-field py-4 text-lg font-semibold placeholder:text-gray-500 text-[#E6E1FF] md:py-3 md:text-base"
                  maxLength={20}
                />
                {/* Invisible spacer matching room-code input height so rows align on desktop */}
                <input className="input-field py-3 text-base font-semibold invisible hidden md:block" tabIndex={-1} aria-hidden="true" readOnly />
                <div className="flex items-center justify-start gap-3 text-base text-gray-300 md:text-sm">
                  <span className="mr-1">Pre-fill "What if..."</span>
                  <button
                    onClick={() => {
                      const next = !prefillWhatIf
                      setPrefillWhatIf(next)
                      setPrefillWhatIfStorage(next)
                    }}
                    aria-pressed={prefillWhatIf}
                    aria-label="Toggle pre-fill What if"
                    className={"relative w-12 h-6 rounded-full transition-colors duration-200 shrink-0 md:w-11 " + (prefillWhatIf ? "bg-indigo-600" : "bg-gray-600")}
                  >
                    <span className={"absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 " + (prefillWhatIf ? "translate-x-6" : "translate-x-0")} />
                  </button>
                </div>
                <button
                  onClick={createRoom}
                  disabled={!socket}
                  className="btn-primary w-full rounded-full px-5 py-4 text-base font-bold transition-transform duration-150 active:scale-95 md:py-3 md:text-sm"
                >
                  {socket ? "START NOW" : "..."}
                </button>
              </div>
            </PanelCard>

            <PanelCard title="Join a game">
              <div className="w-full flex flex-col gap-3 flex-1">
                <input
                  type="text"
                  autoComplete="off"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Your name"
                  aria-label="Your name"
                  className="input-field py-4 text-lg font-semibold placeholder:text-gray-500 text-[#E6E1FF] md:py-3 md:text-base"
                  maxLength={20}
                />
                <input
                  type="text"
                  inputMode="numeric"
                  enterKeyHint="done"
                  autoComplete="off"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  onKeyDown={(e) => { if (e.key === "Enter" && roomCode.trim().length === 4) joinRoom() }}
                  placeholder="4-digit code"
                  aria-label="Room code"
                  className="input-field py-4 text-lg font-semibold placeholder:text-gray-500 text-[#E6E1FF] md:py-3 md:text-base"
                  maxLength={4}
                />
                <div className="flex items-center justify-start gap-3">
                  <span className="text-base text-gray-300 mr-1 md:text-sm">Pre-fill "What if..."</span>
                  <button
                    onClick={() => {
                      const next = !prefillWhatIf
                      setPrefillWhatIf(next)
                      setPrefillWhatIfStorage(next)
                    }}
                    aria-pressed={prefillWhatIf}
                    aria-label="Toggle pre-fill What if"
                    className={"relative w-12 h-6 rounded-full transition-colors duration-200 shrink-0 md:w-11 " + (prefillWhatIf ? "bg-indigo-600" : "bg-gray-600")}
                  >
                    <span className={"absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 " + (prefillWhatIf ? "translate-x-6" : "translate-x-0")} />
                  </button>
                </div>
                <button
                  onClick={joinRoom}
                  disabled={!socket}
                  className="btn-primary w-full rounded-full px-5 py-4 text-base font-bold transition-transform duration-150 active:scale-95 md:py-3 md:text-sm"
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
        {typeof navigator !== "undefined" && (
          <div className="flex justify-center gap-3 mb-4">
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(SHARE_URL)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Share on X (Twitter)"
              title="Share on X / Twitter"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[#E6E1FF]/70 hover:bg-white/10 hover:text-[#E6E1FF] transition-colors"
            >
              <IconX />
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SHARE_URL)}&quote=${encodeURIComponent(SHARE_TEXT)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Share on Facebook"
              title="Share on Facebook"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[#E6E1FF]/70 hover:bg-white/10 hover:text-[#E6E1FF] transition-colors"
            >
              <IconFacebook />
            </a>
            {typeof navigator.share !== "function" && (
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(SHARE_URL).then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  })
                }}
                aria-label="Copy URL"
                title="Copy URL"
                className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[#E6E1FF]/70 hover:bg-white/10 hover:text-[#E6E1FF] transition-colors"
              >
                {copied ? <IconCheck /> : <IconCopy />}
              </button>
            )}
            {typeof navigator.share === "function" && (
              <button
                onClick={() => {
                  navigator.share({ title: "Fluke!", text: SHARE_TEXT, url: SHARE_URL }).catch(() => {})
                }}
                aria-label="Share via device"
                title="Share via your device"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[#E6E1FF]/70 hover:bg-white/10 hover:text-[#E6E1FF] transition-colors"
              >
                <IconShare />
              </button>
            )}
          </div>
        )}
        <p className="font-bubble text-lg inline-flex items-baseline gap-2">
          <span className="inline-flex items-baseline">
            <span style={{ color: "#c026d3" }}>F</span>
            <span style={{ color: "#f97316" }}>l</span>
            <span style={{ color: "#facc15" }}>u</span>
            <span style={{ color: "#f43f5e" }}>k</span>
            <span style={{ color: "#a855f7" }}>e</span>
            <span style={{ color: "#facc15" }} className="animate-pop-wiggle">!</span>
          </span>
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
    <div
      className="card-prompt card-shuffle-in rounded-2xl p-3 text-left transition-transform duration-200 hover:rotate-0 hover:-translate-y-1 md:p-4"
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <p className="text-lg font-semibold text-[#E6E1FF] overflow-hidden line-clamp-3 md:text-lg md:line-clamp-4">{text}</p>
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
    <div
      className="card-answer card-shuffle-in rounded-2xl p-3 text-left transition-transform duration-200 hover:rotate-0 hover:-translate-y-1 md:p-4"
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <p className="font-hand text-2xl leading-snug overflow-hidden line-clamp-3 md:text-2xl md:line-clamp-4">{text}</p>
    </div>
  )
}

function PanelCard({ title, children }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/50 p-6 text-center h-full flex flex-col md:p-8">
      <h3 className="font-bubble mobile-fill-card-title text-[#E6E1FF]">{title}</h3>
      <div className="mt-4 flex flex-col items-center flex-1 md:mt-6">{children}</div>
    </div>
  )
}

function SkeletonPair() {
  return (
    <div className="space-y-0 overflow-hidden md:space-y-1">
      <div className="skeleton-shimmer rounded-2xl p-3 md:p-5" style={{ minHeight: 80 }} />
      <div className="skeleton-shimmer rounded-2xl p-3 md:p-5" style={{ minHeight: 80 }} />
    </div>
  )
}

function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function IconFacebook() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

function IconInstagram() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

function IconCopy() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function IconShare() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}

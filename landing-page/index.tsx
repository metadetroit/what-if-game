import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import heroChaos from "@/assets/hero-chaos.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fluke — Chaos That Connects" },
      {
        name: "description",
        content:
          "A party game of 'what if' prompts and beautifully mismatched answers. No signup. No rules.",
      },
      { property: "og:title", content: "Fluke — Chaos That Connects" },
      {
        property: "og:description",
        content: "What if questions. Mismatched answers. Press the button. See what collides.",
      },
    ],
  }),
  component: Index,
});

type Card = { prompt: string; answer: string };

const DECK: Card[] = [
  { prompt: "What if all the genealogy was found out to be wrong?", answer: "Then here there'd be dragons 🐉!" },
  { prompt: "What if everyday were like a dothraki wedding (you know, from game of thrones)?", answer: "It would be like Where's Waldo? (but Waldo is a fugitive from the law)" },
  { prompt: "What if you poured your heart out to people on the internet that were only voices in your ear?", answer: "I would be friends with them" },
  { prompt: "What if giraffes and dolphins weren't deviants?", answer: "Impossible. They're FEDs" },
  { prompt: "What if Bourbon was caffeinated?", answer: "I would eventually learn that these voices were just AI bots and develop a severe case of anti-social behavior disorder" },
  { prompt: "What if god was one of us?", answer: "It would be like a messed up sesame street but slightly less messed up (and less heartful)" },
];

function Index() {
  const [idx, setIdx] = useState(0);
  const current = DECK[idx];
  const fluke = () => setIdx((i) => (i + 1) % DECK.length);

  return (
    <div className="bg-fluke min-h-screen overflow-hidden">
      <section className="relative px-4 pt-10 pb-16 md:pt-16">
        <div className="mx-auto max-w-6xl">
          <div className="relative mx-auto overflow-hidden rounded-3xl">
            <img
              src={heroChaos}
              alt="A laughing crowd of friends drenched in purple stage light"
              width={1920}
              height={1080}
              className="h-[40vh] w-full object-cover md:h-[55vh]"
            />
            <div className="absolute inset-x-0 top-6 flex justify-center">
              <span className="tag-pill rounded-full px-5 py-2 text-sm md:text-base font-bold tracking-[0.2em] text-white/95">
                Tonight, the room gets weird, witty, wild, whimsical...
              </span>
            </div>
            <FloatingEmojis />
          </div>

          <h1 className="font-bubble glow-title relative -mt-10 text-center text-[22vw] leading-[0.85] md:-mt-16 md:text-[180px]">
            <span style={{ color: "#c026d3" }}>F</span>
            <span style={{ color: "#f97316" }}>l</span>
            <span style={{ color: "#facc15" }}>u</span>
            <span style={{ color: "#f43f5e" }}>k</span>
            <span style={{ color: "#a855f7" }}>e</span>
            <span style={{ color: "#facc15" }}>!</span>
          </h1>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <a href="https://playfluke.com" className="btn-chaos rounded-full px-7 py-3 text-sm font-bold tracking-wide inline-block">
              ▶ PLAY RIGHT NOW
            </a>
          </div>
          <p className="mt-4 text-center text-[11px] tracking-[0.3em] text-white/50">
            NO SIGNUP · NO DOWNLOAD · NO IDEA WHAT HAPPENS NEXT
          </p>
        </div>
      </section>

      <section className="relative px-4 py-20">
        <div className="mx-auto grid max-w-5xl items-center gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <PromptCard text="What if all the genealogy was found out to be wrong?" rotate={-4} />
            <AnswerCard text="Then here there'd be dragons 🐉!" rotate={3} />
            <PromptCard text="What if you poured your heart out to people on the internet that were only voices in your ear?" rotate={2} />
            <AnswerCard text="I would be friends with them" rotate={-3} />
          </div>
          <div className="space-y-4">
            <PromptCard text="What if everyday were like a dothraki wedding (you know, from game of thrones)?" rotate={3} />
            <div className="py-1 text-center text-[10px] tracking-[0.4em] text-white/40">
              ─── COLLIDES WITH ───
            </div>
            <AnswerCard text="It would be like Where's Waldo? (but Waldo is a fugitive from the law)" rotate={-2} />
          </div>
        </div>
      </section>

      <section id="live" className="relative px-4 py-24">
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
            <a href="https://playfluke.com" className="btn-chaos font-bubble mt-3 inline-block w-full max-w-xl rounded-full px-8 py-5 text-2xl text-center">
              ✦ Fluke It! ✦
            </a>

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

      <section className="relative px-4 py-24">
        <div className="mx-auto max-w-6xl text-center">
          <p className="mb-3 text-[10px] tracking-[0.4em] text-purple-300">— PICK YOUR CHAOS</p>
          <h2 className="font-bubble text-4xl md:text-6xl">
            <span className="text-white">Ready when </span>
            <span className="text-gradient-chaos">you are.</span>
          </h2>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            <PanelCard title="Start a game" description="Spin up a fresh room. Get a 4-digit code. Invite your group.">
              <a href="https://playfluke.com" className="btn-chaos rounded-full px-5 py-2.5 text-sm font-bold inline-block">▶ START NOW</a>
            </PanelCard>

            <PanelCard title="Join a game" description="Got a code? Punch it in — no hunting required.">
              <div className="mt-2 flex justify-center gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-12 w-10 rounded-lg border border-white/10 bg-black/40" />
                ))}
              </div>
              <a href="https://playfluke.com" className="btn-chaos mt-4 inline-block rounded-full px-5 py-2.5 text-sm font-bold">JOIN THE ROOM →</a>
              <p className="mt-2 text-[10px] tracking-[0.3em] text-white/40">ENTER THE 4-DIGIT CODE</p>
            </PanelCard>

            <PanelCard title="How to play" description="Rules, host controls, and the whole chaotic flow.">
              <a href="#" className="text-sm font-semibold text-purple-300 hover:text-purple-200">
                Read the rules →
              </a>
            </PanelCard>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 px-4 py-10 text-center text-sm text-white/50">
        <p className="font-bubble text-lg text-white">fluke</p>
        <p className="mt-1">— chaos that connects.</p>
        <a href="#" className="mt-3 inline-block text-purple-300">How to play →</a>
      </footer>
    </div>
  );
}

function PromptCard({ text, rotate = 0 }: { text: string; rotate?: number }) {
  return (
    <div className="card-prompt rounded-2xl p-5 text-left" style={{ transform: `rotate(${rotate}deg)` }}>
      <p className="mb-2 text-[10px] font-semibold tracking-[0.3em] text-purple-300">● PROMPT</p>
      <p className="text-lg font-semibold text-white md:text-xl">{text}</p>
    </div>
  );
}

function AnswerCard({ text, rotate = 0 }: { text: string; rotate?: number }) {
  return (
    <div className="card-answer rounded-2xl p-5 text-left" style={{ transform: `rotate(${rotate}deg)` }}>
      <p className="mb-2 text-[10px] font-semibold tracking-[0.3em] text-rose-500">● ANSWER</p>
      <p className="font-hand text-2xl leading-snug md:text-3xl">{text}</p>
    </div>
  );
}

function PanelCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/30 p-8 text-center backdrop-blur">
      <h3 className="font-bubble text-2xl text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-xs text-sm text-white/60">{description}</p>
      <div className="mt-6 flex flex-col items-center">{children}</div>
    </div>
  );
}

function FloatingEmojis() {
  const emojis = useMemo(
    () => [
      { e: "😂", top: "32%", left: "8%" },
      { e: "❤️", top: "40%", right: "10%" },
      { e: "❓", bottom: "18%", left: "6%" },
      { e: "✨", bottom: "12%", right: "8%" },
    ],
    [],
  );
  return (
    <>
      {emojis.map((p, i) => (
        <span
          key={i}
          className="pointer-events-none absolute text-3xl md:text-4xl"
          style={{
            top: p.top,
            left: p.left,
            right: p.right,
            bottom: p.bottom,
            filter: "drop-shadow(0 0 12px rgba(250,204,21,0.6))",
          }}
        >
          {p.e}
        </span>
      ))}
    </>
  );
}

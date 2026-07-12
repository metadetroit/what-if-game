import React from "react"

const HELP_TABS = [
  { id: "how-to-play", label: "How Fluke Works" },
  { id: "faq", label: "FAQ" },
  { id: "tips", label: "Tips" },
  { id: "about", label: "About" }
]

function HelpPage({ helpTab, onTabChange, onBack, onOpenSupport }) {
  return (
    <div className="game-container game-container--help py-2">
      <div className="flex items-center justify-between mb-2 md:mb-3">
        <h2 className="font-bubble text-xl md:text-3xl font-bold text-gradient-chaos">Help & Info</h2>
        <button onClick={onBack} className="flex items-center gap-1 text-white/60 hover:text-white text-sm md:text-base font-medium transition-colors min-h-[44px]">
          ← Back
        </button>
      </div>

      <div className="card flex-1 min-h-0 overflow-y-auto py-2.5 md:py-3 px-4 md:px-6">
        <div className="flex gap-1.5 md:gap-2 mb-3 md:mb-4 overflow-x-auto">
          {HELP_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`px-2.5 py-1.5 md:px-3 md:py-2 text-xs md:text-sm font-bold rounded-full border whitespace-nowrap min-h-[40px] md:min-h-[44px] ${helpTab === tab.id ? "border-fuchsia-500/50 bg-fuchsia-500/15 text-white" : "border-white/10 text-[#E6E1FF]/50"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="font-sans text-base md:text-lg text-[#E6E1FF]/85 space-y-4 md:space-y-5">
          {helpTab === "how-to-play" && (
            <div className="space-y-3 md:space-y-4">
              <div>
                <div className="text-center mb-2 md:mb-3">
                  <div className="w-9 h-9 md:w-10 md:h-10 mx-auto mb-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center">
                    <span className="text-lg md:text-xl">🎲</span>
                  </div>
                  <h3 className="font-bubble text-lg md:text-xl font-bold text-gradient-chaos">How Fluke Works</h3>
                </div>
                <ol className="list-decimal list-inside space-y-3 md:space-y-4 text-base md:text-lg text-[#E6E1FF]/85 leading-relaxed">
                  <li>Everyone writes a “What if…” question.</li>
                  <li>Prompts are shuffled.</li>
                  <li>Each player answers someone else’s prompt.</li>
                  <li>The game pairs questions with answers.</li>
                  <li>Players read the mashups aloud.</li>
                  <li>Everyone reacts, then votes on favorites.</li>
                </ol>
              </div>

              <div className="border-t border-white/10 pt-3 md:pt-4">
                <h4 className="text-base md:text-lg font-semibold text-[#E6E1FF] mb-2 md:mb-3">Player Tips</h4>
                <ul className="space-y-3 md:space-y-4 text-base md:text-lg text-[#E6E1FF]/85 leading-relaxed">
                  <li>• Keep prompts short and specific.</li>
                  <li>• One strong idea beats three weak ones.</li>
                  <li>• Read loudly and commit to the bit.</li>
                  <li>• React with ❤️ 😂 ❓.</li>
                  <li>• Vote for the pairing you want to remember.</li>
                </ul>
              </div>

              <div className="border-t border-white/10 pt-3 md:pt-4">
                <h4 className="text-base md:text-lg font-semibold text-[#E6E1FF] mb-2 md:mb-3">Host Controls</h4>
                <p className="text-base md:text-lg text-[#E6E1FF]/50 mb-2">(Only the host sees these)</p>
                <ul className="space-y-3 md:space-y-4 text-base md:text-lg text-[#E6E1FF]/85 leading-relaxed">
                  <li>• <strong>Anonymous Results</strong> - Hide names in the summary.</li>
                  <li>• <strong>No Self-Reading</strong> - Reduce self-assigned content.</li>
                  <li>• <strong>Force Advance</strong> - Move on when the room is ready.</li>
                  <li>• <strong>Kick Player</strong> - Remove someone from the lobby.</li>
                </ul>
              </div>
            </div>
          )}

          {helpTab === "faq" && (
            <div className="space-y-3 md:space-y-4">
              <div className="text-center mb-3 md:mb-4">
                <div className="w-9 h-9 md:w-10 md:h-10 mx-auto mb-2 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-2xl flex items-center justify-center">
                  <span className="text-lg md:text-xl">❓</span>
                </div>
                <h3 className="font-bubble text-lg md:text-xl font-bold text-gradient-chaos">Frequently Asked Questions</h3>
              </div>

              {[
                {
                  question: "How many players do I need?",
                  answer: "At least 3 players, up to 15. More players means more chaos."
                },
                {
                  question: "How long does a game take?",
                  answer: "Usually 10–25 minutes, depending on the room size and energy."
                },
                {
                  question: "Can I play with friends who aren't in the same room?",
                  answer: "Yes. Share the 4-digit room code and everyone can join from any device."
                },
                {
                  question: "What if someone disconnects?",
                  answer: "They get a short reconnect window and can rejoin if they return in time."
                },
                {
                  question: "Can we play again with the same group?",
                  answer: "Yes. The host can replay with the same group or start fresh."
                },
                {
                  question: "What do the host toggles do?",
                  answer: "Anonymous Results hides names. No Self-Reading keeps your own content out."
                },
                {
                  question: "How do reactions work?",
                  answer: "During readings, players can react with ❤️, 😂, or ❓. Hearts and laughs count toward 'Most-adored writer'."
                },
                {
                  question: "Can I play on my phone?",
                  answer: "Yes. Fluke works on mobile and desktop browsers."
                },
                {
                  question: "What if someone is taking too long?",
                  answer: "The host can force advance once enough players submit. Slow players may be removed."
                },
                {
                  question: "Can I kick a player?",
                  answer: "Only the host can kick players, and only in the lobby."
                },
                {
                  question: "What do the summary awards mean?",
                  answer: "Top pairing is the most-voted combo. Most-adored writer comes from ❤️ + 😂."
                }
              ].map(item => (
                <div className="support-card p-3 md:p-4" key={item.question}>
                  <h4 className="text-base md:text-lg font-semibold text-[#E6E1FF] mb-2">{item.question}</h4>
                  <p className="text-base md:text-lg text-[#E6E1FF]/85 leading-relaxed">{item.answer}</p>
                </div>
              ))}
            </div>
          )}

          {helpTab === "tips" && (
            <div className="space-y-3 md:space-y-4">
              <div className="text-center mb-3 md:mb-4">
                <div className="w-9 h-9 md:w-10 md:h-10 mx-auto mb-2 bg-gradient-to-br from-green-500 to-teal-600 rounded-2xl flex items-center justify-center">
                  <span className="text-lg md:text-xl">💡</span>
                </div>
                <h3 className="font-bubble text-lg md:text-xl font-bold text-gradient-chaos">Tips & Tricks</h3>
              </div>

              <div className="border-t border-white/10 pt-3 md:pt-4">
                <h4 className="text-base md:text-lg font-semibold text-[#E6E1FF] mb-2 md:mb-3">Writing Good Questions 🖊️</h4>
                <ul className="space-y-3 md:space-y-4 text-base md:text-lg text-[#E6E1FF]/85 leading-relaxed">
                  <li>• Start with a clear "What if".</li>
                  <li>• Leave room for a funny answer.</li>
                  <li>• One strong idea usually beats many small ones.</li>
                  <li>• Skip inside jokes unless everyone will get them.</li>
                </ul>
              </div>

              <div className="border-t border-white/10 pt-3 md:pt-4">
                <h4 className="text-base md:text-lg font-semibold text-[#E6E1FF] mb-2 md:mb-3">Writing Good Answers 💡</h4>
                <ul className="space-y-3 md:space-y-4 text-base md:text-lg text-[#E6E1FF]/85 leading-relaxed">
                  <li>• Make it easy to read aloud.</li>
                  <li>• Be specific; details beat vague punchlines.</li>
                  <li>• Give the reader something fun to say.</li>
                  <li>• Short answers usually land better.</li>
                </ul>
              </div>

              <div className="border-t border-white/10 pt-3 md:pt-4">
                <h4 className="text-base md:text-lg font-semibold text-[#E6E1FF] mb-2 md:mb-3">Performing 🎭</h4>
                <ul className="space-y-3 md:space-y-4 text-base md:text-lg text-[#E6E1FF]/85 leading-relaxed">
                  <li>• Read both parts clearly.</li>
                  <li>• Commit to the bit.</li>
                  <li>• Pause before the punchline.</li>
                  <li>• React while others are reading.</li>
                </ul>
              </div>

              <div className="border-t border-white/10 pt-3 md:pt-4">
                <h4 className="text-base md:text-lg font-semibold text-[#E6E1FF] mb-2 md:mb-3">Hosting 🎮</h4>
                <ul className="space-y-3 md:space-y-4 text-base md:text-lg text-[#E6E1FF]/85 leading-relaxed">
                  <li>• Set expectations early.</li>
                  <li>• Use anonymity intentionally.</li>
                  <li>• Force advance only when needed.</li>
                  <li>• Replay quickly to keep the room together.</li>
                </ul>
              </div>

              <div className="border-t border-white/10 pt-3 md:pt-4">
                <h4 className="text-base md:text-lg font-semibold text-[#E6E1FF] mb-2 md:mb-3">Winning the Room 🌟</h4>
                <ul className="space-y-3 md:space-y-4 text-base md:text-lg text-[#E6E1FF]/85 leading-relaxed">
                  <li>• Vote for the pairing you want remembered.</li>
                  <li>• Send ❤️ and 😂 to reward good writing.</li>
                  <li>• Use ❓ for delicious chaos.</li>
                  <li>• Keep it kind, quick, and playful.</li>
                </ul>
              </div>
            </div>
          )}

          {helpTab === "about" && (
            <div className="space-y-3 md:space-y-4">
              <div className="text-center mb-3 md:mb-4">
                <div className="w-9 h-9 md:w-10 md:h-10 mx-auto mb-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center">
                  <span className="text-lg md:text-xl">📖</span>
                </div>
                <h3 className="font-bubble text-lg md:text-xl font-bold text-gradient-chaos">About Fluke</h3>
              </div>

              <div className="border-t border-white/10 pt-4 md:pt-5 space-y-3 md:space-y-4">
                <p className="text-base md:text-lg text-[#E6E1FF]/85 leading-relaxed">
                  Fluke is a browser-based party game built around “What if…?” prompts.
                </p>
                <p className="text-base md:text-lg text-[#E6E1FF]/85 leading-relaxed">
                  You write a question, answer someone else’s, and read the mashups aloud together.
                </p>
                <p className="text-base md:text-lg text-[#E6E1FF]/85 leading-relaxed">
                  It works best when people move quickly, commit to the bit, and lean into the chaos.
                </p>
              </div>

              <div className="border-t border-white/10 pt-4 md:pt-5 space-y-3 md:space-y-4">
                <button
                  onClick={onOpenSupport}
                  className="btn-primary w-full py-3 md:py-3.5 text-base md:text-lg"
                >
                  Support this project →
                </button>
              </div>

              <div className="text-center pt-1 md:pt-2">
                <span className="text-4xl">🎉</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <button onClick={onBack} className="btn-secondary py-3 text-sm font-bubble w-full mt-3">
        Back to Main Screen
      </button>
    </div>
  )
}

export default HelpPage

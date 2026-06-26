import React from "react"

const HELP_TABS = [
  { id: "how-to-play", label: "How Fluke Works" },
  { id: "faq", label: "FAQ" },
  { id: "tips", label: "Tips" },
  { id: "about", label: "About" }
]

function HelpPage({ helpTab, onTabChange, onBack }) {
  return (
    <div className="game-container game-container--help py-2">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bubble text-2xl font-bold text-gradient-chaos">Help & Info</h2>
        <button onClick={onBack} className="flex items-center gap-1 text-white/60 hover:text-white text-sm font-medium transition-colors">
          ← Back
        </button>
      </div>

      <div className="card flex-1 min-h-0 overflow-y-auto py-3 px-4">
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {HELP_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`px-3 py-1 text-xs font-bold rounded-full border ${helpTab === tab.id ? "border-indigo-500 bg-indigo-500/20 text-white" : "border-gray-700 text-gray-400"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="text-sm text-gray-300 space-y-4">
          {helpTab === "how-to-play" && (
            <div className="space-y-4">
              <div>
                <div className="text-center mb-3">
                  <div className="w-10 h-10 mx-auto mb-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                    <span className="text-xl">🎲</span>
                  </div>
                  <h3 className="font-bubble text-lg font-bold text-white">How Fluke Works</h3>
                </div>
                <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
                  <li>Everyone writes a “What if…” question.</li>
                  <li>Questions are shuffled. Each player answers someone else’s question.</li>
                  <li>The game pairs the questions + answers.</li>
                  <li>Players read the pairings aloud while everyone reacts.</li>
                  <li>The room votes for their favorite pairings in the summary.</li>
                </ol>
              </div>

              <div className="border-t border-gray-700 pt-4">
                <h4 className="text-sm font-bold text-indigo-400 mb-2">Player Tips</h4>
                <ul className="space-y-1 text-sm text-gray-300">
                  <li>• Keep questions and answers short. Punchy plays better.</li>
                  <li>• Commit to the bit when reading aloud.</li>
                  <li>• React with ❤️ 😂 ❓ to show love (or confusion).</li>
                  <li>• Vote at the end — it shapes the Best Of page.</li>
                </ul>
              </div>

              <div className="border-t border-gray-700 pt-4">
                <h4 className="text-sm font-bold text-indigo-400 mb-2">Host Controls</h4>
                <p className="text-xs text-gray-500 mb-2">(Only the host sees these)</p>
                <ul className="space-y-1 text-sm text-gray-300">
                  <li>• <strong>Anonymous Results</strong> - Hide writer names for the completed round’s summary.</li>
                  <li>• <strong>No Self-Reading</strong> - Try to prevent players from reading their own content.</li>
                  <li>• <strong>Force Advance</strong> - Move forward when submitted players are ready.</li>
                  <li>• <strong>Kick Player</strong> - Remove a player from the lobby before the game starts.</li>
                </ul>
              </div>
            </div>
          )}

          {helpTab === "faq" && (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <div className="w-10 h-10 mx-auto mb-2 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-lg flex items-center justify-center">
                  <span className="text-xl">❓</span>
                </div>
                <h3 className="font-bubble text-lg font-bold text-white">Frequently Asked Questions</h3>
              </div>

              {[
                {
                  question: "How many players do I need?",
                  answer: "At least 3 players, up to 15. The more players, the more chaos (and fun)!"
                },
                {
                  question: "How long does a game take?",
                  answer: "Usually 10-25 minutes, depending on player count and how theatrical the readings get."
                },
                {
                  question: "Can I play with friends who aren't in the same room?",
                  answer: "Yes. Share the 4-digit room code. Everyone can join from their own device."
                },
                {
                  question: "What if someone disconnects?",
                  answer: "They have a short reconnect window. If they return in time, they resume; otherwise they may be removed."
                },
                {
                  question: "Can we play again with the same group?",
                  answer: "Yes. After the summary, the host can replay with the same players or start fresh."
                },
                {
                  question: "What do the host toggles do?",
                  answer: "Anonymous Results hides names in the summary. No Self-Reading tries to avoid giving you your own content."
                },
                {
                  question: "How do reactions work?",
                  answer: "During readings, players can react with ❤️, 😂, or ❓. Hearts and laughs count toward 'Most-adored writer'."
                },
                {
                  question: "Can I play on my phone?",
                  answer: "Yes. The game is designed for mobile and desktop browsers."
                },
                {
                  question: "What if someone is taking too long?",
                  answer: "The host can force advance once enough players submit. Non-submitters may be removed for that round."
                },
                {
                  question: "Can I kick a player?",
                  answer: "Only the host can kick players, and only from the lobby."
                },
                {
                  question: "What do the summary awards mean?",
                  answer: "Top pairing is the most-voted question+answer combo. Most-adored writer measures ❤️ + 😂 reactions."
                }
              ].map(item => (
                <div className="bg-gray-800/50 rounded-lg p-3" key={item.question}>
                  <h4 className="text-sm font-bold text-indigo-400 mb-1">{item.question}</h4>
                  <p className="text-sm text-gray-300">{item.answer}</p>
                </div>
              ))}
            </div>
          )}

          {helpTab === "tips" && (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <div className="w-10 h-10 mx-auto mb-2 bg-gradient-to-br from-green-500 to-teal-600 rounded-lg flex items-center justify-center">
                  <span className="text-xl">💡</span>
                </div>
                <h3 className="font-bubble text-lg font-bold text-white">Tips & Tricks</h3>
              </div>

              <div className="border-t border-gray-700 pt-4">
                <h4 className="text-sm font-bold text-indigo-400 mb-2">Writing Good Questions 🖊️</h4>
                <ul className="space-y-1 text-sm text-gray-300">
                  <li>• Start with a clear “What if”.</li>
                  <li>• Leave room for answers; broad prompts create surprises.</li>
                  <li>• Stick to one funny idea; too many twists get messy.</li>
                  <li>• Avoid tiny inside jokes unless everyone will get them.</li>
                </ul>
              </div>

              <div className="border-t border-gray-700 pt-4">
                <h4 className="text-sm font-bold text-indigo-400 mb-2">Writing Good Answers 💡</h4>
                <ul className="space-y-1 text-sm text-gray-300">
                  <li>• Make it readable — someone else may perform it.</li>
                  <li>• Be specific; details beat vague punchlines.</li>
                  <li>• Think like a performer; give them something fun to say.</li>
                  <li>• Keep it punchy; shorter answers often land better.</li>
                </ul>
              </div>

              <div className="border-t border-gray-700 pt-4">
                <h4 className="text-sm font-bold text-indigo-400 mb-2">Performing 🎭</h4>
                <ul className="space-y-1 text-sm text-gray-300">
                  <li>• Read both parts clearly.</li>
                  <li>• Commit to the bit.</li>
                  <li>• Pause before the answer.</li>
                  <li>• React with emojis while others read.</li>
                </ul>
              </div>

              <div className="border-t border-gray-700 pt-4">
                <h4 className="text-sm font-bold text-indigo-400 mb-2">Hosting 🎮</h4>
                <ul className="space-y-1 text-sm text-gray-300">
                  <li>• Set expectations early.</li>
                  <li>• Use anonymity intentionally.</li>
                  <li>• Force advance carefully.</li>
                  <li>• Replay quickly to keep the group together.</li>
                </ul>
              </div>

              <div className="border-t border-gray-700 pt-4">
                <h4 className="text-sm font-bold text-indigo-400 mb-2">Winning the Room 🌟</h4>
                <ul className="space-y-1 text-sm text-gray-300">
                  <li>• Vote for the pairing you most want preserved.</li>
                  <li>• Send ❤️ and 😂 to reward writing you liked.</li>
                  <li>• Use ❓ for delicious chaos.</li>
                  <li>• Keep it kind, quick, and playful.</li>
                </ul>
              </div>
            </div>
          )}

          {helpTab === "about" && (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <div className="w-10 h-10 mx-auto mb-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                  <span className="text-xl">📖</span>
                </div>
                <h3 className="text-base font-bold text-white">About Fluke</h3>
              </div>

              <div className="border-t border-gray-700 pt-4 space-y-3">
                <h4 className="text-sm font-bold text-indigo-400 mb-2">What It Is</h4>
                <p className="text-sm text-gray-300 leading-relaxed">
                  Fluke is a browser-based party game built around “What if…?”. Write a question, answer someone else’s, then perform the mashups.
                </p>
                <p className="text-sm text-gray-300 leading-relaxed">
                  The app handles room code, flow, shuffling, reactions, summary votes, reconnects, and host controls.
                </p>
                <p className="text-sm text-gray-300 leading-relaxed">
                  It works best when players write quickly, commit to the bit, and react generously.
                </p>
              </div>

              <div className="border-t border-gray-700 pt-4 space-y-3">
                <h4 className="text-sm font-bold text-indigo-400 mb-2">What Makes This Version Different</h4>
                <p className="text-sm text-gray-300 leading-relaxed">
                  The summary highlights the current top pairing and the round’s most-adored writer, based on ❤️ and 😂 reactions.
                </p>
                <p className="text-sm text-gray-300 leading-relaxed">
                  Anonymous mode can hide names, so groups can choose mystery over credit.
                </p>
              </div>

              <div className="border-t border-gray-700 pt-4 space-y-3">
                <h4 className="text-sm font-bold text-indigo-400 mb-2">Best With</h4>
                <p className="text-sm text-gray-300 leading-relaxed">
                  Friends, family, coworkers, remote groups — any room that can handle a little absurdity. Three players is enough; bigger groups create more surprises.
                </p>
              </div>

              <div className="border-t border-gray-700 pt-4 space-y-3">
                <h4 className="text-sm font-bold text-indigo-400 mb-2">Thanks</h4>
                <p className="text-sm text-gray-300 leading-relaxed">
                  Thanks for playing, testing, reacting, voting, and making the questions stranger than expected. Now go ask something ridiculous.
                </p>
              </div>

              <div className="text-center pt-4">
                <span className="text-4xl">🎉</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <button onClick={onBack} className="btn-secondary py-3 text-sm w-full mt-3">
        Back to Main Screen
      </button>
    </div>
  )
}

export default HelpPage

import React from "react"

function SupportPage({ onBack }) {
  return (
    <div className="game-container py-2">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bubble text-xl font-bold text-gradient-chaos">Support the Project</h2>
        <button onClick={onBack} className="flex items-center gap-1 text-white/60 hover:text-white text-sm font-medium transition-colors">
          ← Back
        </button>
      </div>

      <div className="card flex-1 min-h-0 overflow-y-auto py-3 px-4 space-y-4">
        <div className="text-center mb-4">
          <div className="w-10 h-10 mx-auto mb-2 bg-gradient-to-br from-pink-500 to-rose-600 rounded-lg flex items-center justify-center">
            <span className="text-xl">🎁</span>
          </div>
          <h3 className="font-bubble text-lg font-bold text-white">Value for Value</h3>
        </div>

        <p className="text-sm text-gray-300 leading-relaxed">
          If Fluke gave you a good laugh, a memorable night, or a reason to reconnect with friends, consider returning some of that value back. This game is free to play, but it is not free to build, host, and improve.
        </p>

        <div className="border-t border-gray-700 pt-4 space-y-4">
          <div>
            <h4 className="text-sm font-bold text-pink-400 mb-2">Send a Tip</h4>
            <p className="text-sm text-gray-300 leading-relaxed mb-3">
              A small donation helps cover server costs and keeps the game online. No amount is too small.
            </p>

            <div className="hidden md:flex md:items-center md:gap-4">
              <div className="flex-1 flex flex-col items-center gap-2">
                <img
                  src="https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=https://cash.app/$playfluke"
                  alt="Cash App QR code for $playfluke"
                  className="w-52 h-52 rounded-lg bg-white p-2"
                />
                <p className="text-xs font-semibold text-gray-300 text-center max-w-[10rem] leading-relaxed">
                  Playing on PC? Scan with your phone camera to open Cash App instantly.
                </p>
              </div>
              <div className="flex-1 flex flex-col items-center gap-2">
                <a
                  href="https://square.link/u/YPi6d86H"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3 bg-[#00D632] hover:bg-[#00bd2c] text-black text-sm font-bold rounded-xl transition-colors shadow-lg"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
                  </svg>
                  pay with any credit card (no account needed) or Cash App
                </a>
                <p className="text-xs font-semibold text-gray-300 text-center leading-relaxed">
                  Opens in a new tab — works without the app.
                </p>
              </div>
            </div>

            <div className="md:hidden flex flex-col gap-3">
              <div className="flex flex-col items-center gap-2">
                <img
                  src="https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=https://cash.app/$playfluke"
                  alt="Cash App QR code for $playfluke"
                  className="w-44 h-44 rounded-lg bg-white p-2"
                />
                <p className="text-xs font-semibold text-gray-300 text-center max-w-[12rem] leading-relaxed">
                  Scan with your phone camera to open Cash App instantly.
                </p>
              </div>
              <a
                href="https://square.link/u/YPi6d86H"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#00D632] hover:bg-[#00bd2c] text-black text-sm font-bold rounded-xl transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
                </svg>
                pay with any credit card (no account needed) or Cash App
              </a>
              <p className="text-[10px] text-gray-500 text-center">
                Opens the Cash App if installed, or a secure web checkout otherwise.
              </p>
            </div>
          </div>

          <div className="border-t border-gray-700 pt-4">
            <h4 className="text-sm font-bold text-pink-400 mb-2">Beta Test & Feedback</h4>
            <p className="text-sm text-gray-300 leading-relaxed mb-3">
              Spotted a bug? Have an idea? Want to test new features before they go live? Your feedback shapes what Fluke becomes next.
            </p>
            <a href="mailto:hello@playfluke.com" className="text-sm text-indigo-300 hover:text-indigo-200 underline">
              hello@playfluke.com
            </a>
          </div>

          <div className="border-t border-gray-700 pt-4">
            <h4 className="text-sm font-bold text-pink-400 mb-2">Share the Game</h4>
            <p className="text-sm text-gray-300 leading-relaxed">
              The easiest way to support Fluke is to bring more people into the room. Share the link, teach a friend, or bring it to your next group hangout.
            </p>
          </div>

          <div className="border-t border-gray-700 pt-4">
            <h4 className="text-sm font-bold text-pink-400 mb-2">Thank You</h4>
            <p className="text-sm text-gray-300 leading-relaxed">
              However you choose to give back — donation, bug report, or another round — it matters. Thanks for being part of this.
            </p>
          </div>
        </div>
      </div>

      <button onClick={onBack} className="btn-secondary py-3 text-sm w-full mt-3">
        Back to Main Screen
      </button>
    </div>
  )
}

export default SupportPage

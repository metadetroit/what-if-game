import React, { useState, useEffect } from "react"

function AgeGate({ onConfirm }) {
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    // Check if user has already confirmed in this session
    const hasConfirmed = sessionStorage.getItem('fword-age-confirmed') === 'true'
    if (hasConfirmed) {
      setConfirmed(true)
      onConfirm()
    }
  }, [onConfirm])

  const handleConfirm = () => {
    sessionStorage.setItem('fword-age-confirmed', 'true')
    setConfirmed(true)
    onConfirm()
  }

  if (confirmed) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6">
          <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-red-600 to-orange-600 rounded-full flex items-center justify-center">
            <span className="text-4xl">🔞</span>
          </div>
          <h1 className="font-bubble text-3xl font-bold text-white mb-2">Age Verification Required</h1>
          <p className="text-gray-300 text-sm leading-relaxed">
            This content contains mature themes and explicit language. You must be 18 years or older to view.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleConfirm}
            className="w-full py-3 px-6 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors"
          >
            I am 18+ and wish to continue
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="w-full py-3 px-6 bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold rounded-lg transition-colors"
          >
            Return to safe content
          </button>
        </div>

        <p className="mt-6 text-xs text-gray-500">
          By continuing, you confirm that you are of legal age to view adult content in your jurisdiction.
        </p>
      </div>
    </div>
  )
}

export default AgeGate

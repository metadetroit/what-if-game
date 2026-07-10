import React from "react"

function BestOfView({
  bestOfScrollRef,
  bestOfSentinelRef,
  bestOfData,
  bestOfSort,
  bestOfLoading,
  adminKey,
  onBack,
  onSortChange,
  onToggleAdmin,
  onCopyLink,
  onDeleteItem,
  onApproveSFW,
  onApproveNSFW,
  onRejectFactual,
  viewMode = "approved", // "approved" | "pending"
  onViewModeChange,
  contentFilter = "all",
  onContentFilterChange
}) {
  const renderContent = () => {
    if (bestOfData === null) {
      return (
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      )
    }

    if (bestOfData.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm">
            {viewMode === "pending"
              ? "No pending items to review."
              : contentFilter !== "all"
                ? "No content matches this filter."
                : "No content yet. Play some games to see the best content here!"}
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-3 content-visibility-auto">
        {bestOfData.map((item, index) => (
          <div key={`${item.type}-${item.id}-${index}`} id={`bestof-${item.id}`} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
            {item.type === "qa_pair" && (
              <>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold text-amber-400">🎯 GAME PAIRING</span>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <button
                      onClick={() => onCopyLink(item.id)}
                      className="text-xs text-indigo-300 hover:text-indigo-200 underline min-h-[44px]"
                      title="Copy shareable link"
                      aria-label="Copy shareable link"
                    >
                      🔗 Copy link
                    </button>
                    {adminKey && (
                      <>
                        {viewMode === "pending" ? (
                          <>
                            <button
                              onClick={() => onApproveSFW(item.id, index)}
                              className="text-xs text-green-400 hover:text-green-300 underline min-h-[44px]"
                              title="Approve as SFW"
                              aria-label="Approve as SFW"
                            >
                              ✓ SFW
                            </button>
                            <button
                              onClick={() => onApproveNSFW(item.id, index)}
                              className="text-xs text-orange-400 hover:text-orange-300 underline min-h-[44px]"
                              title="Approve as NSFW"
                              aria-label="Approve as NSFW"
                            >
                              ✓ NSFW
                            </button>
                            {onRejectFactual && (
                              <button
                                onClick={() => onRejectFactual(item.id, index)}
                                className="text-xs text-gray-400 hover:text-gray-300 underline min-h-[44px]"
                                title="Reject as factual Q&A"
                                aria-label="Reject as factual Q&A"
                              >
                                ✕ Factual
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => onApproveSFW(item.id, index)}
                              className="text-xs text-green-400 hover:text-green-300 underline min-h-[44px]"
                              title="Mark as SFW"
                              aria-label="Mark as SFW"
                            >
                              ✓ SFW
                            </button>
                            <button
                              onClick={() => onApproveNSFW(item.id, index)}
                              className="text-xs text-orange-400 hover:text-orange-300 underline min-h-[44px]"
                              title="Mark as NSFW"
                              aria-label="Mark as NSFW"
                            >
                              ✓ NSFW
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => onDeleteItem(item.type, item.id, index)}
                          className="text-xs text-red-400 hover:text-red-300 underline min-h-[44px]"
                          title="Delete this item"
                          aria-label="Delete this item"
                        >
                          🗑 Delete
                        </button>
                      </>
                    )}
                    <span className="text-xs text-gray-400">🏆 {item.vote_count}</span>
                  </div>
                </div>
                <p className="text-base md:text-lg text-white mb-1 break-words"><span className="text-indigo-400">Q:</span> {item.question}</p>
                <p className="text-base md:text-lg text-white mb-2 break-words"><span className="text-purple-400">A:</span> {item.answer}</p>
                <p className="text-xs md:text-sm text-gray-500">— {item.question_author} → {item.answer_author}</p>
              </>
            )}
          </div>
        ))}
        <div ref={bestOfSentinelRef} className="h-8" />
        {bestOfLoading && (
          <div className="pt-2 text-center text-xs text-gray-400">Loading…</div>
        )}
      </div>
    )
  }

  return (
    <div ref={bestOfScrollRef} className="game-container game-container--scroll py-4">
      <div className="text-center mb-4 relative">
        <button
          onClick={onBack}
          className="absolute top-0 left-0 flex items-center gap-1 text-white/60 hover:text-white text-sm font-medium transition-colors"
          aria-label="Back to main screen"
        >
          ← Back
        </button>
        <div className="w-12 h-12 mx-auto mb-2 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
          <span className="text-xl">🏆</span>
        </div>
        <h1 className="font-bubble text-2xl font-extrabold text-gradient-chaos mb-1">Best Of</h1>
        <p className="text-gray-500 text-xs md:text-sm mt-1">Top-voted game pairings from all games</p>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {onContentFilterChange && (
            <div className="inline-flex rounded-lg border border-gray-700 bg-gray-800/60 overflow-hidden text-xs md:text-sm">
              <button
                onClick={() => onContentFilterChange("all")}
                className={`px-3 py-1 min-h-[44px] ${contentFilter === "all" ? "bg-indigo-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}
              >
                Show All
              </button>
              <button
                onClick={() => onContentFilterChange("nsfw")}
                className={`px-3 py-1 border-l border-gray-700 min-h-[44px] ${contentFilter === "nsfw" ? "bg-indigo-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}
              >
                Only NSFW
              </button>
              <button
                onClick={() => onContentFilterChange("sfw")}
                className={`px-3 py-1 border-l border-gray-700 min-h-[44px] ${contentFilter === "sfw" ? "bg-indigo-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}
              >
                Only SFW
              </button>
            </div>
          )}
          {adminKey && (
            <div className="inline-flex rounded-lg border border-gray-700 bg-gray-800/60 overflow-hidden text-xs md:text-sm">
              <button
                onClick={() => onViewModeChange && onViewModeChange("approved")}
                className={`px-3 py-1 min-h-[44px] ${viewMode === "approved" ? "bg-indigo-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}
              >
                Approved
              </button>
              <button
                onClick={() => onViewModeChange && onViewModeChange("pending")}
                className={`px-3 py-1 border-l border-gray-700 min-h-[44px] ${viewMode === "pending" ? "bg-indigo-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}
              >
                Pending
              </button>
            </div>
          )}
          {viewMode === "approved" && (
            <div className="inline-flex rounded-lg border border-gray-700 bg-gray-800/60 overflow-hidden text-xs md:text-sm">
              <button
                onClick={() => onSortChange("votes")}
                className={`px-3 py-1 min-h-[44px] ${bestOfSort === "votes" ? "bg-indigo-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}
              >
                Most votes
              </button>
              <button
                onClick={() => onSortChange("newest")}
                className={`px-3 py-1 border-l border-gray-700 min-h-[44px] ${bestOfSort === "newest" ? "bg-indigo-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}
              >
                Newest
              </button>
            </div>
          )}
          <button
            onClick={onToggleAdmin}
            className={`text-xs md:text-sm px-2 py-1 rounded-lg border min-h-[44px] ${adminKey ? "border-amber-500/50 text-amber-400 bg-amber-500/10" : "border-gray-700 text-gray-500 hover:text-gray-300"}`}
            title={adminKey ? "Admin mode active — click to disable" : "Enter admin key to enable delete"}
          >
            {adminKey ? "🔓 Admin" : "🔒"}
          </button>
        </div>
      </div>

      <div className="card py-3">
        {renderContent()}
      </div>

      <button onClick={onBack} className="btn-secondary py-3 text-sm w-full mt-3">
        Back to Main Screen
      </button>
    </div>
  )
}

export default BestOfView

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import BestOfView from "./BestOfView"
import { noticeFor } from "../utils/gameUtils"

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin

function adminResponseError(response) {
  if (response.status === 503) return 'Admin controls are not configured'
  if (response.status === 403) return 'Admin key invalid'
  return null
}

function UncutBestOfView({ onBack, setNotice }) {
  const [bestOfData, setBestOfData] = useState(null)
  const [bestOfSort, setBestOfSort] = useState(() => sessionStorage.getItem('uncutBestOfSort') || 'votes')
  const [bestOfLimit, setBestOfLimit] = useState(50)
  const [bestOfOffset, setBestOfOffset] = useState(0)
  const [bestOfHasMore, setBestOfHasMore] = useState(false)
  const [bestOfLoading, setBestOfLoading] = useState(false)
  const [bestOfError, setBestOfError] = useState(null)
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem('adminKey') || '')
  const [contentFilter, setContentFilter] = useState('all')
  const [adminKeyPrompt, setAdminKeyPrompt] = useState(null) // { resolve } when awaiting key input
  const [adminKeyInput, setAdminKeyInput] = useState('')

  const bestOfSentinelRef = useRef(null)
  const bestOfScrollRef = useRef(null)
  const scrollPairRef = useRef(null)

  const notify = useCallback((msg, tone = 'info', ms = 2000) => {
    if (setNotice) setNotice(noticeFor(msg, tone, ms))
  }, [setNotice])

  // Opens the inline admin-key modal and resolves with the key (or null if cancelled)
  const requestAdminKey = useCallback(() => {
    if (adminKey) return Promise.resolve(adminKey)
    setAdminKeyInput('')
    return new Promise(resolve => setAdminKeyPrompt({ resolve }))
  }, [adminKey])

  const handleAdminKeySubmit = () => {
    const key = adminKeyInput.trim()
    if (!key) return
    setAdminKey(key)
    sessionStorage.setItem('adminKey', key)
    adminKeyPrompt?.resolve(key)
    setAdminKeyPrompt(null)
  }

  const handleAdminKeyCancel = () => {
    adminKeyPrompt?.resolve(null)
    setAdminKeyPrompt(null)
  }

  const fetchBestOfData = async (opts = {}) => {
    if (bestOfLoading && !opts.force) return
    setBestOfLoading(true)
    setBestOfError(null)
    const sort = opts.sort || bestOfSort
    const limit = opts.limit || bestOfLimit
    const offset = opts.offset ?? bestOfOffset
    const url = `${SOCKET_URL}/api/best-of-uncut?type=qa_pairs&limit=${limit}&sort=${sort}&offset=${offset}`
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()

      if (opts.offset === 0) {
        setBestOfData(data)
      } else {
        setBestOfData(prev => {
          if (!prev) return data
          return [...prev, ...data]
        })
      }

      setBestOfHasMore(Array.isArray(data) && data.length === limit)
    } catch (error) {
      console.error('Failed to fetch uncut best-of data:', error)
      setBestOfError('Failed to load content. Please try again.')
    } finally {
      setBestOfLoading(false)
    }
  }

  const handleBestOfSortChange = useCallback((sort) => {
    sessionStorage.setItem('uncutBestOfSort', sort)
    setBestOfSort(sort)
    setBestOfOffset(0)
    setBestOfError(null)
    fetchBestOfData({ sort, offset: 0, force: true })
  }, [fetchBestOfData])

  const handleCopyLink = useCallback((pairId) => {
    const url = `${window.location.origin}/fword?pair=${pairId}`
    navigator.clipboard.writeText(url).then(() => {
      notify('Link copied to clipboard', 'success', 1500)
    }).catch(() => {
      notify('Failed to copy link', 'warn', 2500)
    })
  }, [notify])

  // Scroll to a deep-linked pair once it appears in the list
  useEffect(() => {
    try {
      const pairId = new URLSearchParams(window.location.search).get('pair')
      if (pairId) scrollPairRef.current = pairId
    } catch (_) {}
  }, [])

  useEffect(() => {
    if (!scrollPairRef.current || !Array.isArray(bestOfData)) return
    const el = document.getElementById(`bestof-${scrollPairRef.current}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      scrollPairRef.current = null
    }
  }, [bestOfData])

  const handleDeleteItem = async (type, id, index) => {
    const effectiveAdminKey = await requestAdminKey()
    if (!effectiveAdminKey) return

    try {
      const response = await fetch(`${SOCKET_URL}/api/admin/delete-pair`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': effectiveAdminKey
        },
        body: JSON.stringify({ type, id })
      })

      const authError = adminResponseError(response)
      if (authError) {
        setAdminKey('')
        sessionStorage.removeItem('adminKey')
        notify(authError, 'warn', 3000)
        return
      }
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setBestOfData(prev => (Array.isArray(prev) ? prev.filter(item => item.id !== id) : prev))
          notify('Item deleted', 'success', 2000)
        } else {
          notify('Failed to delete item', 'warn', 2500)
        }
      } else {
        notify('Failed to delete item', 'warn', 2500)
      }
    } catch (error) {
      console.error('Failed to delete best-of item:', error)
      notify('Failed to delete item', 'warn', 2500)
    }
  }

  const handleApproveSFW = async (id, index) => {
    const effectiveAdminKey = await requestAdminKey()
    if (!effectiveAdminKey) return

    // Optimistic UI update
    setBestOfData(prev => (Array.isArray(prev) ? prev.filter(item => item.id !== id) : prev))

    try {
      const response = await fetch(`${SOCKET_URL}/api/admin/approve-sfw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': effectiveAdminKey
        },
        body: JSON.stringify({ id })
      })

      const authError = adminResponseError(response)
      if (authError) {
        setAdminKey('')
        sessionStorage.removeItem('adminKey')
        fetchBestOfData({ force: true })
        notify(authError, 'warn', 3000)
      } else if (!response.ok) {
        fetchBestOfData({ force: true })
        notify('Failed to approve as SFW', 'warn', 2500)
      } else {
        notify('Approved as SFW', 'success', 2000)
      }
    } catch (error) {
      console.error('Failed to approve as SFW:', error)
      fetchBestOfData({ force: true })
      notify('Failed to approve as SFW', 'warn', 2500)
    }
  }

  const handleApproveNSFW = async (id, index) => {
    const effectiveAdminKey = await requestAdminKey()
    if (!effectiveAdminKey) return

    // Optimistic UI update
    setBestOfData(prev => (Array.isArray(prev) ? prev.filter(item => item.id !== id) : prev))

    try {
      const response = await fetch(`${SOCKET_URL}/api/admin/approve-nsfw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': effectiveAdminKey
        },
        body: JSON.stringify({ id })
      })

      const authError = adminResponseError(response)
      if (authError) {
        setAdminKey('')
        sessionStorage.removeItem('adminKey')
        fetchBestOfData({ force: true })
        notify(authError, 'warn', 3000)
      } else if (!response.ok) {
        fetchBestOfData({ force: true })
        notify('Failed to approve as NSFW', 'warn', 2500)
      } else {
        notify('Approved as NSFW', 'success', 2000)
      }
    } catch (error) {
      console.error('Failed to approve as NSFW:', error)
      fetchBestOfData({ force: true })
      notify('Failed to approve as NSFW', 'warn', 2500)
    }
  }

  const handleToggleAdmin = useCallback(() => {
    if (adminKey) {
      setAdminKey('')
      sessionStorage.removeItem('adminKey')
      notify('Admin mode disabled', 'info', 1500)
    } else {
      requestAdminKey()
    }
  }, [adminKey, requestAdminKey, notify])

  const filteredBestOfData = useMemo(() => {
    if (!Array.isArray(bestOfData)) return bestOfData
    if (contentFilter === 'nsfw') {
      return bestOfData.filter(item => item.is_nsfw)
    }
    if (contentFilter === 'sfw') {
      return bestOfData.filter(item => !item.is_nsfw)
    }
    return bestOfData
  }, [bestOfData, contentFilter])

  // Initial fetch
  useEffect(() => {
    if (bestOfData === null && !bestOfLoading) {
      fetchBestOfData({ sort: 'votes', offset: 0, force: true })
    }
  }, [bestOfData, bestOfLoading])

  // Infinite scroll
  useEffect(() => {
    const sentinel = bestOfSentinelRef.current
    const root = bestOfScrollRef.current || null

    if (!sentinel || !root) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && bestOfHasMore && !bestOfLoading) {
          const nextOffset = bestOfOffset + bestOfLimit
          setBestOfOffset(nextOffset)
          fetchBestOfData({ offset: nextOffset })
        }
      },
      { root, rootMargin: '200px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [bestOfHasMore, bestOfLoading, bestOfOffset, bestOfLimit, bestOfSort, bestOfData])

  return (
    <>
      {adminKeyPrompt && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4" role="dialog" aria-modal="true" aria-labelledby="admin-key-title">
          <div className="bg-gray-900 border border-amber-500/50 rounded-2xl p-6 max-w-xs w-full text-center shadow-2xl">
            <p id="admin-key-title" className="text-lg font-bold text-white mb-2">Admin Key Required</p>
            <p className="text-sm text-gray-400 mb-4">Enter the admin key to continue.</p>
            <input
              type="password"
              value={adminKeyInput}
              onChange={(e) => setAdminKeyInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdminKeySubmit() }}
              placeholder="Admin key"
              autoFocus
              autoComplete="off"
              aria-label="Admin key"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-base mb-4 focus:outline-none focus:border-amber-500"
            />
            <div className="flex flex-col gap-2">
              <button onClick={handleAdminKeySubmit} disabled={!adminKeyInput.trim()} className="btn-primary py-2.5 text-base w-full min-h-[44px]">
                Unlock Admin
              </button>
              <button onClick={handleAdminKeyCancel} className="btn-secondary py-2 text-sm w-full min-h-[44px]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <BestOfView
        bestOfScrollRef={bestOfScrollRef}
        bestOfSentinelRef={bestOfSentinelRef}
        bestOfData={filteredBestOfData}
        bestOfSort={bestOfSort}
        bestOfLoading={bestOfLoading}
        bestOfError={bestOfError}
        adminKey={adminKey}
        onBack={onBack}
        onSortChange={handleBestOfSortChange}
        onToggleAdmin={handleToggleAdmin}
        onCopyLink={handleCopyLink}
        onDeleteItem={handleDeleteItem}
        onApproveSFW={handleApproveSFW}
        onApproveNSFW={handleApproveNSFW}
        viewMode="approved"
        contentFilter={contentFilter}
        onContentFilterChange={setContentFilter}
      />
    </>
  )
}

export default UncutBestOfView

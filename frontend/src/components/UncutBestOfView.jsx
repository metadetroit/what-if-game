import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import BestOfView from "./BestOfView"

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin

function adminResponseError(response) {
  if (response.status === 503) return 'Admin controls are not configured'
  if (response.status === 403) return 'Admin key invalid'
  return null
}

function UncutBestOfView({ onBack }) {
  const [bestOfData, setBestOfData] = useState(null)
  const [bestOfSort, setBestOfSort] = useState(() => sessionStorage.getItem('uncutBestOfSort') || 'votes')
  const [bestOfLimit, setBestOfLimit] = useState(50)
  const [bestOfOffset, setBestOfOffset] = useState(0)
  const [bestOfHasMore, setBestOfHasMore] = useState(false)
  const [bestOfLoading, setBestOfLoading] = useState(false)
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem('adminKey') || '')
  const [contentFilter, setContentFilter] = useState('all')

  const bestOfSentinelRef = useRef(null)
  const bestOfScrollRef = useRef(null)

  const fetchBestOfData = async (opts = {}) => {
    try {
      if (bestOfLoading && !opts.force) return
      setBestOfLoading(true)
      const sort = opts.sort || bestOfSort
      const limit = opts.limit || bestOfLimit
      const offset = opts.offset ?? bestOfOffset
      const url = `${SOCKET_URL}/api/best-of-uncut?type=qa_pairs&limit=${limit}&sort=${sort}&offset=${offset}`
      const response = await fetch(url)
      const data = await response.json()

      if (opts.offset === 0) {
        setBestOfData(data)
      } else {
        setBestOfData(prev => {
          if (!prev) return data
          return [...prev, ...data]
        })
      }

      setBestOfHasMore(false)
    } catch (error) {
      console.error('Failed to fetch uncut best-of data:', error)
    } finally {
      setBestOfLoading(false)
    }
  }

  const handleBestOfSortChange = useCallback((sort) => {
    sessionStorage.setItem('uncutBestOfSort', sort)
    setBestOfSort(sort)
    setBestOfOffset(0)
    setBestOfData(null)
    fetchBestOfData({ sort, offset: 0, force: true })
  }, [fetchBestOfData])

  const handleCopyLink = useCallback((pairId) => {
    const url = `${window.location.origin}/fword?pair=${pairId}`
    navigator.clipboard.writeText(url).then(() => {
      alert('Link copied to clipboard!')
    }).catch(() => {
      alert('Failed to copy link')
    })
  }, [])

  const handleDeleteItem = async (type, id, index) => {
    let effectiveAdminKey = adminKey
    if (!adminKey) {
      const key = prompt('Enter admin key to delete:')
      if (!key) return
      setAdminKey(key)
      sessionStorage.setItem('adminKey', key)
      effectiveAdminKey = key
    }

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
        alert(authError)
        return
      }
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setBestOfData(prev => (Array.isArray(prev) ? prev.filter(item => item.id !== id) : prev))
        } else {
          alert('Failed to delete item')
        }
      } else {
        alert('Failed to delete item')
      }
    } catch (error) {
      console.error('Failed to delete best-of item:', error)
      alert('Failed to delete item')
    }
  }

  const handleApproveSFW = async (id, index) => {
    let effectiveAdminKey = adminKey
    if (!adminKey) {
      const key = prompt('Enter admin key:')
      if (!key) return
      setAdminKey(key)
      sessionStorage.setItem('adminKey', key)
      effectiveAdminKey = key
    }

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
        alert(authError)
      } else if (!response.ok) {
        fetchBestOfData({ force: true })
        alert('Failed to approve as SFW')
      } else {
        alert('Approved as SFW')
      }
    } catch (error) {
      console.error('Failed to approve as SFW:', error)
      fetchBestOfData({ force: true })
      alert('Failed to approve as SFW')
    }
  }

  const handleApproveNSFW = async (id, index) => {
    let effectiveAdminKey = adminKey
    if (!adminKey) {
      const key = prompt('Enter admin key:')
      if (!key) return
      setAdminKey(key)
      sessionStorage.setItem('adminKey', key)
      effectiveAdminKey = key
    }

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
        alert(authError)
      } else if (!response.ok) {
        fetchBestOfData({ force: true })
        alert('Failed to approve as NSFW')
      } else {
        alert('Approved as NSFW')
      }
    } catch (error) {
      console.error('Failed to approve as NSFW:', error)
      fetchBestOfData({ force: true })
      alert('Failed to approve as NSFW')
    }
  }

  const handleToggleAdmin = useCallback(() => {
    if (adminKey) {
      setAdminKey('')
      sessionStorage.removeItem('adminKey')
    } else {
      const key = prompt('Enter admin key:')
      if (key) {
        setAdminKey(key)
        sessionStorage.setItem('adminKey', key)
      }
    }
  }, [adminKey])

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
    <BestOfView
      bestOfScrollRef={bestOfScrollRef}
      bestOfSentinelRef={bestOfSentinelRef}
      bestOfData={filteredBestOfData}
      bestOfSort={bestOfSort}
      bestOfLoading={bestOfLoading}
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
  )
}

export default UncutBestOfView

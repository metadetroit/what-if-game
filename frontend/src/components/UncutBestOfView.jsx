import React, { useState, useEffect, useCallback, useRef } from "react"
import BestOfView from "./BestOfView"

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin

function UncutBestOfView({ onBack }) {
  const [bestOfData, setBestOfData] = useState(null)
  const [bestOfSort, setBestOfSort] = useState(() => sessionStorage.getItem('uncutBestOfSort') || 'votes')
  const [bestOfLimit, setBestOfLimit] = useState(20)
  const [bestOfOffset, setBestOfOffset] = useState(0)
  const [bestOfHasMore, setBestOfHasMore] = useState(true)
  const [bestOfLoading, setBestOfLoading] = useState(false)
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem('adminKey') || '')

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

      setBestOfHasMore(Array.isArray(data) ? data.length === limit : false)
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
    if (!adminKey) {
      const key = prompt('Enter admin key to delete:')
      if (!key) return
      setAdminKey(key)
      sessionStorage.setItem('adminKey', key)
    }

    try {
      const response = await fetch(`${SOCKET_URL}/api/delete-best-of`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey
        },
        body: JSON.stringify({ type, id })
      })

      if (response.ok) {
        setBestOfData(prev => prev.filter((_, i) => i !== index))
      } else {
        alert('Failed to delete item')
      }
    } catch (error) {
      console.error('Failed to delete best-of item:', error)
      alert('Failed to delete item')
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
      bestOfData={bestOfData}
      bestOfSort={bestOfSort}
      bestOfLoading={bestOfLoading}
      adminKey={adminKey}
      onBack={onBack}
      onSortChange={handleBestOfSortChange}
      onToggleAdmin={handleToggleAdmin}
      onCopyLink={handleCopyLink}
      onDeleteItem={handleDeleteItem}
    />
  )
}

export default UncutBestOfView

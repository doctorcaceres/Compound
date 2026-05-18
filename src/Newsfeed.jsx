import { useEffect, useState } from 'react'
import { timeAgo } from './format'
import {
  loadStoredNewsfeed,
  refreshIfStale,
  NEWSFEED_REFRESH_EVENT,
  FOCUS_AI_INPUT_EVENT,
} from './newsfeedClient'
import './Newsfeed.css'

function Newsfeed({ user }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Load on mount: read stored items immediately for fast paint,
  // then trigger a stale-aware refresh in the background.
  useEffect(() => {
    if (!user?.id) return
    let active = true
    setLoading(true)
    ;(async () => {
      const cached = await loadStoredNewsfeed(user.id, 5)
      if (!active) return
      setItems(cached)
      setLoading(false)

      // Refresh in the background if cached is empty OR cooldown expired.
      const stale = cached.length === 0 || (() => {
        const last = user.feed_preferences?.newsfeed_last_fetched_at
        if (!last) return true
        return (Date.now() - new Date(last).getTime()) > 12 * 3600 * 1000
      })()
      if (stale) {
        setRefreshing(true)
        const { items: fresh } = await refreshIfStale({ user })
        if (active && fresh && fresh.length > 0) setItems(fresh)
        if (active) setRefreshing(false)
      }
    })()
    return () => { active = false }
  }, [user?.id])

  // Listen for cross-component refresh signals (Ask Compound saved
  // new topics and wants the newsfeed to repopulate).
  useEffect(() => {
    if (!user?.id) return
    const onRefresh = async () => {
      setRefreshing(true)
      // Re-load whatever the latest user object has (parent passes it
      // down — but we also re-read directly from storage).
      const fresh = await loadStoredNewsfeed(user.id, 5)
      setItems(fresh)
      setRefreshing(false)
    }
    window.addEventListener(NEWSFEED_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(NEWSFEED_REFRESH_EVENT, onRefresh)
  }, [user?.id])

  const focusAskCompound = (e) => {
    e.preventDefault()
    window.dispatchEvent(new CustomEvent(FOCUS_AI_INPUT_EVENT))
  }

  return (
    <div className="newsfeed">
      <div className="newsfeed-head">
        <div className="newsfeed-title">Your Newsfeed</div>
        {refreshing && <span className="newsfeed-refreshing">Refreshing…</span>}
      </div>

      {loading && items.length === 0 ? (
        <div className="newsfeed-loading">Loading news…</div>
      ) : items.length === 0 ? (
        <div className="newsfeed-empty">
          No news yet. Tell <button className="newsfeed-link" onClick={focusAskCompound}>Ask Compound</button> what topics to track.
        </div>
      ) : (
        <ul className="newsfeed-list">
          {items.map(it => (
            <li key={it.id} className="newsfeed-item">
              <a
                className="newsfeed-headline"
                href={it.source_url}
                target="_blank"
                rel="noopener noreferrer"
                title={it.summary || it.headline}
              >
                {it.headline}
              </a>
              <div className="newsfeed-meta">
                <span className="newsfeed-source">{it.source_name || hostnameOf(it.source_url)}</span>
                <span className="newsfeed-dot">·</span>
                <span className="newsfeed-time">{timeAgo(it.fetched_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="newsfeed-foot">
        <button className="newsfeed-link" onClick={focusAskCompound}>
          Tell Ask Compound how to structure your newsfeed →
        </button>
      </div>
    </div>
  )
}

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return 'source' }
}

export default Newsfeed

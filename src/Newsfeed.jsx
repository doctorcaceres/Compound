import { useEffect, useState, useCallback } from 'react'
import { timeAgo } from './format'
import {
  loadStoredNewsfeed,
  fetchAndStoreNewsfeed,
  NEWSFEED_REFRESH_EVENT,
  FOCUS_AI_INPUT_EVENT,
} from './newsfeedClient'
import './Newsfeed.css'

const REFRESH_HOURS = 12
const COLLAPSED_KEY = (userId) => `newsfeed-collapsed:${userId || 'anon'}`

function isStale(lastFetchedAt) {
  if (!lastFetchedAt) return true
  const ms = new Date(lastFetchedAt).getTime()
  if (Number.isNaN(ms)) return true
  return (Date.now() - ms) > REFRESH_HOURS * 3600 * 1000
}

function readCollapsed(userId) {
  try { return localStorage.getItem(COLLAPSED_KEY(userId)) === '1' }
  catch { return false }
}

function Newsfeed({ user }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)   // initial cache read
  const [refreshing, setRefreshing] = useState(false) // an active AI fetch
  const [error, setError] = useState(null)
  const [collapsed, setCollapsed] = useState(() => readCollapsed(user?.id))

  // Re-read the saved preference if the signed-in user changes (e.g.
  // after a logout/login on the same browser).
  useEffect(() => { setCollapsed(readCollapsed(user?.id)) }, [user?.id])

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(COLLAPSED_KEY(user?.id), next ? '1' : '0') } catch {}
      return next
    })
  }

  const doFetch = useCallback(async () => {
    if (!user?.id) return
    setRefreshing(true)
    setError(null)
    try {
      const { items: fresh } = await fetchAndStoreNewsfeed({ user })
      if (Array.isArray(fresh) && fresh.length > 0) {
        setItems(fresh)
      } else {
        // Distinguish silent-success-but-empty from silent-failure
        // in the dev console, but show the same friendly message to
        // the user regardless. Never surface API URLs, org IDs, or
        // status codes to end users.
        console.warn('newsfeed: fetch returned no items')
        setError('News is updating — check back shortly.')
      }
    } catch (e) {
      // Full diagnostic info for the dev console; the user gets a
      // generic friendly message no matter what threw.
      console.warn('newsfeed: fetch threw', {
        message: e?.message,
        name: e?.name,
        cause: e?.cause,
      })
      setError('News is updating — check back shortly.')
    } finally {
      setRefreshing(false)
    }
  }, [user])

  // Mount path: read whatever's cached, then ALWAYS fetch fresh if
  // (a) cache is empty or (b) cooldown has expired. The fetch runs in
  // the same effect (not a separate hop) so the `refreshing` flag is
  // set before React re-renders the empty state.
  useEffect(() => {
    if (!user?.id) return
    let active = true
    ;(async () => {
      setLoading(true)
      const cached = await loadStoredNewsfeed(user.id, 5)
      if (!active) return
      setItems(cached)
      setLoading(false)

      const needsFetch =
        cached.length === 0 ||
        isStale(user.feed_preferences?.newsfeed_last_fetched_at)
      if (needsFetch) {
        await doFetch()
      }
    })()
    return () => { active = false }
  }, [user?.id, doFetch])

  // Cross-component refresh signal: Ask Compound just saved new
  // topics. Re-read storage; ChatPanel fired this AFTER the actual
  // AnthropicWeb fetch + DB insert completed, so the rows are there.
  useEffect(() => {
    if (!user?.id) return
    const onRefresh = async () => {
      const fresh = await loadStoredNewsfeed(user.id, 5)
      setItems(fresh)
      setError(null)
    }
    window.addEventListener(NEWSFEED_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(NEWSFEED_REFRESH_EVENT, onRefresh)
  }, [user?.id])

  const focusAskCompound = (e) => {
    e.preventDefault()
    window.dispatchEvent(new CustomEvent(FOCUS_AI_INPUT_EVENT))
  }

  // UI state machine — anything that's "we don't have rows yet but we
  // ARE doing something about it" should read as Loading, not Empty.
  const busyAndEmpty = (loading || refreshing) && items.length === 0
  const errorAndEmpty = !!error && items.length === 0 && !refreshing

  return (
    <div className={`newsfeed${collapsed ? ' collapsed' : ''}`}>
      <div className="newsfeed-head">
        <div className="newsfeed-title">Your Newsfeed</div>
        <div className="newsfeed-head-right">
          {refreshing && <span className="newsfeed-refreshing">Pulling stories…</span>}
          <button
            className="newsfeed-toggle"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand newsfeed' : 'Collapse newsfeed'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand' : 'Collapse'}
            type="button"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {collapsed
                ? <polyline points="6 9 12 15 18 9" />
                : <polyline points="18 15 12 9 6 15" />}
            </svg>
          </button>
        </div>
      </div>

      {!collapsed && (busyAndEmpty ? (
        <div className="newsfeed-loading">Pulling fresh news…</div>
      ) : errorAndEmpty ? (
        <div className="newsfeed-empty newsfeed-error">
          {error}
          <button className="newsfeed-link newsfeed-retry" onClick={doFetch}>Try again</button>
        </div>
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
      ))}

      {!collapsed && (
        <div className="newsfeed-foot">
          <button className="newsfeed-link" onClick={focusAskCompound}>
            Tell Ask Compound how to structure your newsfeed →
          </button>
        </div>
      )}
    </div>
  )
}

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return 'source' }
}

export default Newsfeed

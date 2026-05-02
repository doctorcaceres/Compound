import { useEffect, useRef, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { makeInitials, sectorTheme, timeAgo } from './format'
import {
  tryLocalAnswer,
  buildContext,
  callClaude,
  getDailyCount,
  incrementDailyCount,
  dailyLimitReached,
  QUOTA_LIMIT,
} from './aiChat'
import './ChatPanel.css'

const HOME_SUGGESTIONS = [
  'Summarize my rooms',
  "What's new today",
  'Find companies in biotech',
  'Tune my feed',
]

const ROOM_SUGGESTIONS = [
  'Summarize this room',
  'What are we waiting on',
  "Who's involved",
  'Draft a follow-up',
]

function isInRoom(pathname) {
  return /^\/rooms\/[^/]+$/.test(pathname)
}

function ChatPanel({ user }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [count, setCount] = useState(0)
  const [recent, setRecent] = useState({ followers: [], rooms: [] })
  const [mobileOpen, setMobileOpen] = useState(false)
  const scrollRef = useRef(null)

  // Auto-close mobile overlay on navigation so the user actually lands on the
  // page they clicked through to instead of staying behind the panel.
  useEffect(() => {
    if (mobileOpen) setMobileOpen(false)
    // intentionally only watch pathname
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const inRoom = isInRoom(location.pathname)
  const roomId = inRoom ? location.pathname.split('/')[2] : null
  const suggestions = inRoom ? ROOM_SUGGESTIONS : HOME_SUGGESTIONS

  // Initialize the local quota counter for this user
  useEffect(() => {
    if (user?.id) setCount(getDailyCount(user.id))
  }, [user?.id])

  // Recent activity widget data
  const fetchRecent = useCallback(async () => {
    if (!user?.id) return
    const [followsRes, msgsRes] = await Promise.all([
      supabase
        .from('follows')
        .select('created_at, follower:profiles!follower_id(id, display_name, sector)')
        .eq('followed_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('room_messages')
        .select('content, created_at, room:conversation_rooms!room_id(id, name)')
        .order('created_at', { ascending: false })
        .limit(3),
    ])
    setRecent({
      followers: (followsRes.data || []).map(f => f.follower).filter(Boolean).map((p, i) => ({
        ...p,
        when: timeAgo(followsRes.data[i]?.created_at),
      })),
      rooms: (msgsRes.data || []).filter(m => m.room).map(m => ({
        roomId: m.room.id,
        roomName: m.room.name,
        snippet: (m.content || '').slice(0, 60),
        when: timeAgo(m.created_at),
      })),
    })
  }, [user?.id])

  useEffect(() => {
    fetchRecent()
  }, [fetchRecent, location.pathname])

  // Auto-scroll history to bottom on new message
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, busy])

  const send = async (text) => {
    const q = (text ?? input).trim()
    if (!q || busy) return
    setInput('')
    const userTurn = { role: 'user', content: q }
    setMessages(prev => [...prev, userTurn])

    // 1. Try local cheap-path first
    const localAns = await tryLocalAnswer(q, user)
    if (localAns) {
      setMessages(prev => [...prev, { role: 'assistant', content: localAns, source: 'local' }])
      return
    }

    // 2. Daily quota gate
    if (dailyLimitReached(user.id)) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        source: 'system',
        content: "You've reached your daily AI limit. Upgrade to Premium for unlimited access.",
      }])
      return
    }

    // 3. Claude
    setBusy(true)
    try {
      const context = await buildContext({ user, roomId })
      const { text: reply } = await callClaude({
        user,
        message: q,
        context,
        conversation: [...messages, userTurn],
      })
      const newCount = incrementDailyCount(user.id)
      setCount(newCount)
      setMessages(prev => [...prev, { role: 'assistant', content: reply || 'No response.', source: 'claude' }])
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        source: 'error',
        content: `Couldn't reach the AI just now (${err.message}). Try again in a moment.`,
      }])
    } finally {
      setBusy(false)
    }
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <>
      <button
        className="chatpanel-mobile-toggle"
        onClick={() => setMobileOpen(true)}
        aria-label="Open Compound AI"
        title="Ask Compound"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <circle cx="9" cy="11" r="0.8" fill="currentColor" />
          <circle cx="13" cy="11" r="0.8" fill="currentColor" />
          <circle cx="17" cy="11" r="0.8" fill="currentColor" />
        </svg>
      </button>

      <aside className={`chatpanel ${mobileOpen ? 'mobile-open' : ''}`}>
        <button
          className="chatpanel-mobile-close"
          onClick={() => setMobileOpen(false)}
          aria-label="Close"
        >×</button>
      <div className="chatpanel-card chatbox">
        <div className="chatbox-head">
          <div className="chatbox-title">
            <span className="chatbox-dot" />
            Ask Compound
          </div>
          <div className="chatbox-quota" title="AI queries used today">
            {count}/{QUOTA_LIMIT}
          </div>
        </div>

        <div className="chatbox-history" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="chatbox-empty">
              {inRoom
                ? 'Ask anything about this room — summary, status, who’s involved, drafting a follow-up.'
                : 'Ask anything — summarize your rooms, draft a message, find companies, tune your feed.'}
            </div>
          ) : messages.map((m, i) => (
            <div key={i} className={`chatbox-msg ${m.role}`}>
              <div className={`chatbox-bubble ${m.source === 'local' ? 'local' : ''} ${m.source === 'error' ? 'error' : ''} ${m.source === 'system' ? 'system' : ''}`}>
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="chatbox-msg assistant">
              <div className="chatbox-bubble thinking">Thinking…</div>
            </div>
          )}
        </div>

        <div className="chatbox-input-row">
          <input
            type="text"
            placeholder="Ask Compound..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={busy}
          />
          <button onClick={() => send()} disabled={busy || !input.trim()} aria-label="Send">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>

        <div className="chatbox-suggestions">
          {suggestions.map(s => (
            <button key={s} className="chatbox-chip" onClick={() => setInput(s)}>{s}</button>
          ))}
        </div>
      </div>

      <div className="chatpanel-card">
        <h4 className="chatpanel-h4">Recent Activity</h4>
        {recent.followers.length === 0 && recent.rooms.length === 0 ? (
          <div className="chatpanel-empty">Nothing new yet.</div>
        ) : (
          <div className="chatpanel-activity-list">
            {recent.followers.map((f, i) => {
              const t = sectorTheme(f.sector)
              return (
                <div key={`f${i}`} className="chatpanel-activity-row" onClick={() => navigate(`/profile/${f.id}`)}>
                  <div className="chatpanel-activity-avatar" style={{ background: t.bg }}>{makeInitials(f.display_name)}</div>
                  <div className="chatpanel-activity-info">
                    <div className="chatpanel-activity-text"><strong>{f.display_name}</strong> followed you</div>
                    <div className="chatpanel-activity-time">{f.when}</div>
                  </div>
                </div>
              )
            })}
            {recent.rooms.map((r, i) => (
              <div key={`r${i}`} className="chatpanel-activity-row" onClick={() => navigate(`/rooms/${r.roomId}`)}>
                <div className="chatpanel-activity-avatar room-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                </div>
                <div className="chatpanel-activity-info">
                  <div className="chatpanel-activity-text"><strong>{r.roomName}</strong> · {r.snippet}{r.snippet.length === 60 ? '…' : ''}</div>
                  <div className="chatpanel-activity-time">{r.when}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="chatpanel-card chatpanel-cta">
        <h3>Start a Conversation Room</h3>
        <p>Spin up a focused space — invite partners and execute together.</p>
        <button onClick={() => navigate('/rooms', { state: { openCreate: true } })}>Create Room</button>
      </div>
    </aside>
    </>
  )
}

export default ChatPanel

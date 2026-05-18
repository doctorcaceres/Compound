import { useEffect, useRef, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import {
  tryLocalAnswer,
  buildContext,
  callClaude,
  getDailyCount,
  incrementDailyCount,
  dailyLimitReached,
  QUOTA_LIMIT,
} from './aiChat'
import { searchCompound, looksLikeEntityLookup } from './searchCompound'
import { sectorTheme, sectorLabel, makeInitials } from './format'
import { useSpeechToText } from './useSpeechToText'
import {
  looksLikeNewsfeedConfig,
  extractNewsfeedTopics,
  fetchAndStoreNewsfeed,
  NEWSFEED_REFRESH_EVENT,
  FOCUS_AI_INPUT_EVENT,
} from './newsfeedClient'
import Newsfeed from './Newsfeed'
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

function deriveTitle(text) {
  const t = (text || '').trim()
  if (!t) return 'New conversation'
  return t.length > 48 ? t.slice(0, 47) + '…' : t
}

function shortRelative(iso) {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ChatPanel({ user }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [count, setCount] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [conversations, setConversations] = useState([])
  const [activeConvoId, setActiveConvoId] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [interim, setInterim] = useState('')
  const scrollRef = useRef(null)
  const inputRef  = useRef(null)

  const { supported: speechSupported, listening, error: speechError, toggle: toggleMic } = useSpeechToText({
    onFinal: (text) => {
      setInput(prev => (prev ? prev.replace(/\s+$/, '') + ' ' : '') + text.trim())
      setInterim('')
    },
    onInterim: (text) => setInterim(text),
  })

  // Auto-close mobile overlay on navigation so the user actually lands on the
  // page they clicked through to instead of staying behind the panel.
  useEffect(() => {
    if (mobileOpen) setMobileOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const inRoom = isInRoom(location.pathname)
  const roomId = inRoom ? location.pathname.split('/')[2] : null
  const suggestions = inRoom ? ROOM_SUGGESTIONS : HOME_SUGGESTIONS

  // Initialize the local quota counter
  useEffect(() => {
    if (user?.id) setCount(getDailyCount(user.id))
  }, [user?.id])

  // Load past conversations for the sidebar list
  const fetchConversations = useCallback(async () => {
    if (!user?.id) return
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('id, title, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(20)
    if (error) {
      // Table may not exist yet (migration pending) — fail quiet.
      return
    }
    setConversations(data || [])
  }, [user?.id])

  useEffect(() => { fetchConversations() }, [fetchConversations])

  // Auto-scroll history to bottom on new message
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, busy])

  // Newsfeed footer ("Tell Ask Compound how to structure your newsfeed")
  // dispatches FOCUS_AI_INPUT_EVENT; bring the chatbox input into focus
  // and pop the mobile overlay if we're on a narrow viewport.
  useEffect(() => {
    const onFocus = () => {
      setMobileOpen(true)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
    }
    window.addEventListener(FOCUS_AI_INPUT_EVENT, onFocus)
    return () => window.removeEventListener(FOCUS_AI_INPUT_EVENT, onFocus)
  }, [])

  const startNewConversation = () => {
    if (busy) return
    setActiveConvoId(null)
    setMessages([])
    setHistoryOpen(false)
  }

  const openConversation = async (id) => {
    if (busy) return
    setHistoryOpen(false)
    if (id === activeConvoId) return
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('id, title, messages')
      .eq('id', id)
      .single()
    if (error || !data) return
    setActiveConvoId(data.id)
    setMessages(Array.isArray(data.messages) ? data.messages : [])
  }

  const persistConversation = async (allMessages, currentId) => {
    if (!user?.id) return currentId
    if (currentId) {
      const { error } = await supabase
        .from('ai_conversations')
        .update({ messages: allMessages })
        .eq('id', currentId)
      if (!error) {
        setConversations(prev => prev.map(c =>
          c.id === currentId ? { ...c, updated_at: new Date().toISOString() } : c
        ))
      }
      return currentId
    }
    // New conversation — title from first user message
    const firstUser = allMessages.find(m => m.role === 'user')
    const title = deriveTitle(firstUser?.content)
    const { data, error } = await supabase
      .from('ai_conversations')
      .insert({ user_id: user.id, title, messages: allMessages })
      .select('id, title, updated_at')
      .single()
    if (error || !data) return null
    setActiveConvoId(data.id)
    setConversations(prev => [{ ...data }, ...prev])
    return data.id
  }

  const send = async (text) => {
    const q = (text ?? input).trim()
    if (!q || busy) return
    setInput('')
    const userTurn = { role: 'user', content: q }
    let working = [...messages, userTurn]
    setMessages(working)

    // 1a. Newsfeed configuration intent. If the user is telling Ask
    // Compound what to put in their newsfeed, extract the topics, save
    // them to feed_preferences, kick off a fetch, and ack — skip the
    // normal Claude turn so we don't double-respond.
    if (looksLikeNewsfeedConfig(q)) {
      setBusy(true)
      try {
        const topics = await extractNewsfeedTopics(q)
        if (topics.length > 0) {
          const summary = topics.length === 1
            ? topics[0]
            : topics.slice(0, -1).join(', ') + ' and ' + topics.slice(-1)
          const ack = `Got it — I'll update your newsfeed to track ${summary}. Pulling fresh stories now.`
          const ackTurn = [...working, { role: 'assistant', content: ack, source: 'system' }]
          setMessages(ackTurn)
          await persistConversation(ackTurn, activeConvoId)
          // Fire & forget the fetch. The Newsfeed component listens
          // for the refresh event and re-reads stored items on its own.
          fetchAndStoreNewsfeed({ user, topics })
            .then(() => window.dispatchEvent(new CustomEvent(NEWSFEED_REFRESH_EVENT)))
            .catch(err => console.warn('newsfeed config: fetch failed', err.message))
          setBusy(false)
          return
        }
        // Topic extraction failed — fall through to the normal AI path
        // so the user still gets a response.
      } catch {
        // ditto — never block on the heuristic
      } finally {
        setBusy(false)
      }
    }

    // 1. Local cheap-path (count questions, etc.)
    const localAns = await tryLocalAnswer(q, user)
    if (localAns) {
      const next = [...working, { role: 'assistant', content: localAns, source: 'local' }]
      setMessages(next)
      await persistConversation(next, activeConvoId)
      return
    }

    // 2. Multi-table Compound search. Always run for short entity-lookup
    // queries; the AI also gets these as context regardless. If we get hits,
    // render a clickable results block above the AI's reply.
    let searchResults = null
    const isEntityLookup = looksLikeEntityLookup(q)
    if (isEntityLookup) {
      try {
        searchResults = await searchCompound(q)
      } catch { /* search failure shouldn't block the AI path */ }
      if (searchResults && searchResults.totalCount > 0) {
        working = [...working, { role: 'assistant', source: 'compound-results', results: searchResults, content: '' }]
        setMessages(working)
      }
    }

    // 3. Daily quota gate
    if (dailyLimitReached(user.id)) {
      const next = [...working, {
        role: 'assistant',
        source: 'system',
        content: "You've reached your daily AI limit. Upgrade to Premium for unlimited access.",
      }]
      setMessages(next)
      await persistConversation(next, activeConvoId)
      return
    }

    // 4. Claude (with web search enabled)
    setBusy(true)
    try {
      const context = await buildContext({ user, roomId })
      // Inject the search hits into the context so Claude can refer to
      // platform entities by name without hallucinating.
      if (searchResults && searchResults.totalCount > 0) {
        context.compound_search_hits = {
          query: q,
          people: searchResults.people.map(p => ({ id: p.id, name: p.display_name, headline: p.headline, sector: p.sector })),
          companies: searchResults.companies.map(c => ({ id: c.id, name: c.display_name, headline: c.headline, sector: c.sector, verified: !!c.is_verified })),
          rooms: searchResults.rooms.map(r => ({ id: r.id, name: r.name, sector: r.sector, status: r.status })),
          jobs: searchResults.jobs.map(j => ({ id: j.id, title: j.title, company: j.company?.display_name, location: j.location })),
          posts: searchResults.posts.map(p => ({ id: p.id, snippet: (p.content || '').slice(0, 120), author: p.author?.display_name })),
        }
      }
      const { text: reply, segments, citations } = await callClaude({
        user,
        message: q,
        context,
        conversation: working.filter(m => m.source !== 'compound-results'),
        enableWebSearch: true,
      })
      const newCount = incrementDailyCount(user.id)
      setCount(newCount)
      const next = [...working, {
        role: 'assistant',
        content: reply || 'No response.',
        source: 'claude',
        segments,
        citations,
      }]
      setMessages(next)
      await persistConversation(next, activeConvoId)
    } catch (err) {
      const next = [...working, {
        role: 'assistant',
        source: 'error',
        content: `Couldn't reach the AI just now (${err.message}). Try again in a moment.`,
      }]
      setMessages(next)
      await persistConversation(next, activeConvoId)
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

          <div className="chatbox-toolbar">
            <button className="chatbox-tool-btn" onClick={startNewConversation} title="Start a fresh conversation">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New
            </button>
            <button
              className={`chatbox-tool-btn ${historyOpen ? 'active' : ''}`}
              onClick={() => setHistoryOpen(o => !o)}
              title="Past conversations"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 3-6.7" /><polyline points="3 4 3 9 8 9" /><polyline points="12 7 12 12 16 14" />
              </svg>
              History
              {conversations.length > 0 && <span className="chatbox-tool-count">{conversations.length}</span>}
            </button>
          </div>

          {historyOpen && (
            <div className="chatbox-history-list">
              {conversations.length === 0 ? (
                <div className="chatbox-history-empty">No past conversations yet.</div>
              ) : (
                conversations.map(c => (
                  <button
                    key={c.id}
                    className={`chatbox-history-item ${c.id === activeConvoId ? 'active' : ''}`}
                    onClick={() => openConversation(c.id)}
                  >
                    <span className="chatbox-history-title">{c.title}</span>
                    <span className="chatbox-history-time">{shortRelative(c.updated_at)}</span>
                  </button>
                ))
              )}
            </div>
          )}

          <div className="chatbox-history" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="chatbox-empty">
                {inRoom
                  ? 'Ask anything about this room — summary, status, who’s involved, drafting a follow-up.'
                  : 'Search Compound, ask the AI, or look up the latest news. Try: “Yara”, “latest in fusion”, “summarize my rooms”.'}
              </div>
            ) : messages.map((m, i) => {
              if (m.source === 'compound-results') {
                return (
                  <div key={i} className="chatbox-msg assistant">
                    <CompoundResultsBlock results={m.results} navigate={navigate} />
                  </div>
                )
              }
              return (
                <div key={i} className={`chatbox-msg ${m.role}`}>
                  <div className={`chatbox-bubble ${m.source === 'local' ? 'local' : ''} ${m.source === 'error' ? 'error' : ''} ${m.source === 'system' ? 'system' : ''}`}>
                    {Array.isArray(m.segments) && m.segments.length > 0
                      ? m.segments.map((s, k) => s.url ? (
                          <a
                            key={k}
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={s.supRef ? 'chatbox-sup-ref' : 'chatbox-inline-link'}
                            title={s.title || s.url}
                          >{s.text}</a>
                        ) : (
                          <span key={k}>{s.text}</span>
                        ))
                      : m.content}
                  </div>
                  {Array.isArray(m.citations) && m.citations.length > 0 && (
                    <div className="chatbox-citations">
                      {m.citations.slice(0, 4).map((c, k) => (
                        <a key={k} href={c.url} target="_blank" rel="noopener noreferrer" className="chatbox-citation">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                          <span>{c.title}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {busy && (
              <div className="chatbox-msg assistant">
                <div className="chatbox-bubble thinking">Thinking…</div>
              </div>
            )}
          </div>

          <div className="chatbox-input-row">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search Compound, ask anything…"
              value={interim ? (input ? `${input} ${interim}` : interim) : input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              disabled={busy}
            />
            {speechSupported && (
              <button
                className={`chatbox-mic ${listening ? 'listening' : ''}`}
                onClick={toggleMic}
                disabled={busy}
                aria-label={listening ? 'Stop voice input' : 'Voice input'}
                title={listening ? 'Stop listening' : 'Voice input'}
                type="button"
              >
                {listening && <span className="mic-pulse" aria-hidden="true" />}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
            )}
            <button onClick={() => send()} disabled={busy || !input.trim()} aria-label="Send">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          {speechError && <div className="chatbox-mic-error">{speechError}</div>}

          <div className="chatbox-suggestions">
            {suggestions.map(s => (
              <button key={s} className="chatbox-chip" onClick={() => setInput(s)}>{s}</button>
            ))}
          </div>
        </div>

        <Newsfeed user={user} />
      </aside>
    </>
  )
}

function CompoundResultsBlock({ results, navigate }) {
  const sections = []
  if (results.people.length) sections.push({
    title: 'People',
    rows: results.people.map(p => ({
      key: `p-${p.id}`,
      avatar: makeInitials(p.display_name),
      bg: sectorTheme(p.sector).bg,
      name: p.display_name,
      sub: p.headline || sectorLabel(p.sector),
      go: () => navigate(`/profile/${p.id}`),
    })),
  })
  if (results.companies.length) sections.push({
    title: 'Companies',
    rows: results.companies.map(c => ({
      key: `c-${c.id}`,
      avatar: makeInitials(c.display_name),
      bg: sectorTheme(c.sector).bg,
      name: c.display_name,
      verified: !!(c.is_verified || c.domain),
      sub: c.headline || sectorLabel(c.sector),
      go: () => navigate(`/profile/${c.id}`),
    })),
  })
  if (results.rooms.length) sections.push({
    title: 'Rooms',
    rows: results.rooms.map(r => ({
      key: `r-${r.id}`,
      icon: 'room',
      iconColor: sectorTheme(r.sector).cardColor,
      name: r.name,
      sub: `${sectorLabel(r.sector)} · ${r.status}`,
      go: () => navigate(`/rooms/${r.id}`),
    })),
  })
  if (results.jobs.length) sections.push({
    title: 'Jobs',
    rows: results.jobs.map(j => ({
      key: `j-${j.id}`,
      icon: 'job',
      iconColor: sectorTheme(j.sector).cardColor,
      name: j.title,
      sub: `${j.company?.display_name || 'Unknown'}${j.location ? ` · ${j.location}` : ''}`,
      go: () => navigate(`/jobs/${j.id}`),
    })),
  })
  if (results.posts.length) sections.push({
    title: 'Posts',
    rows: results.posts.map(p => ({
      key: `o-${p.id}`,
      icon: 'post',
      name: (p.content || '').slice(0, 60) + ((p.content || '').length > 60 ? '…' : ''),
      sub: p.author?.display_name || 'Unknown',
      go: () => navigate(`/posts/${p.id}`),
    })),
  })

  return (
    <div className="chatbox-results">
      <div className="chatbox-results-head">Found in Compound</div>
      {sections.map(s => (
        <div key={s.title} className="chatbox-results-section">
          <div className="chatbox-results-section-title">{s.title}</div>
          {s.rows.map(r => (
            <button key={r.key} className="chatbox-results-row" onClick={r.go}>
              {r.avatar ? (
                <span className="chatbox-results-avatar" style={{ background: r.bg }}>{r.avatar}</span>
              ) : (
                <span className="chatbox-results-icon" style={{ color: r.iconColor || 'var(--text-muted)' }}>
                  {r.icon === 'room' && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                  )}
                  {r.icon === 'job' && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                  )}
                  {r.icon === 'post' && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                  )}
                </span>
              )}
              <span className="chatbox-results-text">
                <span className="chatbox-results-name">
                  {r.name}
                  {r.verified && (
                    <span className="chatbox-results-verified" title="Verified">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                    </span>
                  )}
                </span>
                <span className="chatbox-results-sub">{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

export default ChatPanel

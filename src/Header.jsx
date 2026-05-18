import { useEffect, useRef, useState, useCallback } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { makeInitials, sectorTheme, sectorLabel } from './format'
import { switchToLinkedAccount, LINKED_ACCOUNTS_CHANGED } from './linkedAccounts'
import { searchCompound } from './searchCompound'
import './Header.css'

// Flatten the per-table results into a single ranked list. Each row gets a
// score based on how well the searched query matches its primary text field
// (display_name / room name / job title / post content). Exact match > prefix
// match > substring match. After sorting we slice to `max` items.
function rankAndFlatten(results, query, max = 7) {
  if (!results) return []
  const q = String(query || '').toLowerCase().trim()
  const score = (s) => {
    if (!s) return 0
    const t = String(s).toLowerCase()
    if (t === q) return 100
    if (t.startsWith(q)) return 70
    if (t.includes(q)) return 40
    return 10
  }
  const items = []
  for (const p of (results.people || [])) items.push({
    type: 'person', key: `p-${p.id}`,
    name: p.display_name,
    sub: p.headline || sectorLabel(p.sector),
    nav: `/profile/${p.id}`, sector: p.sector,
    score: score(p.display_name),
  })
  for (const c of (results.companies || [])) items.push({
    type: 'company', key: `c-${c.id}`,
    name: c.display_name,
    sub: c.headline || sectorLabel(c.sector),
    nav: `/profile/${c.id}`, sector: c.sector,
    verified: !!(c.domain || c.is_verified),
    score: score(c.display_name),
  })
  for (const room of (results.rooms || [])) items.push({
    type: 'room', key: `r-${room.id}`,
    name: room.name,
    sub: `${sectorLabel(room.sector)} · ${room.status}`,
    nav: `/rooms/${room.id}`, sector: room.sector,
    score: score(room.name),
  })
  for (const j of (results.jobs || [])) items.push({
    type: 'job', key: `j-${j.id}`,
    name: j.title,
    sub: `${j.company?.display_name || 'Unknown'}${j.location ? ` · ${j.location}` : ''}`,
    nav: `/jobs/${j.id}`, sector: j.sector,
    score: score(j.title),
  })
  for (const p of (results.posts || [])) {
    const snippet = (p.content || '').slice(0, 70) + ((p.content || '').length > 70 ? '…' : '')
    items.push({
      type: 'post', key: `o-${p.id}`,
      name: snippet,
      sub: p.author?.display_name || 'Unknown author',
      nav: `/posts/${p.id}`, sector: p.sector,
      score: score(p.content),
    })
  }
  return items.sort((a, b) => b.score - a.score).slice(0, max)
}

function Header({ user }) {
  const navigate = useNavigate()

  // Search
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef(null)

  const [linked, setLinked] = useState([])
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const switcherRef = useRef(null)

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // ----- Debounced multi-table search (300 ms) -----
  useEffect(() => {
    const safe = String(query || '').trim()
    if (safe.length < 2) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const r = await searchCompound(safe, { perTable: 3 })
        setResults(r)
      } catch (e) {
        console.warn('search failed:', e.message)
        setResults({ people: [], companies: [], rooms: [], jobs: [], posts: [], totalCount: 0 })
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  // Close dropdown on outside click / Escape
  useEffect(() => {
    if (!searchOpen) return
    const onDocClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setSearchOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [searchOpen])

  const closeSearchAndNavigate = (path) => {
    setSearchOpen(false)
    setQuery('')
    setResults(null)
    navigate(path)
  }

  const openGoogle = () => {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const topResults = rankAndFlatten(results, query, 7)
  const dropdownVisible = searchOpen && String(query || '').trim().length >= 2

  const navItems = [
    { to: '/', label: 'Feed', end: true },
    { to: '/network', label: 'Network' },
    { to: '/jobs', label: 'Jobs' },
    { to: '/rooms', label: 'Conversation Rooms' },
    { to: '/schedule', label: 'Schedule' },
    { to: '/messages', label: 'Messages' },
  ]

  // ----- Linked accounts -----
  const fetchLinked = useCallback(async () => {
    const { data: links } = await supabase
      .from('linked_accounts')
      .select('linked_user_id')
    if (!links || links.length === 0) {
      setLinked([])
      return
    }
    const ids = links.map(l => l.linked_user_id)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, account_type, sector')
      .in('id', ids)
    setLinked(profiles || [])
  }, [])

  useEffect(() => {
    fetchLinked()
    const onChange = () => fetchLinked()
    window.addEventListener(LINKED_ACCOUNTS_CHANGED, onChange)
    return () => window.removeEventListener(LINKED_ACCOUNTS_CHANGED, onChange)
  }, [user.id, fetchLinked])

  useEffect(() => {
    if (!switcherOpen) return
    const onDocClick = (e) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) setSwitcherOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [switcherOpen])

  const onSwitch = async (targetId) => {
    if (switching) return
    setSwitching(true)
    setSwitcherOpen(false)
    const res = await switchToLinkedAccount(user.id, targetId)
    setSwitching(false)
    if (!res.ok) {
      if (res.reason === 'not-on-this-device') {
        alert('This account isn’t available on this device. Re-link from Settings to switch here.')
      } else if (res.reason === 'expired') {
        alert('That session has expired. Re-link from Settings to switch.')
      } else {
        alert('Could not switch accounts.')
      }
      return
    }
    navigate('/')
  }

  return (
    <nav className="topnav">
      <Link to="/" className="logo" style={{ cursor: 'pointer' }}>
        <span className="logo-c">C</span>ompound
        <div className="logo-bar" />
      </Link>

      <button
        className={`hamburger-btn ${mobileMenuOpen ? 'open' : ''}`}
        onClick={() => setMobileMenuOpen(o => !o)}
        aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
      >
        <span /><span /><span />
      </button>

      <div className="nav-links">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      <div className="nav-right">
        <div className="search-bar" ref={searchRef}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search Compound..."
            value={query}
            onChange={e => { setQuery(e.target.value); setSearchOpen(true) }}
            onFocus={() => setSearchOpen(true)}
          />
          {query && (
            <button
              className="search-clear"
              onClick={() => { setQuery(''); setResults(null); setSearchOpen(false) }}
              aria-label="Clear search"
            >×</button>
          )}

          {dropdownVisible && (
            <div className="search-dropdown">
              {searching && !results && (
                <div className="search-loading">Searching…</div>
              )}

              {results && topResults.length === 0 && !searching && (
                <div className="search-empty">
                  No results found. Try a different search or continue on Google.
                </div>
              )}

              {topResults.map(r => (
                <button
                  key={r.key}
                  className="search-row"
                  onClick={() => closeSearchAndNavigate(r.nav)}
                >
                  {(r.type === 'person' || r.type === 'company') ? (
                    <div className="search-row-avatar" style={{ background: sectorTheme(r.sector).bg }}>
                      {makeInitials(r.name)}
                    </div>
                  ) : (
                    <div className="search-row-icon" style={{ color: sectorTheme(r.sector).cardColor }}>
                      {r.type === 'room' && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                        </svg>
                      )}
                      {r.type === 'job' && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                        </svg>
                      )}
                      {r.type === 'post' && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      )}
                    </div>
                  )}
                  <div className="search-row-text">
                    <div className="search-row-title">
                      {r.name}
                      {r.verified && (
                        <span className="search-row-verified" title="Verified">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                        </span>
                      )}
                    </div>
                    <div className="search-row-subtitle">{r.sub}</div>
                  </div>
                </button>
              ))}

              {!searching && (
                <button className="search-google" onClick={openGoogle}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13a6 6 0 0 1-6 6H7l-4 4V7a6 6 0 0 1 6-6h0" />
                    <line x1="14" y1="9" x2="22" y2="1" /><polyline points="22 1 22 7 16 7" />
                  </svg>
                  Continue on Google for &ldquo;{query}&rdquo;
                </button>
              )}
            </div>
          )}
        </div>

        {linked.length > 0 && (
          <div className="account-switcher" ref={switcherRef}>
            <button
              className="account-switcher-btn"
              onClick={() => setSwitcherOpen(s => !s)}
              title="Switch account"
              disabled={switching}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
              Switch
            </button>
            {switcherOpen && (
              <div className="account-switcher-menu">
                <div className="account-switcher-current-label">Currently signed in</div>
                <div className="account-switcher-row active">
                  <div className="account-switcher-avatar" style={{ background: sectorTheme(user.sector).bg }}>
                    {makeInitials(user.name)}
                  </div>
                  <div className="account-switcher-info">
                    <div className="account-switcher-name">{user.name}</div>
                    <div className="account-switcher-type">{user.accountType === 'company' ? 'Company' : 'Individual'}</div>
                  </div>
                </div>
                <div className="account-switcher-divider" />
                <div className="account-switcher-others-label">Linked accounts</div>
                {linked.map(p => (
                  <button
                    key={p.id}
                    className="account-switcher-row clickable"
                    onClick={() => onSwitch(p.id)}
                  >
                    <div className="account-switcher-avatar" style={{ background: sectorTheme(p.sector).bg }}>
                      {makeInitials(p.display_name)}
                    </div>
                    <div className="account-switcher-info">
                      <div className="account-switcher-name">{p.display_name}</div>
                      <div className="account-switcher-type">{p.account_type === 'company' ? 'Company' : 'Individual'}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <Link to="/profile" className="avatar" title="View profile">
          {user.avatar_url
            ? <img src={user.avatar_url} alt="" className="avatar-img" />
            : user.initials}
        </Link>
        <Link to="/settings" className="settings-link" title="Settings" aria-label="Settings">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
        <button className="signout-btn" onClick={() => supabase.auth.signOut()} title="Sign out">Sign out</button>
      </div>

      {/* Mobile drawer — hidden by default; CSS shows it below 768px when .open */}
      <div className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(false)}>
        <div className="mobile-menu-panel" onClick={e => e.stopPropagation()}>
          <nav className="mobile-menu-nav">
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `mobile-menu-link ${isActive ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
            <div className="mobile-menu-divider" />
            <Link to="/profile" className="mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>Your profile</Link>
            <Link to="/settings" className="mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>Settings</Link>
            {linked.length > 0 && (
              <>
                <div className="mobile-menu-section-label">Switch account</div>
                {linked.map(p => (
                  <button
                    key={p.id}
                    className="mobile-menu-link"
                    onClick={() => { setMobileMenuOpen(false); onSwitch(p.id) }}
                  >
                    {p.display_name} <span className="mobile-menu-meta">({p.account_type === 'company' ? 'Company' : 'Individual'})</span>
                  </button>
                ))}
              </>
            )}
            <button
              className="mobile-menu-link mobile-menu-signout"
              onClick={() => { setMobileMenuOpen(false); supabase.auth.signOut() }}
            >
              Sign out
            </button>
          </nav>
        </div>
      </div>
    </nav>
  )
}

export default Header

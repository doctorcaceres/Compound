import { useEffect, useRef, useState, useCallback } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { makeInitials, sectorTheme } from './format'
import { switchToLinkedAccount, LINKED_ACCOUNTS_CHANGED } from './linkedAccounts'
import './Header.css'

function Header({ user }) {
  const navigate = useNavigate()

  const [linked, setLinked] = useState([])
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const switcherRef = useRef(null)

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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

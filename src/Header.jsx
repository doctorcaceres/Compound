import { useState } from 'react'
import './Header.css'

function Header({ user, activePage, onNavigate, onOpenProfile }) {
  const [searchQuery, setSearchQuery] = useState('')

  const navItems = [
    { key: 'feed', label: 'Feed' },
    { key: 'network', label: 'Network' },
    { key: 'dealrooms', label: 'Deal Rooms' },
    { key: 'messaging', label: 'Messages' },
  ]

  return (
    <nav className="topnav">
      <div className="logo" onClick={() => onNavigate('feed')} style={{ cursor: 'pointer' }}>
        <span className="logo-c">C</span>ompound
        <div className="logo-bar" />
      </div>

      <div className="nav-links">
        {navItems.map(item => (
          <button
            key={item.key}
            className={activePage === item.key ? 'active' : ''}
            onClick={() => onNavigate(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="nav-right">
        <div className="search-bar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5A6478" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search companies, people, sectors..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="avatar" onClick={onOpenProfile} title="View profile">{user.initials}</div>
      </div>
    </nav>
  )
}

export default Header

import { useState } from 'react'
import './Network.css'

const PEOPLE = [
  { id: 1, name: 'Elena Voss', initials: 'EV', role: 'Head of Energy Transition', company: 'Shell plc', sector: 'Energy & Power', bg: 'var(--navy)', mutual: 12, connected: false },
  { id: 2, name: 'James Chen', initials: 'JC', role: 'VP Infrastructure Development', company: 'Bechtel Group', sector: 'Infrastructure', bg: 'var(--green-dim)', mutual: 8, connected: false },
  { id: 3, name: 'Sarah Al-Rashid', initials: 'SA', role: 'Chief Commercial Officer', company: 'DP World', sector: 'Maritime & Logistics', bg: 'var(--navy-light)', mutual: 15, connected: false },
  { id: 4, name: 'Marcus Lindberg', initials: 'ML', role: 'Director of Green Steel', company: 'SSAB', sector: 'Manufacturing', bg: '#2F3D25', mutual: 6, connected: false },
  { id: 5, name: 'Priya Mehta', initials: 'PM', role: 'Managing Director', company: 'BlackRock Infrastructure', sector: 'Industrial Finance', bg: 'var(--navy)', mutual: 22, connected: false },
  { id: 6, name: 'Anders Kjaer', initials: 'AK', role: 'CTO Offshore Wind', company: 'Orsted', sector: 'Energy & Power', bg: 'var(--green-dim)', mutual: 18, connected: false },
  { id: 7, name: 'Thomas Mueller', initials: 'TM', role: 'Hydrogen Strategy Lead', company: 'Siemens Energy', sector: 'Climate Tech', bg: 'var(--navy-light)', mutual: 9, connected: false },
  { id: 8, name: 'Liu Wei', initials: 'LW', role: 'Global Mining Operations', company: 'Rio Tinto', sector: 'Mining & Resources', bg: '#2F3D25', mutual: 11, connected: false },
  { id: 9, name: 'Rachel Okonkwo', initials: 'RO', role: 'Defense Systems Director', company: 'BAE Systems', sector: 'Defense & Aerospace', bg: 'var(--navy)', mutual: 5, connected: false },
  { id: 10, name: 'David Park', initials: 'DP', role: 'Industrial IoT Lead', company: 'Honeywell', sector: 'Technology', bg: 'var(--green-dim)', mutual: 14, connected: false },
  { id: 11, name: 'Ingrid Solheim', initials: 'IS', role: 'Portfolio Manager', company: 'Norges Bank', sector: 'Industrial Finance', bg: 'var(--navy-light)', mutual: 7, connected: false },
  { id: 12, name: 'Carlos Rivera', initials: 'CR', role: 'VP Supply Chain', company: 'Vale S.A.', sector: 'Mining & Resources', bg: '#2F3D25', mutual: 10, connected: false },
]

const SECTORS = ['All', 'Energy & Power', 'Infrastructure', 'Maritime & Logistics', 'Manufacturing', 'Climate Tech', 'Mining & Resources', 'Industrial Finance', 'Defense & Aerospace', 'Technology']

function Network({ user, onOpenProfile }) {
  const [people, setPeople] = useState(PEOPLE)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSector, setActiveSector] = useState('All')

  const toggleConnect = (id) => {
    setPeople(people.map(p =>
      p.id === id ? { ...p, connected: !p.connected } : p
    ))
  }

  const filtered = people.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.role.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesSector = activeSector === 'All' || p.sector === activeSector
    return matchesSearch && matchesSector
  })

  const connections = people.filter(p => p.connected)

  return (
    <div className="network-page">
      <div className="network-main">
        <div className="network-header">
          <div>
            <h2>Your Network</h2>
            <p className="network-subtitle">{connections.length} connections &middot; {people.length} suggested professionals</p>
          </div>
          <div className="network-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5A6478" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              placeholder="Search people, companies, roles..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="sector-filters">
          {SECTORS.map(s => (
            <button
              key={s}
              className={`sector-chip ${activeSector === s ? 'active' : ''}`}
              onClick={() => setActiveSector(s)}
            >
              {s}
            </button>
          ))}
        </div>

        {connections.length > 0 && (
          <div className="network-section">
            <h3 className="section-label">Your Connections</h3>
            <div className="people-grid">
              {connections.map(p => (
                <div key={p.id} className="person-card connected">
                  <div className="person-avatar" style={{ background: p.bg }}>{p.initials}</div>
                  <div className="person-name">{p.name}</div>
                  <div className="person-role">{p.role}</div>
                  <div className="person-company">{p.company}</div>
                  <div className="person-sector-tag">{p.sector}</div>
                  <div className="person-actions">
                    <button className="btn-message">Message</button>
                    <button className="btn-connected" onClick={() => toggleConnect(p.id)}>Connected</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="network-section">
          <h3 className="section-label">Suggested for You</h3>
          <div className="people-grid">
            {filtered.filter(p => !p.connected).map(p => (
              <div key={p.id} className="person-card">
                <div className="person-avatar" style={{ background: p.bg }}>{p.initials}</div>
                <div className="person-name" onClick={() => onOpenProfile(p)} style={{ cursor: 'pointer' }}>{p.name}</div>
                <div className="person-role">{p.role}</div>
                <div className="person-company">{p.company}</div>
                <div className="person-sector-tag">{p.sector}</div>
                <div className="person-mutual">{p.mutual} mutual connections</div>
                <div className="person-actions">
                  <button className="btn-connect" onClick={() => toggleConnect(p.id)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Connect
                  </button>
                  <button className="btn-view" onClick={() => onOpenProfile(p)}>View</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside className="network-sidebar">
        <div className="net-widget">
          <h4>Your Network Stats</h4>
          <div className="net-stat-grid">
            <div className="net-stat">
              <div className="net-stat-num">{connections.length}</div>
              <div className="net-stat-label">Connections</div>
            </div>
            <div className="net-stat">
              <div className="net-stat-num">3</div>
              <div className="net-stat-label">Pending</div>
            </div>
            <div className="net-stat">
              <div className="net-stat-num">847</div>
              <div className="net-stat-label">Profile Views</div>
            </div>
            <div className="net-stat">
              <div className="net-stat-num">12</div>
              <div className="net-stat-label">Sector Rank</div>
            </div>
          </div>
        </div>

        <div className="net-widget">
          <h4>Trending in Your Sector</h4>
          <div className="trending-item">
            <div className="trending-topic">Floating Offshore Wind</div>
            <div className="trending-count">284 discussions</div>
          </div>
          <div className="trending-item">
            <div className="trending-topic">Green Hydrogen</div>
            <div className="trending-count">192 discussions</div>
          </div>
          <div className="trending-item">
            <div className="trending-topic">Carbon Capture</div>
            <div className="trending-count">156 discussions</div>
          </div>
          <div className="trending-item">
            <div className="trending-topic">Critical Minerals</div>
            <div className="trending-count">128 discussions</div>
          </div>
        </div>

        <div className="net-widget">
          <h4>Upcoming Events</h4>
          <div className="event-item">
            <div className="event-date">
              <span className="event-month">APR</span>
              <span className="event-day">12</span>
            </div>
            <div>
              <div className="event-name">Energy Transition Summit</div>
              <div className="event-loc">London, UK</div>
            </div>
          </div>
          <div className="event-item">
            <div className="event-date">
              <span className="event-month">APR</span>
              <span className="event-day">28</span>
            </div>
            <div>
              <div className="event-name">Industrial Decarbonization Forum</div>
              <div className="event-loc">Hamburg, DE</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

export default Network

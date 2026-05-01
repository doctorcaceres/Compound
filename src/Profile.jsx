import { useState } from 'react'
import './Profile.css'

const SAMPLE_ACTIVITY = [
  { type: 'post', text: 'Shared an update about floating offshore wind project in the North Sea.', time: '4 hours ago', likes: 12, comments: 3 },
  { type: 'deal', text: 'Created deal room: North Sea Floating Wind — 500MW', time: '1 day ago' },
  { type: 'connection', text: 'Connected with Elena Voss, Head of Energy Transition at Shell plc', time: '2 days ago' },
  { type: 'post', text: 'Published insights on green hydrogen cost parity timeline for European markets.', time: '3 days ago', likes: 34, comments: 8 },
  { type: 'deal', text: 'Joined deal room: Green Steel Supply Agreement — SSAB', time: '5 days ago' },
  { type: 'connection', text: 'Connected with James Chen, VP Infrastructure Development at Bechtel Group', time: '1 week ago' },
]

function Profile({ user, target, onNavigate }) {
  const [activeTab, setActiveTab] = useState('activity')
  const [isEditing, setIsEditing] = useState(false)

  const isOwnProfile = !target
  const profile = target || {
    name: user.name,
    initials: user.initials,
    role: user.sector ? user.sector.charAt(0).toUpperCase() + user.sector.slice(1) : 'Professional',
    company: user.accountType === 'company' ? user.name : 'Independent',
    sector: (user.sector || 'general').toUpperCase(),
    bg: 'var(--navy)',
    mutual: 0,
    connected: false,
  }

  const [editData, setEditData] = useState({
    headline: isOwnProfile ? 'Senior Director, Strategic Partnerships' : (profile.role || ''),
    location: 'London, United Kingdom',
    bio: 'Experienced professional focused on strategic partnerships and deal execution across energy, infrastructure, and industrial sectors. Passionate about advancing the energy transition through cross-sector collaboration.',
    website: 'compound.io',
  })

  const stats = {
    connections: 142,
    posts: 28,
    dealRooms: 4,
    profileViews: 847,
  }

  return (
    <div className="profile-page">
      <div className="profile-main">
        {/* Cover & Header */}
        <div className="profile-cover">
          <div className="profile-cover-gradient" />
        </div>
        <div className="profile-header-card">
          <div className="profile-header-top">
            <div className="profile-big-avatar" style={{ background: profile.bg || 'var(--navy)' }}>
              {profile.initials}
            </div>
            <div className="profile-header-info">
              <h1>{profile.name}</h1>
              <div className="profile-headline">{isEditing ? (
                <input
                  className="profile-edit-input"
                  value={editData.headline}
                  onChange={e => setEditData({ ...editData, headline: e.target.value })}
                />
              ) : (
                editData.headline
              )}</div>
              <div className="profile-location">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                {isEditing ? (
                  <input
                    className="profile-edit-input sm"
                    value={editData.location}
                    onChange={e => setEditData({ ...editData, location: e.target.value })}
                  />
                ) : editData.location}
              </div>
              <div className="profile-sector-badge">{profile.sector || (user.sector || 'general').toUpperCase()}</div>
            </div>
            <div className="profile-header-actions">
              {isOwnProfile ? (
                <button className="profile-edit-btn" onClick={() => setIsEditing(!isEditing)}>
                  {isEditing ? 'Save' : 'Edit Profile'}
                </button>
              ) : (
                <>
                  <button className="profile-connect-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Connect
                  </button>
                  <button className="profile-msg-btn">Message</button>
                </>
              )}
            </div>
          </div>

          <div className="profile-stats-row">
            <div className="profile-stat-item">
              <span className="profile-stat-num">{stats.connections}</span>
              <span className="profile-stat-label">Connections</span>
            </div>
            <div className="profile-stat-item">
              <span className="profile-stat-num">{stats.posts}</span>
              <span className="profile-stat-label">Posts</span>
            </div>
            <div className="profile-stat-item">
              <span className="profile-stat-num">{stats.dealRooms}</span>
              <span className="profile-stat-label">Deal Rooms</span>
            </div>
            <div className="profile-stat-item">
              <span className="profile-stat-num">{stats.profileViews}</span>
              <span className="profile-stat-label">Profile Views</span>
            </div>
          </div>
        </div>

        {/* Bio Section */}
        <div className="profile-section">
          <h3>About</h3>
          {isEditing ? (
            <textarea
              className="profile-edit-textarea"
              value={editData.bio}
              onChange={e => setEditData({ ...editData, bio: e.target.value })}
            />
          ) : (
            <p className="profile-bio">{editData.bio}</p>
          )}
        </div>

        {/* Tabs */}
        <div className="profile-tabs">
          {['activity', 'posts', 'deal rooms'].map(tab => (
            <button
              key={tab}
              className={`profile-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="profile-tab-content">
          {(activeTab === 'activity' || activeTab === 'posts') && (
            SAMPLE_ACTIVITY
              .filter(a => activeTab === 'activity' || a.type === 'post')
              .map((a, i) => (
                <div key={i} className="profile-activity-item">
                  <div className={`profile-activity-icon ${a.type}`}>
                    {a.type === 'post' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>}
                    {a.type === 'deal' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>}
                    {a.type === 'connection' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>}
                  </div>
                  <div className="profile-activity-content">
                    <div className="profile-activity-text">{a.text}</div>
                    <div className="profile-activity-meta">
                      <span>{a.time}</span>
                      {a.likes !== undefined && <span>&middot; {a.likes} likes &middot; {a.comments} comments</span>}
                    </div>
                  </div>
                </div>
              ))
          )}
          {activeTab === 'deal rooms' && (
            <div className="profile-dealrooms">
              <div className="profile-dr-item" onClick={() => onNavigate('dealrooms')}>
                <div className="profile-dr-sector" style={{ color: 'var(--green)' }}>ENERGY</div>
                <div className="profile-dr-name">North Sea Floating Wind — 500MW</div>
                <div className="profile-dr-detail">$1.2B &middot; Due Diligence &middot; 3 participants</div>
              </div>
              <div className="profile-dr-item" onClick={() => onNavigate('dealrooms')}>
                <div className="profile-dr-sector" style={{ color: 'var(--amber)' }}>MANUFACTURING</div>
                <div className="profile-dr-name">Green Steel Supply Agreement — SSAB</div>
                <div className="profile-dr-detail">$340M &middot; Negotiation &middot; 2 participants</div>
              </div>
              <div className="profile-dr-item" onClick={() => onNavigate('dealrooms')}>
                <div className="profile-dr-sector" style={{ color: 'var(--green)' }}>ENERGY</div>
                <div className="profile-dr-name">Mozambique LNG Terminal — Phase 2</div>
                <div className="profile-dr-detail">$2.1B &middot; LOI &middot; 2 participants</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <aside className="profile-sidebar">
        <div className="profile-widget">
          <h4>Contact Information</h4>
          <div className="profile-contact-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
            <span>{user.email}</span>
          </div>
          <div className="profile-contact-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
            <span>{editData.website}</span>
          </div>
        </div>

        <div className="profile-widget">
          <h4>Expertise</h4>
          <div className="profile-tags">
            <span className="profile-tag">Energy Transition</span>
            <span className="profile-tag">Offshore Wind</span>
            <span className="profile-tag">Strategic Partnerships</span>
            <span className="profile-tag">Green Hydrogen</span>
            <span className="profile-tag">Project Finance</span>
            <span className="profile-tag">Due Diligence</span>
          </div>
        </div>

        <div className="profile-widget">
          <h4>Similar Professionals</h4>
          <div className="profile-similar">
            <div className="profile-similar-item">
              <div className="profile-similar-avatar">EV</div>
              <div>
                <div className="profile-similar-name">Elena Voss</div>
                <div className="profile-similar-role">Head of Energy Transition, Shell</div>
              </div>
            </div>
            <div className="profile-similar-item">
              <div className="profile-similar-avatar">AK</div>
              <div>
                <div className="profile-similar-name">Anders Kjaer</div>
                <div className="profile-similar-role">CTO Offshore Wind, Orsted</div>
              </div>
            </div>
            <div className="profile-similar-item">
              <div className="profile-similar-avatar">PM</div>
              <div>
                <div className="profile-similar-name">Priya Mehta</div>
                <div className="profile-similar-role">MD, BlackRock Infrastructure</div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

export default Profile

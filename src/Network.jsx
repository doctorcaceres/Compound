import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { makeInitials, sectorTheme, SECTORS as SECTOR_DEFS, sectorLabel } from './format'
import './Network.css'

const SECTOR_FILTER_OPTIONS = ['All', ...SECTOR_DEFS.map(s => s.label)]

function adaptProfile(p) {
  return {
    id: p.id,
    name: p.display_name,
    initials: makeInitials(p.display_name),
    role: p.headline || (p.account_type === 'company' ? 'Organization' : 'Professional'),
    company: p.account_type === 'company' ? p.display_name : '',
    sector: sectorLabel(p.sector),
    bg: sectorTheme(p.sector).bg,
  }
}

function Network({ user }) {
  const navigate = useNavigate()
  const [people, setPeople] = useState([])
  const [followingIds, setFollowingIds] = useState(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSector, setActiveSector] = useState('All')
  const [loading, setLoading] = useState(true)

  const openProfile = (p) => navigate(`/profile/${p.id}`)

  const fetchAll = async () => {
    const [{ data: profilesData, error: profilesErr }, { data: followsData, error: followsErr }] = await Promise.all([
      supabase.from('profiles').select('id, display_name, account_type, sector, headline, avatar_url').neq('id', user.id),
      supabase.from('follows').select('followed_id').eq('follower_id', user.id),
    ])
    if (profilesErr) console.warn('Profiles fetch failed:', profilesErr.message)
    if (followsErr) console.warn('Follows fetch failed:', followsErr.message)
    setPeople((profilesData || []).map(adaptProfile))
    setFollowingIds(new Set((followsData || []).map(f => f.followed_id)))
  }

  useEffect(() => {
    fetchAll().finally(() => setLoading(false))
  }, [user.id])

  const toggleConnect = async (profileId) => {
    const isFollowing = followingIds.has(profileId)
    // Optimistic update
    const next = new Set(followingIds)
    if (isFollowing) next.delete(profileId); else next.add(profileId)
    setFollowingIds(next)

    if (isFollowing) {
      const { error } = await supabase.from('follows').delete()
        .eq('follower_id', user.id).eq('followed_id', profileId)
      if (error) { console.warn('Unfollow failed:', error.message); fetchAll() }
    } else {
      const { error } = await supabase.from('follows').insert({ follower_id: user.id, followed_id: profileId })
      if (error) { console.warn('Follow failed:', error.message); fetchAll() }
    }
  }

  const filtered = people.filter(p => {
    const q = searchQuery.toLowerCase()
    const matchesSearch = !q || p.name.toLowerCase().includes(q) ||
      (p.company || '').toLowerCase().includes(q) ||
      (p.role || '').toLowerCase().includes(q)
    const matchesSector = activeSector === 'All' || p.sector === activeSector
    return matchesSearch && matchesSector
  })

  const connections = people.filter(p => followingIds.has(p.id))
  const suggested = filtered.filter(p => !followingIds.has(p.id))

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
          {SECTOR_FILTER_OPTIONS.map(s => (
            <button
              key={s}
              className={`sector-chip ${activeSector === s ? 'active' : ''}`}
              onClick={() => setActiveSector(s)}
            >
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="network-empty">Loading professionals…</div>
        ) : (
          <>
            {connections.length > 0 && (
              <div className="network-section">
                <h3 className="section-label">Your Connections</h3>
                <div className="people-grid">
                  {connections.map(p => (
                    <div key={p.id} className="person-card connected">
                      <div className="person-avatar" style={{ background: p.bg }}>{p.initials}</div>
                      <div className="person-name" onClick={() => openProfile(p)} style={{ cursor: 'pointer' }}>{p.name}</div>
                      <div className="person-role">{p.role}</div>
                      {p.company && <div className="person-company">{p.company}</div>}
                      <div className="person-sector-tag">{p.sector}</div>
                      <div className="person-actions">
                        <button className="btn-message" onClick={() => navigate(`/messages/${p.id}`)}>Message</button>
                        <button className="btn-connected" onClick={() => toggleConnect(p.id)}>Connected</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="network-section">
              <h3 className="section-label">Suggested for You</h3>
              {suggested.length === 0 ? (
                <div className="network-empty">No professionals match your filters yet.</div>
              ) : (
                <div className="people-grid">
                  {suggested.map(p => (
                    <div key={p.id} className="person-card">
                      <div className="person-avatar" style={{ background: p.bg }}>{p.initials}</div>
                      <div className="person-name" onClick={() => openProfile(p)} style={{ cursor: 'pointer' }}>{p.name}</div>
                      <div className="person-role">{p.role}</div>
                      {p.company && <div className="person-company">{p.company}</div>}
                      <div className="person-sector-tag">{p.sector}</div>
                      <div className="person-actions">
                        <button className="btn-connect" onClick={() => toggleConnect(p.id)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                          Connect
                        </button>
                        <button className="btn-view" onClick={() => openProfile(p)}>View</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
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
              <div className="net-stat-num">0</div>
              <div className="net-stat-label">Pending</div>
            </div>
            <div className="net-stat">
              <div className="net-stat-num">{people.length}</div>
              <div className="net-stat-label">Suggested</div>
            </div>
            <div className="net-stat">
              <div className="net-stat-num">—</div>
              <div className="net-stat-label">Sector Rank</div>
            </div>
          </div>
        </div>

        <div className="net-widget">
          <h4>Trending Across Sectors</h4>
          <div className="trending-item">
            <div className="trending-topic">AI Regulation</div>
            <div className="trending-count">412 discussions</div>
          </div>
          <div className="trending-item">
            <div className="trending-topic">Health-IT Modernization</div>
            <div className="trending-count">238 discussions</div>
          </div>
          <div className="trending-item">
            <div className="trending-topic">Mixed-Use Real Estate</div>
            <div className="trending-count">174 discussions</div>
          </div>
          <div className="trending-item">
            <div className="trending-topic">Sustainable Agriculture</div>
            <div className="trending-count">131 discussions</div>
          </div>
        </div>

        <div className="net-widget">
          <h4>Upcoming Events</h4>
          <div className="event-item">
            <div className="event-date">
              <span className="event-month">MAY</span>
              <span className="event-day">14</span>
            </div>
            <div>
              <div className="event-name">Cross-Sector Innovation Summit</div>
              <div className="event-loc">Chicago, IL</div>
            </div>
          </div>
          <div className="event-item">
            <div className="event-date">
              <span className="event-month">MAY</span>
              <span className="event-day">22</span>
            </div>
            <div>
              <div className="event-name">B2B SaaS &amp; Fintech Forum</div>
              <div className="event-loc">San Francisco, CA</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

export default Network

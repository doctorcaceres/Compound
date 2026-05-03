import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { makeInitials, sectorTheme, sectorLabel, timeAgo, SECTORS } from './format'
import SectorPicker from './SectorPicker'
import './Profile.css'

const JOB_TYPE_LABEL = { 'full-time': 'Full-time', 'part-time': 'Part-time', 'contract': 'Contract', 'internship': 'Internship' }

function sectorBadge(value) {
  return sectorLabel(value).toUpperCase()
}

function Profile({ user }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const profileId = id || user.id
  const isOwnProfile = profileId === user.id

  const [target, setTarget] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isFollowing, setIsFollowing] = useState(false)
  const [stats, setStats] = useState({ connections: 0, posts: 0, rooms: 0, jobs: 0 })
  const [posts, setPosts] = useState([])
  const [rooms, setRooms] = useState([])
  const [jobs, setJobs] = useState([])
  const [connections, setConnections] = useState([])
  const [editData, setEditData] = useState({ display_name: '', headline: '', location: '', bio: '', sector: '', sector_other: '', verification_url: '' })
  const [savedToast, setSavedToast] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setNotFound(false)
    setIsEditing(false)

    const run = async () => {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profileId)
        .single()

      if (!active) return
      if (error || !profile) { setNotFound(true); setLoading(false); return }

      const isCompany = profile.account_type === 'company'
      setTarget(profile)
      setActiveTab(isCompany ? 'overview' : 'activity')
      setEditData({
        display_name: profile.display_name || '',
        headline: profile.headline || '',
        location: profile.location || '',
        bio: profile.bio || '',
        sector: profile.sector || (SECTORS[0]?.value || ''),
        sector_other: profile.feed_preferences?.sector_other || '',
        verification_url: profile.verification_url || '',
      })

      const [
        connRes,
        postsCountRes,
        roomsCountRes,
        jobsCountRes,
        postsRowsRes,
        roomIdsRes,
        followCheckRes,
        connectionsRes,
        jobsRowsRes,
      ] = await Promise.all([
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followed_id', profileId),
        supabase.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', profileId),
        supabase.from('room_participants').select('*', { count: 'exact', head: true }).eq('profile_id', profileId),
        isCompany
          ? supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('company_id', profileId).eq('is_active', true)
          : Promise.resolve({ count: 0 }),
        supabase.from('posts').select('id, content, sector, created_at').eq('author_id', profileId).order('created_at', { ascending: false }).limit(20),
        supabase.from('room_participants').select('room_id').eq('profile_id', profileId).limit(20),
        isOwnProfile
          ? Promise.resolve({ data: null })
          : supabase.from('follows').select('id').eq('follower_id', user.id).eq('followed_id', profileId).maybeSingle(),
        !isCompany
          ? supabase.from('follows').select('followed_id, profile:profiles!followed_id(id, display_name, headline, sector, account_type)').eq('follower_id', profileId).limit(20)
          : Promise.resolve({ data: [] }),
        isCompany
          ? supabase.from('jobs').select('id, title, location, sector, job_type, experience_level, salary_range, created_at').eq('company_id', profileId).eq('is_active', true).order('created_at', { ascending: false }).limit(20)
          : Promise.resolve({ data: [] }),
      ])

      if (!active) return
      setStats({
        connections: connRes.count || 0,
        posts: postsCountRes.count || 0,
        rooms: roomsCountRes.count || 0,
        jobs: jobsCountRes.count || 0,
      })
      setPosts(postsRowsRes.data || [])
      setIsFollowing(!!followCheckRes.data)
      setConnections((connectionsRes.data || []).map(r => r.profile).filter(Boolean))
      setJobs(jobsRowsRes.data || [])

      const ids = (roomIdsRes.data || []).map(r => r.room_id)
      if (ids.length > 0) {
        const { data: roomRows } = await supabase
          .from('conversation_rooms')
          .select('id, name, sector, status')
          .in('id', ids)
        if (active) setRooms(roomRows || [])
      } else {
        if (active) setRooms([])
      }

      setLoading(false)
    }

    run()
    return () => { active = false }
  }, [profileId, user.id, isOwnProfile])

  const toggleFollow = async () => {
    if (isOwnProfile) return
    const next = !isFollowing
    setIsFollowing(next)
    setStats(s => ({ ...s, connections: s.connections + (next ? 1 : -1) }))
    if (next) {
      const { error } = await supabase.from('follows').insert({ follower_id: user.id, followed_id: profileId })
      if (error) { setIsFollowing(false); setStats(s => ({ ...s, connections: s.connections - 1 })) }
    } else {
      const { error } = await supabase.from('follows').delete().eq('follower_id', user.id).eq('followed_id', profileId)
      if (error) { setIsFollowing(true); setStats(s => ({ ...s, connections: s.connections + 1 })) }
    }
  }

  const saveProfile = async () => {
    if (!isOwnProfile) return
    const sectorOtherTrim = editData.sector === 'other' ? editData.sector_other.trim() : ''
    const nextFeedPrefs = {
      ...(target.feed_preferences || {}),
      sector_other: sectorOtherTrim || null,
    }
    const update = {
      display_name: editData.display_name.trim() || target.display_name,
      headline: editData.headline.trim() || null,
      location: editData.location.trim() || null,
      bio: editData.bio.trim() || null,
      sector: editData.sector || null,
      feed_preferences: nextFeedPrefs,
      updated_at: new Date().toISOString(),
    }
    if (target.account_type === 'company') {
      update.verification_url = editData.verification_url.trim() || null
    }
    const { error } = await supabase.from('profiles').update(update).eq('id', user.id)
    if (error) { alert(error.message); return }
    setTarget(t => ({ ...t, ...update }))
    setIsEditing(false)
    setSavedToast(true)
    setTimeout(() => setSavedToast(false), 2400)
  }

  if (notFound) {
    return (
      <div className="placeholder-page">
        <h2>Profile not found</h2>
        <p><button onClick={() => navigate('/network')} style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', padding: 0 }}>Back to network</button></p>
      </div>
    )
  }
  if (loading || !target) {
    return <div className="placeholder-page"><p>Loading profile…</p></div>
  }

  const isCompany = target.account_type === 'company'
  const sectorTag = sectorBadge(target.sector)
  const headerInitials = makeInitials(target.display_name)
  const headerBg = sectorTheme(target.sector).bg

  // ============================================================
  // Company layout
  // ============================================================
  if (isCompany) {
    return (
      <div className="profile-page">
        {savedToast && <div className="profile-saved-toast">Changes saved</div>}
        <div className="profile-main">
          <div className="profile-cover">
            <div className="profile-cover-gradient" />
          </div>
          <div className="profile-header-card profile-header-card-company">
            <div className="profile-header-top">
              <div className="profile-company-avatar-wrap">
                <div className="profile-big-avatar profile-big-avatar-company" style={{ background: target.avatar_url ? 'transparent' : headerBg }}>
                  {target.avatar_url
                    ? <img src={target.avatar_url} alt="" className="profile-big-avatar-img" />
                    : headerInitials}
                </div>
                <div className="profile-company-badge" title="Company">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M3 21V8l9-5 9 5v13" /><path d="M9 21v-6h6v6" /></svg>
                </div>
              </div>
              <div className="profile-header-info">
                <div className="profile-name-row">
                  {isEditing ? (
                    <input
                      className="profile-edit-input"
                      value={editData.display_name}
                      onChange={e => setEditData({ ...editData, display_name: e.target.value })}
                    />
                  ) : (
                    <h1>{target.display_name}</h1>
                  )}
                  {(target.domain || target.is_verified) ? (
                    <span className="profile-verified-badge" title={target.domain ? `Verified through corporate email at ${target.domain}` : 'Manually verified'}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                      {target.domain || 'Verified'}
                    </span>
                  ) : (
                    <span className="profile-pending-badge" title="Verification in review">
                      Verification Pending
                    </span>
                  )}
                  <span className="profile-account-tag profile-account-tag-company">Company</span>
                </div>
                <div className="profile-headline">{isEditing ? (
                  <input
                    className="profile-edit-input"
                    value={editData.headline}
                    onChange={e => setEditData({ ...editData, headline: e.target.value })}
                    placeholder="Add a tagline"
                  />
                ) : (target.headline || (isOwnProfile ? 'Add a tagline' : ''))}</div>
                <div className="profile-location">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                  {isEditing ? (
                    <input className="profile-edit-input sm" value={editData.location} onChange={e => setEditData({ ...editData, location: e.target.value })} placeholder="Location" />
                  ) : (target.location || (isOwnProfile ? 'Add a location' : '—'))}
                </div>
                <div className="profile-sector-badge">
                  {isEditing ? (
                    <SectorPicker
                      value={editData.sector}
                      otherValue={editData.sector_other}
                      onChange={v => setEditData({ ...editData, sector: v })}
                      onOtherChange={v => setEditData({ ...editData, sector_other: v })}
                      className="profile-edit-select"
                      otherClassName="profile-edit-input sm profile-edit-sector-other"
                    />
                  ) : sectorTag}
                </div>
              </div>
              <div className="profile-header-actions">
                {isOwnProfile ? (
                  <>
                    {isEditing && (
                      <button className="profile-cancel-btn" onClick={() => setIsEditing(false)}>Cancel</button>
                    )}
                    <button
                      className={`profile-edit-btn ${isEditing ? 'profile-edit-btn-primary' : ''}`}
                      onClick={() => isEditing ? saveProfile() : setIsEditing(true)}
                    >
                      {isEditing ? 'Save Changes' : 'Edit Profile'}
                    </button>
                  </>
                ) : (
                  <>
                    <button className="profile-connect-btn" onClick={toggleFollow}>
                      {isFollowing ? 'Following' : 'Follow Company'}
                    </button>
                    <button className="profile-msg-btn" onClick={() => navigate(`/messages/${profileId}`)}>Message Company</button>
                  </>
                )}
              </div>
            </div>

            <div className="profile-stats-row">
              <div className="profile-stat-item">
                <span className="profile-stat-num">{stats.connections}</span>
                <span className="profile-stat-label">Followers</span>
              </div>
              <div className="profile-stat-item">
                <span className="profile-stat-num">{stats.posts}</span>
                <span className="profile-stat-label">Posts</span>
              </div>
              <div className="profile-stat-item">
                <span className="profile-stat-num">{stats.jobs}</span>
                <span className="profile-stat-label">Jobs Posted</span>
              </div>
              <div className="profile-stat-item">
                <span className="profile-stat-num">{stats.rooms}</span>
                <span className="profile-stat-label">Active Rooms</span>
              </div>
            </div>
          </div>

          <div className="profile-tabs">
            {['overview', 'posts', 'jobs', 'rooms', 'people'].map(tab => (
              <button
                key={tab}
                className={`profile-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div className="profile-tab-content">
            {activeTab === 'overview' && (
              <div className="profile-overview-grid">
                <div className="profile-section">
                  <h3>About</h3>
                  {isEditing ? (
                    <textarea
                      className="profile-edit-textarea"
                      value={editData.bio}
                      onChange={e => setEditData({ ...editData, bio: e.target.value })}
                      placeholder="What does this company do?"
                    />
                  ) : (
                    <p className="profile-bio">{target.bio || (isOwnProfile ? 'Add a description.' : 'No description yet.')}</p>
                  )}
                  {isEditing && isOwnProfile && (
                    <div className="profile-verification-edit">
                      <label className="profile-verification-edit-label">Verification reference</label>
                      <input
                        type="url"
                        className="profile-verification-edit-input"
                        value={editData.verification_url}
                        onChange={e => setEditData({ ...editData, verification_url: e.target.value })}
                        placeholder="Company website, social media link, or supporting documentation URL"
                      />
                      <div className="profile-verification-edit-help">
                        {target.domain
                          ? `Auto-verified via your corporate domain (${target.domain}). Adding a reference is optional.`
                          : target.is_verified
                            ? 'Your account has been manually verified.'
                            : 'You’re currently in Verification Pending. Adding a website, social link, or supporting URL helps speed up review.'}
                      </div>
                    </div>
                  )}
                </div>
                <div className="profile-section">
                  <h3>Details</h3>
                  <div className="profile-detail-row"><span className="profile-detail-label">Sector</span><span>{sectorTag}</span></div>
                  <div className="profile-detail-row"><span className="profile-detail-label">Location</span><span>{target.location || '—'}</span></div>
                  <div className="profile-detail-row"><span className="profile-detail-label">Email</span><span>{target.email || '—'}</span></div>
                  <div className="profile-detail-row">
                    <span className="profile-detail-label">Verification</span>
                    <span>{target.domain ? `Verified · ${target.domain}` : target.is_verified ? 'Verified' : 'Pending'}</span>
                  </div>
                  <div className="profile-detail-row">
                    <span className="profile-detail-label">Reference</span>
                    <span>{target.verification_url
                      ? <a href={target.verification_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green)', textDecoration: 'none' }}>{target.verification_url}</a>
                      : '—'}</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'posts' && (
              posts.length === 0 ? (
                <div className="profile-empty">No posts yet.</div>
              ) : (
                posts.map(p => (
                  <div key={p.id} className="profile-activity-item profile-activity-item-clickable" onClick={() => navigate(`/posts/${p.id}`)}>
                    <div className="profile-activity-icon post">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </div>
                    <div className="profile-activity-content">
                      <div className="profile-activity-text">{p.content}</div>
                      <div className="profile-activity-meta"><span>{timeAgo(p.created_at)}</span></div>
                    </div>
                  </div>
                ))
              )
            )}

            {activeTab === 'jobs' && (
              jobs.length === 0 ? (
                <div className="profile-empty">No open roles posted yet.</div>
              ) : (
                <div className="profile-jobs-list">
                  {jobs.map(j => (
                    <div key={j.id} className="profile-job-row" onClick={() => navigate(`/jobs/${j.id}`)}>
                      <div className="profile-job-row-main">
                        <div className="profile-job-row-title">{j.title}</div>
                        <div className="profile-job-row-meta">
                          {j.location && <span>{j.location}</span>}
                          {j.location && <span>·</span>}
                          <span>{JOB_TYPE_LABEL[j.job_type] || j.job_type}</span>
                          {j.salary_range && <><span>·</span><span className="profile-job-row-salary">{j.salary_range}</span></>}
                        </div>
                      </div>
                      <div className="profile-job-row-time">{timeAgo(j.created_at)}</div>
                    </div>
                  ))}
                </div>
              )
            )}

            {activeTab === 'rooms' && (
              rooms.length === 0 ? (
                <div className="profile-empty">No conversation rooms yet.</div>
              ) : (
                <div className="profile-rooms">
                  {rooms.map(r => (
                    <div key={r.id} className="profile-room-item" onClick={() => navigate(`/rooms/${r.id}`)}>
                      <div className="profile-room-sector" style={{ color: sectorTheme(r.sector).cardColor }}>{sectorBadge(r.sector)}</div>
                      <div className="profile-room-name">{r.name}</div>
                      <div className="profile-room-detail">{r.status}</div>
                    </div>
                  ))}
                </div>
              )
            )}

            {activeTab === 'people' && (
              <div className="profile-people-list">
                <div className="profile-person-row">
                  <div className="profile-person-avatar" style={{ background: headerBg }}>{headerInitials}</div>
                  <div className="profile-person-info">
                    <div className="profile-person-name">{target.display_name}</div>
                    <div className="profile-person-role">Representative</div>
                  </div>
                </div>
                <div className="profile-people-note">
                  Team member directory coming soon. For now this company is represented by its registered owner.
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="profile-sidebar">
          <div className="profile-widget">
            <h4>Contact</h4>
            <div className="profile-contact-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
              <span>{target.email || '—'}</span>
            </div>
          </div>
          <div className="profile-widget">
            <h4>Sector</h4>
            <div className="profile-tags">
              <span className="profile-tag">{sectorTag}</span>
            </div>
          </div>
        </aside>
      </div>
    )
  }

  // ============================================================
  // Individual layout
  // ============================================================
  return (
    <div className="profile-page">
      {savedToast && <div className="profile-saved-toast">Changes saved</div>}
      <div className="profile-main">
        <div className="profile-cover">
          <div className="profile-cover-gradient" />
        </div>
        <div className="profile-header-card">
          <div className="profile-header-top">
            <div className="profile-big-avatar" style={{ background: target.avatar_url ? 'transparent' : headerBg }}>
              {target.avatar_url
                ? <img src={target.avatar_url} alt="" className="profile-big-avatar-img" />
                : headerInitials}
            </div>
            <div className="profile-header-info">
              <div className="profile-name-row">
                {isEditing ? (
                  <input
                    className="profile-edit-input"
                    value={editData.display_name}
                    onChange={e => setEditData({ ...editData, display_name: e.target.value })}
                  />
                ) : (
                  <h1>{target.display_name}</h1>
                )}
                <span className="profile-account-tag profile-account-tag-individual">Individual</span>
              </div>
              <div className="profile-headline">{isEditing ? (
                <input
                  className="profile-edit-input"
                  value={editData.headline}
                  onChange={e => setEditData({ ...editData, headline: e.target.value })}
                  placeholder="Add a headline"
                />
              ) : (target.headline || (isOwnProfile ? 'Add a headline' : 'Professional'))}</div>
              <div className="profile-location">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                {isEditing ? (
                  <input className="profile-edit-input sm" value={editData.location} onChange={e => setEditData({ ...editData, location: e.target.value })} placeholder="Location" />
                ) : (target.location || (isOwnProfile ? 'Add a location' : '—'))}
              </div>
              <div className="profile-sector-badge">
                {isEditing ? (
                  <SectorPicker
                    value={editData.sector}
                    otherValue={editData.sector_other}
                    onChange={v => setEditData({ ...editData, sector: v })}
                    onOtherChange={v => setEditData({ ...editData, sector_other: v })}
                    className="profile-edit-select"
                    otherClassName="profile-edit-input sm profile-edit-sector-other"
                  />
                ) : sectorTag}
              </div>
            </div>
            <div className="profile-header-actions">
              {isOwnProfile ? (
                <>
                  {isEditing && (
                    <button className="profile-cancel-btn" onClick={() => setIsEditing(false)}>Cancel</button>
                  )}
                  <button className="profile-edit-btn" onClick={() => isEditing ? saveProfile() : setIsEditing(true)}>
                    {isEditing ? 'Save Changes' : 'Edit Profile'}
                  </button>
                </>
              ) : (
                <>
                  <button className="profile-connect-btn" onClick={toggleFollow}>
                    {isFollowing ? 'Following' : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        Connect
                      </>
                    )}
                  </button>
                  <button className="profile-msg-btn" onClick={() => navigate(`/messages/${profileId}`)}>Message</button>
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
              <span className="profile-stat-num">{stats.rooms}</span>
              <span className="profile-stat-label">Rooms</span>
            </div>
            <div className="profile-stat-item">
              <span className="profile-stat-num">—</span>
              <span className="profile-stat-label">Profile Views</span>
            </div>
          </div>
        </div>

        <div className="profile-section">
          <h3>About</h3>
          {isEditing ? (
            <textarea
              className="profile-edit-textarea"
              value={editData.bio}
              onChange={e => setEditData({ ...editData, bio: e.target.value })}
              placeholder="Add a short bio."
            />
          ) : (
            <p className="profile-bio">{target.bio || (isOwnProfile ? 'Add a short bio.' : '')}</p>
          )}
        </div>

        <div className="profile-tabs">
          {['activity', 'posts', 'rooms', 'connections'].map(tab => (
            <button
              key={tab}
              className={`profile-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="profile-tab-content">
          {activeTab === 'activity' && (
            posts.length === 0 && rooms.length === 0 ? (
              <div className="profile-empty">No recent activity.</div>
            ) : (
              <>
                {posts.slice(0, 5).map(p => (
                  <div key={p.id} className="profile-activity-item profile-activity-item-clickable" onClick={() => navigate(`/posts/${p.id}`)}>
                    <div className="profile-activity-icon post">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </div>
                    <div className="profile-activity-content">
                      <div className="profile-activity-text">{p.content}</div>
                      <div className="profile-activity-meta"><span>{timeAgo(p.created_at)}</span></div>
                    </div>
                  </div>
                ))}
                {rooms.slice(0, 5).map(r => (
                  <div key={r.id} className="profile-activity-item">
                    <div className="profile-activity-icon room">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                    </div>
                    <div className="profile-activity-content">
                      <div className="profile-activity-text">In conversation room: {r.name}</div>
                      <div className="profile-activity-meta"><span>{sectorBadge(r.sector)}</span></div>
                    </div>
                  </div>
                ))}
              </>
            )
          )}
          {activeTab === 'posts' && (
            posts.length === 0 ? (
              <div className="profile-empty">No posts yet.</div>
            ) : (
              posts.map(p => (
                <div key={p.id} className="profile-activity-item profile-activity-item-clickable" onClick={() => navigate(`/posts/${p.id}`)}>
                  <div className="profile-activity-icon post">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </div>
                  <div className="profile-activity-content">
                    <div className="profile-activity-text">{p.content}</div>
                    <div className="profile-activity-meta"><span>{timeAgo(p.created_at)}</span></div>
                  </div>
                </div>
              ))
            )
          )}
          {activeTab === 'rooms' && (
            rooms.length === 0 ? (
              <div className="profile-empty">No conversation rooms yet.</div>
            ) : (
              <div className="profile-rooms">
                {rooms.map(r => (
                  <div key={r.id} className="profile-room-item" onClick={() => navigate(`/rooms/${r.id}`)}>
                    <div className="profile-room-sector" style={{ color: sectorTheme(r.sector).cardColor }}>{sectorBadge(r.sector)}</div>
                    <div className="profile-room-name">{r.name}</div>
                    <div className="profile-room-detail">{r.status}</div>
                  </div>
                ))}
              </div>
            )
          )}
          {activeTab === 'connections' && (
            connections.length === 0 ? (
              <div className="profile-empty">No connections yet.</div>
            ) : (
              <div className="profile-connections-grid">
                {connections.map(c => (
                  <Link key={c.id} className="profile-connection-card" to={`/profile/${c.id}`}>
                    <div className="profile-connection-avatar" style={{ background: sectorTheme(c.sector).bg }}>
                      {makeInitials(c.display_name)}
                    </div>
                    <div className="profile-connection-name">{c.display_name}</div>
                    <div className="profile-connection-headline">{c.headline || (c.account_type === 'company' ? 'Company' : 'Professional')}</div>
                    <div className="profile-connection-sector">{sectorBadge(c.sector)}</div>
                  </Link>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      <aside className="profile-sidebar">
        <div className="profile-widget">
          <h4>Contact Information</h4>
          <div className="profile-contact-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
            <span>{target.email}</span>
          </div>
        </div>
        <div className="profile-widget">
          <h4>Expertise</h4>
          <div className="profile-tags">
            <span className="profile-tag">{sectorTag}</span>
            {target.headline && <span className="profile-tag">{target.headline}</span>}
          </div>
        </div>
      </aside>
    </div>
  )
}

export default Profile

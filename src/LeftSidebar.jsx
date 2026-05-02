import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { sectorTheme, sectorLabel } from './format'
import { OPEN_FEEDBACK_EVENT } from './Feedback'
import './LeftSidebar.css'

function shortMeetingTime(iso) {
  const d = new Date(iso)
  const today = new Date()
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1)
  const isSameDay = (a, b) => a.toDateString() === b.toDateString()
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (isSameDay(d, today)) return `Today, ${time}`
  if (isSameDay(d, tomorrow)) return `Tomorrow, ${time}`
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`
}

function LeftSidebar({ user }) {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState([])
  const [loadingRooms, setLoadingRooms] = useState(true)
  const [meetings, setMeetings] = useState([])
  const [loadingMeetings, setLoadingMeetings] = useState(true)
  const [activeJobsCount, setActiveJobsCount] = useState(null)

  const isCompany = user.accountType === 'company'

  useEffect(() => {
    let active = true

    const loadRooms = supabase
      .from('conversation_rooms')
      .select('id, name, sector, status')
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => { if (active) setRooms(data || []) })

    const loadMeetings = supabase
      .from('meetings')
      .select('id, title, scheduled_at')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(3)
      .then(({ data }) => { if (active) setMeetings(data || []) })

    const loadJobs = isCompany
      ? supabase
          .from('jobs')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', user.id)
          .eq('is_active', true)
          .then(({ count }) => { if (active) setActiveJobsCount(count || 0) })
      : Promise.resolve()

    Promise.all([loadRooms, loadMeetings, loadJobs])
      .finally(() => {
        if (active) {
          setLoadingRooms(false)
          setLoadingMeetings(false)
        }
      })

    return () => { active = false }
  }, [user.id, isCompany])

  const sectorRoleLabel = user.sector ? sectorLabel(user.sector) : 'Professional'
  const openFeedback = () => window.dispatchEvent(new CustomEvent(OPEN_FEEDBACK_EVENT))

  return (
    <aside className="sidebar-left">
      <div className="profile-mini">
        <div className="pm-avatar">
          {user.avatar_url
            ? <img src={user.avatar_url} alt="" className="pm-avatar-img" />
            : user.initials}
        </div>
        <div className="pm-name">{user.name}</div>
        <div className="pm-role">{sectorRoleLabel}</div>
        <div className="pm-sector">{(user.sector || 'general').toUpperCase()}</div>
      </div>

      <div className="sidebar-section">
        <h4>Your Schedule</h4>
        {loadingMeetings ? (
          <div className="ls-empty">Loading…</div>
        ) : meetings.length === 0 ? (
          <div className="ls-empty">
            No upcoming meetings.{' '}
            <Link to="/schedule" className="ls-empty-link">Schedule one →</Link>
          </div>
        ) : (
          <div className="ls-list">
            {meetings.map(m => (
              <button key={m.id} className="ls-item" onClick={() => navigate('/schedule')}>
                <span className="ls-item-time">{shortMeetingTime(m.scheduled_at)}</span>
                <span className="ls-item-title">{m.title}</span>
              </button>
            ))}
          </div>
        )}
        <Link to="/schedule" className="ls-section-link">View all meetings</Link>
      </div>

      <div className="sidebar-section">
        <h4>Your Rooms</h4>
        {loadingRooms ? (
          <div className="ls-empty">Loading…</div>
        ) : rooms.length === 0 ? (
          <div className="ls-empty">No conversation rooms yet.</div>
        ) : (
          <div className="ls-list">
            {rooms.map(r => (
              <button key={r.id} className="ls-item ls-room-item" onClick={() => navigate(`/rooms/${r.id}`)}>
                <span className="ls-room-dot" style={{ background: sectorTheme(r.sector).cardColor }} />
                <span className="ls-item-title">{r.name}</span>
              </button>
            ))}
          </div>
        )}
        <Link to="/rooms" className="ls-section-link">View all rooms</Link>
      </div>

      {isCompany && (
        <div className="sidebar-section">
          <h4>Your Jobs</h4>
          <button className="ls-jobs-card" onClick={() => navigate('/jobs')}>
            <span className="ls-jobs-num">{activeJobsCount ?? '—'}</span>
            <span className="ls-jobs-label">
              {activeJobsCount === 1 ? 'active role posted' : 'active roles posted'}
            </span>
          </button>
          <Link to="/jobs" className="ls-section-link">Manage jobs</Link>
        </div>
      )}

      <button className="ls-feedback-link" onClick={openFeedback}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Send us feedback
      </button>
    </aside>
  )
}

export default LeftSidebar

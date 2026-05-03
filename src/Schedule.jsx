import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { makeInitials, sectorTheme, timeAgo } from './format'
import ScheduleMeetingModal from './ScheduleMeetingModal'
import './Schedule.css'

function formatMeetingTime(iso, tz) {
  const d = new Date(iso)
  const dateOpts = { weekday: 'short', month: 'short', day: 'numeric' }
  const timeOpts = { hour: 'numeric', minute: '2-digit' }
  if (tz) {
    dateOpts.timeZone = tz
    timeOpts.timeZone = tz
    timeOpts.timeZoneName = 'short'
  }
  const date = d.toLocaleDateString(undefined, dateOpts)
  const time = d.toLocaleTimeString(undefined, timeOpts)
  return { date, time }
}

function durationLabel(min) {
  if (min === 30) return '30 min'
  if (min === 60) return '1 hour'
  if (min === 120) return '2 hours'
  return `${min} min`
}

// Build a Google Calendar "create event" URL pre-populated from a meeting.
// Format: dates=YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ in UTC. We pass the
// meeting's stored timezone via the `ctz` param so the GCal UI shows the
// event in the originator's intended zone even though the timestamps
// themselves are in UTC.
function googleCalendarUrl(meeting) {
  const start = new Date(meeting.scheduled_at)
  const end = new Date(start.getTime() + (meeting.duration_minutes || 60) * 60 * 1000)
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: meeting.title || 'Compound Meeting',
    dates: `${fmt(start)}/${fmt(end)}`,
    details: meeting.note || 'Scheduled via Compound.',
  })
  if (meeting.timezone) params.set('ctz', meeting.timezone)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function MeetingCard({ meeting, onJoin, onNavigateToRoom }) {
  const { date, time } = formatMeetingTime(meeting.scheduled_at, meeting.timezone)
  const participants = meeting.participants || []
  const showAvatars = participants.slice(0, 4)
  const remaining = participants.length - showAvatars.length

  return (
    <div className="sch-card">
      <div className="sch-card-time">
        <div className="sch-card-date">{date}</div>
        <div className="sch-card-clock">{time} · {durationLabel(meeting.duration_minutes)}</div>
      </div>
      <div className="sch-card-body">
        <div className="sch-card-title">{meeting.title}</div>
        {meeting.note && <div className="sch-card-note">{meeting.note}</div>}
        {meeting.room_id && (
          <button className="sch-card-room-link" onClick={() => onNavigateToRoom(meeting.room_id)}>
            Linked to a Conversation Room ↗
          </button>
        )}
        <div className="sch-card-participants">
          <div className="sch-avatars">
            {showAvatars.map((p, i) => (
              <span key={i} className="sch-avatar" style={{ background: sectorTheme(p.sector).bg }} title={p.display_name}>
                {p.avatar_url ? <img src={p.avatar_url} alt="" /> : makeInitials(p.display_name)}
              </span>
            ))}
            {remaining > 0 && <span className="sch-avatar sch-avatar-rest">+{remaining}</span>}
          </div>
          <span className="sch-participant-count">
            {participants.length} {participants.length === 1 ? 'invitee' : 'invitees'}
          </span>
        </div>
        <a
          className="sch-card-gcal"
          href={googleCalendarUrl(meeting)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Add to Google Calendar
        </a>
      </div>
      <div className="sch-card-actions">
        <button className="sch-join-btn" onClick={() => onJoin(meeting)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          Join
        </button>
      </div>
    </div>
  )
}

function ComingSoonModal({ open, onClose }) {
  if (!open) return null
  return (
    <div className="sch-cs-overlay" onClick={onClose}>
      <div className="sch-cs-modal" onClick={e => e.stopPropagation()}>
        <div className="sch-cs-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        </div>
        <h3>Video meetings are coming soon</h3>
        <p>You'll be able to join calls right here inside Compound — no Zoom, no Teams, no meeting links to copy.</p>
        <button className="sch-cs-btn" onClick={onClose}>Got it</button>
      </div>
    </div>
  )
}

function Schedule({ user }) {
  const navigate = useNavigate()
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showJoin, setShowJoin] = useState(false)

  const fetchMeetings = useCallback(async () => {
    const { data, error } = await supabase
      .from('meetings')
      .select(`
        id, title, scheduled_at, duration_minutes, timezone, note, status, room_id, created_at, created_by,
        participants:meeting_participants(profile_id, status, profile:profiles!profile_id(id, display_name, sector, avatar_url))
      `)
      .order('scheduled_at', { ascending: true })
    if (error) {
      console.warn('meetings fetch failed:', error.message)
      setMeetings([])
      return
    }
    // Flatten profile lookups
    const flat = (data || []).map(m => ({
      ...m,
      participants: (m.participants || []).map(p => p.profile).filter(Boolean),
    }))
    setMeetings(flat)
  }, [])

  useEffect(() => {
    fetchMeetings().finally(() => setLoading(false))
  }, [fetchMeetings])

  const onJoin = (_m) => setShowJoin(true)

  const now = Date.now()
  const upcoming = meetings.filter(m => new Date(m.scheduled_at).getTime() >= now && m.status !== 'cancelled')
  const past = meetings.filter(m => new Date(m.scheduled_at).getTime() < now || m.status === 'completed' || m.status === 'cancelled')

  return (
    <div className="sch-page">
      <div className="sch-header">
        <div>
          <h2>Schedule</h2>
          <p className="sch-subtitle">{upcoming.length} upcoming · {past.length} past</p>
        </div>
        <div className="sch-header-actions">
          <button className="sch-create-btn" onClick={() => setShowModal(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Schedule a Meeting
          </button>
        </div>
      </div>

      {loading ? (
        <div className="sch-empty">Loading meetings…</div>
      ) : meetings.length === 0 ? (
        <div className="sch-empty">No meetings scheduled. Schedule your first meeting.</div>
      ) : (
        <>
          <section className="sch-section">
            <h3 className="sch-section-head">Upcoming</h3>
            {upcoming.length === 0 ? (
              <div className="sch-empty-inline">Nothing on the books yet.</div>
            ) : (
              <div className="sch-list">
                {upcoming.map(m => (
                  <MeetingCard key={m.id} meeting={m} onJoin={onJoin} onNavigateToRoom={(id) => navigate(`/rooms/${id}`)} />
                ))}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section className="sch-section">
              <h3 className="sch-section-head">Past</h3>
              <div className="sch-list sch-list-past">
                {past.map(m => (
                  <MeetingCard key={m.id} meeting={m} onJoin={onJoin} onNavigateToRoom={(id) => navigate(`/rooms/${id}`)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <ScheduleMeetingModal
        open={showModal}
        onClose={() => setShowModal(false)}
        user={user}
        onScheduled={() => fetchMeetings()}
      />

      <ComingSoonModal open={showJoin} onClose={() => setShowJoin(false)} />
    </div>
  )
}

export default Schedule

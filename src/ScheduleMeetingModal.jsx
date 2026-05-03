import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import { makeInitials, sectorTheme } from './format'
import './ScheduleMeetingModal.css'

const DURATIONS = [
  { value: 30,  label: '30 min' },
  { value: 60,  label: '1 hour' },
  { value: 120, label: '2 hours' },
]

const COMMON_TIMEZONES = [
  { value: 'America/New_York',     label: 'US Eastern (ET)' },
  { value: 'America/Chicago',      label: 'US Central (CT)' },
  { value: 'America/Denver',       label: 'US Mountain (MT)' },
  { value: 'America/Los_Angeles',  label: 'US Pacific (PT)' },
  { value: 'America/Sao_Paulo',    label: 'Brazil (BRT)' },
  { value: 'America/Mexico_City',  label: 'Mexico (CST)' },
  { value: 'America/Asuncion',     label: 'Paraguay (PYT)' },
  { value: 'Europe/London',        label: 'UK / GMT' },
  { value: 'Europe/Paris',         label: 'Central Europe (CET)' },
  { value: 'Europe/Athens',        label: 'Eastern Europe (EET)' },
  { value: 'Africa/Lagos',         label: 'West Africa (WAT)' },
  { value: 'Africa/Johannesburg',  label: 'South Africa (SAST)' },
  { value: 'Asia/Dubai',           label: 'Gulf (GST)' },
  { value: 'Asia/Kolkata',         label: 'India (IST)' },
  { value: 'Asia/Singapore',       label: 'Singapore (SGT)' },
  { value: 'Asia/Shanghai',        label: 'China (CST)' },
  { value: 'Asia/Tokyo',           label: 'Japan (JST)' },
  { value: 'Australia/Sydney',     label: 'Australia East (AEST)' },
  { value: 'UTC',                  label: 'UTC' },
]

function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

// Build an ISO string interpreting <date>T<time> in the given IANA tz.
// Browser Date constructor uses the LOCAL machine zone, so we offset by the
// difference between the local zone and the chosen zone.
function buildScheduledAtISO(date, time, tz) {
  // Naive approach using Intl: build a UTC-style date from the chosen tz.
  // We compute the offset minutes for that tz at the chosen instant and apply.
  const naive = new Date(`${date}T${time}:00`)
  // Format the naive time in the target tz to find its UTC equivalent.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  // Find the offset by comparing what the naive instant looks like in tz vs UTC.
  const parts = fmt.formatToParts(naive).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value
    return acc
  }, {})
  const asInTz = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second || 0)
  )
  const offsetMs = asInTz - naive.getTime()
  return new Date(naive.getTime() - offsetMs).toISOString()
}

function defaultDateTime() {
  // Default to next round half-hour, today
  const d = new Date()
  d.setMinutes(d.getMinutes() < 30 ? 30 : 0, 0, 0)
  if (d.getMinutes() === 0) d.setHours(d.getHours() + 1)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mn = String(d.getMinutes()).padStart(2, '0')
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mn}` }
}

function ScheduleMeetingModal({
  open,
  onClose,
  user,
  presetTitle = '',
  presetParticipants = [],
  presetRoomId = null,
  onScheduled,
}) {
  const initialDT = defaultDateTime()
  const initialTz = detectTimezone()
  const [title, setTitle] = useState(presetTitle)
  const [date, setDate] = useState(initialDT.date)
  const [time, setTime] = useState(initialDT.time)
  const [timezone, setTimezone] = useState(initialTz)
  const [duration, setDuration] = useState(60)
  const [note, setNote] = useState('')
  const [participants, setParticipants] = useState(presetParticipants) // [{id, display_name, sector, avatar_url}]
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Reset state ONLY when the modal opens. We deliberately don't depend on
  // presetTitle/presetParticipants here — parents often pass fresh array
  // literals on every render (e.g. `presetParticipants={[]}`), and including
  // them as deps would re-fire this effect on every parent re-render and wipe
  // the user's in-progress typing. If a caller wants new presets reflected,
  // they should close and reopen the modal.
  useEffect(() => {
    if (!open) return
    setTitle(presetTitle)
    setParticipants(presetParticipants)
    const dt = defaultDateTime()
    setDate(dt.date)
    setTime(dt.time)
    setTimezone(detectTimezone())
    setDuration(60)
    setNote('')
    setSearchQ('')
    setSearchResults([])
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Debounced participant search across profiles
  useEffect(() => {
    if (!open) return
    const q = searchQ.replace(/[,()%]/g, '').trim()
    if (q.length < 2) { setSearchResults([]); return }
    setSearching(true)
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, sector, avatar_url, account_type, headline')
        .neq('id', user.id)
        .or(`display_name.ilike.%${q}%,headline.ilike.%${q}%`)
        .limit(8)
      setSearchResults(data || [])
      setSearching(false)
    }, 250)
    return () => clearTimeout(t)
  }, [searchQ, user.id, open])

  const addParticipant = (p) => {
    if (participants.find(x => x.id === p.id)) return
    setParticipants([...participants, p])
    setSearchQ('')
    setSearchResults([])
  }

  const removeParticipant = (id) => {
    setParticipants(participants.filter(p => p.id !== id))
  }

  const submit = async () => {
    setError(null)
    if (!title.trim()) { setError('Give the meeting a title.'); return }
    if (!date || !time) { setError('Pick a date and time.'); return }
    setBusy(true)
    const scheduledAt = buildScheduledAtISO(date, time, timezone)

    const { data: meeting, error: mErr } = await supabase
      .from('meetings')
      .insert({
        title: title.trim(),
        scheduled_at: scheduledAt,
        duration_minutes: duration,
        timezone,
        note: note.trim() || null,
        created_by: user.id,
        room_id: presetRoomId,
      })
      .select()
      .single()
    if (mErr || !meeting) {
      setBusy(false)
      setError(mErr?.message || 'Could not schedule.')
      return
    }

    // Insert invitations (creator already added as accepted by trigger)
    const invitations = participants
      .filter(p => p.id !== user.id)
      .map(p => ({ meeting_id: meeting.id, profile_id: p.id, status: 'invited' }))
    if (invitations.length > 0) {
      const { error: pErr } = await supabase.from('meeting_participants').insert(invitations)
      if (pErr) {
        // Don't fail the whole flow — meeting exists; surface a warning
        console.warn('Could not invite all participants:', pErr.message)
      }
    }

    setBusy(false)
    onScheduled?.(meeting)
    onClose?.()
  }

  if (!open) return null

  return (
    <div className="smm-overlay" onClick={() => !busy && onClose?.()}>
      <div className="smm-modal" onClick={e => e.stopPropagation()}>
        <div className="smm-head">
          <h3>Schedule a meeting</h3>
          <button className="smm-close" onClick={() => !busy && onClose?.()}>×</button>
        </div>

        <div className="smm-form">
          <div className="smm-field">
            <label>Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Kickoff sync, Quarterly review, etc."
              autoFocus
              disabled={busy}
            />
          </div>

          <div className="smm-row">
            <div className="smm-field">
              <label>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} disabled={busy} />
            </div>
            <div className="smm-field">
              <label>Time</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} disabled={busy} />
            </div>
          </div>

          <div className="smm-field">
            <label>Time zone</label>
            <select value={timezone} onChange={e => setTimezone(e.target.value)} disabled={busy}>
              {COMMON_TIMEZONES.find(t => t.value === timezone) ? null : (
                <option value={timezone}>{timezone} (detected)</option>
              )}
              {COMMON_TIMEZONES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="smm-field">
            <label>Duration</label>
            <div className="smm-chip-row">
              {DURATIONS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  className={`smm-chip ${duration === d.value ? 'active' : ''}`}
                  onClick={() => setDuration(d.value)}
                  disabled={busy}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="smm-field">
            <label>Invite</label>
            <div className="smm-participants">
              {participants.map(p => (
                <span key={p.id} className="smm-participant-chip">
                  <span className="smm-participant-avatar" style={{ background: sectorTheme(p.sector).bg }}>
                    {p.avatar_url
                      ? <img src={p.avatar_url} alt="" />
                      : makeInitials(p.display_name)}
                  </span>
                  {p.display_name}
                  <button type="button" className="smm-participant-x" onClick={() => removeParticipant(p.id)} disabled={busy}>×</button>
                </span>
              ))}
            </div>
            <input
              type="text"
              placeholder="Search people to invite…"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              disabled={busy}
            />
            {searchResults.length > 0 && (
              <div className="smm-search-results">
                {searchResults.map(p => (
                  <button key={p.id} type="button" className="smm-search-row" onClick={() => addParticipant(p)} disabled={busy}>
                    <span className="smm-participant-avatar" style={{ background: sectorTheme(p.sector).bg }}>
                      {p.avatar_url
                        ? <img src={p.avatar_url} alt="" />
                        : makeInitials(p.display_name)}
                    </span>
                    <span className="smm-search-name">{p.display_name}</span>
                    <span className="smm-search-meta">{p.account_type === 'company' ? 'Company' : (p.headline || 'Individual')}</span>
                  </button>
                ))}
              </div>
            )}
            {searchQ && !searching && searchResults.length === 0 && searchQ.length >= 2 && (
              <div className="smm-search-empty">No matches.</div>
            )}
          </div>

          <div className="smm-field">
            <label>Note <span className="smm-optional">(optional)</span></label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Agenda, context, anything to share with invitees."
              rows={3}
              disabled={busy}
            />
          </div>

          {error && <div className="smm-error">{error}</div>}

          <div className="smm-actions">
            <button className="smm-cancel" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="smm-submit" onClick={submit} disabled={busy || !title.trim() || !date || !time}>
              {busy ? 'Scheduling…' : 'Schedule meeting'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ScheduleMeetingModal

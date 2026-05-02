import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import { makeInitials, sectorTheme } from './format'
import './ScheduleMeetingModal.css'

const DURATIONS = [
  { value: 30,  label: '30 min' },
  { value: 60,  label: '1 hour' },
  { value: 120, label: '2 hours' },
]

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
  const [title, setTitle] = useState(presetTitle)
  const [date, setDate] = useState(initialDT.date)
  const [time, setTime] = useState(initialDT.time)
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
    const scheduledAt = new Date(`${date}T${time}:00`).toISOString()

    const { data: meeting, error: mErr } = await supabase
      .from('meetings')
      .insert({
        title: title.trim(),
        scheduled_at: scheduledAt,
        duration_minutes: duration,
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

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { makeInitials, sectorTheme, sectorLabel, timeAgo, SECTORS } from './format'
import ScheduleMeetingModal from './ScheduleMeetingModal'
import SectorPicker from './SectorPicker'
import './ConversationRooms.css'

function sectorBadge(value) {
  return sectorLabel(value).toUpperCase()
}

function statusLabel(status) {
  if (status === 'completed') return 'COMPLETE'
  if (status === 'archived') return 'ARCHIVED'
  return 'ACTIVE'
}

function deriveMilestones(status) {
  const labels = ['Getting Started', 'In Progress', 'Review', 'Complete']
  if (status === 'completed' || status === 'archived') {
    return labels.map(l => ({ label: l, done: true }))
  }
  return labels.map((l, i) => ({ label: l, done: false, current: i === 0 }))
}

// A profile counts as "verified company" when they're a company account
// AND either auto-verified by corporate domain OR manually approved. Mirrors
// the server-side check in 0011_public_rooms.sql so the UI and DB agree on
// who can publish a public room.
function isVerifiedCompany(user) {
  if (!user || user.accountType !== 'company') return false
  return !!user.is_verified || !!user.domain
}

function ConversationRooms({ user }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(!!location.state?.openCreate)
  const [newRoom, setNewRoom] = useState({
    name: '',
    sector: SECTORS[0].value,
    sector_other: '',
    requires_nda: false,
    is_public: false,
    description: '',
  })
  const [creating, setCreating] = useState(false)
  const [actioningRoomId, setActioningRoomId] = useState(null)

  const canPublish = isVerifiedCompany(user)

  const fetchRooms = useCallback(async () => {
    const { data, error } = await supabase
      .from('conversation_rooms')
      .select(`
        id, name, description, sector, status, is_public, created_by, created_at,
        participants:room_participants(id, role, profile_id, profile:profiles!profile_id(id, display_name)),
        document_count:room_documents(count)
      `)
      .order('created_at', { ascending: false })
    if (error) {
      console.warn('Rooms fetch failed:', error.message)
      setRooms([])
      return
    }
    setRooms(data || [])
  }, [])

  useEffect(() => {
    fetchRooms().finally(() => setLoading(false))
  }, [fetchRooms])

  useEffect(() => {
    if (location.state?.openCreate) {
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, location.state, navigate])

  const handleCreate = async () => {
    const name = newRoom.name.trim()
    const description = newRoom.description.trim()
    if (!name || creating) return
    if (newRoom.is_public && !description) {
      alert('Public rooms need a short description so others know what they’re joining.')
      return
    }
    setCreating(true)
    const sectorOtherTrim = newRoom.sector === 'other' ? newRoom.sector_other.trim() : ''
    const { data, error } = await supabase
      .from('conversation_rooms')
      .insert({
        name,
        description: description || null,
        sector: newRoom.sector,
        sector_other: sectorOtherTrim || null,
        requires_nda: newRoom.requires_nda,
        is_public: canPublish && newRoom.is_public,
        created_by: user.id,
      })
      .select()
      .single()
    setCreating(false)
    if (error) { alert(error.message); return }
    setNewRoom({
      name: '', sector: SECTORS[0].value, sector_other: '',
      requires_nda: false, is_public: false, description: '',
    })
    setShowCreate(false)
    await fetchRooms()
    if (data?.id) navigate(`/rooms/${data.id}`)
  }

  const handleJoin = async (room) => {
    if (actioningRoomId) return
    setActioningRoomId(room.id)
    const { error } = await supabase
      .from('room_participants')
      .insert({ room_id: room.id, profile_id: user.id, role: 'member' })
    setActioningRoomId(null)
    if (error) { alert(error.message); return }
    await fetchRooms()
    navigate(`/rooms/${room.id}`)
  }

  const handleLeave = async (room) => {
    if (actioningRoomId) return
    if (!confirm(`Leave "${room.name}"? You can rejoin any time.`)) return
    setActioningRoomId(room.id)
    const { error } = await supabase
      .from('room_participants')
      .delete()
      .eq('room_id', room.id)
      .eq('profile_id', user.id)
    setActioningRoomId(null)
    if (error) { alert(error.message); return }
    await fetchRooms()
  }

  const handleDelete = async (room) => {
    if (actioningRoomId) return
    const ok = confirm(
      `Delete "${room.name}"?\n\n` +
      `This permanently removes the room along with its messages, ` +
      `documents, and participants. This cannot be undone.`
    )
    if (!ok) return
    setActioningRoomId(room.id)
    const { error } = await supabase
      .from('conversation_rooms')
      .delete()
      .eq('id', room.id)
    setActioningRoomId(null)
    if (error) { alert(error.message); return }
    await fetchRooms()
    navigate('/rooms')
  }

  const activeRoom = id ? rooms.find(r => String(r.id) === id) : null

  if (id && !loading && !activeRoom) {
    return (
      <div className="placeholder-page">
        <h2>Room not found</h2>
        <p><button className="cr-cancel" onClick={() => navigate('/rooms')}>Back to all rooms</button></p>
      </div>
    )
  }

  if (activeRoom) {
    return (
      <RoomDetail
        room={activeRoom}
        user={user}
        onBack={() => navigate('/rooms')}
        onJoin={() => handleJoin(activeRoom)}
        onLeave={() => handleLeave(activeRoom)}
        onDelete={() => handleDelete(activeRoom)}
        joining={actioningRoomId === activeRoom.id}
      />
    )
  }

  const myRooms = rooms.filter(r =>
    !r.is_public && (r.participants || []).some(p => p.profile_id === user.id)
  )
  const publicRooms = rooms.filter(r => r.is_public)

  return (
    <div className="conversationrooms-page">
      <div className="cr-header">
        <div>
          <h2>Conversation Rooms</h2>
          <p className="cr-subtitle">
            {myRooms.length} private &middot; {publicRooms.length} public
          </p>
        </div>
        <button className="cr-create-btn" onClick={() => setShowCreate(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          New Conversation Room
        </button>
      </div>

      {showCreate && (
        <div className="cr-create-form">
          <h3>Create Conversation Room</h3>
          <div className="cr-form-row">
            <div className="cr-form-group">
              <label>Room Name</label>
              <input placeholder="e.g., Solar Farm JV — 200MW" value={newRoom.name} onChange={e => setNewRoom({ ...newRoom, name: e.target.value })} />
            </div>
            <div className="cr-form-group">
              <label>Sector</label>
              <SectorPicker
                value={newRoom.sector}
                otherValue={newRoom.sector_other}
                onChange={v => setNewRoom({ ...newRoom, sector: v })}
                onOtherChange={v => setNewRoom({ ...newRoom, sector_other: v })}
                otherClassName="cr-sector-other-input"
              />
            </div>
          </div>

          {canPublish && (
            <div className="cr-nda-row">
              <label className="cr-nda-toggle">
                <input
                  type="checkbox"
                  checked={newRoom.is_public}
                  onChange={e => setNewRoom({ ...newRoom, is_public: e.target.checked })}
                />
                <span className="cr-nda-track" aria-hidden="true">
                  <span className="cr-nda-knob" />
                </span>
                <span className="cr-nda-label">Make this room public</span>
              </label>
              <div className="cr-nda-hint">
                Public rooms appear in the Public Rooms list. Anyone can browse,
                read, and join. Description is required so people know what
                they're joining.
              </div>
            </div>
          )}

          {newRoom.is_public && canPublish && (
            <div className="cr-form-group" style={{ marginTop: 14 }}>
              <label>Description</label>
              <textarea
                className="cr-description-input"
                placeholder="What's this room for? Who is it for? What kind of discussion fits here?"
                value={newRoom.description}
                onChange={e => setNewRoom({ ...newRoom, description: e.target.value })}
                rows={3}
                maxLength={400}
              />
            </div>
          )}

          <div className="cr-nda-row">
            <label className="cr-nda-toggle">
              <input
                type="checkbox"
                checked={newRoom.requires_nda}
                onChange={e => setNewRoom({ ...newRoom, requires_nda: e.target.checked })}
              />
              <span className="cr-nda-track" aria-hidden="true">
                <span className="cr-nda-knob" />
              </span>
              <span className="cr-nda-label">Require NDA</span>
            </label>
            <div className="cr-nda-hint">
              Compound NDA is coming soon. This will require all participants
              to sign a standardized NDA before accessing room files.
            </div>
          </div>

          <div className="cr-form-actions">
            <button className="cr-cancel" onClick={() => setShowCreate(false)}>Cancel</button>
            <button
              className="cr-submit"
              onClick={handleCreate}
              disabled={creating || !newRoom.name.trim() || (newRoom.is_public && !newRoom.description.trim())}
            >
              {creating ? 'Creating…' : 'Create Room'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="cr-empty">Loading rooms…</div>
      ) : (
        <div className="cr-columns">
          <section className="cr-column">
            <div className="cr-column-head">
              <h3>Your Rooms</h3>
              <span className="cr-column-count">{myRooms.length}</span>
            </div>
            {myRooms.length === 0 ? (
              <div className="cr-empty">
                No private rooms yet. Click <strong>New Conversation Room</strong> to create one.
              </div>
            ) : (
              <div className="cr-list cr-list-stack">
                {myRooms.map(room => (
                  <PrivateRoomCard
                    key={room.id}
                    room={room}
                    onOpen={() => navigate(`/rooms/${room.id}`)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="cr-column">
            <div className="cr-column-head">
              <h3>Public Rooms</h3>
              <span className="cr-column-count">{publicRooms.length}</span>
            </div>
            {publicRooms.length === 0 ? (
              <div className="cr-empty">No public rooms available yet.</div>
            ) : (
              <div className="cr-list cr-list-stack">
                {publicRooms.map(room => {
                  const joined = (room.participants || []).some(p => p.profile_id === user.id)
                  const isOwner = room.created_by === user.id
                  return (
                    <PublicRoomCard
                      key={room.id}
                      room={room}
                      joined={joined}
                      isOwner={isOwner}
                      busy={actioningRoomId === room.id}
                      onPreview={() => navigate(`/rooms/${room.id}`)}
                      onJoin={() => handleJoin(room)}
                      onLeave={() => handleLeave(room)}
                    />
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function PrivateRoomCard({ room, onOpen }) {
  const participants = room.participants || []
  const docCount = room.document_count?.[0]?.count || 0
  const milestones = deriveMilestones(room.status)
  return (
    <div className="cr-card" onClick={onOpen}>
      <div className="cr-card-top">
        <div className="cr-card-sector" style={{ color: sectorTheme(room.sector).cardColor }}>{sectorBadge(room.sector)}</div>
        <div className={`cr-card-status ${room.status}`}>{statusLabel(room.status)}</div>
      </div>
      <div className="cr-card-name">{room.name}</div>
      <div className="cr-card-progress">
        {milestones.map((m, i) => (
          <div key={i} className={`cr-milestone-dot ${m.done ? 'done' : ''} ${m.current ? 'current' : ''}`} title={m.label} />
        ))}
        <div className="cr-progress-line">
          <div className="cr-progress-fill" style={{ width: `${(milestones.filter(m => m.done).length / milestones.length) * 100}%` }} />
        </div>
      </div>
      <div className="cr-card-participants">
        {participants.slice(0, 4).map((p, i) => (
          <div key={i} className="cr-participant-mini" title={p.profile?.display_name}>{makeInitials(p.profile?.display_name)}</div>
        ))}
        <span className="cr-participant-count">{participants.length} participant{participants.length === 1 ? '' : 's'}</span>
      </div>
      <div className="cr-card-meta">
        <span>{docCount} document{docCount === 1 ? '' : 's'}</span>
        <span>&middot;</span>
        <span>{timeAgo(room.created_at)}</span>
      </div>
    </div>
  )
}

function PublicRoomCard({ room, joined, isOwner, busy, onPreview, onJoin, onLeave }) {
  const participants = room.participants || []
  return (
    <div className="cr-card cr-card-public">
      <div className="cr-card-top">
        <div className="cr-card-sector" style={{ color: sectorTheme(room.sector).cardColor }}>{sectorBadge(room.sector)}</div>
        <div className="cr-public-badge">PUBLIC</div>
      </div>
      <div className="cr-card-name">{room.name}</div>
      {room.description && (
        <p className="cr-card-description">{room.description}</p>
      )}
      <div className="cr-card-participants">
        {participants.slice(0, 4).map((p, i) => (
          <div key={i} className="cr-participant-mini" title={p.profile?.display_name}>{makeInitials(p.profile?.display_name)}</div>
        ))}
        <span className="cr-participant-count">{participants.length} member{participants.length === 1 ? '' : 's'}</span>
      </div>
      <div className="cr-card-meta">
        <span>Last active {timeAgo(room.created_at)}</span>
      </div>
      <div className="cr-card-actions">
        <button className="cr-card-action cr-preview" onClick={onPreview}>
          Preview
        </button>
        {joined ? (
          isOwner ? (
            <button className="cr-card-action cr-owner-tag" disabled title="You created this room">Owner</button>
          ) : (
            <button className="cr-card-action cr-leave" onClick={onLeave} disabled={busy}>
              {busy ? 'Leaving…' : 'Leave'}
            </button>
          )
        ) : (
          <button className="cr-card-action cr-join" onClick={onJoin} disabled={busy}>
            {busy ? 'Joining…' : 'Join'}
          </button>
        )}
      </div>
    </div>
  )
}

function formatBytes(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

const ACCEPTED_DOC_TYPES = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.md',
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
].join(',')

function RoomDetail({ room, user, onBack, onJoin, onLeave, onDelete, joining }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [participants, setParticipants] = useState([])
  const [documents, setDocuments] = useState([])
  const [messages, setMessages] = useState([])
  const [creator, setCreator] = useState(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const fileInputRef = useRef(null)

  // Preview mode = viewing a public room as a non-participant. RLS already
  // blocks private rooms from non-participants, so this can only be a
  // public room. We use it to render read-only chrome (no upload/invite,
  // no message composer, swap the header CTA for Join).
  const isParticipant = participants.some(p => p.profile?.id === user.id)
  const isOwner = room.created_by === user.id
  const previewMode = !isParticipant && room.is_public

  const fetchAll = useCallback(async () => {
    const [partsRes, docsRes, msgsRes] = await Promise.all([
      supabase
        .from('room_participants')
        .select('id, role, profile:profiles!profile_id(id, display_name, headline, sector, avatar_url)')
        .eq('room_id', room.id),
      supabase
        .from('room_documents')
        .select('id, file_name, file_size, storage_path, created_at, uploader:profiles!uploaded_by(id, display_name)')
        .eq('room_id', room.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('room_messages')
        .select('id, content, created_at, sender:profiles!sender_id(id, display_name)')
        .eq('room_id', room.id)
        .order('created_at', { ascending: true }),
    ])
    setParticipants(partsRes.data || [])
    setDocuments(docsRes.data || [])
    setMessages(msgsRes.data || [])

    const { data: c } = await supabase.from('profiles').select('display_name').eq('id', room.created_by).single()
    setCreator(c)
  }, [room.id, room.created_by])

  const handleFileChosen = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      // Sanitize filename: strip path separators, keep dots/dashes/underscores.
      const cleanName = file.name.replace(/[/\\]/g, '_')
      const path = `${room.id}/${Date.now()}-${cleanName}`
      const { error: upErr } = await supabase.storage
        .from('room-documents')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || undefined,
        })
      if (upErr) throw upErr
      const { error: insErr } = await supabase.from('room_documents').insert({
        room_id: room.id,
        uploaded_by: user.id,
        file_name: file.name,
        file_size: file.size,
        storage_path: path,
      })
      if (insErr) throw insErr
      await fetchAll()
    } catch (err) {
      setUploadError(err.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = async (doc) => {
    if (!doc.storage_path) return
    const { data, error } = await supabase.storage
      .from('room-documents')
      .createSignedUrl(doc.storage_path, 60)
    if (error || !data?.signedUrl) {
      alert('Could not generate a download link.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  useEffect(() => { fetchAll() }, [fetchAll])

  const milestones = deriveMilestones(room.status)
  const activity = creator ? [{ who: creator.display_name, what: 'created this room', when: timeAgo(room.created_at) }] : []

  return (
    <div className="room-detail">
      <div className="room-detail-header">
        <button className="room-back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          All Conversation Rooms
        </button>
        <div className="room-title-row">
          <div>
            <div className="room-sector" style={{ color: sectorTheme(room.sector).cardColor }}>{sectorBadge(room.sector)}</div>
            <h2>{room.name}</h2>
            <div className="room-value">{statusLabel(room.status)}</div>
          </div>
          <div className="room-header-actions">
            {previewMode ? (
              <button
                className="room-join-btn"
                onClick={onJoin}
                disabled={joining}
                title="Join this public room"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>
                {joining ? 'Joining…' : 'Join Room'}
              </button>
            ) : (
              <>
                <button className="room-video-btn" onClick={() => setShowScheduleModal(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
                  Video Meeting
                </button>
                <button className="room-invite-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>
                  Invite
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_DOC_TYPES}
                  style={{ display: 'none' }}
                  onChange={handleFileChosen}
                />
                <button
                  className="room-upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  title="Upload a document"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
                {room.is_public && !isOwner && (
                  <button
                    className="room-leave-btn"
                    onClick={onLeave}
                    disabled={joining}
                    title="Leave this public room"
                  >
                    {joining ? 'Leaving…' : 'Leave'}
                  </button>
                )}
                {isOwner && (
                  <button
                    className="room-delete-btn"
                    onClick={onDelete}
                    disabled={joining}
                    title="Permanently delete this room"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></svg>
                    {joining ? 'Deleting…' : 'Delete'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        {previewMode && (
          <div className="room-preview-banner">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
            You're previewing this public room. Join to participate.
          </div>
        )}
      </div>

      <div className="room-tabs">
        {['overview', 'conversation', 'documents', 'participants', 'activity'].map(tab => (
          <button key={tab} className={`room-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="room-content">
        {activeTab === 'overview' && (
          <div className="room-overview">
            <div className="room-overview-main">
              <div className="room-section">
                <h3>Progress</h3>
                <div className="room-milestones">
                  {milestones.map((m, i) => (
                    <div key={i} className={`room-ms ${m.done ? 'done' : ''} ${m.current ? 'current' : ''}`}>
                      <div className="room-ms-indicator">
                        {m.done ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                        ) : (
                          <div className="room-ms-circle" />
                        )}
                      </div>
                      <span>{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="room-section">
                <h3>Recent Activity</h3>
                {activity.length === 0 ? (
                  <div className="room-empty">No activity yet.</div>
                ) : activity.map((a, i) => (
                  <div key={i} className="room-activity-item">
                    <div className="room-activity-dot" />
                    <div>
                      <span className="room-activity-who">{a.who}</span> {a.what}
                      <div className="room-activity-when">{a.when}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="room-overview-side">
              <div className="room-section">
                <h3>Participants</h3>
                {participants.length === 0 ? (
                  <div className="room-empty">No participants.</div>
                ) : participants.map(p => (
                  <div key={p.id} className="room-participant">
                    <div className="room-participant-avatar">{makeInitials(p.profile?.display_name)}</div>
                    <div>
                      <div className="room-participant-name">{p.profile?.display_name || 'Unknown'}</div>
                      <div className="room-participant-role">{p.role === 'owner' ? 'Owner' : (p.profile?.headline || 'Member')}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="room-section">
                <h3>Key Documents</h3>
                {documents.length === 0 ? (
                  <div className="room-empty">No documents yet.</div>
                ) : documents.slice(0, 5).map(d => (
                  <button key={d.id} className="room-doc" onClick={() => handleDownload(d)} title="Download">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    <div>
                      <div className="room-doc-name">{d.file_name}</div>
                      <div className="room-doc-meta">{formatBytes(d.file_size)} &middot; {timeAgo(d.created_at)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'conversation' && (
          <ConversationTab
            roomId={room.id}
            user={user}
            messages={messages}
            onSent={fetchAll}
            readOnly={previewMode}
          />
        )}

        {activeTab === 'documents' && (
          <div className="room-documents-tab">
            {uploadError && (
              <div className="room-doc-error">{uploadError}</div>
            )}
            {documents.length === 0 ? (
              <div className="room-empty">No documents uploaded yet. Click <strong>Upload</strong> to add one.</div>
            ) : documents.map(d => (
              <div key={d.id} className="room-doc-row">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                <div className="room-doc-row-info">
                  <div className="room-doc-row-name">{d.file_name}</div>
                  <div className="room-doc-row-meta">
                    {formatBytes(d.file_size)} &middot; Uploaded by {d.uploader?.display_name || 'someone'} &middot; {timeAgo(d.created_at)}
                  </div>
                </div>
                <button className="room-doc-download" onClick={() => handleDownload(d)} disabled={!d.storage_path}>
                  Download
                </button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'participants' && (
          <div className="room-participants-tab">
            {participants.length === 0 ? (
              <div className="room-empty">No participants.</div>
            ) : participants.map(p => (
              <div key={p.id} className="room-participant-row">
                <div className="room-participant-avatar lg">{makeInitials(p.profile?.display_name)}</div>
                <div>
                  <div className="room-participant-name">{p.profile?.display_name || 'Unknown'}</div>
                  <div className="room-participant-role">{p.role === 'owner' ? 'Owner' : (p.profile?.headline || 'Member')}</div>
                </div>
                <button className="btn-message-sm">Message</button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="room-activity-tab">
            {activity.length === 0 ? (
              <div className="room-empty">No activity yet.</div>
            ) : activity.map((a, i) => (
              <div key={i} className="room-activity-item full">
                <div className="room-activity-dot" />
                <div>
                  <span className="room-activity-who">{a.who}</span> {a.what}
                  <div className="room-activity-when">{a.when}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ScheduleMeetingModal
        open={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        user={user}
        presetTitle={`${room.name} — Video Meeting`}
        presetParticipants={participants
          .map(p => p.profile)
          .filter(Boolean)
          .filter(p => p.id !== user.id)}
        presetRoomId={room.id}
      />
    </div>
  )
}

function ConversationTab({ roomId, user, messages, onSent, readOnly }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    const content = text.trim()
    if (!content || sending) return
    setSending(true)
    const { error } = await supabase.from('room_messages').insert({
      room_id: roomId,
      sender_id: user.id,
      content,
    })
    setSending(false)
    if (error) { alert(error.message); return }
    setText('')
    onSent?.()
  }

  return (
    <div className="room-conv-tab">
      <div className="room-conv-list">
        {messages.length === 0 ? (
          <div className="room-empty">
            {readOnly ? 'No messages yet.' : 'No messages yet. Start the conversation.'}
          </div>
        ) : messages.map(m => {
          const mine = m.sender?.id === user.id
          return (
            <div key={m.id} className={`room-conv-msg ${mine ? 'sent' : 'received'}`}>
              {!mine && <div className="room-conv-sender">{m.sender?.display_name || 'Unknown'}</div>}
              <div className="room-conv-bubble">{m.content}</div>
              <div className="room-conv-time">{timeAgo(m.created_at)}</div>
            </div>
          )
        })}
      </div>
      {readOnly ? (
        <div className="room-conv-readonly">
          Join this room to participate in the conversation.
        </div>
      ) : (
        <div className="room-conv-input-row">
          <input
            placeholder="Type a message..."
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
          />
          <button onClick={send} disabled={sending || !text.trim()}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      )}
    </div>
  )
}

export default ConversationRooms

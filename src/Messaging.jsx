import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { makeInitials, sectorTheme, timeAgo } from './format'
import ScheduleMeetingModal from './ScheduleMeetingModal'
import './Messaging.css'

function buildConversationsFromMessages(rows, meId) {
  const map = new Map()
  for (const m of rows) {
    const isMine = m.sender_id === meId
    const otherId = isMine ? m.recipient_id : m.sender_id
    const otherProfile = isMine ? m.recipient : m.sender
    if (!map.has(otherId)) {
      map.set(otherId, {
        otherId,
        otherProfile,
        lastMessage: m.content,
        lastTime: m.created_at,
        lastSenderIsMe: isMine,
        unread: !isMine && !m.is_read ? 1 : 0,
      })
    } else if (!isMine && !m.is_read) {
      const existing = map.get(otherId)
      existing.unread += 1
    }
  }
  return Array.from(map.values()).sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime))
}

function Messaging({ user }) {
  const { id: paramOtherId } = useParams()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState([])
  const [loadingConvos, setLoadingConvos] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const [activeMessages, setActiveMessages] = useState([])
  const [activeProfile, setActiveProfile] = useState(null)
  const [loadingActive, setLoadingActive] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [roomContext, setRoomContext] = useState(null)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerProfiles, setPickerProfiles] = useState([])
  const [pickerQuery, setPickerQuery] = useState('')

  const [showScheduleModal, setShowScheduleModal] = useState(false)

  const messagesEndRef = useRef(null)

  const fetchConversations = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        id, sender_id, recipient_id, content, room_context_id, is_read, created_at,
        sender:profiles!sender_id(id, display_name, sector, avatar_url),
        recipient:profiles!recipient_id(id, display_name, sector, avatar_url)
      `)
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) {
      console.warn('Conversations fetch failed:', error.message)
      return
    }
    setConversations(buildConversationsFromMessages(data || [], user.id))
  }, [user.id])

  useEffect(() => {
    fetchConversations().finally(() => setLoadingConvos(false))
  }, [fetchConversations])

  // Fetch active conversation's messages and room context
  useEffect(() => {
    let active = true
    if (!paramOtherId) {
      setActiveMessages([])
      setActiveProfile(null)
      setRoomContext(null)
      return
    }

    const fetchActive = async () => {
      setLoadingActive(true)
      const [{ data: profile }, { data: msgs, error: msgsErr }] = await Promise.all([
        supabase.from('profiles').select('id, display_name, sector, headline, avatar_url, account_type').eq('id', paramOtherId).maybeSingle(),
        supabase
          .from('messages')
          .select('id, sender_id, recipient_id, content, room_context_id, is_read, created_at')
          .or(`and(sender_id.eq.${user.id},recipient_id.eq.${paramOtherId}),and(sender_id.eq.${paramOtherId},recipient_id.eq.${user.id})`)
          .order('created_at', { ascending: true }),
      ])
      if (!active) return
      if (msgsErr) console.warn('Active messages fetch failed:', msgsErr.message)
      setActiveProfile(profile || null)
      setActiveMessages(msgs || [])

      // Find the most recent message with a room_context_id and fetch room name.
      const ctx = [...(msgs || [])].reverse().find(m => m.room_context_id)
      if (ctx) {
        const { data: room } = await supabase
          .from('conversation_rooms')
          .select('id, name')
          .eq('id', ctx.room_context_id)
          .maybeSingle()
        if (active) setRoomContext(room || null)
      } else {
        setRoomContext(null)
      }

      // Mark received messages as read
      const unreadIds = (msgs || []).filter(m => m.recipient_id === user.id && !m.is_read).map(m => m.id)
      if (unreadIds.length > 0) {
        supabase.from('messages').update({ is_read: true }).in('id', unreadIds)
          .then(() => { if (active) fetchConversations() })
      }

      setLoadingActive(false)
    }

    fetchActive()
    return () => { active = false }
  }, [paramOtherId, user.id, fetchConversations])

  // Auto-scroll to bottom when active messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeMessages])

  // Realtime: subscribe to inserts where I'm the recipient
  useEffect(() => {
    const channel = supabase
      .channel(`messages-recipient-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `recipient_id=eq.${user.id}`,
      }, async (payload) => {
        const m = payload.new
        // Refresh conversation list
        fetchConversations()
        // If I'm currently viewing the conversation with this sender, append the message
        if (paramOtherId && m.sender_id === paramOtherId) {
          setActiveMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
          // Mark this one as read since the user is actively viewing the thread.
          supabase.from('messages').update({ is_read: true }).eq('id', m.id).then(() => fetchConversations())
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user.id, paramOtherId, fetchConversations])

  const sendMessage = async () => {
    const content = messageText.trim()
    if (!content || sending || !paramOtherId) return
    setSending(true)
    const { data, error } = await supabase
      .from('messages')
      .insert({ sender_id: user.id, recipient_id: paramOtherId, content })
      .select()
      .single()
    setSending(false)
    if (error) { alert(error.message); return }
    setMessageText('')
    if (data) {
      setActiveMessages(prev => prev.some(x => x.id === data.id) ? prev : [...prev, data])
    }
    fetchConversations()
  }

  const openPicker = async () => {
    setPickerOpen(true)
    setPickerQuery('')
    if (pickerProfiles.length === 0) {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, sector, headline')
        .neq('id', user.id)
        .order('display_name')
      setPickerProfiles(data || [])
    }
  }

  const pickProfile = (p) => {
    setPickerOpen(false)
    setPickerQuery('')
    navigate(`/messages/${p.id}`)
  }

  const filteredConvos = conversations.filter(c => {
    const q = searchQuery.toLowerCase()
    return !q || (c.otherProfile?.display_name || '').toLowerCase().includes(q)
  })

  const filteredPicker = pickerProfiles.filter(p => {
    const q = pickerQuery.toLowerCase()
    return !q || (p.display_name || '').toLowerCase().includes(q)
  })

  const otherSectorTheme = sectorTheme(activeProfile?.sector)

  return (
    <div className={`messaging-layout ${paramOtherId ? 'active-chat' : 'no-chat'}`}>
      <div className="convo-list">
        <div className="convo-list-header">
          <h3>Messages</h3>
          <button className="compose-btn" title="New message" onClick={openPicker}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
        </div>
        <div className="convo-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5A6478" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="convo-items">
          {loadingConvos ? (
            <div className="convo-empty">Loading…</div>
          ) : filteredConvos.length === 0 ? (
            <div className="convo-empty">
              {conversations.length === 0
                ? 'No messages yet. Start a conversation from someone’s profile or the Network page.'
                : 'No conversations match.'}
            </div>
          ) : filteredConvos.map(c => {
            const theme = sectorTheme(c.otherProfile?.sector)
            const name = c.otherProfile?.display_name || 'Unknown'
            const isActive = paramOtherId === c.otherId
            return (
              <div
                key={c.otherId}
                className={`convo-item ${isActive ? 'active' : ''}`}
                onClick={() => navigate(`/messages/${c.otherId}`)}
              >
                <div className="convo-avatar" style={{ background: theme.sectorColor, color: theme.sectorText }}>
                  {makeInitials(name)}
                </div>
                <div className="convo-info">
                  <div className="convo-top">
                    <span className="convo-name">{name}</span>
                    <span className="convo-time">{timeAgo(c.lastTime)}</span>
                  </div>
                  <div className="convo-preview">
                    {c.lastSenderIsMe ? 'You: ' : ''}{c.lastMessage}
                  </div>
                </div>
                {c.unread > 0 && <div className="convo-unread">{c.unread}</div>}
              </div>
            )
          })}
        </div>

        {pickerOpen && (
          <div className="convo-picker-overlay" onClick={() => setPickerOpen(false)}>
            <div className="convo-picker" onClick={e => e.stopPropagation()}>
              <div className="convo-picker-header">
                <h4>Start a new message</h4>
                <button className="convo-picker-close" onClick={() => setPickerOpen(false)}>×</button>
              </div>
              <input
                className="convo-picker-search"
                autoFocus
                placeholder="Search people..."
                value={pickerQuery}
                onChange={e => setPickerQuery(e.target.value)}
              />
              <div className="convo-picker-list">
                {filteredPicker.length === 0 ? (
                  <div className="convo-empty">No matches.</div>
                ) : filteredPicker.map(p => {
                  const theme = sectorTheme(p.sector)
                  return (
                    <div key={p.id} className="convo-picker-item" onClick={() => pickProfile(p)}>
                      <div className="convo-avatar" style={{ background: theme.sectorColor, color: theme.sectorText }}>
                        {makeInitials(p.display_name)}
                      </div>
                      <div>
                        <div className="convo-picker-name">{p.display_name}</div>
                        <div className="convo-picker-headline">{p.headline || 'Professional'}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="chat-area">
        {!paramOtherId ? (
          <div className="chat-placeholder">
            <p>Select a conversation or start a new one.</p>
          </div>
        ) : !activeProfile ? (
          loadingActive
            ? <div className="chat-placeholder"><p>Loading conversation…</p></div>
            : <div className="chat-placeholder"><p>Profile not found.</p></div>
        ) : (
          <>
            <div className="chat-header">
              <div className="chat-header-left">
                <button
                  className="chat-back-mobile"
                  onClick={() => navigate('/messages')}
                  aria-label="Back to conversations"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <div
                  className={`chat-header-avatar ${activeProfile.account_type === 'company' ? 'chat-header-avatar-company' : ''}`}
                  style={{ background: otherSectorTheme.sectorColor, color: otherSectorTheme.sectorText }}
                >
                  {makeInitials(activeProfile.display_name)}
                </div>
                <div>
                  <div className="chat-header-name">{activeProfile.display_name}</div>
                  <div className="chat-header-sector">{(activeProfile.sector || 'general').toUpperCase()}</div>
                </div>
              </div>
              <div className="chat-header-actions">
                <button title="Schedule a voice meeting" onClick={() => setShowScheduleModal(true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                </button>
                <button title="Schedule a video meeting" onClick={() => setShowScheduleModal(true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
                </button>
                <button title="More options">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
                </button>
              </div>
            </div>

            {roomContext && (
              <div className="chat-room-context" onClick={() => navigate(`/rooms/${roomContext.id}`)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                In conversation room: <strong>{roomContext.name}</strong>
              </div>
            )}

            <div className="chat-messages">
              {activeMessages.length === 0 ? (
                <div className="chat-empty">Start the conversation.</div>
              ) : activeMessages.map(m => (
                <div key={m.id} className={`chat-msg ${m.sender_id === user.id ? 'sent' : 'received'}`}>
                  <div className="chat-bubble">{m.content}</div>
                  <div className="chat-time">{timeAgo(m.created_at)}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-area">
              <button className="attach-btn" title="Attach file">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
              </button>
              <input
                type="text"
                placeholder="Type a message..."
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
              />
              <button className="send-btn" onClick={sendMessage} disabled={sending || !messageText.trim()}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
              </button>
            </div>
          </>
        )}
      </div>

      <ScheduleMeetingModal
        open={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        user={user}
        presetTitle={activeProfile ? `Meeting with ${activeProfile.display_name}` : ''}
        presetParticipants={activeProfile && activeProfile.id !== user.id ? [{
          id: activeProfile.id,
          display_name: activeProfile.display_name,
          sector: activeProfile.sector,
          avatar_url: activeProfile.avatar_url,
        }] : []}
      />
    </div>
  )
}

export default Messaging

import { useState } from 'react'
import './Messaging.css'

const CONVERSATIONS = [
  {
    id: 1, name: 'Aker BP', initials: 'AB',
    bg: 'var(--green-glow)', color: 'var(--green)',
    sector: 'ENERGY', online: true,
    lastMessage: 'Re: Offshore wind partnership — we can schedule a call next week to discuss the mooring system specifications.',
    time: '2m',
    messages: [
      { from: 'them', text: 'Hi, we saw your post about the North Sea floating wind project. Aker BP has extensive experience with mooring systems.', time: '10:14 AM' },
      { from: 'me', text: 'Great to hear from you. What capacity range do your mooring solutions support?', time: '10:22 AM' },
      { from: 'them', text: 'We handle up to 600MW floating installations. Our latest deployment in the Norwegian Continental Shelf was 450MW.', time: '10:25 AM' },
      { from: 'me', text: 'That fits our target. Can we set up a technical call to discuss specs?', time: '10:31 AM' },
      { from: 'them', text: 'Re: Offshore wind partnership — we can schedule a call next week to discuss the mooring system specifications.', time: '10:33 AM' },
    ]
  },
  {
    id: 2, name: 'SiemensX', initials: 'SX',
    bg: 'var(--navy-glow)', color: 'var(--accent-line)',
    sector: 'MANUFACTURING', online: true,
    lastMessage: 'Hydrogen electrolyzer specs attached. 20MW PEM unit, delivery Q3 2027.',
    time: '1h',
    messages: [
      { from: 'them', text: 'Following up on our conversation at the Hamburg conference. Here are the electrolyzer specs you requested.', time: '9:05 AM' },
      { from: 'me', text: 'Thanks — what is the efficiency rating at full load?', time: '9:12 AM' },
      { from: 'them', text: 'Hydrogen electrolyzer specs attached. 20MW PEM unit, delivery Q3 2027.', time: '9:15 AM' },
    ]
  },
  {
    id: 3, name: 'Terra Firma Capital', initials: 'TF',
    bg: 'rgba(245,158,11,0.15)', color: 'var(--amber)',
    sector: 'FINANCE', online: false,
    lastMessage: 'Due diligence on the LNG terminal — can your team provide the environmental impact assessment by Friday?',
    time: '3h',
    messages: [
      { from: 'them', text: 'We are interested in co-investing in the Mozambique LNG terminal project. What is the current valuation?', time: 'Yesterday' },
      { from: 'me', text: 'Current enterprise value is around $2.1B. We can share the full term sheet in our deal room.', time: 'Yesterday' },
      { from: 'them', text: 'Due diligence on the LNG terminal — can your team provide the environmental impact assessment by Friday?', time: '8:42 AM' },
    ]
  },
  {
    id: 4, name: 'Vestas Wind Systems', initials: 'VW',
    bg: 'var(--green-glow)', color: 'var(--green)',
    sector: 'ENERGY', online: false,
    lastMessage: 'Turbine supply agreement draft is ready for review.',
    time: '1d',
    messages: [
      { from: 'them', text: 'We can offer 15MW turbines for the Baltic Sea project. Lead time is 18 months.', time: 'Mon' },
      { from: 'me', text: 'What about O&M packages? We need 25-year lifecycle coverage.', time: 'Mon' },
      { from: 'them', text: 'Turbine supply agreement draft is ready for review.', time: 'Tue' },
    ]
  },
  {
    id: 5, name: 'BHP Group', initials: 'BH',
    bg: 'var(--navy-glow)', color: 'var(--accent-line)',
    sector: 'MINING', online: true,
    lastMessage: 'Copper offtake agreement terms look good. Legal review in progress.',
    time: '2d',
    messages: [
      { from: 'me', text: 'BHP, are you open to a 5-year copper offtake at index pricing?', time: 'Sun' },
      { from: 'them', text: 'We can consider it. What annual volume are you targeting?', time: 'Sun' },
      { from: 'me', text: '30,000 mt/year with quarterly adjustments.', time: 'Mon' },
      { from: 'them', text: 'Copper offtake agreement terms look good. Legal review in progress.', time: 'Mon' },
    ]
  },
]

function Messaging({ user }) {
  const [activeConvo, setActiveConvo] = useState(CONVERSATIONS[0])
  const [messageText, setMessageText] = useState('')
  const [conversations, setConversations] = useState(CONVERSATIONS)
  const [searchQuery, setSearchQuery] = useState('')

  const sendMessage = () => {
    const text = messageText.trim()
    if (!text) return
    const newMsg = { from: 'me', text, time: 'now' }
    const updated = conversations.map(c =>
      c.id === activeConvo.id
        ? { ...c, messages: [...c.messages, newMsg], lastMessage: text, time: 'now' }
        : c
    )
    setConversations(updated)
    setActiveConvo({ ...activeConvo, messages: [...activeConvo.messages, newMsg], lastMessage: text, time: 'now' })
    setMessageText('')
  }

  const filtered = conversations.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="messaging-layout">
      <div className="convo-list">
        <div className="convo-list-header">
          <h3>Messages</h3>
          <button className="compose-btn" title="New message">
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
          {filtered.map(c => (
            <div
              key={c.id}
              className={`convo-item ${activeConvo.id === c.id ? 'active' : ''}`}
              onClick={() => setActiveConvo(c)}
            >
              <div className="convo-avatar" style={{ background: c.bg, color: c.color }}>
                {c.initials}
                {c.online && <div className="online-dot" />}
              </div>
              <div className="convo-info">
                <div className="convo-top">
                  <span className="convo-name">{c.name}</span>
                  <span className="convo-time">{c.time}</span>
                </div>
                <div className="convo-preview">{c.lastMessage}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="chat-area">
        <div className="chat-header">
          <div className="chat-header-left">
            <div className="chat-header-avatar" style={{ background: activeConvo.bg, color: activeConvo.color }}>
              {activeConvo.initials}
            </div>
            <div>
              <div className="chat-header-name">{activeConvo.name}</div>
              <div className="chat-header-sector">{activeConvo.sector} {activeConvo.online && <span className="status-online">Online</span>}</div>
            </div>
          </div>
          <div className="chat-header-actions">
            <button title="Voice call">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
            </button>
            <button title="Video call">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
            </button>
            <button title="More options">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
            </button>
          </div>
        </div>

        <div className="chat-messages">
          {activeConvo.messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.from === 'me' ? 'sent' : 'received'}`}>
              <div className="chat-bubble">{m.text}</div>
              <div className="chat-time">{m.time}</div>
            </div>
          ))}
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
          <button className="send-btn" onClick={sendMessage} disabled={!messageText.trim()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default Messaging

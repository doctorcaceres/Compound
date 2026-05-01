import { useState } from 'react'
import './DealRooms.css'

const SAMPLE_ROOMS = [
  {
    id: 1,
    name: 'North Sea Floating Wind — 500MW',
    status: 'active',
    sector: 'ENERGY',
    sectorColor: 'var(--green)',
    value: '$1.2B',
    stage: 'Due Diligence',
    participants: [
      { initials: 'EQ', name: 'Equinor ASA', role: 'Lead Developer' },
      { initials: 'AB', name: 'Aker BP', role: 'Mooring Systems' },
      { initials: 'VW', name: 'Vestas Wind', role: 'Turbine Supply' },
    ],
    documents: [
      { name: 'Project Overview.pdf', size: '2.4 MB', date: 'Mar 18' },
      { name: 'Environmental Impact Assessment.pdf', size: '8.1 MB', date: 'Mar 15' },
      { name: 'Financial Model v3.xlsx', size: '1.2 MB', date: 'Mar 12' },
    ],
    milestones: [
      { label: 'LOI Signed', done: true },
      { label: 'Due Diligence', done: false, current: true },
      { label: 'Term Sheet', done: false },
      { label: 'Close', done: false },
    ],
    activity: [
      { who: 'Equinor ASA', what: 'uploaded Environmental Impact Assessment.pdf', when: '2 hours ago' },
      { who: 'Aker BP', what: 'commented on mooring specifications', when: '5 hours ago' },
      { who: 'Vestas Wind', what: 'joined the deal room', when: '1 day ago' },
    ],
  },
  {
    id: 2,
    name: 'Green Steel Supply Agreement — SSAB',
    status: 'active',
    sector: 'MANUFACTURING',
    sectorColor: 'var(--amber)',
    value: '$340M',
    stage: 'Negotiation',
    participants: [
      { initials: 'AM', name: 'ArcelorMittal', role: 'Supplier' },
      { initials: 'ML', name: 'SSAB', role: 'Buyer' },
    ],
    documents: [
      { name: 'Supply Agreement Draft.docx', size: '540 KB', date: 'Mar 16' },
      { name: 'Quality Specifications.pdf', size: '1.8 MB', date: 'Mar 14' },
    ],
    milestones: [
      { label: 'Initial Contact', done: true },
      { label: 'Technical Review', done: true },
      { label: 'Negotiation', done: false, current: true },
      { label: 'Contract Signed', done: false },
    ],
    activity: [
      { who: 'ArcelorMittal', what: 'updated pricing terms', when: '3 hours ago' },
      { who: 'SSAB', what: 'requested quality certification', when: '1 day ago' },
    ],
  },
  {
    id: 3,
    name: 'Mozambique LNG Terminal — Phase 2',
    status: 'active',
    sector: 'ENERGY',
    sectorColor: 'var(--green)',
    value: '$2.1B',
    stage: 'LOI',
    participants: [
      { initials: 'TF', name: 'Terra Firma Capital', role: 'Lead Investor' },
      { initials: 'BH', name: 'BHP Group', role: 'Operator' },
    ],
    documents: [
      { name: 'Investment Memo.pdf', size: '3.2 MB', date: 'Mar 17' },
      { name: 'Preliminary Term Sheet.docx', size: '420 KB', date: 'Mar 10' },
    ],
    milestones: [
      { label: 'LOI', done: false, current: true },
      { label: 'Due Diligence', done: false },
      { label: 'Commitment', done: false },
      { label: 'Close', done: false },
    ],
    activity: [
      { who: 'Terra Firma Capital', what: 'submitted investment memo', when: '6 hours ago' },
    ],
  },
  {
    id: 4,
    name: 'Copper Recycling Offtake — Trafigura',
    status: 'invited',
    sector: 'COMMODITIES',
    sectorColor: 'var(--accent-line)',
    value: '$85M',
    stage: 'Initial Contact',
    participants: [
      { initials: 'TG', name: 'Trafigura Group', role: 'Buyer' },
    ],
    documents: [],
    milestones: [
      { label: 'Initial Contact', done: false, current: true },
      { label: 'Proposal', done: false },
      { label: 'Agreement', done: false },
    ],
    activity: [
      { who: 'Trafigura Group', what: 'invited you to this deal room', when: '2 days ago' },
    ],
  },
]

function DealRooms({ user }) {
  const [rooms] = useState(SAMPLE_ROOMS)
  const [activeRoom, setActiveRoom] = useState(null)
  const [filter, setFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [newRoom, setNewRoom] = useState({ name: '', sector: 'ENERGY', value: '' })

  if (activeRoom) {
    return <RoomDetail room={activeRoom} onBack={() => setActiveRoom(null)} user={user} />
  }

  const filtered = filter === 'all' ? rooms : rooms.filter(r => r.status === filter)

  return (
    <div className="dealrooms-page">
      <div className="dr-header">
        <div>
          <h2>Deal Rooms</h2>
          <p className="dr-subtitle">{rooms.length} active deals &middot; ${rooms.reduce((s, r) => s + parseFloat(r.value.replace(/[$B,M]/g, '')) * (r.value.includes('B') ? 1000 : 1), 0).toFixed(0)}M total pipeline</p>
        </div>
        <button className="dr-create-btn" onClick={() => setShowCreate(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          New Deal Room
        </button>
      </div>

      {showCreate && (
        <div className="dr-create-form">
          <h3>Create Deal Room</h3>
          <div className="dr-form-row">
            <div className="dr-form-group">
              <label>Deal Name</label>
              <input placeholder="e.g., Solar Farm JV — 200MW" value={newRoom.name} onChange={e => setNewRoom({ ...newRoom, name: e.target.value })} />
            </div>
            <div className="dr-form-group">
              <label>Sector</label>
              <select value={newRoom.sector} onChange={e => setNewRoom({ ...newRoom, sector: e.target.value })}>
                <option>ENERGY</option>
                <option>MANUFACTURING</option>
                <option>INFRASTRUCTURE</option>
                <option>MARITIME</option>
                <option>MINING</option>
                <option>FINANCE</option>
                <option>CLIMATE TECH</option>
                <option>DEFENSE</option>
              </select>
            </div>
            <div className="dr-form-group">
              <label>Est. Value</label>
              <input placeholder="e.g., $500M" value={newRoom.value} onChange={e => setNewRoom({ ...newRoom, value: e.target.value })} />
            </div>
          </div>
          <div className="dr-form-actions">
            <button className="dr-cancel" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="dr-submit" onClick={() => setShowCreate(false)}>Create Room</button>
          </div>
        </div>
      )}

      <div className="dr-filters">
        <button className={`dr-filter ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All Rooms</button>
        <button className={`dr-filter ${filter === 'active' ? 'active' : ''}`} onClick={() => setFilter('active')}>Active</button>
        <button className={`dr-filter ${filter === 'invited' ? 'active' : ''}`} onClick={() => setFilter('invited')}>Invited</button>
      </div>

      <div className="dr-list">
        {filtered.map(room => (
          <div key={room.id} className="dr-card" onClick={() => setActiveRoom(room)}>
            <div className="dr-card-top">
              <div className="dr-card-sector" style={{ color: room.sectorColor }}>{room.sector}</div>
              <div className={`dr-card-status ${room.status}`}>{room.status === 'invited' ? 'Invited' : room.stage}</div>
            </div>
            <div className="dr-card-name">{room.name}</div>
            <div className="dr-card-value">{room.value}</div>
            <div className="dr-card-progress">
              {room.milestones.map((m, i) => (
                <div key={i} className={`dr-milestone-dot ${m.done ? 'done' : ''} ${m.current ? 'current' : ''}`} title={m.label} />
              ))}
              <div className="dr-progress-line">
                <div className="dr-progress-fill" style={{ width: `${(room.milestones.filter(m => m.done).length / room.milestones.length) * 100}%` }} />
              </div>
            </div>
            <div className="dr-card-participants">
              {room.participants.map((p, i) => (
                <div key={i} className="dr-participant-mini" title={p.name}>{p.initials}</div>
              ))}
              <span className="dr-participant-count">{room.participants.length} participants</span>
            </div>
            <div className="dr-card-meta">
              <span>{room.documents.length} documents</span>
              <span>&middot;</span>
              <span>{room.activity[0]?.when}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RoomDetail({ room, onBack, user }) {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="room-detail">
      <div className="room-detail-header">
        <button className="room-back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          All Deal Rooms
        </button>
        <div className="room-title-row">
          <div>
            <div className="room-sector" style={{ color: room.sectorColor }}>{room.sector}</div>
            <h2>{room.name}</h2>
            <div className="room-value">{room.value} &middot; {room.stage}</div>
          </div>
          <div className="room-header-actions">
            <button className="room-invite-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>
              Invite
            </button>
            <button className="room-upload-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              Upload
            </button>
          </div>
        </div>
      </div>

      <div className="room-tabs">
        {['overview', 'documents', 'participants', 'activity'].map(tab => (
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
                <h3>Deal Progress</h3>
                <div className="room-milestones">
                  {room.milestones.map((m, i) => (
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
                {room.activity.map((a, i) => (
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
                {room.participants.map((p, i) => (
                  <div key={i} className="room-participant">
                    <div className="room-participant-avatar">{p.initials}</div>
                    <div>
                      <div className="room-participant-name">{p.name}</div>
                      <div className="room-participant-role">{p.role}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="room-section">
                <h3>Key Documents</h3>
                {room.documents.map((d, i) => (
                  <div key={i} className="room-doc">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    <div>
                      <div className="room-doc-name">{d.name}</div>
                      <div className="room-doc-meta">{d.size} &middot; {d.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'documents' && (
          <div className="room-documents-tab">
            {room.documents.map((d, i) => (
              <div key={i} className="room-doc-row">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                <div className="room-doc-row-info">
                  <div className="room-doc-row-name">{d.name}</div>
                  <div className="room-doc-row-meta">{d.size} &middot; Uploaded {d.date}</div>
                </div>
                <button className="room-doc-download">Download</button>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'participants' && (
          <div className="room-participants-tab">
            {room.participants.map((p, i) => (
              <div key={i} className="room-participant-row">
                <div className="room-participant-avatar lg">{p.initials}</div>
                <div>
                  <div className="room-participant-name">{p.name}</div>
                  <div className="room-participant-role">{p.role}</div>
                </div>
                <button className="btn-message-sm">Message</button>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'activity' && (
          <div className="room-activity-tab">
            {room.activity.map((a, i) => (
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
    </div>
  )
}

export default DealRooms

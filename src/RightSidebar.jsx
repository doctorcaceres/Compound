import './RightSidebar.css'

function RightSidebar({ onOpenMessages, onOpenDealRooms }) {
  return (
    <aside className="sidebar-right">

      <div className="widget">
        <div className="widget-header-row">
          <h4>Messages</h4>
          {onOpenMessages && <button className="widget-link" onClick={onOpenMessages}>View all</button>}
        </div>
        <div className="msg-item">
          <div className="msg-avatar" style={{ background: 'var(--green-glow)', color: 'var(--green)' }}>AB</div>
          <div>
            <div className="msg-name">Aker BP</div>
            <div className="msg-preview">Re: Offshore wind partnership...</div>
          </div>
          <div className="msg-time">2m</div>
        </div>
        <div className="msg-item">
          <div className="msg-avatar" style={{ background: 'var(--navy-glow)', color: 'var(--accent-line)' }}>SX</div>
          <div>
            <div className="msg-name">SiemensX</div>
            <div className="msg-preview">Hydrogen electrolyzer specs attached</div>
          </div>
          <div className="msg-time">1h</div>
        </div>
        <div className="msg-item">
          <div className="msg-avatar" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--amber)' }}>TF</div>
          <div>
            <div className="msg-name">Terra Firma Capital</div>
            <div className="msg-preview">Due diligence on the LNG terminal...</div>
          </div>
          <div className="msg-time">3h</div>
        </div>
      </div>

      <div className="widget">
        <h4>AI Intelligence Feed</h4>
        <div className="news-item">
          <div className="news-tag" style={{ color: 'var(--green)' }}>Energy</div>
          <div className="news-title">EU approves hydrogen corridor connecting Spain to Germany</div>
          <div className="news-source">Reuters &middot; 2 hours ago</div>
        </div>
        <div className="news-item">
          <div className="news-tag" style={{ color: 'var(--accent-line)' }}>Maritime</div>
          <div className="news-title">Maersk signs ammonia fuel supply deal with ADNOC for 2027</div>
          <div className="news-source">Lloyd's List &middot; 5 hours ago</div>
        </div>
        <div className="news-item">
          <div className="news-tag" style={{ color: 'var(--amber)' }}>Infrastructure</div>
          <div className="news-title">Saudi Arabia awards NEOM rail contract to consortium</div>
          <div className="news-source">Financial Times &middot; 8 hours ago</div>
        </div>
      </div>

      <div className="collab-cta">
        <h3>Start a Collaboration</h3>
        <p>Create a deal room, invite partners, and execute directly on Compound.</p>
        <button onClick={onOpenDealRooms}>Create Room</button>
      </div>

    </aside>
  )
}

export default RightSidebar

import { useState } from 'react'
import './Feed.css'

const SAMPLE_POSTS = [
  {
    name: 'Equinor ASA', initials: 'EQ', sector: 'ENERGY',
    sectorColor: 'var(--green-glow)', sectorText: 'var(--green)', bg: 'var(--navy)',
    body: 'We are looking for partners on our floating offshore wind project in the North Sea. 500MW capacity, operational target 2029. Companies with mooring systems expertise — reach out.',
    time: '4h', likes: 12, comments: 3,
  },
  {
    name: 'ArcelorMittal', initials: 'AM', sector: 'MANUFACTURING',
    sectorColor: 'rgba(245,158,11,0.15)', sectorText: 'var(--amber)', bg: '#2F3D25',
    body: 'Our green steel plant in Hamburg is now producing 100K tonnes/year using hydrogen-based DRI. Open to supply agreements with automotive and construction companies committed to Scope 3 reduction.',
    time: '6h', likes: 28, comments: 7,
  },
  {
    name: 'Trafigura Group', initials: 'TG', sector: 'COMMODITIES',
    sectorColor: 'var(--navy-glow)', sectorText: 'var(--accent-line)', bg: 'var(--navy-light)',
    body: "Launching a new copper sourcing desk focused on recycled feedstock. Processing capacity: 50K mt. Interested smelters and recyclers — let's connect on Compound.",
    time: '12h', likes: 19, comments: 5,
  },
]

function Post({ post }) {
  const [likes, setLikes] = useState(post.likes)

  return (
    <div className="post">
      <div className="post-header">
        <div className="post-avatar" style={{ background: post.bg }}>{post.initials}</div>
        <div className="post-meta">
          <div className="post-name">{post.name}</div>
          <div className="post-info">
            <span className="post-sector" style={{ background: post.sectorColor, color: post.sectorText }}>{post.sector}</span>
            <span>{post.time}</span>
          </div>
        </div>
      </div>
      <div className="post-body">{post.body}</div>
      <div className="post-actions">
        <button className="post-action" onClick={() => setLikes(likes + 1)}>&#9650; <span>{likes}</span></button>
        <button className="post-action">&#128172; <span>{post.comments}</span> replies</button>
        <button className="post-action">&#128279; Share</button>
        <button className="post-action">&#128278; Save</button>
      </div>
    </div>
  )
}

function Feed({ user }) {
  const [posts, setPosts] = useState(SAMPLE_POSTS)
  const [postText, setPostText] = useState('')

  const createPost = () => {
    const text = postText.trim()
    if (!text) return
    const newPost = {
      name: user.name,
      initials: user.initials,
      sector: (user.sector || 'GENERAL').toUpperCase(),
      sectorColor: 'var(--green-glow)',
      sectorText: 'var(--green)',
      bg: 'var(--navy)',
      body: text,
      time: 'now',
      likes: 0,
      comments: 0,
    }
    setPosts([newPost, ...posts])
    setPostText('')
  }

  return (
    <main className="feed-center">
      <div className="composer">
        <textarea
          placeholder="Share an update, opportunity, or insight with your sector..."
          maxLength={500}
          value={postText}
          onChange={e => setPostText(e.target.value)}
        />
        <div className="composer-bar">
          <div className="composer-actions">
            <button title="Attach document">&#128206;</button>
            <button title="Tag sector">&#127919;</button>
            <button title="Mark as opportunity">&#128176;</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="char-count">{postText.length}/500</span>
            <button className="btn-post" onClick={createPost}>Post</button>
          </div>
        </div>
      </div>

      <div className="feed-posts">
        {posts.map((p, i) => <Post key={i} post={p} />)}
      </div>
    </main>
  )
}

export default Feed

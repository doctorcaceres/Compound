import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { makeInitials, sectorTheme, sectorLabel, timeAgo } from './format'
import './Feed.css'

function fb(id, name, initials, sectorValue, body, time, likes, comments) {
  const t = sectorTheme(sectorValue)
  return {
    id,
    name,
    initials,
    sector: sectorLabel(sectorValue).toUpperCase(),
    sectorColor: t.sectorColor,
    sectorText: t.sectorText,
    bg: t.bg,
    body,
    time,
    likes,
    comments,
  }
}

export const FALLBACK_POSTS = [
  fb('sample-bio', 'Vesalia Bio', 'VB', 'biotech',
    'Wrapping up pre-clinical work on a continuous glucose monitoring patch and looking for academic or hospital research partners for a Phase I study. Endocrinology or cardiology groups especially welcome.',
    '2h', 24, 4),
  fb('sample-re', 'North Atrium Group', 'NA', 'realestate',
    "We're scoping a 280K sq ft mixed-use development in Austin — residential, ground-floor retail, and a small civic library. Looking for architecture firms with experience integrating public space into private projects.",
    '4h', 18, 6),
  fb('sample-law', 'Pierce Anders Wynn', 'PA', 'legal',
    'Excited to announce a dedicated AI Regulation practice. Coverage includes EU AI Act compliance, US state-level frameworks, and risk-based audits. Happy to chat if you’re starting a compliance roadmap.',
    '6h', 31, 8),
  fb('sample-tech', 'Lattice Cloud', 'LC', 'tech',
    'Beta is open: a usage-based billing engine for B2B SaaS that drops in alongside Stripe. Metered, tiered, hybrid — all supported. Looking for ~20 design partners running real workloads. DM if interested.',
    '7h', 42, 12),
  fb('sample-edu', 'Aalborg Materials Lab', 'AM', 'education',
    'Our group has developed a cellulose-based composite that performs comparably to PET in single-use packaging at lab scale. Looking for industry collaborators to co-fund pilot-scale extrusion trials this year.',
    '9h', 27, 5),
  fb('sample-agri', 'Field & Furrow', 'FF', 'agriculture',
    'After two seasons of trials our soil-moisture mesh network cut irrigation water by 31% with no yield loss. Opening up early access to row-crop growers in CA, AZ, and TX over the next month.',
    '12h', 36, 9),
  fb('sample-cons', 'Cogent Strategy Partners', 'CS', 'consulting',
    'New brief out today on supply-chain resilience post-2024 — most of the gain comes from supplier visibility, not reshoring. Glad to share the deck with anyone running a sourcing review this quarter.',
    '14h', 22, 3),
  fb('sample-hc', 'Meridian Health Network', 'MH', 'healthcare',
    "We're replacing two legacy EHR add-ons over the next 18 months: patient intake and care coordination. Evaluating health-IT vendors with strong FHIR integration and proven multi-site rollouts.",
    '18h', 14, 4),
  fb('sample-fin', 'Fasciata Pay', 'FP', 'finance',
    "Raising a $4M seed for a small-business cross-border payments platform on stablecoin rails. $11M ARR run-rate from a closed beta. Talking to leads with B2B fintech track records.",
    '1d', 51, 14),
  fb('sample-cli', 'Caldera Climate', 'CC', 'climate',
    'Our first commercial pilot — a 1,000 t/yr direct-air-capture unit — comes online next quarter at a partner site in Wyoming. Open to conversations with operators interested in carbon-credit offtake.',
    '1d', 47, 11),
]

function Post({ post }) {
  const [likes, setLikes] = useState(post.likes || 0)
  const navigate = useNavigate()
  const goToPost = () => navigate(`/posts/${post.id}`)
  const stop = (e) => e.stopPropagation()

  return (
    <div className="post">
      <div className="post-header post-clickable" onClick={goToPost} role="link" tabIndex={0}
           onKeyDown={(e) => { if (e.key === 'Enter') goToPost() }}>
        <div className="post-avatar" style={{ background: post.avatarUrl ? 'transparent' : post.bg }}>
          {post.avatarUrl
            ? <img src={post.avatarUrl} alt="" className="post-avatar-img" />
            : post.initials}
        </div>
        <div className="post-meta">
          <div className="post-name">{post.name}</div>
          <div className="post-info">
            <span className="post-sector" style={{ background: post.sectorColor, color: post.sectorText }}>{post.sector}</span>
            <span>{post.time}</span>
          </div>
        </div>
      </div>
      <div className="post-body post-clickable" onClick={goToPost} role="link" tabIndex={0}
           onKeyDown={(e) => { if (e.key === 'Enter') goToPost() }}>
        {post.body}
      </div>
      <div className="post-actions" onClick={stop}>
        <button className="post-action" onClick={() => setLikes(likes + 1)}>&#9650; <span>{likes}</span></button>
        <button className="post-action" onClick={goToPost}>&#128172; <span>{post.comments || 0}</span> replies</button>
        <button className="post-action">&#128279; Share</button>
        <button className="post-action">&#128278; Save</button>
      </div>
    </div>
  )
}

function adaptPost(p) {
  const sector = (p.sector || p.author?.sector || 'general')
  const theme = sectorTheme(sector)
  const name = p.author?.display_name || 'Unknown'
  return {
    id: p.id,
    name,
    initials: makeInitials(name),
    avatarUrl: p.author?.avatar_url || null,
    sector: sectorLabel(sector).toUpperCase(),
    sectorColor: theme.sectorColor,
    sectorText: theme.sectorText,
    bg: theme.bg,
    body: p.content,
    time: timeAgo(p.created_at),
    likes: 0,
    comments: 0,
  }
}

function Feed({ user }) {
  const [posts, setPosts] = useState([])
  const [postText, setPostText] = useState('')
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)

  const fetchPosts = async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('id, content, sector, post_type, created_at, author:profiles!author_id (id, display_name, sector, avatar_url)')
      // already selecting avatar_url — adaptPost picks it up
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      console.warn('Posts fetch failed:', error.message)
      setPosts([])
      return
    }
    setPosts((data || []).map(adaptPost))
  }

  useEffect(() => {
    fetchPosts().finally(() => setLoading(false))
  }, [])

  const createPost = async () => {
    const text = postText.trim()
    if (!text || posting) return
    setPosting(true)
    const { error } = await supabase.from('posts').insert({
      author_id: user.id,
      content: text,
      sector: user.sector || null,
      post_type: 'update',
    })
    setPosting(false)
    if (error) { alert(error.message); return }
    setPostText('')
    await fetchPosts()
  }

  const usingFallback = posts.length === 0 && !loading
  const visiblePosts = posts.length > 0 ? posts : FALLBACK_POSTS

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
            <button className="btn-post" onClick={createPost} disabled={posting || !postText.trim()}>
              {posting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      </div>

      <div className="feed-posts">
        {loading && posts.length === 0 ? (
          <div className="feed-loading">Loading feed…</div>
        ) : (
          visiblePosts.map(p => <Post key={p.id} post={p} />)
        )}
      </div>

      {usingFallback && (
        <div className="feed-demo-note">
          Demo mode — sample data shown for illustration. All scenarios are fictional.
        </div>
      )}
    </main>
  )
}

export default Feed

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { makeInitials, sectorTheme, sectorLabel, timeAgo } from './format'
import './Feed.css'

const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif'

function fb(id, name, initials, sectorValue, body, time, likes, comments) {
  const t = sectorTheme(sectorValue)
  return {
    id,
    name,
    initials,
    // All sample posts are companies showcasing org-style content.
    isCompany: true,
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
        <div className={`post-avatar ${post.isCompany ? 'post-avatar-company' : ''}`} style={{ background: post.avatarUrl ? 'transparent' : post.bg }}>
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
      {post.imageUrl && (
        <div className="post-image-wrap post-clickable" onClick={goToPost} role="link" tabIndex={-1}>
          <img src={post.imageUrl} alt="" className="post-image" />
        </div>
      )}
      <div className="post-actions" onClick={stop}>
        <button className="post-action" onClick={() => setLikes(likes + 1)} title="Upvote">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
          <span>{likes}</span>
        </button>
        <button className="post-action" onClick={goToPost} title="Replies">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>{post.comments || 0}</span> replies
        </button>
        <button className="post-action" title="Share">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          Share
        </button>
        <button className="post-action" title="Save">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          Save
        </button>
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
    isCompany: p.author?.account_type === 'company',
    sector: sectorLabel(sector).toUpperCase(),
    sectorColor: theme.sectorColor,
    sectorText: theme.sectorText,
    bg: theme.bg,
    body: p.content,
    imageUrl: p.image_url || null,
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
  const [image, setImage] = useState(null) // { file, previewUrl }
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageError, setImageError] = useState(null)
  const fileInputRef = useRef(null)

  const fetchPosts = async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('id, content, sector, post_type, image_url, created_at, author:profiles!author_id (id, display_name, sector, avatar_url, account_type)')
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

  const onImagePicked = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImageError(null)
    setImage({ file, previewUrl: URL.createObjectURL(file) })
  }

  const clearImage = () => {
    if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl)
    setImage(null)
    setImageError(null)
  }

  const createPost = async () => {
    const text = postText.trim()
    if ((!text && !image) || posting) return
    setPosting(true)
    setImageError(null)

    let imageUrl = null
    if (image?.file) {
      setUploadingImage(true)
      try {
        const ext = (image.file.name.split('.').pop() || 'jpg').toLowerCase()
        const path = `${user.id}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('post-images')
          .upload(path, image.file, {
            cacheControl: '3600',
            upsert: false,
            contentType: image.file.type || undefined,
          })
        if (upErr) throw upErr
        const { data } = supabase.storage.from('post-images').getPublicUrl(path)
        imageUrl = data.publicUrl
      } catch (err) {
        setUploadingImage(false)
        setPosting(false)
        setImageError(`Image upload failed: ${err.message}`)
        return
      } finally {
        setUploadingImage(false)
      }
    }

    const { error } = await supabase.from('posts').insert({
      author_id: user.id,
      content: text,
      sector: user.sector || null,
      post_type: 'update',
      image_url: imageUrl,
    })
    setPosting(false)
    if (error) { alert(error.message); return }
    setPostText('')
    clearImage()
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
        {image && (
          <div className="composer-image-preview">
            <img src={image.previewUrl} alt="" />
            <button
              type="button"
              className="composer-image-remove"
              onClick={clearImage}
              aria-label="Remove image"
              disabled={uploadingImage}
            >×</button>
          </div>
        )}
        {imageError && <div className="composer-image-error">{imageError}</div>}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          style={{ display: 'none' }}
          onChange={onImagePicked}
        />
        <div className="composer-bar">
          <div className="composer-actions">
            <button
              type="button"
              title="Attach an image"
              onClick={() => fileInputRef.current?.click()}
              disabled={posting}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>Image</span>
            </button>
            <button type="button" title="Tag sector">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
              <span>Sector</span>
            </button>
            <button type="button" title="Mark as opportunity">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
              </svg>
              <span>Opportunity</span>
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="char-count">{postText.length}/500</span>
            <button className="btn-post" onClick={createPost} disabled={posting || (!postText.trim() && !image)}>
              {uploadingImage ? 'Uploading…' : posting ? 'Posting…' : 'Post'}
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

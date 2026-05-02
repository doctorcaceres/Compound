import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { makeInitials, sectorTheme, sectorLabel, timeAgo } from './format'
import { FALLBACK_POSTS } from './Feed'
import './PostDetail.css'

function PostDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const isSample = typeof id === 'string' && id.startsWith('sample-')

  useEffect(() => {
    let active = true
    setLoading(true)
    setNotFound(false)
    setPost(null)

    if (isSample) {
      const sample = FALLBACK_POSTS.find(p => p.id === id)
      if (active) {
        if (sample) {
          // FALLBACK_POSTS are pre-rendered (sector is the label, time is a string).
          // Convert into the same shape we use for live posts.
          setPost({
            id: sample.id,
            content: sample.body,
            sector_value: null,                 // unknown for samples; we'll display sample.sector directly
            sector_label: sample.sector,        // already uppercased label string
            created_at: null,                   // we'll show the relative-time string the sample carried
            time_label: sample.time,
            author: {
              id: null,
              display_name: sample.name,
              account_type: 'company',
              sector: null,
            },
            avatar_initials: sample.initials,
            avatar_bg: sample.bg,
            is_sample: true,
          })
        } else {
          setNotFound(true)
        }
        setLoading(false)
      }
      return () => { active = false }
    }

    const run = async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('id, content, sector, post_type, created_at, author:profiles!author_id(id, display_name, account_type, sector, headline)')
        .eq('id', id)
        .maybeSingle()
      if (!active) return
      if (error || !data) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setPost({
        id: data.id,
        content: data.content,
        sector_value: data.sector,
        sector_label: sectorLabel(data.sector).toUpperCase(),
        created_at: data.created_at,
        time_label: timeAgo(data.created_at),
        author: data.author,
        avatar_initials: makeInitials(data.author?.display_name),
        avatar_bg: sectorTheme(data.author?.sector || data.sector).bg,
        is_sample: false,
      })
      setLoading(false)
    }
    run()
    return () => { active = false }
  }, [id, isSample])

  if (loading) return <div className="placeholder-page"><p>Loading post…</p></div>
  if (notFound || !post) {
    return (
      <div className="placeholder-page">
        <h2>Post not found</h2>
        <p><button className="postdetail-back-inline" onClick={() => navigate('/')}>Back to feed</button></p>
      </div>
    )
  }

  const authorName = post.author?.display_name || 'Unknown'
  const authorIsClickable = !!post.author?.id

  return (
    <div className="postdetail-page">
      <button className="postdetail-back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>

      <article className="postdetail-card">
        <header className="postdetail-header">
          <div className="postdetail-avatar" style={{ background: post.avatar_bg }}>
            {post.avatar_initials}
          </div>
          <div className="postdetail-meta">
            <div className="postdetail-author">
              {authorIsClickable ? (
                <Link to={`/profile/${post.author.id}`}>{authorName}</Link>
              ) : (
                <span>{authorName}</span>
              )}
            </div>
            <div className="postdetail-meta-row">
              <span className="postdetail-sector">{post.sector_label}</span>
              <span className="postdetail-dot">·</span>
              <span className="postdetail-time">{post.created_at ? `Posted ${post.time_label}` : `Posted ${post.time_label} ago`}</span>
            </div>
          </div>
        </header>

        <div className="postdetail-body">
          {(post.content || '').split(/\n\n+/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>

        {post.is_sample && (
          <div className="postdetail-sample-note">
            Demo post — this scenario is fictional and for illustration only.
          </div>
        )}
      </article>
    </div>
  )
}

export default PostDetail

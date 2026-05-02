import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import Header from './Header'
import LeftSidebar from './LeftSidebar'
import Feed from './Feed'
import ChatPanel from './ChatPanel'
import Messaging from './Messaging'
import Network from './Network'
import ConversationRooms from './ConversationRooms'
import Profile from './Profile'
import PostDetail from './PostDetail'
import Jobs from './Jobs'
import Settings from './Settings'
import Schedule from './Schedule'
import Feedback from './Feedback'
import Onboarding from './Onboarding'
import './App.css'

function makeInitials(name) {
  if (!name) return 'U'
  return name.split(' ').map(w => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 2) || 'U'
}

function profileToAppUser(profile, authUser) {
  return {
    id: profile.id,
    email: profile.email || authUser?.email,
    name: profile.display_name,
    sector: profile.sector || '',
    accountType: profile.account_type || 'individual',
    initials: makeInitials(profile.display_name),
    headline: profile.headline,
    bio: profile.bio,
    location: profile.location,
    avatar_url: profile.avatar_url,
    is_verified: profile.is_verified,
    domain: profile.domain || null,
    verification_url: profile.verification_url || null,
    open_to_messages: profile.open_to_messages,
    onboarded: profile.onboarded !== false,   // existing rows w/o the column read as undefined → treat as onboarded
    feed_preferences: profile.feed_preferences || null,
  }
}

function authUserFallback(u) {
  if (!u) return null
  const meta = u.user_metadata || {}
  const name = meta.name || (u.email ? u.email.split('@')[0] : 'User')
  return {
    id: u.id,
    email: u.email,
    name,
    sector: meta.sector || '',
    accountType: meta.accountType || 'individual',
    initials: makeInitials(name),
  }
}

function Home({ user }) {
  return (
    <div className="main-layout">
      <LeftSidebar user={user} />
      <Feed user={user} />
    </div>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [loadingSession, setLoadingSession] = useState(true)

  useEffect(() => {
    let active = true

    const loadProfile = async (session) => {
      if (!session?.user) {
        if (active) setUser(null)
        return
      }
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
      if (!active) return
      if (error) {
        console.warn('Profile fetch failed', error.message)
        setUser(authUserFallback(session.user))
      } else {
        setUser(profileToAppUser(profile, session.user))
      }
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await loadProfile(session)
      if (active) setLoadingSession(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      loadProfile(session)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  if (loadingSession) {
    return (
      <div className="auth-overlay">
        <div className="auth-loading">Loading…</div>
      </div>
    )
  }

  if (!user) {
    return <Auth />
  }

  // First-time signups land here. The onboarding chat saves the profile and
  // flips `onboarded = true`; once that's done, the user re-renders into the
  // main app shell below. Returning users (onboarded = true) skip this entirely.
  if (!user.onboarded) {
    return (
      <Onboarding
        user={user}
        onComplete={(updates) => {
          if (updates) {
            setUser(u => ({ ...u, ...updates, onboarded: true }))
          } else {
            setUser(u => ({ ...u, onboarded: true }))
          }
        }}
      />
    )
  }

  return (
    <div className="app">
      <Header user={user} />
      <div className="app-body">
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Home user={user} />} />
            <Route path="/network" element={<Network user={user} />} />
            <Route path="/messages" element={<Messaging user={user} />} />
            <Route path="/messages/:id" element={<Messaging user={user} />} />
            <Route path="/rooms" element={<ConversationRooms user={user} />} />
            <Route path="/rooms/:id" element={<ConversationRooms user={user} />} />
            <Route path="/profile" element={<Profile user={user} />} />
            <Route path="/profile/:id" element={<Profile user={user} />} />
            <Route path="/posts/:id" element={<PostDetail />} />
            <Route path="/jobs" element={<Jobs user={user} />} />
            <Route path="/jobs/:id" element={<Jobs user={user} />} />
            <Route path="/schedule" element={<Schedule user={user} />} />
            <Route path="/settings" element={<Settings user={user} />} />
          </Routes>
        </main>
        <ChatPanel user={user} />
      </div>
      <Feedback user={user} />
    </div>
  )
}

export default App

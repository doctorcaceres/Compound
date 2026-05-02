import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import { makeInitials, sectorTheme } from './format'
import {
  authenticateLinkCandidate,
  storeLinkedSession,
  clearLinkedSession,
  notifyLinkedAccountsChanged,
} from './linkedAccounts'
import './Settings.css'

function Settings({ user }) {
  const [linkedAccounts, setLinkedAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [linkEmail, setLinkEmail] = useState('')
  const [linkPassword, setLinkPassword] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkError, setLinkError] = useState(null)

  const fetchLinkedAccounts = useCallback(async () => {
    const { data: links, error } = await supabase
      .from('linked_accounts')
      .select('id, linked_user_id, created_at')
      .order('created_at', { ascending: true })
    if (error) {
      console.warn('linked_accounts fetch failed:', error.message)
      setLinkedAccounts([])
      return
    }
    if (!links || links.length === 0) {
      setLinkedAccounts([])
      return
    }
    const ids = links.map(l => l.linked_user_id)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, account_type, sector, headline')
      .in('id', ids)
    const profileById = new Map((profiles || []).map(p => [p.id, p]))
    setLinkedAccounts(links.map(l => ({
      linkId: l.id,
      profile: profileById.get(l.linked_user_id) || null,
      created_at: l.created_at,
    })).filter(l => l.profile))
  }, [])

  useEffect(() => {
    fetchLinkedAccounts().finally(() => setLoading(false))
  }, [fetchLinkedAccounts])

  const openModal = () => {
    setLinkEmail('')
    setLinkPassword('')
    setLinkError(null)
    setShowModal(true)
  }
  const closeModal = () => {
    if (linkBusy) return
    setShowModal(false)
  }

  const handleLink = async () => {
    setLinkError(null)
    const email = linkEmail.trim().toLowerCase()
    if (!email || !linkPassword) {
      setLinkError('Email and password are required.')
      return
    }
    if (email === (user.email || '').toLowerCase()) {
      setLinkError("That's the account you're already signed in to.")
      return
    }
    setLinkBusy(true)
    const { client: parallel, session, error } = await authenticateLinkCandidate(email, linkPassword)
    if (error || !session) {
      setLinkBusy(false)
      setLinkError(error?.message || 'Sign-in failed.')
      return
    }

    const otherId = session.user.id

    // 1. Insert (currentUser, otherUser) using main client.
    const { error: insAErr } = await supabase
      .from('linked_accounts')
      .insert({ primary_user_id: user.id, linked_user_id: otherId })
    if (insAErr && !/duplicate key/i.test(insAErr.message)) {
      setLinkBusy(false)
      setLinkError(insAErr.message)
      return
    }

    // 2. Insert (otherUser, currentUser) using parallel client.
    const { error: insBErr } = await parallel
      .from('linked_accounts')
      .insert({ primary_user_id: otherId, linked_user_id: user.id })
    if (insBErr && !/duplicate key/i.test(insBErr.message)) {
      // Roll back the first insert so we don't leave a half-link.
      await supabase.from('linked_accounts')
        .delete()
        .eq('primary_user_id', user.id)
        .eq('linked_user_id', otherId)
      setLinkBusy(false)
      setLinkError(insBErr.message)
      return
    }

    // 3. Capture sessions for both directions on this device.
    // We deliberately do NOT call parallel.auth.signOut() — even with
    // scope: 'local' it can mutate the captured tokens and break the
    // upcoming setSession during a switch. Letting the parallel client
    // be garbage-collected is sufficient since persistSession is off.
    storeLinkedSession(user.id, otherId, session)
    const { data: { session: mainSession } } = await supabase.auth.getSession()
    if (mainSession) storeLinkedSession(otherId, user.id, mainSession)

    setLinkBusy(false)
    setShowModal(false)
    await fetchLinkedAccounts()
    notifyLinkedAccountsChanged()
  }

  const handleUnlink = async (link) => {
    if (!confirm(`Unlink ${link.profile.display_name}? You can re-link by re-authenticating.`)) return
    const otherId = link.profile.id
    // Broadened delete policy lets us clear both directions in one call.
    const { error } = await supabase
      .from('linked_accounts')
      .delete()
      .or(`and(primary_user_id.eq.${user.id},linked_user_id.eq.${otherId}),and(primary_user_id.eq.${otherId},linked_user_id.eq.${user.id})`)
    if (error) { alert(error.message); return }
    clearLinkedSession(user.id, otherId)
    clearLinkedSession(otherId, user.id)
    await fetchLinkedAccounts()
    notifyLinkedAccountsChanged()
  }

  return (
    <div className="settings-page">
      <h2 className="settings-title">Settings</h2>

      <section className="settings-section">
        <div className="settings-section-head">
          <div>
            <h3>Linked Accounts</h3>
            <p className="settings-section-desc">
              Linking accounts lets you switch between them without logging out. Your accounts remain completely separate — different data, different profiles, different identities.
            </p>
          </div>
          <button className="settings-link-btn" onClick={openModal}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Link Another Account
          </button>
        </div>

        {loading ? (
          <div className="settings-empty">Loading…</div>
        ) : linkedAccounts.length === 0 ? (
          <div className="settings-empty">You haven’t linked any accounts yet.</div>
        ) : (
          <div className="settings-linked-list">
            {linkedAccounts.map(link => {
              const p = link.profile
              const theme = sectorTheme(p.sector)
              return (
                <div key={link.linkId} className="settings-linked-row">
                  <div className="settings-linked-avatar" style={{ background: theme.bg }}>
                    {makeInitials(p.display_name)}
                  </div>
                  <div className="settings-linked-info">
                    <div className="settings-linked-name">{p.display_name}</div>
                    <div className="settings-linked-meta">
                      {p.account_type === 'company' ? 'Company' : 'Individual'}
                      {p.headline ? ` · ${p.headline}` : ''}
                    </div>
                  </div>
                  <button className="settings-unlink-btn" onClick={() => handleUnlink(link)}>Unlink</button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {showModal && (
        <div className="settings-modal-overlay" onClick={closeModal}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div className="settings-modal-head">
              <h3>Link another account</h3>
              <button className="settings-modal-close" onClick={closeModal}>×</button>
            </div>
            <p className="settings-modal-desc">
              Sign in with the credentials of the account you want to link. You’ll then be able to switch between this account and that one without logging out. Your accounts remain completely separate.
            </p>
            <div className="settings-form-group">
              <label>Email</label>
              <input
                type="email"
                value={linkEmail}
                onChange={e => setLinkEmail(e.target.value)}
                placeholder="other-account@email.com"
                autoFocus
                disabled={linkBusy}
              />
            </div>
            <div className="settings-form-group">
              <label>Password</label>
              <input
                type="password"
                value={linkPassword}
                onChange={e => setLinkPassword(e.target.value)}
                placeholder="That account’s password"
                disabled={linkBusy}
                onKeyDown={e => e.key === 'Enter' && handleLink()}
              />
            </div>
            {linkError && <div className="settings-modal-error">{linkError}</div>}
            <div className="settings-modal-actions">
              <button className="settings-modal-cancel" onClick={closeModal} disabled={linkBusy}>Cancel</button>
              <button className="settings-modal-submit" onClick={handleLink} disabled={linkBusy || !linkEmail.trim() || !linkPassword}>
                {linkBusy ? 'Linking…' : 'Link Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings

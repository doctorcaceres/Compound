// Helpers for the "linked accounts / session hot-swap" feature.
// We store the refresh+access tokens of linked accounts in localStorage so
// the user can switch between them without re-entering credentials.
// LocalStorage is per-device — switching from a different device requires
// the user to re-link.

import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

const KEY_PREFIX = 'compound:linked-session'

export function sessionKey(primaryUserId, targetUserId) {
  return `${KEY_PREFIX}:${primaryUserId}:${targetUserId}`
}

export function storeLinkedSession(primaryUserId, targetUserId, session) {
  if (!session?.access_token || !session?.refresh_token) return
  const payload = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    user_id: targetUserId,
    saved_at: Date.now(),
  }
  try {
    localStorage.setItem(sessionKey(primaryUserId, targetUserId), JSON.stringify(payload))
  } catch (e) {
    console.warn('Could not persist linked session', e.message)
  }
}

export function readLinkedSession(primaryUserId, targetUserId) {
  try {
    const raw = localStorage.getItem(sessionKey(primaryUserId, targetUserId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearLinkedSession(primaryUserId, targetUserId) {
  try { localStorage.removeItem(sessionKey(primaryUserId, targetUserId)) } catch {}
}

// Sign in to `email`/`password` using a parallel client (won't disturb the
// caller's main session) and return the resulting session + user id.
export async function authenticateLinkCandidate(email, password) {
  const parallel = createClient(supabase.supabaseUrl, supabase.supabaseKey, {
    auth: {
      storageKey: `sb-link-${Math.random()}`,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
  const { data, error } = await parallel.auth.signInWithPassword({ email, password })
  return { client: parallel, session: data?.session, error }
}

// Switch the main client over to the linked account's session.
// Important: Supabase rotates refresh tokens, so after setSession succeeds we
// re-capture the (now-rotated) tokens and re-store them — otherwise the next
// switch back fails. We also re-store the *outgoing* user's session under the
// target's namespace so the linked account can switch back to us later.
export async function switchToLinkedAccount(currentUserId, targetUserId) {
  const stored = readLinkedSession(currentUserId, targetUserId)
  if (!stored) {
    return { ok: false, reason: 'not-on-this-device' }
  }

  // Capture the *outgoing* (current) session BEFORE setSession overwrites it.
  const { data: { session: outgoing } } = await supabase.auth.getSession()

  const { data, error } = await supabase.auth.setSession({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
  })
  if (error) {
    return { ok: false, reason: 'expired', error: error.message }
  }

  // Re-store rotated tokens for the now-active account (so the next switch
  // back from this side will work). Direction key stays the same: the new
  // primary is `targetUserId`, and they want to be able to switch back to
  // `currentUserId`.
  if (outgoing) {
    storeLinkedSession(targetUserId, currentUserId, outgoing)
  }
  if (data?.session) {
    // Refresh our own copy of the target's tokens for any future switch *to*
    // this account from another linked side.
    storeLinkedSession(currentUserId, targetUserId, data.session)
  }

  return { ok: true }
}

export const LINKED_ACCOUNTS_CHANGED = 'compound:linked-accounts-changed'

export function notifyLinkedAccountsChanged() {
  try { window.dispatchEvent(new CustomEvent(LINKED_ACCOUNTS_CHANGED)) } catch {}
}

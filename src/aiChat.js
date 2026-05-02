// AI helper layer for the Compound chatbox.
// Three responsibilities:
//   1. Cheap-path: answer simple "how many X" questions from Supabase directly,
//      no API call.
//   2. Claude path: for everything else, call Anthropic's Messages API with
//      personalized context.
//   3. Daily quota: cap API spend per user by tracking calls in localStorage.
//
// SECURITY NOTE — temporary trade-off:
// We call the Anthropic API directly from the browser using
// `anthropic-dangerous-direct-browser-access: true`. The key is in .env which
// is gitignored, but `import.meta.env.VITE_ANTHROPIC_API_KEY` is bundled into
// the production JS at build time. Anyone who inspects the bundle can recover
// it. Move to a Supabase Edge Function (or any server-side proxy) before any
// public production deploy. For the prototype/demo this is acceptable.

import { supabase } from './supabaseClient'

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
const MODEL = 'claude-haiku-4-5-20251001'
const DAILY_LIMIT = 30

// ----------------------------------------------------------------------------
// Daily quota (per user, per UTC day, in localStorage)
// ----------------------------------------------------------------------------
function quotaKey(userId) {
  const day = new Date().toISOString().slice(0, 10)
  return `compound:ai-quota:${userId}:${day}`
}

export function getDailyCount(userId) {
  if (!userId) return 0
  const v = parseInt(localStorage.getItem(quotaKey(userId)) || '0', 10)
  return Number.isFinite(v) ? v : 0
}

export function incrementDailyCount(userId) {
  if (!userId) return 0
  const next = getDailyCount(userId) + 1
  localStorage.setItem(quotaKey(userId), String(next))
  return next
}

export function dailyLimitReached(userId) {
  return getDailyCount(userId) >= DAILY_LIMIT
}

export const QUOTA_LIMIT = DAILY_LIMIT

// ----------------------------------------------------------------------------
// Local-only intent matchers
// Each tries to handle a query without ever calling Claude. Returns a string
// answer if matched, or null if it doesn't apply.
// ----------------------------------------------------------------------------
async function tryRoomCount(q, user) {
  if (!/how many (rooms|conversation rooms)\b/i.test(q)) return null
  const { count } = await supabase
    .from('room_participants')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', user.id)
  const n = count || 0
  return `You're a participant in ${n} conversation room${n === 1 ? '' : 's'}.`
}

async function tryFollowerCount(q, user) {
  if (!/how many (connections|followers|people follow me)\b/i.test(q)) return null
  const { count } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('followed_id', user.id)
  const n = count || 0
  return `You have ${n} follower${n === 1 ? '' : 's'}.`
}

async function tryFollowingCount(q, user) {
  if (!/how many.*(am i following|do i follow)\b/i.test(q)) return null
  const { count } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', user.id)
  const n = count || 0
  return `You're following ${n} ${n === 1 ? 'account' : 'accounts'}.`
}

async function tryRecentPosts(q, user) {
  if (!/show.*recent posts|show my posts|my recent posts/i.test(q)) return null
  const { data } = await supabase
    .from('posts')
    .select('content, created_at')
    .eq('author_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5)
  if (!data || data.length === 0) return "You haven't posted anything yet."
  const lines = data.map(p => `• "${(p.content || '').slice(0, 80)}${(p.content || '').length > 80 ? '…' : ''}"`)
  return `Your most recent posts:\n${lines.join('\n')}`
}

async function tryPostCount(q, user) {
  if (!/how many (posts|things have i posted)\b/i.test(q)) return null
  const { count } = await supabase
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .eq('author_id', user.id)
  const n = count || 0
  return `You've published ${n} post${n === 1 ? '' : 's'}.`
}

const LOCAL_HANDLERS = [tryRoomCount, tryFollowerCount, tryFollowingCount, tryRecentPosts, tryPostCount]

export async function tryLocalAnswer(query, user) {
  if (!user?.id) return null
  for (const h of LOCAL_HANDLERS) {
    const ans = await h(query, user)
    if (ans !== null) return ans
  }
  return null
}

// ----------------------------------------------------------------------------
// Claude path
// ----------------------------------------------------------------------------
async function buildHomeContext(user) {
  // Pull a small amount of personalized context so Claude can be useful
  // without us having to round-trip multiple times.
  const [roomsRes, postsRes, connRes] = await Promise.all([
    supabase
      .from('room_participants')
      .select('role, profile_id, room:conversation_rooms(id, name, sector, status)')
      .eq('profile_id', user.id)
      .limit(10),
    supabase
      .from('posts')
      .select('content, sector, created_at')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('followed_id', user.id),
  ])

  const rooms = (roomsRes.data || [])
    .map(r => r.room && { name: r.room.name, sector: r.room.sector, status: r.room.status, role: r.role })
    .filter(Boolean)
  const posts = (postsRes.data || []).map(p => ({ content: p.content, sector: p.sector }))

  return {
    user: {
      name: user.name,
      sector: user.sector || null,
      account_type: user.accountType,
      headline: user.headline || null,
    },
    follower_count: connRes.count || 0,
    rooms,
    recent_posts: posts,
  }
}

async function buildRoomContext(roomId) {
  const [roomRes, partsRes, msgsRes, docsRes] = await Promise.all([
    supabase
      .from('conversation_rooms')
      .select('id, name, description, sector, status, created_at')
      .eq('id', roomId)
      .maybeSingle(),
    supabase
      .from('room_participants')
      .select('role, profile:profiles!profile_id(display_name, headline)')
      .eq('room_id', roomId),
    supabase
      .from('room_messages')
      .select('content, created_at, sender:profiles!sender_id(display_name)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('room_documents')
      .select('file_name, created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(5),
  ])
  if (!roomRes.data) return null
  const r = roomRes.data
  return {
    name: r.name,
    description: r.description,
    sector: r.sector,
    status: r.status,
    participants: (partsRes.data || []).map(p => ({
      name: p.profile?.display_name || 'Unknown',
      role: p.role,
      headline: p.profile?.headline || null,
    })),
    recent_messages: (msgsRes.data || []).reverse().map(m => ({
      sender: m.sender?.display_name || 'Unknown',
      text: m.content,
    })),
    documents: (docsRes.data || []).map(d => ({ name: d.file_name })),
  }
}

export async function buildContext({ user, roomId }) {
  if (roomId) {
    const room = await buildRoomContext(roomId)
    return { context_type: 'room', user_summary: { name: user.name, sector: user.sector }, room }
  }
  const home = await buildHomeContext(user)
  return { context_type: 'app', ...home }
}

// ----------------------------------------------------------------------------
// Onboarding — single-shot extraction.
// The new flow asks the user one big question ("tell me about yourself")
// and Claude both extracts profile fields AND writes a natural ack in one
// response. Returns parsed JSON. If a critical field is missing, it asks
// ONE follow-up; otherwise it confirms. Total exchanges: 2-3 max.
// ----------------------------------------------------------------------------
import { SECTORS } from './format'

function buildOnboardingExtractPrompt({ isCompany, previouslyCollected, allowFollowUp }) {
  const sectorList = SECTORS.map(s => `${s.value} (${s.label})`).join(', ')
  const accountType = isCompany ? 'company' : 'individual'
  const previously = JSON.stringify(previouslyCollected || {})
  const followUpRule = allowFollowUp
    ? `If "missing_critical" is non-empty, the "reply" naturally asks for the ONE missing thing in 1 sentence. Pick the single most important missing field; never list more than one.`
    : `Set "missing_critical" to []. The user has already done one round of follow-up. Save what you have and warmly confirm we're set in the "reply".`

  return `You are guiding a Compound user through onboarding. Compound is a cross-sector B2B professional network. Extract their profile from what they say and respond naturally — no interrogation, no form-feel.

Account type: ${accountType}.
Already collected from earlier in this conversation (don't re-ask for these unless still null): ${previously}

Available sector values (use the lowercase token): ${sectorList}.

Return ONLY valid JSON in this exact shape, no prose before or after, no markdown fences:
{
  "extracted": {
    "display_name": string | null,
    "headline": string | null,
    "sector": string | null,
    "looking_for": string | null
  },
  "missing_critical": string[],
  "reply": string
}

Rules:
- For "extracted.sector", use one of the lowercase tokens listed above, or null if the user hasn't given enough to pick one confidently.
- ${accountType === 'company' ? 'Critical fields for a company: display_name, sector. Headline and looking_for are nice-to-have, never required.' : 'Critical fields for an individual: display_name, sector. Headline and looking_for are nice-to-have, never required.'}
- ${followUpRule}
- "reply" is 1–2 sentences, warm but professional. Reference something specific the user said. No exclamation marks. Never call them "amazing" or "wonderful".
- If "missing_critical" is empty, "reply" should confirm we're set and that the profile is being saved.`
}

function parseExtraction(text) {
  if (!text) return null
  // Strip ```json fences if Claude added them
  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  // Sometimes Claude prefixes "Here is the JSON:" or similar — find first { ... last }
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  }
  try {
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

export async function extractOnboarding({ userMessage, isCompany, previouslyCollected, allowFollowUp, history }) {
  if (!ANTHROPIC_KEY) throw new Error('Missing VITE_ANTHROPIC_API_KEY')
  const system = buildOnboardingExtractPrompt({ isCompany, previouslyCollected, allowFollowUp })
  const messages = []
  for (const m of (history || []).slice(-6)) {
    messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })
  }
  messages.push({ role: 'user', content: userMessage })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      system,
      messages,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `API error (${res.status})`)
  const raw = data?.content?.[0]?.text || ''
  const parsed = parseExtraction(raw)
  if (!parsed) {
    // Fallback: Claude didn't return clean JSON. Treat as a plain ack with no data.
    return { extracted: {}, missing_critical: [], reply: raw.trim() || "Got it." }
  }
  return parsed
}

const SYSTEM_PROMPT = `You are Compound's in-app AI assistant. Compound is a B2B professional networking app — like LinkedIn but cross-sector and cleaner. The user is signed in. You have a small JSON context object describing them (their sector, recent posts, conversation rooms, etc.) — use it to make answers personalized.

Rules:
- Keep answers concise (2–3 sentences max) unless the user explicitly asks for more depth.
- If you don't know something the context doesn't cover, say so plainly. Don't invent companies or people.
- Don't recommend external links. Stay in the Compound world.
- When asked to draft a message, return just the message body — no preamble.`

export async function callClaude({ user, message, context, conversation }) {
  if (!ANTHROPIC_KEY) {
    throw new Error('Missing VITE_ANTHROPIC_API_KEY')
  }
  // Build the user turn with context attached as a small JSON block the model
  // can read but the user doesn't see.
  const ctxBlock = context ? `\n\n[Compound context — for your reference, do not echo back]\n${JSON.stringify(context, null, 2)}` : ''
  const messages = []
  // include up to last 6 turns of conversation so Claude has continuity
  const trimmed = (conversation || []).slice(-6)
  for (const m of trimmed) {
    messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })
  }
  messages.push({ role: 'user', content: message + ctxBlock })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error?.message || `API error (${res.status})`
    throw new Error(msg)
  }
  const text = data?.content?.[0]?.text || ''
  return { text, usage: data?.usage }
}

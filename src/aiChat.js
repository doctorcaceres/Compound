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
    "sector_other": string | null,
    "location": string | null,
    "looking_for": string | null
  },
  "missing_critical": string[],
  "reply": string
}

Rules for "extracted.sector" (BE LITERAL, NOT INTERPRETIVE):
- Map the user's exact words to the closest token in the list above by matching the LABEL, not by reasoning about the industry.
- If the user says "Energy" → "energy". "Healthcare" → "healthcare". "Tech" or "Technology" → "tech". "Real Estate" → "realestate". Always prefer the literal label match.
- Do NOT reinterpret: "Energy" must NEVER become "climate". "Manufacturing" must NEVER become "construction". Match the user's word, period.
- Only if the user's word genuinely has no match in the list, use "other" and put their custom term in "sector_other".
- If they haven't said anything sector-related yet, set sector to null (not "other").

Rules for "extracted.location":
- If the user says "in Paraguay", "based in NYC", "from Berlin", "we're in Singapore", etc., put that location in the location field. NEVER put a location in headline or any other field.
- Strip filler: "I'm based in Paraguay" → "Paraguay". "We're located in San Francisco" → "San Francisco".
- If no location given, set to null.

Other rules:
- ${accountType === 'company' ? 'Critical fields for a company: display_name, sector. Headline, location, and looking_for are nice-to-have, never required.' : 'Critical fields for an individual: display_name, sector. Headline, location, and looking_for are nice-to-have, never required.'}
- ${followUpRule}
- "reply" is 1–2 sentences, warm but professional. Reference something specific the user said. No exclamation marks. Never call them "amazing" or "wonderful".
- When all critical fields are collected, instead of confirming the save, the "reply" should be a brief recap of what you have so far and ask if they want to add anything else (a website, photo, etc.). Phrase it as an offer, not an interrogation. Set "missing_critical" to [] in this case.`
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

You have THREE places to look for information; choose appropriately:

1. The Compound context block (search hits + the user's profile/rooms/posts) — use this for any question about people, companies, rooms, jobs, or posts on the platform. If the user types a name like "Yara" the context block already has the matching rows; refer to them by name. Don't invent platform entities that aren't in the context.

2. The web (via your web_search tool) — use this for current events, news, market trends, recent funding, regulations, "latest X", anything that requires fresh information. Always call web_search when the user asks about news, current trends, recent developments, or anything dated. Cite sources naturally in your reply.

3. Your own training knowledge — use this for general explanations, definitions, drafting, and timeless information.

Rules:
- Keep answers concise (2–3 sentences) unless the user asks for depth.
- For platform lookups: if the search context has matches, list them briefly and let the UI render the clickable result rows above your message. You don't need to repeat names line-by-line.
- For web answers: pull the actual fresh info — don't say "I can't browse the web." You can. Use web_search.
- If you genuinely don't know, say so plainly. Don't invent companies, funding rounds, or people.
- When asked to draft a message, return just the message body — no preamble.`

// Anthropic's server-side web search tool. We pass it as an available tool;
// Claude decides when to call it. Server tools are executed by Anthropic
// during the same API call, so the response we get back already contains
// the synthesized answer with citations.
const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 5,
}

// Pull the readable text out of a possibly-multi-block content array. The
// response may interleave `text`, `server_tool_use`, and `web_search_tool_result`
// blocks; we only render the text.
function extractText(content) {
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.join('\n').trim()
}

function extractCitations(content) {
  if (!Array.isArray(content)) return []
  const cites = []
  for (const block of content) {
    if (block?.type === 'text' && Array.isArray(block.citations)) {
      for (const c of block.citations) {
        if (c?.url && c?.title) {
          cites.push({ url: c.url, title: c.title })
        }
      }
    }
  }
  // Dedupe by URL
  const seen = new Set()
  return cites.filter(c => seen.has(c.url) ? false : (seen.add(c.url), true))
}

// Turn the multi-block response into a flat array of segments the UI can
// render inline. A segment is either:
//   { text }                                — plain text run
//   { text, url, title }                    — cited span; render as <a>
//   { text, url, title, supRef: true }      — superscript "[2]" chip linking
//                                             to an additional source on the
//                                             same text block
//
// Anthropic's web_search splits the response into text blocks, attaching
// citations to whichever blocks were generated from the sources. The
// citation's `cited_text` is the excerpt from the SOURCE page, not from
// the assistant's reply — so substring-matching it against the assistant
// text mostly fails (Claude paraphrases). The correct mental model is
// "the whole block is what these citations support." We link the entire
// block text to the first citation; any additional citations on the same
// block become superscript references after the block text.
function extractSegments(content) {
  if (!Array.isArray(content)) return []
  const out = []
  let firstBlock = true
  for (const block of content) {
    if (block?.type !== 'text' || typeof block.text !== 'string') continue
    if (!firstBlock) out.push({ text: '\n' })
    firstBlock = false

    const text = block.text
    const citations = (Array.isArray(block.citations) ? block.citations : [])
      .filter(c => c?.url)

    if (citations.length === 0) {
      out.push({ text })
      continue
    }

    // Whole block links to the primary citation.
    const primary = citations[0]
    out.push({
      text,
      url: primary.url,
      title: primary.title || primary.url,
    })

    // Append small superscript chips for any additional citations on the
    // same block so the user can reach those sources directly without
    // hunting for them in the pill footer.
    for (let i = 1; i < citations.length; i++) {
      const c = citations[i]
      out.push({
        text: `[${i + 1}]`,
        url: c.url,
        title: c.title || c.url,
        supRef: true,
      })
    }
  }
  return out
}

export async function callClaude({ user, message, context, conversation, enableWebSearch = true }) {
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

  const body = {
    model: MODEL,
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages,
  }
  if (enableWebSearch) {
    body.tools = [WEB_SEARCH_TOOL]
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error?.message || `API error (${res.status})`
    throw new Error(msg)
  }
  const text = extractText(data?.content) || data?.content?.[0]?.text || ''
  const citations = extractCitations(data?.content)
  const segments = extractSegments(data?.content)
  return { text, segments, citations, usage: data?.usage }
}

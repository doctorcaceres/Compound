// Newsfeed — fetch curated industry news for a user via Anthropic's
// web_search tool. Stores results in the newsfeed_items table so we
// don't re-call the API on every page load.
//
// Public surface:
//   fetchAndStoreNewsfeed({ user, topics? })   → freshens the user's items
//   loadStoredNewsfeed(userId, limit)          → reads from Supabase
//   shouldRefreshNewsfeed(user)                → 12h cooldown check
//   refreshIfStale({ user, force? })           → the typical entry point
//   NEWSFEED_REFRESH_EVENT                     → cross-component bus
//   FOCUS_AI_INPUT_EVENT                       → "focus the chatbox input"
//
// The fetch path is intentionally tolerant: if the JSON parse fails or
// the API errors, we leave whatever's already stored alone instead of
// blanking the UI.

import { supabase } from './supabaseClient'
import { sectorLabel } from './format'

export const NEWSFEED_REFRESH_EVENT = 'compound:newsfeed-refresh'
export const FOCUS_AI_INPUT_EVENT   = 'compound:focus-ai-input'

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
const MODEL = 'claude-haiku-4-5-20251001'
const REFRESH_HOURS = 12

const NEWSFEED_SYSTEM_PROMPT = `You curate professional industry news for Compound, a B2B network.

Use web_search to find five (5) RECENT, REAL, professional news items relevant to the topics or sector the user gives you. Prefer items published in the last 30 days. Quality, well-known sources (Reuters, Bloomberg, FT, industry trade press, official agency announcements). No press releases dressed as news, no opinion pieces unless explicitly newsy.

Return ONLY a JSON array — no preamble, no commentary, no markdown code fences. Schema (strict):

[
  {
    "headline": "string — the article's headline",
    "source_name": "string — publication name (e.g. 'Reuters', 'Bloomberg', 'Ammonia Energy Association')",
    "source_url": "string — full URL to the original article",
    "summary": "string — 1 to 2 sentence factual summary in plain English"
  }
]

Five items exactly. Each URL must be a real article you found via web_search. If you can't find five relevant items, return the items you DID find (the array may be shorter than five — never invent items to pad).`

// Extract the first valid JSON array from a string that may include
// surrounding prose, code fences, or pre/post text.
function parseJsonArray(text) {
  if (!text) return null
  let cleaned = String(text).trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  const first = cleaned.indexOf('[')
  const last  = cleaned.lastIndexOf(']')
  if (first < 0 || last < first) return null
  try {
    const parsed = JSON.parse(cleaned.slice(first, last + 1))
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function extractText(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter(b => b?.type === 'text' && typeof b.text === 'string')
    .map(b => b.text)
    .join('\n')
    .trim()
}

// Call Claude with web_search and return up to 5 normalized news items.
async function callAnthropicForNewsfeed({ topics, sector }) {
  if (!ANTHROPIC_KEY) throw new Error('Missing VITE_ANTHROPIC_API_KEY')

  const userMessage = (topics && topics.length > 0)
    ? `Find five current news items relevant to: ${topics.join(', ')}.`
    : `Find five current professional news items relevant to the ${sectorLabel(sector) || 'general business'} sector.`

  const body = {
    model: MODEL,
    max_tokens: 1500,
    system: NEWSFEED_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
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
  if (!res.ok) throw new Error(data?.error?.message || `Newsfeed API error (${res.status})`)

  const text = extractText(data?.content)
  const arr = parseJsonArray(text)
  if (!arr) throw new Error('Newsfeed response could not be parsed as JSON')

  return arr
    .filter(it => it && typeof it.headline === 'string' && typeof it.source_url === 'string')
    .slice(0, 5)
    .map(it => ({
      headline:    String(it.headline).trim(),
      source_name: it.source_name ? String(it.source_name).trim() : null,
      source_url:  String(it.source_url).trim(),
      summary:     it.summary ? String(it.summary).trim() : null,
    }))
}

// Read the most recent stored items for a user.
export async function loadStoredNewsfeed(userId, limit = 5) {
  if (!userId) return []
  const { data, error } = await supabase
    .from('newsfeed_items')
    .select('id, headline, source_name, source_url, summary, fetched_at')
    .eq('user_id', userId)
    .order('fetched_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.warn('newsfeed: load failed', error.message)
    return []
  }
  return data || []
}

// Persist a new set of items, replacing the user's previous batch.
// Strategy: delete the user's existing rows, then insert the new
// batch. RLS scopes the delete to the current user automatically.
// (The previous PostgREST `.not('id','in','("uuid","uuid")')` syntax
// was silently failing because UUIDs shouldn't be double-quoted in
// the in-filter — letting old rows pile up and crowd out new ones.)
async function storeNewsfeed(userId, items) {
  if (!items || items.length === 0) return []

  const { error: delErr } = await supabase
    .from('newsfeed_items')
    .delete()
    .eq('user_id', userId)
  if (delErr) {
    console.warn('newsfeed: delete-previous failed', delErr.message)
    // Continue anyway — duplication is recoverable; total failure isn't.
  }

  const rows = items.map(it => ({
    user_id:     userId,
    headline:    it.headline,
    source_name: it.source_name,
    source_url:  it.source_url,
    summary:     it.summary,
    fetched_at:  new Date().toISOString(),
  }))
  const { data: inserted, error: insErr } = await supabase
    .from('newsfeed_items')
    .insert(rows)
    .select('id, headline, source_name, source_url, summary, fetched_at')
  if (insErr) {
    console.warn('newsfeed: insert failed', insErr.message)
    return []
  }
  return inserted || []
}

// Persist newsfeed_topics + last fetch timestamp to the profile.
async function persistPreferences(userId, prefs, patch) {
  const next = { ...(prefs || {}), ...patch }
  const { error } = await supabase
    .from('profiles')
    .update({ feed_preferences: next, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) {
    console.warn('newsfeed: prefs persist failed', error.message)
  }
  return next
}

// True if the user's last fetch is older than REFRESH_HOURS hours
// (or has never been fetched).
export function shouldRefreshNewsfeed(user) {
  const last = user?.feed_preferences?.newsfeed_last_fetched_at
  if (!last) return true
  const lastMs = new Date(last).getTime()
  if (Number.isNaN(lastMs)) return true
  return (Date.now() - lastMs) > REFRESH_HOURS * 3600 * 1000
}

// Force a fresh fetch + store. Returns the new items and the updated
// feed_preferences object (so the caller can update the user state).
export async function fetchAndStoreNewsfeed({ user, topics }) {
  const userId = user?.id
  if (!userId) throw new Error('No user')
  const effectiveTopics = (topics && topics.length > 0)
    ? topics
    : (user.feed_preferences?.newsfeed_topics || [])
  const items = await callAnthropicForNewsfeed({
    topics: effectiveTopics,
    sector: user.sector,
  })
  await storeNewsfeed(userId, items)
  const nextPrefs = await persistPreferences(userId, user.feed_preferences, {
    newsfeed_topics: effectiveTopics,
    newsfeed_last_fetched_at: new Date().toISOString(),
  })
  // Re-read so we return what's actually in the DB (newest first, trimmed).
  const stored = await loadStoredNewsfeed(userId, 5)
  return { items: stored, feed_preferences: nextPrefs }
}

// Common entry point — fetch only if the cooldown has expired (or
// `force` is true). Returns whatever ends up being shown to the user.
export async function refreshIfStale({ user, force = false }) {
  const userId = user?.id
  if (!userId) return { items: [], feed_preferences: user?.feed_preferences }
  if (force || shouldRefreshNewsfeed(user)) {
    try {
      return await fetchAndStoreNewsfeed({ user })
    } catch (e) {
      console.warn('newsfeed: refresh failed', e.message)
      // Fall through to whatever's stored.
    }
  }
  const items = await loadStoredNewsfeed(userId, 5)
  return { items, feed_preferences: user.feed_preferences }
}

// ----------------------------------------------------------------------------
// Newsfeed-config intent: detecting + extracting topics from a chat message
// ----------------------------------------------------------------------------

// Quick lexical check — does this user message look like they're
// configuring the newsfeed? Cheap regex prefilter so we don't call
// Claude on every chat turn.
export function looksLikeNewsfeedConfig(message) {
  const m = String(message || '').toLowerCase()
  if (!/newsfeed|news\s?feed/.test(m)) return false
  return /(show|tell|update|change|set|customize|configure|i\s+want|i'?d\s+like|focus|track|follow)/.test(m)
}

// Ask Claude to pull the topic list out of a configuration message.
// Returns an array of short topic strings, or [] if extraction failed.
export async function extractNewsfeedTopics(message) {
  if (!ANTHROPIC_KEY) return []
  const system = `Extract the newsfeed topics the user wants. Topics are short subject phrases like "green hydrogen" or "Paraguay energy projects".

Return ONLY a JSON object — no prose, no markdown, no code fences.
Schema: {"topics": ["topic 1", "topic 2", ...]}.

Rules:
- 1 to 5 topics, each 1 to 6 words.
- Strip filler ("show me", "in my newsfeed", "tell Ask Compound").
- If you can't find any topic, return {"topics": []}.`

  try {
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
        max_tokens: 200,
        system,
        messages: [{ role: 'user', content: message }],
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return []
    const text = extractText(data?.content) || data?.content?.[0]?.text || ''
    let cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    const first = cleaned.indexOf('{')
    const last  = cleaned.lastIndexOf('}')
    if (first < 0 || last < first) return []
    const parsed = JSON.parse(cleaned.slice(first, last + 1))
    return Array.isArray(parsed?.topics)
      ? parsed.topics.map(t => String(t).trim()).filter(Boolean).slice(0, 5)
      : []
  } catch (e) {
    console.warn('newsfeed: topic extract failed', e.message)
    return []
  }
}

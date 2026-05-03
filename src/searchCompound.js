// Multi-table Compound search. Returns results across people, companies,
// rooms, jobs, and posts so the AI chatbox can look things up the same way
// the old header search bar did. Used by ChatPanel as a context block for
// Claude AND as the source of clickable result rows shown in the chat.

import { supabase } from './supabaseClient'

function sanitize(q) {
  return q.replace(/[,()%]/g, '').trim()
}

export async function searchCompound(rawQuery, { perTable = 4 } = {}) {
  const safe = sanitize(rawQuery || '')
  if (safe.length < 2) return null
  const ilike = `%${safe}%`

  const [peopleRes, companiesRes, roomsRes, jobsRes, postsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, headline, sector, account_type')
      .eq('account_type', 'individual')
      .or(`display_name.ilike.${ilike},headline.ilike.${ilike}`)
      .limit(perTable),
    supabase
      .from('profiles')
      .select('id, display_name, headline, sector, account_type, domain, is_verified')
      .eq('account_type', 'company')
      .or(`display_name.ilike.${ilike},headline.ilike.${ilike}`)
      .limit(perTable),
    supabase
      .from('conversation_rooms')
      .select('id, name, sector, status')
      .ilike('name', ilike)
      .limit(perTable),
    supabase
      .from('jobs')
      .select('id, title, sector, location, company:profiles!company_id(id, display_name)')
      .eq('is_active', true)
      .or(`title.ilike.${ilike},description.ilike.${ilike}`)
      .limit(perTable),
    supabase
      .from('posts')
      .select('id, content, sector, author:profiles!author_id(id, display_name)')
      .ilike('content', ilike)
      .order('created_at', { ascending: false })
      .limit(perTable),
  ])

  const result = {
    people: peopleRes.data || [],
    companies: companiesRes.data || [],
    rooms: roomsRes.data || [],
    jobs: jobsRes.data || [],
    posts: postsRes.data || [],
  }
  result.totalCount =
    result.people.length +
    result.companies.length +
    result.rooms.length +
    result.jobs.length +
    result.posts.length
  return result
}

// True for short, non-question queries — the kind a header search bar would
// have handled. Used to decide whether to inline an entity-result block into
// the AI chat ("Yara" → look it up; "summarize my rooms" → don't).
export function looksLikeEntityLookup(query) {
  const q = (query || '').trim()
  if (!q) return false
  if (/[?]/.test(q)) return false
  // Up to four words; no leading verb that signals a request to act on data.
  const words = q.split(/\s+/)
  if (words.length > 4) return false
  if (/^(summarize|draft|find|search|tell|show|what|who|how|when|why|tune|help)\b/i.test(q)) return false
  return true
}

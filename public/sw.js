// Compound — minimal service worker.
// Strategy:
//   - Pre-cache the app shell on install.
//   - On fetch, try network first for HTML/JS/CSS so users don't get stale UI;
//     fall back to cache when offline.
//   - For Supabase / Anthropic API calls, always go to the network. We never
//     cache them (auth + freshness sensitive).

const CACHE = 'compound-shell-v1'
const SHELL = ['/', '/index.html', '/manifest.json', '/icon.svg', '/icon-maskable.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Never intercept API calls — they need fresh auth + data.
  if (url.hostname.includes('supabase.co') || url.hostname.includes('anthropic.com')) {
    return
  }
  // Same-origin only
  if (url.origin !== self.location.origin) return

  event.respondWith(
    fetch(req)
      .then(res => {
        // Cache successful same-origin GETs for offline fallback
        if (res && res.ok && res.type === 'basic') {
          const clone = res.clone()
          caches.open(CACHE).then(cache => cache.put(req, clone)).catch(() => {})
        }
        return res
      })
      .catch(() =>
        caches.match(req).then(cached => cached || caches.match('/'))
      )
  )
})

const CACHE = "lovepager-v1"

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  )
  self.clients.claim()
})

// Network-first: serve fresh content when online, fall back to cache when offline
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return
  if (e.request.url.includes("/api/")) return // never cache API calls

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone()
        caches.open(CACHE).then((c) => c.put(e.request, clone))
        return res
      })
      .catch(() => caches.match(e.request)),
  )
})

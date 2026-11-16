// Service worker minimo: serve a Chrome su Android per "Installa app".
// Prende sempre i file dalla rete (così l'app è sempre aggiornata);
// solo se manca la connessione usa l'ultima copia salvata della pagina.
// Le chiamate a Supabase (altro dominio) non vengono toccate.
const CACHE = 'casti-tesla-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add('./')))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomi) => Promise.all(nomi.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  event.respondWith(
    fetch(req)
      .then((risposta) => {
        if (risposta.ok) {
          const copia = risposta.clone()
          caches.open(CACHE).then((c) => c.put(req, copia))
        }
        return risposta
      })
      .catch(() => caches.match(req).then((r) => r ?? caches.match('./'))),
  )
})

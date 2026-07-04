self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("flowledger-v1").then((cache) =>
      cache.addAll(["/", "/manifest.json"])
    )
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.hostname.includes("supabase.co") || url.hostname.includes("supabase.com") || url.hostname.includes("monobank.ua")) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// 하영시 앱 서비스 워커 — 앱 셸 오프라인 캐시
const CACHE = "hayoungshi-v8";
const ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "qt.js",
  "gospel.js",
  "praise.js",
  "mcheyne.js",
  "bible.js",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // 외부 CDN은 캐시 우선
  if (url.origin !== location.origin) {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request))
    );
    return;
  }
  // 앱 파일은 항상 네트워크에서 최신본 (오프라인일 때만 캐시)
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

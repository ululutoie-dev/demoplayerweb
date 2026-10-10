// sw.js
// PWAとしてホーム画面から起動できるようにするための最小限のService Worker。
// 音源データ（Blob）はここではキャッシュしない。音源はIndexedDBが担当する。
// ここでキャッシュするのは「アプリの外枠（HTML/CSS/JS）」だけ。

const CACHE_NAME = "demo-player-shell-v2";
const SHELL_FILES = [
  "./index.html",
  "./db.js",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // アプリシェルのみキャッシュ優先。それ以外（無い想定だが）はネットワーク優先。
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).catch(() => {
          // オフラインでキャッシュにもない場合は index.html にフォールバック
          return caches.match("./index.html");
        })
      );
    })
  );
});

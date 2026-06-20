// FOCA — Service Worker
// Estratégia:
//  - HTML/JS da app: "network-first" (tenta sempre a versão mais recente;
//    se não houver rede, usa a última versão guardada em cache).
//  - Ícones/manifest/fontes/CDN estáticos: "cache-first" (mais rápido, raramente mudam).
//  - Firebase/Firestore: nunca interceta — fica sempre a ir direto à rede,
//    o SDK do Firebase já trata da persistência offline própria.

const CACHE_VERSION = 'foca-v1';
const STATIC_CACHE = CACHE_VERSION + '-static';
const APP_CACHE = CACHE_VERSION + '-app';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-72.png',
  './icon-96.png',
  './icon-128.png',
  './icon-144.png',
  './icon-152.png',
  './icon-192.png',
  './icon-384.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(APP_CACHE).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) {
          return k.indexOf(CACHE_VERSION) !== 0;
        }).map(function (k) {
          return caches.delete(k);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function isFirebaseRequest(url) {
  return /firestore\.googleapis\.com|firebaseio\.com|googleapis\.com\/v0\/b|identitytoolkit|securetoken\.googleapis\.com/.test(url);
}

self.addEventListener('fetch', function (event) {
  var req = event.request;

  // Só tratamos GET; ignoramos POST/PUT (Firebase, etc.)
  if (req.method !== 'GET') return;

  var url = req.url;

  // Nunca cachear/intercetar tráfego do Firebase — vai sempre direto à rede.
  if (isFirebaseRequest(url)) return;

  var isNavigation = req.mode === 'navigate' || (req.destination === 'document');
  var isSameOrigin = url.indexOf(self.location.origin) === 0;

  if (isNavigation || isSameOrigin) {
    // Network-first para a app (HTML/JS/CSS embutido no index.html)
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var clone = res.clone();
          caches.open(APP_CACHE).then(function (cache) {
            cache.put(req, clone);
          });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (cached) {
          return cached || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // Cache-first para recursos estáticos externos (fontes Google, CDN xlsx, etc.)
  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var clone = res.clone();
          caches.open(STATIC_CACHE).then(function (cache) {
            cache.put(req, clone);
          });
        }
        return res;
      }).catch(function () {
        return cached;
      });
    })
  );
});

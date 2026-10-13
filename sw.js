const CACHE_NAME = 'ISFplan-v1.6.9.4';

const ASSETS_TO_CACHE = [
    './',
    './style.css',
    './styleProFeatures.css',
    './dayReport.html',
    './index.html',
    './login.html',
    './modals.html',
    './auth.js',
    './config.js',
    './dayReportManager.js',
    './notificationManager.js',
    './offlineManager.js',
    './pwaManager.js',
    './script.js',
    './scriptProFeatures.js',
    './dropChampFeature.js',
    './exportFunction.js',
    './manifest.json',
    './icon/siteIcon.png',
    './icon/siteLogo.png',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js',
    'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js'
];

self.addEventListener('install', (event) => {
    // self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Usiamo map + promise per evitare che un singolo fallimento blocchi tutto
            return Promise.all(
                ASSETS_TO_CACHE.map(url => {
                    return cache.add(url).catch(err => console.warn('Non Cacheable:', url, err));
                })
            );
        })
    );
});

// BB: Ricezione Messaggio Dal Client Per Attivazione Controllata
self.addEventListener('message', (event) => {
    // CC: Attiviamo il nuovo SW solo su esplicita richiesta, dopo consenso utente
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        }).then(() => clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // 1. ESCLUSIONE TOTALE: Se è una richiesta a Supabase, ignora il Service Worker
    if (event.request.url.includes('supabase.co')) {
        return; // Il SW non intercetta la richiesta, passa direttamente alla rete
    }

    // 2. LOGICA CACHE:
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Se sei offline e hai la risorsa in cache, usala
            if (cachedResponse && !navigator.onLine) {
                return cachedResponse;
            }

            // Altrimenti, prova sempre a prendere dalla rete (Network First)
            return fetch(event.request)
                .then((networkResponse) => {
                    // Se la rete risponde, aggiorna la cache
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                    // Per risorse non navigate non in cache, restituire Response vuota appropriata
                    if (cachedResponse) return cachedResponse;
                    return new Response('', { status: 408, statusText: 'Offline - Resource Not Cached' });
                });
        })
    );
});

self.addEventListener('push', (event) => {
    // 1. Definiamo i default
    let title = "ISFplan";
    let body = "Hai una nuova notifica";

    // 2. Cerchiamo di parsare il contenuto
    if (event.data) {
        try {
            const data = event.data.json();
            title = data.title || title;
            body = data.body || body;
        } catch (e) {
            // Se non è JSON, prendiamo il testo grezzo
            body = event.data.text();
        }
    }

    // 3. Mostriamo la notifica
    event.waitUntil(
        self.registration.showNotification(title, {
            body: body,
            icon: 'icon/siteIcon.png',
            badge: 'icon/siteIcon.png',
            vibrate: [200, 100, 200] // Aggiungi una piccola vibrazione per renderla più professionale
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    // Recupera l'URL dai dati della notifica
    const targetUrl = event.notification.data && event.notification.data.url
        ? event.notification.data.url
        : null;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Se non c'è un URL specifico (es. notifica di Sync), 
            // cerchiamo solo di riportare l'app in primo piano
            if (!targetUrl) {
                if (windowClients.length > 0) {
                    return windowClients[0].focus();
                }
                return clients.openWindow('./index.html');
            }

            // Se c'è un URL (es. dayReport.html)
            for (let client of windowClients) {
                // Se una finestra è già aperta su quella pagina, focalizzala
                if (client.url.includes(targetUrl) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Altrimenti apri una nuova finestra con quell'URL
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
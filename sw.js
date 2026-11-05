/* =========================================================
   MAC CHICKEN — sw.js
   Service worker básico: solo existe para que el navegador considere
   la web "instalable" (PWA) y para que la carcasa de la app (HTML, CSS,
   JS, íconos) cargue rápido y funcione si el celular se queda sin señal
   un instante. NUNCA cachea /api/ ni nada que no sea GET: el estado del
   local, la carta y los pedidos siempre deben venir en vivo del servidor.
   ========================================================= */
'use strict';

const CACHE_NAME = 'macchicken-v1';

// Carcasa mínima de la app: lo justo para que la pantalla de inicio abra
// algo útil aunque no haya señal en ese instante.
const APP_SHELL = [
    '.',
    'index.html',
    'estilos.css',
    'script.js',
    'manifest.json',
    'img/icon-192.png',
    'img/icon-512.png',
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .catch(() => { /* si una imagen falla al cachear, no debe romper la instalación */ })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(nombres => Promise.all(nombres.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    const url = new URL(req.url);

    // Solo GET, del mismo origen, y nunca la API (pedidos/carta/estado en vivo).
    if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
        return;
    }

    // "Stale-while-revalidate": responde al toque con lo que haya en caché
    // (si lo hay) y, en paralelo, pide la versión nueva para la próxima vez.
    event.respondWith(
        caches.match(req).then(cacheado => {
            const actualizar = fetch(req)
                .then(resp => {
                    if (resp && resp.ok) {
                        const copia = resp.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(req, copia));
                    }
                    return resp;
                })
                .catch(() => cacheado);
            return cacheado || actualizar;
        })
    );
});

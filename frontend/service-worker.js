
// Do not cache error responses (401, 403, etc.)
function shouldCache(response) {
    return response.ok && response.status >= 200 && response.status < 300;
}
// VPS DevOps Agent - Premium Service Worker
// Version: 2.0.0 - PWA Premium with advanced caching strategies
// Features: Stale-While-Revalidate, Cache-First, Network-First, Offline Fallback

const SW_VERSION = 'vps-devops-premium-v2.0';
const CACHE_NAMES = {
  APP_SHELL: `${SW_VERSION}-appshell`,
  STATIC_ASSETS: `${SW_VERSION}-static`,
  CDN_ASSETS: `${SW_VERSION}-cdn`,
  API_CACHE: `${SW_VERSION}-api`,
  IMAGES: `${SW_VERSION}-images`,
  FONTS: `${SW_VERSION}-fonts`,
  DYNAMIC: `${SW_VERSION}-dynamic`
};

// App Shell - Critical resources cached on install
const APP_SHELL = [
  '/dashboard.html',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/app.js',
  '/auth-guard.js',
  '/auth-init.js',
  '/ai-assistant.js',
  '/robust-websocket.js',
  '/autonomous-server-selector.js',
  '/assets/icon.svg',
  '/assets/icon-192.png',
  '/assets/icon-512.png'
];

// Static pages to cache on install
const STATIC_PAGES = [
  '/terminal-ssh.html',
  '/ai-agent-chat.html',
  '/agent-devops.html',
  '/monitoring.html',
  '/monitoring-advanced.html',
  '/docker-manager.html',
  '/cicd.html',
  '/code-analyzer.html',
  '/sandbox-playground.html',
  '/admin-panel.html',
  '/projects-manager.html',
  '/subscription-manager.html',
  '/enhancements.html',
  '/autonomous-agent.html',
  '/autonomous-chat.html'
];

// CDN Resources to cache on first fetch
const CDN_PATTERNS = [
  'cdn.tailwindcss.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com'
];

// ===== INSTALL EVENT =====
self.addEventListener('install', (event) => {
  console.log(`[SW ${SW_VERSION}] Installing...`);
  
  event.waitUntil(
    Promise.all([
      // Cache App Shell
      caches.open(CACHE_NAMES.APP_SHELL).then(async (cache) => {
        console.log('[SW] Caching App Shell');
        // Cache files one by one to prevent one failure from blocking all
        for (const url of APP_SHELL) {
          try {
            await cache.add(url);
          } catch (err) {
            console.warn(`[SW] Failed to cache ${url}:`, err.message);
          }
        }
      }),
      // Cache Static Pages
      caches.open(CACHE_NAMES.STATIC_ASSETS).then(async (cache) => {
        console.log('[SW] Caching Static Pages');
        for (const url of STATIC_PAGES) {
          try {
            await cache.add(url);
          } catch (err) {
            console.warn(`[SW] Failed to cache ${url}:`, err.message);
          }
        }
      })
    ]).then(() => {
      console.log(`[SW ${SW_VERSION}] Installed successfully`);
      return self.skipWaiting();
    })
  );
});

// ===== ACTIVATE EVENT =====
self.addEventListener('activate', (event) => {
  console.log(`[SW ${SW_VERSION}] Activating...`);
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !name.startsWith(SW_VERSION))
          .map((name) => {
            console.log(`[SW] Deleting old cache: ${name}`);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log(`[SW ${SW_VERSION}] Activated successfully`);
      return self.clients.claim();
    })
  );
});

// ===== FETCH EVENT - Intelligent Routing =====
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Skip chrome-extension and other non-http
  if (!url.protocol.startsWith('http')) return;

  // Route: API Requests → Network First with short cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(apiNetworkFirst(request));
    return;
  }
  
  // Route: CDN Resources → Cache First with long TTL
  if (CDN_PATTERNS.some(pattern => url.hostname.includes(pattern))) {
    event.respondWith(cacheFirstWithRefresh(request, CACHE_NAMES.CDN, 86400));
    return;
  }
  
  // Route: Font files → Cache First with very long TTL
  if (url.pathname.match(/\.(woff2?|ttf|otf|eot)$/i) || url.hostname.includes('fonts.')) {
    event.respondWith(cacheFirstWithRefresh(request, CACHE_NAMES.FONTS, 2592000));
    return;
  }
  
  // Route: Images → Cache First
  if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i)) {
    event.respondWith(staleWhileRevalidate(request, CACHE_NAMES.IMAGES));
    return;
  }
  
  // Route: HTML Pages → Network First with offline fallback
  if (request.headers.get('accept')?.includes('text/html') || url.pathname.endsWith('.html')) {
    event.respondWith(networkFirstWithOffline(request));
    return;
  }
  
  // Route: JS/CSS → Stale While Revalidate
  if (url.pathname.match(/\.(js|css)$/i)) {
    event.respondWith(staleWhileRevalidate(request, CACHE_NAMES.STATIC_ASSETS));
    return;
  }
  
  // Default: Stale While Revalidate
  event.respondWith(staleWhileRevalidate(request, CACHE_NAMES.DYNAMIC));
});

// ===== CACHING STRATEGIES =====

/**
 * Network First - For API calls: Try network, fallback to cache
 */
async function apiNetworkFirst(request) {
  const cache = await caches.open(CACHE_NAMES.API_CACHE);
  
  try {
    const networkResponse = await fetch(request, { 
      credentials: 'same-origin',
      headers: request.headers 
    });
    
    if (networkResponse.ok) {
      // Cache successful API responses for 30 seconds
      const responseToCache = networkResponse.clone();
      cache.put(request, responseToCache);
    }
    
    return networkResponse;
  } catch (error) {
    // Network failed, try cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      // Add offline header so the app knows
      const headers = new Headers(cachedResponse.headers);
      headers.set('X-SW-Cache', 'offline');
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers
      });
    }
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'offline',
      message: 'No internet connection. Data may be stale.'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Cache First with Refresh - For CDN resources
 * Serve from cache immediately, then update in background
 */
async function cacheFirstWithRefresh(request, cacheName, maxAge) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    // Check age
    const dateHeader = cachedResponse.headers.get('date');
    const cachedTime = dateHeader ? new Date(dateHeader).getTime() : 0;
    const age = (Date.now() - cachedTime) / 1000;
    
    if (age < maxAge) {
      return cachedResponse;
    }
    
    // Stale - serve cache but refresh in background
    refreshCache(request, cache);
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('', { status: 408 });
  }
}

/**
 * Stale While Revalidate - For static assets
 * Serve from cache, update in background
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  // Refresh in background
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => cachedResponse);
  
  // Return cache immediately if available, otherwise wait for network
  return cachedResponse || fetchPromise;
}

/**
 * Network First with Offline Page - For HTML navigation
 */
async function networkFirstWithOffline(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAMES.APP_SHELL);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;
    
    // Fallback to offline page for navigation requests
    const offlinePage = await caches.match('/offline.html');
    if (offlinePage) return offlinePage;
    
    return new Response(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Hors ligne - VPS DevOps Agent</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            color: white; min-height: 100vh; display: flex;
            align-items: center; justify-content: center; padding: 2rem;
          }
          .container { text-align: center; max-width: 500px; }
          .icon { font-size: 80px; margin-bottom: 24px; opacity: 0.8; }
          h1 { font-size: 28px; margin-bottom: 12px; color: #667eea; }
          p { color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
          .retry-btn {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white; border: none; padding: 12px 32px;
            border-radius: 12px; font-size: 16px; cursor: pointer;
            transition: transform 0.2s;
          }
          .retry-btn:hover { transform: scale(1.05); }
          .status { margin-top: 16px; font-size: 13px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">📡</div>
          <h1>Connexion perdue</h1>
          <p>VPS DevOps Agent nécessite une connexion internet pour fonctionner. Vérifiez votre réseau et réessayez.</p>
          <button class="retry-btn" onclick="window.location.reload()">Réessayer</button>
          <p class="status">Service Worker v${SW_VERSION} | Dernière sync: ${new Date().toLocaleTimeString('fr-FR')}</p>
        </div>
      </body>
      </html>
    `, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

/**
 * Refresh cache in background
 */
function refreshCache(request, cache) {
  fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response);
    }
  }).catch(() => {});
}

// ===== BACKGROUND SYNC =====
self.addEventListener('sync', (event) => {
  console.log(`[SW] Background sync: ${event.tag}`);
  
  if (event.tag === 'sync-server-metrics') {
    event.waitUntil(syncServerMetrics());
  }
  
  if (event.tag === 'sync-pending-commands') {
    event.waitUntil(syncPendingCommands());
  }
  
  if (event.tag === 'sync-data') {
    event.waitUntil(syncAllData());
  }
});

async function syncServerMetrics() {
  console.log('[SW] Syncing server metrics in background');
  try {
    const clients = await self.clients.matchAll();
    for (const client of clients) {
      client.postMessage({ type: 'SYNC_METRICS', timestamp: Date.now() });
    }
  } catch (error) {
    console.error('[SW] Sync metrics failed:', error);
  }
}

async function syncPendingCommands() {
  console.log('[SW] Syncing pending commands');
  // Notify clients to retry pending operations
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({ type: 'SYNC_COMMANDS', timestamp: Date.now() });
  }
}

async function syncAllData() {
  await syncServerMetrics();
  await syncPendingCommands();
}

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : 'Nouvelle notification' };
  }
  
  const notificationType = data.type || 'info';
  const icons = {
    alert: '/assets/icon-192.png',
    warning: '/assets/icon-192.png',
    info: '/assets/icon-192.png',
    success: '/assets/icon-192.png',
    error: '/assets/icon-192.png'
  };
  
  const titles = {
    alert: '⚠️ Alerte Système',
    warning: '🟡 Attention',
    info: 'ℹ️ Information',
    success: '✅ Succès',
    error: '❌ Erreur'
  };
  
  const title = data.title || titles[notificationType] || 'VPS DevOps Agent';
  const options = {
    body: data.body || 'Nouvelle notification',
    icon: icons[notificationType] || '/assets/icon-192.png',
    badge: '/assets/icon-72.png',
    tag: data.tag || `notif-${Date.now()}`,
    requireInteraction: notificationType === 'alert' || notificationType === 'error',
    silent: notificationType === 'info',
    vibrate: notificationType === 'alert' ? [200, 100, 200, 100, 200] : [100],
    data: {
      url: data.url || '/dashboard.html',
      type: notificationType,
      timestamp: Date.now()
    },
    actions: [
      { action: 'view', title: 'Voir' },
      { action: 'dismiss', title: 'Ignorer' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'dismiss') return;
  
  const urlToOpen = event.notification.data?.url || '/dashboard.html';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // Open new window
      return self.clients.openWindow(urlToOpen);
    })
  );
});

// ===== MESSAGE HANDLER =====
self.addEventListener('message', (event) => {
  const { data } = event;
  
  if (data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: SW_VERSION });
  }
  
  if (data?.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      Promise.all(names.map((name) => caches.delete(name))).then(() => {
        event.ports[0]?.postMessage({ cleared: true });
      });
    });
  }
  
  if (data?.type === 'CACHE_URLS') {
    const { urls } = data;
    caches.open(CACHE_NAMES.DYNAMIC).then((cache) => {
      Promise.all(urls.map((url) => cache.add(url).catch(() => {}))).then(() => {
        event.ports[0]?.postMessage({ cached: urls.length });
      });
    });
  }
  
  if (data?.type === 'REGISTER_SYNC') {
    self.registration.sync.register(data.tag || 'sync-data').catch((err) => {
      console.warn('[SW] Sync registration failed:', err);
    });
  }
});

// ===== PERIODIC BACKGROUND SYNC =====
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-metrics') {
    event.waitUntil(syncServerMetrics());
  }
});

console.log(`[SW ${SW_VERSION}] Premium Service Worker loaded`);

// VPS DevOps Agent - Service Worker
// Version: 1.0.0
// Phase 3 - PWA Support

const CACHE_VERSION = 'vps-devops-v1';
const CACHE_ASSETS = [
  '/dashboard.html',
  '/ai-agent-chat.html',
  '/terminal-ssh.html',
  '/agent-devops.html',
  '/docker-manager.html',
  '/monitoring.html',
  '/cicd.html',
  '/code-analyzer.html',
  '/sandbox-playground.html',
  '/monitoring-advanced.html',
  '/app.js',
  '/ai-assistant.js',
  '/manifest.json',
  // CDN assets (will be cached on first load)
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css'
];

// Install Event - Cache assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      console.log('[Service Worker] Caching assets');
      return cache.addAll(CACHE_ASSETS.filter(url => !url.startsWith('http')));
    }).then(() => {
      console.log('[Service Worker] Installed successfully');
      return self.skipWaiting(); // Activate immediately
    })
  );
});

// Activate Event - Clean old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_VERSION)
          .map((cacheName) => {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => {
      console.log('[Service Worker] Activated successfully');
      return self.clients.claim(); // Take control immediately
    })
  );
});

// Fetch Event - Network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip API requests (always go to network)
  if (request.url.includes('/api/')) {
    return;
  }
  
  event.respondWith(
    networkFirst(request)
  );
});

// Network First Strategy
async function networkFirst(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // If successful, update cache
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Network failed, try cache
    console.log('[Service Worker] Network failed, trying cache:', request.url);
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page if available
    if (request.destination === 'document') {
      return caches.match('/offline.html') || new Response(
        '<h1>Offline</h1><p>No internet connection. Please try again later.</p>',
        { headers: { 'Content-Type': 'text/html' } }
      );
    }
    
    throw error;
  }
}

// Background Sync (for future use)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  console.log('[Service Worker] Syncing data in background');
  // TODO: Implement data sync logic
}

// Push Notifications (for future use)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'VPS DevOps Agent';
  const options = {
    body: data.body || 'New notification',
    icon: '/assets/icon-192.png',
    badge: '/assets/badge-72.png',
    tag: data.tag || 'notification',
    requireInteraction: false,
    data: data.url ? { url: data.url } : undefined
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification Click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  }
});

// Message from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});

console.log('[Service Worker] Loaded successfully');

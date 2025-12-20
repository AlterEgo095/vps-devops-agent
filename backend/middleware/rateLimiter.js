/**
 * Rate Limiter Middleware
 * Limite le nombre de requêtes par IP pour éviter les abus
 */

// Store pour tracker les requêtes par IP
const requestStore = new Map();

// Configuration par endpoint
const RATE_LIMITS = {
  // Capacités Sprint 1 - Plus strictes
  '/api/capabilities/read-multiple': { window: 60000, max: 60 }, // 60 req/min
  '/api/capabilities/search': { window: 60000, max: 60 },
  '/api/capabilities/analyze': { window: 60000, max: 30 }, // Plus coûteux
  '/api/capabilities/edit': { window: 60000, max: 30 }, // Critique

  // Agent IA - Modéré
  '/api/agent/quick-execute': { window: 60000, max: 20 },
  '/api/agent/plan': { window: 60000, max: 30 },
  '/api/agent/execute': { window: 60000, max: 30 },

  // Autres - Plus permissif
  'default': { window: 60000, max: 100 }
};

/**
 * Nettoyer les entrées expirées
 */
function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, data] of requestStore.entries()) {
    if (now - data.resetTime > data.window) {
      requestStore.delete(key);
    }
  }
}

// Nettoyage automatique toutes les minutes
setInterval(cleanupExpiredEntries, 60000);

/**
 * Créer un rate limiter pour un endpoint spécifique
 */
export function createRateLimiter(endpoint) {
  const config = RATE_LIMITS[endpoint] || RATE_LIMITS.default;

  return (req, res, next) => {
    // Identifier l'utilisateur (IP + user si authentifié)
    const userId = req.user?.id || 'anonymous';
    const ip = req.ip || req.connection.remoteAddress;
    const identifier = `${endpoint}:${userId}:${ip}`;

    const now = Date.now();
    let userData = requestStore.get(identifier);

    // Initialiser ou reset si fenêtre expirée
    if (!userData || now - userData.resetTime > config.window) {
      userData = {
        count: 0,
        resetTime: now,
        window: config.window
      };
      requestStore.set(identifier, userData);
    }

    // Incrémenter le compteur
    userData.count++;

    // Calculer le temps restant avant reset
    const resetIn = Math.ceil((userData.resetTime + config.window - now) / 1000);

    // Headers informatifs
    res.setHeader('X-RateLimit-Limit', config.max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, config.max - userData.count));
    res.setHeader('X-RateLimit-Reset', resetIn);

    // Vérifier si limite dépassée
    if (userData.count > config.max) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        message: `Too many requests. Please try again in ${resetIn} seconds.`,
        limit: config.max,
        window: config.window / 1000,
        retryAfter: resetIn
      });
    }

    next();
  };
}

/**
 * Rate limiter général (fallback)
 */
export const rateLimiter = createRateLimiter('default');

/**
 * Rate limiters spécifiques pour capacités Sprint 1
 */
export const capabilitiesRateLimiter = {
  readMultiple: createRateLimiter('/api/capabilities/read-multiple'),
  search: createRateLimiter('/api/capabilities/search'),
  analyze: createRateLimiter('/api/capabilities/analyze'),
  edit: createRateLimiter('/api/capabilities/edit')
};

/**
 * Obtenir les stats de rate limiting (admin only)
 */
export function getRateLimitStats(req, res) {
  try {
    // Vérifier si admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const stats = {
      totalKeys: requestStore.size,
      entries: []
    };

    // Grouper par endpoint
    const byEndpoint = new Map();

    for (const [key, data] of requestStore.entries()) {
      const endpoint = key.split(':')[0];
      if (!byEndpoint.has(endpoint)) {
        byEndpoint.set(endpoint, {
          endpoint,
          users: 0,
          totalRequests: 0,
          avgRequestsPerUser: 0
        });
      }

      const endpointStats = byEndpoint.get(endpoint);
      endpointStats.users++;
      endpointStats.totalRequests += data.count;
    }

    // Calculer moyennes
    for (const [, data] of byEndpoint) {
      data.avgRequestsPerUser = Math.round(data.totalRequests / data.users);
      stats.entries.push(data);
    }

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Réinitialiser le rate limit d'un utilisateur (admin only)
 */
export function resetRateLimit(req, res) {
  try {
    const { userId, endpoint } = req.body;

    // Vérifier si admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    let cleared = 0;

    // Si endpoint spécifié, supprimer seulement pour cet endpoint
    if (endpoint) {
      for (const key of requestStore.keys()) {
        if (key.includes(userId) && key.startsWith(endpoint)) {
          requestStore.delete(key);
          cleared++;
        }
      }
    } else {
      // Sinon supprimer toutes les entrées de l'utilisateur
      for (const key of requestStore.keys()) {
        if (key.includes(userId)) {
          requestStore.delete(key);
          cleared++;
        }
      }
    }

    res.json({
      success: true,
      message: `Rate limit reset for user ${userId}`,
      entriesCleared: cleared
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

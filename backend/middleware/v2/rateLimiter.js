/**
 * Rate Limiter Middleware for V2 API
 * In-memory rate limiting per endpoint
 */

// Store for rate limit data
const rateLimitStore = new Map();

// Rate limit configuration per endpoint
const RATE_LIMITS = {
  '/api/v2/capabilities/read-multiple': {
    windowMs: 60000,      // 1 minute
    maxRequests: 60,      // 60 requests per minute
    message: 'Too many readMultipleFiles requests'
  },
  '/api/v2/capabilities/search': {
    windowMs: 60000,
    maxRequests: 60,
    message: 'Too many searchInFiles requests'
  },
  '/api/v2/capabilities/analyze': {
    windowMs: 60000,
    maxRequests: 30,      // More expensive operation
    message: 'Too many analyzeCodebase requests'
  },
  '/api/v2/capabilities/edit': {
    windowMs: 60000,
    maxRequests: 30,      // More expensive operation
    message: 'Too many editFile requests'
  },
  '/api/v2/capabilities/list': {
    windowMs: 60000,
    maxRequests: 100,     // Cheap operation
    message: 'Too many list requests'
  },
  'default': {
    windowMs: 60000,
    maxRequests: 100,
    message: 'Too many requests'
  }
};

/**
 * Get or create rate limit entry
 */
function getRateLimitEntry(identifier, endpoint) {
  const key = `${identifier}:${endpoint}`;
  
  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, {
      requests: [],
      blocked: false,
      blockUntil: null
    });
  }
  
  return rateLimitStore.get(key);
}

/**
 * Clean expired requests from the window
 */
function cleanExpiredRequests(entry, windowMs) {
  const now = Date.now();
  entry.requests = entry.requests.filter(timestamp => {
    return now - timestamp < windowMs;
  });
}

/**
 * Rate limiter middleware
 */
export function rateLimiter(req, res, next) {
  const endpoint = req.path;
  const identifier = req.user?.username || req.ip || 'anonymous';
  
  // Get rate limit config for this endpoint
  const config = RATE_LIMITS[endpoint] || RATE_LIMITS['default'];
  
  // Get or create rate limit entry
  const entry = getRateLimitEntry(identifier, endpoint);
  
  // Clean expired requests
  cleanExpiredRequests(entry, config.windowMs);
  
  // Check if blocked
  if (entry.blocked && entry.blockUntil && Date.now() < entry.blockUntil) {
    const retryAfter = Math.ceil((entry.blockUntil - Date.now()) / 1000);
    
    return res.status(429).json({
      success: false,
      error: config.message,
      retryAfter,
      meta: {
        version: 'v2',
        timestamp: new Date().toISOString(),
        rateLimit: {
          limit: config.maxRequests,
          windowMs: config.windowMs,
          remaining: 0,
          reset: new Date(entry.blockUntil).toISOString()
        }
      }
    });
  }
  
  // Check if limit exceeded
  if (entry.requests.length >= config.maxRequests) {
    // Block for the window duration
    entry.blocked = true;
    entry.blockUntil = Date.now() + config.windowMs;
    
    const retryAfter = Math.ceil(config.windowMs / 1000);
    
    return res.status(429).json({
      success: false,
      error: config.message,
      retryAfter,
      meta: {
        version: 'v2',
        timestamp: new Date().toISOString(),
        rateLimit: {
          limit: config.maxRequests,
          windowMs: config.windowMs,
          remaining: 0,
          reset: new Date(entry.blockUntil).toISOString()
        }
      }
    });
  }
  
  // Add current request
  entry.requests.push(Date.now());
  
  // Add rate limit headers
  res.setHeader('X-RateLimit-Limit', config.maxRequests);
  res.setHeader('X-RateLimit-Remaining', config.maxRequests - entry.requests.length);
  res.setHeader('X-RateLimit-Reset', new Date(Date.now() + config.windowMs).toISOString());
  
  next();
}

/**
 * Get rate limit stats for an identifier
 */
export function getRateLimitStats(identifier) {
  const stats = {};
  
  for (const [key, entry] of rateLimitStore.entries()) {
    if (key.startsWith(identifier + ':')) {
      const endpoint = key.split(':')[1];
      const config = RATE_LIMITS[endpoint] || RATE_LIMITS['default'];
      
      cleanExpiredRequests(entry, config.windowMs);
      
      stats[endpoint] = {
        requests: entry.requests.length,
        limit: config.maxRequests,
        remaining: Math.max(0, config.maxRequests - entry.requests.length),
        blocked: entry.blocked,
        blockUntil: entry.blockUntil ? new Date(entry.blockUntil).toISOString() : null,
        windowMs: config.windowMs
      };
    }
  }
  
  return stats;
}

/**
 * Reset rate limit for an identifier
 */
export function resetRateLimit(identifier, endpoint = null) {
  let resetCount = 0;
  
  if (endpoint) {
    // Reset specific endpoint
    const key = `${identifier}:${endpoint}`;
    if (rateLimitStore.has(key)) {
      rateLimitStore.delete(key);
      resetCount = 1;
    }
  } else {
    // Reset all endpoints for identifier
    for (const key of rateLimitStore.keys()) {
      if (key.startsWith(identifier + ':')) {
        rateLimitStore.delete(key);
        resetCount++;
      }
    }
  }
  
  return {
    success: true,
    message: `Reset ${resetCount} rate limit(s) for ${identifier}`,
    identifier,
    endpoint: endpoint || 'all'
  };
}

/**
 * Clean up old entries periodically
 */
setInterval(() => {
  const now = Date.now();
  const maxAge = 3600000; // 1 hour
  
  for (const [key, entry] of rateLimitStore.entries()) {
    const lastRequest = entry.requests[entry.requests.length - 1];
    if (lastRequest && now - lastRequest > maxAge) {
      rateLimitStore.delete(key);
    }
  }
}, 300000); // Clean every 5 minutes

export default rateLimiter;

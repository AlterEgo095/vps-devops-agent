/**
 * Metrics Middleware
 * Records request metrics for monitoring
 */

import { recordRequest, recordError } from '../services/monitoring.js';

/**
 * Middleware to track request metrics
 */
export function metricsMiddleware(req, res, next) {
    const startTime = Date.now();
    
    // Store original end function
    const originalEnd = res.end;
    
    // Override end function to capture metrics
    res.end = function(...args) {
        const duration = Date.now() - startTime;
        
        // Record request metrics
        recordRequest(
            req.method,
            req.route ? req.route.path : req.path,
            res.statusCode,
            duration
        );
        
        // Call original end function
        originalEnd.apply(res, args);
    };
    
    next();
}

/**
 * Error handler middleware with metrics recording
 */
export function errorMetricsMiddleware(err, req, res, next) {
    // Record error
    recordError(err, {
        method: req.method,
        path: req.path,
        query: req.query,
        body: req.body,
        headers: req.headers
    });
    
    // Pass to next error handler
    next(err);
}

export default {
    metricsMiddleware,
    errorMetricsMiddleware
};

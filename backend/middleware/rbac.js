/**
 * RBAC Middleware for VPS DevOps Agent
 * Provides permission checking and role-based access control
 */

import rbacDB from '../services/rbac-database.js';
import logManager from '../services/logManager.js';

/**
 * Middleware to check if user has specific permission
 * @param {string} resource - Resource name (e.g., 'users', 'servers', 'deployments')
 * @param {string} action - Action name (e.g., 'read', 'write', 'execute', 'delete', 'manage')
 * @returns {Function} Express middleware function
 */
export function checkPermission(resource, action) {
  return (req, res, next) => {
    try {
      // Ensure user is authenticated
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // Check if user is active
      const user = rbacDB.getUserById(req.user.id);
      if (!user || !user.is_active) {
        return res.status(403).json({
          success: false,
          error: 'User account is inactive'
        });
      }

      // Check permission
      const hasPermission = rbacDB.hasPermission(user.role, resource, action);
      
      if (!hasPermission) {
        logManager.log('warn', `Permission denied: ${user.username} attempted ${action} on ${resource}`, {
          userId: user.id,
          role: user.role,
          resource,
          action,
          ip: req.ip
        });

        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          required: { resource, action },
          userRole: user.role
        });
      }

      // Permission granted
      req.user.role = user.role; // Ensure role is set
      next();
    } catch (error) {
      logManager.log('error', `RBAC middleware error: ${error.message}`, {
        error: error.stack,
        resource,
        action
      });
      
      res.status(500).json({
        success: false,
        error: 'Permission check failed'
      });
    }
  };
}

/**
 * Middleware to require admin role
 * @returns {Function} Express middleware function
 */
export function requireAdmin(req, res, next) {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Check if user is active and admin
    const user = rbacDB.getUserById(req.user.id);
    if (!user || !user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'User account is inactive'
      });
    }

    if (user.role !== 'admin') {
      logManager.log('warn', `Admin access denied: ${user.username} (${user.role}) attempted admin action`, {
        userId: user.id,
        role: user.role,
        ip: req.ip
      });

      return res.status(403).json({
        success: false,
        error: 'Admin access required',
        userRole: user.role
      });
    }

    // Admin access granted
    req.user.role = 'admin'; // Ensure role is set
    next();
  } catch (error) {
    logManager.log('error', `Admin middleware error: ${error.message}`, {
      error: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: 'Admin check failed'
    });
  }
}

/**
 * Middleware to require user or admin role (excludes readonly)
 * @returns {Function} Express middleware function
 */
export function requireUserOrAdmin(req, res, next) {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Check if user is active
    const user = rbacDB.getUserById(req.user.id);
    if (!user || !user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'User account is inactive'
      });
    }

    if (user.role !== 'admin' && user.role !== 'user') {
      logManager.log('warn', `Write access denied: ${user.username} (${user.role}) attempted write operation`, {
        userId: user.id,
        role: user.role,
        ip: req.ip
      });

      return res.status(403).json({
        success: false,
        error: 'Write permissions required (user or admin role)',
        userRole: user.role
      });
    }

    // Access granted
    req.user.role = user.role; // Ensure role is set
    next();
  } catch (error) {
    logManager.log('error', `User/Admin middleware error: ${error.message}`, {
      error: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: 'Permission check failed'
    });
  }
}

/**
 * Middleware to check if user can access specific resource
 * Allows admins to access all resources, and users to access their own resources
 * @param {string} resourceType - Type of resource (e.g., 'user', 'session')
 * @param {Function} getResourceOwnerId - Function to extract owner ID from request
 * @returns {Function} Express middleware function
 */
export function requireOwnerOrAdmin(resourceType, getResourceOwnerId) {
  return (req, res, next) => {
    try {
      // Ensure user is authenticated
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // Check if user is active
      const user = rbacDB.getUserById(req.user.id);
      if (!user || !user.is_active) {
        return res.status(403).json({
          success: false,
          error: 'User account is inactive'
        });
      }

      // Admins can access any resource
      if (user.role === 'admin') {
        req.user.role = 'admin';
        return next();
      }

      // Get resource owner ID
      const ownerId = getResourceOwnerId(req);
      
      // Check if user is the owner
      if (user.id === ownerId) {
        req.user.role = user.role;
        return next();
      }

      // Access denied
      logManager.log('warn', `Resource access denied: ${user.username} attempted to access ${resourceType} owned by user ${ownerId}`, {
        userId: user.id,
        role: user.role,
        resourceType,
        ownerId,
        ip: req.ip
      });

      return res.status(403).json({
        success: false,
        error: `Access denied: You can only access your own ${resourceType}s`,
        userRole: user.role
      });
    } catch (error) {
      logManager.log('error', `Owner/Admin middleware error: ${error.message}`, {
        error: error.stack,
        resourceType
      });
      
      res.status(500).json({
        success: false,
        error: 'Permission check failed'
      });
    }
  };
}

export default {
  checkPermission,
  requireAdmin,
  requireUserOrAdmin,
  requireOwnerOrAdmin
};

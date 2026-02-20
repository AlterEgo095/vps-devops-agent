import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import logManager from './logManager.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('FATAL: JWT_SECRET environment variable must be set and be at least 32 characters long');
}

/**
 * Verify JWT token for WebSocket authentication
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * WebSocket Server for real-time log streaming
 */
export function setupWebSocketServer(server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws/logs'
  });

  console.log('🔌 WebSocket server initialized on /ws/logs');

  wss.on('connection', (ws, req) => {
    console.log('🔗 New WebSocket connection from', req.socket.remoteAddress);

    // Authentication check
    const token = new URL(req.url, 'ws://localhost').searchParams.get('token');
    
    if (!token) {
      ws.close(1008, 'Authentication required');
      console.log('❌ WebSocket connection rejected: No token provided');
      return;
    }

    try {
      // Verify JWT token
      const decoded = verifyToken(token);
      console.log('✅ WebSocket authenticated:', decoded.username);
      
      ws.isAuthenticated = true;
      ws.userId = decoded.id;
      ws.username = decoded.username;

    } catch (error) {
      ws.close(1008, 'Invalid token');
      console.log('❌ WebSocket connection rejected: Invalid token');
      return;
    }

    // Send recent logs on connection
    const recentLogs = logManager.getLogs(50);
    ws.send(JSON.stringify({
      type: 'history',
      data: recentLogs
    }));

    // Subscribe to new logs
    const logHandler = (logEntry) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'log',
          data: logEntry
        }));
      }
    };

    logManager.on('log', logHandler);

    // Handle client messages
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        
        switch (data.type) {
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
            
          case 'getLogs':
            const logs = logManager.getLogs(data.limit || 100, data.level);
            ws.send(JSON.stringify({
              type: 'logs',
              data: logs
            }));
            break;
            
          case 'getStats':
            const stats = logManager.getStats();
            ws.send(JSON.stringify({
              type: 'stats',
              data: stats
            }));
            break;
            
          default:
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Unknown message type'
            }));
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      console.log('🔌 WebSocket disconnected:', ws.username);
      logManager.removeListener('log', logHandler);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Send welcome message
    logManager.info(`WebSocket client connected: ${ws.username}`);
  });

  // Broadcast stats periodically
  setInterval(() => {
    const stats = logManager.getStats();
    wss.clients.forEach((ws) => {
      if (ws.readyState === ws.OPEN && ws.isAuthenticated) {
        ws.send(JSON.stringify({
          type: 'stats',
          data: stats
        }));
      }
    });
  }, 30000); // Every 30 seconds

  return wss;
}

export default setupWebSocketServer;

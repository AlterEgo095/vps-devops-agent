/**
 * 🔌 ROBUST WEBSOCKET CLIENT
 * 
 * WebSocket client avec reconnexion automatique, heartbeat,
 * gestion des erreurs et file d'attente de messages
 * 
 * Fonctionnalités:
 * - Reconnexion automatique exponentielle (backoff)
 * - Heartbeat ping/pong
 * - Queue de messages pendant déconnexion
 * - Event listeners typés
 * - Métriques de connexion
 */

class RobustWebSocket {
  constructor(url, options = {}) {
    this.url = url;
    this.ws = null;
    this.listeners = {};
    this.messageQueue = [];
    this.metrics = {
      connected: false,
      reconnectAttempts: 0,
      totalReconnects: 0,
      lastConnected: null,
      lastDisconnected: null,
      messagesSent: 0,
      messagesReceived: 0
    };

    // Configuration
    this.config = {
      reconnectInterval: options.reconnectInterval || 1000, // Départ: 1s
      maxReconnectInterval: options.maxReconnectInterval || 30000, // Max: 30s
      reconnectDecay: options.reconnectDecay || 1.5, // Backoff exponentiel
      maxReconnectAttempts: options.maxReconnectAttempts || Infinity,
      heartbeatInterval: options.heartbeatInterval || 30000, // Ping toutes les 30s
      heartbeatTimeout: options.heartbeatTimeout || 5000, // Timeout 5s
      debug: options.debug || false,
      autoConnect: options.autoConnect !== false
    };

    // Timers
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.heartbeatTimeoutTimer = null;

    if (this.config.autoConnect) {
      this.connect();
    }
  }

  /**
   * Établir la connexion WebSocket
   */
  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.log('warn', 'Already connected');
      return;
    }

    this.log('info', `Connecting to ${this.url}...`);
    
    try {
      this.ws = new WebSocket(this.url);
      this.setupEventHandlers();
    } catch (error) {
      this.log('error', 'Connection failed', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Configurer les gestionnaires d'événements WebSocket
   */
  setupEventHandlers() {
    this.ws.onopen = () => {
      this.log('info', '✅ Connected');
      this.metrics.connected = true;
      this.metrics.reconnectAttempts = 0;
      this.metrics.lastConnected = new Date();
      
      // Réinitialiser l'intervalle de reconnexion
      this.config.reconnectInterval = 1000;
      
      // Démarrer heartbeat
      this.startHeartbeat();
      
      // Envoyer les messages en queue
      this.flushMessageQueue();
      
      // Émettre événement connecté
      this.emit('connected', {
        timestamp: Date.now(),
        reconnects: this.metrics.totalReconnects
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.metrics.messagesReceived++;
        
        // Gérer pong heartbeat
        if (data.type === 'pong') {
          this.handlePong();
          return;
        }
        
        this.log('debug', 'Message received', data);
        this.emit(data.type || 'message', data.payload || data);
      } catch (error) {
        this.log('error', 'Failed to parse message', error);
      }
    };

    this.ws.onerror = (error) => {
      this.log('error', 'WebSocket error', error);
      this.emit('error', { error, timestamp: Date.now() });
    };

    this.ws.onclose = (event) => {
      this.log('warn', `Connection closed (code: ${event.code})`);
      this.metrics.connected = false;
      this.metrics.lastDisconnected = new Date();
      
      // Arrêter heartbeat
      this.stopHeartbeat();
      
      // Émettre événement déconnecté
      this.emit('disconnected', {
        code: event.code,
        reason: event.reason,
        timestamp: Date.now()
      });
      
      // Planifier reconnexion si pas volontaire
      if (event.code !== 1000) { // 1000 = fermeture normale
        this.scheduleReconnect();
      }
    };
  }

  /**
   * Planifier une tentative de reconnexion
   */
  scheduleReconnect() {
    if (this.metrics.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.log('error', '❌ Max reconnect attempts reached');
      this.emit('max_reconnect_failed', {
        attempts: this.metrics.reconnectAttempts,
        timestamp: Date.now()
      });
      return;
    }

    this.metrics.reconnectAttempts++;
    this.metrics.totalReconnects++;
    
    // Backoff exponentiel
    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(this.config.reconnectDecay, this.metrics.reconnectAttempts),
      this.config.maxReconnectInterval
    );

    this.log('info', `🔄 Reconnecting in ${Math.round(delay / 1000)}s... (attempt ${this.metrics.reconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Démarrer le heartbeat ping/pong
   */
  startHeartbeat() {
    this.stopHeartbeat(); // Clear any existing
    
    this.heartbeatTimer = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.log('debug', 'Sending ping...');
        this.send('ping', { timestamp: Date.now() });
        
        // Timeout pour attendre pong
        this.heartbeatTimeoutTimer = setTimeout(() => {
          this.log('warn', '⚠️ Heartbeat timeout - reconnecting');
          this.ws.close();
        }, this.config.heartbeatTimeout);
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Arrêter le heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  /**
   * Gérer réception pong
   */
  handlePong() {
    this.log('debug', 'Pong received');
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  /**
   * Envoyer un message
   */
  send(type, payload = {}) {
    const message = { type, payload, timestamp: Date.now() };
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
        this.metrics.messagesSent++;
        this.log('debug', 'Message sent', message);
      } catch (error) {
        this.log('error', 'Failed to send message', error);
        this.queueMessage(message);
      }
    } else {
      this.log('warn', 'Not connected - queueing message');
      this.queueMessage(message);
    }
  }

  /**
   * Ajouter message à la queue
   */
  queueMessage(message) {
    this.messageQueue.push(message);
    
    // Limiter la taille de la queue
    if (this.messageQueue.length > 100) {
      this.messageQueue.shift();
      this.log('warn', 'Message queue full - dropping oldest message');
    }
  }

  /**
   * Envoyer tous les messages en queue
   */
  flushMessageQueue() {
    if (this.messageQueue.length === 0) return;
    
    this.log('info', `Flushing ${this.messageQueue.length} queued messages`);
    
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.send(message.type, message.payload);
    }
  }

  /**
   * Écouter un événement
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return this; // Chainable
  }

  /**
   * Retirer un listener
   */
  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    return this;
  }

  /**
   * Émettre un événement
   */
  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        this.log('error', `Error in ${event} listener`, error);
      }
    });
  }

  /**
   * Fermer la connexion
   */
  close(code = 1000, reason = 'Client closed') {
    this.log('info', 'Closing connection...');
    
    // Empêcher reconnexion
    this.config.maxReconnectAttempts = 0;
    
    // Clear timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.stopHeartbeat();
    
    // Fermer WebSocket
    if (this.ws) {
      this.ws.close(code, reason);
    }
  }

  /**
   * Obtenir métriques
   */
  getMetrics() {
    return {
      ...this.metrics,
      queueSize: this.messageQueue.length,
      uptime: this.metrics.lastConnected 
        ? Date.now() - this.metrics.lastConnected.getTime()
        : 0
    };
  }

  /**
   * Logger interne
   */
  log(level, message, data) {
    if (!this.config.debug && level === 'debug') return;
    
    const prefix = '[RobustWebSocket]';
    const logData = data ? data : '';
    
    switch (level) {
      case 'error':
        console.error(prefix, message, logData);
        break;
      case 'warn':
        console.warn(prefix, message, logData);
        break;
      case 'info':
        console.info(prefix, message, logData);
        break;
      case 'debug':
        console.log(prefix, message, logData);
        break;
    }
  }
}

// Export pour utilisation
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RobustWebSocket;
}

// Export global pour navigateur
if (typeof window !== 'undefined') {
  window.RobustWebSocket = RobustWebSocket;
}

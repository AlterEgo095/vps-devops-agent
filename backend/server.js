// Charger les variables d'environnement EN PREMIER
import dotenv from 'dotenv';
dotenv.config();

// ============================================================
// [SECURITY] P1.2 — Validation des secrets critiques au boot
// L'application refuse de démarrer si JWT_SECRET est absent
// ou trop court (< 32 caractères). Cela empêche le fallback
// vers 'default-secret-change-me' qui permettrait la forgerie
// de tokens JWT par n'importe qui.
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.trim().length < 32) {
  console.error('');
  console.error('╔══════════════════════════════════════════════════════════╗');
  console.error('║  ERREUR CRITIQUE DE SÉCURITÉ — DÉMARRAGE INTERROMPU     ║');
  console.error('╠══════════════════════════════════════════════════════════╣');
  console.error('║  JWT_SECRET est absent ou trop court (< 32 caractères). ║');
  console.error('║  Configurez-le dans votre fichier .env :                ║');
  console.error('║                                                          ║');
  console.error('║  JWT_SECRET=<chaîne aléatoire d\'au moins 32 chars>      ║');
  console.error('║                                                          ║');
  console.error('║  Génération rapide :                                     ║');
  console.error('║  node -e "console.log(require(\'crypto\')                  ║');
  console.error('║           .randomBytes(48).toString(\'hex\'))"             ║');
  console.error('╚══════════════════════════════════════════════════════════╝');
  console.error('');
  process.exit(1);
}

// [SECURITY] P1.3 — Vérification du mot de passe admin au boot
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD || ADMIN_PASSWORD === 'admin2025' || ADMIN_PASSWORD === 'Admin2024' || ADMIN_PASSWORD.length < 8) {
  console.error('');
  console.error('╔══════════════════════════════════════════════════════════╗');
  console.error('║  ERREUR CRITIQUE DE SÉCURITÉ — DÉMARRAGE INTERROMPU     ║');
  console.error('╠══════════════════════════════════════════════════════════╣');
  console.error('║  ADMIN_PASSWORD est absent, trop court (< 8 chars)      ║');
  console.error('║  ou utilise un mot de passe par défaut connu.           ║');
  console.error('║  Configurez-le dans votre fichier .env :                ║');
  console.error('║                                                          ║');
  console.error('║  ADMIN_PASSWORD=<votre_mot_de_passe_securise>           ║');
  console.error('╚══════════════════════════════════════════════════════════╝');
  console.error('');
  process.exit(1);
}

import express from 'express';
import { validationFailureLogger } from './middleware/security-logger.js';
import { apiLimiter } from './middleware/rate-limiter.js';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import logger from './config/logger.js';
import { httpLogger, requestLogger } from './middleware/http-logger.js';

// Import routes
import authRouter from './routes/auth.js';
import agentRouter from './routes/agent.js';
import aiChatRouter from './routes/ai-chat.js';
import projectsRouter from './routes/projects.js';
import subscriptionRouter from './routes/subscription.js';
import subscriptionV2Router from './routes/subscription-v2.js';
import adminRouter from './routes/admin.js';
import serversRouter from './routes/servers.js';
import templatesRouter from './routes/templates.js';
import autonomousRouter from './routes/autonomous.js';
import autonomousV2Router from './routes/autonomous-v2.js';
import aiAgentRouter from './routes/ai-agent.js';
import terminalRouter, { initializeWebSocket } from './routes/terminal.js';
import cron from 'node-cron';
import SystemMonitor from './services/system-monitor.js';
import AlertManager from './services/alert-manager.js';
import dockerRouter from './routes/docker.js';
import monitoringRouter from './routes/monitoring.js';
// [SECURITY] P1.4 — Import des deux routers CI/CD :
// - cicdRouter    : routes protégées par JWT (gestion projets, pipelines, etc.)
// - webhookRouter : routes publiques validées par signature HMAC (GitHub/GitLab)
import cicdRouter, { webhookRouter } from './routes/cicd.js';
import enhancementsRouter from './routes/enhancements.js';
import securityRouter from './routes/security.js';
import capabilitiesRouter from './routes/capabilities.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


const app = express();
app.set("trust proxy", true); // ✅ Faire confiance au proxy nginx pour obtenir la vraie IP
// 🛡️ Rate limiting global pour toutes les routes API
app.use('/api/', apiLimiter);
const PORT = process.env.PORT || 4000;

// Créer un serveur HTTP pour supporter WebSocket
const server = http.createServer(app);

// Middleware
// 🔒 Configuration Helmet pour headers de sécurité
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "cdn.jsdelivr.net", "cdn.tailwindcss.com", "cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "cdn.tailwindcss.com", "cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "data:", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'"],
      scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000, // 1 an
    includeSubDomains: true,
    preload: true
  }
}));

// 🚀 Compression des réponses HTTP (Amélioration Performance)
app.use(compression({
  level: 6,
  threshold: 1024, // Compresser uniquement > 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// [SECURITY] CORS configuré — restreint en production
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : (process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000', 'http://localhost:4000', 'http://localhost:8080']);

app.use(cors({
  origin: (origin, callback) => {
    // Autoriser les requêtes sans origin (curl, Postman, même serveur)
    if (!origin) return callback(null, true);
    // En production, si ALLOWED_ORIGINS est vide, autoriser le même domaine
    if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('CORS non autorisé'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(validationFailureLogger);
app.use(express.urlencoded({ extended: true }));

// 📊 Logging HTTP avec Morgan + Winston
app.use(httpLogger);
app.use(requestLogger);

// Logging middleware (remplacé par Winston)
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  logger.http(`${req.method} ${req.path}`, {
    method: req.method,
    path: req.path,
    ip: req.ip,
    timestamp
  });
  next();
});

// Static files (frontend)
app.use(express.static(join(__dirname, '../frontend')));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/ai/agent', aiChatRouter);
app.use('/api/agent', agentRouter);
app.use('/api/servers', serversRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/autonomous', autonomousRouter);
app.use('/api/autonomous/v2', autonomousV2Router);
app.use('/api/projects', projectsRouter);
app.use('/api/subscription', subscriptionRouter);
app.use('/api/subscription-v2', subscriptionV2Router);
app.use('/api/admin', adminRouter);
app.use('/api/ai', aiAgentRouter); // AI Agent routes
app.use('/api/terminal', terminalRouter); // Terminal SSH routes
app.use('/api/docker', dockerRouter); // ✨ Docker routes
app.use('/api/monitoring', monitoringRouter); // ✨ Monitoring routes
app.use('/api/cicd', cicdRouter); // ✨ CI/CD Pipeline routes (protégées JWT)
// [SECURITY] P1.4 — webhookRouter monté séparément, sans JWT, validé par HMAC (P1.6)
app.use('/api/cicd/webhooks', webhookRouter); // Webhook endpoints (GitHub/GitLab)
app.use('/api/enhancements', enhancementsRouter); // ✨ Enhancements API routes
app.use('/api/security', securityRouter); // 🔒 Security Monitoring routes
app.use('/api/capabilities', capabilitiesRouter); // 🚀 Code Analyzer routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    workspace: process.env.AGENT_WORKSPACE || '/opt/agent-projects',
    auth: {
      configured: !!process.env.ADMIN_USERNAME && !!process.env.ADMIN_PASSWORD,
      username: process.env.ADMIN_USERNAME || 'admin'
    },
    features: {
      aiAgent: true,
      sshTerminal: true,
      websocket: true,
      dockerManager: true, // ✨ NOUVEAU
      monitoring: true // ✨ NOUVEAU
    }
  });
});

// 404 handler
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Endpoint not found' });
  } else {
    res.sendFile(join(__dirname, '../frontend/index.html'));
  }
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server with WebSocket support
server.listen(PORT, '0.0.0.0', () => {
  logger.info('🚀 VPS DevOps Agent started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    workspace: process.env.AGENT_WORKSPACE || '/opt/agent-projects'
  });
  
  console.log(`\n🚀 VPS DevOps Agent running!`);
  console.log(`📡 Backend API: http://localhost:${PORT}`);
  console.log(`🌐 Frontend: http://localhost:${PORT}`);
  console.log(`📂 Workspace: ${process.env.AGENT_WORKSPACE || '/opt/agent-projects'}`);
  console.log(`🔒 Auth: ${process.env.REQUIRE_APPROVAL === 'true' ? 'Approval required' : 'Auto-execute'}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}/api/terminal/ws`);
  console.log(`🐳 Docker API: http://localhost:${PORT}/api/docker`);
  console.log(`📊 Monitoring API: http://localhost:${PORT}/api/monitoring`);
  console.log(`\n✨ Ready to receive commands!\n`);
  
  // Initialiser WebSocket après le démarrage du serveur
  initializeWebSocket(server);
  
  // ✨ Initialiser SystemMonitor instance
  const systemMonitor = new SystemMonitor(null); // Pass null for db as it's optional
  
  // ✨ Initialiser le monitoring automatique
  logger.info('📊 Starting automatic metrics collection...');
  console.log('📊 Starting automatic metrics collection...');
  
  // Collecter les métriques toutes les 30 secondes
  cron.schedule('*/30 * * * * *', async () => {
    try {
      const metrics = await systemMonitor.collectMetrics();
      // Note: saveMetrics will not work without db, but metrics collection will work
      if (systemMonitor.db) {
        systemMonitor.saveMetrics(metrics);
      }
      
      // Vérifier les seuils et envoyer des alertes si nécessaire
      const config = AlertManager.getAlertConfig();
      const alerts = systemMonitor.checkAlerts({
        cpu: config.threshold_cpu,
        memory: config.threshold_memory,
        disk: config.threshold_disk
      });
      
      // Envoyer les alertes détectées
      for (const alert of alerts) {
        await AlertManager.sendAlert(alert);
      }
    } catch (error) {
      logger.error('Error in metrics collection', {
        error: error.message,
        stack: error.stack
      });
    }
  });
  
  // Nettoyer les anciennes métriques tous les jours à minuit
  cron.schedule('0 0 * * *', () => {
    logger.info('🧹 Cleaning old metrics...');
    console.log('🧹 Cleaning old metrics...');
    if (systemMonitor.db) {
      systemMonitor.cleanOldMetrics(30); // Garder 30 jours
    }
  });
  
  logger.info('✅ Monitoring system initialized');
  console.log('✅ Monitoring system initialized');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

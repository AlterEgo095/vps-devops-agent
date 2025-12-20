// Charger les variables d'environnement EN PREMIER
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { validationFailureLogger } from './middleware/security-logger.js';
import { apiLimiter } from './middleware/rate-limiter.js';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';

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
import cicdRouter from './routes/cicd.js';
import enhancementsRouter from './routes/enhancements.js';
import securityRouter from './routes/security.js';
import capabilitiesRouter from './routes/capabilities.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


const app = express();
app.set("trust proxy", true); // ✅ Faire confiance au proxy nginx pour obtenir la vraie IP
// 🛡️ Rate limiting global pour toutes les routes API
// app.use('/api/', apiLimiter);
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
      connectSrc: ["'self'"],
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

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(validationFailureLogger);
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
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
app.use('/api/cicd', cicdRouter); // ✨ CI/CD Pipeline routes
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
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server with WebSocket support
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 VPS DevOps Agent running!`);
  console.log(`📡 Backend API: http://localhost:${PORT}`);
  console.log(`🌐 Frontend: http://localhost:${PORT}`);
  console.log(`📂 Workspace: ${process.env.AGENT_WORKSPACE || '/opt/agent-projects'}`);
  console.log(`🔒 Auth: ${process.env.REQUIRE_APPROVAL === 'true' ? 'Approval required' : 'Auto-execute'}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}/api/terminal/ws`);
  console.log(`🐳 Docker API: http://localhost:${PORT}/api/docker`); // ✨ NOUVEAU
  console.log(`📊 Monitoring API: http://localhost:${PORT}/api/monitoring`); // ✨ NOUVEAU
  console.log(`\n✨ Ready to receive commands!\n`);
  
  // Initialiser WebSocket après le démarrage du serveur
  initializeWebSocket(server);
  
  // ✨ Initialiser SystemMonitor instance
  const systemMonitor = new SystemMonitor(null); // Pass null for db as it's optional
  
  // ✨ Initialiser le monitoring automatique
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
      console.error('❌ Error in metrics collection:', error.message);
    }
  });
  
  // Nettoyer les anciennes métriques tous les jours à minuit
  cron.schedule('0 0 * * *', () => {
    console.log('🧹 Cleaning old metrics...');
    if (systemMonitor.db) {
      systemMonitor.cleanOldMetrics(30); // Garder 30 jours
    }
  });
  
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

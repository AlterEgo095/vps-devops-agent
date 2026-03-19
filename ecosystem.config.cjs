// ============================================================
// PM2 Configuration — VPS DevOps Agent (Production Contabo)
// ============================================================
// Ce fichier charge explicitement les variables d'environnement
// depuis .env et configure PM2 pour une production robuste.
//
// UTILISATION:
//   pm2 start ecosystem.config.cjs
//   pm2 save
//   pm2 startup
// ============================================================

const fs = require('fs');
const path = require('path');
const os = require('os');

// Fonction pour charger le fichier .env
function loadEnvFile() {
    const envPath = path.join(__dirname, '.env');
    const envVars = {};
    
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const lines = envContent.split('\n');
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            // Ignorer les commentaires et les lignes vides
            if (!trimmedLine || trimmedLine.startsWith('#')) continue;
            
            // Parser la ligne KEY=VALUE (supporte les valeurs avec = dedans)
            const eqIndex = trimmedLine.indexOf('=');
            if (eqIndex > 0) {
                const key = trimmedLine.substring(0, eqIndex).trim();
                let value = trimmedLine.substring(eqIndex + 1).trim();
                // Supprimer les quotes entourantes si présentes
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                envVars[key] = value;
            }
        }
    }
    
    return envVars;
}

const envVars = loadEnvFile();

// Détecter automatiquement le CWD (production vs dev)
const APP_DIR = fs.existsSync('/opt/vps-devops-agent/backend/server.js') 
    ? '/opt/vps-devops-agent' 
    : __dirname;

// Détecter le home de l'utilisateur courant
const HOME_DIR = os.homedir();

module.exports = {
    apps: [{
        name: 'vps-devops-agent',
        script: './backend/server.js',
        cwd: APP_DIR,
        
        // ============================================================
        // PROCESSUS
        // ============================================================
        instances: 1,          // 1 seul (SQLite ne supporte pas le multi-process)
        exec_mode: 'fork',     // fork (pas cluster) pour WebSocket + SQLite
        
        // ============================================================
        // MÉMOIRE ET STABILITÉ
        // ============================================================
        max_memory_restart: '500M',   // Restart auto si > 500MB RAM
        autorestart: true,             // Toujours redémarrer
        max_restarts: 15,              // Max 15 restarts avant stop
        min_uptime: '10s',             // Considérer stable après 10s
        restart_delay: 5000,           // Attendre 5s entre les restarts
        kill_timeout: 8000,            // 8s pour graceful shutdown
        listen_timeout: 15000,         // 15s pour le démarrage
        
        // ============================================================
        // WATCH (désactivé en production)
        // ============================================================
        watch: false,
        ignore_watch: ['node_modules', 'logs', 'data', '.git', 'backups'],
        
        // ============================================================
        // LOGS
        // ============================================================
        error_file: path.join(HOME_DIR, '.pm2/logs/vps-devops-agent-error.log'),
        out_file: path.join(HOME_DIR, '.pm2/logs/vps-devops-agent-out.log'),
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        time: true,
        
        // ============================================================
        // ENVIRONNEMENT
        // ============================================================
        env: {
            NODE_ENV: 'production',
            ...envVars
        },
        env_development: {
            NODE_ENV: 'development',
            PORT: 4000,
            ...envVars
        },
        
        // ============================================================
        // NODE.JS OPTIONS
        // ============================================================
        node_args: [
            '--max-old-space-size=512',    // Limite heap à 512MB
        ],
        
        // ============================================================
        // CRON RESTART (optionnel — restart quotidien à 4h du matin)
        // Décommenter si vous voulez un restart préventif quotidien
        // ============================================================
        // cron_restart: '0 4 * * *',
        
        // ============================================================
        // EXPONENTIAL BACKOFF RESTART
        // ============================================================
        exp_backoff_restart_delay: 1000, // Backoff exponentiel en cas de crashes
    }]
};

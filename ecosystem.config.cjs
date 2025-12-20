// PM2 Configuration pour VPS DevOps Agent
// Ce fichier charge explicitement les variables d'environnement depuis .env

const fs = require('fs');
const path = require('path');

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
            
            // Parser la ligne KEY=VALUE
            const match = trimmedLine.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim();
                envVars[key] = value;
            }
        }
    }
    
    return envVars;
}

const envVars = loadEnvFile();

module.exports = {
    apps: [{
        name: 'vps-devops-agent',
        script: './backend/server.js',
        cwd: '/opt/vps-devops-agent',
        instances: 1,
        exec_mode: 'fork',
        watch: false,
        max_memory_restart: '500M',
        env: {
            NODE_ENV: 'production',
            ...envVars  // Injecter toutes les variables du fichier .env
        },
        error_file: '/root/.pm2/logs/vps-devops-agent-error.log',
        out_file: '/root/.pm2/logs/vps-devops-agent-out.log',
        time: true,
        autorestart: true,
        max_restarts: 10,
        min_uptime: '10s'
    }]
};

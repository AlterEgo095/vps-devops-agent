import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

class SSHExecutor {
  constructor(config) {
    this.config = config;
    this.conn = new Client();
    this.connected = false;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const sshConfig = {
        host: this.config.host,
        port: this.config.port || 22,
        username: this.config.username
      };

      // Méthode 1: Clé privée
      if (this.config.privateKey) {
        sshConfig.privateKey = this.config.privateKey;
      }
      // Méthode 2: Chemin vers clé
      else if (this.config.privateKeyPath && fs.existsSync(this.config.privateKeyPath)) {
        sshConfig.privateKey = fs.readFileSync(this.config.privateKeyPath);
      }
      // Méthode 3: Clé par défaut
      else if (fs.existsSync(path.join(process.env.HOME || '/root', '.ssh', 'id_rsa'))) {
        sshConfig.privateKey = fs.readFileSync(path.join(process.env.HOME || '/root', '.ssh', 'id_rsa'));
      }
      // Méthode 4: Mot de passe
      else if (this.config.password) {
        sshConfig.password = this.config.password;
      }
      // Méthode 5: Agent SSH
      else if (process.env.SSH_AUTH_SOCK) {
        sshConfig.agent = process.env.SSH_AUTH_SOCK;
      }
      else {
        return reject(new Error('Aucune méthode d authentification SSH configurée'));
      }

      this.conn.on('ready', () => {
        this.connected = true;
        console.log('✅ SSH connecté:', this.config.host);
        resolve();
      }).on('error', (err) => {
        console.error('❌ Erreur SSH:', err.message);
        reject(err);
      }).connect(sshConfig);
    });
  }

  async executeCommand(command) {
    if (!this.connected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      this.conn.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('close', (code) => {
          resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
        }).on('data', (data) => {
          stdout += data.toString();
        }).stderr.on('data', (data) => {
          stderr += data.toString();
        });
      });
    });
  }

  disconnect() {
    if (this.connected) {
      this.conn.end();
      this.connected = false;
    }
  }
}

export default SSHExecutor;

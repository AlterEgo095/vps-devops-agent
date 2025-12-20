#!/usr/bin/env node

/**
 * 🔧 SCRIPT DE RÉINITIALISATION PROFESSIONNEL
 * Réinitialise l'utilisateur admin avec mot de passe sécurisé
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data/devops-agent.db');

console.log('\n🔧 RÉINITIALISATION PROFESSIONNELLE DU SYSTÈME\n');
console.log('═══════════════════════════════════════════════════════════\n');

try {
  const db = new Database(DB_PATH);
  
  console.log('📊 Connexion à la base de données...');
  
  // Créer la table users si elle n'existe pas
  console.log('📋 Création/Vérification de la table users...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Vérifier si l'utilisateur admin existe
  const existingUser = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  
  // Nouveau mot de passe professionnel
  const newPassword = 'Admin@2025!';
  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  
  if (existingUser) {
    console.log('🔄 Mise à jour de l\'utilisateur admin existant...');
    db.prepare(`
      UPDATE users 
      SET password = ?, 
          email = ?, 
          role = 'admin',
          updated_at = CURRENT_TIMESTAMP
      WHERE username = 'admin'
    `).run(hashedPassword, 'admin@aenews.net');
    
    console.log('✅ Utilisateur admin mis à jour avec succès !');
  } else {
    console.log('🆕 Création du nouvel utilisateur admin...');
    db.prepare(`
      INSERT INTO users (username, password, email, role)
      VALUES (?, ?, ?, 'admin')
    `).run('admin', hashedPassword, 'admin@aenews.net');
    
    console.log('✅ Utilisateur admin créé avec succès !');
  }
  
  // Vérifier tous les utilisateurs
  const allUsers = db.prepare('SELECT id, username, email, role, created_at FROM users').all();
  
  console.log('\n📊 UTILISATEURS DANS LA BASE DE DONNÉES:');
  console.log('═══════════════════════════════════════════════════════════');
  allUsers.forEach(user => {
    console.log(`  • ID: ${user.id}`);
    console.log(`    Username: ${user.username}`);
    console.log(`    Email: ${user.email || 'N/A'}`);
    console.log(`    Role: ${user.role}`);
    console.log(`    Created: ${user.created_at}`);
    console.log('');
  });
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\n🔐 IDENTIFIANTS ADMINISTRATEUR:');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Username: admin`);
  console.log(`  Password: ${newPassword}`);
  console.log(`  Email: admin@aenews.net`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log('⚠️  IMPORTANT: Changez ce mot de passe après la première connexion !\n');
  console.log('✅ Réinitialisation terminée avec succès !\n');
  
  db.close();
  process.exit(0);
  
} catch (error) {
  console.error('\n❌ ERREUR lors de la réinitialisation:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

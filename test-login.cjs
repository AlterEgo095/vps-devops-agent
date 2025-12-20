#!/usr/bin/env node

const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data/devops-agent.db');
const db = new Database(DB_PATH);

console.log('\n🔍 TEST DE CONNEXION\n');

// Test password
const testPassword = 'Admin@2025!';
console.log(`Test avec mot de passe: ${testPassword}`);

// Get user
const user = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');

if (!user) {
  console.log('❌ Utilisateur non trouvé');
  process.exit(1);
}

console.log('\n📊 Utilisateur trouvé:');
console.log(`  - ID: ${user.id}`);
console.log(`  - Username: ${user.username}`);
console.log(`  - Email: ${user.email}`);
console.log(`  - Hash: ${user.password.substring(0, 30)}...`);
console.log(`  - Active: ${user.is_active}`);

// Test bcrypt
console.log('\n🔐 Test de validation du mot de passe...');
try {
  const isValid = bcrypt.compareSync(testPassword, user.password);
  console.log(`Résultat: ${isValid ? '✅ VALIDE' : '❌ INVALIDE'}`);
  
  if (!isValid) {
    // Créer un nouveau hash
    console.log('\n🔧 Création d\'un nouveau hash...');
    const newHash = bcrypt.hashSync(testPassword, 10);
    console.log(`Nouveau hash: ${newHash.substring(0, 30)}...`);
    
    // Mise à jour
    db.prepare('UPDATE users SET password = ? WHERE username = ?').run(newHash, 'admin');
    console.log('✅ Hash mis à jour');
    
    // Re-test
    const newUser = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
    const isValidNow = bcrypt.compareSync(testPassword, newUser.password);
    console.log(`Nouveau test: ${isValidNow ? '✅ VALIDE' : '❌ INVALIDE'}`);
  }
} catch (error) {
  console.error('❌ Erreur bcrypt:', error.message);
}

db.close();

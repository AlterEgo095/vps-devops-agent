#!/usr/bin/env node

/**
 * Script to reset admin password in devops-agent.db
 * Usage: node reset-admin-password.cjs
 */

const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'devops-agent.db');
const db = new Database(dbPath);

// New password
const newPassword = 'Admin123!';
const username = 'admin';

console.log('🔐 Resetting admin password...\n');

try {
  // Check if user exists
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  
  if (!user) {
    console.error(`❌ User "${username}" not found!`);
    process.exit(1);
  }
  
  console.log('✅ User found:');
  console.log(`   - ID: ${user.id}`);
  console.log(`   - Username: ${user.username}`);
  console.log(`   - Email: ${user.email}`);
  console.log(`   - Role: ${user.role}`);
  console.log(`   - Active: ${user.is_active ? 'Yes' : 'No'}\n`);
  
  // Generate new password hash
  const passwordHash = bcrypt.hashSync(newPassword, 10);
  
  // Update password
  const result = db.prepare('UPDATE users SET password_hash = ? WHERE username = ?')
    .run(passwordHash, username);
  
  if (result.changes > 0) {
    console.log('✅ Password updated successfully!\n');
    console.log('📋 New credentials:');
    console.log(`   - Username: ${username}`);
    console.log(`   - Password: ${newPassword}\n`);
    console.log('🎉 You can now login with these credentials!');
  } else {
    console.error('❌ Failed to update password');
    process.exit(1);
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
} finally {
  db.close();
}

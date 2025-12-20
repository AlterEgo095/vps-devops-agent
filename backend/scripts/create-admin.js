/**
 * Script to create initial admin user for RBAC system
 * Usage: node scripts/create-admin.js [username] [email] [password]
 * Or run interactively without arguments
 */

import rbacDB from '../services/rbac-database.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function createAdminUser(username, email, password) {
  try {
    console.log('\n🔐 Creating admin user...\n');
    
    // Check if user already exists
    const existingUser = rbacDB.getUserByUsername(username);
    if (existingUser) {
      console.error(`❌ Error: User "${username}" already exists`);
      console.log('\n💡 Existing user details:');
      console.log(`   - ID: ${existingUser.id}`);
      console.log(`   - Email: ${existingUser.email}`);
      console.log(`   - Role: ${existingUser.role}`);
      console.log(`   - Active: ${existingUser.is_active ? 'Yes' : 'No'}`);
      console.log(`   - Created: ${existingUser.created_at}`);
      return false;
    }

    // Create admin user
    const user = await rbacDB.createUser({
      username,
      email,
      password,
      role: 'admin'
    });

    console.log('✅ Admin user created successfully!\n');
    console.log('📋 User details:');
    console.log(`   - ID: ${user.id}`);
    console.log(`   - Username: ${user.username}`);
    console.log(`   - Email: ${user.email}`);
    console.log(`   - Role: ${user.role}`);
    console.log(`   - Created: ${user.created_at}`);
    
    console.log('\n🔑 Login credentials:');
    console.log(`   - Username: ${username}`);
    console.log(`   - Password: ${password}`);
    
    console.log('\n📝 Next steps:');
    console.log('   1. Test login with: curl -X POST http://localhost:3000/api/auth/login \\');
    console.log('                            -H "Content-Type: application/json" \\');
    console.log(`                            -d '{"username":"${username}","password":"${password}"}'`);
    console.log('   2. Use the returned JWT token for authenticated requests');
    console.log('   3. Create additional users via /api/v2/users endpoint');
    
    return true;
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    console.error(error.stack);
    return false;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           VPS DevOps Agent - Admin User Creation              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  
  try {
    let username, email, password;
    
    // Check for command-line arguments
    if (process.argv.length >= 5) {
      username = process.argv[2];
      email = process.argv[3];
      password = process.argv[4];
      
      console.log('\n📌 Using command-line arguments:');
      console.log(`   - Username: ${username}`);
      console.log(`   - Email: ${email}`);
      console.log(`   - Password: ${'*'.repeat(password.length)}`);
      
    } else {
      // Interactive mode
      console.log('\n📝 Interactive mode - Please provide admin user details:\n');
      
      username = await question('Username (default: admin): ');
      username = username.trim() || 'admin';
      
      email = await question('Email (default: admin@localhost): ');
      email = email.trim() || 'admin@localhost';
      
      password = await question('Password (default: admin123): ');
      password = password.trim() || 'admin123';
    }
    
    // Validate inputs
    if (!username || username.length < 3) {
      console.error('❌ Error: Username must be at least 3 characters');
      process.exit(1);
    }
    
    if (!email || !email.includes('@')) {
      console.error('❌ Error: Invalid email address');
      process.exit(1);
    }
    
    if (!password || password.length < 6) {
      console.error('❌ Error: Password must be at least 6 characters');
      process.exit(1);
    }
    
    const success = await createAdminUser(username, email, password);
    
    rl.close();
    process.exit(success ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    rl.close();
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { createAdminUser };

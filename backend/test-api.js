import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';
const DB_PATH = './data/devops-agent.db';

console.log('🔍 DIAGNOSTIC COMPLET DE L\'AUTHENTIFICATION');
console.log('============================================\n');

// 1. Vérifier la base de données
console.log('1️⃣  Vérification de la base de données');
console.log('   Chemin:', DB_PATH);

const db = new Database('../data/devops-agent.db');
const user = db.prepare('SELECT id, username, email FROM users LIMIT 1').get();

if (!user) {
    console.log('❌ Aucun utilisateur trouvé\n');
    process.exit(1);
}

console.log('✅ Utilisateur trouvé:');
console.log(`   ID: ${user.id}`);
console.log(`   Username: ${user.username || 'N/A'}`);
console.log(`   Email: ${user.email || 'N/A'}\n');

// 2. Vérifier les serveurs
const servers = db.prepare('SELECT id, name, host FROM servers WHERE user_id = ?').all(user.id);
console.log(`2️⃣  Serveurs pour user_id=${user.id}: ${servers.length}`);
servers.forEach(s => {
    console.log(`   - ${s.name} (${s.host})`);
});
console.log('');

// 3. Générer un token
const token = jwt.sign(
    {
        id: user.id,
        username: user.username,
        email: user.email
    },
    JWT_SECRET,
    { expiresIn: '7d' }
);

console.log('3️⃣  Token JWT généré:');
console.log(token.substring(0, 50) + '...\n');

// 4. Tester avec curl
console.log('4️⃣  Test de l\'API /api/servers/list:');
console.log(`curl -H "Authorization: Bearer ${token.substring(0, 30)}..." http://localhost:4000/api/servers/list\n`);

// Enregistrer le token dans un fichier pour utilisation
import fs from 'fs';
fs.writeFileSync('/tmp/test-token.txt', token);
console.log('✅ Token enregistré dans /tmp/test-token.txt\n');

db.close();

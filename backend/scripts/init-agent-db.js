#!/usr/bin/env node

/**
 * Script d'initialisation des tables pour le VPS DevOps Agent
 * Phase 4 - Mode Formulaire & Gestion Serveurs
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DB_PATH = path.join(__dirname, '../../data/devops-agent.db');
const SCHEMA_PATH = path.join(__dirname, '../database/schema-agent.sql');

console.log('🚀 Initialisation de la base de données Agent...\n');

try {
    // Vérifier que la DB existe
    if (!fs.existsSync(DB_PATH)) {
        console.error('❌ Base de données introuvable:', DB_PATH);
        console.log('💡 Créez d\'abord la DB principale avec init-db.sql');
        process.exit(1);
    }

    // Lire le schema SQL
    console.log('📖 Lecture du schema SQL...');
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');

    // Connexion à la DB
    console.log('🔌 Connexion à la base de données...');
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Exécuter le schema
    console.log('⚙️  Exécution du schema...');
    db.exec(schema);

    // Vérifier les tables créées
    console.log('\n✅ Vérification des tables créées:');
    const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' 
        AND name IN ('servers', 'command_templates', 'command_history', 'server_metrics')
        ORDER BY name
    `).all();

    tables.forEach(table => {
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
        console.log(`   ✓ ${table.name.padEnd(25)} (${count.count} rows)`);
    });

    // Vérifier les templates par défaut
    console.log('\n📋 Templates de commandes installés:');
    const templates = db.prepare(`
        SELECT category, COUNT(*) as count 
        FROM command_templates 
        WHERE is_public = 1 
        GROUP BY category 
        ORDER BY category
    `).all();

    templates.forEach(cat => {
        console.log(`   ✓ ${cat.category.padEnd(15)} ${cat.count} templates`);
    });

    // Vérifier les vues
    console.log('\n👁️  Vues créées:');
    const views = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='view' 
        AND name LIKE 'v_%'
        ORDER BY name
    `).all();

    views.forEach(view => {
        console.log(`   ✓ ${view.name}`);
    });

    // Statistiques finales
    console.log('\n📊 Statistiques:');
    const stats = {
        servers: db.prepare('SELECT COUNT(*) as count FROM servers').get().count,
        templates: db.prepare('SELECT COUNT(*) as count FROM command_templates').get().count,
        history: db.prepare('SELECT COUNT(*) as count FROM command_history').get().count,
        metrics: db.prepare('SELECT COUNT(*) as count FROM server_metrics').get().count
    };

    console.log(`   • Serveurs: ${stats.servers}`);
    console.log(`   • Templates: ${stats.templates}`);
    console.log(`   • Historique: ${stats.history}`);
    console.log(`   • Métriques: ${stats.metrics}`);

    // Fermer la connexion
    db.close();

    console.log('\n🎉 Initialisation terminée avec succès!\n');
    console.log('📝 Prochaines étapes:');
    console.log('   1. Redémarrer le serveur backend');
    console.log('   2. Tester les nouveaux endpoints API');
    console.log('   3. Accéder au dashboard client');
    console.log('');

} catch (error) {
    console.error('\n❌ Erreur lors de l\'initialisation:', error.message);
    console.error(error.stack);
    process.exit(1);
}

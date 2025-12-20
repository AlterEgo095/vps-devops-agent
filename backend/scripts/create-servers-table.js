#!/usr/bin/env node
/**
 * Create Servers Table
 * Temporary table for testing AI Agent functionality
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '../../data/devops-agent.db');

console.log('🚀 Creating servers table...');
console.log(`📁 Database: ${dbPath}`);

try {
    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    
    // Create servers table
    console.log('\n📊 Creating servers table...');
    db.exec(`
        CREATE TABLE IF NOT EXISTS servers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            host TEXT NOT NULL,
            port INTEGER DEFAULT 22,
            username TEXT NOT NULL,
            encrypted_credentials TEXT,
            auth_type TEXT DEFAULT 'password', -- password, key, key_password
            description TEXT,
            tags TEXT, -- JSON array
            status TEXT DEFAULT 'active', -- active, inactive, error
            last_check DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        
        CREATE INDEX IF NOT EXISTS idx_servers_user_id ON servers(user_id);
        CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status);
    `);
    
    console.log('✅ Servers table created');
    
    // Insert test server (localhost)
    console.log('\n📝 Inserting test server data...');
    
    // Simple encoding for test password
    const testPassword = Buffer.from('test123').toString('base64');
    
    const insertStmt = db.prepare(`
        INSERT INTO servers (user_id, name, host, port, username, encrypted_credentials, auth_type, description, tags, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = insertStmt.run(
        1, // user_id (admin)
        'localhost',
        '127.0.0.1',
        22,
        'user',
        testPassword,
        'password',
        'Local development server for testing',
        JSON.stringify(['local', 'development', 'test']),
        'active'
    );
    
    console.log(`✅ Test server created (ID: ${result.lastInsertRowid})`);
    
    // Verify
    const servers = db.prepare('SELECT id, name, host, username, status FROM servers').all();
    console.log('\n📋 Servers in database:');
    servers.forEach(s => {
        console.log(`   ${s.id}. ${s.name} (${s.host}) - ${s.username} [${s.status}]`);
    });
    
    // Recreate ai_conversations with proper FK
    console.log('\n🔄 Updating ai_conversations table with proper FK...');
    db.exec(`
        -- Backup existing data
        CREATE TEMPORARY TABLE ai_conversations_backup AS SELECT * FROM ai_conversations;
        
        -- Drop old table
        DROP TABLE ai_conversations;
        
        -- Recreate with proper FK
        CREATE TABLE ai_conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            server_id INTEGER,
            title TEXT,
            context TEXT,
            status TEXT DEFAULT 'active',
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME,
            message_count INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE SET NULL
        );
        
        -- Restore data
        INSERT INTO ai_conversations SELECT * FROM ai_conversations_backup;
        
        -- Recreate indexes
        CREATE INDEX idx_ai_conversations_user_id ON ai_conversations(user_id);
        CREATE INDEX idx_ai_conversations_server_id ON ai_conversations(server_id);
        CREATE INDEX idx_ai_conversations_status ON ai_conversations(status);
        CREATE INDEX idx_ai_conversations_last_message ON ai_conversations(last_message_at DESC);
    `);
    
    console.log('✅ ai_conversations table updated with FK');
    
    // Recreate views
    console.log('\n👁️  Recreating views...');
    db.exec(`
        DROP VIEW IF EXISTS v_ai_conversations_summary;
        
        CREATE VIEW v_ai_conversations_summary AS
        SELECT 
            c.id,
            c.user_id,
            u.username,
            c.server_id,
            s.name as server_name,
            c.title,
            c.status,
            c.message_count,
            c.started_at,
            c.last_message_at,
            c.ended_at,
            COUNT(DISTINCT a.id) as action_count,
            SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed_actions,
            SUM(CASE WHEN a.status = 'failed' THEN 1 ELSE 0 END) as failed_actions,
            SUM(CASE WHEN a.risk_level = 'CRITICAL' THEN 1 ELSE 0 END) as critical_actions
        FROM ai_conversations c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN servers s ON c.server_id = s.id
        LEFT JOIN ai_actions a ON c.id = a.conversation_id
        GROUP BY c.id;
    `);
    
    console.log('✅ Views recreated');
    
    db.close();
    
    console.log('\n✅ Servers table setup complete!');
    console.log('🎯 Ready for full AI Agent testing');
    process.exit(0);
    
} catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
}

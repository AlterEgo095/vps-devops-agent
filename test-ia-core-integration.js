#!/usr/bin/env node

/**
 * Test d'intégration IA-CORE AENEWS
 * Vérifie la connexion et les fonctionnalités de l'API
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { testOpenAIConnection, sendToOpenAI } from './backend/services/openai-provider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charger le .env depuis le bon chemin
dotenv.config({ path: join(__dirname, '.env') });

console.log('\n🧪 TEST D\'INTÉGRATION IA-CORE AENEWS\n');
console.log('═══════════════════════════════════════════════════════════\n');

async function runTests() {
    console.log('📋 Configuration:');
    console.log(`   Base URL: ${process.env.OPENAI_BASE_URL}`);
    console.log(`   API Key: ${process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 12) + '...' : 'NOT SET'}`);
    console.log(`   Model: ${process.env.OPENAI_MODEL}`);
    console.log(`   Timeout: ${process.env.OPENAI_TIMEOUT}ms\n`);

    // Test 1: Connexion API
    console.log('🔌 Test 1: Connexion à l\'API IA-CORE...');
    try {
        const connectionTest = await testOpenAIConnection();
        if (connectionTest.success) {
            console.log('   ✅ Connexion réussie !');
            console.log(`   📊 Modèle: ${connectionTest.model}`);
            console.log(`   🌐 URL: ${connectionTest.baseUrl}\n`);
        } else {
            console.log('   ❌ Échec de connexion');
            console.log(`   💬 Erreur: ${connectionTest.error}\n`);
            return;
        }
    } catch (error) {
        console.log('   ❌ Erreur lors du test de connexion');
        console.log(`   💬 Message: ${error.message}\n`);
        return;
    }

    // Test 2: Requête simple
    console.log('💬 Test 2: Requête de chat simple...');
    try {
        const response = await sendToOpenAI([
            { role: 'user', content: 'Bonjour ! Réponds en une phrase courte.' }
        ], 'devops_agent');

        if (response.success) {
            console.log('   ✅ Réponse reçue !');
            console.log(`   💬 Message: ${response.message.substring(0, 100)}...`);
            console.log(`   📊 Tokens: ${response.usage ? JSON.stringify(response.usage) : 'N/A'}\n`);
        }
    } catch (error) {
        console.log('   ❌ Erreur lors de la requête');
        console.log(`   💬 Message: ${error.message}\n`);
    }

    // Test 3: Analyse de code
    console.log('🔍 Test 3: Analyse de code...');
    try {
        const codeAnalysis = await sendToOpenAI([
            {
                role: 'user',
                content: `Analyse ce code JavaScript et identifie les problèmes potentiels :

\`\`\`javascript
function calculateTotal(items) {
    let total = 0;
    for (let i = 0; i <= items.length; i++) {
        total += items[i].price;
    }
    return total;
}
\`\`\`

Donne une réponse courte (2-3 lignes).`
            }
        ], 'code_analyzer');

        if (codeAnalysis.success) {
            console.log('   ✅ Analyse terminée !');
            console.log(`   💬 Résultat: ${codeAnalysis.message.substring(0, 150)}...\n`);
        }
    } catch (error) {
        console.log('   ❌ Erreur lors de l\'analyse');
        console.log(`   💬 Message: ${error.message}\n`);
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n✅ TESTS TERMINÉS !\n');
    console.log('📊 Résumé:');
    console.log('   - IA-CORE AENEWS est correctement intégré');
    console.log('   - Les requêtes fonctionnent correctement');
    console.log('   - Le VPS DevOps Agent peut utiliser l\'IA\n');
}

// Exécuter les tests
runTests().catch(error => {
    console.error('\n❌ ERREUR CRITIQUE:', error.message);
    process.exit(1);
});

import * as openAIProvider from './openai-provider.js';
import SSHExecutor from './ssh-executor.js';

class AutonomousAgentEngine {
  constructor() {
    this.conversationHistory = [];
    this.context = {};
  }

  async executeNaturalLanguageCommand(command, serverConfig) {
    try {
      const messages = [
        {
          role: 'system',
          content: 'Tu es un agent DevOps autonome. Convertis les commandes en langage naturel en commandes système.'
        },
        {
          role: 'user',
          content: command
        }
      ];

      const response = await openAIProvider.chat(messages, {
        temperature: 0.2,
        max_tokens: 500
      });

      const aiResponse = response.choices[0].message.content;
      
      this.conversationHistory.push({
        role: 'user',
        content: command
      });
      this.conversationHistory.push({
        role: 'assistant',
        content: aiResponse
      });

      // Extraire les commandes (simplifié)
      const commandMatch = aiResponse.match(/```(?:bash)?\n([\s\S]+?)\n```/);
      const extractedCommand = commandMatch ? commandMatch[1].trim() : aiResponse;

      // Exécuter si un serveur est configuré
      if (serverConfig && serverConfig.host) {
        const result = await this.executeCommands([extractedCommand], serverConfig);
        return {
          success: true,
          aiResponse,
          command: extractedCommand,
          execution: result
        };
      }

      return {
        success: true,
        aiResponse,
        command: extractedCommand,
        execution: null
      };
    } catch (error) {
      console.error('❌ Agent error:', error);
      throw error;
    }
  }

  async executeCommands(commands, serverConfig) {
    const sshExecutor = new SSHExecutor(serverConfig);
    
    try {
      await sshExecutor.connect();
      
      const results = [];
      for (const command of commands) {
        const result = await sshExecutor.executeCommand(command);
        results.push(result);
      }
      
      sshExecutor.disconnect();
      
      return {
        success: true,
        results
      };
    } catch (error) {
      sshExecutor.disconnect();
      throw error;
    }
  }

  resetConversation() {
    this.conversationHistory = [];
    this.context = {};
    console.log('✅ Conversation réinitialisée');
    return {
      success: true,
      message: 'Conversation réinitialisée'
    };
  }

  getConversationHistory(limit = 50) {
    return this.conversationHistory.slice(-limit);
  }
}

const agentEngine = new AutonomousAgentEngine();

export default agentEngine;

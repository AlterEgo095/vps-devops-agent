/**
 * AI Assistant - Contextual AI Agent
 * Gère le contexte serveur et l'interaction avec l'agent AI
 */

class AIAssistant {
    constructor() {
        this.currentServer = null;
        this.messages = [];
        this.isTyping = false;
        this.isMinimized = false;
        this.API_BASE = window.location.origin + '/api';
        this.authToken = localStorage.getItem('token');
        
        this.init();
    }

    init() {
        this.createPanel();
        this.attachEventListeners();
        this.loadServerContext();
        this.showWelcomeMessage();
    }

    createPanel() {
        const panelHTML = `
            <!-- Floating Action Button -->
            <div id="ai-fab" class="active">
                <i class="fas fa-robot"></i>
            </div>

            <!-- AI Assistant Panel -->
            <div id="ai-assistant-panel" class="hidden">
                <!-- Header -->
                <div class="ai-panel-header" onclick="aiAssistant.toggleMinimize()">
                    <div class="ai-panel-title">
                        <i class="fas fa-robot ai-panel-icon"></i>
                        <span>Assistant AI</span>
                    </div>
                    <div class="ai-panel-controls" onclick="event.stopPropagation()">
                        <button class="ai-panel-btn" onclick="aiAssistant.toggleMinimize()" title="Réduire">
                            <i class="fas fa-minus"></i>
                        </button>
                        <button class="ai-panel-btn" onclick="aiAssistant.hidePanel()" title="Fermer">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                <!-- Server Context Badge -->
                <div id="ai-server-context" class="ai-server-context no-server">
                    <div class="server-indicator disconnected"></div>
                    <span id="ai-server-name">Aucun serveur sélectionné</span>
                </div>

                <!-- Quick Actions -->
                <div class="ai-quick-actions">
                    <div class="ai-quick-action" onclick="aiAssistant.quickCommand('Status CPU et RAM')">
                        <i class="fas fa-microchip"></i> Status système
                    </div>
                    <div class="ai-quick-action" onclick="aiAssistant.quickCommand('Liste des services actifs')">
                        <i class="fas fa-cogs"></i> Services
                    </div>
                    <div class="ai-quick-action" onclick="aiAssistant.quickCommand('Espace disque disponible')">
                        <i class="fas fa-hdd"></i> Disque
                    </div>
                </div>

                <!-- Chat Container -->
                <div id="ai-chat-container" class="ai-chat-container">
                    <!-- Messages will be added here -->
                </div>

                <!-- Input Area -->
                <div class="ai-input-container">
                    <input 
                        type="text" 
                        id="ai-input" 
                        class="ai-input" 
                        placeholder="Demandez en français..." 
                        onkeypress="if(event.key==='Enter') aiAssistant.sendMessage()"
                    >
                    <button 
                        id="ai-send-btn" 
                        class="ai-send-btn" 
                        onclick="aiAssistant.sendMessage()"
                    >
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', panelHTML);
    }

    attachEventListeners() {
        // FAB button
        const fab = document.getElementById('ai-fab');
        if (fab) {
            fab.onclick = () => this.showPanel();
        }

        // Listen to server context changes (from dashboard)
        window.addEventListener('serverContextChanged', (e) => {
            this.updateServerContext(e.detail);
        });
    }

    showPanel() {
        const panel = document.getElementById('ai-assistant-panel');
        const fab = document.getElementById('ai-fab');
        
        panel.classList.remove('hidden');
        fab.classList.remove('active');
        
        // Focus input
        setTimeout(() => {
            document.getElementById('ai-input')?.focus();
        }, 300);
    }

    hidePanel() {
        const panel = document.getElementById('ai-assistant-panel');
        const fab = document.getElementById('ai-fab');
        
        panel.classList.add('hidden');
        fab.classList.add('active');
    }

    toggleMinimize() {
        const panel = document.getElementById('ai-assistant-panel');
        this.isMinimized = !this.isMinimized;
        
        if (this.isMinimized) {
            panel.classList.add('minimized');
        } else {
            panel.classList.remove('minimized');
        }
    }

    loadServerContext() {
        // Try to get current server from global context or localStorage
        const storedServerId = localStorage.getItem('currentServerId');
        if (storedServerId) {
            this.fetchServerDetails(storedServerId);
        }
    }

    async fetchServerDetails(serverId) {
        try {
            const response = await fetch(`${this.API_BASE}/agent/servers`, {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                const server = data.data.find(s => s.id == serverId);
                if (server) {
                    this.updateServerContext(server);
                }
            }
        } catch (error) {
            console.error('Error fetching server details:', error);
        }
    }

    updateServerContext(server) {
        this.currentServer = server;
        
        const contextDiv = document.getElementById('ai-server-context');
        const serverName = document.getElementById('ai-server-name');
        const indicator = contextDiv?.querySelector('.server-indicator');
        
        if (server && contextDiv && serverName && indicator) {
            contextDiv.classList.remove('no-server');
            serverName.textContent = `Serveur: ${server.name || server.host}`;
            indicator.classList.remove('disconnected');
            
            // Add system message
            this.addMessage('system', `Contexte changé: Connecté à ${server.name || server.host}`);
        } else if (contextDiv && serverName && indicator) {
            contextDiv.classList.add('no-server');
            serverName.textContent = 'Aucun serveur sélectionné';
            indicator.classList.add('disconnected');
        }
    }

    showWelcomeMessage() {
        const container = document.getElementById('ai-chat-container');
        if (container) {
            container.innerHTML = `
                <div class="ai-welcome">
                    <div class="ai-welcome-icon">
                        <i class="fas fa-robot"></i>
                    </div>
                    <div class="ai-welcome-title">Bonjour! Je suis votre Assistant AI</div>
                    <div class="ai-welcome-text">
                        Posez-moi des questions en français et j'exécuterai les commandes 
                        sur le serveur actuellement sélectionné.
                        <br><br>
                        <strong>Exemples:</strong><br>
                        "Quel est l'état du CPU?"<br>
                        "Redémarre nginx"<br>
                        "Montre les logs"
                    </div>
                </div>
            `;
        }
    }

    addMessage(type, content, metadata = {}) {
        const container = document.getElementById('ai-chat-container');
        if (!container) return;

        // Remove welcome message if present
        const welcome = container.querySelector('.ai-welcome');
        if (welcome) {
            welcome.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ${type}`;
        
        let icon = '';
        if (type === 'user') icon = '<i class="fas fa-user"></i>';
        else if (type === 'assistant') icon = '<i class="fas fa-robot"></i>';
        else if (type === 'system') icon = '<i class="fas fa-info-circle"></i>';

        let messageHTML = `
            <div class="ai-message-header">
                ${icon}
                <span>${type === 'user' ? 'Vous' : type === 'assistant' ? 'Assistant' : 'Système'}</span>
                <span style="margin-left: auto; opacity: 0.6;">${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div class="ai-message-content">${this.formatContent(content)}</div>
        `;

        // Add command output if present
        if (metadata.command) {
            messageHTML += `
                <div class="ai-message-code">
                    <div style="color: #10b981; margin-bottom: 4px;">$ ${metadata.command}</div>
                    ${metadata.output ? `<pre style="margin: 0; white-space: pre-wrap;">${metadata.output}</pre>` : ''}
                </div>
            `;
        }

        messageDiv.innerHTML = messageHTML;
        container.appendChild(messageDiv);
        
        // Scroll to bottom
        container.scrollTop = container.scrollHeight;

        this.messages.push({ type, content, metadata, timestamp: Date.now() });
    }

    formatContent(content) {
        // Basic markdown-like formatting
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">$1</code>')
            .replace(/\n/g, '<br>');
    }

    showTypingIndicator() {
        const container = document.getElementById('ai-chat-container');
        if (!container) return;

        const typingDiv = document.createElement('div');
        typingDiv.id = 'ai-typing-indicator';
        typingDiv.className = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
        
        container.appendChild(typingDiv);
        container.scrollTop = container.scrollHeight;
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('ai-typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    quickCommand(command) {
        document.getElementById('ai-input').value = command;
        this.sendMessage();
    }

    async sendMessage() {
        const input = document.getElementById('ai-input');
        const sendBtn = document.getElementById('ai-send-btn');
        const userMessage = input.value.trim();
        
        if (!userMessage || this.isTyping) return;

        // Check if server is selected
        if (!this.currentServer) {
            this.addMessage('system', '⚠️ Veuillez d\'abord sélectionner un serveur dans le dashboard.');
            return;
        }

        // Add user message
        this.addMessage('user', userMessage);
        input.value = '';
        
        // Disable input
        this.isTyping = true;
        sendBtn.disabled = true;
        this.showTypingIndicator();

        try {
            // Call AI endpoint with natural language
            const response = await fetch(`${this.API_BASE}/ai/agent/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    message: userMessage,
                    serverId: this.currentServer.id,
                    context: {
                        serverName: this.currentServer.name,
                        serverHost: this.currentServer.host
                    }
                })
            });

            const data = await response.json();

            if (data.success) {
                // Add AI response
                this.addMessage('assistant', data.response, {
                    command: data.command,
                    output: data.output
                });
            } else {
                this.addMessage('assistant', `❌ Erreur: ${data.error || 'Une erreur est survenue'}`);
            }

        } catch (error) {
            console.error('Error sending message:', error);
            this.addMessage('system', '❌ Erreur de communication avec le serveur');
        } finally {
            this.hideTypingIndicator();
            this.isTyping = false;
            sendBtn.disabled = false;
            input.focus();
        }
    }

    // Public method to set server context (called from dashboard)
    setServer(server) {
        this.updateServerContext(server);
        if (server) {
            localStorage.setItem('currentServerId', server.id);
        } else {
            localStorage.removeItem('currentServerId');
        }
    }
}

// Initialize AI Assistant when DOM is ready
let aiAssistant;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        aiAssistant = new AIAssistant();
    });
} else {
    aiAssistant = new AIAssistant();
}

// Make it globally accessible
window.aiAssistant = aiAssistant;

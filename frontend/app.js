// Configuration
const API_BASE = window.location.origin;
let authToken = localStorage.getItem('authToken');
let currentUser = null;

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const mainApp = document.getElementById('mainApp');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginErrorMessage = document.getElementById('loginErrorMessage');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const logoutBtn = document.getElementById('logoutBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const currentUserSpan = document.getElementById('currentUser');
const recentTasks = document.getElementById('recentTasks');
const refreshTasksBtn = document.getElementById('refreshTasksBtn');
const quickActionBtns = document.querySelectorAll('.quick-action');

// Initialize
init();

async function init() {
    if (authToken) {
        const isValid = await verifyToken();
        if (isValid) {
            showMainApp();
            await loadSystemInfo();
            await loadRecentTasks();
        } else {
            showLogin();
        }
    } else {
        showLogin();
    }
}

function showLogin() {
    loginScreen.classList.remove('hidden');
    mainApp.classList.add('hidden');
}

function showMainApp() {
    loginScreen.classList.add('hidden');
    mainApp.classList.remove('hidden');
    currentUserSpan.textContent = currentUser?.username || 'Admin';
}

// Authentication
async function verifyToken() {
    try {
        const response = await fetch(`${API_BASE}/api/auth/verify`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        const data = await response.json();
        if (data.valid) {
            currentUser = data.user;
            return true;
        }
        return false;
    } catch (error) {
        console.error('Token verification failed:', error);
        return false;
    }
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);
            showMainApp();
            await loadSystemInfo();
            await loadRecentTasks();
        } else {
            showLoginError(data.error || 'Identifiants invalides');
        }
    } catch (error) {
        showLoginError('Erreur de connexion au serveur');
        console.error('Login error:', error);
    }
});

logoutBtn.addEventListener('click', () => {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    showLogin();
});

function showLoginError(message) {
    loginErrorMessage.textContent = message;
    loginError.classList.remove('hidden');
    setTimeout(() => {
        loginError.classList.add('hidden');
    }, 5000);
}

// System Info
async function loadSystemInfo() {
    try {
        const response = await fetch(`${API_BASE}/api/health`);
        const data = await response.json();
        
        document.getElementById('aiProvider').textContent = 
            process.env?.AI_PROVIDER || 'OpenAI';
        document.getElementById('workspace').textContent = 
            data.workspace || '/opt/agent-projects';
    } catch (error) {
        console.error('Failed to load system info:', error);
    }
}

// Chat
chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const message = chatInput.value.trim();
    if (!message) return;

    // Add user message
    addMessage(message, 'user');
    chatInput.value = '';
    
    // Show loading
    const loadingId = addMessage('Analyse en cours', 'assistant', true);
    
    try {
        // Quick execute
        const response = await fetch(`${API_BASE}/api/agent/quick-execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ request: message })
        });

        const data = await response.json();
        
        // Remove loading message
        removeMessage(loadingId);

        if (data.success) {
            // Show plan
            addPlanMessage(data.plan);
            
            // Show results
            if (data.results && data.results.length > 0) {
                addResultsMessage(data.results);
            }

            // Show errors if any
            if (data.errors && data.errors.length > 0) {
                addErrorsMessage(data.errors);
            }

            // Success message
            addMessage('✅ Tâche terminée avec succès !', 'assistant');
        } else {
            addMessage(`❌ Erreur : ${data.error}`, 'assistant');
        }

        // Refresh tasks
        await loadRecentTasks();
    } catch (error) {
        removeMessage(loadingId);
        addMessage(`❌ Erreur de communication : ${error.message}`, 'assistant');
        console.error('Chat error:', error);
    }
});

clearChatBtn.addEventListener('click', () => {
    if (confirm('Effacer toute la conversation ?')) {
        chatMessages.innerHTML = '';
    }
});

function addMessage(content, sender, isLoading = false) {
    const messageId = `msg-${Date.now()}-${Math.random()}`;
    const isUser = sender === 'user';
    
    const messageDiv = document.createElement('div');
    messageDiv.id = messageId;
    messageDiv.className = 'chat-message flex gap-3';
    
    if (isUser) {
        messageDiv.innerHTML = `
            <div class="flex-1"></div>
            <div class="max-w-2xl">
                <div class="bg-blue-600 text-white rounded-lg p-4">
                    <p>${escapeHtml(content)}</p>
                </div>
            </div>
            <div class="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                <i class="fas fa-user text-gray-600 text-sm"></i>
            </div>
        `;
    } else {
        messageDiv.innerHTML = `
            <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                <i class="fas fa-robot text-white text-sm"></i>
            </div>
            <div class="flex-1 max-w-2xl">
                <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <p class="${isLoading ? 'loading-dots' : ''}">${escapeHtml(content)}</p>
                </div>
            </div>
        `;
    }
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return messageId;
}

function removeMessage(messageId) {
    const message = document.getElementById(messageId);
    if (message) {
        message.remove();
    }
}

function addPlanMessage(plan) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message flex gap-3';
    
    let actionsHtml = '';
    if (plan.actions && plan.actions.length > 0) {
        actionsHtml = plan.actions.map(action => `
            <div class="flex gap-2 p-2 bg-white rounded border border-gray-200">
                <span class="text-blue-600 font-semibold">${action.step}.</span>
                <div class="flex-1">
                    <p class="text-sm text-gray-800">${escapeHtml(action.description)}</p>
                    <p class="text-xs text-gray-500 mt-1">
                        <code class="bg-gray-100 px-2 py-0.5 rounded">${escapeHtml(action.capability)}</code>
                    </p>
                </div>
            </div>
        `).join('');
    }
    
    messageDiv.innerHTML = `
        <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
            <i class="fas fa-robot text-white text-sm"></i>
        </div>
        <div class="flex-1">
            <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h4 class="font-semibold text-gray-900 mb-2">
                    <i class="fas fa-clipboard-list mr-2"></i>Plan d'action
                </h4>
                <p class="text-sm text-gray-700 mb-3">${escapeHtml(plan.analysis || plan.plan || 'Analyse complétée')}</p>
                ${actionsHtml ? `<div class="space-y-2">${actionsHtml}</div>` : ''}
                ${plan.estimated_time ? `
                    <p class="text-xs text-gray-500 mt-3">
                        <i class="fas fa-clock mr-1"></i>Temps estimé : ${escapeHtml(plan.estimated_time)}
                    </p>
                ` : ''}
            </div>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addResultsMessage(results) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message flex gap-3';
    
    const resultsHtml = results.map(result => {
        const icon = result.success ? 
            '<i class="fas fa-check-circle text-green-600"></i>' : 
            '<i class="fas fa-times-circle text-red-600"></i>';
        
        return `
            <div class="p-2 bg-white rounded border ${result.success ? 'border-green-200' : 'border-red-200'}">
                <div class="flex gap-2 items-start">
                    ${icon}
                    <div class="flex-1">
                        <p class="text-sm font-medium text-gray-900">Step ${result.step}</p>
                        ${result.result?.stdout ? `
                            <pre class="text-xs text-gray-600 mt-1 overflow-x-auto">${escapeHtml(result.result.stdout.substring(0, 200))}</pre>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    messageDiv.innerHTML = `
        <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
            <i class="fas fa-robot text-white text-sm"></i>
        </div>
        <div class="flex-1">
            <div class="bg-green-50 rounded-lg p-4 border border-green-200">
                <h4 class="font-semibold text-gray-900 mb-2">
                    <i class="fas fa-check mr-2 text-green-600"></i>Résultats d'exécution
                </h4>
                <div class="space-y-2">
                    ${resultsHtml}
                </div>
            </div>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addErrorsMessage(errors) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message flex gap-3';
    
    const errorsHtml = errors.map(error => `
        <div class="p-2 bg-red-50 rounded border border-red-200">
            <p class="text-sm font-medium text-red-900">Step ${error.step}</p>
            <p class="text-xs text-red-700 mt-1">${escapeHtml(error.error)}</p>
        </div>
    `).join('');
    
    messageDiv.innerHTML = `
        <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
            <i class="fas fa-robot text-white text-sm"></i>
        </div>
        <div class="flex-1">
            <div class="bg-red-50 rounded-lg p-4 border border-red-200">
                <h4 class="font-semibold text-gray-900 mb-2">
                    <i class="fas fa-exclamation-triangle mr-2 text-red-600"></i>Erreurs
                </h4>
                <div class="space-y-2">
                    ${errorsHtml}
                </div>
            </div>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Recent Tasks
async function loadRecentTasks() {
    try {
        const response = await fetch(`${API_BASE}/api/agent/tasks`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (data.success && data.tasks.length > 0) {
            const tasksHtml = data.tasks.slice(0, 5).map(task => {
                const statusClass = `status-${task.status}`;
                const icon = getStatusIcon(task.status);
                
                return `
                    <div class="p-2 bg-gray-50 rounded-lg border border-gray-200">
                        <div class="flex items-center justify-between mb-1">
                            <span class="status-badge ${statusClass}">
                                ${icon}
                                ${task.status}
                            </span>
                            <span class="text-xs text-gray-500">
                                ${formatDate(task.createdAt)}
                            </span>
                        </div>
                        <p class="text-xs text-gray-700 truncate">${escapeHtml(task.request)}</p>
                    </div>
                `;
            }).join('');
            
            recentTasks.innerHTML = tasksHtml;
        } else {
            recentTasks.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Aucune tâche</p>';
        }
    } catch (error) {
        console.error('Failed to load tasks:', error);
    }
}

refreshTasksBtn.addEventListener('click', loadRecentTasks);

// Quick Actions
quickActionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const prompt = btn.dataset.prompt;
        chatInput.value = prompt;
        chatInput.focus();
    });
});

// Utility Functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getStatusIcon(status) {
    const icons = {
        planned: '<i class="fas fa-clock"></i>',
        executing: '<i class="fas fa-spinner fa-spin"></i>',
        completed: '<i class="fas fa-check-circle"></i>',
        failed: '<i class="fas fa-times-circle"></i>'
    };
    return icons[status] || '<i class="fas fa-question-circle"></i>';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'À l\'instant';
    if (diff < 3600000) return `Il y a ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `Il y a ${Math.floor(diff / 3600000)} h`;
    
    return date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

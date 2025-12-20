/**
 * UI pour la gestion des abonnements et limites
 * À charger après app.js
 */

let subscriptionData = null;
let usageData = null;

// Initialiser après le login
async function initSubscriptionUI() {
    // Vérifier onboarding
    const onboardingCompleted = localStorage.getItem('onboardingCompleted');
    if (!onboardingCompleted && authToken) {
        window.location.href = '/onboarding.html';
        return;
    }

    await loadSubscriptionData();
    await loadUsageData();
    showUsageDashboard();
    
    // Vérifier limites toutes les minutes
    setInterval(async () => {
        await loadUsageData();
        checkLimitsAndNotify();
    }, 60000);
}

// Charger données abonnement
async function loadSubscriptionData() {
    try {
        const response = await fetch(`${API_BASE}/api/subscription/current`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        
        if (data.success) {
            subscriptionData = data.subscription;
            updateSubscriptionBadge();
        }
    } catch (error) {
        console.error('Subscription load error:', error);
    }
}

// Charger données usage
async function loadUsageData() {
    try {
        const response = await fetch(`${API_BASE}/api/subscription/usage`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        
        if (data.success) {
            usageData = data.usage;
            updateUsageWidget();
        }
    } catch (error) {
        console.error('Usage load error:', error);
    }
}

// Badge plan dans header
function updateSubscriptionBadge() {
    const existingBadge = document.getElementById('planBadge');
    if (existingBadge) existingBadge.remove();

    if (!subscriptionData) return;

    const header = document.querySelector('header .max-w-7xl');
    if (!header) return;

    const badge = document.createElement('div');
    badge.id = 'planBadge';
    badge.className = 'absolute top-4 left-1/2 transform -translate-x-1/2 px-4 py-1 bg-blue-600 text-white text-sm font-semibold rounded-full shadow-lg';
    badge.innerHTML = `
        <i class="fas fa-star mr-1"></i>
        Plan ${subscriptionData.planDetails.name}
    `;
    badge.onclick = () => showUpgradeModal();
    badge.style.cursor = 'pointer';

    header.style.position = 'relative';
    header.appendChild(badge);
}

// Widget usage dans sidebar
function showUsageDashboard() {
    const existingWidget = document.getElementById('usageWidget');
    if (existingWidget) existingWidget.remove();

    if (!usageData) return;

    // Trouver la sidebar
    const sidebar = document.querySelector('#mainApp .space-y-6');
    if (!sidebar) return;

    const widget = document.createElement('div');
    widget.id = 'usageWidget';
    widget.className = 'bg-white rounded-xl shadow-sm border border-gray-200 p-6';
    
    widget.innerHTML = `
        <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900">
                <i class="fas fa-tachometer-alt mr-2 text-purple-600"></i>
                Usage
            </h3>
            <button onclick="loadUsageData()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-sync-alt text-sm"></i>
            </button>
        </div>
        
        <div class="space-y-4">
            ${renderUsageBar('Tâches/jour', usageData.usage.tasks.today, usageData.usage.tasks.todayLimit, usageData.usage.tasks.percentage)}
            ${renderUsageBar('IA/jour', usageData.usage.aiCalls.today, usageData.usage.aiCalls.todayLimit, usageData.usage.aiCalls.percentage)}
            ${renderUsageBar('Projets', usageData.usage.projects.count, usageData.usage.projects.limit, usageData.usage.projects.percentage)}
        </div>

        <button onclick="showUpgradeModal()" class="w-full mt-4 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-semibold rounded-lg hover:from-blue-700 hover:to-purple-700 transition shadow-md">
            <i class="fas fa-arrow-up mr-2"></i>Upgrader
        </button>
    `;

    sidebar.insertBefore(widget, sidebar.firstChild);
}

function renderUsageBar(label, current, limit, percentage) {
    const isUnlimited = limit === Infinity;
    const displayLimit = isUnlimited ? '∞' : limit;
    const color = getProgressColor(percentage);
    const width = isUnlimited ? 0 : Math.min(percentage, 100);

    return `
        <div>
            <div class="flex justify-between text-sm mb-1.5">
                <span class="text-gray-600">${label}</span>
                <span class="font-semibold text-gray-900">${current}/${displayLimit}</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div class="h-2 rounded-full ${color} transition-all duration-300" style="width: ${width}%"></div>
            </div>
        </div>
    `;
}

function getProgressColor(percentage) {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-orange-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
}

function updateUsageWidget() {
    showUsageDashboard();
}

// Notifications intelligentes
function checkLimitsAndNotify() {
    if (!usageData) return;

    const notifications = [];

    // Tâches
    if (usageData.usage.tasks.percentage >= 80 && usageData.usage.tasks.percentage < 100) {
        notifications.push({
            type: 'warning',
            icon: 'fa-exclamation-triangle',
            title: 'Limite proche',
            message: `${usageData.usage.tasks.today}/${usageData.usage.tasks.todayLimit} tâches utilisées aujourd'hui`,
            action: 'upgrade'
        });
    } else if (usageData.usage.tasks.percentage >= 100) {
        notifications.push({
            type: 'error',
            icon: 'fa-ban',
            title: 'Limite atteinte',
            message: 'Plus de tâches disponibles aujourd\'hui',
            action: 'upgrade_required'
        });
    }

    // IA
    if (usageData.usage.aiCalls.percentage >= 80 && usageData.usage.aiCalls.percentage < 100) {
        notifications.push({
            type: 'warning',
            icon: 'fa-brain',
            title: 'IA bientôt limitée',
            message: `${usageData.usage.aiCalls.today}/${usageData.usage.aiCalls.todayLimit} appels IA utilisés`,
            action: 'upgrade'
        });
    } else if (usageData.usage.aiCalls.percentage >= 100) {
        notifications.push({
            type: 'error',
            icon: 'fa-brain',
            title: 'IA bloquée',
            message: 'Upgradez pour plus d\'appels IA',
            action: 'upgrade_required'
        });
    }

    // Projets
    if (usageData.usage.projects.percentage >= 100) {
        notifications.push({
            type: 'error',
            icon: 'fa-folder',
            title: 'Limite projets atteinte',
            message: 'Supprimez un projet ou upgradez',
            action: 'upgrade_required'
        });
    }

    // Afficher seulement la première notification
    if (notifications.length > 0) {
        showSmartNotification(notifications[0]);
    }
}

let currentNotification = null;

function showSmartNotification(notification) {
    // Ne pas spam les notifications
    if (currentNotification) return;

    const banner = document.createElement('div');
    banner.className = `fixed bottom-4 right-4 max-w-sm z-50 shadow-2xl rounded-xl p-4 border-l-4 animate-slideIn ${
        notification.type === 'error' 
            ? 'bg-red-50 border-red-500' 
            : 'bg-yellow-50 border-yellow-500'
    }`;

    banner.innerHTML = `
        <div class="flex gap-3">
            <i class="fas ${notification.icon} ${notification.type === 'error' ? 'text-red-500' : 'text-yellow-500'} text-2xl"></i>
            <div class="flex-1">
                <h4 class="font-bold text-gray-900 mb-1">${notification.title}</h4>
                <p class="text-sm text-gray-700 mb-3">${notification.message}</p>
                <div class="flex gap-2">
                    ${notification.action ? `
                        <button onclick="showUpgradeModal(); closeNotification()" class="px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded hover:bg-blue-700 transition">
                            Voir les plans
                        </button>
                    ` : ''}
                    <button onclick="closeNotification()" class="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm font-semibold rounded hover:bg-gray-300 transition">
                        Plus tard
                    </button>
                </div>
            </div>
            <button onclick="closeNotification()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    document.body.appendChild(banner);
    currentNotification = banner;

    // Auto-fermer après 15 secondes
    setTimeout(() => {
        closeNotification();
    }, 15000);
}

window.closeNotification = function() {
    if (currentNotification) {
        currentNotification.remove();
        currentNotification = null;
    }
};

// Modal upgrade
window.showUpgradeModal = function() {
    const existingModal = document.getElementById('upgradeModal');
    if (existingModal) return;

    const modal = document.createElement('div');
    modal.id = 'upgradeModal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
    modal.style.animation = 'fadeIn 0.3s ease-out';
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden" style="animation: slideUp 0.3s ease-out">
            <div class="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-3xl font-bold mb-2">
                            <i class="fas fa-rocket mr-3"></i>
                            Passez à la vitesse supérieure
                        </h2>
                        <p class="text-blue-100">
                            Actuellement sur le plan <strong>${usageData?.plan.name || 'Free'}</strong>
                        </p>
                    </div>
                    <button onclick="closeUpgradeModal()" class="text-white hover:text-gray-200 transition">
                        <i class="fas fa-times text-2xl"></i>
                    </button>
                </div>
            </div>

            <div class="overflow-y-auto" style="max-height: calc(90vh - 100px)">
                <iframe src="/pricing.html" class="w-full h-screen border-0"></iframe>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Fermer en cliquant à l'extérieur
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeUpgradeModal();
        }
    });

    // Ajouter les animations CSS
    if (!document.getElementById('subscriptionAnimations')) {
        const style = document.createElement('style');
        style.id = 'subscriptionAnimations';
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideUp {
                from { transform: translateY(50px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            @keyframes slideIn {
                from { transform: translateX(400px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
};

window.closeUpgradeModal = function() {
    const modal = document.getElementById('upgradeModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.2s ease-out';
        setTimeout(() => modal.remove(), 200);
    }
};

// Intercepter les erreurs 403 (limite atteinte)
const originalFetch = window.fetch;
window.fetch = async function(...args) {
    const response = await originalFetch(...args);
    
    if (response.status === 403) {
        try {
            const data = await response.clone().json();
            if (data.error === 'Limit reached' && data.limit) {
                showLimitReachedModal(data);
            }
        } catch (e) {
            // Ignore parsing errors
        }
    }
    
    return response;
};

function showLimitReachedModal(limitData) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 text-center" style="animation: slideUp 0.3s ease-out">
            <div class="w-20 h-20 bg-gradient-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <i class="fas fa-lock text-white text-3xl"></i>
            </div>
            
            <h2 class="text-3xl font-bold text-gray-900 mb-3">
                Limite atteinte !
            </h2>
            
            <p class="text-lg text-gray-600 mb-6">
                ${limitData.limit.message}
            </p>

            <div class="bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl p-6 mb-6 text-left">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                        <i class="fas fa-star text-white"></i>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Votre plan actuel</p>
                        <p class="text-xl font-bold text-gray-900">${limitData.subscription.planName}</p>
                    </div>
                </div>
                ${limitData.limit.current !== undefined ? `
                    <div class="flex justify-between items-center">
                        <span class="text-gray-700">Utilisation</span>
                        <span class="text-lg font-bold">${limitData.limit.current}/${limitData.limit.limit}</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-3 mt-2">
                        <div class="h-3 bg-red-500 rounded-full" style="width: 100%"></div>
                    </div>
                ` : ''}
            </div>

            <div class="flex gap-3">
                <button onclick="this.closest('.fixed').remove()" class="flex-1 px-6 py-3 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition">
                    Plus tard
                </button>
                <button onclick="this.closest('.fixed').remove(); showUpgradeModal();" class="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-purple-700 transition shadow-lg">
                    <i class="fas fa-arrow-up mr-2"></i>
                    Upgrader maintenant
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Fermer en cliquant à l'extérieur
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// Hook sur showMainApp de app.js
const originalShowMainApp = window.showMainApp || function() {};
window.showMainApp = async function() {
    originalShowMainApp();
    await initSubscriptionUI();
};

// Auto-init si déjà connecté
if (typeof authToken !== 'undefined' && authToken) {
    initSubscriptionUI();
}

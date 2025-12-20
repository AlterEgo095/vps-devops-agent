/**
 * AI Agent Chat Enhanced - JavaScript Module
 * Enhanced features for AI Agent Chat UI
 */

// Markdown-like formatting
function formatMessage(text) {
    // Bold: **text**
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic: *text*
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Code inline: `code`
    text = text.replace(/`([^`]+)`/g, '<code class="bg-gray-900 px-2 py-1 rounded text-sm">$1</code>');
    
    // Code blocks: ```language\ncode\n```
    text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, function(match, lang, code) {
        return `<pre class="bg-gray-900 p-3 rounded-lg overflow-x-auto mt-2"><code class="language-${lang || 'text'}">${escapeHtml(code.trim())}</code></pre>`;
    });
    
    // Links: [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank" class="text-blue-400 hover:text-blue-300 underline">$1</a>');
    
    // Lists: - item or * item
    text = text.replace(/^[\-\*]\s+(.+)$/gm, '<li class="ml-4">• $1</li>');
    
    // Headings: ## text
    text = text.replace(/^##\s+(.+)$/gm, '<h3 class="text-lg font-bold mt-2 mb-1">$1</h3>');
    
    return text;
}

// Enhanced escape HTML with markdown support
function escapeHtmlEnhanced(text) {
    // First format markdown
    const formatted = formatMessage(text);
    return formatted;
}

// Syntax highlighting for code blocks (simple version)
function highlightCode() {
    document.querySelectorAll('pre code').forEach((block) => {
        const language = block.className.match(/language-(\w+)/);
        if (language) {
            block.classList.add('hljs');
            // Simple highlighting would go here
            // For production, use highlight.js library
        }
    });
}

// Copy code to clipboard
function addCopyButtons() {
    document.querySelectorAll('pre').forEach((pre) => {
        const button = document.createElement('button');
        button.className = 'absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-xs';
        button.innerHTML = '<i class="fas fa-copy mr-1"></i>Copier';
        button.onclick = () => {
            const code = pre.querySelector('code').textContent;
            navigator.clipboard.writeText(code);
            button.innerHTML = '<i class="fas fa-check mr-1"></i>Copié!';
            setTimeout(() => {
                button.innerHTML = '<i class="fas fa-copy mr-1"></i>Copier';
            }, 2000);
        };
        pre.style.position = 'relative';
        pre.appendChild(button);
    });
}

// Toast notification system
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 translate-x-full`;
    
    const colors = {
        success: 'bg-green-600',
        error: 'bg-red-600',
        warning: 'bg-yellow-600',
        info: 'bg-blue-600'
    };
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toast.className += ` ${colors[type] || colors.info}`;
    toast.innerHTML = `
        <div class="flex items-center space-x-3">
            <i class="fas ${icons[type] || icons.info}"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
        toast.classList.remove('translate-x-full');
    }, 100);
    
    // Animate out and remove
    setTimeout(() => {
        toast.classList.add('translate-x-full');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// Enhanced message rendering with markdown
function renderMessageEnhanced(type, content, actions = []) {
    const formattedContent = escapeHtmlEnhanced(content);
    
    let iconClass = '';
    let messageClass = '';
    let label = '';
    
    switch(type) {
        case 'user':
            iconClass = 'fas fa-user';
            messageClass = 'message-user';
            label = 'Vous';
            break;
        case 'ai':
            iconClass = 'fas fa-robot';
            messageClass = 'message-ai';
            label = 'AI Agent';
            break;
        case 'system':
            iconClass = 'fas fa-info-circle';
            messageClass = 'message-system';
            label = 'Système';
            break;
    }
    
    let actionsHTML = '';
    if (actions && actions.length > 0) {
        actionsHTML = `
            <div class="mt-3 space-y-2">
                <p class="text-xs font-semibold opacity-80 flex items-center">
                    <i class="fas fa-bolt mr-2"></i>Actions proposées:
                </p>
                ${actions.map((action, index) => `
                    <div class="action-badge bg-white bg-opacity-20 rounded-lg px-4 py-3 text-sm hover:bg-opacity-30 cursor-pointer transition" onclick="showActionDetail(${index})">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-2">
                                <i class="fas ${getActionIcon(action.type)}"></i>
                                <span class="font-medium">${action.description || action.type}</span>
                            </div>
                            <span class="text-xs px-2 py-1 rounded ${getRiskBadgeClass(action.risk_level)}">${action.risk_level || 'SAFE'}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    return `
        <div class="max-w-3xl ${messageClass} text-white rounded-lg p-4 shadow-lg">
            <div class="flex items-start space-x-2 mb-2">
                <i class="${iconClass}"></i>
                <span class="text-xs opacity-80 font-semibold">${label}</span>
            </div>
            <div class="text-sm leading-relaxed">${formattedContent}</div>
            ${actionsHTML}
            <div class="text-xs opacity-60 mt-2 flex items-center">
                <i class="far fa-clock mr-1"></i>
                ${new Date().toLocaleTimeString('fr-FR')}
            </div>
        </div>
    `;
}

// Get icon for action type
function getActionIcon(type) {
    const icons = {
        'READ_FILE': 'fa-file-alt',
        'WRITE_FILE': 'fa-file-code',
        'ANALYZE_CODE': 'fa-search',
        'NPM_INSTALL': 'fa-download',
        'PM2_RESTART': 'fa-sync-alt',
        'DELETE_FILE': 'fa-trash',
        'EXECUTE_COMMAND': 'fa-terminal'
    };
    return icons[type] || 'fa-bolt';
}

// Get risk badge color class
function getRiskBadgeClass(level) {
    const classes = {
        'SAFE': 'bg-green-600',
        'MODERATE': 'bg-yellow-600',
        'CRITICAL': 'bg-red-600'
    };
    return classes[level] || 'bg-gray-600';
}

// Show action details modal
function showActionDetail(actionIndex) {
    // This will be implemented with the action confirmation system
    console.log('Action clicked:', actionIndex);
    showToast('Fonctionnalité de confirmation en développement', 'info');
}

// Auto-scroll to bottom
function scrollToBottom(smooth = true) {
    const container = document.getElementById('chat-container');
    if (container) {
        container.scrollTo({
            top: container.scrollHeight,
            behavior: smooth ? 'smooth' : 'auto'
        });
    }
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + K: Focus input
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('message-input')?.focus();
        }
        
        // Ctrl/Cmd + N: New conversation
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            createNewConversation();
        }
        
        // Escape: Clear input or close modal
        if (e.key === 'Escape') {
            const modal = document.getElementById('action-modal');
            if (modal && !modal.classList.contains('hidden')) {
                closeActionModal();
            } else {
                const input = document.getElementById('message-input');
                if (input) {
                    input.value = '';
                    input.style.height = 'auto';
                }
            }
        }
    });
}

// Export functions for global use
window.formatMessage = formatMessage;
window.escapeHtmlEnhanced = escapeHtmlEnhanced;
window.highlightCode = highlightCode;
window.addCopyButtons = addCopyButtons;
window.showToast = showToast;
window.renderMessageEnhanced = renderMessageEnhanced;
window.getActionIcon = getActionIcon;
window.getRiskBadgeClass = getRiskBadgeClass;
window.showActionDetail = showActionDetail;
window.scrollToBottom = scrollToBottom;
window.setupKeyboardShortcuts = setupKeyboardShortcuts;

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setupKeyboardShortcuts();
    });
} else {
    setupKeyboardShortcuts();
}

# 🔧 CORRECTIF - Détection Serveur Assistant AI

**Date:** 25 novembre 2024 - 03:30  
**Problème:** Assistant AI n'affiche pas le serveur connecté  
**Solution:** Dispatcher l'événement serverContextChanged depuis les pages  
**Statut:** ✅ Implémenté pour Terminal SSH, ⏳ À implémenter pour autres pages

---

## 🐛 PROBLÈME

**Symptôme (capture d'écran) :**
- Terminal SSH connecté à root@62.84.189.231 ✅
- Assistant AI affiche "Aucun serveur sélectionné" ❌
- Message : "Veuillez d'abord sélectionner un serveur dans le dashboard" ⚠️

**Diagnostic :**
- L'Assistant AI écoute l'événement `serverContextChanged`
- Aucune page ne dispatcher cet événement après connexion
- Chaque page (Terminal SSH, Agent Autonome, etc.) gère son propre serveur

---

## ✅ SOLUTION IMPLÉMENTÉE

### 1. Terminal SSH (/opt/vps-devops-agent/frontend/terminal-ssh.html)

**Fichier modifié :** `terminal-ssh.html`  
**Ligne:** Après ligne 403 (fonction connectSSH)  
**Backup créé :** `terminal-ssh.html.backup-YYYYMMDD-HHMMSS`

**Code ajouté :**
```javascript
// 🔧 NOUVEAU: Dispatcher l'événement pour l'Assistant AI
window.dispatchEvent(new CustomEvent('serverContextChanged', {
    detail: {
        id: null, // Sera rempli par syncServerToAgent
        host: host,
        port: port,
        username: username,
        name: `${username}@${host}`,
        connected: true
    }
}));
console.log('📡 Event dispatched: serverContextChanged');
```

**Impact :**
- ✅ Quand un utilisateur se connecte via Terminal SSH
- ✅ L'Assistant AI détecte automatiquement le serveur
- ✅ Le badge "Aucun serveur sélectionné" devient "Serveur: root@62.84.189.231"

**Test :**
1. Ouvrir Terminal SSH dans dashboard
2. Se connecter à un serveur
3. Ouvrir l'Assistant AI (bouton flottant)
4. Vérifier que le serveur apparaît dans le badge

---

## ⏳ À IMPLÉMENTER

### 2. Agent Autonome (/opt/vps-devops-agent/frontend/autonomous-agent.html)

**Localisation :** Fonction qui sélectionne/connecte au serveur  
**Action :** Ajouter le même dispatcher d'événement

### 3. Agent DevOps (/opt/vps-devops-agent/frontend/agent-devops.html)

**Localisation :** Fonction qui sélectionne/connecte au serveur  
**Action :** Ajouter le même dispatcher d'événement

### 4. Autres pages avec sélection de serveur

**Pages potentielles :**
- Docker management
- Monitoring
- CI/CD
- Toute page avec un sélecteur de serveur

---

## 🔧 TEMPLATE DE CODE

**Pour implémenter dans d'autres pages :**

```javascript
// Après une connexion/sélection de serveur réussie
function onServerConnected(serverInfo) {
    // ... votre code de connexion ...
    
    // 🔧 Dispatcher l'événement pour l'Assistant AI
    window.dispatchEvent(new CustomEvent('serverContextChanged', {
        detail: {
            id: serverInfo.id || null,
            host: serverInfo.host,
            port: serverInfo.port || 22,
            username: serverInfo.username,
            name: serverInfo.name || `${serverInfo.username}@${serverInfo.host}`,
            connected: true
        }
    }));
    console.log('📡 Event dispatched: serverContextChanged');
}

// Lors de la déconnexion
function onServerDisconnected() {
    window.dispatchEvent(new CustomEvent('serverContextChanged', {
        detail: null  // ou { connected: false }
    }));
    console.log('📡 Event dispatched: serverContextChanged (disconnected)');
}
```

---

## 📊 FLUX DE DONNÉES

```
┌─────────────────────┐
│  Terminal SSH       │
│  (ou autre page)    │
└──────────┬──────────┘
           │
           │ 1. Connexion réussie
           │
           ▼
    dispatchEvent('serverContextChanged')
           │
           │ 2. Event propagation
           │
           ▼
┌─────────────────────┐
│  ai-assistant.js    │
│  attachEventListeners()
└──────────┬──────────┘
           │
           │ 3. updateServerContext()
           │
           ▼
┌─────────────────────┐
│  Badge UI Update    │
│  "Serveur: root@..." │
└─────────────────────┘
```

---

## 🧪 TESTS

### Test 1: Terminal SSH → Assistant AI
```bash
1. Ouvrir dashboard.html
2. Naviguer vers Terminal SSH
3. Se connecter à 62.84.189.231
4. Ouvrir Assistant AI (FAB button)
5. ✅ Vérifier: Badge affiche "Serveur: root@62.84.189.231"
6. ✅ Vérifier: Indicateur vert (connecté)
```

### Test 2: Console DevTools
```javascript
// Dans la console du navigateur
window.addEventListener('serverContextChanged', (e) => {
    console.log('🎯 Server context changed:', e.detail);
});

// Puis se connecter via Terminal SSH
// Devrait afficher: 🎯 Server context changed: {host: "62.84.189.231", ...}
```

---

## 📁 FICHIERS MODIFIÉS

1. ✅ `/opt/vps-devops-agent/frontend/terminal-ssh.html`
   - Backup: `terminal-ssh.html.backup-YYYYMMDD-HHMMSS`
   - Lignes ajoutées: ~15 lignes après ligne 403

2. ⏳ `/opt/vps-devops-agent/frontend/autonomous-agent.html` (à faire)
3. ⏳ `/opt/vps-devops-agent/frontend/agent-devops.html` (à faire)

---

## 🚀 DÉPLOIEMENT

### Déjà déployé ✅
- Terminal SSH avec dispatcher serverContextChanged

### Aucun redémarrage requis
- Fichiers statiques servis directement par Express
- Vider le cache navigateur : `Ctrl+Shift+R`

### Validation
1. Vider cache navigateur
2. Tester Terminal SSH → Assistant AI
3. Vérifier console logs: "📡 Event dispatched: serverContextChanged"

---

**Status:** ✅ Implémentation partielle (Terminal SSH), tests requis

# 🚀 Accès à l'Agent Autonome DevOps

**Date**: 25 novembre 2024  
**Version**: 1.0  
**Statut**: ✅ **OPÉRATIONNEL**

---

## 🌐 URLs d'Accès

### **Dashboard Principal**
```
https://devops.aenews.net/dashboard.html
```

### **Agent Autonome Conversationnel**
```
https://devops.aenews.net/autonomous-chat.html
```
*(Accessible via le menu "Agent Autonome" dans le dashboard)*

### **Backend API**
```
https://devops.aenews.net/api/autonomous/v2/chat
https://devops.aenews.net/api/autonomous/v2/status
https://devops.aenews.net/api/autonomous/v2/history
https://devops.aenews.net/api/autonomous/v2/reset
```

---

## 📂 Emplacement des Fichiers

### **Projet Principal**
```
/opt/vps-devops-agent/
```

### **Fichiers de l'Agent Autonome**

**Backend** :
- `/opt/vps-devops-agent/backend/services/autonomous-agent-engine.js`
- `/opt/vps-devops-agent/backend/routes/autonomous-v2.js`
- `/opt/vps-devops-agent/backend/services/ssh-executor.js`

**Frontend** :
- `/opt/vps-devops-agent/frontend/autonomous-chat.html` ✅ (Nouvelle interface)
- `/opt/vps-devops-agent/frontend/autonomous-agent.html` (Ancienne interface)
- `/opt/vps-devops-agent/frontend/dashboard.html`

**Documentation** :
- `/opt/vps-devops-agent/docs/AGENT-AUTONOME-IMPLEMENTATION-25-NOV.md`
- `/opt/vps-devops-agent/docs/GUIDE-UTILISATION-AGENT-AUTONOME.md`
- `/opt/vps-devops-agent/docs/ACCES-AGENT-AUTONOME.md` (ce fichier)

---

## 🔧 Configuration Système

### **Serveur**
- **Hostname** : core1
- **IP** : 62.84.189.231
- **Domaine** : devops.aenews.net

### **Service PM2**
- **Nom** : vps-devops-agent
- **ID** : 5
- **Port** : 4000
- **Statut** : online
- **Mémoire** : ~127 MB

### **Nginx**
- **Configuration** : `/etc/nginx/sites-enabled/devops.aenews.net.conf`
- **SSL** : Let's Encrypt (devops.aenews.net)
- **Port HTTP** : 80 (redirect vers HTTPS)
- **Port HTTPS** : 443

---

## 🎯 Comment Utiliser l'Agent Autonome

### **Étape 1 : Connexion**
1. Ouvrez : `https://devops.aenews.net/dashboard.html`
2. Connectez-vous avec vos identifiants

### **Étape 2 : Connecter un Serveur**

**Option A : Terminal SSH**
1. Cliquez sur **"Terminal SSH"** dans le menu
2. Connectez-vous à un serveur (ex: `root@62.84.189.231`)
3. L'agent détectera automatiquement la connexion

**Option B : Agent DevOps**
1. Cliquez sur **"Agent DevOps"** dans le menu
2. Sélectionnez un serveur dans la liste
3. L'agent détectera automatiquement la sélection

### **Étape 3 : Ouvrir l'Agent Autonome**
1. Cliquez sur **"Agent Autonome"** dans le menu gauche
2. Vérifiez que le serveur connecté s'affiche en haut à droite
   - Exemple : `root@62.84.189.231`

### **Étape 4 : Poser des Questions**
Tapez votre question en langage naturel :

**Exemples** :
```
"Affiche-moi les processus PM2"
"Quel est l'état du disque ?"
"Montre-moi l'utilisation CPU et RAM"
"Liste les services actifs"
"Vérifie la configuration Nginx"
```

---

## 🎨 Interface de l'Agent

### **Indicateur de Serveur** (en haut à droite)
- 🟢 Point vert clignotant : Serveur connecté
- Nom du serveur affiché : `root@62.84.189.231`

### **Zone de Chat**
- Messages utilisateur : À droite en violet 💜
- Messages agent : À gauche en vert 💚
- Code formaté automatiquement

### **Suggestions Pré-Définies**
- 📊 Processus en cours
- 💾 État du disque
- ⚡ CPU & RAM
- 🔧 Services actifs

---

## 🔒 Authentification & Sécurité

### **Authentification Requise**
- Tous les endpoints nécessitent un **JWT Token**
- Token stocké dans `localStorage` après connexion
- Middleware : `authenticateToken`

### **Permissions**
- Accès serveur validé par utilisateur
- Isolation des sessions utilisateur
- Timeout SSH : 10 secondes

### **Commandes**
- Générées par OpenAI GPT-4
- Validation avant exécution
- Logs détaillés de toutes les actions

---

## 🛠️ Maintenance & Dépannage

### **Redémarrer le Service**
```bash
ssh root@62.84.189.231
pm2 restart vps-devops-agent
```

### **Voir les Logs**
```bash
pm2 logs vps-devops-agent --nostream
```

### **Tester l'API**
```bash
curl http://localhost:4000/api/autonomous/v2/status
# Réponse attendue : {"error":"Access token required"}
```

### **Vérifier Nginx**
```bash
nginx -t
systemctl status nginx
```

---

## 📊 État Actuel du Système

### ✅ **Backend**
- Service : **ONLINE** (PM2 ID: 5)
- Uptime : 9 minutes
- Mémoire : 127.9 MB
- CPU : 0%
- Restarts : 114

### ✅ **API**
- Endpoint principal : HTTP 200 OK
- Authentification : JWT fonctionnelle
- Routes v2 : Opérationnelles

### ✅ **Frontend**
- Dashboard : Accessible
- Agent Autonome : Interface mise à jour ✅
- Terminal SSH : Opérationnel
- Monitoring : Opérationnel

### ✅ **Domaine**
- devops.aenews.net : Configuré
- SSL : Let's Encrypt actif
- Nginx : Fonctionnel

---

## 📝 Notes Importantes

### **Changement Récent (25 nov 2024)**
Le dashboard a été mis à jour pour pointer vers la **nouvelle interface conversationnelle** :
- Ancienne : `autonomous-agent.html` (interface statique)
- Nouvelle : `autonomous-chat.html` (interface conversationnelle) ✅

### **Après Mise à Jour**
Si vous ne voyez pas les changements :
1. **Vider le cache** : Ctrl+Shift+Del
2. **Recharger** : Ctrl+F5
3. Reconnectez-vous au dashboard

---

## 🎯 Fonctionnalités Disponibles

### ✅ **Implémentées**
- 💬 Commandes en langage naturel (français)
- 🖥️ Détection automatique du serveur
- 🚀 Exécution SSH automatique
- 📊 Formatage automatique du code
- 🔄 Historique de conversation
- 💡 Suggestions intelligentes
- 🔒 Sécurité JWT + SSH

### 🔜 **À Venir** (Optionnel)
- Multi-serveurs simultanés
- Historique persistant (SQLite)
- Mode "observation" automatique
- Alertes proactives
- Commandes personnalisées

---

## 📞 Support

### **Logs**
- **Backend** : `/root/.pm2/logs/vps-devops-agent-*.log`
- **Nginx Access** : `/var/log/nginx/access.log`
- **Nginx Error** : `/var/log/nginx/error.log`

### **Documentation**
- **Guide utilisateur** : `GUIDE-UTILISATION-AGENT-AUTONOME.md`
- **Documentation technique** : `AGENT-AUTONOME-IMPLEMENTATION-25-NOV.md`
- **Architecture** : `ARCHITECTURE_SUMMARY.txt`

---

## ✅ Checklist de Vérification

Avant d'utiliser l'agent, vérifiez :

- [ ] Dashboard accessible : `https://devops.aenews.net/dashboard.html`
- [ ] Authentification fonctionnelle (login/password)
- [ ] Service PM2 : `online` (vérifier avec `pm2 list`)
- [ ] Serveur connecté via Terminal SSH ou Agent DevOps
- [ ] Indicateur serveur affiché en haut à droite
- [ ] Interface de chat visible
- [ ] Suggestions pré-définies visibles
- [ ] Cache navigateur vidé (Ctrl+Shift+Del)

---

**🎉 L'Agent Autonome DevOps est prêt à l'emploi ! 🎉**

---

**URLs de référence** :
- Dashboard : https://devops.aenews.net/dashboard.html
- Agent Autonome : https://devops.aenews.net/autonomous-chat.html
- API Status : https://devops.aenews.net/api/autonomous/v2/status

---

**Développé avec** ❤️ **le 25 novembre 2024**

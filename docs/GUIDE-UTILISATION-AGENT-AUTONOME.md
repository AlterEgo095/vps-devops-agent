# 🚀 Guide d'Utilisation - Agent Autonome DevOps

**Version**: 1.0  
**Date**: 25 novembre 2024

---

## 📋 Qu'est-ce que l'Agent Autonome ?

L'Agent Autonome DevOps est un **assistant intelligent conversationnel** qui comprend vos questions en **langage naturel** (français) et exécute automatiquement des commandes sur vos serveurs connectés.

**Similaire à** : Genspark Developer, ChatGPT pour DevOps

---

## 🎯 Cas d'Usage

### Exemples de questions que vous pouvez poser :

1. **Monitoring & État du Serveur**
   ```
   "Affiche-moi les processus en cours"
   "Quel est l'état du disque ?"
   "Montre-moi l'utilisation CPU et RAM"
   "Quel est l'uptime du serveur ?"
   ```

2. **Gestion PM2**
   ```
   "Liste les services PM2"
   "Redémarre vps-devops-agent"
   "Affiche les logs de vps-devops-agent"
   "Combien de mémoire utilise vps-devops-agent ?"
   ```

3. **Gestion Nginx**
   ```
   "Vérifie la configuration Nginx"
   "Recharge Nginx"
   "Affiche les logs d'erreur Nginx"
   "Quel port écoute Nginx ?"
   ```

4. **Gestion de Fichiers**
   ```
   "Liste les fichiers dans /opt"
   "Affiche le contenu de /etc/nginx/nginx.conf"
   "Cherche les fichiers .log dans /var/log"
   ```

5. **Services & Processus**
   ```
   "Liste les services actifs"
   "Vérifie si Docker tourne"
   "Affiche les connexions réseau actives"
   ```

---

## 🔧 Comment Utiliser l'Agent Autonome

### Étape 1️⃣ : Connexion à un Serveur

**Option A : Terminal SSH**
1. Allez dans **Terminal SSH**
2. Connectez-vous à votre serveur (ex: `root@62.84.189.231`)
3. L'agent détectera automatiquement la connexion

**Option B : Agent DevOps**
1. Allez dans **Agent DevOps**
2. Sélectionnez un serveur dans la liste
3. L'agent détectera automatiquement la sélection

### Étape 2️⃣ : Ouvrir l'Agent Autonome

1. Cliquez sur **"Agent Autonome"** dans le menu
2. Vous verrez l'interface conversationnelle
3. Vérifiez que l'indicateur serveur affiche : **"root@62.84.189.231"** (ou votre serveur)

### Étape 3️⃣ : Poser des Questions

1. **Tapez votre question** en langage naturel dans le champ de saisie
2. Appuyez sur **Entrée** ou cliquez sur le bouton **📤 Envoyer**
3. L'agent va :
   - 🧠 Analyser votre intention
   - 🔧 Générer les commandes appropriées
   - 🚀 Exécuter via SSH
   - 📊 Afficher les résultats formatés

### Étape 4️⃣ : Interpréter les Résultats

- Les **réponses de l'agent** apparaissent en **vert** avec un avatar robot 🤖
- Les **blocs de code** sont formatés automatiquement
- Les **erreurs** sont signalées clairement

---

## 💡 Suggestions Pré-Définies

Au démarrage, vous verrez 4 suggestions rapides :

- 📊 **Processus en cours** → Affiche les processus
- 💾 **État du disque** → Analyse l'espace disque
- ⚡ **CPU & RAM** → Monitoring CPU et RAM
- 🔧 **Services actifs** → Liste les services

**Cliquez simplement** sur une suggestion pour l'envoyer !

---

## 🛡️ Sécurité & Limites

### ✅ Ce que l'agent PEUT faire :
- Lire des fichiers
- Afficher des informations système
- Lister des processus
- Vérifier des configurations
- Afficher des logs

### ⚠️ Ce que l'agent fait AVEC CONFIRMATION :
- Redémarrer des services
- Modifier des configurations
- Arrêter des processus

### 🚫 Ce que l'agent NE PEUT PAS faire :
- Supprimer des fichiers critiques
- Modifier les permissions root
- Installer des packages non approuvés

---

## 🔄 Réinitialiser la Conversation

Si vous voulez **repartir de zéro** :

1. Cliquez sur le bouton **🔄 Réinitialiser**
2. Confirmez
3. L'historique sera effacé

---

## 🎨 Interface Utilisateur

### Indicateur de Serveur
- **Vert clignotant** 🟢 : Serveur connecté
- **Nom du serveur** : Affiché en haut à droite
- Exemple : `root@62.84.189.231`

### Zone de Chat
- **Messages utilisateur** : À droite, en violet 💜
- **Messages agent** : À gauche, en vert 💚
- **Code formaté** : Automatiquement dans des blocs ```

### Indicateur de Chargement
- Affiche **"L'agent réfléchit..."** pendant le traitement
- Animation de points (...)

---

## 🐛 Dépannage

### ❌ "Aucun serveur connecté"
**Solution** : Connectez-vous d'abord via Terminal SSH ou sélectionnez un serveur dans Agent DevOps

### ❌ "Access token required"
**Solution** : Reconnectez-vous à l'application

### ❌ "Erreur lors de l'exécution"
**Solution** : Vérifiez que la commande est valide et que le serveur est accessible

---

## 📞 Aide & Support

- **Logs Backend** : `/root/.pm2/logs/vps-devops-agent-*.log`
- **Documentation Technique** : `/opt/vps-devops-agent/docs/AGENT-AUTONOME-IMPLEMENTATION-25-NOV.md`
- **Version** : 1.0.0

---

## 🎓 Conseils & Astuces

1. **Soyez précis** : Plus votre question est claire, meilleure sera la réponse
2. **Utilisez des phrases simples** : "Affiche les processus" plutôt que des longues phrases
3. **Expérimentez** : L'agent comprend de nombreuses variations de questions
4. **Vérifiez l'indicateur** : Assurez-vous toujours que le serveur est connecté

---

## 🌟 Exemples de Conversations

### Exemple 1 : Monitoring
```
👤 Vous : Affiche-moi l'état du serveur

🤖 Agent : Voici l'état actuel du serveur :

📊 CPU : 3%
💾 RAM : 8.05% utilisée (1.4G / 17G)
💿 Disque : 4% utilisé (15G / 387G)
⏱️ Uptime : 3 jours, 5 heures
🔗 Connexions : 6 actives
```

### Exemple 2 : Gestion PM2
```
👤 Vous : Liste les services PM2

🤖 Agent : Services PM2 actuellement actifs :

1. vps-devops-agent - online - 112 MB - 0% CPU
2. aestreaming-backend - online - 94 MB - 0% CPU
3. aestreaming-frontend - online - 90 MB - 0% CPU
4. telegram-bot - online - 65 MB - 0% CPU

Tous les services sont en ligne ✅
```

### Exemple 3 : Nginx
```
👤 Vous : Vérifie si Nginx fonctionne

🤖 Agent : État de Nginx :

✅ Service actif et en cours d'exécution
📡 Écoute sur le port 80 et 443
⏱️ Uptime : 2 jours
🔧 Configuration : OK (nginx -t passed)
```

---

**🎉 Bonne utilisation de votre Agent Autonome DevOps ! 🎉**

---

**Développé avec** ❤️ **le 25 novembre 2024**

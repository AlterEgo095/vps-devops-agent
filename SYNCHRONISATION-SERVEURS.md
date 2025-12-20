# 🔄 SYNCHRONISATION AUTOMATIQUE DES SERVEURS

## 📋 FONCTIONNALITÉ

Lorsque vous vous connectez à un serveur via **Terminal SSH**, le serveur est **automatiquement synchronisé** avec l'**Agent DevOps**. Cela signifie que vous pouvez :

1. ✅ Vous connecter dans **Terminal SSH**
2. ✅ Quitter l'onglet et aller dans **Agent DevOps**
3. ✅ **Le serveur apparaît automatiquement** dans la liste
4. ✅ Vous pouvez l'utiliser pour exécuter des commandes via Agent

---

## 🚀 COMMENT ÇA MARCHE

### Étape 1 : Connexion dans Terminal SSH

Quand vous vous connectez à un serveur :

```
Host: 62.84.189.231
Port: 22
Utilisateur: root
Mot de passe: ********
```

### Étape 2 : Synchronisation Automatique

Dès que la connexion SSH réussit, le système :
- ✅ Enregistre automatiquement le serveur dans la base de données
- ✅ Chiffre les credentials de manière sécurisée
- ✅ Affiche une notification de confirmation

### Étape 3 : Utilisation dans Agent DevOps

Le serveur est maintenant disponible dans :
- ✅ **Agent DevOps** → Liste des serveurs
- ✅ **Agent DevOps** → Exécution de commandes
- ✅ **Agent DevOps** → Gestion et monitoring

---

## 🔐 SÉCURITÉ

### Chiffrement des Mots de Passe

Les mots de passe sont **chiffrés avec AES-256-CBC** :
- ✅ Algorithme : `aes-256-cbc`
- ✅ Clé dérivée avec `scrypt`
- ✅ IV (Initialization Vector) unique par serveur
- ✅ Stockage sécurisé dans SQLite

### Protection des Données

- ✅ Les credentials ne sont **jamais envoyés en clair**
- ✅ Authentification JWT requise pour l'API
- ✅ Accès restreint par utilisateur

---

## 📊 API ENDPOINT

### POST `/api/agent/servers/sync`

**Headers**:
```
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

**Body**:
```json
{
  "host": "62.84.189.231",
  "port": 22,
  "username": "root",
  "password": "Matand@095",
  "name": "Serveur Production",
  "description": "Synchronisé depuis Terminal SSH"
}
```

**Réponse (Création)**:
```json
{
  "success": true,
  "message": "Nouveau serveur ajouté",
  "serverId": 3,
  "action": "created"
}
```

**Réponse (Mise à jour)**:
```json
{
  "success": true,
  "message": "Serveur mis à jour",
  "serverId": 2,
  "action": "updated"
}
```

---

## 🎨 NOTIFICATION VISUELLE

Après synchronisation, une notification apparaît en haut à droite :

```
┌──────────────────────────────────────┐
│  🔄 Serveur synchronisé avec Agent   │
│     DevOps                           │
└──────────────────────────────────────┘
```

- ✅ Animation slide-in depuis la droite
- ✅ Affichage pendant 3 secondes
- ✅ Animation slide-out automatique

---

## 🔍 VÉRIFICATION

### Vérifier les serveurs synchronisés

**Méthode 1 : Via SQLite**
```bash
sqlite3 /opt/vps-devops-agent/data/devops-agent.db \
  "SELECT id, name, host, username, status FROM servers;"
```

**Méthode 2 : Via API**
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:4000/api/agent/servers
```

**Méthode 3 : Via Interface**
- Ouvrir **Agent DevOps**
- Cliquer sur "Serveurs"
- Le nouveau serveur apparaît dans la liste

---

## 🛠️ FICHIERS MODIFIÉS

### Backend
- ✅ `/opt/vps-devops-agent/backend/routes/agent.js`
  - Ajout de la route `POST /servers/sync`
  - Gestion création/mise à jour de serveurs
  - Chiffrement AES-256 des credentials

### Frontend
- ✅ `/opt/vps-devops-agent/frontend/terminal-ssh.html`
  - Fonction `syncServerToAgent()` ajoutée
  - Appel automatique après connexion SSH réussie
  - Notification visuelle avec animations CSS

---

## 💡 AVANTAGES

### 1. **Pas de Duplication**
- Si un serveur existe déjà (même host/port/username), il est **mis à jour** au lieu d'être dupliqué

### 2. **Automatique**
- Aucune action manuelle requise
- La synchronisation se fait en arrière-plan

### 3. **Transparent**
- Notification discrète
- Pas de popup invasive
- Log dans la console pour debug

### 4. **Sécurisé**
- Credentials chiffrés
- Authentification JWT
- Pas de stockage en clair

---

## 🐛 DÉPANNAGE

### Le serveur n'apparaît pas dans Agent DevOps

**Vérifications** :
1. Ouvrir la Console Développeur (F12)
2. Onglet "Network" → Chercher `/api/agent/servers/sync`
3. Vérifier la réponse :
   - ✅ `success: true` → Synchronisation réussie
   - ❌ `success: false` → Voir l'erreur

### Erreur "Invalid or expired token"

**Solution** :
- Déconnectez-vous et reconnectez-vous
- Le token JWT sera régénéré

### Le mot de passe est incorrect dans Agent DevOps

**Cause** : Le mot de passe a changé depuis la synchronisation

**Solution** :
1. Retournez dans **Terminal SSH**
2. Reconnectez-vous avec le nouveau mot de passe
3. Le serveur sera **automatiquement mis à jour**

---

## 📝 LOGS

### Logs Backend (PM2)
```bash
pm2 logs vps-devops-agent --nostream --lines 20 | grep sync
```

### Logs Frontend (Console Navigateur)
```javascript
// Rechercher dans la console :
✓ Serveur synchronisé: created (ID: 3)
✓ Serveur synchronisé: updated (ID: 2)
```

---

## 🔮 ÉVOLUTIONS FUTURES

### Court Terme
- ⏳ Synchronisation bidirectionnelle (Agent → Terminal)
- ⏳ Historique des connexions
- ⏳ Détection automatique de serveurs offline

### Moyen Terme
- ⏳ Import/Export de serveurs en batch
- ⏳ Groupes de serveurs
- ⏳ Tags et catégories

### Long Terme
- ⏳ Découverte automatique de serveurs réseau
- ⏳ Synchronisation cloud (multi-utilisateurs)
- ⏳ Intégration avec Ansible/Terraform

---

## ✅ CHECKLIST DE TEST

- [x] Connexion SSH réussie
- [x] Notification de synchronisation affichée
- [x] Serveur apparaît dans base de données
- [x] Serveur visible dans Agent DevOps
- [x] Credentials chiffrés correctement
- [x] Mise à jour serveur existant fonctionne
- [x] Pas de duplication de serveurs

---

## 📞 SUPPORT

En cas de problème :
1. Consulter les logs PM2
2. Vérifier la base de données SQLite
3. Ouvrir la console développeur navigateur

---

**Date de création** : 23 Novembre 2025  
**Version** : 1.0.0  
**Statut** : ✅ Actif

# 🐛 GUIDE DE DÉBOGAGE - ADMIN PANEL

**Date:** 24 novembre 2024 - 15:02  
**Objectif:** Résoudre le problème de chargement des données dans admin-panel.html

---

## 🔧 MODIFICATIONS APPLIQUÉES

### ✅ PM2 Redémarré
- **Commande:** `pm2 restart vps-devops-agent`
- **Status:** ✅ Service redémarré avec succès
- **Nouveau PID:** 770486
- **Uptime:** Démarré à 14:58:51

### ✅ Logs de Débogage Ajoutés

Le fichier `admin-panel.html` a été enrichi avec **~35 logs de débogage détaillés** dans toutes les fonctions critiques.

---

## 🧪 INSTRUCTIONS DE TEST

### ÉTAPE 1: Hard Refresh du Navigateur

**IMPORTANT:** Le cache navigateur peut servir l'ancien fichier JavaScript.

**Action requise:**
1. Ouvrir le navigateur sur https://devops.aenews.net
2. Se connecter avec: `admin` / `Admin123!`
3. Aller sur le panneau d'administration
4. **Faire un Hard Refresh:**
   - **Windows/Linux:** `Ctrl + Shift + R` ou `Ctrl + F5`
   - **Mac:** `Cmd + Shift + R`

### ÉTAPE 2: Ouvrir la Console Développeur

1. Appuyer sur `F12` ou clic droit → "Inspecter"
2. Aller dans l'onglet **Console**
3. Aller dans l'onglet **Network** (en parallèle)

### ÉTAPE 3: Observer les Logs

**Logs Attendus:**
- 📩 Message received from parent
- ✅ Token received and saved
- 🚀 Initializing admin panel
- 🔍 [getAuthToken] Called
- 🔍 [getAuthToken] Retrieved from localStorage: FOUND
- ✅ Token available, loading admin data
- 🔍 [init] Calling loadDashboard()...
- 🔍 [loadDashboard] Function called
- 🔍 [apiCall] Called with endpoint: /admin/dashboard
- 🔍 [apiCall] authToken value: PRESENT
- 🔍 [apiCall] Response status: 200
- ✅ [apiCall] Response data received

---

## 📊 INFORMATIONS DE RÉFÉRENCE

### URLs
- **Frontend:** https://devops.aenews.net
- **Admin Panel:** https://devops.aenews.net/admin-panel.html

### Credentials
- **Username:** admin
- **Password:** Admin123!

### Fichier Modifié
- `/opt/vps-devops-agent/frontend/admin-panel.html`
- Taille: 61KB (était 59KB)
- Timestamp: 2025-11-24 15:01
- Logs ajoutés: ~19 emplacements

---

## 🚀 SI PROBLÈME PERSISTE

### 1. Test en Mode Navigation Privée
- Ouvrir fenêtre privée/incognito
- Aller sur https://devops.aenews.net
- Se connecter et tester

### 2. Vérifier Token Manuellement
```javascript
// Dans Console développeur
localStorage.getItem('authToken')
```

### 3. Vider Cache Complètement
- Chrome: chrome://settings/clearBrowserData
- Sélectionner: Cookies + Cache

---

**Guide créé le:** 24 novembre 2024  
**Version:** 1.0  
**PM2 redémarré:** 14:58:51

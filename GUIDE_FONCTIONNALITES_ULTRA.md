# 🚀 Guide des Fonctionnalités Ultra - AI Agent DevOps

**Date**: 23 novembre 2025  
**Version**: 2.0 Ultra

---

## ✨ Nouvelles Fonctionnalités

### 1. 💾 Export des Conversations

**Accès**: Bouton vert "Export" en haut à droite du chat

#### Formats disponibles:

**📄 JSON**
- Structure complète avec métadonnées
- Parfait pour sauvegarde ou traitement automatique
- Contient: conversation, messages, timestamps

**📝 Markdown**
- Format lisible et bien formaté
- Idéal pour documentation
- Génère des sections par rôle (User/Assistant)
- Séparateurs visuels entre messages

**📋 Texte Brut**
- Format universel simple
- Compatible partout
- Facile à copier/coller

#### Utilisation:
1. Cliquez sur le bouton **"Export"** (vert)
2. Choisissez votre format
3. Le fichier se télécharge automatiquement
4. Nom du fichier: `conversation_[ID]_[DATE].[extension]`

---

### 2. 📊 Statistiques d'Utilisation

**Accès**: Bouton violet "Stats" en haut à droite du chat

#### Métriques Globales:
- **Total conversations**: Nombre de conversations créées
- **Total messages**: Somme de tous les messages
- **Moyenne par conversation**: Messages moyen par conv

#### Métriques Conversation Actuelle:
- **Messages**: Nombre total de messages
- **Vos messages**: Compteur de vos questions
- **Réponses IA**: Compteur des réponses de l'agent

#### Utilisation:
1. Cliquez sur **"Stats"** (violet)
2. Consultez les métriques en temps réel
3. Fermez avec le ✕ ou en cliquant dehors

---

### 3. 🔄 Régénération de Réponse

**Accès**: Bouton jaune "Régénérer" en haut à droite du chat

#### Fonctionnement:
- Relance automatiquement votre **dernier message**
- L'IA génère une **nouvelle réponse différente**
- Utile si la première réponse ne vous convient pas

#### Cas d'usage:
- Réponse incomplète ou imprécise
- Besoin d'une approche différente
- Vouloir plusieurs variations de réponse

#### Utilisation:
1. Lisez la réponse de l'IA
2. Si insatisfaisant, cliquez **"Régénérer"**
3. Votre dernier message est automatiquement renvoyé
4. Une nouvelle réponse est générée

---

## 🎯 Conseils d'Utilisation

### Export Régulier
💡 **Conseil**: Exportez vos conversations importantes en Markdown pour constituer une base de connaissances.

### Suivi des Stats
📈 **Conseil**: Consultez les stats régulièrement pour suivre votre utilisation et identifier les conversations les plus actives.

### Régénération Stratégique
🎲 **Conseil**: N'hésitez pas à régénérer si vous cherchez une approche différente - chaque génération peut apporter un angle nouveau.

---

## 🔧 Raccourcis Clavier

| Touche | Action |
|--------|--------|
| `Ctrl + N` | Nouvelle conversation |
| `Enter` | Envoyer message |
| `Shift + Enter` | Nouvelle ligne dans le message |

---

## 📦 Formats d'Export - Exemples

### JSON
```json
{
  "conversation": {
    "id": 6,
    "title": "New conversation 1763861516393",
    "started_at": "2025-11-23 01:31:56"
  },
  "messages": [
    {
      "id": 32,
      "role": "user",
      "content": "Comment optimiser mon VPS?"
    },
    {
      "id": 33,
      "role": "assistant",
      "content": "Voici plusieurs optimisations..."
    }
  ]
}
```

### Markdown
```markdown
# Conversation DevOps

Date: 23/11/2025

## 👤 Utilisateur

Comment optimiser mon VPS?

---

## 🤖 Assistant

Voici plusieurs optimisations pour votre VPS...

---
```

### Texte
```
Conversation DevOps
==================================================

[USER]
Comment optimiser mon VPS?

[AGENT]
Voici plusieurs optimisations pour votre VPS...
```

---

## 🎨 Interface Améliorée

### Boutons d'Action
- **Vert** 🟢 : Export (sauvegarde)
- **Violet** 🟣 : Stats (métriques)
- **Jaune** 🟡 : Régénérer (nouvelle réponse)
- **Gris** ⚫ : Effacer (nettoyer)

### Modals Modernes
- Design sombre professionnel
- Animations fluides
- Fermeture intuitive (✕ ou clic dehors)

---

## ⚡ Performance

- **Export instantané**: < 100ms
- **Stats en temps réel**: < 50ms
- **Régénération**: dépend de l'API IA (~2-5s)

---

## 🆘 Support

En cas de problème:
1. Rafraîchir la page (F5)
2. Vérifier la console navigateur (F12)
3. Redémarrer PM2: `pm2 restart vps-devops-agent`

---

**Profitez de ces nouvelles fonctionnalités pour une expérience optimale !** 🚀

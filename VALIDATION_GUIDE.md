# 🛡️ GUIDE D'UTILISATION - VALIDATION D'ENTRÉES

## 📅 Date : 24 novembre 2025

## 🎯 Objectif
Guide pratique pour ajouter la validation Joi sur n'importe quelle route Express.

## 📚 Schémas disponibles

### Authentication (loginSchema, registerSchema, changePasswordSchema)
```javascript
import { validateBody } from '../middleware/validate.js';
import { loginSchema, registerSchema, changePasswordSchema } from '../middleware/validation-schemas.js';

// Login
router.post('/login', validateBody(loginSchema), async (req, res) => {
  // username et password déjà validés
});

// Register (si route existe)
router.post('/register', validateBody(registerSchema), async (req, res) => {
  // username, password (complexe), email déjà validés
});

// Change password (si route existe)
router.post('/change-password', validateBody(changePasswordSchema), async (req, res) => {
  // oldPassword, newPassword (complexe, différent) déjà validés
});
```

### Serveurs (createServerSchema, updateServerSchema)
```javascript
import { validateBody, validateParams } from '../middleware/validate.js';
import { createServerSchema, updateServerSchema, idParamSchema } from '../middleware/validation-schemas.js';

// Créer serveur
router.post('/servers', validateBody(createServerSchema), async (req, res) => {
  // name, host, port, username déjà validés
});

// Mettre à jour serveur
router.put('/servers/:id', validateParams(idParamSchema), validateBody(updateServerSchema), async (req, res) => {
  // id (param) et tous les champs body déjà validés
});

// Supprimer serveur
router.delete('/servers/:id', validateParams(idParamSchema), async (req, res) => {
  // id (param) déjà validé
});
```

### Projets (createProjectSchema)
```javascript
import { validateBody } from '../middleware/validate.js';
import { createProjectSchema } from '../middleware/validation-schemas.js';

// Créer projet
router.post('/projects', validateBody(createProjectSchema), async (req, res) => {
  // name, description, repository, serverId déjà validés
});
```

### Terminal (executeCommandSchema)
```javascript
import { validateBody } from '../middleware/validate.js';
import { executeCommandSchema } from '../middleware/validation-schemas.js';

// Exécuter commande
router.post('/execute', validateBody(executeCommandSchema), async (req, res) => {
  // command, serverId, timeout déjà validés
});
```

### Utilitaires (idParamSchema, paginationQuerySchema)
```javascript
import { validateParams, validateQuery } from '../middleware/validate.js';
import { idParamSchema, paginationQuerySchema } from '../middleware/validation-schemas.js';

// Route avec ID
router.get('/items/:id', validateParams(idParamSchema), async (req, res) => {
  // id déjà validé (entier positif)
});

// Route avec pagination
router.get('/items', validateQuery(paginationQuerySchema), async (req, res) => {
  // page, limit, sort déjà validés
});
```

## ✨ Comment ajouter la validation sur une nouvelle route

### Étape 1 : Identifier le type de données

**Body (POST/PUT)** : Données dans le corps de la requête
```javascript
// Exemple : POST /api/servers avec { name: "...", host: "..." }
```

**Params (/:id)** : Paramètres dans l'URL
```javascript
// Exemple : GET /api/servers/123 où 123 est :id
```

**Query (?page=1)** : Paramètres de requête
```javascript
// Exemple : GET /api/servers?page=1&limit=10
```

### Étape 2 : Choisir le schéma approprié

**Schéma existe déjà** : Utiliser directement
```javascript
import { validateBody } from '../middleware/validate.js';
import { createServerSchema } from '../middleware/validation-schemas.js';

router.post('/servers', validateBody(createServerSchema), async (req, res) => {
  // ...
});
```

**Schéma n'existe pas** : Le créer dans `validation-schemas.js`
```javascript
// Dans validation-schemas.js
export const myNewSchema = Joi.object({
  field1: Joi.string().min(3).max(50).required(),
  field2: Joi.number().integer().min(0).optional()
});

// Dans votre route
import { validateBody } from '../middleware/validate.js';
import { myNewSchema } from '../middleware/validation-schemas.js';

router.post('/my-route', validateBody(myNewSchema), async (req, res) => {
  // ...
});
```

### Étape 3 : Ajouter le middleware dans la route

**Avant** :
```javascript
router.post('/servers', async (req, res) => {
  const { name, host, port } = req.body;
  
  // Validation manuelle
  if (!name || !host) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  
  // ...
});
```

**Après** :
```javascript
router.post('/servers', validateBody(createServerSchema), async (req, res) => {
  const { name, host, port } = req.body;
  
  // Pas besoin de validation manuelle !
  // Joi a déjà tout validé
  
  // ...
});
```

### Étape 4 : Supprimer la validation manuelle (optionnel)

Les vérifications manuelles comme `if (!field)` peuvent être supprimées car Joi s'en occupe.

## 🔧 Créer un nouveau schéma

### Template de base

```javascript
export const mySchema = Joi.object({
  // String avec contraintes
  name: Joi.string()
    .min(3)
    .max(100)
    .required()
    .messages({
      'string.min': 'Le nom doit contenir au moins 3 caractères',
      'string.max': 'Le nom ne peut pas dépasser 100 caractères',
      'any.required': 'Le nom est requis'
    }),
  
  // Email
  email: Joi.string()
    .email()
    .optional()
    .messages({
      'string.email': 'L\'email doit être valide'
    }),
  
  // Number avec plage
  age: Joi.number()
    .integer()
    .min(18)
    .max(120)
    .optional()
    .messages({
      'number.min': 'L\'âge minimum est 18',
      'number.max': 'L\'âge maximum est 120'
    }),
  
  // Boolean
  active: Joi.boolean()
    .default(true)
    .optional(),
  
  // Enum (valeurs limitées)
  status: Joi.string()
    .valid('active', 'inactive', 'pending')
    .default('pending')
    .optional(),
  
  // URL
  website: Joi.string()
    .uri()
    .optional()
    .messages({
      'string.uri': 'L\'URL doit être valide'
    }),
  
  // Pattern (regex)
  phone: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Le numéro de téléphone est invalide'
    })
});
```

### Validation conditionnelle

```javascript
export const mySchema = Joi.object({
  type: Joi.string().valid('email', 'sms').required(),
  
  // Email requis si type = 'email'
  email: Joi.when('type', {
    is: 'email',
    then: Joi.string().email().required(),
    otherwise: Joi.optional()
  }),
  
  // Phone requis si type = 'sms'
  phone: Joi.when('type', {
    is: 'sms',
    then: Joi.string().required(),
    otherwise: Joi.optional()
  })
});
```

### Validation de référence

```javascript
export const changePasswordSchema = Joi.object({
  oldPassword: Joi.string().required(),
  newPassword: Joi.string()
    .min(8)
    .required()
    .invalid(Joi.ref('oldPassword'))  // Doit être différent de oldPassword
    .messages({
      'any.invalid': 'Le nouveau mot de passe doit être différent de l\'ancien'
    }),
  confirmPassword: Joi.string()
    .valid(Joi.ref('newPassword'))  // Doit être identique à newPassword
    .required()
    .messages({
      'any.only': 'Les mots de passe ne correspondent pas'
    })
});
```

## 🧪 Tester la validation

### Test avec curl

```bash
# Test avec données invalides
curl -X POST http://localhost:4000/api/servers \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"host":"192.168.1.1"}'

# Résultat attendu : 400 Bad Request
# {
#   "error": "Validation échouée",
#   "message": "Les données fournies sont invalides",
#   "details": [
#     {"field": "name", "message": "Le nom du serveur est requis", "type": "any.required"}
#   ]
# }
```

### Test avec données valides

```bash
curl -X POST http://localhost:4000/api/servers \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Server 1","host":"192.168.1.1","port":22,"username":"root"}'

# Résultat attendu : 200 OK
# {
#   "success": true,
#   "message": "Server created successfully",
#   "serverId": 1234567890
# }
```

## 📋 Checklist pour ajouter validation

- [ ] **Identifier** le type de données (body, params, query)
- [ ] **Choisir** ou créer le schéma approprié
- [ ] **Importer** les modules nécessaires
- [ ] **Ajouter** le middleware dans la route
- [ ] **Créer** backup du fichier avant modification
- [ ] **Tester** avec données invalides
- [ ] **Tester** avec données valides
- [ ] **Supprimer** la validation manuelle (optionnel)
- [ ] **Redémarrer** le serveur
- [ ] **Vérifier** les logs

## 🚀 Exemple complet

### Avant

```javascript
// routes/myroute.js
import express from 'express';
const router = express.Router();

router.post('/create', async (req, res) => {
  const { name, email, age } = req.body;
  
  // Validation manuelle
  if (!name || name.length < 3) {
    return res.status(400).json({ error: 'Name too short' });
  }
  
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  
  if (age && (age < 18 || age > 120)) {
    return res.status(400).json({ error: 'Invalid age' });
  }
  
  // Logique métier
  // ...
});
```

### Après

```javascript
// validation-schemas.js
export const createUserSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  email: Joi.string().email().required(),
  age: Joi.number().integer().min(18).max(120).optional()
});

// routes/myroute.js
import express from 'express';
import { validateBody } from '../middleware/validate.js';
import { createUserSchema } from '../middleware/validation-schemas.js';

const router = express.Router();

router.post('/create', validateBody(createUserSchema), async (req, res) => {
  const { name, email, age } = req.body;
  
  // Pas de validation manuelle nécessaire !
  // Joi a tout validé automatiquement
  
  // Logique métier directement
  // ...
});
```

## ✅ Avantages

1. **Code plus propre** : Pas de validation inline répétitive
2. **Messages standardisés** : Tous en français, même format
3. **Réutilisable** : Un schéma peut être utilisé sur plusieurs routes
4. **Toutes les erreurs** : Retourne toutes les erreurs simultanément
5. **Type safety** : Conversion automatique des types
6. **Maintenable** : Facile à modifier et étendre

## 📚 Ressources

- Documentation Joi : https://joi.dev/api/
- Schémas existants : `/opt/vps-devops-agent/backend/middleware/validation-schemas.js`
- Middleware : `/opt/vps-devops-agent/backend/middleware/validate.js`
- Exemples : `/opt/vps-devops-agent/backend/routes/servers.js`

---

**Dernière mise à jour** : 24 novembre 2025

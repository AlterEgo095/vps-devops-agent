/**
 * 🛡️ VALIDATION SCHEMAS
 * Schémas Joi pour valider toutes les entrées utilisateur
 * Protection contre SQL injection, XSS, et données malformées
 */

import Joi from 'joi';

// ===== AUTHENTIFICATION =====

export const loginSchema = Joi.object({
  username: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .min(3)
    .max(30)
    .required()
    .messages({
      'string.pattern.base': 'Le nom d\'utilisateur ne doit contenir que des caractères alphanumériques',
      'string.min': 'Le nom d\'utilisateur doit contenir au moins 3 caractères',
      'string.max': 'Le nom d\'utilisateur ne peut pas dépasser 30 caractères',
      'any.required': 'Le nom d\'utilisateur est requis'
    }),
  password: Joi.string()
    .min(6)
    .max(100)
    .required()
    .messages({
      'string.min': 'Le mot de passe doit contenir au moins 6 caractères',
      'string.max': 'Le mot de passe ne peut pas dépasser 100 caractères',
      'any.required': 'Le mot de passe est requis'
    })
});

export const registerSchema = Joi.object({
  username: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .min(3)
    .max(30)
    .required()
    .messages({
      'string.pattern.base': 'Le nom d\'utilisateur ne doit contenir que des caractères alphanumériques',
      'string.min': 'Le nom d\'utilisateur doit contenir au moins 3 caractères',
      'string.max': 'Le nom d\'utilisateur ne peut pas dépasser 30 caractères',
      'any.required': 'Le nom d\'utilisateur est requis'
    }),
  password: Joi.string()
    .min(8)
    .max(100)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.min': 'Le mot de passe doit contenir au moins 8 caractères',
      'string.max': 'Le mot de passe ne peut pas dépasser 100 caractères',
      'string.pattern.base': 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre',
      'any.required': 'Le mot de passe est requis'
    }),
  email: Joi.string()
    .email()
    .max(255)
    .optional()
    .messages({
      'string.email': 'L\'email doit être valide',
      'string.max': 'L\'email ne peut pas dépasser 255 caractères'
    })
});

export const changePasswordSchema = Joi.object({
  oldPassword: Joi.string()
    .min(6)
    .max(100)
    .required()
    .messages({
      'string.min': 'L\'ancien mot de passe doit contenir au moins 6 caractères',
      'any.required': 'L\'ancien mot de passe est requis'
    }),
  newPassword: Joi.string()
    .min(8)
    .max(100)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .invalid(Joi.ref('oldPassword'))
    .messages({
      'string.min': 'Le nouveau mot de passe doit contenir au moins 8 caractères',
      'string.pattern.base': 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre',
      'any.required': 'Le nouveau mot de passe est requis',
      'any.invalid': 'Le nouveau mot de passe doit être différent de l\'ancien'
    })
});

// ===== SERVEURS =====

export const createServerSchema = Joi.object({
  name: Joi.string()
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.min': 'Le nom du serveur ne peut pas être vide',
      'string.max': 'Le nom du serveur ne peut pas dépasser 100 caractères',
      'any.required': 'Le nom du serveur est requis'
    }),
  host: Joi.string()
    .hostname()
    .required()
    .messages({
      'string.hostname': 'L\'hôte doit être un nom d\'hôte valide ou une adresse IP',
      'any.required': 'L\'hôte est requis'
    }),
  port: Joi.number()
    .integer()
    .min(1)
    .max(65535)
    .default(22)
    .messages({
      'number.min': 'Le port doit être entre 1 et 65535',
      'number.max': 'Le port doit être entre 1 et 65535',
      'number.integer': 'Le port doit être un nombre entier'
    }),
  username: Joi.string()
    .min(1)
    .max(50)
    .required()
    .messages({
      'string.min': 'Le nom d\'utilisateur ne peut pas être vide',
      'string.max': 'Le nom d\'utilisateur ne peut pas dépasser 50 caractères',
      'any.required': 'Le nom d\'utilisateur est requis'
    }),
  password: Joi.string()
    .max(500)
    .allow('')
    .optional()
    .messages({
      'string.max': 'Le mot de passe ne peut pas dépasser 500 caractères'
    }),
  sshKey: Joi.string()
    .max(10000)
    .allow('')
    .optional()
    .messages({
      'string.max': 'La clé SSH ne peut pas dépasser 10000 caractères'
    }),
  description: Joi.string()
    .max(500)
    .allow('')
    .optional()
    .messages({
      'string.max': 'La description ne peut pas dépasser 500 caractères'
    })
});

export const updateServerSchema = Joi.object({
  name: Joi.string()
    .min(1)
    .max(100)
    .optional()
    .messages({
      'string.min': 'Le nom du serveur ne peut pas être vide',
      'string.max': 'Le nom du serveur ne peut pas dépasser 100 caractères'
    }),
  host: Joi.string()
    .hostname()
    .optional()
    .messages({
      'string.hostname': 'L\'hôte doit être un nom d\'hôte valide ou une adresse IP'
    }),
  port: Joi.number()
    .integer()
    .min(1)
    .max(65535)
    .optional()
    .messages({
      'number.min': 'Le port doit être entre 1 et 65535',
      'number.max': 'Le port doit être entre 1 et 65535'
    }),
  username: Joi.string()
    .min(1)
    .max(50)
    .optional()
    .messages({
      'string.min': 'Le nom d\'utilisateur ne peut pas être vide',
      'string.max': 'Le nom d\'utilisateur ne peut pas dépasser 50 caractères'
    }),
  password: Joi.string()
    .max(500)
    .allow('')
    .optional(),
  sshKey: Joi.string()
    .max(10000)
    .allow('')
    .optional(),
  description: Joi.string()
    .max(500)
    .allow('')
    .optional()
});

// ===== PROJETS =====

export const createProjectSchema = Joi.object({
  name: Joi.string()
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.min': 'Le nom du projet ne peut pas être vide',
      'string.max': 'Le nom du projet ne peut pas dépasser 100 caractères',
      'any.required': 'Le nom du projet est requis'
    }),
  description: Joi.string()
    .max(1000)
    .allow('')
    .optional()
    .messages({
      'string.max': 'La description ne peut pas dépasser 1000 caractères'
    }),
  repository: Joi.string()
    .uri()
    .max(500)
    .allow('')
    .optional()
    .messages({
      'string.uri': 'Le repository doit être une URL valide',
      'string.max': 'L\'URL du repository ne peut pas dépasser 500 caractères'
    }),
  serverId: Joi.number()
    .integer()
    .positive()
    .optional()
    .messages({
      'number.integer': 'L\'ID du serveur doit être un nombre entier',
      'number.positive': 'L\'ID du serveur doit être positif'
    })
});

// ===== COMMANDES TERMINAL =====

export const executeCommandSchema = Joi.object({
  command: Joi.string()
    .min(1)
    .max(5000)
    .required()
    .messages({
      'string.min': 'La commande ne peut pas être vide',
      'string.max': 'La commande ne peut pas dépasser 5000 caractères',
      'any.required': 'La commande est requise'
    }),
  serverId: Joi.number()
    .integer()
    .positive()
    .optional()
    .messages({
      'number.integer': 'L\'ID du serveur doit être un nombre entier',
      'number.positive': 'L\'ID du serveur doit être positif'
    }),
  timeout: Joi.number()
    .integer()
    .min(1000)
    .max(300000)
    .default(30000)
    .optional()
    .messages({
      'number.min': 'Le timeout minimum est de 1000ms (1 seconde)',
      'number.max': 'Le timeout maximum est de 300000ms (5 minutes)'
    })
});

// ===== PARAMÈTRES ID =====

export const idParamSchema = Joi.object({
  id: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({
      'number.integer': 'L\'ID doit être un nombre entier',
      'number.positive': 'L\'ID doit être positif',
      'any.required': 'L\'ID est requis'
    })
});

// ===== PAGINATION =====

export const paginationQuerySchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1)
    .optional()
    .messages({
      'number.min': 'La page doit être >= 1',
      'number.integer': 'La page doit être un nombre entier'
    }),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10)
    .optional()
    .messages({
      'number.min': 'La limite doit être >= 1',
      'number.max': 'La limite maximum est 100',
      'number.integer': 'La limite doit être un nombre entier'
    }),
  sort: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
    .optional()
    .messages({
      'any.only': 'Le tri doit être "asc" ou "desc"'
    })
});

export default {
  // Auth
  loginSchema,
  registerSchema,
  changePasswordSchema,
  // Serveurs
  createServerSchema,
  updateServerSchema,
  // Projets
  createProjectSchema,
  // Commandes
  executeCommandSchema,
  // Utilitaires
  idParamSchema,
  paginationQuerySchema
};

// ============================================
// Schémas pour agent.js (Ajoutés le 24/11/2025)
// ============================================

/**
 * Schéma pour POST /execute avec plusieurs serveurs
 * Accepte un tableau d'IDs de serveurs
 */
export const executeMultiServerCommandSchema = Joi.object({
  serverIds: Joi.array()
    .items(Joi.number().integer().positive())
    .min(1)
    .required()
    .messages({
      'array.min': 'Au moins un serveur est requis',
      'any.required': 'Les IDs de serveurs sont requis',
      'array.base': 'serverIds doit être un tableau'
    }),
  command: Joi.string()
    .min(1)
    .max(5000)
    .required()
    .messages({
      'string.min': 'La commande ne peut pas être vide',
      'string.max': 'La commande ne peut pas dépasser 5000 caractères',
      'any.required': 'La commande est requise'
    }),
  templateId: Joi.number()
    .integer()
    .positive()
    .optional()
    .messages({
      'number.integer': 'L\'ID du template doit être un nombre entier',
      'number.positive': 'L\'ID du template doit être positif'
    }),
  timeout: Joi.number()
    .integer()
    .min(1000)
    .max(300000)
    .default(30000)
    .optional()
    .messages({
      'number.min': 'Le timeout minimum est 1000ms',
      'number.max': 'Le timeout maximum est 300000ms (5 minutes)'
    })
});

/**
 * Schéma pour POST /templates - Créer un template de commande
 */
export const createTemplateSchema = Joi.object({
  name: Joi.string()
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.min': 'Le nom du template ne peut pas être vide',
      'string.max': 'Le nom ne peut pas dépasser 100 caractères',
      'any.required': 'Le nom du template est requis'
    }),
  description: Joi.string()
    .max(500)
    .optional()
    .allow('')
    .messages({
      'string.max': 'La description ne peut pas dépasser 500 caractères'
    }),
  command: Joi.string()
    .min(1)
    .max(5000)
    .required()
    .messages({
      'string.min': 'La commande ne peut pas être vide',
      'string.max': 'La commande ne peut pas dépasser 5000 caractères',
      'any.required': 'La commande est requise'
    }),
  category: Joi.string()
    .max(50)
    .optional()
    .allow('')
    .messages({
      'string.max': 'La catégorie ne peut pas dépasser 50 caractères'
    })
});

// ============================================
// Schémas pour projects.js (Ajoutés le 24/11/2025)
// ============================================

/**
 * Schéma pour POST /:name/docker/compose
 * Commandes Docker Compose
 */
export const dockerComposeSchema = Joi.object({
  command: Joi.string()
    .valid('up', 'down', 'restart', 'logs', 'ps', 'pull', 'build', 'stop', 'start')
    .required()
    .messages({
      'any.required': 'La commande Docker Compose est requise',
      'any.only': 'Commande invalide. Commandes valides: up, down, restart, logs, ps, pull, build, stop, start'
    })
});

/**
 * Schéma pour DELETE /:name avec confirmation
 * Query param confirm=yes requis
 */
export const deleteProjectQuerySchema = Joi.object({
  confirm: Joi.string()
    .valid('yes')
    .required()
    .messages({
      'any.required': 'La confirmation est requise (?confirm=yes)',
      'any.only': 'La confirmation doit être yes'
    })
});

/**
 * Schéma pour paramètre :name (nom de projet)
 */
export const projectNameParamSchema = Joi.object({
  name: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.pattern.base': 'Le nom du projet ne peut contenir que des lettres, chiffres, tirets et underscores',
      'string.min': 'Le nom du projet ne peut pas être vide',
      'string.max': 'Le nom du projet ne peut pas dépasser 100 caractères',
      'any.required': 'Le nom du projet est requis'
    })
});

// ============================================
// Schémas pour admin.js (Ajoutés le 24/11/2025)
// ============================================

/**
 * Schéma pour PUT /users/:userId
 * Mise à jour des informations utilisateur
 */
export const updateUserSchema = Joi.object({
  username: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).min(3).max(30).optional(),
  email: Joi.string().email().optional(),
  role: Joi.string().valid('user', 'admin', 'moderator').optional(),
  subscription_plan: Joi.string().max(50).optional(),
  status: Joi.string().valid('active', 'suspended', 'inactive').optional()
}).min(1).messages({
  'object.min': 'Au moins un champ doit être fourni pour la mise à jour'
});

/**
 * Schéma pour POST /payments/:transactionId/validate
 * Validation d'une transaction de paiement
 */
export const validatePaymentSchema = Joi.object({
  notes: Joi.string().max(500).optional().allow('')
});

/**
 * Schéma pour PUT /settings/:key
 * Mise à jour d'un paramètre système
 */
export const updateSettingSchema = Joi.object({
  value: Joi.alternatives()
    .try(
      Joi.string().max(1000),
      Joi.number(),
      Joi.boolean()
    )
    .required()
    .messages({
      'any.required': 'La valeur est requise',
      'alternatives.match': 'La valeur doit être une chaîne, un nombre ou un booléen'
    })
});

/**
 * Schéma pour POST /ai-keys
 * Ajout d'une clé API IA
 */
export const createAiKeySchema = Joi.object({
  provider: Joi.string()
    .valid('openai', 'anthropic', 'google', 'mistral', 'cohere')
    .required()
    .messages({
      'any.required': 'Le fournisseur est requis',
      'any.only': 'Fournisseur invalide. Fournisseurs valides: openai, anthropic, google, mistral, cohere'
    }),
  apiKey: Joi.string()
    .min(10)
    .max(500)
    .required()
    .messages({
      'string.min': 'La clé API doit contenir au moins 10 caractères',
      'string.max': 'La clé API ne peut pas dépasser 500 caractères',
      'any.required': 'La clé API est requise'
    }),
  apiSecret: Joi.string().max(500).optional().allow(''),
  name: Joi.string().max(100).optional().allow(''),
  userId: Joi.number().integer().positive().optional(),
  isDefault: Joi.boolean().default(false).optional(),
  monthlyLimitUSD: Joi.number().min(0).max(100000).optional()
});

/**
 * Schéma pour paramètre :userId (ID utilisateur)
 */
export const userIdParamSchema = Joi.object({
  userId: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({
      'number.base': 'L\'ID utilisateur doit être un nombre',
      'number.integer': 'L\'ID utilisateur doit être un entier',
      'number.positive': 'L\'ID utilisateur doit être positif',
      'any.required': 'L\'ID utilisateur est requis'
    })
});

/**
 * Schéma pour paramètre :transactionId
 */
export const transactionIdParamSchema = Joi.object({
  transactionId: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .min(5)
    .max(100)
    .required()
    .messages({
      'string.pattern.base': 'L\'ID de transaction contient des caractères invalides',
      'string.min': 'L\'ID de transaction doit contenir au moins 5 caractères',
      'any.required': 'L\'ID de transaction est requis'
    })
});

/**
 * Schéma pour paramètre :key (clé de paramètre)
 */
export const settingKeyParamSchema = Joi.object({
  key: Joi.string()
    .pattern(/^[a-zA-Z0-9_.-]+$/)
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.pattern.base': 'La clé de paramètre contient des caractères invalides',
      'any.required': 'La clé de paramètre est requise'
    })
});

/**
 * Schéma pour paramètre :keyId (ID clé IA)
 */
export const aiKeyIdParamSchema = Joi.object({
  keyId: Joi.string()
    .pattern(/^aikey_[0-9]+_[a-z0-9]+$/)
    .required()
    .messages({
      'string.pattern.base': 'L\'ID de clé IA est invalide',
      'any.required': 'L\'ID de clé IA est requis'
    })
});

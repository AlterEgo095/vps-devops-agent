export const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'VPS DevOps Agent API',
    version: '2.0.0',
    description: `
# API Documentation - VPS DevOps Agent

Agent DevOps autonome pour gérer votre VPS Ubuntu depuis une API REST.

## 🚀 Sprint 1 - Nouvelles Capacités

Cette API expose 4 nouvelles capacités avancées :

- **readMultipleFiles** : Lecture batch de fichiers avec pattern matching
- **searchInFiles** : Recherche grep-like avec contexte
- **analyzeCodebase** : Analyse complète de projets
- **editFile** : Édition sécurisée avec backup

## 🔐 Authentification

Toutes les routes nécessitent un token JWT Bearer :

\`\`\`bash
# 1. Obtenir un token
curl -X POST https://devops.aenews.net/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username":"admin","password":"Admin2024"}'

# 2. Utiliser le token
curl https://devops.aenews.net/api/capabilities/list \\
  -H "Authorization: Bearer YOUR_TOKEN"
\`\`\`

## 📊 Rate Limiting

- **Capacités Sprint 1** : 60 requêtes/minute
- **Autres endpoints** : 100 requêtes/minute

## 🌐 Base URL

- Production : \`https://devops.aenews.net\`
- Workspace : \`/opt/agent-projects\`
    `,
    contact: {
      name: 'API Support',
      url: 'https://devops.aenews.net'
    }
  },
  servers: [
    {
      url: 'https://devops.aenews.net',
      description: 'Production server'
    },
    {
      url: 'http://localhost:4000',
      description: 'Development server'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token obtenu via /api/auth/login'
      }
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false
          },
          error: {
            type: 'string',
            example: 'Error message'
          }
        }
      },
      FileItem: {
        type: 'object',
        properties: {
          path: {
            type: 'string'
          },
          content: {
            type: 'string'
          },
          size: {
            type: 'integer'
          },
          modified: {
            type: 'string',
            format: 'date-time'
          },
          success: {
            type: 'boolean'
          }
        }
      },
      SearchMatch: {
        type: 'object',
        properties: {
          file: {
            type: 'string'
          },
          line: {
            type: 'integer'
          },
          content: {
            type: 'string'
          },
          context: {
            type: 'object',
            properties: {
              before: {
                type: 'array',
                items: {
                  type: 'object'
                }
              },
              after: {
                type: 'array',
                items: {
                  type: 'object'
                }
              }
            }
          }
        }
      }
    }
  },
  tags: [
    {
      name: 'Authentication',
      description: 'Authentification et gestion des sessions'
    },
    {
      name: 'Capabilities',
      description: 'Capacités Sprint 1 - API REST avancées'
    },
    {
      name: 'Agent',
      description: 'Agent IA pour génération et exécution de plans'
    },
    {
      name: 'Projects',
      description: 'Gestion des projets'
    }
  ]
};

export const swaggerOptions = {
  definition: swaggerDefinition,
  apis: [] // Commentaires JSDoc inclus directement dans les routes
};

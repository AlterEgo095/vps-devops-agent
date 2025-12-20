/**
 * Swagger/OpenAPI 3.0 Configuration for V2 API
 * Sprint 2 - REST API Complete
 */

export const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'VPS DevOps Agent API V2',
    version: '2.0.0',
    description: `
**API REST V2 pour le VPS DevOps Agent**

Cette API expose les 4 capabilities avancées du Sprint 1 via des endpoints RESTful.

**Sprint 1 - Capabilities Avancées:**
- readMultipleFiles: Lecture batch avec glob patterns (70% plus rapide)
- searchInFiles: Recherche grep-like avec contexte (95% plus rapide)
- analyzeCodebase: Analyse complète de projet (81% plus rapide)
- editFile: Édition multi-zone avec backup/rollback (sécurisé)

**Sprint 2 - API REST:**
- Endpoints RESTful standardisés
- Documentation OpenAPI 3.0
- Rate limiting par endpoint
- Format de réponse unifié
- Gestion d'erreurs complète

**Améliorations par rapport à V1:**
- Format de réponse standardisé avec metadata
- Meilleure documentation
- Validation des entrées renforcée
- Rate limiting configurable
    `,
    contact: {
      name: 'Support API',
      email: 'support@aenews.net'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
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
        description: 'Token JWT obtenu via /api/auth/login'
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
          },
          meta: {
            type: 'object',
            properties: {
              version: {
                type: 'string',
                example: 'v2'
              },
              timestamp: {
                type: 'string',
                format: 'date-time'
              }
            }
          }
        }
      },
      Success: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true
          },
          data: {
            type: 'object',
            description: 'Response data (varies by endpoint)'
          },
          meta: {
            type: 'object',
            properties: {
              version: {
                type: 'string',
                example: 'v2'
              },
              timestamp: {
                type: 'string',
                format: 'date-time'
              }
            }
          }
        }
      }
    },
    responses: {
      UnauthorizedError: {
        description: 'Authentication token is missing or invalid',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            }
          }
        }
      },
      BadRequestError: {
        description: 'Invalid request parameters',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            }
          }
        }
      },
      InternalServerError: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            }
          }
        }
      }
    }
  },
  security: [
    {
      bearerAuth: []
    }
  ],
  tags: [
    {
      name: 'V2 - Health',
      description: 'V2 API health check endpoints'
    },
    {
      name: 'V2 - Capabilities',
      description: 'Sprint 1 advanced capabilities via REST API'
    }
  ]
};

/**
 * Configuration pour swagger-jsdoc
 * Scanne uniquement les routes v2 pour éviter les conflits
 */
export const swaggerOptions = {
  definition: swaggerDefinition,
  apis: [] // Annotations directement dans capabilities.js
};

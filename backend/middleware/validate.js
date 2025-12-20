/**
 * 🛡️ INPUT VALIDATION MIDDLEWARE
 * Protection contre injections SQL, XSS, et données malformées
 * Utilise Joi pour la validation des schémas
 */

import Joi from 'joi';

/**
 * Middleware de validation générique
 * @param {Joi.Schema} schema - Schéma Joi de validation
 * @param {string} property - Propriété à valider ('body', 'query', 'params')
 * @returns {Function} Middleware Express
 */
export const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false, // Retourner toutes les erreurs
      stripUnknown: true, // Supprimer les champs non définis
      convert: true       // Convertir les types automatiquement
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      return res.status(400).json({
        error: 'Validation échouée',
        message: 'Les données fournies sont invalides',
        details: errors
      });
    }

    // Remplacer req[property] avec les valeurs validées et nettoyées
    req[property] = value;
    next();
  };
};

/**
 * Validation middleware pour le corps de la requête
 */
export const validateBody = (schema) => validate(schema, 'body');

/**
 * Validation middleware pour les query parameters
 */
export const validateQuery = (schema) => validate(schema, 'query');

/**
 * Validation middleware pour les URL parameters
 */
export const validateParams = (schema) => validate(schema, 'params');

export default {
  validate,
  validateBody,
  validateQuery,
  validateParams
};

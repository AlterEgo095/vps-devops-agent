/**
 * IFRAME DETECTOR
 * Détecte automatiquement si la page est chargée dans une iframe
 * et applique les styles appropriés
 */

(function() {
    'use strict';
    
    // Détecte si la page est dans une iframe
    function isInIframe() {
        try {
            return window.self !== window.top;
        } catch (e) {
            // Si on ne peut pas accéder à window.top (restrictions CORS),
            // on suppose qu'on est dans une iframe
            return true;
        }
    }
    
    // Applique la classe dès que le DOM est prêt
    if (isInIframe()) {
        // Ajoute la classe immédiatement pour éviter le flash
        document.documentElement.classList.add('in-iframe');
        
        // Ajoute aussi sur body quand il est disponible
        if (document.body) {
            document.body.classList.add('in-iframe');
        } else {
            document.addEventListener('DOMContentLoaded', function() {
                document.body.classList.add('in-iframe');
            });
        }
        
        console.log('📦 Page chargée dans une iframe - Mode embed activé');
    } else {
        console.log('🌐 Page chargée en mode standalone');
    }
})();

/**
 * POS.SERVICES.JS - Módulo de soporte
 * Las funciones principales (initSettings, updateFormSelects, renderServicesList, etc.)
 * están definidas en pos.js para evitar duplicación.
 * Este módulo solo proporciona fallbacks si pos.js no definió algo.
 */

// getBusinessConfig y saveBusinessConfig: solo se definen si pos.js no las creó primero
if (typeof getBusinessConfig !== 'function') {
    function getBusinessConfig() {
        if (typeof window.getBusinessConfigInternal === 'function') {
            return window.getBusinessConfigInternal();
        }
        const raw = localStorage.getItem('violet_business_config');
        const defaults = {
            openTime: '09:00', closeTime: '20:00', lunchStart: '', lunchEnd: '',
            closedDays: [], timeFormat: '24h', blockedSlots: []
        };
        if (!raw) return defaults;
        try {
            return { ...defaults, ...JSON.parse(raw) };
        } catch {
            return defaults;
        }
    }
    window.getBusinessConfig = getBusinessConfig;
}

if (typeof saveBusinessConfig !== 'function') {
    function saveBusinessConfig(cfg) {
        localStorage.setItem('violet_business_config', JSON.stringify(cfg));
    }
    window.saveBusinessConfig = saveBusinessConfig;
}

console.log('[SERVICES] Módulo de soporte cargado (funciones principales en pos.js)');
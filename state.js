/**
 * STATE.JS - Gestor de estado centralizado
 * Reemplaza todas las variables globales dispersas
 */

let db = {
    transactions: [],
    clients: [],
    appointments: [],
    tasks: [],
    services: [],
    employees: [],
    closures: [],
    clientFiles: []
};

const state = {
    // Datos referencia a db (alias directo para retrocompatibilidad con módulos)
    data: db,

    // UI y navegación
    ui: {
        currentView: 'dashboard',
        currentClient: null,
        aptCurrentClient: null,
        activeModal: null,
        charts: {},
        isLoading: false,
        error: null
    },

    // Autenticación
    auth: {
        user: null,
        session: null,
        isAuthenticated: false
    },

    // Configuración del negocio
    config: {
        openTime: '09:00',
        closeTime: '20:00',
        lunchStart: '',
        lunchEnd: '',
        closedDays: [],
        timeFormat: '24h',
        blockedSlots: []
    }
};

/**
 * Setter seguro para el estado
 * Uso: setState('ui.currentView', 'caja')
 */
function setState(path, value) {
    const keys = path.split('.');
    let obj = state;

    // Navegar hasta el penúltimo nivel
    for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in obj)) {
            obj[keys[i]] = {};
        }
        obj = obj[keys[i]];
    }

    // Asignar valor
    const lastKey = keys[keys.length - 1];
    obj[lastKey] = value;

    // Debug
    console.log(`[STATE] ${path} = `, value);
}

/**
 * Getter seguro para el estado
 * Uso: getState('ui.currentView')
 */
function getState(path) {
    const value = path.split('.').reduce((obj, key) => obj?.[key], state);
    return value;
}

/**
 * Aliases de Compatibilidad - Unifican funciones con nombres diferentes
 * Eliminamos duplicación entre getUserId y getCurrentUserId
 */
function getUserId() {
    return getState('auth.user.id');
}

function getCurrentUserId() {
    return getState('auth.user.id');
}

function getCurrentUser() {
    return getState('auth.user');
}

function getCurrentUserEmail() {
    return getState('auth.user.email');
}

function isAuthenticated() {
    return getState('auth.isAuthenticated');
}

/**
 * Actualizar datos de BD - Sincroniza db y state.data
 */
function updateData(collection, newData) {
    if (collection in db) {
        db[collection] = newData;
        state.data = db;
        console.log(`[STATE] data.${collection} actualizado (${newData.length} items)`);
    } else {
        console.warn(`[STATE] Colección desconocida: ${collection}`);
    }
}

/**
 * Sincronizar datos desde Supabase - alias para loadDataFromSupabase
 */
function syncData(collection, records, transform = null) {
    if (!(collection in db)) {
        console.warn(`[SYNC] Colección desconocida: ${collection}`);
        return;
    }
    const data = transform ? records.map(transform) : records;
    db[collection] = data;
    state.data = db;
    console.log(`[SYNC] ${collection}: ${data.length} registros`);
}

/**
 * Resetear estado (logout)
 */
function resetState() {
    state.auth = {
        user: null,
        session: null,
        isAuthenticated: false
    };
    state.ui = {
        currentView: 'dashboard',
        currentClient: null,
        aptCurrentClient: null,
        activeModal: null,
        charts: {},
        isLoading: false,
        error: null
    };
    db = {
        transactions: [],
        clients: [],
        appointments: [],
        tasks: [],
        services: [],
        employees: [],
        closures: [],
        clientFiles: []
    };
    state.data = db;
    console.log('[STATE] Estado reseteado');
}

// Exportar para uso en módulos (si usas bundler)
// export { state, setState, getState, updateData, resetState };

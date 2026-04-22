/**
 * CLIENTS.JS - Servicio de Clientes
 * Usa el db centralizado desde state.js
 */

// ==========================================
// CRUD - CREATE
// ==========================================

/**
 * Crear nuevo cliente
 */
async function createClient(payload) {
    try {
        // Validar datos
        const errors = validateClient(payload);
        if (errors.length > 0) {
            return { data: null, error: errors[0] };
        }

        // Preparar datos
        const clientData = {
            user_id: getUserId(),
            name: normalizeName(payload.name),
            phone: payload.phone ? normalizePhone(payload.phone) : null,
            email: payload.email?.toLowerCase() || null,
            instagram: payload.instagram ? normalizeInstagram(payload.instagram) : null,
            birthday: payload.birthday || null,
            address: payload.address || null,
            notes: payload.notes || null,
            balance: payload.balance || 0,
            debt: payload.debt || 0
        };

        // Intentar insertar
        return await insertClientSafe(clientData);
    } catch (error) {
        console.error('[CLIENTS] Error creando cliente:', error);
        return { data: null, error: error.message };
    }
}

/**
 * Crear cliente si no existe (búsqueda por duplicado)
 */
async function createClientIfNotExists(payload) {
    try {
        // Buscar duplicado
        const duplicate = findDuplicateClient(payload.name, payload.phone);
        if (duplicate) {
            console.log('[CLIENTS] Cliente duplicado encontrado:', duplicate.id);
            return { data: duplicate, isDuplicate: true };
        }

        // Crear nuevo
        const result = await createClient(payload);
        return { ...result, isDuplicate: false };
    } catch (error) {
        console.error('[CLIENTS] Error en createClientIfNotExists:', error);
        return { data: null, error: error.message, isDuplicate: false };
    }
}

// ==========================================
// CRUD - READ
// ==========================================

/**
 * Obtener cliente por ID
 */
function getClientById(clientId) {
    return db.clients.find(c => c.id === clientId) || null;
}

/**
 * Obtener todos los clientes
 */
function getAllClients() {
    return db.clients || [];
}

/**
 * Buscar clientes (por nombre o teléfono)
 */
function searchClients(query) {
    if (!query) return db.clients;

    const q = query.toLowerCase();
    return db.clients.filter(c =>
        (c.name?.toLowerCase().includes(q)) ||
        (c.phone?.includes(query)) ||
        (c.email?.toLowerCase().includes(q))
    );
}

/**
 * Obtener clientes con deuda
 */
function getClientsWithDebt() {
    return db.clients.filter(c => c.debt > 0);
}

/**
 * Obtener clientes con cumpleaños próximos (7 días)
 */
function getUpcomingBirthdays(days = 7) {
    const today = new Date();
    return db.clients.filter(c => {
        if (!c.birthday) return false;
        const [y, m, d] = c.birthday.split('-');
        const bDate = new Date(today.getFullYear(), parseInt(m) - 1, parseInt(d));
        if (bDate < today) bDate.setFullYear(today.getFullYear() + 1);
        const diffTime = Math.abs(bDate - today);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= days;
    });
}

/**
 * Obtener transacciones de un cliente
 */
function getClientTransactions(clientId) {
    return db.transactions.filter(t => t.client_id === clientId);
}

/**
 * Obtener citas de un cliente
 */
function getClientAppointments(clientId) {
    return db.appointments.filter(a => a.client_id === clientId);
}

// ==========================================
// CRUD - UPDATE
// ==========================================

/**
 * Actualizar cliente
 */
async function updateClient(clientId, updates) {
    try {
        // Validar datos
        const errors = validateClient({ ...getClientById(clientId), ...updates });
        if (errors.length > 0) {
            return { error: errors[0] };
        }

        // Preparar actualizaciones
        const updateData = {};
        if (updates.name) updateData.name = normalizeName(updates.name);
        if (updates.phone) updateData.phone = normalizePhone(updates.phone);
        if (updates.email) updateData.email = updates.email.toLowerCase();
        if (updates.instagram) updateData.instagram = normalizeInstagram(updates.instagram);
        if (updates.birthday !== undefined) updateData.birthday = updates.birthday;
        if (updates.address) updateData.address = updates.address;
        if (updates.notes) updateData.notes = updates.notes;
        if (updates.balance !== undefined) updateData.balance = updates.balance;
        if (updates.debt !== undefined) updateData.debt = updates.debt;

        // Actualizar en BD
        return await updateClientSafe(clientId, updateData);
    } catch (error) {
        console.error('[CLIENTS] Error actualizando cliente:', error);
        return { error: error.message };
    }
}

/**
 * Actualizar deuda de cliente
 */
async function updateClientDebt(clientId, amount) {
    const client = getClientById(clientId);
    if (!client) return { error: 'Cliente no encontrado' };
    
    return updateClient(clientId, { debt: client.debt + amount });
}

/**
 * Actualizar balance de cliente
 */
async function updateClientBalance(clientId, amount) {
    const client = getClientById(clientId);
    if (!client) return { error: 'Cliente no encontrado' };
    
    return updateClient(clientId, { balance: client.balance + amount });
}

// ==========================================
// CRUD - DELETE
// ==========================================

/**
 * Eliminar cliente (soft delete - marcar como inactivo)
 * No recomendado: mejor mantener datos para auditoría
 */
async function deleteClient(clientId) {
    try {
        const { error } = await window.supabaseClient
            .from('clients')
            .delete()
            .eq('id', clientId);

        if (error) return { error: error.message };

        // Actualizar estado local
        state.data.clients = state.data.clients.filter(c => c.id !== clientId);
        showToast('Cliente eliminado', 'success');
        return { success: true };
    } catch (error) {
        console.error('[CLIENTS] Error eliminando cliente:', error);
        return { error: error.message };
    }
}

// ==========================================
// FUNCIONES AUXILIARES
// ==========================================

/**
 * Sincronizar clientes desde Supabase
 */
async function syncClients() {
    try {
        const { data, error } = await window.supabaseClient
            .from('clients')
            .select('*')
            .eq('user_id', getUserId())
            .order('name', { ascending: true });

        if (error) {
            console.error('[CLIENTS] Error sincronizando:', error);
            return { error: error.message };
        }

        db.clients = data || [];
        state.data = db;
        console.log(`[CLIENTS] ${data.length} clientes sincronizados`);
        return { success: true };
    } catch (error) {
        console.error('[CLIENTS] Error inesperado:', error);
        return { error: error.message };
    }
}

/**
 * Contar clientes
 */
function countClients() {
    return db.clients.length;
}

/**
 * Obtener resumen de clientes
 */
function getClientsSummary() {
    const clients = db.clients;
    return {
        total: clients.length,
        withDebt: clients.filter(c => c.debt > 0).length,
        totalDebt: clients.reduce((sum, c) => sum + (c.debt || 0), 0),
        totalBalance: clients.reduce((sum, c) => sum + (c.balance || 0), 0),
        recentBirthdays: getUpcomingBirthdays(7).length
    };
}

console.log('[CLIENTS] Servicio cargado correctamente');

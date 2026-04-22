/**
 * SUPABASE-HELPERS.JS - Helpers Genéricos para Supabase
 * Manejan columnas	opcionales faltantes gracefully
 * Usado por pos.js, clients.js, y cualquier otro módulo
 */

async function insertClientSafe(payload) {
    const userId = getUserId();
    if (userId) payload.user_id = userId;
    let { data, error } = await window.supabaseClient.from('clients').insert([payload]).select();
    if (error && error.message) {
        const m = error.message.match(/Could not find the '(\w+)' column/i);
        if (m && m[1] && m[1] in payload) {
            const cleaned = { ...payload };
            delete cleaned[m[1]];
            console.warn(`Columna '${m[1]}' no existe en Supabase. Insertando sin ese campo.`);
            const retry = await window.supabaseClient.from('clients').insert([cleaned]).select();
            return retry;
        }
    }
    return { data, error };
}

async function updateClientSafe(id, payload) {
    let { error } = await window.supabaseClient.from('clients').update(payload).eq('id', id);
    if (error && error.message) {
        const m = error.message.match(/Could not find the '(\w+)' column/i);
        if (m && m[1] && m[1] in payload) {
            const cleaned = { ...payload };
            delete cleaned[m[1]];
            console.warn(`Columna '${m[1]}' no existe. Actualizando sin ese campo.`);
            const retry = await window.supabaseClient.from('clients').update(cleaned).eq('id', id);
            return retry;
        }
    }
    return { error };
}

function findDuplicateClient(name, phone = '', excludeId = null) {
    const normName = (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const normPhone = (phone || '').replace(/\D/g, '').slice(-8);
    if (!normName && !normPhone) return null;
    return db.clients.find(c => {
        if (excludeId && c.id == excludeId) return false;
        const cName = (c.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const cPhone = (c.phone || '').replace(/\D/g, '').slice(-8);
        if (normPhone && cPhone && cPhone === normPhone) return true;
        if (cName && cName === normName) return true;
        return false;
    }) || null;
}

async function insertTransactionSafe(payload) {
    const userId = getUserId();
    if (userId) payload.user_id = userId;
    let { data, error } = await window.supabaseClient.from('transactions').insert([payload]).select();
    if (error && error.message) {
        const m = error.message.match(/Could not find the '(\w+)' column/i);
        if (m && m[1] && m[1] in payload) {
            const cleaned = { ...payload };
            delete cleaned[m[1]];
            console.warn(`Columna '${m[1]}' no existe en transactions. Insertando sin ese campo.`);
            const retry = await window.supabaseClient.from('transactions').insert([cleaned]).select();
            return retry;
        }
    }
    return { data, error };
}

async function insertAppointmentSafe(payload) {
    const userId = getUserId();
    if (userId) payload.user_id = userId;
    let { data, error } = await window.supabaseClient.from('appointments').insert([payload]).select();
    if (error && error.message) {
        const m = error.message.match(/Could not find the '(\w+)' column/i);
        if (m && m[1] && m[1] in payload) {
            const cleaned = { ...payload };
            delete cleaned[m[1]];
            console.warn(`Columna '${m[1]}' no existe en appointments. Insertando sin ese campo.`);
            const retry = await window.supabaseClient.from('appointments').insert([cleaned]).select();
            return retry;
        }
    }
    return { data, error };
}

console.log('[SUPABASE-HELPERS] Módulo cargado');
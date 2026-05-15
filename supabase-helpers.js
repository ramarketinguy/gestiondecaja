/**
 * SUPABASE-HELPERS.JS
 * Helpers genericos para escribir en Supabase sin romper la UI.
 */

function getSafeUserId() {
    return typeof getUserId === 'function' ? getUserId() : null;
}

function addUserIdIfAvailable(payload) {
    const clean = { ...(payload || {}) };
    const userId = getSafeUserId();
    if (userId) clean.user_id = userId;
    else delete clean.user_id;
    return clean;
}

function getMissingColumnName(error) {
    const msg = error?.message || '';
    return msg.match(/Could not find the '(\w+)' column/i)?.[1] || null;
}

async function runWithMissingColumnRetries(operation, payload, maxRetries = 8) {
    let cleanPayload = Array.isArray(payload)
        ? payload.map(row => ({ ...(row || {}) }))
        : { ...(payload || {}) };
    let result = await operation(cleanPayload);
    let attempts = 0;

    while (result?.error && attempts < maxRetries) {
        const column = getMissingColumnName(result.error);
        if (!column) break;
        const hasColumn = Array.isArray(cleanPayload)
            ? cleanPayload.some(row => Object.prototype.hasOwnProperty.call(row, column))
            : Object.prototype.hasOwnProperty.call(cleanPayload, column);
        if (!hasColumn) break;

        console.warn(`[Supabase] Columna '${column}' no existe. Reintentando sin ese campo.`);
        if (Array.isArray(cleanPayload)) cleanPayload.forEach(row => delete row[column]);
        else delete cleanPayload[column];
        result = await operation(cleanPayload);
        attempts += 1;
    }

    return result;
}

async function insertRowsSafe(table, rows) {
    if (!window.supabaseClient) return { data: null, error: { message: 'Supabase no inicializado' } };
    const payload = (Array.isArray(rows) ? rows : [rows]).map(addUserIdIfAvailable);
    return runWithMissingColumnRetries(
        clean => window.supabaseClient.from(table).insert(clean).select(),
        payload
    );
}

async function updateRowSafe(table, id, payload) {
    if (!window.supabaseClient) return { data: null, error: { message: 'Supabase no inicializado' } };
    const clean = { ...(payload || {}) };
    delete clean.user_id;
    return runWithMissingColumnRetries(
        data => window.supabaseClient.from(table).update(data).eq('id', id).select(),
        clean
    );
}

async function deleteRowSafe(table, id) {
    if (!window.supabaseClient) return { error: { message: 'Supabase no inicializado' } };
    return window.supabaseClient.from(table).delete().eq('id', id);
}

async function insertClientSafe(payload) {
    return insertRowsSafe('clients', payload);
}

async function updateClientSafe(id, payload) {
    return updateRowSafe('clients', id, payload);
}

async function insertTransactionSafe(payload) {
    return insertRowsSafe('transactions', payload);
}

async function insertAppointmentSafe(payload) {
    return insertRowsSafe('appointments', payload);
}

console.log('[SUPABASE-HELPERS] Modulo cargado');

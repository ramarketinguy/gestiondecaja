/**
 * POS.CONFIG.JS - Configuración del Negocio
 * Lee y guarda configuración en Supabase
 */

async function loadBusinessConfigFromSupabase() {
    if (!window.supabaseClient) return null;

    if (typeof getUserId !== 'function') {
        console.warn('[CONFIG] getUserId no definido');
        return null;
    }
    const userId = getUserId();
    if (!userId) return null;

    const { data, error } = await window.supabaseClient
        .from('business_config')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (error || !data) return null;

    return {
        openTime: data.open_time,
        closeTime: data.close_time,
        lunchStart: data.lunch_start,
        lunchEnd: data.lunch_end,
        closedDays: data.closed_days || [],
        timeFormat: data.time_format || '24h',
        blockedSlots: data.blocked_slots || []
    };
}

function saveBusinessConfig(cfg) {
    saveBusinessConfigBoth(cfg);
}

async function saveBusinessConfigToSupabase(cfg) {
    if (!window.supabaseClient) return false;

    const userId = getUserId();
    if (!userId) return false;

    let data = {
        user_id: userId,
        open_time: cfg.openTime,
        close_time: cfg.closeTime,
        lunch_start: cfg.lunchStart,
        lunch_end: cfg.lunchEnd,
        closed_days: cfg.closedDays,
        time_format: cfg.timeFormat,
        blocked_slots: cfg.blockedSlots || []
    };

    // Primero intentar update
    let { error } = await window.supabaseClient
        .from('business_config')
        .update(data)
        .eq('user_id', userId);

    if (error) {
        const m = error.message?.match(/Could not find the '(\w+)' column/i);
        if (m && m[1] && m[1] in data) {
            delete data[m[1]];
            const retry = await window.supabaseClient
                .from('business_config')
                .update(data)
                .eq('user_id', userId);
            error = retry.error;
        }
    }

    if (error) {
        // Si falla, es porque no existe, crear
        if (error.message.includes('0 rows')) {
            await window.supabaseClient.from('business_config').insert([data]);
        }
    }

    return true;
}

if (typeof window.saveBusinessConfigToSupabase !== 'function') {
    window.saveBusinessConfigToSupabase = saveBusinessConfigToSupabase;
}


function getBusinessConfig() {
    // Intentar localStorage primero
    const raw = localStorage.getItem('violet_business_config');
    const defaults = {
        openTime: '09:00', closeTime: '20:00', lunchStart: '', lunchEnd: '',
        closedDays: [], timeFormat: '24h', blockedSlots: []
    };

    if (raw) {
        try {
            return { ...defaults, ...JSON.parse(raw) };
        } catch {
            return defaults;
        }
    }

    return defaults;
}

function saveBusinessConfigLocal(cfg) {
    localStorage.setItem('violet_business_config', JSON.stringify(cfg));
}

function getBusinessConfigWithSync(callback) {
    // Primero cargar local
    const local = getBusinessConfig();

    // Luego intentar sincronizar con Supabase
    if (typeof loadBusinessConfigFromSupabase === 'function') {
        loadBusinessConfigFromSupabase().then(cloud => {
            if (cloud) {
                // Usar configuración de la nube
                saveBusinessConfigLocal(cloud);
                callback(cloud);
            } else {
                callback(local);
            }
        }).catch(() => callback(local));
    } else {
        callback(local);
    }
}


function saveBusinessConfigBoth(cfg) {
    // Guardar en ambos lugares
    saveBusinessConfigLocal(cfg);

    // Intentar enSupabase también
    if (window.supabaseClient) {
        saveBusinessConfigToSupabase(cfg);
    }
}

console.log('[CONFIG] Módulo cargado');

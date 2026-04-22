/**
 * VALIDATION.JS - Funciones de validación reutilizables
 * Previene errores de datos en Supabase
 */

// ==========================================
// 1. VALIDACIONES DE CLIENTE
// ==========================================

/**
 * Validar datos de cliente completo
 * @returns {array} Array de errores (vacío si válido)
 */
function validateClient(data) {
    const errors = [];

    // Nombre - obligatorio
    if (!data.name?.trim()) {
        errors.push('El nombre es obligatorio');
    } else if (data.name.length < 2) {
        errors.push('El nombre debe tener al menos 2 caracteres');
    } else if (data.name.length > 100) {
        errors.push('El nombre no puede exceder 100 caracteres');
    }

    // Teléfono - formato
    if (data.phone) {
        if (!/^[\d\s\-+()]{7,}$/.test(data.phone)) {
            errors.push('Teléfono inválido');
        } else if (data.phone.replace(/\D/g, '').length < 7) {
            errors.push('El teléfono debe tener al menos 7 dígitos');
        }
    }

    // Email - formato
    if (data.email) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
            errors.push('Email inválido');
        }
    }

    // Instagram - debe empezar con @
    if (data.instagram) {
        if (!data.instagram.startsWith('@')) {
            errors.push('Instagram debe empezar con @');
        } else if (data.instagram.length < 2) {
            errors.push('Instagram inválido');
        }
    }

    // Fecha de nacimiento - no puede ser futura
    if (data.birthday) {
        const bday = new Date(data.birthday);
        const today = new Date();
        if (bday > today) {
            errors.push('La fecha de nacimiento no puede ser en el futuro');
        }
        // Validar que sea mayor a 15 años (cliente potencial)
        const age = today.getFullYear() - bday.getFullYear();
        if (age < 15) {
            errors.push('La clienta debe ser mayor a 15 años');
        }
    }

    // Deuda - no negativa
    if (data.debt !== undefined && data.debt !== null) {
        if (typeof data.debt !== 'number' || data.debt < 0) {
            errors.push('La deuda no puede ser negativa');
        }
    }

    // Balance - no negativa
    if (data.balance !== undefined && data.balance !== null) {
        if (typeof data.balance !== 'number' || data.balance < 0) {
            errors.push('El balance no puede ser negativo');
        }
    }

    return errors;
}

/**
 * Validar cliente rápido (solo lo esencial)
 */
function validateClientQuick(name, phone = '') {
    const errors = [];
    if (!name?.trim()) errors.push('El nombre es obligatorio');
    if (name && name.length > 100) errors.push('Nombre muy largo');
    if (phone && !/^[\d\s\-+()]{7,}$/.test(phone)) errors.push('Teléfono inválido');
    return errors;
}

// ==========================================
// 2. VALIDACIONES DE TRANSACCIONES
// ==========================================

/**
 * Validar transacción (ingreso/egreso)
 */
function validateTransaction(data) {
    const errors = [];

    // Monto - obligatorio y positivo
    if (!data.amount || data.amount <= 0) {
        errors.push('El monto debe ser mayor a 0');
    } else if (data.amount > 1000000) {
        errors.push('El monto es demasiado alto');
    }

    // Tipo - income o expense
    if (!data.isIncome && typeof data.isIncome !== 'boolean') {
        errors.push('Debe indicar si es ingreso o gasto');
    }

    // Método - cash, transfer, check
    const validMethods = ['cash', 'transfer', 'check'];
    if (!validMethods.includes(data.method)) {
        errors.push('Método de pago inválido');
    }

    // Cliente - si es ingreso
    if (data.isIncome && !data.clientId && !data.clientName) {
        errors.push('Debe especificar cliente o nombre');
    }

    // Empleada - recomendado
    if (!data.employee) {
        console.warn('[VALIDATION] Transacción sin empleada asignada');
    }

    // Detalle
    if (data.detail && data.detail.length > 255) {
        errors.push('El detalle no puede exceder 255 caracteres');
    }

    return errors;
}

// ==========================================
// 3. VALIDACIONES DE CITAS
// ==========================================

/**
 * Validar cita (appointment)
 */
function validateAppointment(data) {
    const errors = [];

    // Cliente - obligatorio
    if (!data.clientId && !data.clientName) {
        errors.push('Debe especificar una clienta');
    }

    // Fecha - obligatoria y válida
    if (!data.date) {
        errors.push('La fecha es obligatoria');
    } else {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(data.date)) {
            errors.push('Formato de fecha inválido (YYYY-MM-DD)');
        } else {
            const dateObj = new Date(data.date);
            if (isNaN(dateObj.getTime())) {
                errors.push('Fecha inválida');
            }
            // No permitir fechas en el pasado (más de 1 hora)
            const now = new Date();
            now.setHours(now.getHours() - 1);
            if (dateObj < now && !data.date.includes('T')) { // T indica que tiene hora
                errors.push('No se pueden agendar citas en el pasado');
            }
        }
    }

    // Hora - formato válido
    if (!data.time) {
        errors.push('La hora es obligatoria');
    } else if (!/^\d{2}:\d{2}$/.test(data.time)) {
        errors.push('Formato de hora inválido (HH:MM)');
    } else {
        const [hours, minutes] = data.time.split(':').map(Number);
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            errors.push('Hora inválida');
        }
    }

    // Servicio - opcional pero validar si existe
    if (data.service && typeof data.service !== 'string') {
        errors.push('Servicio inválido');
    }

    // Notas - longitud
    if (data.notes && data.notes.length > 500) {
        errors.push('Las notas no pueden exceder 500 caracteres');
    }

    return errors;
}

// ==========================================
// 4. VALIDACIONES DE SERVICIOS
// ==========================================

/**
 * Validar servicio
 */
function validateService(data) {
    const errors = [];

    // Nombre - obligatorio
    if (!data.name?.trim()) {
        errors.push('El nombre del servicio es obligatorio');
    } else if (data.name.length > 100) {
        errors.push('Nombre del servicio muy largo');
    }

    // Tipo de precio - fixed o variable
    const validPriceTypes = ['fixed', 'variable'];
    if (!validPriceTypes.includes(data.priceType)) {
        errors.push('Tipo de precio inválido');
    }

    // Precio - si es fixed
    if (data.priceType === 'fixed') {
        if (!data.price || data.price <= 0) {
            errors.push('Precio fijo debe ser mayor a 0');
        }
    }

    // Duración - opcional pero validar
    if (data.duration && (data.duration <= 0 || data.duration > 480)) {
        errors.push('Duración inválida (5 a 480 minutos)');
    }

    return errors;
}

// ==========================================
// 5. VALIDACIONES DE AUTENTICACIÓN
// ==========================================

/**
 * Validar email
 */
function validateEmail(email) {
    const errors = [];
    if (!email?.trim()) {
        errors.push('El email es obligatorio');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push('Email inválido');
    }
    return errors;
}

/**
 * Validar contraseña
 */
function validatePassword(password) {
    const errors = [];
    if (!password) {
        errors.push('La contraseña es obligatoria');
    } else if (password.length < 6) {
        errors.push('La contraseña debe tener al menos 6 caracteres');
    }
    return errors;
}

// ==========================================
// 6. UTILIDADES DE VALIDACIÓN
// ==========================================

/**
 * Mostrar errores en toast
 */
function showValidationErrors(errors) {
    if (errors.length === 0) return;
    
    const message = errors.length === 1 
        ? errors[0]
        : `${errors.length} errores:\n` + errors.map((e, i) => `${i+1}. ${e}`).join('\n');
    
    showToast(message, 'error');
}

/**
 * Validar y mostrar errores
 */
function validateAndShow(data, validationFn) {
    const errors = validationFn(data);
    if (errors.length > 0) {
        showValidationErrors(errors);
        return false;
    }
    return true;
}

/**
 * Normalizar teléfono (remover caracteres especiales)
 */
function normalizePhone(phone) {
    return phone.replace(/\D/g, '').replace(/^598/, ''); // remover código país UY
}

/**
 * Normalizar Instagram (asegurar @)
 */
function normalizeInstagram(ig) {
    if (!ig) return '';
    return ig.startsWith('@') ? ig : '@' + ig;
}

/**
 * Normalizar nombre (trim + capitalizar)
 */
function normalizeName(name) {
    return name
        .trim()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

console.log('[VALIDATION] Módulo cargado correctamente');

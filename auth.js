/**
 * AUTH.JS - Gestor de Autenticación con Supabase
 * Maneja login, logout, session, y protección de rutas
 */

// ==========================================
// 1. INICIALIZACIÓN Y VERIFICACIÓN
// ==========================================

/**
 * Utility to show messages safely
 */
function safeShowToast(message, type = 'info') {
    console.log(`[AUTH] ${type.toUpperCase()}: ${message}`);
    if (typeof showToast === 'function') {
        showToast(message, type);
    } else if (typeof showAlert === 'function') {
        showAlert(message, type);
    } else {
        alert(message);
    }
}

/**
 * Verificar si hay sesión activa
 */
async function initializeAuth() {
    try {
        if (!window.supabaseClient) {
            console.error('[AUTH] Supabase no inicializado');
            return false;
        }

        const { data: { session } } = await window.supabaseClient.auth.getSession();
        
        if (session && session.user) {
            setState('auth.session', session);
            setState('auth.user', session.user);
            setState('auth.isAuthenticated', true);
            return true;
        }
        return false;
    } catch (error) {
        console.error('[AUTH] Error inicializando:', error);
        return false;
    }
}

/**
 * Detectar cambios de autenticación
 */
function watchAuthChanges() {
    window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            setState('auth.session', session);
            setState('auth.user', session.user);
            setState('auth.isAuthenticated', true);
            
            // Cargar datos solo si la función existe (pos.js cargado)
            if (event === 'SIGNED_IN' && typeof loadDataFromSupabase === 'function') {
                await loadDataFromSupabase();
            }
        } else if (event === 'SIGNED_OUT') {
            resetState();
            if (!window.location.pathname.includes('login.html')) {
                redirectToLogin();
            }
        }
    });
}

// ==========================================
// 2. LOGIN
// ==========================================

async function loginWithEmail(email, password) {
    try {
        setState('ui.isLoading', true);
        const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });

        if (error) {
            safeShowToast(`Error: ${error.message}`, 'error');
            setState('ui.isLoading', false);
            return false;
        }

        safeShowToast('¡Bienvenido!', 'success');
        setState('ui.isLoading', false);
        return true;
    } catch (err) {
        console.error('[AUTH] Login error:', err);
        safeShowToast('Error inesperado', 'error');
        setState('ui.isLoading', false);
        return false;
    }
}

/**
 * Login con Magic Link (enlace de email)
 * Más seguro, sin contraseñas
 */
async function loginWithMagicLink(email) {
    try {
        setState('ui.isLoading', true);

        const { error } = await window.supabaseClient.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: `${window.location.origin}/`
            }
        });

        if (error) {
            safeShowToast(`Error: ${error.message}`, 'error');
            setState('ui.isLoading', false);
            return false;
        }

        safeShowToast('Revisa tu email para el enlace de acceso', 'info');
        setState('ui.isLoading', false);
        return true;
    } catch (err) {
        console.error('[AUTH] Error en magic link:', err);
        safeShowToast('Error al enviar magic link', 'error');
        setState('ui.isLoading', false);
        return false;
    }
}

/**
 * Login con Google (OAuth)
 * Requiere configuración en Supabase
 */
async function loginWithGoogle() {
    try {
        setState('ui.isLoading', true);

        const { error } = await window.supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });

        if (error) {
            safeShowToast(`Error de login: ${error.message}`, 'error');
            setState('ui.isLoading', false);
            return false;
        }

        return true;
    } catch (err) {
        console.error('[AUTH] Error en login Google:', err);
        safeShowToast('Error al conectar con Google', 'error');
        setState('ui.isLoading', false);
        return false;
    }
}

// ==========================================
// 3. SIGNUP (Crear cuenta)
// ==========================================

/**
 * Crear nueva cuenta
 */
async function signup(email, password, fullName = '') {
    try {
        setState('ui.isLoading', true);

        // Validación básica
        if (!email || !password) {
            showToast('Email y contraseña son requeridos', 'error');
            setState('ui.isLoading', false);
            return false;
        }

        if (password.length < 6) {
            showToast('La contraseña debe tener al menos 6 caracteres', 'error');
            setState('ui.isLoading', false);
            return false;
        }

        const { data, error } = await window.supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName
                },
                emailRedirectTo: window.location.origin
            }
        });

        if (error) {
            safeShowToast(`Error: ${error.message}`, 'error');
            setState('ui.isLoading', false);
            return false;
        }

        if (data.user && !data.user.confirmed_at) {
            safeShowToast('Revisa tu email para confirmar la cuenta', 'info');
        } else {
            safeShowToast('¡Cuenta creada exitosamente!', 'success');
        }

        setState('ui.isLoading', false);
        return true;
    } catch (err) {
        console.error('[AUTH] Error en signup:', err);
        safeShowToast('Error al crear cuenta', 'error');
        setState('ui.isLoading', false);
        return false;
    }
}

// ==========================================
// 4. LOGOUT
// ==========================================

/**
 * Cerrar sesión
 */
async function logout() {
    try {
        const { error } = await window.supabaseClient.auth.signOut();

        if (error) {
            console.error('[AUTH] Error en logout:', error);
            safeShowToast('Error al cerrar sesión', 'error');
            return false;
        }

        resetState();
        safeShowToast('Sesión cerrada', 'info');
        redirectToLogin();
        return true;
    } catch (err) {
        console.error('[AUTH] Error inesperado en logout:', err);
        redirectToLogin();
        return false;
    }
}

// ==========================================
// 5. GESTIÓN DE RUTAS
// ==========================================

/**
 * Redirigir a login si no está autenticado
 */
function redirectToLogin(reason = '') {
    // Guardar URL actual para redirigir después del login
    sessionStorage.setItem('redirect_after_login', window.location.pathname);
    
    if (reason) console.warn(`[AUTH] Redirigiendo a login: ${reason}`);
    window.location.href = 'login.html';
}

/**
 * Redirigir a dashboard después del login
 */
function redirectToDashboard() {
    const redirect = sessionStorage.getItem('redirect_after_login');
    sessionStorage.removeItem('redirect_after_login');
    
    // Si hay una URL guardada y es válida (no es login)
    if (redirect && !redirect.includes('login.html')) {
        window.location.href = redirect;
    } else {
        // Redirigir a pos.html (archivo principal del proyecto)
        window.location.href = 'pos.html';
    }
}

/**
 * Proteger rutas - usar en el DOMContentLoaded
 * 
 * Ejemplo en pos.html:
 * document.addEventListener('DOMContentLoaded', async () => {
 *     if (!(await initializeAuth())) return; // Detiene si no está autenticado
 *     // ... resto del init
 * });
 */
function protectRoute(allowedRoles = []) {
    const user = getState('auth.user');
    if (!user) {
        redirectToLogin('Acceso denegado');
        return false;
    }

    // Si hay roles específicos requeridos, verificar
    if (allowedRoles.length > 0) {
        const userRole = user.user_metadata?.role;
        if (!allowedRoles.includes(userRole)) {
            safeShowToast('No tienes permiso para acceder a esta página', 'error');
            return false;
        }
    }

    return true;
}

// ==========================================
// 6. RECUPERACIÓN DE CONTRASEÑA
// ==========================================

/**
 * Enviar email para recuperar contraseña
 */
async function resetPassword(email) {
    try {
        setState('ui.isLoading', true);

        const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password.html`
        });

        if (error) {
            safeShowToast(`Error: ${error.message}`, 'error');
            setState('ui.isLoading', false);
            return false;
        }

        safeShowToast('Revisa tu email para restablecer la contraseña', 'info');
        setState('ui.isLoading', false);
        return true;
    } catch (err) {
        console.error('[AUTH] Error en reset password:', err);
        safeShowToast('Error al enviar email', 'error');
        setState('ui.isLoading', false);
        return false;
    }
}

/**
 * Actualizar contraseña (con token de reset)
 */
async function updatePassword(newPassword) {
    try {
        setState('ui.isLoading', true);

        if (newPassword.length < 6) {
            showToast('La contraseña debe tener al menos 6 caracteres', 'error');
            setState('ui.isLoading', false);
            return false;
        }

        const { error } = await window.supabaseClient.auth.updateUser({
            password: newPassword
        });

        if (error) {
            safeShowToast(`Error: ${error.message}`, 'error');
            setState('ui.isLoading', false);
            return false;
        }

        safeShowToast('Contraseña actualizada', 'success');
        setState('ui.isLoading', false);
        return true;
    } catch (err) {
        console.error('[AUTH] Error actualizando contraseña:', err);
        safeShowToast('Error al actualizar contraseña', 'error');
        setState('ui.isLoading', false);
        return false;
    }
}

// ==========================================
// 7. UTILIDADES
// ==========================================

/**
 * Obtener información del usuario actual
 */
function getCurrentUser() {
    return getState('auth.user');
}

/**
 * Obtener email del usuario actual
 */
function getCurrentUserEmail() {
    return getState('auth.user')?.email || null;
}

/**
 * Obtener ID del usuario actual
 */
function getCurrentUserId() {
    return getState('auth.user')?.id || null;
}

/**
 * Verificar si está autenticado
 */
function isAuthenticated() {
    return getState('auth.isAuthenticated');
}

console.log('[AUTH] Módulo cargado correctamente');

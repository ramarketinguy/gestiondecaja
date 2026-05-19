/**
 * VIOLET POS & ERP - Sistema de Gestión
 * Archivo Principal JavaScript
 * USA el estado centralizado de state.js
 */

// ==========================================
// 1. ESTADO GLOBAL - IMPORTADO DESDE STATE.JS
// ==========================================
// db ya está definido en state.js - lo referenciamos directamente aquí

let currentView = 'dashboard';
let currentClient = null;
let aptCurrentClient = null;
let activeModal = null;
let charts = {};
let _pendingAptClientName = null;
let _clientModalSavedCallback = null;
let _reopenAgendaAfterSave = false;
let appointmentSelectedServiceIds = [];
let posSelectedProducts = [];
let editingProductId = null;

// getUserId() definido en state.js

// showToast de emergencia si no existe
if (typeof showToast !== 'function') {
    window.showToast = function(msg, type = 'info') {
        console.log(`[TOAST-${type}]`, msg);
        const existing = document.querySelector('.toast-container');
        if (!existing) {
            const container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;
        document.querySelector('.toast-container').appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };
}

function withCurrentUser(payload) {
    const userId = typeof getUserId === 'function' ? getUserId() : null;
    if (userId) payload.user_id = userId;
    else delete payload.user_id;
    return payload;
}

// Formateador monetario global (varias funciones locales lo redefinen, lo que es OK).
// Las funciones que NO lo redefinen (renderEmployeesList, renderStaffCards) usan éste.
function fmt(n) {
    return Number(n || 0).toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
window.fmt = fmt;

function getAppointmentDate(apt) {
    return apt?.date || apt?.apt_date || '';
}

function getAppointmentTime(apt) {
    return (apt?.time || apt?.apt_time || '').slice(0, 5);
}

function getAppointmentEmployeeId(apt) {
    return apt?.employeeId || apt?.employee_id || null;
}

function getSafeEmployeeColor(empId) {
    const emp = db.employees.find(e => String(e.id) === String(empId));
    if (emp && emp.color) return emp.color;
    // Si no hay empleada o no tiene color, usamos un color neutro de la marca (Violet 400)
    return '#7b52b5'; 
}

function normalizeTimeValue(value) {
    return (value || '').toString().slice(0, 5);
}

function getAppointmentEndTime(apt) {
    return normalizeTimeValue(apt?.endTime || apt?.end_time || '');
}

function minutesBetweenTimes(startTime, endTime) {
    if (!startTime || !endTime) return null;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if ([sh, sm, eh, em].some(Number.isNaN)) return null;
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    return end > start ? end - start : null;
}

function splitNamedItem(rawName, separators) {
    return String(rawName || '')
        .split(separators)
        .map(name => name.trim())
        .filter(Boolean);
}

function normalizeNamedItems(raw, opts = {}) {
    const splitCompositeNames = opts.splitCompositeNames === true;
    const separators = splitCompositeNames ? /\s*\+\s*|\s*,\s*/ : /\s*,\s*/;

    if (!raw) return [];

    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return normalizeNamedItems(parsed, opts);
        } catch {
            return splitNamedItem(raw, separators).map(name => ({ name }));
        }
    }

    if (!Array.isArray(raw)) return [];

    return raw.flatMap(item => {
        if (!item) return [];

        if (typeof item === 'string') {
            return splitNamedItem(item, separators).map(name => ({ name }));
        }

        const name = String(item.name || '').trim();
        if (!name) return [item];

        const names = splitCompositeNames ? splitNamedItem(name, separators) : [name];
        if (names.length <= 1) return [{ ...item, name }];

        return names.map(partName => {
            const normalized = { ...item, name: partName };
            delete normalized.id;
            delete normalized.service_id;
            delete normalized.price;
            delete normalized.total;
            return normalized;
        });
    });
}

function normalizeAppointmentServices(raw) {
    return normalizeNamedItems(raw, { splitCompositeNames: true });
}

function normalizeTransactionProducts(raw) {
    return normalizeNamedItems(raw, { splitCompositeNames: false });
}

function getAppointmentServices(apt) {
    const services = normalizeAppointmentServices(apt?.services);
    if (services.length > 0) return services;
    return apt?.service ? normalizeAppointmentServices(apt.service) : [];
}

function getAppointmentDuration(apt) {
    const explicit = parseInt(apt?.duration || apt?.duration_minutes, 10);
    if (!Number.isNaN(explicit) && explicit > 0) return explicit;

    const startTime = getAppointmentTime(apt);
    const endTime = getAppointmentEndTime(apt);
    const manual = minutesBetweenTimes(startTime, endTime);
    if (manual) return manual;

    const services = getAppointmentServices(apt);
    const summed = services.reduce((total, srvRef) => {
        const srv = db.services.find(s => String(s.id) === String(srvRef.id || srvRef.service_id) || s.name === srvRef.name);
        return total + (parseInt(srv?.duration, 10) || 0);
    }, 0);
    return summed > 0 ? summed : 60;
}

function getProductPrice(product) {
    return parseFloat(product?.price) || 0;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

function getCatalogSearchItems() {
    const services = (db.services || []).map(service => {
        const fixedPrice = service.priceType === 'fijo' || service.price_type === 'fijo';
        const price = parseFloat(service.price);
        const duration = parseInt(service.duration, 10);
        return {
            type: 'Servicio',
            name: service.name || 'Servicio sin nombre',
            priceLabel: fixedPrice && !Number.isNaN(price) ? `$${fmt(price)}` : 'Variable',
            meta: duration ? `${duration} min` : 'Sin duracion',
            search: `${service.name || ''} servicio`
        };
    });

    const products = (db.products || []).map(product => {
        const price = getProductPrice(product);
        const hasStock = product.stock !== null && product.stock !== undefined && product.stock !== '';
        return {
            type: 'Producto',
            name: product.name || 'Producto sin nombre',
            priceLabel: `$${fmt(price)}`,
            meta: hasStock ? `Stock: ${product.stock}` : 'Sin control de stock',
            search: `${product.name || ''} producto`
        };
    });

    return [...services, ...products].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function renderSidebarPriceSearch(query = '') {
    const results = document.getElementById('sidebar-price-search-results');
    if (!results) return;

    const q = String(query || '').trim().toLowerCase();
    if (q.length < 1) {
        results.innerHTML = '<span class="sidebar-price-empty">Escribi para buscar.</span>';
        return;
    }

    const matches = getCatalogSearchItems()
        .filter(item => item.search.toLowerCase().includes(q))
        .slice(0, 8);

    if (matches.length === 0) {
        results.innerHTML = '<span class="sidebar-price-empty">Sin resultados.</span>';
        return;
    }

    results.innerHTML = matches.map(item => `
        <div class="sidebar-price-item">
            <div>
                <div class="sidebar-price-name">${escapeHtml(item.name)}</div>
                <div class="sidebar-price-meta">${escapeHtml(item.type)} · ${escapeHtml(item.meta)}</div>
            </div>
            <div class="sidebar-price-value">${escapeHtml(item.priceLabel)}</div>
        </div>
    `).join('');
}

function initSidebarPriceSearch() {
    const input = document.getElementById('sidebar-price-search-input');
    if (!input || input.dataset.bound === 'true') return;
    input.dataset.bound = 'true';
    input.addEventListener('input', () => renderSidebarPriceSearch(input.value));
    renderSidebarPriceSearch(input.value);
}

function isMissingRemoteTableError(error) {
    const text = [
        error?.code,
        error?.message,
        error?.details,
        error?.hint
    ].filter(Boolean).join(' ');
    return /PGRST205|42P01|schema cache|relation .* does not exist|table .* does not exist/i.test(text);
}

function getTxEmployeeName(tx) {
    if (!tx) return '';
    if (tx.employee) return tx.employee;
    const empId = tx.employee_id || tx.employeeId;
    return db.employees.find(e => String(e.id) === String(empId))?.name || '';
}

function txIsTip(tx) {
    return isTipTransaction(tx);
}

function fmt(n) {
    return Number(n || 0).toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ==========================================
// 0. INICIALIZACIÓN DE EMERGENCIA - VERSIÓN SIMPLIFICADA
// ==========================================
window.db = window.db || {
    transactions: [], clients: [], appointments: [],
    tasks: [], services: [], products: [], employees: [], closures: [], clientFiles: []
};

// Función de inicialización simple que llama a todas las demás
let _violetInitDone = false;
function violetInit() {
    if (_violetInitDone) {
        // Segunda llamada (datos llegaron tarde): solo re-renderizar vistas
        if (typeof initDashboard === 'function') initDashboard();
        if (typeof updateStats === 'function') updateStats();
        return;
    }
    _violetInitDone = true;
    console.log('[VIOLET] violetInit() ejecutado');

    // 0. Sembrar db.employees desde localStorage si está vacío y limpiar duplicados ANTES de poblar selects
    try {
        if (Array.isArray(db.employees) && db.employees.length === 0) {
            const snap = (typeof getLocalDataSnapshot === 'function') ? getLocalDataSnapshot() : {};
            if (Array.isArray(snap.employees) && snap.employees.length > 0) {
                db.employees = snap.employees;
            }
        }
        if (typeof dedupeEmployees === 'function' && db.employees.length > 1) {
            // Dedupe síncrono (sin await): solo procesa locales para evitar parpadeo;
            // dedupe completo (con Supabase) corre tras loadDataFromSupabase
            const before = db.employees.length;
            const groups = new Map();
            db.employees.forEach(emp => {
                if (!emp || !emp.name) return;
                const key = String(emp.name).trim().toLowerCase();
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(emp);
            });
            const keepers = [];
            for (const group of groups.values()) {
                if (group.length === 1) { keepers.push(group[0]); continue; }
                group.sort((a, b) => (String(a.id).startsWith('emp_') ? 1 : 0) - (String(b.id).startsWith('emp_') ? 1 : 0));
                const keeper = group[0];
                group.slice(1).forEach(loser => {
                    keeper.tips = Math.max(parseFloat(keeper.tips) || 0, parseFloat(loser.tips) || 0);
                    keeper.advances = Math.max(parseFloat(keeper.advances) || 0, parseFloat(loser.advances) || 0);
                    keeper.payDay = keeper.payDay || keeper.pay_day || loser.payDay || loser.pay_day || null;
                    keeper.joinDate = keeper.joinDate || keeper.join_date || loser.joinDate || loser.join_date || null;
                });
                keepers.push(keeper);
            }
            if (keepers.length !== before) {
                db.employees = keepers;
                if (typeof persistCollectionLocal === 'function') persistCollectionLocal('employees', keepers);
                console.log(`[VIOLET] Dedupe inicial: ${before} → ${keepers.length} empleadas.`);
            }
        }
    } catch (e) {
        console.warn('[VIOLET] Dedupe inicial falló:', e);
    }

    try {
        // 1. Mostrar fecha
        const sidebarDate = document.getElementById('sidebar-date');
        if (sidebarDate) {
            const now = new Date();
            sidebarDate.textContent = now.toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' });
        }

        // 2. Poblar selects
        if (typeof populateTimeSelects === 'function') populateTimeSelects();
        if (typeof initCustomSelects === 'function') initCustomSelects();

        // 3. Inicializar cada sección
        if (typeof initNavigation === 'function') initNavigation();
        if (typeof initMobileMenu === 'function') initMobileMenu();
        if (typeof initQuickModals === 'function') initQuickModals();

        // 4. Inicializar UI de cada vista
        if (typeof initDashboard === 'function') initDashboard();
        if (typeof initAgenda === 'function') initAgenda();
        if (typeof initPOS === 'function') initPOS();
        if (typeof initCRM === 'function') initCRM();
        if (typeof initAnalytics === 'function') initAnalytics();
        if (typeof initSettings === 'function') initSettings();
        if (typeof initSidebarPriceSearch === 'function') initSidebarPriceSearch();
        if (typeof renderStaffPanel === 'function') renderStaffPanel();
        if (typeof initStaffModals === 'function') initStaffModals();
        if (typeof initAIChat === 'function') initAIChat();
        if (typeof checkBirthdayAlert === 'function') checkBirthdayAlert();

        // 5. Iconos Lucide
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }

        // 6. Forzar dashboard visible
        document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
        const dashboard = document.getElementById('view-dashboard');
        if (dashboard) dashboard.classList.add('active');

        // 7. Forzar nav active
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        const dashLink = document.querySelector('.nav-link[data-view="dashboard"]');
        if (dashLink) dashLink.classList.add('active');

        console.log('[VIOLET] Todo inicializado');
        window.showToast('¡Violet listo!', 'success');

    } catch(e) {
        console.error('[VIOLET] Error en init:', e);
    }
}

// Función global para navegar (para debugging)
window.navigateTo = function(viewId) {
    console.log('[NAV] navigateTo:', viewId);

    // Side links
    document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active'));
    const sideLink = document.querySelector(`.nav-link[data-view="${viewId}"]`);
    if (sideLink) sideLink.classList.add('active');

    // Bottom links
    document.querySelectorAll('.bottom-nav-item').forEach(btn => btn.classList.remove('active'));
    const botLink = document.querySelectorAll(`.bottom-nav-item[data-view="${viewId}"]`);
    if (botLink) botLink.forEach(b => b.classList.add('active'));

    // Views
    document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
    const view = document.getElementById('view-' + viewId);
    if (view) view.classList.add('active');

    // Actualizar header
    window.currentView = viewId;
    if (typeof updateHeaderTitles === 'function') updateHeaderTitles(viewId);
    if (viewId === 'staff' && typeof renderStaffPanel === 'function') renderStaffPanel();
};

// también agregar click listeners directamente
window.addEventListener('DOMContentLoaded', async () => {
    // 1. VERIFICACIÓN DE AUTENTICACIÓN
    if (typeof initializeAuth === 'function') {
        const isAuth = await initializeAuth();
        if (!isAuth) {
            window.location.href = 'index.html';
            return; // Detiene la carga si no está logueado
        }
        watchAuthChanges(); // Para escuchar si la sesión caduca
    }

    // Agregar navegación manual a cada enlace
    document.querySelectorAll('.nav-link[data-view]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = link.getAttribute('data-view');
            window.navigateTo(view);
        });
    });

    document.querySelectorAll('.bottom-nav-item[data-view]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = link.getAttribute('data-view');
            window.navigateTo(view);
        });
    });

    // Forzar inicio después de 2 segundos como máximo (fallback si Supabase tarda)
    const _fallbackTimer = setTimeout(() => violetInit(), 2000);

    // También intentar si Supabase está listo - cancela el fallback para no llamar violetInit() dos veces
    if (window.supabaseClient) {
        loadDataFromSupabase()
            .then(() => { clearTimeout(_fallbackTimer); violetInit(); })
            .catch(() => { clearTimeout(_fallbackTimer); violetInit(); });
    }
});

// ==========================================
// VISIBILIDAD: Restaurar app al volver a la pestaña
// ==========================================
let _visibilityRestoring = false;
document.addEventListener('visibilitychange', async () => {
    if (document.hidden || _visibilityRestoring) return;
    _visibilityRestoring = true;
    console.log('[VIOLET] Pestaña visible de nuevo, verificando estado...');

    // 1. Actualizar fecha del sidebar si cambió de día
    const sidebarDate = document.getElementById('sidebar-date');
    if (sidebarDate) {
        const now = new Date();
        sidebarDate.textContent = now.toLocaleDateString('es-UY', {
            weekday: 'long', day: 'numeric', month: 'long'
        });
    }

    // 2. Verificar sesión de Supabase
    try {
        if (!window.supabaseClient) { _visibilityRestoring = false; return; }
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) {
            console.warn('[VIOLET] Sesión expirada al volver. Redirigiendo...');
            showToast('Tu sesión expiró. Redirigiendo al login...', 'error');
            _visibilityRestoring = false;
            setTimeout(() => { window.location.href = 'index.html'; }, 1500);
            return;
        }

        // 3. Sesión válida: actualizar estado de auth y recargar datos
        setState('auth.session', session);
        setState('auth.user', session.user);
        setState('auth.isAuthenticated', true);
        await loadDataFromSupabase();

        // 4. Re-renderizar la vista activa
        const view = window.currentView || 'dashboard';
        if (view === 'dashboard' && typeof initDashboard === 'function') initDashboard();
        else if (view === 'agenda' && typeof renderAgenda === 'function') {
            const picker = document.getElementById('agenda-date-picker');
            renderAgenda(picker?.value || new Date().toISOString().slice(0, 10));
            if (typeof renderAgendaSidePanel === 'function') renderAgendaSidePanel(picker?.value);
        }
        else if (view === 'caja') {
            if (typeof updateStats === 'function') updateStats();
            if (typeof renderTransactionsTable === 'function') renderTransactionsTable();
        }
        else if (view === 'crm' && typeof renderCRMClientList === 'function') renderCRMClientList();
        else if (view === 'staff' && typeof renderStaffPanel === 'function') renderStaffPanel();

        // 5. Refrescar iconos
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        console.log('[VIOLET] App restaurada correctamente');
    } catch (err) {
        console.error('[VIOLET] Error al restaurar:', err);
    } finally {
        _visibilityRestoring = false;
    }
});

let _isDataLoading = false;
async function loadDataFromSupabase() {
    if (_isDataLoading) {
        console.log('[SYNC] Carga en progreso, ignorando llamada redundante');
        return;
    }
    _isDataLoading = true;
    const client = window.supabaseClient;
    if(!client) {
        showToast('Extensión de Supabase no detectada', 'error');
        _isDataLoading = false;
        return;
    }

    const tables = [
        { name: 'clients', stateKey: 'clients' },
        { name: 'transactions', stateKey: 'transactions', transform: t => ({
            id: t.id,
            date: t.transaction_date || '',
            isIncome: t.is_income,
            amount: parseFloat(t.amount),
            clientName: t.client_name,
            clientId: t.client_id,
            detail: t.detail,
            method: t.method,
            employee: t.employee,
            employeeId: t.employee_id || null,
            products: normalizeTransactionProducts(t.products),
            productTotal: parseFloat(t.product_total) || 0
        })},
        { name: 'appointments', stateKey: 'appointments', transform: a => ({
            ...a,
            date: a.apt_date || a.date,
            time: (a.apt_time || a.time || '').slice(0, 5),
            endTime: normalizeTimeValue(a.end_time || a.endTime || ''),
            duration: a.duration ? parseInt(a.duration, 10) : null,
            clientId: a.client_id,
            clientName: a.client_name,
            serviceId: a.service_id,
            employeeId: a.employee_id || a.employeeId,
            services: normalizeAppointmentServices(a.services)
        })},
        { name: 'tasks', stateKey: 'tasks', order: { col: 'created_at', asc: true } },
        { name: 'services', stateKey: 'services', transform: s => ({
            ...s,
            priceType: s.price_type || 'variable',
            price: parseFloat(s.price) || null,
            duration: s.duration ? parseInt(s.duration) : null
        })},
        { name: 'products', stateKey: 'products', schemaPatch: 'supabase_violet_products_patch.sql', transform: p => ({
            ...p,
            price: parseFloat(p.price) || 0,
            stock: p.stock === null || p.stock === undefined ? null : parseFloat(p.stock)
        })},
        { name: 'employees', stateKey: 'employees', transform: e => ({
            ...e,
            joinDate: e.join_date || null,
            payDay: e.pay_day || null,
            tips: parseFloat(e.tips) || 0,
            advances: parseFloat(e.advances) || 0,
            color: e.color || localStorage.getItem(`violet_emp_color_${e.id}`) || '#7b52b5'
        })},
        { name: 'closures', stateKey: 'closures', order: { col: 'closure_date', asc: false } },
        { name: 'client_files', stateKey: 'clientFiles', transform: f => ({ ...f, clientId: f.client_id }) }
    ];

    let successCount = 0;
    for (const table of tables) {
        try {
            console.log(`📡 Sincronizando: ${table.name}...`);
            const userId = getUserId();
            let query = client.from(table.name).select('*');
            if (userId) query = query.eq('user_id', userId);

            if (table.order) {
                query = query.order(table.order.col, { ascending: table.order.asc });
            }

            let { data, error } = await query;

            if (error && userId && /user_id/i.test(error.message || '')) {
                console.warn(`[SYNC] ${table.name} no tiene user_id. Cargando sin filtro de usuario.`);
                query = client.from(table.name).select('*');
                if (table.order) {
                    query = query.order(table.order.col, { ascending: table.order.asc });
                }
                const retry = await query;
                data = retry.data;
                error = retry.error;
            }

            // NOTA: previamente había un fallback "legacy" que recargaba sin filtro user_id
            // cuando data.length === 0. Se eliminó porque cargaba filas de OTROS user_ids
            // (data leak cross-account) y causaba duplicados visibles en el dropdown.

            if (error) {
                if (table.schemaPatch && isMissingRemoteTableError(error)) {
                    console.warn(`[SYNC] La tabla remota ${table.name} no existe. Ejecutar ${table.schemaPatch} en Supabase. Usando respaldo local si existe.`);
                } else {
                    console.warn(`⚠️ Error en ${table.name}:`, error.message);
                }
                const localRows = getLocalDataSnapshot()[table.stateKey];
                if (Array.isArray(localRows) && localRows.length > 0) {
                    db[table.stateKey] = localRows;
                    state.data = db;
                    successCount++;
                    console.warn(`[LOCAL] ${table.name}: usando ${localRows.length} registros de respaldo local.`);
                }
                continue;
            }

            if (data) {
                // Usa db desde state.js actualizando ahí
                db[table.stateKey] = table.transform ? data.map(table.transform) : data;
                const localRows = getLocalDataSnapshot()[table.stateKey];
                const dedupeByName = ['employees', 'services'].includes(table.name);
                db[table.stateKey] = mergeCloudAndLocalRows(db[table.stateKey], localRows, { dedupeByName });
                state.data = db; // sincroniza alias
                persistCollectionLocal(table.stateKey, db[table.stateKey]);
                console.log(`✅ ${table.name}: ${data.length} registros cargados.`);
                successCount++;
            }
        } catch (err) {
            console.error(`❌ Fallo crítico en ${table.name}:`, err);
        }
    }

    if (successCount > 0) {
        console.log('[SYNC] Sincronización finalizada. Llamando a inicializadores...');
        // Limpiar duplicados de empleadas que puedan haber quedado por bugs previos
        try { if (typeof dedupeEmployees === 'function') await dedupeEmployees({ silent: true }); } catch (_) {}
        
        if (typeof initDashboard === 'function') {
            console.log('[SYNC] Inicializando Dashboard...');
            initDashboard();
        } else {
            console.warn('[SYNC] initDashboard no encontrada! Verifique que pos.dashboard.js cargó correctamente.');
        }
        if (typeof renderServicesList === 'function') renderServicesList();
        if (typeof renderProductsList === 'function') renderProductsList();
        if (typeof renderEmployeesList === 'function') renderEmployeesList();
        if (typeof updateFormSelects === 'function') updateFormSelects();
        if (typeof renderSidebarPriceSearch === 'function') {
            renderSidebarPriceSearch(document.getElementById('sidebar-price-search-input')?.value || '');
        }
        if (typeof renderStaffPanel === 'function') renderStaffPanel();
        if (typeof initAgendaHandlers === 'function') initAgendaHandlers();
        if (typeof initDashboard === 'function') initDashboard();
        if (typeof currentView !== 'undefined' && currentView === 'caja') {
            if (typeof updateStats === 'function') updateStats();
            if (typeof renderTransactionsTable === 'function') renderTransactionsTable();
        }
    } else {
        console.error("No se pudo cargar ninguna tabla. Revisa las políticas de RLS en Supabase o si los datos tienen el user_id correcto.");
        showToast('Sin acceso a datos en la nube', 'error');
    }
    _isDataLoading = false;
}

// Ya no usamos saveData global porque gestionamos todo en la nube
async function saveData() {
    console.warn("saveData() global desactivado.");
}

const LOCAL_DATA_KEY = 'violet_pos_local_data';

function getLocalDataSnapshot() {
    try {
        return JSON.parse(localStorage.getItem(LOCAL_DATA_KEY) || '{}');
    } catch (err) {
        console.warn('[LOCAL] No se pudo leer respaldo local:', err);
        return {};
    }
}

function saveLocalDataSnapshot(snapshot) {
    try {
        localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(snapshot));
    } catch (err) {
        console.warn('[LOCAL] No se pudo guardar respaldo local:', err);
    }
}

function persistCollectionLocal(collection, records) {
    const snapshot = getLocalDataSnapshot();
    snapshot[collection] = records || [];
    saveLocalDataSnapshot(snapshot);
}

function mergeCloudAndLocalRows(cloudRows, localRows, opts = {}) {
    const merged = Array.isArray(cloudRows) ? [...cloudRows] : [];
    if (!Array.isArray(localRows)) return merged;
    const dedupeByName = opts.dedupeByName === true;
    localRows.forEach(localRow => {
        if (!localRow || localRow.deleted) return;
        const existsById = merged.some(cloudRow => String(cloudRow.id) === String(localRow.id));
        if (existsById) return;
        // Para colecciones con nombres únicos (employees, services), si ya existe una fila
        // cloud con el mismo nombre, no agregar el local — es duplicado por ID stale.
        if (dedupeByName && localRow.name) {
            const localName = String(localRow.name).trim().toLowerCase();
            const sameName = merged.some(c => c && c.name && String(c.name).trim().toLowerCase() === localName);
            if (sameName) return;
        }
        merged.push(localRow);
    });
    return merged;
}

function createLocalId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isTipTransaction(t) {
    const detail = (t?.detail || '').toLowerCase();
    return detail.includes('propina');
}

function upsertLocalCollectionItem(collection, item) {
    const arr = Array.isArray(db[collection]) ? db[collection] : [];
    const idx = arr.findIndex(x => String(x.id) === String(item.id));
    if (idx >= 0) arr[idx] = item;
    else arr.push(item);
    db[collection] = arr;
    state.data = db;
    persistCollectionLocal(collection, arr);
}

function addDaysToDateString(dateStr, days) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getAppointmentRepeatDates(firstDate) {
    const repeat = document.getElementById('apt-repeat')?.value || 'none';
    if (repeat === 'none' || editingAppointmentId) return [firstDate];

    let days, count;

    if (repeat === 'weekly') {
        days = 7;
        count = 52; // Indefinido: 1 año
    } else if (repeat === 'biweekly') {
        days = 14;
        count = 26; // Indefinido: 1 año
    } else {
        // Variable: el usuario elige cada cuántos días
        days = Math.min(Math.max(parseInt(document.getElementById('apt-repeat-days')?.value, 10) || 7, 1), 365);
        const userCount = parseInt(document.getElementById('apt-repeat-count')?.value, 10);
        // Si no pone cantidad, se toma como indefinido (calcula cuántas citas caben en 1 año)
        count = (userCount && userCount >= 2) ? Math.min(userCount, 52) : Math.max(Math.floor(365 / days), 2);
    }

    return Array.from({ length: count }, (_, idx) => addDaysToDateString(firstDate, idx * days));
}

// Helper reutilizable para subir foto de cliente
async function uploadClientPhoto(file, clientId) {
    showToast('Subiendo foto...', 'info');
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const filePath = `clients/${clientId}_${Date.now()}.${ext}`;

    const savePhotoLocally = (dataUrl) => {
        try {
            localStorage.setItem(`violet_photo_${clientId}`, dataUrl);
        } catch(e) {
            console.warn('localStorage lleno para foto:', e);
        }
        const c = db.clients.find(x => x.id == clientId);
        if (c) c.photo_url = dataUrl;
        const img = document.getElementById('crm-profile-photo');
        const initials = document.getElementById('cm-initials');
        if (img) { img.src = dataUrl; img.classList.remove('hidden'); }
        if (initials) initials.classList.add('hidden');
        showToast('Foto guardada localmente en este dispositivo');
    };

    try {
        const { error: upErr } = await window.supabaseClient.storage
            .from('client-photos')
            .upload(filePath, file, { upsert: true, contentType: file.type });
        if (upErr) {
            // Fallback base64
            const reader = new FileReader();
            reader.onload = (ev) => savePhotoLocally(ev.target.result);
            reader.readAsDataURL(file);
            return;
        }
        const { data: urlData } = window.supabaseClient.storage.from('client-photos').getPublicUrl(filePath);
        const photoUrl = urlData?.publicUrl;
        if (!photoUrl) { showToast('No se pudo obtener URL pública', 'error'); return; }

        const { error: dbErr } = await updateClientSafe(clientId, { photo_url: photoUrl });
        if (dbErr) {
            const reader = new FileReader();
            reader.onload = (ev) => savePhotoLocally(ev.target.result);
            reader.readAsDataURL(file);
            return;
        }

        const c = db.clients.find(x => x.id == clientId);
        if (c) c.photo_url = photoUrl;
        const img = document.getElementById('crm-profile-photo');
        const initials = document.getElementById('cm-initials');
        if (img) { img.src = photoUrl; img.classList.remove('hidden'); }
        if (initials) initials.classList.add('hidden');
        showToast('Foto actualizada');
    } catch (err) {
        console.error(err);
        showToast('Error inesperado: ' + err.message, 'error');
    }
}

function refreshIcons() {
    setTimeout(() => lucide.createIcons(), 10);
}

function getBusinessHoursForDate(dateStr) {
    const cfg = getBusinessConfig();
    const [y, m, d] = (dateStr || '').split('-').map(n => parseInt(n));
    const dateObj = new Date(y, (m || 1) - 1, d || 1);
    const dow = dateObj.getDay();
    const dayCfg = cfg.weeklyHours && cfg.weeklyHours[String(dow)];
    const closed = Boolean(dayCfg?.closed) || (cfg.closedDays || []).includes(dow);
    return {
        dow,
        closed,
        openTime: dayCfg?.open || cfg.openTime || '09:00',
        closeTime: dayCfg?.close || cfg.closeTime || '20:00'
    };
}

// La configuración del negocio ahora se maneja en pos.config.js


// Devuelve array de strings con los problemas que tiene el turno propuesto
function checkAppointmentConflicts(dateStr, timeStr, employeeId = null) {
    const cfg = getBusinessConfig();
    const hours = getBusinessHoursForDate(dateStr);
    const warnings = [];
    if (!dateStr || !timeStr) return warnings;

    // Día cerrado
    const [y, m, d] = dateStr.split('-').map(n => parseInt(n));
    const dateObj = new Date(y, m - 1, d);
    const dow = dateObj.getDay(); // 0=Dom, 6=Sab
    const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    if (hours.closed) {
        warnings.push(`El negocio está cerrado los ${dayNames[dow]}.`);
    }

    // Fuera de horario
    if (hours.openTime && timeStr < hours.openTime) {
        warnings.push(`El horario de apertura es ${hours.openTime}.`);
    }
    if (hours.closeTime && timeStr >= hours.closeTime) {
        warnings.push(`El horario de cierre es ${hours.closeTime}.`);
    }

    // Turnos bloqueados — filtrar por scope (general o empleada específica)
    (cfg.blockedSlots || []).forEach(b => {
        if (b.date !== dateStr) return;
        if (timeStr < b.start || timeStr >= b.end) return;
        // Si el bloqueo es de una empleada específica y la cita es de otra (o ninguna), no aplica
        if (b.employeeId && employeeId && String(b.employeeId) !== String(employeeId)) return;
        const emp = b.employeeId ? db.employees.find(e => e.id == b.employeeId) : null;
        const scope = emp ? ` (${emp.name})` : ' (local)';
        warnings.push(`Franja bloqueada: ${b.start} - ${b.end}${scope}${b.reason ? ' · ' + b.reason : ''}.`);
    });

    return warnings;
}

// ==========================================
// 3. NAVEGACIÓN
// ==========================================
function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link[data-view]');
    const bottomItems = document.querySelectorAll('.bottom-nav-item[data-view]');

    function navigateTo(viewId) {
        navLinks.forEach(btn => btn.classList.remove('active'));
        bottomItems.forEach(btn => btn.classList.remove('active'));

        const sideLink = document.querySelector(`.nav-link[data-view="${viewId}"]`);
        const botLink  = document.querySelector(`.bottom-nav-item[data-view="${viewId}"]`);
        if (sideLink) sideLink.classList.add('active');
        if (botLink)  botLink.classList.add('active');

        document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
        const targetView = document.getElementById(`view-${viewId}`);
        if (targetView) targetView.classList.add('active');

        currentView = viewId;
        updateHeaderTitles(viewId);

        if (viewId === 'dashboard') initDashboard();
        else if (viewId === 'caja') { updateStats(); renderTransactionsTable(); }
        else if (viewId === 'clients') renderClientsTable();
        else if (viewId === 'staff') renderStaffPanel();
        else if (viewId === 'agenda') {
            const picker = document.getElementById('agenda-date-picker');
            if (typeof renderAgenda === 'function') renderAgenda(picker?.value);
            else if (typeof renderAgendaMonth === 'function') renderAgendaMonth();
        }
        else if (viewId === 'analytics') {
            // El tab activo por defecto es "Historial de Cierres". Renderizamos
            // ambos contenidos (cierres + stats) y dejamos visible el activo.
            if (typeof renderClosuresHistory === 'function') renderClosuresHistory();
            updateCharts();
        }
    }

    // Botón cerrar sesión
    const closeBtn = document.getElementById('btn-close-register');
    if (closeBtn) {
        closeBtn.addEventListener('click', async () => {
            const ok = await showCustomConfirm('¿Cerrar sesión?', { title: 'Cerrar sesión', confirmText: 'Cerrar sesión' });
            if (ok) {
                await window.supabaseClient.auth.signOut();
                resetState();
                window.location.href = 'index.html';
            }
        });
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(link.getAttribute('data-view'));
        });
    });

    bottomItems.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(link.getAttribute('data-view'));
        });
    });
}

function updateHeaderTitles(viewId) {
    const title = document.getElementById('page-title');
    const subtitle = document.getElementById('page-subtitle');
    const titles = {
        'dashboard': { t: 'Bienvenida, Patricia', s: 'Este es el resumen de tu negocio para el día de hoy.' },
        'agenda': { t: 'Agenda de Citas', s: 'Gestiona los turnos programados del salón.' },
        'caja': { t: 'Caja y Finanzas', s: 'Registra y controla los movimientos del día.' },
        'clients': { t: 'Directorio de Clientas', s: 'Base de datos y perfiles individuales.' },
        'staff': { t: 'Panel de Staff', s: 'Gestiona funcionarias, propinas, adelantos y bloqueos.' },
        'analytics': { t: 'Analíticas del Negocio', s: 'Métricas clave de rendimiento.' },
        'settings': { t: 'Configuración', s: 'Ajustes del sistema y usuarios.' }
    };
    if (titles[viewId]) {
        title.textContent = titles[viewId].t;
        subtitle.textContent = titles[viewId].s;
    }
}

let _mobileMenuInitialized = false;
function initMobileMenu() {
    if (_mobileMenuInitialized) return;
    _mobileMenuInitialized = true;

    const btn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if(btn && sidebar && overlay) {
        btn.addEventListener('click', () => { sidebar.classList.add('open'); overlay.classList.add('active'); });
        overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('active'); });
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('active'); });
        });
    }
}

// ==========================================
// 4. CUSTOM SELECTS (Componentes UI Premium)
// ==========================================
function populateTimeSelects() {
    const cfg = typeof getBusinessConfig === 'function' ? getBusinessConfig() : null;
    const use12h = cfg && cfg.timeFormat === '12h';
    
    document.querySelectorAll('.time-select').forEach(select => {
        // Guardar el valor actual si existiese en el select para restaurarlo después
        const currentVal = select.value;
        const existingPlaceholder = select.querySelector('option[value=""]');
        
        select.innerHTML = '';
        if (existingPlaceholder) {
            select.appendChild(existingPlaceholder);
        } else {
            const defaultPlaceholder = document.createElement('option');
            defaultPlaceholder.value = '';
            defaultPlaceholder.textContent = '--:--';
            select.appendChild(defaultPlaceholder);
        }
        
        for (let h = 0; h < 24; h++) {
            for (let m = 0; m < 60; m += 15) {
                const hh = h.toString().padStart(2, '0');
                const mm = m.toString().padStart(2, '0');
                const timeValue = `${hh}:${mm}`;
                
                const option = document.createElement('option');
                option.value = timeValue;
                
                let timeText = timeValue;
                if (use12h) {
                    const ampm = h >= 12 ? 'PM' : 'AM';
                    let h12 = h % 12;
                    h12 = h12 ? h12 : 12;
                    timeText = `${h12.toString().padStart(2, '0')}:${mm} ${ampm}`;
                }
                
                option.textContent = timeText;
                select.appendChild(option);
            }
        }
        
        // Restaurar el valor si correspondía a una opción válida
        if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
            select.value = currentVal;
        }
    });

    const aptTimeOptions = document.getElementById('apt-time-options');
    if (aptTimeOptions) {
        aptTimeOptions.innerHTML = '';
        for (let h = 0; h < 24; h++) {
            for (let m = 0; m < 60; m += 15) {
                const hh = h.toString().padStart(2, '0');
                const mm = m.toString().padStart(2, '0');
                const option = document.createElement('option');
                option.value = `${hh}:${mm}`;
                aptTimeOptions.appendChild(option);
            }
        }
    }
}
function initCustomSelects() {
    const selects = document.querySelectorAll('.custom-select');
    
    // Check if custom selects are already built, if so wait or clear wrappers
    document.querySelectorAll('.custom-select-wrapper').forEach(w => w.remove());

    selects.forEach(select => {
        // Crear wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-wrapper' + (select.classList.contains('time-select') ? ' time-select-wrapper' : '');
        
        // Crear trigger
        const trigger = document.createElement('div');
        trigger.className = 'custom-select-trigger';
        const selectedOption = select.options[select.selectedIndex];
        trigger.innerHTML = `<span>${selectedOption ? selectedOption.text : 'Seleccione...'}</span> 
                             <svg class="chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
        
        // Crear opciones
        const optionsList = document.createElement('div');
        optionsList.className = 'custom-options';
        
        Array.from(select.options).forEach((opt, idx) => {
            if(opt.style.display === 'none') return; // ignore hidden placeholder
            const optionDiv = document.createElement('div');
            optionDiv.className = `custom-option ${select.selectedIndex === idx ? 'selected' : ''}`;
            optionDiv.textContent = opt.text;
            optionDiv.dataset.value = opt.value;
            
            optionDiv.addEventListener('click', () => {
                select.value = opt.value;
                select.dispatchEvent(new Event('change')); // Disparar change native
                
                trigger.querySelector('span').textContent = opt.text;
                
                optionsList.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
                optionDiv.classList.add('selected');
                
                wrapper.classList.remove('open');
            });
            optionsList.appendChild(optionDiv);
        });
        
        wrapper.appendChild(trigger);
        wrapper.appendChild(optionsList);
        select.parentNode.appendChild(wrapper);
        
        // Eventos abrir/cerrar
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.custom-select-wrapper').forEach(w => {
                if(w !== wrapper) w.classList.remove('open');
            });
            wrapper.classList.toggle('open');
        });
    });
    
    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-select-wrapper').forEach(w => w.classList.remove('open'));
    });
}

// Las funciones de renderizado del dashboard se han movido a pos.dashboard.js


// ==========================================
// 6. AGENDA (CALENDARIO)
// ==========================================
let _agendaInitialized = false;
function initAgenda() {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    if (!_agendaInitialized) {
        _agendaInitialized = true;

        // Iniciar Modal de Agendar
        document.getElementById('btn-new-appointment').onclick = openAgendarModal;
        document.getElementById('modal-apt-close').onclick = closeAgendarModal;

        // Configurar Date Picker Agenda principal (default hoy)
        const picker = document.getElementById('agenda-date-picker');
        picker.value = todayStr;

        picker.addEventListener('change', () => {
            renderAgenda(picker.value);
            // Sincronizar mes si estamos en vista mes
            const [y, m] = picker.value.split('-').map(n => parseInt(n));
            agendaMonthState.year = y;
            agendaMonthState.month = m - 1;
            agendaMonthState.selectedDate = picker.value;
            if (!document.getElementById('agenda-month-view').classList.contains('hidden')) {
                renderAgendaMonth();
            }
        });

        // Tabs Día/Mes
        document.querySelectorAll('.agenda-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.agenda-tab-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'transparent';
                    b.style.color = 'var(--text-dim)';
                });
                btn.classList.add('active');
                btn.style.background = 'var(--violet-600)';
                btn.style.color = '#fff';
                const view = btn.dataset.view;
                const dayView = document.getElementById('agenda-day-view');
                const monthView = document.getElementById('agenda-month-view');
                const picker = document.getElementById('agenda-date-picker');
                if (view === 'month') {
                    dayView.classList.add('hidden');
                    monthView.classList.remove('hidden');
                    const [y, m] = picker.value.split('-').map(n => parseInt(n));
                    agendaMonthState.year = y;
                    agendaMonthState.month = m - 1;
                    agendaMonthState.selectedDate = picker.value;
                    renderAgendaMonth();
                } else {
                    dayView.classList.remove('hidden');
                    monthView.classList.add('hidden');
                    renderAgenda(picker.value);
                }
            });
        });

        document.getElementById('agenda-prev-month').addEventListener('click', () => {
            agendaMonthState.month--;
            if (agendaMonthState.month < 0) { agendaMonthState.month = 11; agendaMonthState.year--; }
            renderAgendaMonth();
        });
        document.getElementById('agenda-next-month').addEventListener('click', () => {
            agendaMonthState.month++;
            if (agendaMonthState.month > 11) { agendaMonthState.month = 0; agendaMonthState.year++; }
            renderAgendaMonth();
        });

        // Autocomplete en modal
        initAptClientAutocomplete();

        // Cuando se elige un servicio en la agenda, si no tiene duración definida, pedir via modal
        document.getElementById('apt-service').addEventListener('change', addAppointmentServiceFromSelect);

        // Botón "+ Nuevo servicio" dentro del modal de agenda
        const btnAptSrv = document.getElementById('btn-apt-quick-service');
        if (btnAptSrv) {
            btnAptSrv.addEventListener('click', () => {
                document.getElementById('qs-name').value = '';
                document.getElementById('qs-price').value = '';
                document.getElementById('modal-quick-service').classList.add('open');
                refreshIcons();
            });
        }

        // Guardar Cita
        document.getElementById('appointment-form').onsubmit = (e) => {
            e.preventDefault();
            saveAppointment();
        };

        const repeatSelect = document.getElementById('apt-repeat');
        const repeatCustomWrap = document.getElementById('apt-repeat-custom-wrap');
        const repeatCountInput = document.getElementById('apt-repeat-count');
        if (repeatSelect && repeatCustomWrap) {
            repeatSelect.addEventListener('change', () => {
                const val = repeatSelect.value;
                const isVariable = val === 'custom';

                // Mostrar campo de cantidad SOLO para Variable
                const countWrap = document.getElementById('apt-repeat-count-wrap');
                if (countWrap) countWrap.classList.toggle('hidden', !isVariable);

                // Mostrar/ocultar campo de días custom
                repeatCustomWrap.classList.toggle('hidden', !isVariable);

                // Mostrar info de "indefinido" para semanal/quincenal
                const infoWrap = document.getElementById('apt-repeat-info');
                const infoText = document.getElementById('apt-repeat-info-text');
                if (infoWrap) {
                    const showInfo = val === 'weekly' || val === 'biweekly';
                    infoWrap.classList.toggle('hidden', !showInfo);
                    if (infoText) {
                        infoText.textContent = val === 'weekly'
                            ? 'Se agendarán citas semanales de forma indefinida (1 año)'
                            : 'Se agendarán citas quincenales de forma indefinida (1 año)';
                    }
                }

                // Reset count field
                if (repeatCountInput) {
                    repeatCountInput.disabled = !isVariable;
                    repeatCountInput.value = '';
                }
            });
        }
    }

    renderAgenda(todayStr);
}

function openAgendarModal(preselectedDate = null, preselectedTime = null) {
    // Si preselectedDate es un evento (ej. click), ignorarlo
    if (preselectedDate && typeof preselectedDate !== 'string') {
        preselectedDate = null;
    }
    
    document.getElementById('modal-appointment').classList.add('open');
    appointmentSelectedServiceIds = [];
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const dateInput = document.getElementById('apt-date');
    dateInput.value = preselectedDate || agendaMonthState.selectedDate || todayStr;
    dateInput.setAttribute('min', todayStr); // Bloquea fechas pasadas
    
    const timeInput = document.getElementById('apt-time');
    if (timeInput) {
        console.log(`[Agenda] Abriendo modal para: ${preselectedDate || todayStr} ${preselectedTime || 'Sin hora'}`);
        timeInput.value = preselectedTime || '';
        syncCustomSelect('apt-time');
        
        // Debug: Verificar si el valor se aplicó correctamente
        if (preselectedTime && timeInput.value !== preselectedTime) {
            console.warn(`[Agenda] No se pudo establecer la hora ${preselectedTime}. ¿Existe en el select?`);
        }
    }
    
    // Asegurar que el select de servicio esté sincronizado visualmente
    const aptSel = document.getElementById('apt-service');
    if (aptSel) {
        aptSel.value = '';
        syncCustomSelect('apt-service');
    }
    renderAppointmentServiceSelection();
    const repeatSel = document.getElementById('apt-repeat');
    if (repeatSel) { repeatSel.value = 'none'; syncCustomSelect('apt-repeat'); }
    const repeatCount = document.getElementById('apt-repeat-count');
    if (repeatCount) { repeatCount.value = ''; repeatCount.disabled = true; }
    const repeatCountWrap = document.getElementById('apt-repeat-count-wrap');
    if (repeatCountWrap) repeatCountWrap.classList.add('hidden');
    const repeatCustom = document.getElementById('apt-repeat-custom-wrap');
    if (repeatCustom) repeatCustom.classList.add('hidden');
    const repeatInfo = document.getElementById('apt-repeat-info');
    if (repeatInfo) repeatInfo.classList.add('hidden');
}
function closeAgendarModal() {
    document.getElementById('modal-appointment').classList.remove('open');
    document.getElementById('appointment-form').reset();
    document.getElementById('apt-client-alert').classList.add('hidden');
    aptCurrentClient = null;
    editingAppointmentId = null;
    // Liberar reserva temporal si la había (usuario canceló)
    const wasTempDate = window.tempSlotReservation?.date;
    window.tempSlotReservation = null;
    if (wasTempDate && document.getElementById('agenda-side-content')) {
        renderAgendaSidePanel(wasTempDate);
    }
    // Reset visual del custom select de servicio
    const aptSel = document.getElementById('apt-service');
    if (aptSel) { aptSel.value = ''; syncCustomSelect('apt-service'); }
    appointmentSelectedServiceIds = [];
    renderAppointmentServiceSelection();
    // Restaurar título del modal
    const title = document.getElementById('apt-modal-title');
    if (title) title.textContent = 'Agendar Cita';
}

let editingAppointmentId = null;

async function editAppointment(id) {
    const apt = db.appointments.find(a => String(a.id) === String(id));
    if (!apt) return;
    editingAppointmentId = id;
    openAgendarModal(getAppointmentDate(apt), getAppointmentTime(apt));
    document.getElementById('apt-client-name').value = apt.clientName || apt.client_name || '';
    aptCurrentClient = db.clients.find(c => c.id == apt.clientId) || null;
    const aptSrv = document.getElementById('apt-service');
    const serviceRefs = getAppointmentServices(apt);
    appointmentSelectedServiceIds = serviceRefs
        .map(ref => db.services.find(s => String(s.id) === String(ref.id || ref.service_id) || s.name === ref.name)?.id)
        .filter(Boolean);
    if (aptSrv) { aptSrv.value = ''; syncCustomSelect('apt-service'); }
    renderAppointmentServiceSelection();
    const endInput = document.getElementById('apt-end-time');
    if (endInput) endInput.value = getAppointmentEndTime(apt);
    document.getElementById('apt-notes').value = apt.notes || '';
    const aptEmp = document.getElementById('apt-employee');
    const aptEmpId = getAppointmentEmployeeId(apt);
    if (aptEmp && aptEmpId) { aptEmp.value = aptEmpId; syncCustomSelect('apt-employee'); }
    const title = document.getElementById('apt-modal-title');
    if (title) title.textContent = 'Editar Cita';
}

function openAppointmentDetail(apt) {
    if (apt && apt.id) {
        editAppointment(apt.id);
    }
}

function initAptClientAutocomplete() {
    const input = document.getElementById('apt-client-name');
    const dropdown = document.getElementById('apt-client-dropdown');
    const alertBox = document.getElementById('apt-client-alert');

    input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        dropdown.innerHTML = '';
        aptCurrentClient = null;
        alertBox.classList.add('hidden');
        
        if (query.length < 2) { dropdown.style.display = 'none'; return; }

        const matches = db.clients.filter(c => c.name.toLowerCase().includes(query) || (c.phone && c.phone.includes(query)));

        dropdown.style.display = 'block';
        matches.forEach(client => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.innerHTML = `<span class="ac-name">${client.name}</span><span class="ac-phone">${client.phone || ''}</span>`;
            div.addEventListener('click', () => {
                input.value = client.name;
                aptCurrentClient = client;
                dropdown.style.display = 'none';

                // Alerta de saldos y notas en Agenda
                let html = '';
                if (client.balance > 0) html += `<div class="badge badge-border" style="color:var(--info); border-color:var(--info)">Seña a favor: $${client.balance}</div> `;
                if (client.debt > 0) html += `<div class="badge badge-border" style="color:var(--danger); border-color:var(--danger)">Deuda pendiente: $${client.debt}</div>`;
                
                // Mostrar notas de citas anteriores
                const prevNotes = getClientAppointmentNotes(client.id);
                if (prevNotes.length > 0) {
                    const notesHtml = prevNotes.slice(0, 3).map(n =>
                        `<div style="font-size:.78rem;color:var(--text-dim);padding:4px 8px;background:rgba(0,0,0,0.2);border-radius:4px;border-left:2px solid var(--violet-400);">${n}</div>`
                    ).join('');
                    html += `<div style="margin-top:.6rem;"><div style="font-size:.7rem;text-transform:uppercase;color:var(--text-dim);letter-spacing:.5px;margin-bottom:4px;">📋 Notas anteriores</div>${notesHtml}</div>`;
                }

                if (html !== '') {
                    alertBox.innerHTML = html;
                    alertBox.classList.remove('hidden');
                } else {
                    alertBox.innerHTML = '';
                    alertBox.classList.add('hidden');
                }
            });
            dropdown.appendChild(div);
        });

        // Siempre ofrecer opción de crear nueva clienta con el texto ingresado
        const typedName = e.target.value.trim();
        const createDiv = document.createElement('div');
        createDiv.className = 'autocomplete-item';
        createDiv.style.cssText = 'color:var(--violet-300); font-weight:600; border-top:1px solid var(--border)';
        createDiv.innerHTML = `<span class="ac-name">+ Crear nueva clienta "${typedName}"</span>`;
        createDiv.addEventListener('click', () => {
            dropdown.style.display = 'none';
            // Abrir modal de clienta con nombre pre-cargado, luego volver a la agenda
            _pendingAptClientName = typedName;
            _reopenAgendaAfterSave = true;
            openClientModal(); // abre vacío
            document.getElementById('cm-name').value = typedName;
            // Callback: cuando se guarde la clienta, setearla en aptCurrentClient y mostrar badge
            _clientModalSavedCallback = (newClient) => {
                aptCurrentClient = newClient;
                input.value = newClient.name;
                alertBox.classList.remove('hidden');
                alertBox.innerHTML = `<div class="badge badge-border" style="color:var(--success);border-color:var(--success)">✓ Clienta creada: ${newClient.name}</div>`;
                _pendingAptClientName = null;
            };
        });
        dropdown.appendChild(createDiv);
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) dropdown.style.display = 'none';
    });
}

function getSelectedAppointmentServices() {
    return appointmentSelectedServiceIds
        .map(id => db.services.find(s => String(s.id) === String(id)))
        .filter(Boolean);
}

function addAppointmentServiceFromSelect() {
    const select = document.getElementById('apt-service');
    const serviceId = select?.value;
    const service = db.services.find(s => String(s.id) === String(serviceId));
    if (!service) return;

    if (!appointmentSelectedServiceIds.some(id => String(id) === String(service.id))) {
        appointmentSelectedServiceIds.push(service.id);
    }

    select.value = '';
    syncCustomSelect('apt-service');
    renderAppointmentServiceSelection();
    if (appointmentSelectedServiceIds.length === 1 && !service.duration) openServiceDurationModal(service);
}

function removeAppointmentService(serviceId) {
    appointmentSelectedServiceIds = appointmentSelectedServiceIds.filter(id => String(id) !== String(serviceId));
    renderAppointmentServiceSelection();
}

function formatServiceSelectionLabel(service) {
    const duration = parseInt(service?.duration, 10);
    return `${service?.name || 'Servicio'}${duration ? ` (${duration} min)` : ''}`;
}

function renderAppointmentServiceSelection() {
    const list = document.getElementById('apt-selected-services');
    const manualWrap = document.getElementById('apt-manual-window');
    const endInput = document.getElementById('apt-end-time');
    if (!list) return;

    const selected = getSelectedAppointmentServices();
    if (selected.length === 0) {
        list.innerHTML = '<span style="color:var(--text-dim);font-size:0.82rem">Sin servicios agregados.</span>';
    } else {
        list.innerHTML = selected.map(service => `
            <div class="apt-service-chip">
                <span>${formatServiceSelectionLabel(service)}</span>
                <button type="button" class="btn-icon btn-remove-apt-service" data-id="${service.id}"><i data-lucide="x"></i></button>
            </div>
        `).join('');
    }

    const needsManualWindow = selected.length > 1;
    if (manualWrap) manualWrap.classList.toggle('hidden', !needsManualWindow);
    if (!needsManualWindow && endInput) endInput.value = '';

    list.querySelectorAll('.btn-remove-apt-service').forEach(btn => {
        btn.onclick = () => removeAppointmentService(btn.dataset.id);
    });
    refreshIcons();
}

function addMinutesToTime(time, minutes) {
    const [h, m] = time.split(':').map(Number);
    if ([h, m].some(Number.isNaN)) return '';
    const total = h * 60 + m + minutes;
    const hh = Math.floor((total % (24 * 60)) / 60);
    const mm = total % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function timeToMinutes(time) {
    const [h, m] = String(time || '').slice(0, 5).split(':').map(Number);
    return [h, m].some(Number.isNaN) ? null : h * 60 + m;
}

function minutesToTime(totalMinutes) {
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function getSlotAvailability({ minute, appointments, blocks, activeEmployees }) {
    const employees = Array.isArray(activeEmployees) ? activeEmployees : [];
    const maxConcurrent = employees.length > 0 ? employees.length : 1;
    const busyEmpIds = [];
    let totalBusyCount = 0;

    const isGlobalBlock = (blocks || []).some(block => {
        const blockStart = timeToMinutes(block.start || block.startTime || block.start_time);
        const blockEnd = timeToMinutes(block.end || block.endTime || block.end_time);
        if (blockStart === null || blockEnd === null) return false;
        const inBlock = minute >= blockStart && minute < blockEnd;
        return inBlock && !(block.employeeId || block.employee_id);
    });
    if (isGlobalBlock) {
        return { available: false, busyEmpIds, availableEmployees: [], totalBusyCount, effectiveCapacity: 0 };
    }

    const blockedEmpIds = new Set();
    (blocks || []).forEach(block => {
        const blockStart = timeToMinutes(block.start || block.startTime || block.start_time);
        const blockEnd = timeToMinutes(block.end || block.endTime || block.end_time);
        if (blockStart === null || blockEnd === null) return;
        if (minute >= blockStart && minute < blockEnd) {
            const empId = block.employeeId || block.employee_id;
            if (empId) blockedEmpIds.add(String(empId));
        }
    });

    (appointments || []).forEach(appointment => {
        const start = timeToMinutes(getAppointmentTime(appointment));
        if (start === null) return;
        const end = start + getAppointmentDuration(appointment);
        if (minute >= start && minute < end) {
            totalBusyCount++;
            const empId = getAppointmentEmployeeId(appointment);
            if (empId) busyEmpIds.push(String(empId));
        }
    });

    const effectiveCapacity = Math.max(0, maxConcurrent - blockedEmpIds.size);
    const unavailableIds = new Set([...busyEmpIds, ...blockedEmpIds]);
    const availableEmployees = employees.filter(emp => !unavailableIds.has(String(emp.id)));

    return {
        available: totalBusyCount < effectiveCapacity,
        busyEmpIds,
        availableEmployees,
        totalBusyCount,
        effectiveCapacity
    };
}

function appointmentOverlapsBlockedSlot(dateStr, startMinutes, endMinutes, employeeId) {
    const cfg = getBusinessConfig();
    return (cfg.blockedSlots || []).some(block => {
        if (block.date !== dateStr) return false;
        const blockStart = timeToMinutes(block.start || block.startTime || block.start_time);
        const blockEnd = timeToMinutes(block.end || block.endTime || block.end_time);
        if (blockStart === null || blockEnd === null) return false;
        const blockEmployeeId = block.employeeId || block.employee_id || null;
        const appliesToAppointment = !blockEmployeeId || !employeeId || String(blockEmployeeId) === String(employeeId);
        return appliesToAppointment && startMinutes < blockEnd && endMinutes > blockStart;
    });
}

function shouldSaveAppointmentLocally(error) {
    if (!window.supabaseClient) return true;
    const text = String(error?.message || error?.name || '').toLowerCase();
    return text.includes('failed to fetch') || text.includes('network') || text.includes('timeout');
}

function buildLocalAppointmentRow(row, forcedId = null) {
    return {
        ...row,
        id: forcedId || createLocalId('apt'),
        date: row.apt_date,
        time: row.apt_time,
        clientId: row.client_id,
        clientName: row.client_name,
        employeeId: row.employee_id,
        services: row.services,
        duration: row.duration,
        endTime: row.end_time,
        pendingSync: true
    };
}

function showAppointmentSaveError(error) {
    console.error('[Cita] Error al guardar en Supabase:', error);
    const msg = error?.message || 'Error desconocido';
    showToast('No se guardo la cita: ' + msg, 'error');
}

async function saveAppointment() {
    const nameInput = document.getElementById('apt-client-name').value.trim();
    const dateInput = document.getElementById('apt-date').value;
    const timeInput = document.getElementById('apt-time').value;

    if (!nameInput) { showToast('Ingresá el nombre de la clienta', 'error'); return; }
    if (!dateInput) { showToast('Seleccioná una fecha', 'error'); return; }
    if (!timeInput) { showToast('Seleccioná una hora', 'error'); return; }

    // No permitir fechas pasadas (LOCAL, no UTC)
    const _today = new Date();
    const todayStr = `${_today.getFullYear()}-${String(_today.getMonth()+1).padStart(2,'0')}-${String(_today.getDate()).padStart(2,'0')}`;
    if (dateInput < todayStr) {
        showToast('No se puede agendar en una fecha pasada', 'error');
        return;
    }

    const aptEmployeeId = document.getElementById('apt-employee')?.value || null;
    const selectedServices = getSelectedAppointmentServices();
    const serviceVal = selectedServices.map(s => s.name).join(' + ');
    const servicePayload = selectedServices.map(s => ({
        id: s.id,
        name: s.name,
        duration: s.duration ? parseInt(s.duration, 10) : null
    }));
    const manualEndTime = document.getElementById('apt-end-time')?.value || '';
    let duration = selectedServices.reduce((sum, s) => sum + (parseInt(s.duration, 10) || 0), 0);
    let endTime = '';

    if (selectedServices.length > 1) {
        const manualDuration = minutesBetweenTimes(timeInput, manualEndTime);
        if (!manualDuration) {
            showToast('Para mas de un servicio, indique la hora de fin del turno.', 'error');
            return;
        }
        duration = manualDuration;
        endTime = manualEndTime;
    } else {
        duration = duration > 0 ? duration : 60;
        endTime = addMinutesToTime(timeInput, duration);
    }

    // Collision Detection Logic: una misma empleada no puede solapar turnos.
    const start = new Date(`${dateInput}T${timeInput}`);
    const end = new Date(start.getTime() + duration * 60000);
    const startMinutes = timeToMinutes(timeInput);
    const endMinutes = startMinutes === null ? null : startMinutes + duration;

    const hasCollision = db.appointments.some(a => {
        if (editingAppointmentId && String(a.id) === String(editingAppointmentId)) return false;
        if (!aptEmployeeId) return false;
        if (String(getAppointmentEmployeeId(a) || '') !== String(aptEmployeeId || '') || getAppointmentDate(a) !== dateInput) return false;
        const aStart = new Date(`${getAppointmentDate(a)}T${getAppointmentTime(a)}`);
        const aDuration = getAppointmentDuration(a);
        const aEnd = new Date(aStart.getTime() + aDuration * 60000);
        return (start < aEnd && end > aStart);
    });
    const hasBlockedSlot = startMinutes !== null && endMinutes !== null
        ? appointmentOverlapsBlockedSlot(dateInput, startMinutes, endMinutes, aptEmployeeId)
        : false;

    // Crear clienta si no existe
    if (!aptCurrentClient) {
        showToast('Creando clienta...', 'info');
        aptCurrentClient = await createClient(nameInput);
        if (!aptCurrentClient) return;
    }

    // 3. Validaciones de día cerrado y colisión
    const dayHours = getBusinessHoursForDate(dateInput);
    const isClosed = dayHours.closed;
    const collisionMsg = hasCollision ? "Ya hay un turno agendado en ese horario con la misma funcionaria." : "";
    const blockedMsg = hasBlockedSlot ? "El turno se superpone con un bloque horario no disponible." : "";
    const closedMsg = isClosed ? "El salón está configurado como CERRADO para este día." : "";

    const aptData = withCurrentUser({
        client_id: aptCurrentClient.id,
        client_name: aptCurrentClient.name,
        apt_date: dateInput,
        apt_time: timeInput,
        service: serviceVal,
        services: servicePayload,
        duration,
        end_time: endTime,
        notes: document.getElementById('apt-notes').value,
        employee_id: aptEmployeeId
    });
    const repeatDates = getAppointmentRepeatDates(dateInput);

    if (hasCollision || isClosed || hasBlockedSlot) {
        const warningModal = document.getElementById('modal-appointment-warning');
        const warningText = document.getElementById('apt-warning-msg');
        const confirmBtn = document.getElementById('btn-confirm-apt-force');
        if (warningModal && warningText && confirmBtn) {
            const warningMessages = [closedMsg, collisionMsg, blockedMsg].filter(Boolean).join('<br>');
            warningText.innerHTML = `<strong>Atención:</strong><br>${warningMessages}<br><br>¿Deseas agendar de todas formas?`;
            warningModal.classList.add('open');
            confirmBtn.onclick = async () => {
                warningModal.classList.remove('open');
                await executeSaveAppointment(aptData, repeatDates, dateInput, duration, endTime);
            };
            return;
        }
    }

    await executeSaveAppointment(aptData, repeatDates, dateInput, duration, endTime);
}

async function executeSaveAppointment(aptData, repeatDates, dateInput, duration, endTime) {
    showToast('Guardando cita...', 'info');
    let res;
    try {
        if (editingAppointmentId) {
            // Para update, no enviar user_id (es inmutable)
            const updateData = { ...aptData };
            delete updateData.user_id;
            res = await updateRowSafe('appointments', editingAppointmentId, updateData);
            if (res.error || !res.data?.[0]) {
                if (!shouldSaveAppointmentLocally(res.error)) return showAppointmentSaveError(res.error);
                res = { data: [buildLocalAppointmentRow(updateData, editingAppointmentId)], error: null };
            }
        } else {
            const savedRows = [];
            const recurrenceId = repeatDates.length > 1 ? crypto.randomUUID() : null;
            
            const rowsToInsert = repeatDates.map(repeatDate => {
                return { ...aptData, apt_date: repeatDate, recurrence_id: recurrenceId };
            });
            
            const insertRes = await insertAppointmentSafe(rowsToInsert);
            if (insertRes.error) {
                if (!shouldSaveAppointmentLocally(insertRes.error)) return showAppointmentSaveError(insertRes.error);
                rowsToInsert.forEach(row => savedRows.push(buildLocalAppointmentRow(row)));
            } else {
                if (insertRes.data) insertRes.data.forEach(d => savedRows.push(d));
            }
            res = { data: savedRows, error: null };
        }
    } catch (e) {
        console.error('[Cita] Excepción:', e);
        showToast('Error de conexión al guardar cita', 'error');
        return;
    }

    if (res.data && res.data.length > 0) {
        res.data.forEach(raw => {
            if (!raw) return;
            const apt = {
                ...raw,
                date: raw.apt_date || raw.date,
                time: raw.apt_time || raw.time,
                clientId: raw.client_id || raw.clientId,
                clientName: raw.client_name || raw.clientName,
                serviceId: raw.service_id || raw.serviceId,
                employeeId: raw.employee_id || raw.employeeId,
                services: normalizeAppointmentServices(raw.services),
                duration: raw.duration ? parseInt(raw.duration, 10) : duration,
                endTime: normalizeTimeValue(raw.end_time || raw.endTime || endTime)
            };
            if (editingAppointmentId && String(apt.id) === String(editingAppointmentId)) {
                const idx = db.appointments.findIndex(a => String(a.id) === String(editingAppointmentId));
                if (idx >= 0) db.appointments[idx] = apt;
            } else {
                db.appointments.push(apt);
            }
        });
        
        showToast('Cita guardada con éxito');
        persistCollectionLocal('appointments', db.appointments);
        closeAgendarModal();
        renderAgenda(dateInput);
        renderAgendaSidePanel(dateInput);
    } else {
        console.error('Error al guardar cita:', res.error);
        showToast('Error al guardar cita: ' + (res.error?.message || 'Error desconocido'), 'error');
    }
}

// Estado del calendario mensual
const agendaMonthState = {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    selectedDate: null
};

function renderAgendaMonth() {
    const grid = document.getElementById('agenda-month-grid');
    const title = document.getElementById('agenda-month-title');
    if (!grid) return;

    const { year, month } = agendaMonthState;
    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    title.textContent = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = firstDay.getDay(); // 0=Dom
    const daysInMonth = lastDay.getDate();

    const cfg = getBusinessConfig();
    // Fecha LOCAL para que el calendario destaque "hoy" correctamente en la zona horaria del usuario
    const _today = new Date();
    const todayStr = `${_today.getFullYear()}-${String(_today.getMonth()+1).padStart(2,'0')}-${String(_today.getDate()).padStart(2,'0')}`;

    // Cabecera de días de la semana
    const weekNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    let html = '<div class="agenda-month-weekdays">' + weekNames.map(n => `<div>${n}</div>`).join('') + '</div>';
    html += '<div class="agenda-month-days">';

    // Celdas vacías iniciales
    for (let i = 0; i < startWeekday; i++) html += '<div class="agenda-day-cell empty"></div>';

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayDate = new Date(year, month, d);
        const dow = dayDate.getDay();
        const isClosed = getBusinessHoursForDate(dateStr).closed;
        const apts = db.appointments.filter(a => getAppointmentDate(a) === dateStr);
        const birthdays = db.clients.filter(c => {
            if (!c.birthday) return false;
            const [, bm, bd] = c.birthday.split('-').map(n => parseInt(n));
            return bm === (month + 1) && bd === d;
        });
        const isToday = dateStr === todayStr;
        const isSelected = dateStr === agendaMonthState.selectedDate;

        const isPast = dateStr < todayStr;
        let classes = 'agenda-day-cell';
        if (isToday) classes += ' today';
        if (isSelected) classes += ' selected';
        if (isClosed) classes += ' closed';
        if (isPast) classes += ' past';

        let badges = '';
        if (apts.length > 0) badges += `<span class="day-badge apts">${apts.length}</span>`;
        if (birthdays.length > 0) badges += `<span class="day-badge bday">🎂</span>`;

        html += `<div class="${classes}" data-date="${dateStr}">
            <div class="day-num">${d}</div>
            <div class="day-badges">${badges}</div>
        </div>`;
    }
    html += '</div>';
    grid.innerHTML = html;

    // Click para seleccionar día
    grid.querySelectorAll('.agenda-day-cell:not(.empty)').forEach(cell => {
        cell.addEventListener('click', () => {
            agendaMonthState.selectedDate = cell.dataset.date;
            document.getElementById('agenda-date-picker').value = cell.dataset.date;
            renderAgendaMonth();
            renderAgendaSidePanel(cell.dataset.date);
        });
    });

    // Panel por defecto: hoy (si está en el mes mostrado) o primer día
    if (!agendaMonthState.selectedDate ||
        !agendaMonthState.selectedDate.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)) {
        agendaMonthState.selectedDate = todayStr.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)
            ? todayStr
            : `${year}-${String(month+1).padStart(2,'0')}-01`;
    }
    renderAgendaSidePanel(agendaMonthState.selectedDate);
    refreshIcons();
}

function renderAgendaSidePanel(dateStr) {
    const panel = document.getElementById('agenda-side-content');
    if (!panel) return;
    const cfg = getBusinessConfig();
    // Fecha LOCAL (no UTC). Antes el toISOString() usaba UTC y marcaba hoy
    // como "fecha pasada" después de las 21h (UY UTC-3).
    const _today = new Date();
    const todayStr = `${_today.getFullYear()}-${String(_today.getMonth()+1).padStart(2,'0')}-${String(_today.getDate()).padStart(2,'0')}`;

    const [y, m, d] = dateStr.split('-').map(n => parseInt(n));
    const dateObj = new Date(y, m - 1, d);
    const dow = dateObj.getDay();
    const dayNames = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const monthNames = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

    let html = `<div style="font-weight:700;font-size:1rem;margin-bottom:.8rem;">${dayNames[dow]} ${d} ${monthNames[m-1]}</div>`;

    const dayHours = getBusinessHoursForDate(dateStr);
    const isClosed = dayHours.closed;
    if (isClosed) {
        html += `<div class="badge badge-border" style="color:var(--danger);border-color:var(--danger);margin-bottom:.8rem;">Negocio cerrado este día</div>`;
    }

    // Normaliza 'HH:MM:SS' → 'HH:MM'
    const normTime = (t) => (t || '').slice(0, 5);

    // Citas del día (clickable → abrir para editar/eliminar)
    const apts = db.appointments
        .filter(a => getAppointmentDate(a) === dateStr)
        .sort((a, b) => getAppointmentTime(a).localeCompare(getAppointmentTime(b)));
    html += `<h5 style="font-size:.75rem;color:var(--text-dim);text-transform:uppercase;margin:.8rem 0 .4rem;">Citas (${apts.length})</h5>`;
    if (apts.length === 0) {
        html += `<div style="color:var(--text-dim);font-size:.8rem;">Sin citas programadas.</div>`;
    } else {
        html += apts.map(a => {
            const empId = getAppointmentEmployeeId(a);
            const empColor = getSafeEmployeeColor(empId);
            const emp = db.employees.find(e => String(e.id) === String(empId));
            
            return `<div class="apt-chip" data-apt-id="${a.id}" style="padding:10px 12px; background:rgba(29, 18, 44, 0.4); border-left:4px solid ${empColor}; border-radius:8px; margin-bottom:8px; font-size:.85rem; cursor:pointer; transition:all 0.2s; border:1px solid rgba(155,114,212,0.1); border-left:4px solid ${empColor};">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <strong style="color:var(--text-primary);">${getAppointmentTime(a) || '--:--'}</strong> · <span style="color:var(--text-primary);">${a.clientName || a.client_name || 'Sin cliente'}</span><br>
                        <span style="color:var(--text-dim);font-size:.75rem;">${a.service || 'Servicio s/e'} ${emp ? '· ' + emp.name : ''}</span>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <button class="btn-cobrar-chip" onclick="chargeAppointment('${a.id}')" title="Cobrar"><i data-lucide="shopping-cart"></i> Cobrar</button>
                        <button class="btn-icon apt-edit-btn" data-apt-id="${a.id}" title="Editar"><i data-lucide="pencil" style="width:14px;height:14px;color:var(--violet-300);"></i></button>
                        <button class="btn-icon apt-del-btn" data-apt-id="${a.id}" title="Eliminar"><i data-lucide="trash-2" style="width:14px;height:14px;color:var(--danger);"></i></button>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    // Horarios disponibles (slots libres) — clickeable para agendar rápido
    if (!isClosed && dayHours.openTime && dayHours.closeTime) {
        const slots = [];
        const start = timeToMinutes(dayHours.openTime);
        const end = timeToMinutes(dayHours.closeTime);
        const blocks = (cfg.blockedSlots || []).filter(b => b.date === dateStr);
        // Reserva temporal en curso
        const tempRes = (window.tempSlotReservation && window.tempSlotReservation.date === dateStr) ? window.tempSlotReservation.time : null;
        const isPastDate = dateStr < todayStr;
        
        const activeEmps = db.employees || [];
        for (let t = start; t < end; t += 30) {
            const ts = minutesToTime(t);
            const tempTaken = tempRes === ts;
            const availability = getSlotAvailability({ minute: t, appointments: apts, blocks, activeEmployees: activeEmps });

            // Calcular ocupación considerando duraciones
            if (availability.available && !tempTaken && !isPastDate) {
                    let bgColor = 'rgba(52,211,153,0.12)';
                    let borderColor = 'rgba(52,211,153,0.3)';
                    let textColor = 'var(--success)';

                    // Si hay alguien ocupado pero aún hay lugar, teñir con el color de un disponible
                    if (availability.totalBusyCount > 0 && availability.availableEmployees.length > 0) {
                            const availEmp = availability.availableEmployees[0];
                            if (availEmp && availEmp.color) {
                                textColor = availEmp.color;
                                bgColor = availEmp.color + '20'; // ~12% opacity
                                borderColor = availEmp.color + '50'; // ~31% opacity
                            }
                    }

                    slots.push({ time: ts, bgColor, borderColor, textColor });
            }
        }
        html += `<h5 style="font-size:.8rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin:1.2rem 0 .6rem;font-weight:700;">Horarios disponibles <span style="color:var(--success);font-weight:600;">(${slots.length})</span></h5>`;
        if (slots.length === 0) {
            html += `<div style="color:var(--text-dim);font-size:.85rem;padding:.5rem;background:rgba(255,255,255,.03);border-radius:6px;text-align:center;">${isPastDate ? 'Fecha pasada.' : 'Sin huecos libres.'}</div>`;
        } else {
            html += `<div class="slots-grid">` +
                slots.map(s => `<button type="button" class="slot-btn" data-slot-date="${dateStr}" data-slot-time="${s.time}" style="background:${s.bgColor};border-color:${s.borderColor};color:${s.textColor};">${s.time}</button>`).join('') +
                `</div>`;
        }
    }

    // Cumpleaños
    const bdays = db.clients.filter(c => {
        if (!c.birthday) return false;
        const [, bm, bd] = c.birthday.split('-').map(n => parseInt(n));
        return bm === m && bd === d;
    });
    if (bdays.length > 0) {
        html += `<h5 style="font-size:.75rem;color:var(--text-dim);text-transform:uppercase;margin:1rem 0 .4rem;">🎂 Cumpleaños</h5>`;
        html += bdays.map(c => `<div style="font-size:.82rem;padding:4px 0;">${c.name}</div>`).join('');
    }

    // Deudas pendientes (global) con fecha de generación
    const debtors = db.clients.filter(c => parseFloat(c.debt) > 0);
    if (debtors.length > 0) {
        html += `<h5 style="font-size:.75rem;color:var(--danger);text-transform:uppercase;margin:1rem 0 .4rem;">⚠ Deudas pendientes</h5>`;
        html += debtors.slice(0, 5).map(c => {
            // Buscar la transacción más antigua con deuda de esta clienta
            const debtTx = db.transactions
                .filter(t => t.clientId == c.id && t.isIncome && /deuda/i.test(t.detail))
                .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
            const debtDate = debtTx ? new Date(debtTx.date).toLocaleDateString('es-UY', {day:'2-digit', month:'2-digit'}) : '';
            return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:.78rem;padding:5px 0;border-bottom:1px solid var(--border-subtle);">
                <div>
                    <span style="cursor:pointer;color:var(--text-primary);" onclick="openClientModal('${c.id}')">${c.name}</span>
                    ${debtDate ? `<div style="font-size:.65rem;color:var(--text-dim);">desde ${debtDate}</div>` : ''}
                </div>
                <span style="color:var(--danger);font-weight:700;">$${c.debt}</span>
            </div>`;
        }).join('');
        if (debtors.length > 5) html += `<div style="font-size:.7rem;color:var(--text-dim);margin-top:4px;">+${debtors.length - 5} más...</div>`;
    }

    panel.innerHTML = html;

    // Listeners: click en chip de cita → editar; botones editar/eliminar
    panel.querySelectorAll('.apt-edit-btn, .apt-chip').forEach(el => {
        el.addEventListener('click', (ev) => {
            // Si se hizo click en el botón eliminar, no entrar acá
            if (ev.target.closest('.apt-del-btn')) return;
            ev.stopPropagation();
            const id = el.dataset.aptId;
            if (id) editAppointment(id);
        });
    });
    // Funcionalidad centralizada para eliminar cita
    window.handleDeleteAppointment = async function(id, dateStr) {
        const apt = db.appointments.find(a => String(a.id) === String(id));
        if (!apt) return;
        
        let deleteSeries = false;
        if (apt.recurrence_id) {
            const isSeries = await showCustomConfirm(
                `Esta cita es parte de una repetición.\n\n- "Sí, toda la serie" eliminará desde hoy en adelante.\n- "Solo esta" eliminará únicamente la de este día.`,
                { title: 'Eliminar Cita Recurrente', confirmText: 'Sí, toda la serie', cancelText: 'Solo esta', danger: true }
            );
            // Si el usuario cancela (botón secundario), asumimos que quiere borrar solo esta cita.
            deleteSeries = isSeries;
        } else {
            const ok = await showCustomConfirm(
                `¿Eliminar la cita de ${apt.clientName || apt.client_name} el ${getAppointmentDate(apt)} a las ${getAppointmentTime(apt)}?`,
                { title: 'Eliminar cita', confirmText: 'Eliminar', danger: true }
            );
            if (!ok) return;
        }

        try {
            if (deleteSeries && apt.recurrence_id) {
                const { error } = await window.supabaseClient.from('appointments')
                    .delete()
                    .eq('recurrence_id', apt.recurrence_id)
                    .gte('apt_date', getAppointmentDate(apt));
                
                if (error) throw error;
                
                db.appointments = db.appointments.filter(a => !(a.recurrence_id === apt.recurrence_id && getAppointmentDate(a) >= getAppointmentDate(apt)));
                showToast('Serie de citas eliminada');
            } else {
                const { error } = await deleteRowSafe('appointments', id);
                if (error) throw error;
                db.appointments = db.appointments.filter(a => String(a.id) !== String(id));
                showToast('Cita eliminada');
            }
            persistCollectionLocal('appointments', db.appointments);
            
            // Re-render
            if (typeof renderAgendaSidePanel === 'function') renderAgendaSidePanel(dateStr);
            if (typeof renderAgendaMonth === 'function' && !document.getElementById('agenda-month-view').classList.contains('hidden')) renderAgendaMonth();
            const picker = document.getElementById('agenda-date-picker');
            if (typeof renderAgenda === 'function' && picker && picker.value === dateStr) renderAgenda(dateStr);
            
        } catch (err) {
            console.error(err);
            showToast('Error eliminando cita: ' + err.message, 'error');
        }
    };

    panel.querySelectorAll('.apt-del-btn').forEach(btn => {
        btn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const id = btn.dataset.aptId;
            if (window.handleDeleteAppointment) window.handleDeleteAppointment(id, dateStr);
        });
    });

    // Listeners: click en slot disponible → abrir modal con reserva temporal
    panel.querySelectorAll('.slot-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const d = btn.dataset.slotDate;
            const t = btn.dataset.slotTime;
            window.tempSlotReservation = { date: d, time: t };
            aptCurrentClient = null;
            openAgendarModal(d, t);
            renderAgendaSidePanel(d);
        });
    });
    refreshIcons();
}

function renderAgenda(dateStr) {
    if (!dateStr) {
        const _t = new Date();
        dateStr = `${_t.getFullYear()}-${String(_t.getMonth()+1).padStart(2,'0')}-${String(_t.getDate()).padStart(2,'0')}`;
    }
    const timeline = document.getElementById('agenda-timeline');
    if (!timeline) return;
    timeline.innerHTML = '';

    const dayApts = db.appointments
        .filter(a => getAppointmentDate(a) === dateStr)
        .sort((a,b) => getAppointmentTime(a).localeCompare(getAppointmentTime(b)));

    // --- Solo tarjetas de citas en la columna izquierda ---
    if (dayApts.length === 0) {
        timeline.innerHTML = `<div class="empty-state"><i data-lucide="coffee"></i><p>Sin citas para este día.</p></div>`;
    } else {
        dayApts.forEach(apt => {
            const empId = getAppointmentEmployeeId(apt);
            const empColor = getSafeEmployeeColor(empId);
            const emp = db.employees.find(e => String(e.id) === String(empId));
            const duration = getAppointmentDuration(apt);

            const eventEl = document.createElement('div');
            eventEl.className = 'agenda-event';
            // Usamos fondo oscuro/semi-transparente y solo el borde de color para que sea profesional y no chillón
            eventEl.style.cssText = `background:rgba(29, 18, 44, 0.6); border:1px solid rgba(155,114,212,0.15); border-left:5px solid ${empColor}; padding:12px 15px; border-radius:10px; margin-bottom:10px; cursor:pointer; transition:all .2s; position:relative; box-shadow:0 4px 15px rgba(0,0,0,0.2);`;
            
            eventEl.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <div class="event-time" style="font-weight:700; font-size:0.95rem; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
                            ${getAppointmentTime(apt) || '--:--'}
                            <span style="width:8px; height:8px; border-radius:50%; background:${empColor}; display:inline-block;"></span>
                        </div>
                        <div class="event-title" style="font-size:0.9rem; font-weight:600; margin-top:4px; color:var(--text-primary);">${apt.client_name || apt.clientName || 'Sin cliente'}</div>
                        <div class="event-desc" style="font-size:0.78rem; color:var(--text-dim); margin-top:4px;">${apt.service || 'Servicio'} ${emp ? '· ' + emp.name : ''} · ${duration}min</div>
                    </div>
                    <button class="btn-cobrar-chip" onclick="event.stopPropagation(); chargeAppointment('${apt.id}')" title="Cobrar" style="background:var(--success-bg); color:var(--success); border:1px solid rgba(74,222,128,0.2); padding:6px 12px;">
                        <i data-lucide="shopping-cart" style="width:14px; height:14px;"></i> Cobrar
                    </button>
                </div>
            `;
            eventEl.onclick = () => openAppointmentDetail(apt);
            eventEl.onmouseenter = () => { 
                eventEl.style.transform = 'translateY(-2px)'; 
                eventEl.style.background = 'rgba(40, 25, 60, 0.8)';
                eventEl.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)'; 
            };
            eventEl.onmouseleave = () => { 
                eventEl.style.transform = ''; 
                eventEl.style.background = 'rgba(29, 18, 44, 0.6)';
                eventEl.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)'; 
            };
            timeline.appendChild(eventEl);
        });
    }
    refreshIcons();

    // --- Panel lateral derecho (reutiliza renderAgendaSidePanel) ---
    renderAgendaDaySidePanel(dateStr);
}

// Panel lateral de la vista Día — mismo contenido que renderAgendaSidePanel
// pero apuntando al contenedor #agenda-day-side-content
function renderAgendaDaySidePanel(dateStr) {
    const panel = document.getElementById('agenda-day-side-content');
    if (!panel) return;
    const cfg = getBusinessConfig();
    const _today = new Date();
    const todayStr = `${_today.getFullYear()}-${String(_today.getMonth()+1).padStart(2,'0')}-${String(_today.getDate()).padStart(2,'0')}`;

    const [y, m, d] = dateStr.split('-').map(n => parseInt(n));
    const dateObj = new Date(y, m - 1, d);
    const dow = dateObj.getDay();
    const dayNames = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const monthNames = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

    let html = `<div style="font-weight:700;font-size:1rem;margin-bottom:.8rem;">${dayNames[dow]} ${d} ${monthNames[m-1]}</div>`;

    const dayHours = getBusinessHoursForDate(dateStr);
    const isClosed = dayHours.closed;
    if (isClosed) {
        html += `<div class="badge badge-border" style="color:var(--danger);border-color:var(--danger);margin-bottom:.8rem;">Negocio cerrado este día</div>`;
    }

    // Citas
    const apts = db.appointments
        .filter(a => getAppointmentDate(a) === dateStr)
        .sort((a, b) => getAppointmentTime(a).localeCompare(getAppointmentTime(b)));
    html += `<h5 style="font-size:.75rem;color:var(--text-dim);text-transform:uppercase;margin:.8rem 0 .4rem;">Citas (${apts.length})</h5>`;
    if (apts.length === 0) {
        html += `<div style="color:var(--text-dim);font-size:.8rem;">Sin citas programadas.</div>`;
    } else {
        html += apts.map(a => {
            const emp = db.employees.find(e => String(e.id) === String(getAppointmentEmployeeId(a)));
            const empColor = emp && emp.color ? emp.color : 'var(--violet-400)';
            return `<div class="apt-chip" data-apt-id="${a.id}" style="padding:6px 10px;background:rgba(91,58,138,0.15);border-left:3px solid ${empColor};border-radius:4px;margin-bottom:4px;font-size:.82rem;cursor:pointer;transition:background .15s;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <strong>${getAppointmentTime(a) || '--:--'}</strong> · ${a.clientName || a.client_name || 'Sin cliente'}<br>
                        <span style="color:var(--text-dim);font-size:.72rem;">${getAppointmentServices(a).map(s => s.name).join(' + ') || a.service || 'Servicio'}</span>
                    </div>
                    <div style="display:flex;gap:6px;">
                        <button class="btn-icon apt-edit-btn" data-apt-id="${a.id}" title="Editar"><i data-lucide="pencil" style="width:14px;height:14px;color:var(--violet-300);"></i></button>
                        <button class="btn-icon apt-del-btn" data-apt-id="${a.id}" title="Eliminar"><i data-lucide="trash-2" style="width:14px;height:14px;color:var(--danger);"></i></button>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    // Horarios disponibles
    if (!isClosed && dayHours.openTime && dayHours.closeTime) {
        const slots = [];
        const start = timeToMinutes(dayHours.openTime);
        const end = timeToMinutes(dayHours.closeTime);
        const blocks = (cfg.blockedSlots || []).filter(b => b.date === dateStr);
        const tempRes = (window.tempSlotReservation && window.tempSlotReservation.date === dateStr) ? window.tempSlotReservation.time : null;
        const isPastDate = dateStr < todayStr;
        const activeEmps = db.employees || [];

        for (let t = start; t < end; t += 30) {
            const ts = minutesToTime(t);
            const tempTaken = tempRes === ts;
            const availability = getSlotAvailability({ minute: t, appointments: apts, blocks, activeEmployees: activeEmps });
            if (availability.available && !tempTaken && !isPastDate) {
                let bgColor = 'rgba(52,211,153,0.12)', borderColor = 'rgba(52,211,153,0.3)', textColor = 'var(--success)';
                if (availability.totalBusyCount > 0 && availability.availableEmployees.length > 0) {
                    const availEmp = availability.availableEmployees[0];
                    if (availEmp.color) {
                        textColor = availEmp.color;
                        bgColor = availEmp.color + '20';
                        borderColor = availEmp.color + '50';
                    }
                }
                slots.push({ time: ts, bgColor, borderColor, textColor });
            }
        }
        html += `<h5 style="font-size:.8rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin:1.2rem 0 .6rem;font-weight:700;">Horarios disponibles <span style="color:var(--success);font-weight:600;">(${slots.length})</span></h5>`;
        if (slots.length === 0) {
            html += `<div style="color:var(--text-dim);font-size:.85rem;padding:.5rem;background:rgba(255,255,255,.03);border-radius:6px;text-align:center;">${isPastDate ? 'Fecha pasada.' : 'Sin huecos libres.'}</div>`;
        } else {
            html += `<div class="slots-grid">${slots.map(s =>
                `<button type="button" class="slot-btn" data-slot-date="${dateStr}" data-slot-time="${s.time}" style="background:${s.bgColor};border-color:${s.borderColor};color:${s.textColor};">${s.time}</button>`
            ).join('')}</div>`;
        }
    }

    // Cumpleaños
    const bdays = db.clients.filter(c => {
        if (!c.birthday) return false;
        const [, bm, bd] = c.birthday.split('-').map(n => parseInt(n));
        return bm === m && bd === d;
    });
    if (bdays.length > 0) {
        html += `<h5 style="font-size:.75rem;color:var(--text-dim);text-transform:uppercase;margin:1rem 0 .4rem;">🎂 Cumpleaños</h5>`;
        html += bdays.map(c => `<div style="font-size:.82rem;padding:4px 0;">${c.name}</div>`).join('');
    }

    // Deudas pendientes
    const debtors = db.clients.filter(c => parseFloat(c.debt) > 0);
    if (debtors.length > 0) {
        html += `<h5 style="font-size:.75rem;color:var(--danger);text-transform:uppercase;margin:1rem 0 .4rem;">⚠ Deudas pendientes</h5>`;
        html += debtors.slice(0, 5).map(c => {
            const debtTx = db.transactions.filter(t => t.clientId == c.id && t.isIncome && /deuda/i.test(t.detail)).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
            const debtDate = debtTx ? new Date(debtTx.date).toLocaleDateString('es-UY', {day:'2-digit', month:'2-digit'}) : '';
            return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:.78rem;padding:5px 0;border-bottom:1px solid var(--border-subtle);">
                <div>
                    <span style="cursor:pointer;color:var(--text-primary);" onclick="openClientModal('${c.id}')">${c.name}</span>
                    ${debtDate ? `<div style="font-size:.65rem;color:var(--text-dim);">desde ${debtDate}</div>` : ''}
                </div>
                <span style="color:var(--danger);font-weight:700;">$${c.debt}</span>
            </div>`;
        }).join('');
        if (debtors.length > 5) html += `<div style="font-size:.7rem;color:var(--text-dim);margin-top:4px;">+${debtors.length - 5} más...</div>`;
    }

    panel.innerHTML = html;

    // Listeners: editar/eliminar citas
    panel.querySelectorAll('.apt-edit-btn, .apt-chip').forEach(el => {
        el.addEventListener('click', (ev) => {
            if (ev.target.closest('.apt-del-btn')) return;
            ev.stopPropagation();
            const id = el.dataset.aptId;
            if (id) editAppointment(id);
        });
    });
    panel.querySelectorAll('.apt-del-btn').forEach(btn => {
        btn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const id = btn.dataset.aptId;
            if (window.handleDeleteAppointment) window.handleDeleteAppointment(id, dateStr);
        });
    });

    // Listeners: click en slot → abrir modal agendar
    panel.querySelectorAll('.slot-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const d2 = btn.dataset.slotDate;
            const t2 = btn.dataset.slotTime;
            window.tempSlotReservation = { date: d2, time: t2 };
            aptCurrentClient = null;
            openAgendarModal(d2, t2);
            renderAgenda(dateStr);
        });
    });
    refreshIcons();
}

// ==========================================
// 7. P.O.S & CAJA (Mantenido y adaptado)
// ==========================================
// Modal de duración de servicio (reemplaza al browser prompt)
function openServiceDurationModal(srv) {
    document.getElementById('srvdur-title').textContent = `Duración: ${srv.name}`;
    document.getElementById('srvdur-desc').textContent = `"${srv.name}" no tiene duración configurada. Ingresá los minutos estimados para poder calcular slots disponibles.`;
    document.getElementById('srvdur-input').value = '';
    document.getElementById('srvdur-persist').checked = false;
    document.getElementById('modal-service-duration').classList.add('open');
    refreshIcons();

    const confirm = document.getElementById('srvdur-confirm');
    const cancel = document.getElementById('srvdur-cancel');
    const close = document.getElementById('modal-srvdur-close');

    const cleanup = () => document.getElementById('modal-service-duration').classList.remove('open');

    const onConfirm = async () => {
        const mins = parseInt(document.getElementById('srvdur-input').value);
        if (!isNaN(mins) && mins > 0) {
            srv.duration = mins;
            renderAppointmentServiceSelection();
            const persist = document.getElementById('srvdur-persist').checked;
            if (persist && srv.id) {
                // Guardar en Supabase (con retry si falta columna)
                const { error } = await window.supabaseClient.from('services').update({ duration: mins }).eq('id', srv.id);
                if (error && /Could not find the '(\w+)' column/i.test(error.message)) {
                    showToast('Columna "duration" no existe en Supabase aún. Agregala desde el panel.', 'info');
                } else if (!error) {
                    showToast(`Duración ${mins} min guardada para "${srv.name}"`);
                }
            }
        }
        cleanup();
        confirm.removeEventListener('click', onConfirm);
        cancel.removeEventListener('click', onCancel);
        close.removeEventListener('click', onCancel);
    };
    const onCancel = () => {
        cleanup();
        confirm.removeEventListener('click', onConfirm);
        cancel.removeEventListener('click', onCancel);
        close.removeEventListener('click', onCancel);
    };

    confirm.addEventListener('click', onConfirm);
    cancel.addEventListener('click', onCancel);
    close.addEventListener('click', onCancel);
}

let _posInitialized = false;
function initPOS() {
    if (_posInitialized) return;
    _posInitialized = true;

    const toggle = document.getElementById('transaction-type-toggle');
    const incomeFields = document.getElementById('income-fields');
    const expenseFields = document.getElementById('expense-fields');
    const label = document.getElementById('trans-type-label');
    const methodSelectNative = document.getElementById('payment-method');

    const partialSection = document.getElementById('partial-payment-section');
    const discountAlert = document.getElementById('discount-alert');

    toggle.addEventListener('change', () => {
        const splitToggleRowEl = document.getElementById('split-toggle-row');
        const splitSectionEl = document.getElementById('split-payment-section');
        const splitCheckboxEl = document.getElementById('is-split-payment');
        const tipSectionEl = document.getElementById('tip-section');
        const tipCheckboxEl = document.getElementById('is-tip');
        const tipFieldsEl = document.getElementById('tip-fields');
        const saleProductsSectionEl = document.getElementById('sale-products-section');
        if (toggle.checked) {
            incomeFields.classList.remove('hidden');
            expenseFields.classList.add('hidden');
            partialSection.classList.remove('hidden');
            label.textContent = "Ingreso de Dinero";
            label.style.color = "var(--success)";
            if (splitToggleRowEl) splitToggleRowEl.classList.remove('hidden');
            if (tipSectionEl) tipSectionEl.classList.remove('hidden');
            if (saleProductsSectionEl) saleProductsSectionEl.classList.remove('hidden');
        } else {
            incomeFields.classList.add('hidden');
            expenseFields.classList.remove('hidden');
            partialSection.classList.add('hidden');
            discountAlert.classList.add('hidden');
            label.textContent = "Retiro Comercial / Gasto";
            label.style.color = "var(--danger)";
            // Ocultar pago mixto y propinas en modo egreso
            if (splitToggleRowEl) splitToggleRowEl.classList.add('hidden');
            if (splitSectionEl) splitSectionEl.classList.add('hidden');
            if (splitCheckboxEl) splitCheckboxEl.checked = false;
            if (tipSectionEl) tipSectionEl.classList.add('hidden');
            if (tipCheckboxEl) tipCheckboxEl.checked = false;
            if (tipFieldsEl) tipFieldsEl.classList.add('hidden');
            if (saleProductsSectionEl) saleProductsSectionEl.classList.add('hidden');
            resetPosProducts();
            clearClientSelection();
        }
    });

    // Toggle propina
    const tipCheckbox = document.getElementById('is-tip');
    const tipFields = document.getElementById('tip-fields');
    if (tipCheckbox) {
        tipCheckbox.addEventListener('change', () => {
            if (tipCheckbox.checked) {
                tipFields.classList.remove('hidden');
                tipFields.style.display = 'grid';
            } else {
                tipFields.classList.add('hidden');
                tipFields.style.display = '';
            }
        });
    }

    // Sub-método seña + toggle pago mixto
    const señaMethodRow  = document.getElementById('seña-method-row');
    const splitToggleRow = document.getElementById('split-toggle-row');
    const splitSection   = document.getElementById('split-payment-section');
    const splitCheckbox  = document.getElementById('is-split-payment');

    methodSelectNative.addEventListener('change', (e) => {
        if (e.target.value === 'seña') {
            señaMethodRow.classList.remove('hidden');
            splitToggleRow.classList.add('hidden');
            splitSection.classList.add('hidden');
            splitCheckbox.checked = false;
        } else {
            señaMethodRow.classList.add('hidden');
            splitToggleRow.classList.remove('hidden');
        }
        // Auto-sincronizar método de propina con el del servicio
        const tipMethodSel = document.getElementById('tip-method');
        if (tipMethodSel) {
            const isDigital = ['transferencia', 'tarjeta_debito', 'tarjeta_credito'].includes(e.target.value);
            tipMethodSel.value = isDigital ? 'digital' : 'efectivo';
            syncCustomSelect('tip-method');
        }
    });

    splitCheckbox.addEventListener('change', () => {
        if (splitCheckbox.checked) {
            splitSection.classList.remove('hidden');
            initCustomSelects(); // refrescar el nuevo select
        } else {
            splitSection.classList.add('hidden');
        }
    });

    const isPartialCheckbox = document.getElementById('is-partial-payment');
    const fullPriceContainer = document.getElementById('full-price-container');
    const fullPriceInput = document.getElementById('full-service-price');
    isPartialCheckbox.addEventListener('change', () => {
        if (isPartialCheckbox.checked) {
            fullPriceContainer.classList.remove('hidden');
            fullPriceInput.required = true;
        } else {
            fullPriceContainer.classList.add('hidden');
            fullPriceInput.required = false;
        }
    });

    const serviceSelect = document.getElementById('service');
    // Escuchar cambios de servicio para autocompletar precio si es fijo
    serviceSelect.addEventListener('change', (e) => {
        const srvId = e.target.value;
        const srv = db.services.find(s => s.id == srvId);
        if (srv && srv.priceType === 'fijo') {
            document.getElementById('amount').value = (parseFloat(srv.price) || 0) + getPosProductTotal();
        } else {
            document.getElementById('amount').value = '';
        }
        // Duración solo informativa — no mostrar toast al registrar cobro
    });

    const addProductBtn = document.getElementById('btn-add-product-to-sale');
    if (addProductBtn) addProductBtn.addEventListener('click', addProductToSale);

    initPOSClientAutocomplete();
    document.getElementById('btn-save-transaction').addEventListener('click', saveTransaction);
    
    // Asignación segura de botones de cierre
    const btnCerrar = document.getElementById('btn-open-closure') || document.getElementById('btn-cerrar-caja');
    if (btnCerrar) btnCerrar.addEventListener('click', openCashClosureModal);

    const modalCierreClose = document.getElementById('modal-closure-close') || document.getElementById('modal-cierre-close');
    if (modalCierreClose) modalCierreClose.addEventListener('click', () => {
        const modal = document.getElementById('modal-closure') || document.getElementById('modal-cierre-caja');
        if (modal) modal.classList.remove('open');
    });

    const btnCierreGuardar = document.getElementById('btn-closure-save') || document.getElementById('btn-confirm-closure') || document.getElementById('btn-cierre-cerrar');
    if (btnCierreGuardar) btnCierreGuardar.addEventListener('click', saveCashClosure);

    const btnCierreWp = document.getElementById('btn-closure-whatsapp') || document.getElementById('btn-cierre-whatsapp');
    if (btnCierreWp) btnCierreWp.addEventListener('click', compartirCierrePorWhatsApp);

    const modalTxClose = document.getElementById('modal-txdetail-close');
    if (modalTxClose) modalTxClose.addEventListener('click', () => {
        const modal = document.getElementById('modal-transaction-detail');
        if (modal) modal.classList.remove('open');
    });

    updateFormSelects();
    renderPosProducts();
    updateStats();
}

function updateFormSelects() {
    const serviceSelect = document.getElementById('service');
    const aptServiceSelect = document.getElementById('apt-service');
    const employeeSelect = document.getElementById('employee');
    const productSelect = document.getElementById('pos-product-select');

    // POS — select de servicio (guarda el ID)
    if (serviceSelect) {
        serviceSelect.innerHTML = '<option value="" disabled selected style="display:none">Seleccione servicio...</option>';
        db.services.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = `${s.name} ${s.priceType === 'fijo' ? '($' + s.price + ')' : '(Variable)'}`;
            serviceSelect.appendChild(opt);
        });
    }

    // Agenda — select de servicio (guarda el nombre, que es lo que se almacena en appointments)
    if (aptServiceSelect) {
        const prevVal = aptServiceSelect.value; // conservar selección actual si la hay
        aptServiceSelect.innerHTML = '<option value="">Sin especificar</option>';
        db.services.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            aptServiceSelect.appendChild(opt);
        });
        if (prevVal) aptServiceSelect.value = prevVal;
    }

    if (productSelect) {
        const prevProduct = productSelect.value;
        productSelect.innerHTML = '<option value="" disabled selected style="display:none">Seleccione producto...</option>';
        db.products.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.name} ($${fmt(getProductPrice(p))})`;
            productSelect.appendChild(opt);
        });
        if (prevProduct && db.products.some(p => String(p.id) === String(prevProduct))) {
            productSelect.value = prevProduct;
        }
    }

    // Select de empleada
    if (employeeSelect) {
        const prevEmployee = employeeSelect.value;
        employeeSelect.innerHTML = '<option value="" disabled selected style="display:none">Seleccione empleada...</option>';
        db.employees.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.textContent = e.name;
            employeeSelect.appendChild(opt);
        });
        if (prevEmployee && db.employees.some(e => String(e.id) === String(prevEmployee))) employeeSelect.value = prevEmployee;
    }

    // Select de empleada en modal de agenda (guarda el ID para scope de bloqueos)
    const aptEmpSelect = document.getElementById('apt-employee');
    if (aptEmpSelect) {
        const prevEmp = aptEmpSelect.value;
        aptEmpSelect.innerHTML = '<option value="">Sin asignar</option>';
        db.employees.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.textContent = e.name;
            aptEmpSelect.appendChild(opt);
        });
        if (prevEmp) aptEmpSelect.value = prevEmp;
    }

    renderSidebarPriceSearch(document.getElementById('sidebar-price-search-input')?.value || '');
    initCustomSelects(); // Refrescar todos los custom selects
}

function initPOSClientAutocomplete() {
    const input = document.getElementById('client-name');
    const dropdown = document.getElementById('client-autocomplete');
    const discountAlert = document.getElementById('discount-alert');

    function selectClient(client) {
        input.value = client.name;
        currentClient = client;
        dropdown.style.display = 'none';
        if (client.balance > 0) {
            discountAlert.classList.remove('hidden');
            document.getElementById('deposit-amount-display').textContent = client.balance;
        } else {
            discountAlert.classList.add('hidden');
        }
    }

    input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        dropdown.innerHTML = '';
        currentClient = null;
        discountAlert.classList.add('hidden');
        if (query.length < 2) { dropdown.style.display = 'none'; return; }

        const matches = db.clients.filter(c => c.name.toLowerCase().includes(query) || (c.phone && c.phone.includes(query)));
        dropdown.style.display = 'block';

        if (matches.length > 0) {
            matches.forEach(client => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.innerHTML = `<span class="ac-name">${client.name}</span><span class="ac-phone">Saldo: $${client.balance||0} / Debe: $${client.debt||0}</span>`;
                div.addEventListener('click', () => selectClient(client));
                dropdown.appendChild(div);
            });
        }

        // Siempre mostrar opción de crear nueva clienta
        const createDiv = document.createElement('div');
        createDiv.className = 'autocomplete-item';
        createDiv.style.cssText = 'color:var(--violet-200);border-top:1px solid var(--border-subtle);';
        createDiv.innerHTML = `<span class="ac-name" style="color:var(--violet-300);">+ Crear nueva clienta "${e.target.value}"</span>`;
        createDiv.addEventListener('click', () => {
            dropdown.style.display = 'none';
            openQuickClientModal(e.target.value, selectClient);
        });
        dropdown.appendChild(createDiv);
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) dropdown.style.display = 'none';
    });
}

// ==========================================
// MODALES RÁPIDOS (Crear clienta/servicio al vuelo)
// ==========================================
let _quickClientCallback = null;

let _quickModalsInitialized = false;
function initQuickModals() {
    if (_quickModalsInitialized) return;
    _quickModalsInitialized = true;

    // Quick Client Modal
    const qcModal  = document.getElementById('modal-quick-client');
    const qcClose  = document.getElementById('qc-close');
    const qcCancel = document.getElementById('qc-cancel');
    const qcSave   = document.getElementById('qc-save');

    const closeQC = () => { qcModal.classList.remove('open'); _quickClientCallback = null; };
    qcClose.addEventListener('click', closeQC);
    qcCancel.addEventListener('click', closeQC);

    qcSave.addEventListener('click', async () => {
        const name = document.getElementById('qc-name').value.trim();
        if (!name) { showToast('El nombre es requerido', 'error'); return; }
        const phone = document.getElementById('qc-phone').value.trim();
        const ig    = document.getElementById('qc-ig').value.trim();

        // Chequeo de duplicados
        const dup = findDuplicateClient(name, phone);
        if (dup) {
            const use = await showCustomConfirm(
                `Ya existe una clienta similar: "${dup.name}"${dup.phone ? ' (' + dup.phone + ')' : ''}.\n\n"Usar existente" = abrir esa ficha.\n"Crear nueva" = registrarla aunque sea similar.`,
                { title: 'Clienta duplicada', confirmText: 'Usar existente', cancelText: 'Crear nueva' }
            );
            if (use) {
                showToast(`Usando ficha existente de ${dup.name}`, 'info');
                closeQC();
                if (_quickClientCallback) _quickClientCallback(dup);
                return;
            }
        }

        qcSave.disabled = true;
        const { data, error } = await insertClientSafe({
            name, phone, instagram: ig, balance: 0, debt: 0, notes: '', birthday: null
        });
        qcSave.disabled = false;
        if (error || !data?.[0]) {
            console.error(error);
            const fallbackClient = {
                id: createLocalId('client'),
                name,
                phone,
                instagram: ig,
                balance: 0,
                debt: 0,
                notes: '',
                birthday: null,
                pendingSync: true
            };
            db.clients.push(fallbackClient);
            persistCollectionLocal('clients', db.clients);
            showToast(`Clienta "${name}" guardada localmente`, 'warning');
            closeQC();
            if (_quickClientCallback) _quickClientCallback(fallbackClient);
            return;
        }
        db.clients.push(data[0]);
        persistCollectionLocal('clients', db.clients);
        showToast(`Clienta "${name}" creada`);
        closeQC();
        if (_quickClientCallback) _quickClientCallback(data[0]);
    });

    // Quick Service Modal
    const qsModal  = document.getElementById('modal-quick-service');
    const qsClose  = document.getElementById('qs-close');
    const qsCancel = document.getElementById('qs-cancel');
    const qsSave   = document.getElementById('qs-save');

    const closeQS = () => qsModal.classList.remove('open');
    qsClose.addEventListener('click', closeQS);
    qsCancel.addEventListener('click', closeQS);

    document.getElementById('btn-quick-service').addEventListener('click', () => {
        document.getElementById('qs-name').value = '';
        document.getElementById('qs-price').value = '';
        qsModal.classList.add('open');
        refreshIcons();
    });

    qsSave.addEventListener('click', async () => {
        const name = document.getElementById('qs-name').value.trim();
        if (!name) { showToast('El nombre es requerido', 'error'); return; }
        const priceVal = parseFloat(document.getElementById('qs-price').value);
        const hasPrice = !isNaN(priceVal) && priceVal > 0;
        qsSave.disabled = true;
        const quickServiceData = withCurrentUser({
            name, price_type: hasPrice ? 'fijo' : 'variable', price: hasPrice ? priceVal : null
        });
        const { data, error } = await insertRowsSafe('services', quickServiceData);
        qsSave.disabled = false;
        if (error || !data?.[0]) {
            console.error('[QuickService] Insert Error:', error);
            const fallbackService = {
                id: createLocalId('srv'),
                name,
                priceType: quickServiceData.price_type,
                price: quickServiceData.price,
                duration: null,
                pendingSync: true
            };
            db.services.push(fallbackService);
            persistCollectionLocal('services', db.services);
            showToast(`Servicio "${name}" guardado localmente`, 'warning');
            closeQS();
            updateFormSelects();
            return;
        }
        const newSrv = data[0];
        db.services.push({ id: newSrv.id, name: newSrv.name, priceType: newSrv.price_type, price: parseFloat(newSrv.price) || null, duration: newSrv.duration ? parseInt(newSrv.duration) : null });
        persistCollectionLocal('services', db.services);
        showToast(`Servicio "${name}" creada`);
        closeQS();
        updateFormSelects(); // reconstruye custom selects con el nuevo servicio
        // Auto-seleccionar el nuevo servicio en POS y en Agenda
        setTimeout(() => {
            const sel = document.getElementById('service');
            sel.value = newSrv.id;
            sel.dispatchEvent(new Event('change')); // auto-precio si es fijo
            syncCustomSelect('service');
            // Si la agenda está abierta, seleccionar también ahí
            const aptSel = document.getElementById('apt-service');
            if (aptSel) {
                aptSel.value = newSrv.id;
                addAppointmentServiceFromSelect();
                syncCustomSelect('apt-service');
            }
        }, 150);
    });
}

function openQuickClientModal(prefillName, callback) {
    _clientModalSavedCallback = callback;
    openClientModal();
    if (prefillName) {
        document.getElementById('cm-name').value = prefillName;
    }
}

function clearClientSelection() {
    currentClient = null;
    document.getElementById('client-name').value = '';
    document.getElementById('discount-alert').classList.add('hidden');
    document.getElementById('apply-discount').checked = false;
    window._chargeAppointmentId = null;
}

function getPosProductTotal() {
    return posSelectedProducts.reduce((sum, item) => sum + (getProductPrice(item) * (parseFloat(item.qty) || 1)), 0);
}

function syncSaleAmountFromFixedService() {
    const serviceId = document.getElementById('service')?.value;
    const amountInput = document.getElementById('amount');
    
    // Si venimos de chargeAppointment con multiples servicios, usamos su monto base total
    if (window._chargeBaseAmount !== undefined && window._chargeBaseAmount !== null) {
        if (amountInput) {
            amountInput.value = window._chargeBaseAmount + getPosProductTotal();
        }
        return;
    }

    const srv = db.services.find(s => String(s.id) === String(serviceId));
    if (amountInput && srv && srv.priceType === 'fijo') {
        amountInput.value = (parseFloat(srv.price) || 0) + getPosProductTotal();
    }
}

function renderPosProducts() {
    const list = document.getElementById('pos-products-list');
    const totalEl = document.getElementById('pos-products-total');
    if (!list) return;

    if (posSelectedProducts.length === 0) {
        list.innerHTML = '<span style="color:var(--text-dim);font-size:0.82rem">Sin productos agregados.</span>';
    } else {
        list.innerHTML = posSelectedProducts.map(item => {
            const qty = parseFloat(item.qty) || 1;
            const total = getProductPrice(item) * qty;
            return `
                <div class="sale-product-row">
                    <span>${item.name} x${qty}</span>
                    <strong>$${fmt(total)}</strong>
                    <button type="button" class="btn-icon btn-remove-sale-product" data-id="${item.id}"><i data-lucide="x"></i></button>
                </div>
            `;
        }).join('');
    }

    if (totalEl) totalEl.textContent = '$' + fmt(getPosProductTotal());
    list.querySelectorAll('.btn-remove-sale-product').forEach(btn => {
        btn.onclick = () => {
            posSelectedProducts = posSelectedProducts.filter(item => String(item.id) !== String(btn.dataset.id));
            renderPosProducts();
            syncSaleAmountFromFixedService();
        };
    });
    syncSaleAmountFromFixedService();
    refreshIcons();
}

function addProductToSale() {
    const select = document.getElementById('pos-product-select');
    const qtyInput = document.getElementById('pos-product-qty');
    const productId = select?.value;
    const qty = parseFloat(qtyInput?.value) || 1;
    const product = db.products.find(p => String(p.id) === String(productId));
    if (!product) return showToast('Seleccione un producto.', 'error');
    if (qty <= 0) return showToast('Ingrese una cantidad valida.', 'error');

    const existing = posSelectedProducts.find(item => String(item.id) === String(product.id));
    if (existing) existing.qty = (parseFloat(existing.qty) || 0) + qty;
    else posSelectedProducts.push({ id: product.id, name: product.name, price: getProductPrice(product), qty });

    if (select) select.value = '';
    if (qtyInput) qtyInput.value = '1';
    syncCustomSelect('pos-product-select');
    renderPosProducts();
}

function resetPosProducts() {
    posSelectedProducts = [];
    const qtyInput = document.getElementById('pos-product-qty');
    if (qtyInput) qtyInput.value = '1';
    renderPosProducts();
}

async function saveTransaction() {
    const isIncome = document.getElementById('transaction-type-toggle').checked;
    
    let amount = parseFloat(document.getElementById(isIncome ? 'amount' : 'expense-amount').value);
    if (isNaN(amount) || amount <= 0) {
        showToast('Ingrese un monto válido.', 'error');
        return;
    }

    document.getElementById('btn-save-transaction').disabled = true;

    const transactionSchema = {
        transaction_date: new Date().toISOString(),
        is_income: isIncome,
        amount: amount,
        client_name: '',
        client_id: null,
        detail: '',
        method: '',
        employee: ''
    };

    if (isIncome) {
        const employeeSelect = document.getElementById('employee');
        const selectedEmployeeId = employeeSelect?.value || '';
        const selectedEmployee = db.employees.find(e => String(e.id) === String(selectedEmployeeId));
        if (!selectedEmployee) {
            showToast('Seleccione el staff que realizó el servicio.', 'error');
            document.getElementById('btn-save-transaction').disabled = false;
            return;
        }
        transactionSchema.employee = selectedEmployee.name;
        transactionSchema.employee_id = selectedEmployee.id;

        const clientInput = document.getElementById('client-name').value.trim();
        if (!currentClient && !clientInput) {
            showToast('Ingrese o seleccione una clienta.', 'error');
            document.getElementById('btn-save-transaction').disabled = false;
            return;
        }
        transactionSchema.client_name = currentClient ? currentClient.name : clientInput;
        transactionSchema.client_id = currentClient ? currentClient.id : null;
        const srvId = document.getElementById('service').value;
        const srv = db.services.find(s => s.id == srvId); // == for types
        // Si viene de chargeAppointment con múltiples servicios, usar el detalle completo
        if (window._chargeDetail) {
            transactionSchema.detail = window._chargeDetail;
            window._chargeDetail = null; // limpiar después de usar
            window._chargeBaseAmount = null;
        } else {
            transactionSchema.detail = srv ? srv.name : 'Servicio';
        }
        transactionSchema.method = document.getElementById('payment-method').value;
        const soldProducts = posSelectedProducts.map(item => ({
            id: item.id,
            name: item.name,
            price: getProductPrice(item),
            qty: parseFloat(item.qty) || 1,
            total: getProductPrice(item) * (parseFloat(item.qty) || 1)
        }));
        const productTotal = soldProducts.reduce((sum, item) => sum + item.total, 0);
        if (soldProducts.length > 0) {
            transactionSchema.products = soldProducts;
            transactionSchema.product_total = productTotal;
            transactionSchema.detail += ` + Productos: ${soldProducts.map(p => `${p.name} x${p.qty}`).join(', ')}`;
            
            // Actualizar stock de cada producto
            for (const p of soldProducts) {
                await updateProductStock(p.id, -p.qty);
            }
        }
        
        if (!currentClient && clientInput) {
            currentClient = await createClient(clientInput);
            transactionSchema.client_id = currentClient.id;
        }

        const applyDiscount = document.getElementById('apply-discount').checked;
        if (applyDiscount && currentClient && currentClient.balance > 0) {
            const cb = parseFloat(currentClient.balance);
            if (amount <= cb) {
                currentClient.balance = cb - amount;
                transactionSchema.amount = 0; 
                transactionSchema.detail += " (Pagado con seña)";
            } else {
                currentClient.balance = 0;
                transactionSchema.amount = amount - cb; 
                transactionSchema.detail += ` (Desc. de seña: -${cb})`;
            }
            await window.supabaseClient.from('clients').update({balance: currentClient.balance}).eq('id', currentClient.id);
        }

        const isPartial = document.getElementById('is-partial-payment').checked;
        if (isPartial) {
            const debtAmount = parseFloat(document.getElementById('full-service-price').value);
            if (isNaN(debtAmount) || debtAmount <= 0) {
                showToast('Monto de deuda inválido.', 'error');
                document.getElementById('btn-save-transaction').disabled = false;
                return;
            }
            if (debtAmount >= transactionSchema.amount) {
                showToast('La deuda no puede ser mayor o igual al precio del servicio.', 'error');
                document.getElementById('btn-save-transaction').disabled = false;
                return;
            }
            if (currentClient) {
                currentClient.debt = (parseFloat(currentClient.debt) || 0) + debtAmount;
                await window.supabaseClient.from('clients').update({debt: currentClient.debt}).eq('id', currentClient.id);
                // Log de deuda
                const fmt2 = n => Number(n).toLocaleString('es-UY');
                addClientLog(currentClient.id, `⚠ DEUDA GENERADA: $${fmt2(debtAmount)}`);
            }
            // Restar la deuda del monto registrado en caja (la clienta solo pagó la diferencia)
            transactionSchema.amount = transactionSchema.amount - debtAmount;
            transactionSchema.detail += ` (Generó Deuda: ${debtAmount})`;
        }

        if (transactionSchema.method === 'seña') {
            // Leer cómo fue cobrada la seña y guardarlo en detail
            const señaMethod = document.querySelector('input[name="seña_method"]:checked')?.value || 'efectivo';
            transactionSchema.detail += ` (cobrado en ${señaMethod})`;
            transactionSchema.method = 'seña'; // sigue siendo seña para el balance
            if (currentClient) {
                currentClient.balance = (parseFloat(currentClient.balance) || 0) + transactionSchema.amount;
                await window.supabaseClient.from('clients').update({balance: currentClient.balance}).eq('id', currentClient.id);
            }
        }
        
    } else {
        transactionSchema.detail = document.getElementById('expense-detail').value;
        transactionSchema.method = 'Efectivo Red.'; 
        if (!transactionSchema.detail) { 
            showToast('Ingrese detalle de egreso.', 'error'); 
            document.getElementById('btn-save-transaction').disabled = false;
            return; 
        }
    }

    const inserts = [transactionSchema];
    let tipTx = null;
    let split2 = null;

    // Preparar Propina
    if (isIncome && document.getElementById('is-tip').checked) {
        const tipAmt = parseFloat(document.getElementById('tip-amount').value);
        const tipMetRaw = document.getElementById('tip-method').value;
        const tipMet = tipMetRaw === 'digital' ? 'transferencia' : tipMetRaw;
        if (!isNaN(tipAmt) && tipAmt > 0) {
            tipTx = {
                ...transactionSchema,
                amount: tipAmt,
                method: tipMet,
                detail: `🪙 Propina — ${transactionSchema.detail || ''}`.trim()
            };
            inserts.push(tipTx);
        }
    }

    // Preparar Pago Mixto
    if (isIncome && document.getElementById('is-split-payment').checked) {
        const splitAmt = parseFloat(document.getElementById('split-amount').value);
        const splitMet = document.getElementById('split-method').value;
        if (!isNaN(splitAmt) && splitAmt > 0) {
            if (splitAmt >= transactionSchema.amount) {
                showToast('El segundo pago debe ser menor al total del servicio.', 'error');
                document.getElementById('btn-save-transaction').disabled = false;
                return;
            }
            transactionSchema.amount = transactionSchema.amount - splitAmt;
            transactionSchema.detail += ` (pago principal de total $${amount})`;
            split2 = { 
                ...transactionSchema, 
                amount: splitAmt, 
                method: splitMet, 
                detail: transactionSchema.detail + ' (2do pago)' 
            };
            inserts.push(split2);
        }
    }

    // Insertar todo en una sola llamada
    // Insertar con user_id usando helper seguro
    const userId = getUserId();
    if (userId) inserts.forEach(tx => { tx.user_id = userId; });
    let tData = null, error = null;
    try {
        const result = await insertRowsSafe('transactions', inserts);
        tData = result.data;
        error = result.error;
    } catch (e) {
        console.error('[Caja] Excepción al insertar:', e);
        error = { message: e.message };
    }
    document.getElementById('btn-save-transaction').disabled = false;

    if (error) {
        showToast('Transacción guardada localmente.', 'warning');
        tData = inserts.map(tx => ({ ...tx, id: createLocalId('tx'), pendingSync: true }));
    } else if (!tData || tData.length === 0) {
        tData = inserts.map(tx => ({ ...tx, id: createLocalId('tx') }));
    }

    if (tData && tData.length > 0) {
        tData.forEach((t, index) => {
            const originalTx = inserts[index] || {};
            const txDate = t.transaction_date || originalTx.transaction_date || new Date().toISOString();
            const txAmount = parseFloat(t.amount || originalTx.amount) || 0;
            const txIsIncome = t.is_income ?? originalTx.is_income ?? true;
            
            db.transactions.push({
                id: t.id, 
                date: txDate, 
                isIncome: txIsIncome,
                amount: txAmount, 
                clientName: t.client_name || originalTx.client_name || 'Consumidor Final',
                clientId: t.client_id || originalTx.client_id || null, 
                detail: t.detail || originalTx.detail || '', 
                method: t.method || originalTx.method || 'efectivo', 
                employee: t.employee || originalTx.employee || '',
                employeeId: t.employee_id || originalTx.employee_id || null,
                products: normalizeTransactionProducts(t.products || originalTx.products),
                productTotal: parseFloat(t.product_total || originalTx.product_total) || 0
            });
        });
        persistCollectionLocal('transactions', db.transactions);

        // IDs para limpieza posterior
        const savedAppointmentId = window._chargeAppointmentId;
        const savedClientId = isIncome ? (transactionSchema?.client_id || null) : null;

        // --- Limpieza de UI y Estado ---
        try {
            if (isIncome) {
                clearClientSelection();
                if (window.activeModal && window.activeModal == savedClientId) {
                    renderClientHistory(window.activeModal);
                }
                // Limpiar inputs
                ['amount', 'full-service-price', 'service', 'split-amount', 'tip-amount'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                
                // Ocultar secciones
                ['full-price-container', 'split-payment-section', 'seña-method-row', 'tip-fields', 'pos-services-breakdown'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.classList.add('hidden');
                });

                document.getElementById('is-partial-payment').checked = false;
                document.getElementById('is-split-payment').checked = false;
                document.getElementById('is-tip').checked = false;
                document.getElementById('split-toggle-row').classList.remove('hidden');
                
                resetPosProducts();
                window._chargeDetail = null;
                window._chargeBaseAmount = null;
                window._chargeAppointmentId = null;
                updateFormSelects();
            } else {
                document.getElementById('expense-amount').value = '';
                document.getElementById('expense-detail').value = '';
            }
        } catch (e) { console.error('[CAJA] Error en limpieza:', e); }

        // --- Logging de Clienta ---
        try {
            tData.forEach(txRow => {
                if (txRow.client_id) {
                    const amtFmt = Number(txRow.amount || 0).toLocaleString('es-UY');
                    const type = txRow.is_income ? 'Ingreso' : 'Egreso';
                    addClientLog(txRow.client_id, `💳 ${type} $${amtFmt} — ${txRow.detail || ''} (${txRow.method || 'Efectivo'})`);
                }
            });
        } catch (e) { console.error('[CAJA] Error addClientLog:', e); }

        // --- Actualización de UI (CRÍTICO) ---
        try {
            updateStats();
            renderTransactionsTable();
            showToast('Movimiento registrado en caja.');
        } catch (e) { console.error('[CAJA] Error actualizando UI:', e); }

        // --- Eliminación de Cita ---
        if (savedAppointmentId) {
            try {
                db.appointments = db.appointments.filter(a => String(a.id) !== String(savedAppointmentId));
                persistCollectionLocal('appointments', db.appointments);
                
                if (typeof deleteRowSafe === 'function') {
                    deleteRowSafe('appointments', savedAppointmentId).catch(err => {
                        console.warn('[CAJA] Borrado remoto falló (offline?):', err);
                    });
                }
                
                if (typeof renderDashboardAgendaResumen === 'function') renderDashboardAgendaResumen();
                if (typeof renderAgenda === 'function') renderAgenda();
            } catch (e) { console.error('[CAJA] Error borrando cita:', e); }
        }
    }
}

function updateStats() {
    console.log('[CAJA] Actualizando estadísticas...');
    let cache = { ef: 0, tr: 0, de: 0 };
    const today = new Date();

    if (!Array.isArray(db.transactions)) {
        console.warn('[CAJA] db.transactions no es un array');
        return;
    }

    db.transactions.forEach(t => {
        try {
            if (!t || !t.date) return;
            if (!isSameDay(t.date, today)) return;
            if (isTipTransaction(t)) return;

            const amt = parseFloat(t.amount) || 0;
            const method = (t.method || 'efectivo').toLowerCase();

            if (t.isIncome) {
                if (method === 'efectivo') cache.ef += amt;
                else if (method === 'transferencia' || method === 'débito' || method === 'crédito' || method.startsWith('tarjeta')) cache.tr += amt;
                else if (method === 'seña') cache.de += amt;
            } else {
                cache.ef -= amt;
            }
        } catch (e) {
            console.error('[CAJA] Error procesando transacción para stats:', e, t);
        }
    });

    const safeFmt = n => {
        try {
            return Number(n || 0).toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        } catch (e) { return '0'; }
    };

    const elCash = document.getElementById('stat-cash');
    const elTr = document.getElementById('stat-transfers');
    const elDe = document.getElementById('stat-deps');
    const elTot = document.getElementById('stat-total');

    if (elCash) elCash.textContent = `$${safeFmt(cache.ef)}`;
    if (elTr) elTr.textContent = `$${safeFmt(cache.tr)}`;
    if (elDe) elDe.textContent = `$${safeFmt(cache.de)}`;
    if (elTot) elTot.textContent = `$${safeFmt(cache.ef + cache.tr)}`;
}

function renderTransactionsTable() {
    const tbody = document.getElementById('today-transactions-tbody');
    if (!tbody) return;

    const today = new Date();
    console.log(`[CAJA] Renderizando tabla. Total transacciones en DB: ${db.transactions.length}`);

    const todays = db.transactions.filter(t => {
        try {
            if (!t || !t.date) return false;
            return isSameDay(t.date, today);
        } catch(e) { return false; }
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    console.log(`[CAJA] Transacciones de hoy filtradas: ${todays.length}`);

    if (todays.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state" style="padding: 2rem;"><p>Caja limpia por ahora.</p></td></tr>`;
        return;
    }

    const safeFmt = n => {
        try {
            return Number(n || 0).toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        } catch (e) { return '0'; }
    };

    // Agrupar por cliente y minuto para mostrar pagos mixtos juntos
    const grouped = todays.reduce((acc, tx) => {
        const dateKey = tx.date ? String(tx.date).slice(0, 16) : 'no-date';
        const groupKey = tx.clientId ? `c_${tx.clientId}_${dateKey}` : `n_${tx.clientName}_${dateKey}`;
        
        if (!acc[groupKey]) acc[groupKey] = [];
        acc[groupKey].push(tx);
        return acc;
    }, {});

    let html = '';
    Object.values(grouped).forEach(group => {
        try {
            const t = group.find(tx => !isTipTransaction(tx)) || group[0];
            const isIncome = t.isIncome;
            const timeStr = t.date ? new Date(t.date).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            
            const totalGroupAmount = group.reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);
            const totalTip = group.filter(tx => isTipTransaction(tx)).reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);

            const cleanDetail = String(t.detail || (isIncome ? 'Servicio' : 'Gasto')).split(' (')[0].split(' — ')[0];
            const methodLabel = t.method === 'tarjeta_debito' ? 'T.Débito'
                    : t.method === 'tarjeta_credito' ? 'T.Crédito' : (t.method || 'Efectivo');

            html += `
                <tr class="${isIncome ? 'row-income' : 'row-expense'} tx-row" data-tx-ids="${group.map(tx => tx.id).join(',')}">
                    <td class="text-dim" style="font-size:0.75rem;">${timeStr}</td>
                    <td style="font-weight:600;">
                        ${t.clientName || 'General'}
                        <br><small style="color:var(--text-dim); font-weight:400;">${getTxEmployeeName(t)}</small>
                    </td>
                    <td style="max-width:250px;white-space:normal;" title="${(t.detail || '').replace(/"/g, '&quot;')}">${cleanDetail}</td>
                    <td>
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <span class="badge ${isIncome ? 'badge-success' : 'badge-danger'}" style="width:fit-content; font-size:0.65rem;">
                                ${isIncome ? 'INGRESO' : 'EGRESO'}
                            </span>
                            <span style="font-size:0.7rem; color:var(--text-dim);">${methodLabel}</span>
                        </div>
                    </td>
                    <td class="text-right" style="color:var(--success); font-weight:600;">
                        ${totalTip > 0 ? `$${safeFmt(totalTip)}` : '-'}
                    </td>
                    <td class="text-right" style="font-weight:700; font-size:1.05rem;">
                        $${safeFmt(totalGroupAmount)}
                        ${group.length > 1 ? `
                        <div style="font-size:0.65rem; color:var(--accent); cursor:help;" title="Este registro incluye múltiples pagos o propina.">
                            (Desglosado)
                        </div>` : ''}
                    </td>
                </tr>
                ${group.length > 1 ? `
                <tr class="detail-row">
                    <td colspan="6" style="padding:0;">
                        <div style="font-size:0.8rem; margin:0 15px 15px 15px; padding:12px; background:rgba(255,255,255,0.02); border-radius:8px; border-left:3px solid var(--accent);">
                            <span style="display:block; font-weight:700; color:var(--accent); margin-bottom:8px; text-transform:uppercase; font-size:0.7rem; letter-spacing:0.5px;">Desglose de Cobro:</span>
                            ${group.map(tx => {
                                const isTip = isTipTransaction(tx);
                                const m = (tx.method || 'Efectivo');
                                const mLabel = m.charAt(0).toUpperCase() + m.slice(1);
                                return `
                                    <div style="display:flex; justify-content:space-between; margin-bottom:3px; font-family:var(--font-mono); font-size:0.75rem;">
                                        <span style="color:var(--text-dim)">${isTip ? '✦ Propina' : '• ' + mLabel}:</span>
                                        <span style="font-weight:700; color:${isTip ? 'var(--success)' : 'var(--text-main)'}">$${safeFmt(tx.amount)}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </td>
                </tr>` : ''}
            `;
        } catch (e) {
            console.error('[CAJA] Error renderizando grupo de transacciones:', e, group);
        }
    });

    // Fila de totales al pie
    const totalIncome = todays.filter(t => t.isIncome && !isTipTransaction(t)).reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const totalExpense = todays.filter(t => !t.isIncome).reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

    html += `
        <tr style="border-top:2px solid var(--border-subtle); background:rgba(0,0,0,0.2);">
            <td colspan="4" style="font-weight:700; font-size:0.85rem; color:var(--text-secondary);">
                ${Object.keys(grouped).length} movimiento${Object.keys(grouped).length === 1 ? '' : 's'}
                ${totalExpense > 0 ? `<span style="color:var(--danger);margin-left:12px;">Egresos: -$${safeFmt(totalExpense)}</span>` : ''}
            </td>
            <td style="font-weight:700; color:var(--text-secondary); text-align:right; font-size:0.8rem;">TOTAL</td>
            <td style="font-weight:800; color:var(--success); text-align:right; font-size:1.05rem;">$${safeFmt(totalIncome - totalExpense)}</td>
        </tr>`;

    tbody.innerHTML = html;

    // Click en fila → abrir detalle
    tbody.querySelectorAll('tr.tx-row').forEach(row => {
        row.addEventListener('click', () => {
            const txIds = row.dataset.txIds;
            if (txIds) {
                const ids = txIds.split(',');
                const group = db.transactions.filter(t => ids.includes(String(t.id)));
                if (group.length > 0) {
                    console.log('[CAJA] Abriendo detalle de:', group);
                    openTransactionDetail(group.length === 1 ? group[0] : group);
                }
            }
        });
        row.addEventListener('mouseenter', () => row.style.background = 'rgba(91,58,138,0.15)');
        row.addEventListener('mouseleave', () => row.style.background = '');
    });

    if (window.lucide) window.lucide.createIcons();
}

function openTransactionDetail(data) {
    const isGroup = Array.isArray(data);
    const t = isGroup ? data[0] : data;
    const fmt = n => Number(n).toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    
    const date = new Date(t.date);
    const dateStr = date.toLocaleDateString('es-UY', { weekday:'long', day:'2-digit', month:'long' });
    const timeStr = date.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    const methodLabels = { efectivo:'Efectivo', transferencia:'Transferencia', tarjeta_debito:'Tarjeta Débito', tarjeta_credito:'Tarjeta Crédito', seña:'Seña / Depósito' };
    const color = t.isIncome ? 'var(--success)' : 'var(--danger)';
    const sign = t.isIncome ? '+' : '-';
    const icon = t.isIncome ? 'trending-up' : 'trending-down';
    const tipo = t.isIncome ? 'Ingreso' : 'Egreso';

    let totalAmount = isGroup ? data.reduce((acc, curr) => acc + curr.amount, 0) : t.amount;
    
    let contentHTML = `
        <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;">
            <div style="width:48px;height:48px;border-radius:50%;background:${t.isIncome ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i data-lucide="${icon}" style="width:22px;height:22px;color:${color};"></i>
            </div>
            <div>
                <div style="font-size:1.6rem;font-weight:800;color:${color};">${sign}$${fmt(totalAmount)}</div>
                <div style="font-size:.82rem;color:var(--text-dim);">${tipo} · ${timeStr} · ${dateStr}</div>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
            ${detailRow('Cliente / Concepto', t.isIncome ? (t.clientName || 'Sin cliente') : (t.detail || 'Retiro'))}
            ${detailRow('Empleada', t.employee || '—')}
    `;

    if (isGroup) {
        let breakdownHTML = `<div style="grid-column:span 2; margin-top: 0.5rem; border-top: 1px solid var(--border); padding-top: 1rem;">
            <div style="font-size:.7rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Desglose de Pago</div>
            <div style="display:flex; flex-direction:column; gap:8px;">`;
        
        data.forEach(g => {
            const mLabel = methodLabels[g.method] || g.method || '—';
            breakdownHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:8px 12px; border-radius:6px;">
                    <div>
                        <div style="font-size:0.85rem; font-weight:600;">${g.detail}</div>
                        <div style="font-size:0.7rem; color:var(--text-dim);">${mLabel}</div>
                    </div>
                    <div style="font-weight:700; color:var(--text-primary);">$${fmt(g.amount)}</div>
                </div>
            `;
        });
        breakdownHTML += `</div></div>`;
        contentHTML += breakdownHTML;
    } else {
        const methodLabel = methodLabels[t.method] || t.method || '—';
        contentHTML += `
            ${detailRow('Método', methodLabel)}
            ${detailRow('Detalle', t.detail || '—')}
        `;
    }

    // Detectar si hay deuda en el detalle (para el badge de deuda)
    const debtMatch = (t.detail || '').match(/Deuda:\s*(\d+(?:\.\d+)?)/i);
    const debtAmt = debtMatch ? parseFloat(debtMatch[1]) : null;
    const clientDebt = t.clientId ? db.clients.find(c => c.id == t.clientId)?.debt : null;

    if (debtAmt) {
        contentHTML += `<div style="grid-column:span 2;background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.4);border-radius:6px;padding:10px 14px; margin-top:1rem;">
            <div style="font-size:.7rem;color:var(--danger);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">⚠ Deuda generada en este movimiento</div>
            <div style="font-size:1rem;font-weight:700;color:var(--danger);">$${fmt(debtAmt)}</div>
            <div style="font-size:.72rem;color:var(--text-dim);margin-top:2px;">Generada el ${date.toLocaleDateString('es-UY', {day:'2-digit', month:'2-digit'})}</div>
        </div>`;
    } else if (clientDebt > 0) {
        contentHTML += `<div style="grid-column:span 2;background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.25);border-radius:6px;padding:10px 14px; margin-top:1rem;">
            <div style="font-size:.7rem;color:var(--danger);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Deuda total de la clienta</div>
            <div style="font-size:1rem;font-weight:700;color:var(--danger);">$${fmt(clientDebt)}</div>
        </div>`;
    }

    if (t.isIncome && t.clientId) {
        contentHTML += `
            <div style="grid-column:span 2; margin-top: 1rem;">
                <button type="button" onclick="document.getElementById('modal-transaction-detail').classList.remove('open');setTimeout(()=>openClientModal('${t.clientId}'),150);" class="btn btn-ghost btn-sm" style="width:100%; justify-content:center;">👤 Ver ficha de clienta</button>
            </div>
        `;
    }

    contentHTML += `</div>`;
    document.getElementById('txdetail-body').innerHTML = contentHTML;

    refreshIcons();
    document.getElementById('modal-transaction-detail').classList.add('open');
}

function detailRow(label, value) {
    return `<div style="background:rgba(0,0,0,0.2);border-radius:6px;padding:10px 14px;">
        <div style="font-size:.7rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">${label}</div>
        <div style="font-size:.9rem;color:var(--text-primary);">${value}</div>
    </div>`;
}

// ==========================================
// 8. CIERRES DE CAJA & REPORTES
// ==========================================
function initAnalytics() {
    // Escuchar cambios en tabs de analytics
    const btnOpenClosure = document.getElementById('btn-open-closure');
    const btnConfirmClosure = document.getElementById('btn-confirm-closure');
    
    if (btnOpenClosure) btnOpenClosure.addEventListener('click', openCashClosureModal);
    if (btnConfirmClosure) btnConfirmClosure.addEventListener('click', saveCashClosure);
    
    // Configuración global chartjs para tema oscuro
    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = '#776a87';
        Chart.defaults.font.family = 'Inter';
    }

    // Tabs de analytics
    const analyticsTabs = document.querySelectorAll('.analytics-tabs .tab-btn');
    analyticsTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            switchAnalyticsTab(target);
        });
    });

    updateStats();
    renderClosuresHistory();
}

function switchAnalyticsTab(tabId) {
    // Ocultar todos los contenidos de tab
    document.querySelectorAll('#view-analytics .tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('#view-analytics .tab-content').forEach(c => c.classList.remove('active'));
    
    // Quitar active de botones
    document.querySelectorAll('.analytics-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    
    // Mostrar el seleccionado
    const target = document.getElementById('tab-' + tabId);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
    }
    const btn = document.querySelector(`.analytics-tabs .tab-btn[data-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');

    // Re-render the content of whichever tab the user just opened so charts
    // and tables size correctly (Chart.js mis-sizes when canvas is hidden).
    if (tabId === 'stats-closures' && typeof renderClosuresHistory === 'function') {
        renderClosuresHistory();
    } else if (tabId === 'stats-main' && typeof updateCharts === 'function') {
        updateCharts();
    }
}

function openCashClosureModal() {
    const today = new Date();
    let cache = { ef:0, digital:0, se:0, egresos:0, tot:0 };

    const todays = db.transactions.filter(t => isSameDay(t.date, today) && !isTipTransaction(t));
    
    todays.forEach(t => {
        if (t.isIncome) {
            if (t.method === 'efectivo') cache.ef += t.amount;
            else if (t.method === 'seña') cache.se += t.amount;
            else cache.digital += t.amount;
        } else {
            cache.ef -= t.amount;
            cache.egresos += t.amount;
        }
    });

    const fmt = n => Number(n).toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    
    // Breakdown por empleada
    let empBreakdown = '<div style="margin-top:1rem; border-top:1px solid var(--border); padding-top:1rem;">';
    empBreakdown += '<p style="font-size:0.75rem; color:var(--text-dim); margin-bottom:0.5rem; text-transform:uppercase; letter-spacing:1px;">Desglose por Funcionaria</p>';
    
    db.employees.forEach(emp => {
        const empT = todays.filter(t => t.employee === emp.name && t.isIncome);
        if (empT.length === 0) return;
        const eEf = empT.filter(t => t.method === 'efectivo').reduce((s,t) => s+t.amount, 0);
        const eDig = empT.filter(t => t.method !== 'efectivo' && t.method !== 'seña').reduce((s,t) => s+t.amount, 0);
        const eSe = empT.filter(t => t.method === 'seña').reduce((s,t) => s+t.amount, 0);
        
        empBreakdown += `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; font-size:0.85rem;">
                <span style="color:var(--text-secondary)">👤 ${emp.name}</span>
                <span style="color:var(--text-primary)">$${fmt(eEf + eDig)} <small style="color:var(--text-dim)">(Ef: $${fmt(eEf)} | Dig: $${fmt(eDig)})</small></span>
            </div>`;
    });
    empBreakdown += '</div>';

    const modal = document.getElementById('modal-closure');
    if (!modal) { showToast('No se encontró el modal de cierre.', 'error'); return; }

    const totalEl = document.getElementById('closure-total-display');
    const cashEl = document.getElementById('closure-cash-display');
    const digEl = document.getElementById('closure-digital-display');
    const dateEl = document.getElementById('closure-date-display');
    const noteEl = document.getElementById('closure-note');
    if (totalEl) totalEl.textContent = `$${fmt(cache.ef + cache.digital)}`;
    if (cashEl) cashEl.textContent = `$${fmt(cache.ef)}`;
    if (digEl) digEl.textContent = `$${fmt(cache.digital)}`;
    if (dateEl) dateEl.textContent = today.toLocaleDateString('es-UY', { day:'numeric', month:'long', year:'numeric' });
    if (noteEl) noteEl.value = '';

    // Inyectar desglose si hay
    const container = modal.querySelector('.modal-body');
    if (container) {
        const existingBreakdown = container.querySelector('.closure-breakdown');
        if (existingBreakdown) existingBreakdown.remove();

        const breakdownDiv = document.createElement('div');
        breakdownDiv.className = 'closure-breakdown';
        breakdownDiv.innerHTML = empBreakdown;
        const anchor = noteEl && noteEl.parentNode ? noteEl.parentNode : null;
        if (anchor && anchor.parentNode === container) container.insertBefore(breakdownDiv, anchor);
        else container.appendChild(breakdownDiv);
    }

    modal.classList.add('open');
}

async function saveCashClosure() {
    const today = new Date();
    let cache = { ef:0, digital:0, se:0, egresos:0 };

    db.transactions.filter(t => isSameDay(t.date, today) && !isTipTransaction(t)).forEach(t => {
        if (t.isIncome) {
            if (t.method === 'efectivo') cache.ef += t.amount;
            else if (t.method === 'seña') cache.se += t.amount;
            else cache.digital += t.amount;
        } else {
            cache.ef -= t.amount;
            cache.egresos += t.amount;
        }
    });

    const closureData = withCurrentUser({
        closure_date: new Date().toISOString(),
        cash_amount: cache.ef,
        digital_amount: cache.digital,
        total_amount: cache.ef + cache.digital,
        income_amount: cache.ef + cache.digital + cache.egresos,
        egress_amount: cache.egresos,
        note: (document.getElementById('closure-note')?.value || "") + ` | Señas: ${cache.se}`,
        created_by: 'Patricia'
    });

    showToast('Guardando cierre...', 'info');
    try {
        let { data, error } = await insertRowsSafe('closures', closureData);
        if (error && error.message) {
            const m = error.message.match(/Could not find the '(\w+)' column/i);
            if (m && m[1] && m[1] in closureData) {
                const cleanClosure = { ...closureData };
                delete cleanClosure[m[1]];
                const retry = await insertRowsSafe('closures', cleanClosure);
                data = retry.data;
                error = retry.error;
            }
        }

        if (!error && data) {
            db.closures.unshift(data[0]);
            persistCollectionLocal('closures', db.closures);
            renderClosuresHistory();
            const m = document.getElementById('modal-closure') || document.getElementById('modal-cierre-caja');
            if (m) m.classList.remove('open');
            showToast('Cierre de caja guardado con éxito.', 'success');
        } else {
            console.error('[Cierre] Error Supabase:', error);
            db.closures.unshift({ ...closureData, id: createLocalId('closure'), pendingSync: true });
            persistCollectionLocal('closures', db.closures);
            renderClosuresHistory();
            const m = document.getElementById('modal-closure') || document.getElementById('modal-cierre-caja');
            if (m) m.classList.remove('open');
            showToast('Cierre guardado localmente. Revisá Supabase para sincronización.', 'warning');
        }
    } catch(e) {
        console.error(e);
        db.closures.unshift({ ...closureData, id: createLocalId('closure'), pendingSync: true });
        persistCollectionLocal('closures', db.closures);
        renderClosuresHistory();
        const m = document.getElementById('modal-closure') || document.getElementById('modal-cierre-caja');
        if (m) m.classList.remove('open');
        showToast('Cierre guardado localmente. Revisá Supabase para sincronización.', 'warning');
    }
}

function renderClosuresHistory() {
    const tbody = document.getElementById('closures-history-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (db.closures.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No hay cierres registrados aún.</td></tr>`;
        return;
    }

    const fmt = n => Number(n).toLocaleString('es-UY');
    db.closures.forEach(c => {
        const date = new Date(c.closure_date);
        const dateStr = date.toLocaleDateString('es-UY', { day:'2-digit', month:'2-digit', year:'numeric' });
        const timeStr = date.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });

        tbody.innerHTML += `
            <tr onclick="openClosureDetailModal('${c.id}')" class="clickable-row" title="Ver detalle">
                <td><strong>${dateStr}</strong><br><small style="color:var(--text-dim)">${timeStr}</small></td>
                <td style="color:var(--success)">$${fmt(c.income_amount || 0)}</td>
                <td style="color:var(--danger)">$${fmt(c.egress_amount || 0)}</td>
                <td>$${fmt(c.cash_amount)}</td>
                <td>$${fmt(c.digital_amount)}</td>
                <td style="font-weight:700;">$${fmt(c.total_amount)}</td>
                <td class="text-right" style="font-size:0.75rem; color:var(--text-dim); max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${c.note || '-'}
                </td>
            </tr>
        `;
    });
    refreshIcons();
}

function getClosureTransactions(closure) {
    // Devuelve todas las transacciones que pertenecen a este cierre: las que
    // ocurrieron el mismo día del cierre, ANTES de la hora del cierre, y DESPUÉS
    // del cierre anterior del mismo día (si hay).
    const closureDate = new Date(closure.closure_date);
    // Cierre anterior del mismo día (si existe)
    const sameDayPrior = db.closures
        .filter(c => c.id != closure.id && isSameDay(c.closure_date, closure.closure_date)
            && new Date(c.closure_date) < closureDate)
        .sort((a, b) => new Date(b.closure_date) - new Date(a.closure_date))[0];
    const lowerBound = sameDayPrior ? new Date(sameDayPrior.closure_date) : null;
    return db.transactions.filter(t => {
        if (!isSameDay(t.date, closure.closure_date)) return false;
        const td = new Date(t.date);
        if (td > closureDate) return false;
        if (lowerBound && td <= lowerBound) return false;
        return true;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
}

function openClosureDetailModal(closureId) {
    const c = db.closures.find(x => x.id == closureId);
    if (!c) return;

    const fmt = n => Number(n).toLocaleString('es-UY', { minimumFractionDigits: 0 });
    const date = new Date(c.closure_date);
    const dateStr = date.toLocaleDateString('es-UY', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    const timeStr = date.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });

    const txs = getClosureTransactions(c);

    // Agrupar transacciones por fecha (para pagos mixtos)
    const grouped = {};
    txs.forEach(t => {
        if (!grouped[t.date]) grouped[t.date] = [];
        grouped[t.date].push(t);
    });

    let txRowsHTML = '';
    if (txs.length === 0) {
        txRowsHTML = `<div style="text-align:center; padding:1.5rem; color:var(--text-dim); font-size:.85rem;">Sin movimientos registrados para este cierre.</div>`;
    } else {
        Object.values(grouped).forEach(group => {
            const main = group.find(g => !txIsTip(g)) || group[0];
            const time = new Date(main.date).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
            let amountSum = 0, tipSum = 0;
            const breakdownLines = [];
            const txIds = group.map(g => g.id);
            group.forEach(g => {
                if (txIsTip(g)) tipSum += g.amount;
                else if (g.isIncome) amountSum += g.amount;
                else amountSum -= g.amount;
                const methodLabel = g.method === 'tarjeta_debito' ? 'T.Débito'
                    : g.method === 'tarjeta_credito' ? 'T.Crédito' : g.method;
                breakdownLines.push(`<span style="color:var(--text-dim);">${methodLabel}: $${fmt(g.amount)}</span>`);
            });
            const cleanDetail = (main.detail || 'Servicio').split(' (')[0];
            const sign = amountSum >= 0 ? '+' : '-';
            const color = amountSum >= 0 ? 'var(--success)' : 'var(--danger)';
            const isGroup = group.length > 1;
            const idsAttr = txIds.join(',');

            txRowsHTML += `
                <div class="closure-tx-row" style="display:flex; align-items:center; gap:.6rem; padding:.55rem .65rem; background:rgba(255,255,255,.02); border:1px solid var(--border-subtle); border-radius:6px; margin-bottom:6px;">
                    <div style="font-size:.72rem; color:var(--text-dim); min-width:42px;">${time}</div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:.85rem; font-weight:600; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${main.clientName || (main.isIncome ? 'General' : 'Retiro')}</div>
                        <div style="font-size:.72rem; color:var(--text-dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${cleanDetail} · ${breakdownLines.join(' · ')}${tipSum ? ` · <span style="color:var(--gold-400);">Propina $${fmt(tipSum)}</span>` : ''}</div>
                    </div>
                    <div style="font-weight:700; color:${color}; font-size:.9rem; white-space:nowrap;">${sign}$${fmt(Math.abs(amountSum))}</div>
                    <button class="btn-icon btn-edit-closure-tx" data-tx-ids="${idsAttr}" title="Editar" style="padding:5px;"><i data-lucide="edit-2" style="width:14px;height:14px;color:var(--violet-300);"></i></button>
                    <button class="btn-icon btn-del-closure-tx" data-tx-ids="${idsAttr}" title="Eliminar" style="padding:5px;"><i data-lucide="trash-2" style="width:14px;height:14px;color:var(--danger);"></i></button>
                </div>`;
        });
    }

    document.getElementById('closure-detail-body').innerHTML = `
        <div style="background: linear-gradient(135deg, rgba(91,58,138,0.2), rgba(201,168,76,0.1)); border-radius:16px; padding:20px; text-align:center; margin-bottom:16px; border: 1px solid rgba(155,114,212,0.25);">
            <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:1.5px; margin-bottom:6px; font-weight:600;">Balance del Cierre</div>
            <div style="font-size:2.4rem; font-weight:900; color:var(--success);">$${fmt(c.total_amount)}</div>
            <div style="font-size:0.8rem; color:var(--text-dim); margin-top:4px;">${dateStr} · ${timeStr}</div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:1rem;">
            <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:6px;">
                <div style="font-size:0.68rem; color:var(--text-dim); text-transform:uppercase;">Efectivo</div>
                <div style="font-size:1rem; font-weight:700; color:var(--text-primary);">$${fmt(c.cash_amount)}</div>
            </div>
            <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:6px;">
                <div style="font-size:0.68rem; color:var(--text-dim); text-transform:uppercase;">Digital</div>
                <div style="font-size:1rem; font-weight:700; color:var(--text-primary);">$${fmt(c.digital_amount)}</div>
            </div>
        </div>

        <div style="margin-bottom:1rem;">
            <div style="font-size:.72rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:.5px; margin-bottom:.5rem; display:flex; justify-content:space-between; align-items:center;">
                <span>Movimientos incluidos (${txs.length})</span>
            </div>
            <div style="max-height:280px; overflow-y:auto; padding-right:4px;">
                ${txRowsHTML}
            </div>
        </div>

        <div style="background:rgba(255,255,255,0.03); padding:10px; border-radius:6px; border: 1px solid var(--border); margin-bottom:1rem;">
            <div style="font-size:0.68rem; color:var(--text-dim); text-transform:uppercase; margin-bottom:4px;">Notas / Observaciones</div>
            <div style="font-size:0.82rem; color:var(--text-primary); line-height:1.4;">${c.note || 'Sin observaciones.'}</div>
        </div>

        <div style="display:flex; gap:.5rem; margin-top:1rem;">
            <button id="btn-delete-closure" class="btn btn-ghost btn-sm" style="flex:1; color:var(--danger); border-color:rgba(248,113,113,.3);" data-closure-id="${c.id}">
                <i data-lucide="trash-2"></i> Eliminar cierre
            </button>
        </div>

        <div style="margin-top:.8rem; text-align:center; font-size:0.7rem; color:var(--text-dim);">
            Realizado por ${c.created_by || 'Patricia'}
        </div>
    `;

    // Wire up edit/delete buttons
    document.querySelectorAll('.btn-edit-closure-tx').forEach(btn => {
        btn.onclick = () => {
            const ids = btn.dataset.txIds.split(',');
            editClosureTransaction(ids, c.id);
        };
    });
    document.querySelectorAll('.btn-del-closure-tx').forEach(btn => {
        btn.onclick = () => {
            const ids = btn.dataset.txIds.split(',');
            deleteClosureTransaction(ids, c.id);
        };
    });
    const delClosureBtn = document.getElementById('btn-delete-closure');
    if (delClosureBtn) delClosureBtn.onclick = () => deleteClosureFull(c.id);

    refreshIcons();
    document.getElementById('modal-closure-detail').classList.add('open');
}

async function deleteClosureFull(closureId) {
    const c = db.closures.find(x => x.id == closureId);
    if (!c) return;
    const ok = await showCustomConfirm(
        `¿Eliminar el cierre del ${new Date(c.closure_date).toLocaleDateString('es-UY')} (${new Date(c.closure_date).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})})?\n\nLas transacciones NO se eliminan, solo el cierre.`,
        { title: 'Eliminar cierre', confirmText: 'Eliminar', danger: true }
    );
    if (!ok) return;
    try {
        const isLocalId = String(c.id).startsWith('closure_');
        if (!isLocalId && window.supabaseClient) {
            const { error } = await window.supabaseClient.from('closures').delete().eq('id', c.id);
            if (error) throw error;
        }
        db.closures = db.closures.filter(x => x.id != closureId);
        persistCollectionLocal('closures', db.closures);
        renderClosuresHistory();
        const modal = document.getElementById('modal-closure-detail');
        if (modal) modal.classList.remove('open');
        showToast('Cierre eliminado.', 'success');
    } catch (e) {
        console.error('[Cierre] Error al eliminar:', e);
        showToast('Error al eliminar el cierre: ' + (e.message || e), 'error');
    }
}

async function deleteClosureTransaction(txIds, closureId) {
    if (!txIds || txIds.length === 0) return;
    const txs = db.transactions.filter(t => txIds.includes(String(t.id)));
    if (txs.length === 0) return;
    const main = txs.find(t => !txIsTip(t)) || txs[0];
    const label = `${main.clientName || (main.isIncome ? 'General' : 'Retiro')} · ${(main.detail || '').split(' (')[0]}`;
    const ok = await showCustomConfirm(
        `¿Eliminar el movimiento "${label}"?\n\nEsto borrará ${txs.length} registro(s) y NO se puede deshacer.`,
        { title: 'Eliminar movimiento', confirmText: 'Eliminar', danger: true }
    );
    if (!ok) return;
    try {
        for (const id of txIds) {
            const tx = db.transactions.find(t => String(t.id) === String(id));
            if (!tx) continue;
            const isLocalId = String(id).startsWith('tx_');
            if (!isLocalId && window.supabaseClient) {
                const { error } = await window.supabaseClient.from('transactions').delete().eq('id', id);
                if (error) throw error;
            }
        }
        db.transactions = db.transactions.filter(t => !txIds.includes(String(t.id)));
        persistCollectionLocal('transactions', db.transactions);
        showToast('Movimiento eliminado.', 'success');
        // Refresh closure detail and parent table
        if (typeof renderTransactionsTable === 'function') renderTransactionsTable();
        if (typeof updateStats === 'function') updateStats();
        renderClosuresHistory();
        openClosureDetailModal(closureId);
    } catch (e) {
        console.error('[Cierre] Error al eliminar transacción:', e);
        showToast('Error al eliminar: ' + (e.message || e), 'error');
    }
}

function editClosureTransaction(txIds, closureId) {
    const txs = db.transactions.filter(t => txIds.includes(String(t.id)));
    if (txs.length === 0) return;
    openEditTransactionModal(txs, closureId);
}

function openEditTransactionModal(txs, returnToClosureId) {
    const main = txs.find(t => !txIsTip(t)) || txs[0];
    const tip = txs.find(t => txIsTip(t));

    const fmt = n => Number(n).toLocaleString('es-UY');
    const date = new Date(main.date);
    const timeStr = date.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    const dateStr = date.toLocaleDateString('es-UY', { day:'2-digit', month:'2-digit', year:'numeric' });

    // Construir filas editables para cada parte del pago
    let partsHTML = '';
    txs.forEach((t, idx) => {
        if (txIsTip(t)) return;
        partsHTML += `
            <div style="display:grid; grid-template-columns:1.2fr 1fr; gap:.6rem; margin-bottom:.5rem;">
                <div class="form-group" style="margin:0;">
                    <label style="font-size:.7rem;">Monto ${idx === 0 ? 'principal' : `parte ${idx+1}`} ($)</label>
                    <input type="number" class="edit-tx-amount" data-tx-id="${t.id}" value="${t.amount}" min="0" step="1" onwheel="this.blur()" style="width:100%; padding:.5rem; background:var(--bg-input); border:1px solid var(--border-subtle); border-radius:6px; color:var(--text-primary);">
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="font-size:.7rem;">Método</label>
                    <select class="edit-tx-method" data-tx-id="${t.id}" style="width:100%; padding:.5rem; background:var(--bg-input); border:1px solid var(--border-subtle); border-radius:6px; color:var(--text-primary);">
                        <option value="efectivo" ${t.method === 'efectivo' ? 'selected' : ''}>Efectivo</option>
                        <option value="transferencia" ${t.method === 'transferencia' ? 'selected' : ''}>Transferencia</option>
                        <option value="tarjeta_debito" ${t.method === 'tarjeta_debito' ? 'selected' : ''}>Tarjeta Débito</option>
                        <option value="tarjeta_credito" ${t.method === 'tarjeta_credito' ? 'selected' : ''}>Tarjeta Crédito</option>
                        <option value="seña" ${t.method === 'seña' ? 'selected' : ''}>Seña</option>
                    </select>
                </div>
            </div>
        `;
    });
    if (tip) {
        partsHTML += `
            <div style="display:grid; grid-template-columns:1.2fr 1fr; gap:.6rem; margin-bottom:.5rem;">
                <div class="form-group" style="margin:0;">
                    <label style="font-size:.7rem; color:var(--gold-400);">Propina ($)</label>
                    <input type="number" class="edit-tx-amount" data-tx-id="${tip.id}" value="${tip.amount}" min="0" step="1" onwheel="this.blur()" style="width:100%; padding:.5rem; background:var(--bg-input); border:1px solid var(--border-subtle); border-radius:6px; color:var(--text-primary);">
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="font-size:.7rem;">Método propina</label>
                    <select class="edit-tx-method" data-tx-id="${tip.id}" style="width:100%; padding:.5rem; background:var(--bg-input); border:1px solid var(--border-subtle); border-radius:6px; color:var(--text-primary);">
                        <option value="efectivo" ${tip.method === 'efectivo' ? 'selected' : ''}>Efectivo</option>
                        <option value="transferencia" ${tip.method === 'transferencia' ? 'selected' : ''}>Transferencia</option>
                    </select>
                </div>
            </div>
        `;
    }

    const bodyHTML = `
        <div style="background:rgba(91,58,138,0.1); border-radius:8px; padding:.8rem; margin-bottom:1rem;">
            <div style="font-size:.75rem; color:var(--text-dim);">Movimiento del ${dateStr} a las ${timeStr}</div>
            <div style="font-size:.95rem; font-weight:700; color:var(--text-primary); margin-top:2px;">${main.clientName || (main.isIncome ? 'General' : 'Retiro')}</div>
            <div style="font-size:.78rem; color:var(--text-dim); margin-top:2px;">${(main.detail || '').split(' (')[0]} · ${main.employee || ''}</div>
        </div>
        ${partsHTML}
        <div style="display:flex; gap:.5rem; margin-top:1rem;">
            <button id="btn-cancel-edit-tx" class="btn btn-ghost btn-sm" style="flex:1;">Cancelar</button>
            <button id="btn-save-edit-tx" class="btn btn-primary btn-sm" style="flex:1;" data-tx-ids="${txs.map(t => t.id).join(',')}" data-closure-id="${returnToClosureId || ''}">
                <i data-lucide="check"></i> Guardar cambios
            </button>
        </div>
    `;

    // Reutilizar el modal de detalle de cierre como contenedor temporal de edición
    document.getElementById('closure-detail-body').innerHTML = bodyHTML;
    document.getElementById('modal-closure-detail').classList.add('open');
    refreshIcons();

    document.getElementById('btn-cancel-edit-tx').onclick = () => {
        if (returnToClosureId) openClosureDetailModal(returnToClosureId);
        else document.getElementById('modal-closure-detail').classList.remove('open');
    };
    document.getElementById('btn-save-edit-tx').onclick = async () => {
        await saveTransactionEdits(txs.map(t => t.id), returnToClosureId);
    };
}

async function saveTransactionEdits(txIds, returnToClosureId) {
    const updates = [];
    document.querySelectorAll('.edit-tx-amount').forEach(input => {
        const id = input.dataset.txId;
        const amount = parseFloat(input.value);
        const methodEl = document.querySelector(`.edit-tx-method[data-tx-id="${id}"]`);
        const method = methodEl ? methodEl.value : null;
        if (!isNaN(amount) && amount >= 0) {
            updates.push({ id, amount, method });
        }
    });

    try {
        for (const u of updates) {
            const tx = db.transactions.find(t => String(t.id) === String(u.id));
            if (!tx) continue;
            const isLocalId = String(u.id).startsWith('tx_');
            tx.amount = u.amount;
            if (u.method) tx.method = u.method;
            if (!isLocalId && window.supabaseClient) {
                const payload = { amount: u.amount };
                if (u.method) payload.method = u.method;
                const { error } = await window.supabaseClient.from('transactions').update(payload).eq('id', u.id);
                if (error) throw error;
            }
        }
        persistCollectionLocal('transactions', db.transactions);
        showToast('Movimiento actualizado.', 'success');
        if (typeof renderTransactionsTable === 'function') renderTransactionsTable();
        if (typeof updateStats === 'function') updateStats();
        renderClosuresHistory();
        if (returnToClosureId) openClosureDetailModal(returnToClosureId);
        else document.getElementById('modal-closure-detail').classList.remove('open');
    } catch (e) {
        console.error('[EditTx] Error:', e);
        showToast('Error al guardar: ' + (e.message || e), 'error');
    }
}

// ==========================================
// 8. CRM BASE DE DATOS CLIENTES
// ==========================================
function initCRM() {
    if (window.crmInitialized) return;
    window.crmInitialized = true;

    document.getElementById('btn-new-client').addEventListener('click', () => openClientModal());
    document.getElementById('btn-close-modal').addEventListener('click', closeClientModal);
    document.getElementById('btn-save-client').addEventListener('click', saveClient);
    document.getElementById('btn-delete-client').addEventListener('click', () => {
        if (activeModal) deleteClient(activeModal);
    });
    document.getElementById('search-client-table').addEventListener('input', (e) => renderClientsTable(e.target.value));
    document.getElementById('btn-export-csv').addEventListener('click', exportClientesCSV);
    // Input file para subida de foto (usamos el del HTML si existe)
    let photoInput = document.getElementById('crm-photo-input');
    if (!photoInput) {
        photoInput = document.createElement('input');
        photoInput.type = 'file';
        photoInput.id = 'crm-photo-input';
        photoInput.accept = 'image/*';
        photoInput.classList.add('hidden');
        document.body.appendChild(photoInput);
    }

    // Variable temporal para foto en creación nueva
    window.pendingClientPhoto = null;

    document.getElementById('btn-upload-photo')?.addEventListener('click', () => {
        photoInput.click();
    });

    photoInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { 
            showToast('La imagen excede 5MB', 'error'); 
            photoInput.value = ''; 
            return; 
        }

        // Si no hay cliente guardado aún, guardar foto como preview temporal
        if (!activeModal) {
            window.pendingClientPhoto = file;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = document.getElementById('crm-profile-photo');
                const initials = document.getElementById('cm-initials');
                img.src = ev.target.result;
                img.classList.remove('hidden');
                if (initials) initials.classList.add('hidden');
                showToast('Foto seleccionada. Se guardará al crear la clienta.', 'info');
            };
            reader.readAsDataURL(file);
            photoInput.value = '';
            return;
        }

        // Flujo para clientes existentes
        await uploadClientPhoto(file, activeModal);
        photoInput.value = '';
    });

    // Input file oculto para archivos de trabajo
    let hiddenWorkFileInput = document.getElementById('cm-work-file');
    if (!hiddenWorkFileInput) {
        hiddenWorkFileInput = document.createElement('input');
        hiddenWorkFileInput.type = 'file';
        hiddenWorkFileInput.id = 'cm-work-file';
        hiddenWorkFileInput.accept = 'image/*,application/pdf';
        hiddenWorkFileInput.style.display = 'none';
        document.body.appendChild(hiddenWorkFileInput);
    }

    document.getElementById('btn-add-client-file').addEventListener('click', () => {
        if (!activeModal) { showToast('Guardá la clienta primero', 'info'); return; }
        hiddenWorkFileInput.click();
    });

    hiddenWorkFileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        uploadClientFile(activeModal, file);
        hiddenWorkFileInput.value = '';
    });
}

async function uploadClientFile(clientId, file) {
    if (file.size > 10 * 1024 * 1024) { showToast('El archivo excede 10MB', 'error'); return; }
    showToast('Subiendo archivo...', 'info');
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const filePath = `work_files/${clientId}/${Date.now()}.${ext}`;
    
    try {
        const { error: upErr } = await window.supabaseClient.storage
            .from('client-photos')
            .upload(filePath, file, { upsert: true, contentType: file.type });
            
        if (upErr) {
            showToast('Error subiendo archivo: ' + upErr.message, 'error');
            return;
        }
        
        const { data: urlData } = window.supabaseClient.storage.from('client-photos').getPublicUrl(filePath);
        const fileUrl = urlData?.publicUrl;
        
        const { data, error: dbErr } = await window.supabaseClient.from('client_files').insert([{
            client_id: clientId,
            url: fileUrl,
            name: file.name,
            created_at: new Date().toISOString()
        }]).select();
        
        if (dbErr) {
            console.error(dbErr);
            showToast('Archivo subido pero no registrado en BD', 'warning');
            return;
        }
        
        if (data) {
            db.clientFiles.push({ ...data[0], clientId: data[0].client_id });
            renderClientFiles(clientId);
            showToast('Archivo guardado correctamente');
        }
    } catch(e) {
        console.error(e);
        showToast('Error de conexión', 'error');
    }
}

function renderClientFiles(clientId) {
    const list = document.getElementById('cm-files-list');
    if (!list) return;
    list.innerHTML = '';
    const files = db.clientFiles.filter(f => f.clientId == clientId);
    
    if (files.length === 0) {
        list.innerHTML = `<div style="grid-column: 1/-1; font-size:0.75rem; color:var(--text-dim); text-align:center; padding:1rem;">No hay archivos aún.</div>`;
        return;
    }
    
    files.forEach(f => {
        const isImg = /\.(jpg|jpeg|png|webp|gif)$/i.test(f.url);
        list.innerHTML += `
            <div class="client-file-item" onclick="window.open('${f.url}', '_blank')">
                ${isImg ? `<img src="${f.url}" alt="${f.name}">` : `<i data-lucide="file-text" class="file-icon"></i>`}
                <button class="btn-delete-file" onclick="event.stopPropagation(); deleteClientFile('${f.id}')">
                    <i data-lucide="trash-2" style="width:12px;height:12px"></i>
                </button>
            </div>
        `;
    });
    refreshIcons();
}

async function deleteClientFile(fileId) {
    const ok = await showCustomConfirm('¿Eliminar este archivo permanentemente?', { title: 'Eliminar archivo', confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    
    try {
        const { error } = await window.supabaseClient.from('client_files').delete().eq('id', fileId);
        if (!error) {
            db.clientFiles = db.clientFiles.filter(f => f.id != fileId);
            renderClientFiles(activeModal);
            showToast('Archivo eliminado');
        } else {
            showToast('Error al eliminar', 'error');
        }
    } catch(e) {
        showToast('Error de red', 'error');
    }
}

function findDuplicateClient(name, phone) {
    if (!name) return null;
    const cleanName = String(name).trim().toLowerCase();
    const cleanPhone = String(phone || '').trim();
    
    return db.clients.find(c => {
        const cName = String(c.name || '').trim().toLowerCase();
        const cPhone = String(c.phone || '').trim();
        
        if (cleanPhone && cPhone) {
            return cName === cleanName && cPhone === cleanPhone;
        }
        return cName === cleanName;
    });
}

async function createClient(name, phone = '') {
    // Evitar duplicados automáticamente: si ya existe, devolver la ficha existente
    const existing = findDuplicateClient(name, phone);
    if (existing) {
        showToast(`Usando ficha existente de "${existing.name}"`, 'info');
        return existing;
    }

    const newClientData = withCurrentUser({
        name: name,
        phone: phone || '',
        instagram: '',
        birthday: null,
        notes: '',
        balance: 0,
        debt: 0
    });
    const { data, error } = await insertClientSafe(newClientData);
    if (data && data[0]) {
        db.clients.push(data[0]);
        persistCollectionLocal('clients', db.clients);
        return data[0];
    }
    console.error('Error creando cliente:', error);
    // Fallback local si Supabase falla
    const fallback = { id: createLocalId('client'), ...newClientData, pendingSync: true };
    db.clients.push(fallback);
    persistCollectionLocal('clients', db.clients);
    return fallback;
}

function renderClientsTable(filter = '') {
    const tbody = document.getElementById('clients-tbody');
    tbody.innerHTML = '';
    const query = filter.toLowerCase().trim();
    const matches = db.clients.filter(c => c.name.toLowerCase().includes(query) || (c.phone && c.phone.includes(query)));

    if (matches.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No hay resultados.</td></tr>`;
        return;
    }

    matches.forEach(c => {
        let finHtml = `<span style="color:var(--text-dim)">Al día</span>`;
        if (c.balance > 0) finHtml = `<span style="color:var(--success);"><i data-lucide="arrow-down-circle" style="width:14px;height:14px;vertical-align:middle"></i> +$${c.balance} Seña</span>`;
        if (c.debt > 0) finHtml = `<span style="color:var(--danger);"><i data-lucide="alert-circle" style="width:14px;height:14px;vertical-align:middle"></i> -$${c.debt} Debe</span>`;

        tbody.innerHTML += `
            <tr data-client-id="${c.id}" class="clickable-row client-row" title="Abrir ficha">
                <td>
                    <div class="client-profile-td">
                        <div class="small-avatar">${c.name.substring(0,2).toUpperCase()}</div>
                        <div>
                            <strong>${c.name}</strong><br>
                            <span style="font-size:0.75rem; color:var(--text-dim)">ID: ${String(c.id).substring(0, 8)}</span>
                        </div>
                    </div>
                </td>
                <td>${c.phone || '-'}</td>
                <td>${finHtml}</td>
                <td style="width: 80px;">
                    <button class="btn btn-ghost btn-sm" style="pointer-events:none;">Ver Ficha</button>
                </td>
            </tr>
        `;
    });

    // Attach listeners after render
    tbody.querySelectorAll('.client-row').forEach(row => {
        row.addEventListener('click', () => openClientModal(row.dataset.clientId));
    });
    refreshIcons();
}

function openClientModal(clientId = null) {
    document.getElementById('client-modal').classList.add('open');
    activeModal = clientId;

    const bBadge = document.getElementById('crm-badge-balance');
    bBadge.classList.add('hidden');

    const delBtn = document.getElementById('btn-delete-client');
    if (delBtn) {
        if (clientId) { delBtn.classList.remove('hidden'); } else { delBtn.classList.add('hidden'); }
    }

    if (clientId) {
        const c = db.clients.find(x => x.id == clientId);
        if (c) {
            document.getElementById('cm-name').value = c.name;
            document.getElementById('cm-phone').value = c.phone || '';
            // Asegurar que el Instagram tenga @ al frente
            const igRaw = c.instagram || '';
            document.getElementById('cm-ig').value = igRaw && !igRaw.startsWith('@') ? '@' + igRaw : igRaw;
            document.getElementById('cm-birthday').value = c.birthday || '';
            document.getElementById('cm-notes').value = c.notes || '';
            document.getElementById('cm-initials').textContent = c.name.substring(0,2).toUpperCase();

            // Cargar foto (Supabase URL o fallback base64 en localStorage)
            const photoEl = document.getElementById('crm-profile-photo');
            const initialsEl = document.getElementById('cm-initials');
            const localPhoto = localStorage.getItem(`violet_photo_${c.id}`);
            const photoSrc = c.photo_url || localPhoto || null;
            if (photoSrc) {
                photoEl.src = photoSrc;
                photoEl.classList.remove('hidden');
                initialsEl.classList.add('hidden');
            } else {
                photoEl.classList.add('hidden');
                photoEl.src = '';
                initialsEl.classList.remove('hidden');
            }

            const balanceVal = parseFloat(c.balance) || 0;
            const debtVal = parseFloat(c.debt) || 0;

            if (balanceVal > 0 || debtVal > 0) {
                bBadge.classList.remove('hidden');
                if (balanceVal > 0) {
                    bBadge.innerHTML = `Saldo a favor (Seña): $${fmt(balanceVal)}`;
                    bBadge.style.color = 'var(--info)';
                    bBadge.style.borderColor = 'var(--info)';
                } else {
                    const debtTxs = db.transactions.filter(t => t.clientId == c.id && t.detail && /deuda/i.test(t.detail));
                    let debtInfo = `Deuda pendiente: $${fmt(debtVal)}`;
                    if (debtTxs.length > 0) {
                        const debtDates = debtTxs.map(t => {
                            const d = new Date(t.date);
                            return d.toLocaleDateString('es-UY', { day:'2-digit', month:'2-digit' });
                        });
                        debtInfo += ` (Generada: ${[...new Set(debtDates)].join(', ')})`;
                    }
                    bBadge.innerHTML = `<span style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">${debtInfo} <button type="button" class="btn-cancel-debt" data-client-id="${c.id}" style="background:none;border:1px solid var(--success);color:var(--success);padding:2px 10px;border-radius:4px;font-size:.7rem;font-weight:700;cursor:pointer;transition:all .15s;">Cancelar deuda</button></span>`;
                    bBadge.style.color = 'var(--danger)';
                    bBadge.style.borderColor = 'var(--danger)';
                    // Listener para cancelar deuda
                    setTimeout(() => {
                        const cancelBtn = bBadge.querySelector('.btn-cancel-debt');
                        if (cancelBtn) cancelBtn.addEventListener('click', () => cancelClientDebt(c.id));
                    }, 0);
                }
                bBadge.className = 'badge badge-border';
            }
            document.getElementById('cm-history-section').classList.remove('hidden');
            document.getElementById('cm-files-section').classList.remove('hidden');
            renderClientHistory(clientId);
            renderClientFiles(clientId);
        }
    } else {
        document.getElementById('client-form').reset();
        document.getElementById('cm-ig').value = '@'; // prefijo por defecto
        document.getElementById('cm-initials').innerHTML = `<i data-lucide="user"></i>`;
        document.getElementById('cm-initials').classList.remove('hidden');
        const photoEl = document.getElementById('crm-profile-photo');
        photoEl.src = '';
        photoEl.classList.add('hidden');
        document.getElementById('cm-history-section').classList.add('hidden');
        document.getElementById('cm-files-section').classList.add('hidden');
    }
    refreshIcons();
}

// Eliminar clienta con opción de cascada (transacciones, citas, archivos)
async function deleteClient(clientId) {
    const client = db.clients.find(c => c.id == clientId);
    if (!client) return;

    // Contar registros asociados
    const txCount = db.transactions.filter(t => String(t.clientId || t.client_id) === String(clientId)).length;
    const aptCount = db.appointments.filter(a => String(a.clientId || a.client_id) === String(clientId)).length;
    const fileCount = (db.clientFiles || []).filter(f => String(f.clientId || f.client_id) === String(clientId)).length;
    const hasRecords = txCount + aptCount + fileCount > 0;

    // Paso 1: confirmar eliminación
    const ok = await showCustomConfirm(
        `¿Eliminar a "${client.name}" del directorio?` +
        (hasRecords ? `\n\nTiene ${txCount} transacciones, ${aptCount} citas y ${fileCount} archivos asociados.` : ''),
        { title: 'Eliminar clienta', confirmText: 'Eliminar', danger: true }
    );
    if (!ok) return;

    // Paso 2: si tiene registros, preguntar si borrarlos
    let deleteRecords = false;
    if (hasRecords) {
        deleteRecords = await showCustomConfirm(
            `¿Eliminar también todos los registros de "${client.name}" de la base de datos?\n\n• Sí → se borran transacciones, citas y archivos.\n• No → los registros quedan pero sin clienta asignada.`,
            { title: 'Eliminar registros asociados', confirmText: 'Sí, eliminar todo', cancelText: 'No, conservar registros', danger: true }
        );
    }

    try {
        const isLocal = String(clientId).startsWith('client_');

        if (deleteRecords) {
            // Delete transactions
            if (!isLocal && window.supabaseClient) {
                const { error } = await window.supabaseClient.from('transactions').delete().eq('client_id', clientId);
                if (error) console.error('[DeleteClient] tx error:', error);
            }
            db.transactions = db.transactions.filter(t => t.clientId != clientId && t.client_id != clientId);

            // Delete appointments
            if (!isLocal && window.supabaseClient) {
                const { error } = await window.supabaseClient.from('appointments').delete().eq('client_id', clientId);
                if (error) console.error('[DeleteClient] apt error:', error);
            }
            db.appointments = db.appointments.filter(a => (a.clientId || a.client_id) != clientId);

            // Delete client files (storage + records)
            const clientFiles = (db.clientFiles || []).filter(f => (f.clientId || f.client_id) == clientId);
            for (const f of clientFiles) {
                if (f.file_url && window.supabaseClient) {
                    const path = f.file_url.split('/storage/v1/object/public/')[1];
                    if (path) await window.supabaseClient.storage.from(path.split('/')[0]).remove([path.split('/').slice(1).join('/')]);
                }
                if (f.id && !String(f.id).startsWith('file_') && window.supabaseClient) {
                    await window.supabaseClient.from('client_files').delete().eq('id', f.id);
                }
            }
            db.clientFiles = (db.clientFiles || []).filter(f => (f.clientId || f.client_id) != clientId);
            persistCollectionLocal('clientFiles', db.clientFiles);
            persistCollectionLocal('transactions', db.transactions);
            persistCollectionLocal('appointments', db.appointments);
        }

        // Delete the client
        if (!isLocal && window.supabaseClient) {
            // Delete profile photo from storage
            if (client.photo_url) {
                const path = client.photo_url.split('/storage/v1/object/public/')[1];
                if (path) await window.supabaseClient.storage.from(path.split('/')[0]).remove([path.split('/').slice(1).join('/')]);
            }
            const { error } = await window.supabaseClient.from('clients').delete().eq('id', clientId);
            if (error) { showToast('Error eliminando clienta: ' + error.message, 'error'); return; }
        }
        db.clients = db.clients.filter(c => c.id != clientId);
        persistCollectionLocal('clients', db.clients);

        // Limpiar localStorage asociado
        localStorage.removeItem(`violet_log_${clientId}`);
        localStorage.removeItem(`violet_photo_${clientId}`);

        closeClientModal();
        if (currentView === 'clients') renderClientsTable();
        if (currentView === 'dashboard') initDashboard();
        showToast(`"${client.name}" eliminada${deleteRecords ? ' con todos sus registros' : ''}`, 'success');
    } catch (err) {
        console.error('[DeleteClient]', err);
        showToast('Error al eliminar: ' + (err.message || err), 'error');
    }
}

// Cancelar deuda de una clienta — abre modal para elegir método
async function cancelClientDebt(clientId) {
    const client = db.clients.find(c => c.id == clientId);
    if (!client || !(parseFloat(client.debt) > 0)) return;

    const debtAmount = parseFloat(client.debt);
    const modal = document.getElementById('modal-debt-payment');
    const msg = document.getElementById('debt-payment-msg');
    if (!modal || !msg) return;

    msg.textContent = `Cancelar deuda de $${fmt(debtAmount)} de "${client.name}"`;
    modal.classList.add('open');

    const confirmBtn = document.getElementById('btn-confirm-debt-payment');
    confirmBtn.onclick = async () => {
        const method = document.getElementById('debt-payment-method').value;
        await processDebtPayment(clientId, debtAmount, method);
        modal.classList.remove('open');
    };
}

async function processDebtPayment(clientId, debtAmount, method) {
    const client = db.clients.find(c => c.id == clientId);
    if (!client) return;

    try {
        // 1. Registrar transacción de cancelación de deuda
        const now = new Date();
        const txData = withCurrentUser({
            transaction_date: now.toISOString(),
            is_income: true,
            amount: debtAmount,
            client_name: client.name,
            client_id: client.id,
            detail: `Cancelación de deuda — ${client.name}`,
            method: method || 'efectivo',
            employee: '',
            employee_id: null
        });

        const userId = getUserId();
        if (userId) txData.user_id = userId;

        if (window.supabaseClient) {
            const { data, error } = await window.supabaseClient.from('transactions').insert([txData]).select();
            if (error) {
                // Retry sin columna inexistente
                const m = error.message?.match(/Could not find the '(\w+)' column/i);
                if (m && m[1]) {
                    delete txData[m[1]];
                    const retry = await window.supabaseClient.from('transactions').insert([txData]).select();
                    if (retry.error) { showToast('Error: ' + retry.error.message, 'error'); return; }
                    if (retry.data?.[0]) db.transactions.push({ ...retry.data[0], clientId: client.id, isIncome: true, date: retry.data[0].transaction_date });
                } else {
                    showToast('Error: ' + error.message, 'error');
                    return;
                }
            } else if (data?.[0]) {
                db.transactions.push({ ...data[0], clientId: client.id, isIncome: true, date: data[0].transaction_date });
            }
        } else {
            const localTx = { ...txData, id: createLocalId('tx'), clientId: client.id, isIncome: true, date: txData.transaction_date };
            db.transactions.push(localTx);
        }
        persistCollectionLocal('transactions', db.transactions);

        // 2. Poner deuda en 0
        client.debt = 0;
        if (!String(client.id).startsWith('client_') && window.supabaseClient) {
            await updateClientSafe(client.id, { debt: 0 });
        }
        persistCollectionLocal('clients', db.clients);

        // 3. Log
        addClientLog(clientId, `✅ Deuda cancelada: $${fmt(debtAmount)} (${method})`);

        // 4. Refresh UI
        showToast(`Deuda de $${fmt(debtAmount)} cancelada con éxito`, 'success');
        openClientModal(clientId); // refresca la ficha
        if (currentView === 'caja') updateStats();
        if (currentView === 'dashboard') initDashboard();
    } catch (err) {
        console.error('[CancelDebt]', err);
        showToast('Error cancelando deuda: ' + (err.message || err), 'error');
    }
}

// Devuelve mensajes del log de notas de citas de una clienta
function getClientAppointmentNotes(clientId) {
    const logs = JSON.parse(localStorage.getItem(`violet_log_${clientId}`) || '[]');
    return logs.filter(l => l.msg.startsWith('📋 Nota de cita')).map(l => {
        const d = new Date(l.ts).toLocaleDateString('es-UY', { day:'2-digit', month:'2-digit' });
        return `${d}: ${l.msg.replace(/^📋 Nota de cita \([^)]+\): /, '')}`;
    });
}

function addClientLog(clientId, message) {
    const key = `violet_log_${clientId}`;
    const logs = JSON.parse(localStorage.getItem(key) || '[]');
    logs.unshift({ ts: new Date().toISOString(), msg: message });
    if (logs.length > 30) logs.pop();
    localStorage.setItem(key, JSON.stringify(logs));
}

function renderClientHistory(clientId) {
    const section = document.getElementById('cm-history-section');
    const list = document.getElementById('cm-history-list');
    if (!list) return;
    
    list.innerHTML = '';
    const client = db.clients.find(c => c.id == clientId);
    
    // 1. Mostrar Deudas Pendientes Específicas
    if (client && parseFloat(client.debt) > 0) {
        const debtTxs = db.transactions.filter(t => t.clientId == clientId && t.isIncome && t.detail && /(deuda|generó|pendiente)/i.test(t.detail));
        let dateInfo = "Fecha de generación desconocida";
        let detailInfo = "";
        if (debtTxs.length > 0) {
            const sortedDebtTxs = [...debtTxs].sort((a,b) => new Date(a.date) - new Date(b.date));
            const dates = sortedDebtTxs.map(t => new Date(t.date).toLocaleDateString('es-UY', { day:'2-digit', month:'2-digit', year:'numeric' }));
            dateInfo = `Generada: ${[...new Set(dates)].join(', ')}`;
            const details = sortedDebtTxs.map(t => t.detail.split('(')[0].replace('🪙 Propina —', '').trim());
            detailInfo = `<div style="font-size:0.72rem;color:var(--danger);margin-top:2px;">Tratamiento: ${[...new Set(details)].join(', ')}</div>`;
        }
        
        list.innerHTML += `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--danger-bg);border-radius:var(--radius-sm);border:1px solid var(--danger);margin-bottom:8px;">
                <div>
                    <div style="font-size:0.8rem;font-weight:700;color:var(--danger);">DEUDA PENDIENTE ACTUAL</div>
                    <div style="font-size:0.72rem;color:var(--text-dim);">${dateInfo}</div>
                    ${detailInfo}
                </div>
                <div style="font-weight:800;color:var(--danger);font-size:1rem;">$${fmt(parseFloat(client.debt))}</div>
            </div>
        `;
    }

    // 2. Historial de Servicios
    const grouped = {};
    db.transactions
        .filter(t => t.clientId == clientId && t.isIncome && !(t.detail || '').includes('Propina'))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .forEach(t => {
            const d = t.date.split('T')[0];
            if (!grouped[d]) grouped[d] = [];
            grouped[d].push(t);
        });

    const visitsHtml = Object.keys(grouped).slice(0, 20).map(dateKey => {
        const group = grouped[dateKey];
        const dateStr = new Date(dateKey + 'T12:00:00').toLocaleDateString('es-UY', { day:'2-digit', month:'2-digit', year:'numeric' });
        
        // Buscar notas de citas para este día
        const aptNote = db.appointments.find(a => a.clientId == clientId && getAppointmentDate(a) === dateKey)?.notes;
        const noteHtml = aptNote ? `<div style="font-size:0.7rem; color:var(--info); margin-top:4px; font-style:italic;">Nota: ${aptNote}</div>` : '';

        return group.map(t => {
            const badgeClass = t.method === 'efectivo' ? 'badge-efectivo' : (t.method === 'seña' ? 'badge-seña' : (t.method?.startsWith('tarjeta') ? 'badge-tarjeta' : 'badge-transferencia'));
            const cleanDetail = (t.detail || 'Servicio').split(' (')[0].split(' — ')[0];
            
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:rgba(15,10,24,0.4);border-radius:var(--radius-sm);border-left:3px solid var(--violet-500); margin-bottom:4px;">
                <div>
                    <div style="font-size:0.85rem;font-weight:600;">${cleanDetail}</div>
                    <div style="font-size:0.72rem;color:var(--text-dim);">${dateStr} · ${t.employee || 'Local'}</div>
                    ${noteHtml}
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span class="badge ${badgeClass}" style="font-size:0.6rem;">${t.method}</span>
                    <span style="font-weight:700;color:var(--success);font-size:0.9rem;">$${fmt(t.amount)}</span>
                </div>
            </div>`;
        }).join('');
    }).join('');

    list.innerHTML += visitsHtml || `<div style="text-align:center; padding:1rem; color:var(--text-dim); font-size:0.8rem;">No hay servicios registrados.</div>`;
    refreshIcons();
}

function closeClientModal() {
    document.getElementById('client-modal').classList.remove('open');
    activeModal = null;
}

async function saveClient() {
    const name = document.getElementById('cm-name').value.trim();
    if (!name) {
        document.getElementById('cm-name').focus();
        document.getElementById('cm-name').style.borderBottomColor = 'var(--danger)';
        setTimeout(() => document.getElementById('cm-name').style.borderBottomColor = '', 2000);
        return showToast('Completá el nombre de la clienta (primer campo)', 'error');
    }

    const clientData = withCurrentUser({
        name,
        phone: document.getElementById('cm-phone').value,
        instagram: document.getElementById('cm-ig').value,
        birthday: document.getElementById('cm-birthday').value || null,
        notes: document.getElementById('cm-notes').value
    });

    const btn = document.getElementById('btn-save-client');

    // Chequeo de duplicados (solo para creación nueva)
    if (!activeModal) {
        const dup = findDuplicateClient(clientData.name, clientData.phone);
        if (dup) {
            const use = await showCustomConfirm(
                `Ya existe "${dup.name}"${dup.phone ? ' (' + dup.phone + ')' : ''}.\n\n"Abrir existente" = ir a la ficha actual.\n"Crear duplicada" = registrarla aunque sea similar.`,
                { title: 'Clienta duplicada', confirmText: 'Abrir existente', cancelText: 'Crear duplicada' }
            );
            if (use) {
                btn.disabled = false;
                closeClientModal();
                openClientModal(dup.id);
                return;
            }
        }
    }

    btn.disabled = true;

    if (activeModal) {
        const prev = db.clients.find(c => c.id == activeModal);
        const { error } = await updateClientSafe(activeModal, clientData);
        if (error) {
            console.error('[Client] Update Error:', error);
            const localClient = db.clients.find(c => c.id == activeModal);
            if (!localClient) {
                showToast('Error al guardar perfil: ' + (error.message || ''), 'error');
                btn.disabled = false;
                return;
            }
            Object.assign(localClient, clientData, { pendingSync: true });
            persistCollectionLocal('clients', db.clients);
            showToast('Perfil guardado localmente. Revisar sincronización con Supabase.', 'warning');
        } else {
            Object.assign(db.clients.find(c => c.id == activeModal), clientData);
            persistCollectionLocal('clients', db.clients);
        }
        // Log de cambios
        const changes = [];
        if (prev.name !== clientData.name) changes.push(`Nombre: "${prev.name}" → "${clientData.name}"`);
        if ((prev.phone||'') !== clientData.phone) changes.push(`Teléfono actualizado`);
        if ((prev.notes||'') !== clientData.notes) changes.push(`Notas actualizadas`);
        if ((prev.birthday||'') !== (clientData.birthday||'')) changes.push(`Cumpleaños actualizado`);
        if (changes.length > 0) addClientLog(activeModal, '✏️ ' + changes.join(' | '));
    } else {
        const { data: newClients, error } = await insertClientSafe({
            ...clientData,
            balance: 0,
            debt: 0
        });
        if (error) {
            console.error('Error creando clienta:', error);
            const fallbackClient = {
                ...clientData,
                id: createLocalId('client'),
                balance: 0,
                debt: 0,
                pendingSync: true
            };
            db.clients.push(fallbackClient);
            persistCollectionLocal('clients', db.clients);
            showToast('Clienta guardada localmente. Revisar sincronización con Supabase.', 'warning');
        } else {
            const savedClient = newClients?.[0] || {
                ...clientData,
                id: createLocalId('client'),
                balance: 0,
                debt: 0
            };
            db.clients.push(savedClient);
            persistCollectionLocal('clients', db.clients);

            // Subir foto pendiente si se seleccionó durante la creación
            if (window.pendingClientPhoto && savedClient.id && !String(savedClient.id).startsWith('local_')) {
                await uploadClientPhoto(window.pendingClientPhoto, savedClient.id);
                window.pendingClientPhoto = null;
            }
        }
    }

    btn.disabled = false;

    // Obtener el cliente recién guardado o editado
    const savedClient = activeModal
        ? db.clients.find(c => c.id == activeModal)
        : db.clients[db.clients.length - 1];

    closeClientModal();
    if (currentView === 'clients') renderClientsTable();
    if (currentView === 'dashboard') initDashboard();
    showToast('Ficha guardada exitosamente', 'success');

    // Si veníamos desde el autocomplete de agenda, ejecutar callback y reabrir modal de cita
    if (_clientModalSavedCallback && savedClient) {
        const cb = _clientModalSavedCallback;
        const shouldReopenAgenda = _reopenAgendaAfterSave;
        _clientModalSavedCallback = null;
        _reopenAgendaAfterSave = false;
        cb(savedClient);
        // Solo reabrir modal de agenda si vino desde allí (no desde caja u otro lugar)
        if (shouldReopenAgenda && !document.getElementById('modal-appointment').classList.contains('open')) {
            openAgendarModal();
        }
    }
}

// ==========================================
// 9. ANALÍTICAS (Chart.js)
// ==========================================
// initAnalytics merged above

function updateCharts() {
    // 0. Tarjetas de resumen (mes corriente)
    updateAnalyticsStatCards();

    // 1. Ingresos últimos 7 días (datos reales)
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const last7Days = [];
    const last7Labels = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const str = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        last7Days.push(str);
        last7Labels.push(i === 0 ? 'Hoy' : dayNames[d.getDay()]);
    }
    const revenueData = last7Days.map(dayStr =>
        db.transactions
            .filter(t => t.isIncome && t.method !== 'seña' && t.date.substring(0, 10) === dayStr)
            .reduce((sum, t) => sum + t.amount, 0)
    );

    const ctxR = document.getElementById('revenueChart').getContext('2d');
    if(charts.revenue) charts.revenue.destroy();
    const grad = ctxR.createLinearGradient(0, 0, 0, 300);
    grad.addColorStop(0, 'rgba(201,168,76,0.3)');
    grad.addColorStop(1, 'rgba(91,58,138,0.0)');

    charts.revenue = new Chart(ctxR, {
        type: 'line',
        data: {
            labels: last7Labels,
            datasets: [{
                label: 'Ingresos Totales ($)',
                data: revenueData,
                borderColor: '#c9a84c',
                backgroundColor: grad,
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#1a0a2e',
                pointBorderColor: '#c9a84c',
                pointBorderWidth: 3,
                pointRadius: 5
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(155,114,212,0.1)' } },
                x: { grid: { display: false } }
            }
        }
    });

    // 2. Gráfico de Dona (Métodos de pago, datos reales)
    const incomeTrans = db.transactions.filter(t => t.isIncome);
    const efectivoTotal = incomeTrans.filter(t => t.method === 'efectivo').reduce((s, t) => s + t.amount, 0);
    const transferTotal = incomeTrans.filter(t => t.method === 'transferencia').reduce((s, t) => s + t.amount, 0);
    const senaTotal = incomeTrans.filter(t => t.method === 'seña').reduce((s, t) => s + t.amount, 0);
    const totalPay = efectivoTotal + transferTotal + senaTotal || 1; // evitar división por 0

    const ctxP = document.getElementById('paymentChart').getContext('2d');
    if(charts.payment) charts.payment.destroy();

    charts.payment = new Chart(ctxP, {
        type: 'doughnut',
        data: {
            labels: ['Efectivo', 'Transferencia', 'Señas'],
            datasets: [{
                data: [
                    Math.round(efectivoTotal / totalPay * 100),
                    Math.round(transferTotal / totalPay * 100),
                    Math.round(senaTotal / totalPay * 100)
                ],
                backgroundColor: ['#c9a84c', '#7b52b5', '#60a5fa'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            cutout: '75%', responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15 } } }
        }
    });

    // 3. Renderizar Lista de Mejores clientas
    const ranking = document.getElementById('ranking-clients');
    const clientsData = db.clients.filter(c => c.name).map(c => {
        const transCount = db.transactions.filter(t => t.clientId === c.id).length;
        return { name: c.name, count: transCount };
    }).sort((a,b) => b.count - a.count).slice(0, 4);
    
    ranking.innerHTML = clientsData.length === 0 ? `<li class="ranking-item"><span style="color:var(--text-dim);font-size:0.85rem">Aún no hay clientas registradas.</span></li>` : '';
    clientsData.forEach((c, idx) => {
        if(c.count > 0) {
            ranking.innerHTML += `<li class="ranking-item"><div class="rank-number">${idx+1}</div><div class="rank-name">${c.name}</div><div class="rank-value">${c.count} Visitas</div></li>`;
        }
    });

    const dateInput = document.getElementById('employee-cash-date');
    if (dateInput) {
        if (!dateInput.value) {
            const todayLocal = new Date();
            dateInput.value = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth()+1).padStart(2,'0')}-${String(todayLocal.getDate()).padStart(2,'0')}`;
        }
        dateInput.removeEventListener('change', renderEmployeeCashTable);
        dateInput.addEventListener('change', renderEmployeeCashTable);
        renderEmployeeCashTable();
    }
    renderServicesRanking();
}

function updateAnalyticsStatCards() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const inCurrentMonth = (val) => {
        if (!val) return false;
        const d = new Date(val);
        return !isNaN(d) && d.getFullYear() === year && d.getMonth() === month;
    };

    const monthlyIncomeTx = (db.transactions || []).filter(t =>
        t.isIncome && !isTipTransaction(t) && t.method !== 'seña' && inCurrentMonth(t.date)
    );
    const monthlyIncome = monthlyIncomeTx.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

    const monthlyAppointments = (db.appointments || []).filter(a => inCurrentMonth(getAppointmentDate(a))).length;

    const monthlyNewClients = (db.clients || []).filter(c => inCurrentMonth(c.created_at || c.createdAt)).length;

    const avgTicket = monthlyIncomeTx.length ? monthlyIncome / monthlyIncomeTx.length : 0;

    const fmtMoney = n => '$' + Number(n).toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    setText('stat-income-month', fmtMoney(monthlyIncome));
    setText('stat-appointments-count', monthlyAppointments);
    setText('stat-new-clients', monthlyNewClients);
    setText('stat-avg-ticket', fmtMoney(avgTicket));
}

function renderEmployeeCashTable() {
    const tbody = document.getElementById('employee-cash-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const dateEl = document.getElementById('employee-cash-date');
    if (!dateEl) return;
    const selectedDateStr = dateEl.value;
    const todaysTrans = db.transactions.filter(t => isSameDay(t.date, selectedDateStr + 'T12:00:00') && t.isIncome);

    if (db.employees.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:2rem;">No hay funcionarias configuradas.</td></tr>`;
        return;
    }

    db.employees.forEach(emp => {
        const empTrans = todaysTrans.filter(t => t.employee === emp.name);
        const trabajos = empTrans.length;
        
        let efectivo = 0;
        let transfe = 0;
        
        empTrans.forEach(t => {
            if (t.method === 'efectivo') efectivo += t.amount;
            else if (t.method === 'transferencia') transfe += t.amount;
        });
        
        const total = efectivo + transfe;
        // Optionally show all employees even with 0, or just those with ops. We'll show all but faintly if 0.
        const opacity = total > 0 ? '1' : '0.6';
        
        const tr = document.createElement('tr');
        tr.style.opacity = opacity;
        tr.innerHTML = `
            <td><div style="font-weight:600;color:var(--text-primary)"><i data-lucide="user" style="width:14px;height:14px;vertical-align:middle;margin-right:5px;"></i>${emp.name}</div></td>
            <td>${trabajos}</td>
            <td class="text-right" style="color:var(--success)">$${efectivo.toFixed(2)}</td>
            <td class="text-right" style="color:var(--info)">$${transfe.toFixed(2)}</td>
            <td class="text-right" style="font-weight:700;color:var(--gold-400)">$${total.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });
    refreshIcons();
}

function renderServicesRanking() {
    const list = document.getElementById('ranking-services');
    
    // Contar servicios
    const srvCount = {};
    db.transactions.filter(t => t.isIncome && t.detail).forEach(t => {
        // Strip emojis, propina prefixes and parenthetical notes
        let name = t.detail.split(' (')[0].split(' — ')[0].replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
        if (name.toLowerCase().includes('propina')) return; // Ignore tips in ranking
        if (!name) name = 'Servicio General';
        srvCount[name] = (srvCount[name] || 0) + 1;
    });

    const sortedSrv = Object.keys(srvCount).map(k => ({ name: k, count: srvCount[k] })).sort((a,b) => b.count - a.count).slice(0, 4);

    list.innerHTML = sortedSrv.length === 0 ? `<li class="ranking-item"><span style="color:var(--text-dim);font-size:0.85rem">Sin datos de servicios aún.</span></li>` : '';
    
    sortedSrv.forEach((s, idx) => {
        list.innerHTML += `<li class="ranking-item"><div class="rank-number" style="color:var(--violet-200);border-color:var(--violet-200)">${idx+1}</div><div class="rank-name">${s.name}</div><div class="rank-value">${s.count} Veces</div></li>`;
    });
}

// ==========================================
// 10. CONFIGURACIÓN (Gestión Modales)
// ==========================================

let editingServiceId = null;
let editingEmployeeId = null;

let _settingsInitialized = false;
function initSettings() {
    if (!_settingsInitialized) {
        _settingsInitialized = true;

        document.getElementById('modal-srv-close').addEventListener('click', closeServiceModal);
        document.getElementById('modal-emp-close').addEventListener('click', closeEmployeeModal);
        const productClose = document.getElementById('modal-product-close');
        if (productClose) productClose.addEventListener('click', closeProductModal);

        // Habilitar/deshabilitar precio según tipo seleccionado
        document.getElementById('srv-type').addEventListener('change', (e) => {
            setSrvPriceState(e.target.value);
        });

        document.getElementById('fm-service').addEventListener('submit', (e) => { e.preventDefault(); saveService(); });
        document.getElementById('fm-employee').addEventListener('submit', (e) => { e.preventDefault(); saveEmployee(); });
        const productForm = document.getElementById('fm-product');
        if (productForm) productForm.addEventListener('submit', (e) => { e.preventDefault(); saveProduct(); });

        // Cargar clave IA guardada
        const savedKey = localStorage.getItem('violet_ai_key');
        if (savedKey) document.getElementById('ai-api-key-input').value = savedKey;

        document.getElementById('btn-save-api-key').addEventListener('click', () => {
            const key = document.getElementById('ai-api-key-input').value.trim();
            if (!key) { showToast('Ingresá una clave válida', 'error'); return; }
            localStorage.setItem('violet_ai_key', key);
            showToast('Clave API guardada correctamente');
        });
    }

    // Estos renders se ejecutan siempre para refrescar los datos
    renderServicesList();
    renderProductsList();
    renderEmployeesList();
    updateFormSelects();
    if (typeof renderStaffPanel === 'function') renderStaffPanel();
    initBusinessConfigUI();
}

let _businessConfigInitialized = false;
function initBusinessConfigUI() {
    const cfg = getBusinessConfig();
    const openEl = document.getElementById('cfg-open-time');
    if (!openEl) return; // por si el settings no está montado

    // — Valores actuales en los selects —
    openEl.value = cfg.openTime || '';
    document.getElementById('cfg-close-time').value = cfg.closeTime || '';
    document.getElementById('cfg-time-format').value = cfg.timeFormat || '24h';

    // Sincronizar los custom selects de hora con los valores cargados
    ['cfg-open-time', 'cfg-close-time'].forEach(id => syncCustomSelect(id));
    syncCustomSelect('cfg-time-format');

    // Días de la semana (siempre se re-renderizan)
    const daysContainer = document.getElementById('cfg-closed-days');
    if (daysContainer) daysContainer.closest('.form-group').style.display = 'none';
    const dayNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    daysContainer.innerHTML = '';
    dayNames.forEach((name, idx) => {
        const isChecked = (cfg.closedDays || []).includes(idx);
        const lbl = document.createElement('label');
        lbl.style.cssText = 'display:flex;align-items:center;gap:4px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:.85rem;' + (isChecked ? 'background:var(--danger);color:#fff;border-color:var(--danger);' : '');
        lbl.innerHTML = `<input type="checkbox" data-day="${idx}" ${isChecked ? 'checked' : ''} style="margin:0;"> ${name}`;
        lbl.querySelector('input').addEventListener('change', (e) => {
            lbl.style.cssText = 'display:flex;align-items:center;gap:4px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:.85rem;' + (e.target.checked ? 'background:var(--danger);color:#fff;border-color:var(--danger);' : '');
        });
        daysContainer.appendChild(lbl);
    });

    const weeklyContainer = document.getElementById('cfg-weekly-hours');
    if (weeklyContainer) {
        let timeOptions = '';
        for (let h = 0; h < 24; h++) {
            for (let m = 0; m < 60; m += 30) {
                const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                timeOptions += `<option value="${value}">${value}</option>`;
            }
        }
        weeklyContainer.innerHTML = '';
        dayNames.forEach((name, idx) => {
            const dayCfg = cfg.weeklyHours?.[String(idx)] || {};
            const isClosed = Boolean(dayCfg.closed) || (cfg.closedDays || []).includes(idx);
            const row = document.createElement('div');
            row.className = 'weekly-hours-row';
            row.dataset.day = idx;
            row.innerHTML = `
                <label class="weekly-day"><input type="checkbox" class="cfg-day-closed" ${isClosed ? 'checked' : ''}> ${name} cerrado</label>
                <select class="custom-select cfg-day-open">${timeOptions}</select>
                <select class="custom-select cfg-day-close">${timeOptions}</select>
            `;
            row.querySelector('.cfg-day-open').value = dayCfg.open || cfg.openTime || '09:00';
            row.querySelector('.cfg-day-close').value = dayCfg.close || cfg.closeTime || '20:00';
            weeklyContainer.appendChild(row);
        });
        initCustomSelects();
    }

    // Poblar select de empleadas para el bloqueo
    const empSel = document.getElementById('cfg-block-employee');
    if (empSel) {
        empSel.innerHTML = '<option value="">Todo el local</option>' +
            db.employees.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    }

    renderBlockedSlots();

    // — Event Listeners (sólo se registran una vez) —
    if (!_businessConfigInitialized) {
        _businessConfigInitialized = true;

        document.getElementById('btn-add-block').addEventListener('click', () => {
            const d = document.getElementById('cfg-block-date').value;
            const s = document.getElementById('cfg-block-start').value;
            const e = document.getElementById('cfg-block-end').value;
            const r = document.getElementById('cfg-block-reason').value.trim();
            const empId = document.getElementById('cfg-block-employee').value || null;
            if (!d || !s || !e) { showToast('Completá fecha, inicio y fin del bloqueo', 'error'); return; }
            if (e <= s) { showToast('El fin debe ser mayor al inicio', 'error'); return; }
            const current = getBusinessConfig();
            current.blockedSlots = current.blockedSlots || [];
            current.blockedSlots.push({ date: d, start: s, end: e, reason: r, employeeId: empId });
            saveBusinessConfig(current);
            document.getElementById('cfg-block-date').value = '';
            document.getElementById('cfg-block-start').value = '';
            document.getElementById('cfg-block-end').value = '';
            document.getElementById('cfg-block-reason').value = '';
            document.getElementById('cfg-block-employee').value = '';
            renderBlockedSlots();
            showToast('Franja bloqueada agregada');
        });

        // Cuando cambia el formato de hora, regenerar las opciones de los selects de tiempo
        document.getElementById('cfg-time-format').addEventListener('change', () => {
            const current = getBusinessConfig();
            current.timeFormat = document.getElementById('cfg-time-format').value;
            saveBusinessConfig(current);
            populateTimeSelects();
            document.querySelectorAll('.time-select').forEach(sel => {
                const oldWrapper = sel.parentNode.querySelector('.time-select-wrapper');
                if (oldWrapper) oldWrapper.remove();
            });
            initCustomSelects();
            const latest = getBusinessConfig();
            document.getElementById('cfg-open-time').value = latest.openTime || '';
            document.getElementById('cfg-close-time').value = latest.closeTime || '';
            ['cfg-open-time', 'cfg-close-time'].forEach(id => syncCustomSelect(id));
        });

        document.getElementById('btn-save-business-cfg').addEventListener('click', () => {
            const closedDays = Array.from(daysContainer.querySelectorAll('input[type="checkbox"]:checked')).map(i => parseInt(i.dataset.day));
            const weeklyHours = {};
            document.querySelectorAll('#cfg-weekly-hours .weekly-hours-row').forEach(row => {
                const day = row.dataset.day;
                const closed = row.querySelector('.cfg-day-closed')?.checked || false;
                const open = row.querySelector('.cfg-day-open')?.value || '';
                const close = row.querySelector('.cfg-day-close')?.value || '';
                weeklyHours[day] = { closed, open, close };
            });
            const current = getBusinessConfig();
            const newCfg = {
                ...current,
                openTime: document.getElementById('cfg-open-time').value,
                closeTime: document.getElementById('cfg-close-time').value,
                timeFormat: document.getElementById('cfg-time-format').value,
                closedDays,
                weeklyHours
            };
            saveBusinessConfig(newCfg);
            populateTimeSelects();
            showToast('Configuración guardada');
        });

        document.getElementById('btn-reset-business-cfg').addEventListener('click', async () => {
            const ok = await showCustomConfirm(
                '¿Restaurar la configuración de agenda a los valores predeterminados?',
                { title: 'Restaurar configuración', confirmText: 'Restaurar' }
            );
            if (!ok) return;
            localStorage.removeItem('violet_business_config');
            initBusinessConfigUI();
            showToast('Configuración restaurada a predeterminados', 'info');
        });
    }
}

function renderBlockedSlots() {
    const list = document.getElementById('cfg-blocked-list');
    if (!list) return;
    const cfg = getBusinessConfig();
    const slots = cfg.blockedSlots || [];
    list.innerHTML = '';
    if (slots.length === 0) {
        list.innerHTML = `<li style="color:var(--text-dim);font-size:.85rem;padding:8px;">Sin franjas bloqueadas.</li>`;
        return;
    }
    slots.forEach((b, idx) => {
        const li = document.createElement('li');
        li.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid var(--border);';
        const emp = b.employeeId ? db.employees.find(e => e.id == b.employeeId) : null;
        const scope = emp ? `👤 ${emp.name}` : '🏪 Todo el local';
        li.innerHTML = `<span style="font-size:.85rem;">${b.date} · ${b.start} - ${b.end} · <span style="color:var(--violet-300);">${scope}</span>${b.reason ? ' · ' + b.reason : ''}</span>
                        <button class="btn-icon" data-idx="${idx}" title="Eliminar"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>`;
        li.querySelector('button').addEventListener('click', () => {
            const c = getBusinessConfig();
            c.blockedSlots.splice(idx, 1);
            saveBusinessConfig(c);
            renderBlockedSlots();
        });
        list.appendChild(li);
    });
    refreshIcons();
}

// Sincroniza el visual del custom select con el valor del native select
function syncCustomSelect(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const wrapper = sel.closest('.input-wrap')?.querySelector('.custom-select-wrapper')
                 || sel.parentNode.querySelector('.custom-select-wrapper');
    if (!wrapper) return;
    const trigger = wrapper.querySelector('.custom-select-trigger span');
    const opts    = wrapper.querySelectorAll('.custom-option');
    if (trigger) trigger.textContent = sel.options[sel.selectedIndex]?.text || '';
    opts.forEach(o => {
        o.classList.toggle('selected', o.dataset.value === sel.value);
    });
}

function setSrvPriceState(type) {
    const priceInput = document.getElementById('srv-price');
    if (type === 'variable') {
        priceInput.disabled = true;
        priceInput.value = '';
        priceInput.placeholder = 'No aplica';
    } else {
        priceInput.disabled = false;
        priceInput.placeholder = 'Monto ($)';
    }
}

function openServiceModal(id = null) {
    editingServiceId = id;
    document.getElementById('service-modal-title').textContent = id ? 'Editar Servicio' : 'Nuevo Servicio';

    if (id) {
        const s = db.services.find(x => x.id == id);
        if (s) {
            document.getElementById('srv-name').value = s.name;
            document.getElementById('srv-type').value = s.priceType;
            document.getElementById('srv-price').value = s.price || '';
            document.getElementById('srv-duration').value = s.duration || '';
            setSrvPriceState(s.priceType);
            syncCustomSelect('srv-type');
        }
    } else {
        document.getElementById('fm-service').reset();
        // Default: fijo (primer opción del select)
        document.getElementById('srv-type').value = 'fijo';
        setSrvPriceState('fijo');
        syncCustomSelect('srv-type');
    }

    document.getElementById('modal-service').classList.add('open');
    refreshIcons();
}

function closeServiceModal() {
    document.getElementById('modal-service').classList.remove('open');
    editingServiceId = null;
}

async function saveService() {
    const name = document.getElementById('srv-name').value.trim();
    const type = document.getElementById('srv-type').value;
    const priceStr = document.getElementById('srv-price').value;
    const price = priceStr ? parseFloat(priceStr) : null;
    const durationStr = document.getElementById('srv-duration').value;
    const duration = durationStr ? parseInt(durationStr) : null;

    if (!name) return;

    const serviceData = withCurrentUser({
        name: name,
        price_type: type,
        price: type === 'fijo' ? price : null,
        duration: duration
    });

    const submitBtn = document.querySelector('#fm-service [type="submit"]');
    submitBtn.disabled = true;

    // Helper retry para columna faltante en services
    async function svcUpsert(payload, isUpdate) {
        let result = isUpdate
            ? await updateRowSafe('services', editingServiceId, payload)
            : await insertRowsSafe('services', payload);
        if (result.error?.message) {
            const m = result.error.message.match(/Could not find the '(\w+)' column/i);
            if (m && m[1] && m[1] in payload) {
                const clean = { ...payload }; delete clean[m[1]];
                result = isUpdate
                    ? await updateRowSafe('services', editingServiceId, clean)
                    : await insertRowsSafe('services', clean);
            }
        }
        return result;
    }

    if (editingServiceId) {
        const { error } = await svcUpsert(serviceData, true);
        if (error) {
            console.error('[Service] Update Error:', error);
            let s = db.services.find(x => x.id == editingServiceId);
            if (!s) {
                showToast('Error al actualizar servicio', 'error');
                submitBtn.disabled = false;
                return;
            }
            Object.assign(s, { name, priceType: type, price: serviceData.price, duration, pendingSync: true });
            persistCollectionLocal('services', db.services);
            showToast('Servicio guardado localmente. Revisar sincronización con Supabase.', 'warning');
        } else {
            let s = db.services.find(x => x.id == editingServiceId);
            if (s) { s.name = name; s.priceType = type; s.price = serviceData.price; s.duration = duration; }
            persistCollectionLocal('services', db.services);
            showToast('Servicio actualizado');
        }
    } else {
        const { data, error } = await svcUpsert(serviceData, false);
        if (error) {
            console.error('[Service] Insert Error:', error);
            db.services.push({
                id: createLocalId('srv'),
                name,
                priceType: type,
                price: serviceData.price,
                duration,
                pendingSync: true
            });
            persistCollectionLocal('services', db.services);
            showToast('Servicio guardado localmente. Revisar sincronización con Supabase.', 'warning');
        } else {
            const savedItem = data?.[0] || { id: createLocalId('srv'), name, price_type: type, price: serviceData.price, duration };
            db.services.push({ id: savedItem.id, name: savedItem.name, priceType: savedItem.price_type, price: parseFloat(savedItem.price) || null, duration: savedItem.duration ? parseInt(savedItem.duration) : null });
            persistCollectionLocal('services', db.services);
            showToast('Servicio creado');
        }
    }

    submitBtn.disabled = false;
    updateFormSelects();
    renderServicesList();
    closeServiceModal();
}

function openEmployeeModal(id = null) {
    editingEmployeeId = id;
    const modal = document.getElementById('modal-employee');
    document.getElementById('employee-modal-title').textContent = 'Staff';
    
    if (id) {
        const emp = db.employees.find(x => x.id == id);
        if (emp) {
            document.getElementById('emp-name').value = emp.name;
            document.getElementById('emp-join-date').value = emp.joinDate || emp.join_date || '';
            document.getElementById('emp-pay-day').value = emp.payDay || emp.pay_day || '';
            document.getElementById('emp-tips').value = emp.tips || 0;
            document.getElementById('emp-advances').value = emp.advances || 0;
            document.getElementById('emp-color').value = emp.color || '#7b52b5';
        }
    } else {
        document.getElementById('fm-employee').reset();
        document.getElementById('emp-color').value = '#7b52b5';
    }
    modal.classList.add('open');
}

function closeEmployeeModal() {
    document.getElementById('modal-employee').classList.remove('open');
    editingEmployeeId = null;
}

let _savingEmployee = false;
async function saveEmployee() {
    if (_savingEmployee) return;
    const name = document.getElementById('emp-name').value.trim();
    if (!name) return;

    const empColor = document.getElementById('emp-color').value || '#7b52b5';
    const empData = withCurrentUser({
        name: name,
        join_date: document.getElementById('emp-join-date').value || null,
        pay_day: parseInt(document.getElementById('emp-pay-day').value) || null,
        tips: parseFloat(document.getElementById('emp-tips').value) || 0,
        advances: parseFloat(document.getElementById('emp-advances').value) || 0,
        color: empColor
    });

    _savingEmployee = true;
    const submitBtn = document.querySelector('#fm-employee [type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {

    if (editingEmployeeId) {
        // No enviar user_id en updates (es inmutable)
        const updatePayload = { ...empData };
        delete updatePayload.user_id;
        let { error } = await updateRowSafe('employees', editingEmployeeId, updatePayload);
        if (error && error.message) {
            const m = error.message.match(/Could not find the '(\w+)' column/i);
            if (m && m[1] && m[1] in updatePayload) {
                delete updatePayload[m[1]];
                console.warn(`[Employee] Columna '${m[1]}' no existe, reintentando.`);
                const retry = await updateRowSafe('employees', editingEmployeeId, updatePayload);
                error = retry.error;
            }
        }
        if (error) {
            console.error('[Employee] Update Error:', error);
            const localEmp = db.employees.find(x => x.id == editingEmployeeId);
            if (!localEmp) {
                showToast('Error al actualizar funcionaria', 'error');
                submitBtn.disabled = false;
                return;
            }
            Object.assign(localEmp, {
                name: empData.name,
                joinDate: empData.join_date,
                join_date: empData.join_date,
                payDay: empData.pay_day,
                pay_day: empData.pay_day,
                tips: empData.tips,
                advances: empData.advances,
                color: empColor,
                pendingSync: true
            });
            persistCollectionLocal('employees', db.employees);
            localStorage.setItem(`violet_emp_color_${editingEmployeeId}`, empColor);
            showToast('Funcionaria guardada localmente. Revisar sincronización con Supabase.', 'warning');
        } else {
            let emp = db.employees.find(x => x.id == editingEmployeeId);
            if (emp) {
                emp.name = empData.name;
                emp.joinDate = empData.join_date;
                emp.join_date = empData.join_date;
                emp.payDay = empData.pay_day;
                emp.pay_day = empData.pay_day;
                emp.tips = empData.tips;
                emp.advances = empData.advances;
                emp.color = empColor;
            }
            persistCollectionLocal('employees', db.employees);
            localStorage.setItem(`violet_emp_color_${editingEmployeeId}`, empColor);
            showToast('Funcionaria actualizada');
        }
    } else {
        let { data, error } = await insertRowsSafe('employees', empData);
        if (error && error.message) {
            const m = error.message.match(/Could not find the '(\w+)' column/i);
            if (m && m[1] && m[1] in empData) {
                delete empData[m[1]];
                console.warn(`[Employee] Columna '${m[1]}' no existe, reintentando.`);
                const retry = await insertRowsSafe('employees', empData);
                data = retry.data;
                error = retry.error;
            }
        }
        if (error || !data || !data[0]) {
            console.error('[Employee] Insert Error:', error);
            const newEmp = {
                id: createLocalId('emp'),
                name: empData.name,
                joinDate: empData.join_date,
                join_date: empData.join_date,
                payDay: empData.pay_day,
                pay_day: empData.pay_day,
                tips: empData.tips,
                advances: empData.advances,
                color: empColor,
                pendingSync: true
            };
            db.employees.push(newEmp);
            persistCollectionLocal('employees', db.employees);
            localStorage.setItem(`violet_emp_color_${newEmp.id}`, empColor);
            showToast('Funcionaria guardada localmente. Revisar sincronización con Supabase.', 'warning');
        } else {
            const newEmp = {
                id: data[0].id,
                name: data[0].name,
                joinDate: data[0].join_date,
                join_date: data[0].join_date,
                payDay: data[0].pay_day,
                pay_day: data[0].pay_day,
                tips: parseFloat(data[0].tips) || 0,
                advances: parseFloat(data[0].advances) || 0,
                color: data[0].color || empColor
            };
            db.employees.push(newEmp);
            persistCollectionLocal('employees', db.employees);
            localStorage.setItem(`violet_emp_color_${data[0].id}`, newEmp.color);
            showToast('Funcionaria agregada');
        }
    }

    } catch (err) {
        console.error('[Employee] Excepción al guardar:', err);
        showToast('Error inesperado al guardar', 'error');
    } finally {
        _savingEmployee = false;
        if (submitBtn) submitBtn.disabled = false;
        updateFormSelects();
        renderEmployeesList();
        if (typeof renderStaffPanel === 'function') renderStaffPanel();
        if (currentView === 'analytics') updateCharts();
        closeEmployeeModal();
    }
}

function openProductModal(id = null) {
    editingProductId = id;
    const title = document.getElementById('product-modal-title');
    if (title) title.textContent = id ? 'Editar Producto' : 'Nuevo Producto';

    if (id) {
        const product = db.products.find(x => String(x.id) === String(id));
        if (product) {
            document.getElementById('product-name').value = product.name || '';
            document.getElementById('product-price').value = product.price || '';
            document.getElementById('product-stock').value = product.stock ?? '';
        }
    } else {
        document.getElementById('fm-product')?.reset();
    }

    document.getElementById('modal-product')?.classList.add('open');
    refreshIcons();
}

function closeProductModal() {
    document.getElementById('modal-product')?.classList.remove('open');
    editingProductId = null;
}

async function saveProduct() {
    const name = document.getElementById('product-name')?.value.trim();
    const price = parseFloat(document.getElementById('product-price')?.value);
    const stockRaw = document.getElementById('product-stock')?.value;
    const stock = stockRaw === '' ? null : parseFloat(stockRaw);

    if (!name) return showToast('Ingrese el nombre del producto.', 'error');
    if (Number.isNaN(price) || price < 0) return showToast('Ingrese un precio valido.', 'error');
    if (stockRaw !== '' && (Number.isNaN(stock) || stock < 0)) return showToast('Ingrese un stock valido.', 'error');

    const payload = {
        name,
        price,
        stock,
        active: true
    };

    const submitBtn = document.querySelector('#fm-product [type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
        if (editingProductId) {
            const { data, error } = await updateRowSafe('products', editingProductId, payload);
            const local = db.products.find(x => String(x.id) === String(editingProductId));
            const next = data?.[0] || { ...(local || {}), ...payload, id: editingProductId, pendingSync: Boolean(error) };
            if (local) Object.assign(local, next);
            else db.products.push(next);
            persistCollectionLocal('products', db.products);
            showToast(error ? 'Producto guardado localmente' : 'Producto actualizado', error ? 'warning' : 'success');
        } else {
            const { data, error } = await insertRowsSafe('products', payload);
            const saved = data?.[0] || { id: createLocalId('prod'), ...payload, pendingSync: true };
            db.products.push(saved);
            persistCollectionLocal('products', db.products);
            showToast(error ? 'Producto guardado localmente' : 'Producto creado', error ? 'warning' : 'success');
        }
    } catch (err) {
        console.error('[Product] Save Error:', err);
        const fallback = {
            id: editingProductId || createLocalId('prod'),
            ...payload,
            pendingSync: true
        };
        upsertLocalCollectionItem('products', fallback);
        showToast('Producto guardado localmente', 'warning');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
        renderProductsList();
        updateFormSelects();
        closeProductModal();
    }
}

/**
 * Actualiza el stock de un producto localmente y en Supabase.
 * @param {string|number} productId 
 * @param {number} qtyChange - Cantidad a sumar (positiva) o restar (negativa)
 */
async function updateProductStock(productId, qtyChange) {
    const product = db.products.find(p => String(p.id) === String(productId));
    if (!product) return;

    // Si el stock es null, significa que no se controla stock para este producto
    if (product.stock === null || product.stock === undefined) return;

    const newStock = Math.max(0, (parseFloat(product.stock) || 0) + qtyChange);
    product.stock = newStock;
    
    // Persistencia local
    persistCollectionLocal('products', db.products);
    renderProductsList();

    // Persistencia remota
    try {
        const { error } = await updateRowSafe('products', productId, { stock: newStock });
        if (error) {
            console.warn(`[Stock] Error al actualizar stock remoto de ${product.name}:`, error);
            product.pendingSync = true;
            persistCollectionLocal('products', db.products);
        }
    } catch (e) {
        console.error(`[Stock] Excepción al actualizar stock de ${product.name}:`, e);
        product.pendingSync = true;
        persistCollectionLocal('products', db.products);
    }
}

function renderProductsList() {
    const list = document.getElementById('settings-products-list');
    if (!list) return;
    list.innerHTML = '';
    if (!db.products || db.products.length === 0) {
        list.innerHTML = '<span style="color:var(--text-dim);font-size:0.85rem">No hay productos registrados.</span>';
        return;
    }

    db.products.forEach(product => {
        const li = document.createElement('li');
        li.className = 'task-item';
        const stockText = product.stock === null || product.stock === undefined || product.stock === ''
            ? ''
            : `<span style="color:var(--text-dim); font-size:0.78rem; margin-left:8px;">Stock: ${product.stock}</span>`;
        li.innerHTML = `
            <span class="task-text" style="flex:1;">${product.name} <span style="color:var(--violet-200); font-size:0.8rem; margin-left:8px;">$${fmt(getProductPrice(product))}</span>${stockText}</span>
            <div style="display:flex; gap:5px;">
                <button class="btn-icon btn-sm" onclick="openProductModal('${product.id}')" style="padding:0;color:var(--text-dim)"><i data-lucide="edit-2" style="width:14px;height:14px"></i></button>
                <button class="btn-icon btn-sm btn-del-product" data-id="${product.id}" style="padding:0;color:var(--danger)"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
            </div>
        `;
        list.appendChild(li);
    });

    list.querySelectorAll('.btn-del-product').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const { error } = await deleteRowSafe('products', id);
            if (error) console.warn('[Product] Delete remote error:', error);
            db.products = db.products.filter(x => String(x.id) !== String(id));
            persistCollectionLocal('products', db.products);
            renderProductsList();
            updateFormSelects();
            renderPosProducts();
        };
    });
    refreshIcons();
}

function renderServicesList() {
    const list = document.getElementById('settings-services-list');
    list.innerHTML = '';
    if (db.services.length === 0) {
        list.innerHTML = '<span style="color:var(--text-dim);font-size:0.85rem">No hay servicios registrados.</span>';
        return;
    }
    db.services.forEach(s => {
        const li = document.createElement('li');
        li.className = 'task-item';
        li.innerHTML = `
            <span class="task-text" style="flex:1;">${s.name} <span style="color:var(--violet-200); font-size:0.8rem; margin-left: 8px;">(${s.priceType === 'fijo' ? '$' + s.price : 'Var.'})</span></span>
            <div style="display:flex; gap: 5px;">
                <button class="btn-icon btn-sm" onclick="openServiceModal('${s.id}')" style="padding:0;color:var(--text-dim)"><i data-lucide="edit-2" style="width:14px;height:14px"></i></button>
                <button class="btn-icon btn-sm btn-del-srv" data-id="${s.id}" style="padding:0;color:var(--danger)"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
            </div>
        `;
        list.appendChild(li);
    });

    document.querySelectorAll('.btn-del-srv').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const { error } = await deleteRowSafe('services', id);
            if (error && !String(id).startsWith('srv_')) { showToast('Error al eliminar servicio', 'error'); return; }
            db.services = db.services.filter(x => x.id != id);
            persistCollectionLocal('services', db.services);
            updateFormSelects();
            renderServicesList();
        };
    });
    refreshIcons();
}

function renderEmployeesList() {
    const lists = ['settings-employees-list']
        .map(id => document.getElementById(id))
        .filter(Boolean);

    lists.forEach(list => {
        list.innerHTML = '';
        if (db.employees.length === 0) {
            list.innerHTML = '<span style="color:var(--text-dim);font-size:0.85rem">No hay funcionarias registradas.</span>';
            return;
        }
        db.employees.forEach(emp => {
            const li = document.createElement('li');
            li.className = 'task-item';

            let subText = [];
            const payDay = emp.payDay || emp.pay_day;
            if (payDay) subText.push('Pago: ' + payDay);
            if (emp.tips) subText.push('Propinas: $' + fmt(emp.tips));
            if (emp.advances) subText.push('Adelantos: $' + fmt(emp.advances));
            if (emp.pendingSync) subText.push('Pendiente de sincronizar');
            const empColor = emp.color || localStorage.getItem(`violet_emp_color_${emp.id}`) || '#7b52b5';

            li.innerHTML = `
                <div style="flex:1;">
                    <span class="task-text"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${empColor};margin-right:6px;vertical-align:-1px;"></span><i data-lucide="user" style="width:14px;height:14px;margin-right:5px;vertical-align:-2px"></i> ${emp.name}</span>
                    ${subText.length > 0 ? `<div style="font-size:0.75rem; color:var(--text-dim); margin-left: 20px; margin-top:2px;">${subText.join(' | ')}</div>` : ''}
                </div>
                <div style="display:flex; gap: 5px;">
                    <button class="btn-icon btn-sm" onclick="openEmployeeModal('${emp.id}')" style="padding:0;color:var(--text-dim)"><i data-lucide="edit-2" style="width:14px;height:14px"></i></button>
                    <button class="btn-icon btn-sm btn-del-emp" data-id="${emp.id}" style="padding:0;color:var(--danger)"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
                </div>
            `;
            list.appendChild(li);
        });
    });

    document.querySelectorAll('.btn-del-emp').forEach(btn => {
        btn.onclick = (e) => deleteEmployee(e.currentTarget.getAttribute('data-id'));
    });
    renderStaffPanelSummary();
    renderStaffBlockedList();
    refreshIcons();
}

async function deleteEmployee(id) {
    const emp = db.employees.find(x => String(x.id) === String(id));
    if (!emp) return;
    const ok = await showCustomConfirm(
        `¿Eliminar a ${emp.name}? Esta acción no se puede deshacer.`,
        { title: 'Eliminar funcionaria', confirmText: 'Eliminar', danger: true }
    );
    if (!ok) return;

    const isLocalId = String(id).startsWith('emp_');
    if (!isLocalId) {
        try {
            const { error } = await window.supabaseClient.from('employees').delete().eq('id', id);
            if (error) console.warn('[Employee] Delete remote error:', error);
        } catch (err) {
            console.warn('[Employee] Delete remote exception:', err);
        }
    }
    db.employees = db.employees.filter(x => String(x.id) !== String(id));
    persistCollectionLocal('employees', db.employees);
    try { localStorage.removeItem(`violet_emp_color_${id}`); } catch (_) {}
    updateFormSelects();
    renderEmployeesList();
    if (typeof renderStaffPanel === 'function') renderStaffPanel();
    if (currentView === 'analytics') updateCharts();
    showToast(`${emp.name} eliminada`, 'success');
}

async function dedupeEmployees({ silent = true } = {}) {
    if (!Array.isArray(db.employees) || db.employees.length < 2) return 0;
    const groups = new Map();
    db.employees.forEach(emp => {
        if (!emp || !emp.name) return;
        const key = String(emp.name).trim().toLowerCase();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(emp);
    });

    let removed = 0;
    const toRemoveRemote = [];
    const keepers = [];

    for (const [_, group] of groups) {
        if (group.length === 1) { keepers.push(group[0]); continue; }
        // Preferir IDs no-locales (vienen de Supabase: numéricos/uuid). Locales arrancan con "emp_".
        group.sort((a, b) => {
            const aLocal = String(a.id).startsWith('emp_') ? 1 : 0;
            const bLocal = String(b.id).startsWith('emp_') ? 1 : 0;
            return aLocal - bLocal;
        });
        const keeper = group[0];
        const losers = group.slice(1);
        losers.forEach(loser => {
            keeper.tips = Math.max(parseFloat(keeper.tips) || 0, parseFloat(loser.tips) || 0);
            keeper.advances = Math.max(parseFloat(keeper.advances) || 0, parseFloat(loser.advances) || 0);
            keeper.payDay = keeper.payDay || keeper.pay_day || loser.payDay || loser.pay_day || null;
            keeper.pay_day = keeper.pay_day || keeper.payDay || loser.pay_day || loser.payDay || null;
            keeper.joinDate = keeper.joinDate || keeper.join_date || loser.joinDate || loser.join_date || null;
            keeper.join_date = keeper.join_date || keeper.joinDate || loser.join_date || loser.joinDate || null;
            keeper.color = keeper.color || loser.color || '#7b52b5';
            if (!String(loser.id).startsWith('emp_')) toRemoveRemote.push(loser.id);
            try { localStorage.removeItem(`violet_emp_color_${loser.id}`); } catch (_) {}
            removed++;
        });
        keepers.push(keeper);
    }

    if (removed === 0) return 0;

    for (const id of toRemoveRemote) {
        try {
            await window.supabaseClient.from('employees').delete().eq('id', id);
        } catch (err) {
            console.warn('[Dedupe] Error borrando duplicado remoto', id, err);
        }
    }
    db.employees = keepers;
    persistCollectionLocal('employees', db.employees);
    if (!silent) showToast(`${removed} duplicado(s) de staff fusionados`, 'success');
    console.log(`[Dedupe] ${removed} empleadas duplicadas fusionadas.`);
    return removed;
}

async function renderStaffPanel() {
    await dedupeEmployees({ silent: true });
    renderEmployeesList();
    renderStaffCards();
    if (typeof updateFormSelects === 'function') updateFormSelects();
}

async function runStaffDedupe() {
    const removed = await dedupeEmployees({ silent: false });
    if (removed === 0) showToast('No se encontraron duplicados', 'info');
    renderEmployeesList();
    renderStaffCards();
    updateFormSelects();
}

function renderStaffCards() {
    const list = document.getElementById('staff-employees-list');
    if (!list) return;
    if (db.employees.length === 0) {
        list.innerHTML = '<li style="list-style:none;color:var(--text-dim);font-size:0.9rem;text-align:center;padding:2rem;">No hay funcionarias registradas. Hacé clic en "+ Nuevo Staff" para agregar la primera.</li>';
        return;
    }
    const cfg = typeof getBusinessConfig === 'function' ? getBusinessConfig() : {};
    const blockedSlots = Array.isArray(cfg.blockedSlots) ? cfg.blockedSlots : [];
    const todayISO = new Date().toISOString().slice(0, 10);

    list.innerHTML = db.employees.map(emp => {
        const empBlocks = blockedSlots.filter(b => String(b.employeeId || b.employee_id || '') === String(emp.id));
        const upcomingBlocks = empBlocks.filter(b => (b.date || b.blockDate || '') >= todayISO);
        const empColor = emp.color || localStorage.getItem(`violet_emp_color_${emp.id}`) || '#7b52b5';
        const tips = parseFloat(emp.tips) || 0;
        const advances = parseFloat(emp.advances) || 0;
        const initial = (emp.name || '?').trim().charAt(0).toUpperCase();
        const payDay = emp.payDay || emp.pay_day || '-';
        const joinDate = emp.joinDate || emp.join_date || '-';

        const blocksHTML = upcomingBlocks.length === 0
            ? '<div style="font-size:0.78rem;color:var(--text-dim);padding:8px 0;">Sin bloqueos próximos.</div>'
            : upcomingBlocks.slice(0, 4).map((b, idx) => {
                const date = b.date || b.blockDate || '-';
                const start = b.start || b.startTime || b.start_time || '';
                const end = b.end || b.endTime || b.end_time || '';
                const reason = b.reason ? ` · ${b.reason}` : '';
                const blockKey = `${date}|${start}|${end}|${emp.id}`;
                return `<div class="staff-block-row"><span><i data-lucide="calendar-x" style="width:12px;height:12px;vertical-align:-1px;color:var(--danger)"></i> <strong>${date}</strong> ${start}–${end}${reason}</span><button class="btn-icon btn-sm btn-unblock-slot" data-key="${blockKey}" title="Quitar bloqueo" style="color:var(--danger);padding:2px 6px;"><i data-lucide="x" style="width:12px;height:12px"></i></button></div>`;
            }).join('') + (upcomingBlocks.length > 4 ? `<div style="font-size:0.72rem;color:var(--text-dim);margin-top:4px;">+${upcomingBlocks.length - 4} más</div>` : '');

        return `
            <li class="staff-card-v2" data-id="${emp.id}" style="border-left:4px solid ${empColor};">
                <div class="staff-card-head">
                    <div class="staff-avatar" style="background:${empColor};">${initial}</div>
                    <div style="flex:1;min-width:0;">
                        <div class="staff-name-v2">${emp.name}</div>
                        <div class="staff-sub">Pago: día <strong>${payDay}</strong> · Ingreso: <strong>${joinDate}</strong></div>
                    </div>
                    <div class="staff-card-head-actions">
                        <button class="btn-icon" onclick="openEmployeeModal('${emp.id}')" title="Editar"><i data-lucide="edit-2"></i></button>
                        <button class="btn-icon btn-del-staff-card" data-id="${emp.id}" title="Eliminar" style="color:var(--danger);"><i data-lucide="trash-2"></i></button>
                    </div>
                </div>

                <div class="staff-metrics-grid">
                    <div class="staff-metric staff-metric-tips">
                        <div class="staff-metric-label"><i data-lucide="heart"></i> Propinas</div>
                        <div class="staff-metric-value">$${fmt(tips)}</div>
                    </div>
                    <div class="staff-metric staff-metric-adv">
                        <div class="staff-metric-label"><i data-lucide="trending-down"></i> Adelantos</div>
                        <div class="staff-metric-value">$${fmt(advances)}</div>
                    </div>
                    <div class="staff-metric staff-metric-blocks">
                        <div class="staff-metric-label"><i data-lucide="calendar-x"></i> Bloqueos</div>
                        <div class="staff-metric-value">${upcomingBlocks.length}</div>
                    </div>
                </div>

                <div class="staff-actions-v2">
                    <button class="btn btn-ghost btn-sm btn-staff-tip" data-id="${emp.id}"><i data-lucide="heart"></i> Propina</button>
                    <button class="btn btn-ghost btn-sm btn-staff-advance" data-id="${emp.id}"><i data-lucide="banknote"></i> Adelanto</button>
                    <button class="btn btn-ghost btn-sm btn-staff-block" data-id="${emp.id}"><i data-lucide="calendar-x"></i> Bloquear</button>
                </div>

                <div class="staff-blocks-section">
                    <div class="staff-blocks-title">Horarios bloqueados</div>
                    ${blocksHTML}
                </div>
            </li>
        `;
    }).join('');

    list.querySelectorAll('.btn-staff-tip').forEach(btn => {
        btn.onclick = () => openStaffTipModal(btn.dataset.id);
    });
    list.querySelectorAll('.btn-staff-advance').forEach(btn => {
        btn.onclick = () => openStaffAdvanceModal(btn.dataset.id);
    });
    list.querySelectorAll('.btn-staff-block').forEach(btn => {
        btn.onclick = () => openStaffBlockModal(btn.dataset.id);
    });
    list.querySelectorAll('.btn-del-staff-card').forEach(btn => {
        btn.onclick = () => deleteEmployee(btn.dataset.id);
    });
    list.querySelectorAll('.btn-unblock-slot').forEach(btn => {
        btn.onclick = () => removeStaffBlock(btn.dataset.key);
    });
    refreshIcons();
}

function openStaffTipModal(employeeId) {
    const emp = db.employees.find(e => String(e.id) === String(employeeId));
    if (!emp) return;
    document.getElementById('staff-tip-emp-id').value = emp.id;
    document.getElementById('staff-tip-target').textContent = emp.name;
    document.getElementById('staff-tip-amount').value = '';
    document.getElementById('modal-staff-tip').classList.add('open');
    setTimeout(() => document.getElementById('staff-tip-amount').focus(), 80);
    refreshIcons();
}

async function submitStaffTip(e) {
    if (e && e.preventDefault) e.preventDefault();
    const empId = document.getElementById('staff-tip-emp-id').value;
    const amount = parseFloat(document.getElementById('staff-tip-amount').value);
    const emp = db.employees.find(x => String(x.id) === String(empId));
    if (!emp) return;
    if (isNaN(amount) || amount <= 0) return showToast('Monto inválido', 'error');
    emp.tips = (parseFloat(emp.tips) || 0) + amount;
    persistCollectionLocal('employees', db.employees);
    try {
        const { error } = await window.supabaseClient.from('employees').update({ tips: emp.tips }).eq('id', emp.id);
        if (error) throw error;
        showToast(`Propina de $${fmt(amount)} registrada para ${emp.name}`, 'success');
    } catch (err) {
        emp.pendingSync = true;
        persistCollectionLocal('employees', db.employees);
        console.error('[Staff] Error guardando propina:', err);
        showToast('Propina guardada localmente', 'warning');
    }
    document.getElementById('modal-staff-tip').classList.remove('open');
    renderStaffPanel();
}

function removeStaffBlock(blockKey) {
    if (!blockKey) return;
    const [date, start, end, empId] = blockKey.split('|');
    const cfg = getBusinessConfig();
    cfg.blockedSlots = Array.isArray(cfg.blockedSlots) ? cfg.blockedSlots : [];
    const before = cfg.blockedSlots.length;
    cfg.blockedSlots = cfg.blockedSlots.filter(b => {
        const bDate = b.date || b.blockDate || '';
        const bStart = b.start || b.startTime || b.start_time || '';
        const bEnd = b.end || b.endTime || b.end_time || '';
        const bEmp = String(b.employeeId || b.employee_id || '');
        return !(bDate === date && bStart === start && bEnd === end && bEmp === String(empId));
    });
    if (cfg.blockedSlots.length === before) return;
    saveBusinessConfig(cfg);
    renderStaffPanel();
    if (typeof renderAgenda === 'function') renderAgenda(document.getElementById('agenda-date-picker')?.value || date);
    showToast('Bloqueo eliminado', 'success');
}

function openStaffAdvanceModal(employeeId) {
    const emp = db.employees.find(e => String(e.id) === String(employeeId));
    if (!emp) return;
    document.getElementById('staff-advance-emp-id').value = emp.id;
    document.getElementById('staff-advance-target').textContent = emp.name;
    document.getElementById('staff-advance-amount').value = '';
    document.getElementById('modal-staff-advance').classList.add('open');
    setTimeout(() => document.getElementById('staff-advance-amount').focus(), 80);
    refreshIcons();
}

async function submitStaffAdvance(e) {
    if (e && e.preventDefault) e.preventDefault();
    const empId = document.getElementById('staff-advance-emp-id').value;
    const amount = parseFloat(document.getElementById('staff-advance-amount').value);
    const emp = db.employees.find(x => String(x.id) === String(empId));
    if (!emp) return;
    if (isNaN(amount) || amount <= 0) return showToast('Monto inválido', 'error');
    emp.advances = (parseFloat(emp.advances) || 0) + amount;
    emp.payDay = emp.payDay || emp.pay_day || null;
    emp.joinDate = emp.joinDate || emp.join_date || null;
    persistCollectionLocal('employees', db.employees);
    try {
        const { error } = await window.supabaseClient.from('employees').update({ advances: emp.advances }).eq('id', emp.id);
        if (error) throw error;
        showToast(`Adelanto de $${fmt(amount)} cargado para ${emp.name}`, 'success');
    } catch (err) {
        emp.pendingSync = true;
        persistCollectionLocal('employees', db.employees);
        console.error('[Staff] Error guardando adelanto:', err);
        showToast('Adelanto guardado localmente', 'warning');
    }
    document.getElementById('modal-staff-advance').classList.remove('open');
    renderStaffPanel();
}

function openStaffBlockModal(employeeId) {
    const emp = db.employees.find(e => String(e.id) === String(employeeId));
    if (!emp) return;
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('staff-block-emp-id').value = emp.id;
    document.getElementById('staff-block-target').textContent = emp.name;
    // Default: día completo
    const fullDayRadio = document.querySelector('input[name="staff-block-type"][value="full-day"]');
    if (fullDayRadio) fullDayRadio.checked = true;
    document.getElementById('staff-block-date').value = today;
    document.getElementById('staff-block-start').value = '09:00';
    document.getElementById('staff-block-end').value = '18:00';
    document.getElementById('staff-block-date-from').value = today;
    document.getElementById('staff-block-date-to').value = today;
    document.getElementById('staff-block-reason').value = '';
    updateStaffBlockSections();
    document.getElementById('modal-staff-block').classList.add('open');
    refreshIcons();
}

function updateStaffBlockSections() {
    const type = document.querySelector('input[name="staff-block-type"]:checked')?.value || 'full-day';
    const sDate = document.getElementById('staff-block-section-date');
    const sTime = document.getElementById('staff-block-section-time');
    const sRange = document.getElementById('staff-block-section-daterange');
    if (sDate) sDate.style.display = (type === 'full-day' || type === 'time-range') ? 'block' : 'none';
    if (sTime) sTime.style.display = (type === 'time-range') ? 'grid' : 'none';
    if (sRange) sRange.style.display = (type === 'date-range') ? 'grid' : 'none';
}

function submitStaffBlock(e) {
    if (e && e.preventDefault) e.preventDefault();
    const empId = document.getElementById('staff-block-emp-id').value;
    const emp = db.employees.find(x => String(x.id) === String(empId));
    if (!emp) return;
    const type = document.querySelector('input[name="staff-block-type"]:checked')?.value || 'full-day';
    const reason = document.getElementById('staff-block-reason').value.trim();
    const cfg = getBusinessConfig();
    cfg.blockedSlots = Array.isArray(cfg.blockedSlots) ? cfg.blockedSlots : [];

    const added = [];
    if (type === 'full-day') {
        const date = document.getElementById('staff-block-date').value;
        if (!date) return showToast('Fecha requerida', 'error');
        added.push({ date, start: '00:00', end: '23:59', reason: reason || 'Día completo', employeeId: emp.id });
    } else if (type === 'time-range') {
        const date = document.getElementById('staff-block-date').value;
        const start = document.getElementById('staff-block-start').value;
        const end = document.getElementById('staff-block-end').value;
        if (!date || !start || !end) return showToast('Faltan datos del horario', 'error');
        if (start >= end) return showToast('Hora fin debe ser mayor que inicio', 'error');
        added.push({ date, start, end, reason, employeeId: emp.id });
    } else if (type === 'date-range') {
        const from = document.getElementById('staff-block-date-from').value;
        const to = document.getElementById('staff-block-date-to').value;
        if (!from || !to) return showToast('Faltan fechas', 'error');
        if (from > to) return showToast('Fecha "hasta" debe ser >= "desde"', 'error');
        // Generar un bloqueo por cada día del rango (inclusive)
        const [y1, m1, d1] = from.split('-').map(Number);
        const [y2, m2, d2] = to.split('-').map(Number);
        const start = new Date(y1, m1 - 1, d1);
        const end = new Date(y2, m2 - 1, d2);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            added.push({ date: ds, start: '00:00', end: '23:59', reason: reason || 'Día completo', employeeId: emp.id });
        }
    }
    cfg.blockedSlots.push(...added);
    saveBusinessConfig(cfg);
    document.getElementById('modal-staff-block').classList.remove('open');
    renderStaffPanel();
    if (typeof renderAgenda === 'function') renderAgenda(document.getElementById('agenda-date-picker')?.value);
    showToast(`Bloqueo${added.length > 1 ? 's' : ''} guardado${added.length > 1 ? `s (${added.length} días)` : ''}`, 'success');
}

function initStaffModals() {
    if (initStaffModals._done) return;
    initStaffModals._done = true;

    const wire = (modalId, formId, submitFn) => {
        const overlay = document.getElementById(modalId);
        if (!overlay) return;
        // Close buttons
        overlay.querySelectorAll('[data-close]').forEach(btn => {
            btn.onclick = () => overlay.classList.remove('open');
        });
        // Click on overlay (no en el modal)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('open');
        });
        // Form submit
        const form = document.getElementById(formId);
        if (form) form.addEventListener('submit', submitFn);
    };

    wire('modal-staff-tip', 'fm-staff-tip', submitStaffTip);
    wire('modal-staff-advance', 'fm-staff-advance', submitStaffAdvance);
    wire('modal-staff-block', 'fm-staff-block', submitStaffBlock);

    // Cambio de tipo de bloqueo
    document.querySelectorAll('input[name="staff-block-type"]').forEach(r => {
        r.addEventListener('change', updateStaffBlockSections);
    });
}

function renderStaffPanelSummary() {
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    const totalTips = db.employees.reduce((sum, emp) => sum + (parseFloat(emp.tips) || 0), 0);
    const totalAdvances = db.employees.reduce((sum, emp) => sum + (parseFloat(emp.advances) || 0), 0);
    const cfg = typeof getBusinessConfig === 'function' ? getBusinessConfig() : {};
    const blockedSlots = Array.isArray(cfg.blockedSlots) ? cfg.blockedSlots : [];

    setText('staff-total-count', db.employees.length);
    setText('staff-total-tips', '$' + fmt(totalTips));
    setText('staff-total-advances', '$' + fmt(totalAdvances));
    setText('staff-total-blocks', blockedSlots.length);
}

function renderStaffBlockedList() {
    const list = document.getElementById('staff-blocked-list');
    if (!list) return;
    const cfg = typeof getBusinessConfig === 'function' ? getBusinessConfig() : {};
    const blockedSlots = Array.isArray(cfg.blockedSlots) ? cfg.blockedSlots : [];
    if (blockedSlots.length === 0) {
        list.innerHTML = '<span style="color:var(--text-dim);font-size:0.85rem">No hay horarios bloqueados.</span>';
        return;
    }
    list.innerHTML = blockedSlots.map(slot => {
        const employee = db.employees.find(emp => String(emp.id) === String(slot.employeeId || slot.employee_id));
        const staffName = employee ? employee.name : 'Staff no especificado';
        const dateText = slot.date || slot.blockDate || 'Sin fecha';
        const timeText = [slot.start || slot.startTime || slot.start_time, slot.end || slot.endTime || slot.end_time].filter(Boolean).join(' - ') || 'Sin horario';
        const reason = slot.reason ? ` | ${slot.reason}` : '';
        return `<li class="task-item"><span class="task-text"><i data-lucide="calendar-x" style="width:14px;height:14px;margin-right:5px;vertical-align:-2px"></i>${staffName}: ${dateText} ${timeText}${reason}</span></li>`;
    }).join('');
}

// ==========================================
// 11. UTILIDADES
// ==========================================
// ==========================================
// 12. ALERTAS DE CUMPLEAÑOS AL INICIAR
// ==========================================
function checkBirthdayAlert() {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const mm2 = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd2 = String(tomorrow.getDate()).padStart(2, '0');

    const todayStr    = `${mm}-${dd}`;
    const tomorrowStr = `${mm2}-${dd2}`;

    db.clients.forEach(c => {
        if (!c.birthday) return;
        const bday = c.birthday.substring(5); // MM-DD
        if (bday === todayStr) {
            setTimeout(() => showToast(`🎂 ¡Hoy cumple años ${c.name}! Enviá un mensaje de felicitación.`, 'info'), 1500);
        } else if (bday === tomorrowStr) {
            setTimeout(() => showToast(`🎁 ${c.name} cumple mañana. ¿La anotás en la agenda?`, 'info'), 2500);
        }
    });
}

// ==========================================
// 13. CIERRE DE CAJA
// ==========================================
function isSameDay(d1, d2) {
    if (!d1 || !d2) return false;
    // Comparar usando fecha LOCAL (no UTC) para evitar desfasaje de zona horaria.
    // Antes: toISOString().slice(0,10) usaba UTC y rompía la comparación cuando
    // la hora local cruzaba medianoche en UTC (ej. 21:30 UY = 00:30 UTC siguiente día).
    const date1 = new Date(d1);
    const date2 = new Date(d2);
    if (isNaN(date1.getTime()) || isNaN(date2.getTime())) return false;
    return date1.getFullYear() === date2.getFullYear()
        && date1.getMonth() === date2.getMonth()
        && date1.getDate() === date2.getDate();
}

function openCierreCaja() {
    openCashClosureModal();
}

function compartirCierrePorWhatsApp() {
    const today = new Date();
    const todays = db.transactions.filter(t => isSameDay(t.date, today) && t.isIncome);
    let ef = 0, tr = 0, se = 0;
    todays.forEach(t => {
        if (t.method === 'efectivo') ef += t.amount;
        else if (t.method === 'transferencia') tr += t.amount;
        else if (t.method === 'seña') se += t.amount;
    });
    const fmt = n => n.toLocaleString('es-UY');
    const dateLabel = new Date().toLocaleDateString('es-UY', { day:'numeric', month:'long', year:'numeric' });
    const msg = `💜 *VIOLET — Cierre del ${dateLabel}*\n\n💵 Efectivo: $${fmt(ef)}\n💳 Transferencias: $${fmt(tr)}\n🔒 Señas: $${fmt(se)}\n\n✅ *Total del día: $${fmt(ef+tr)}*`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

// ==========================================
// 13. EXPORTAR CLIENTES CSV (PARA META)
// ==========================================
function exportClientesCSV() {
    if (db.clients.length === 0) { showToast('No hay clientas para exportar', 'error'); return; }
    const headers = ['Nombre', 'Telefono', 'Instagram', 'Cumpleanos'];
    const rows = db.clients.map(c => [
        `"${(c.name || '').replace(/"/g, '')}"`,
        `"${(c.phone || '').replace(/\D/g, '')}"`,
        `"${(c.instagram || '').replace('@','')}"`,
        `"${c.birthday || ''}"`
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `violet_clientas_${new Date().toISOString().substring(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`${db.clients.length} clientas exportadas`);
}

// ==========================================
// 14. ASISTENTE IA (CLAUDE API)
// ==========================================
function initAIChat() {
    const fab      = document.getElementById('btn-ai-chat');
    const fabMob   = document.getElementById('btn-ai-chat-mobile');
    const modal    = document.getElementById('modal-ai-chat');
    const closeBtn = document.getElementById('modal-ai-close');
    const sendBtn  = document.getElementById('btn-ai-send');
    const input    = document.getElementById('ai-input');

    const openChat = () => { modal.classList.add('open'); input.focus(); refreshIcons(); };
    fab.addEventListener('click', openChat);
    if (fabMob) fabMob.addEventListener('click', openChat);
    closeBtn.addEventListener('click', () => modal.classList.remove('open'));
    sendBtn.addEventListener('click', sendAIMessage);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendAIMessage(); });
}

function exportDailyTransactionsCSV() {
    const today = new Date();
    const todayTrans = db.transactions.filter(t => isSameDay(t.date, today) && t.isIncome);
    if (todayTrans.length === 0) { showToast('No hay transacciones hoy', 'error'); return; }
    const headers = ['Fecha', 'Descripcion', 'Metodo', 'Monto'];
    const rows = todayTrans.map(t => [
        `"${t.date}"`,
        `"${(t.detail || '').replace(/"/g, '')}"`,
        `"${t.method}"`,
        `"${t.amount}"`
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `violet_cierre_${new Date().toISOString().substring(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`${todayTrans.length} transacciones exportadas`);
}

function buildBusinessContext() {
    const today = new Date();
    const todayTrans = db.transactions.filter(t => isSameDay(t.date, today) && t.isIncome);
    const ef = todayTrans.filter(t => t.method === 'efectivo').reduce((s,t) => s+t.amount, 0);
    const tr = todayTrans.filter(t => t.method === 'transferencia').reduce((s,t) => s+t.amount, 0);
    const deudoras = db.clients.filter(c => c.debt > 0).map(c => `${c.name}: $${c.debt}`).join(', ') || 'ninguna';
    const topClients = db.clients.map(c => ({
        name: c.name,
        count: db.transactions.filter(t => t.clientId === c.id).length
    })).sort((a,b) => b.count - a.count).slice(0,3).map(c => `${c.name} (${c.count} visitas)`).join(', ') || 'sin datos';

    return `Sos el asistente de Violet Peluquería Unisex. Respondé en español, de forma concisa y amigable.

DATOS DEL NEGOCIO HOY:
- Efectivo en caja: $${ef.toLocaleString('es-UY')}
- Transferencias: $${tr.toLocaleString('es-UY')}
- Total del día: $${(ef+tr).toLocaleString('es-UY')}
- Movimientos hoy: ${todayTrans.length}
- Total clientas registradas: ${db.clients.length}
- Clientas con deuda pendiente: ${deudoras}
- Clientas frecuentes: ${topClients}
- Servicios disponibles: ${db.services.map(s => s.name).join(', ') || 'sin configurar'}
- Funcionarias: ${db.employees.map(e => e.name).join(', ') || 'sin configurar'}
- Turnos hoy: ${db.appointments.filter(a => { const d = new Date(); return getAppointmentDate(a) === `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }).length}`;
}

let aiHistory = [];

async function sendAIMessage() {
    const input = document.getElementById('ai-input');
    const msg = input.value.trim();
    if (!msg) return;

    const apiKey = localStorage.getItem('violet_ai_key');
    if (!apiKey) {
        showToast('Primero configurá tu clave API en Configuración → Asistente IA', 'error');
        return;
    }

    input.value = '';
    addAIMessage(msg, 'user');

    const typing = document.createElement('div');
    typing.className = 'ai-msg-typing';
    document.getElementById('ai-messages').appendChild(typing);
    scrollAIChat();

    aiHistory.push({ role: 'user', content: msg });

    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
                'anthropic-dangerous-allow-browser': 'true'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 500,
                system: buildBusinessContext(),
                messages: aiHistory
            })
        });

        typing.remove();

        if (!res.ok) {
            const err = await res.json();
            addAIMessage('Error: ' + (err.error?.message || 'No se pudo conectar con la IA.'), 'bot');
            aiHistory.pop();
            return;
        }

        const data = await res.json();
        const reply = data.content[0].text;
        aiHistory.push({ role: 'assistant', content: reply });
        addAIMessage(reply, 'bot');

    } catch(e) {
        typing.remove();
        addAIMessage('No se pudo conectar. Verificá tu conexión o la clave API.', 'bot');
        aiHistory.pop();
    }
}

function addAIMessage(text, role) {
    const container = document.getElementById('ai-messages');
    const div = document.createElement('div');
    div.className = `ai-msg ai-msg-${role}`;
    div.innerHTML = `<span>${text.replace(/\n/g, '<br>')}</span>`;
    container.appendChild(div);
    scrollAIChat();
}

function scrollAIChat() {
    const c = document.getElementById('ai-messages');
    c.scrollTop = c.scrollHeight;
}

// Modal de confirmación con estilo de la app (reemplaza al confirm() nativo)
function showCustomConfirm(message, { title = 'Confirmar', confirmText = 'Aceptar', cancelText = 'Cancelar', danger = false } = {}) {
    return new Promise((resolve) => {
        // Limpiar instancia previa si existiera
        const prev = document.getElementById('modal-custom-confirm');
        if (prev) prev.remove();

        const overlay = document.createElement('div');
        overlay.id = 'modal-custom-confirm';
        overlay.className = 'modal-overlay open';
        overlay.style.zIndex = '900';
        overlay.innerHTML = `
            <div class="modal" style="max-width:440px;">
                <div class="modal-header">
                    <h3 style="margin:0;font-size:1.05rem;color:var(--text-primary);display:flex;align-items:center;gap:.5rem;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${danger ? 'var(--danger)' : 'var(--gold-400)'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/>
                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        ${title}
                    </h3>
                </div>
                <div class="modal-body" style="padding:1.2rem 1.5rem;">
                    <p style="margin:0;color:var(--text-secondary);font-size:.92rem;line-height:1.5;white-space:pre-wrap;">${message}</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" id="cc-cancel">${cancelText}</button>
                    <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="cc-ok">${confirmText}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const close = (val) => { overlay.remove(); resolve(val); };
        overlay.querySelector('#cc-ok').addEventListener('click', () => close(true));
        overlay.querySelector('#cc-cancel').addEventListener('click', () => close(false));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
        const onKey = (e) => {
            if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(false); }
            else if (e.key === 'Enter') { document.removeEventListener('keydown', onKey); close(true); }
        };
        document.addEventListener('keydown', onKey);
        setTimeout(() => overlay.querySelector('#cc-ok')?.focus(), 50);
    });
}
window.showCustomConfirm = showCustomConfirm;

function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    const icons = {
        success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`,
        error:   `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
        info:    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--info)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
    };
    const icon = icons[type] || icons.info;
    toast.innerHTML = `${icon} <span style="font-size:0.85rem; font-weight:500;">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0'; toast.style.transform = 'translateX(20px)'; toast.style.transition = 'all 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Función global para cobrar una cita desde la agenda
function chargeAppointment(id) {
    const apt = db.appointments.find(a => String(a.id) === String(id));
    if (!apt) {
        console.error('[COBRAR] No se encontró la cita con ID:', id);
        return;
    }

    console.log('[COBRAR] Iniciando cobro de cita:', apt);
    window._chargeAppointmentId = id;

    // 1. Navegar a POS (Caja)
    if (typeof window.navigateTo === 'function') window.navigateTo('caja');

    // 2. Llenar cliente
    const clientInput = document.getElementById('client-name');
    if (clientInput) {
        clientInput.value = apt.clientName || apt.client_name || '';
        // Buscar el cliente en DB para activar alertas de deuda/seña
        const clientObj = db.clients.find(c => c.id == (apt.clientId || apt.client_id)) || null;
        if (clientObj) {
            window.currentClient = clientObj;
            const discountAlert = document.getElementById('discount-alert');
            if (discountAlert) {
                if (clientObj.balance > 0) {
                    discountAlert.classList.remove('hidden');
                    const display = document.getElementById('deposit-amount-display');
                    if (display) display.textContent = clientObj.balance;
                } else {
                    discountAlert.classList.add('hidden');
                }
            }
        }
    }

    // 3. Llenar concepto/servicio y calcular monto
    const serviceSelect = document.getElementById('service');
    if (serviceSelect) {
        const expandedServices = getAppointmentServices(apt);
        console.log(`[COBRAR] Servicios detectados en cita (${expandedServices.length}):`, expandedServices);
        
        let totalAmount = 0;
        let firstSrvId = null;

        // Buscar cada servicio en la DB y acumular resultados
        const resolvedServices = [];
        expandedServices.forEach((srvRef, idx) => {
            const searchName = String(srvRef.name || '').trim().toLowerCase();
            const srv = db.services.find(s => 
                String(s.id) === String(srvRef.id || srvRef.service_id) || 
                (s.name && s.name.trim().toLowerCase() === searchName)
            );
            
            if (srv) {
                const price = parseFloat(srv.price) || 0;
                console.log(`[COBRAR] Servicio ${idx + 1} encontrado: "${srv.name}" | Precio: ${price}`);
                totalAmount += price;
                if (!firstSrvId) firstSrvId = srv.id;
                resolvedServices.push({ name: srv.name, price, id: srv.id });
            } else {
                const fallbackPrice = parseFloat(srvRef.price) || 0;
                console.warn(`[COBRAR] Servicio ${idx + 1} NO encontrado en base de datos: "${srvRef.name}". Usando precio de cita: ${fallbackPrice}`);
                totalAmount += fallbackPrice;
                resolvedServices.push({ name: srvRef.name, price: fallbackPrice, id: null });
            }
        });

        // Seleccionar primer servicio en dropdown
        if (firstSrvId) {
            serviceSelect.value = firstSrvId;
            if (typeof syncCustomSelect === 'function') syncCustomSelect('service');
        }

        // Mostrar panel de desglose si hay más de 1 servicio
        const breakdownPanel = document.getElementById('pos-services-breakdown');
        const breakdownList = document.getElementById('pos-services-breakdown-list');
        const breakdownTotal = document.getElementById('pos-services-breakdown-total');
        
        if (breakdownPanel && breakdownList) {
            if (resolvedServices.length > 1) {
                const fmt = n => n.toLocaleString('es-UY');
                breakdownList.innerHTML = resolvedServices.map(s => `
                    <div style="display:flex; justify-content:space-between; padding:3px 0; color:var(--text-primary);">
                        <span style="font-weight:500;">✦ ${s.name}</span>
                        <span style="font-weight:700; color:var(--success);">$${fmt(s.price)}</span>
                    </div>
                `).join('');
                if (breakdownTotal) breakdownTotal.textContent = `$${fmt(totalAmount)}`;
                breakdownPanel.classList.remove('hidden');
            } else {
                breakdownPanel.classList.add('hidden');
            }
        }

        // Guardar detalle completo para usar en saveTransaction
        window._chargeDetail = resolvedServices.map(s => s.name).join(' + ');
        window._chargeBaseAmount = totalAmount;
        console.log('[COBRAR] Detalle guardado:', window._chargeDetail);
        
        // Monto
        const amountInput = document.getElementById('amount');
        if (amountInput) {
            amountInput.value = totalAmount;
            console.log('[COBRAR] Monto total cargado:', totalAmount);
            amountInput.dispatchEvent(new Event('input'));
        }
    }

    // 4. Llenar profesional
    const empSelect = document.getElementById('employee');
    const empId = getAppointmentEmployeeId(apt);
    if (empSelect && empId) {
        empSelect.value = empId;
        if (typeof syncCustomSelect === 'function') syncCustomSelect('employee');
    }
    
    showToast('Datos de la cita cargados en caja');
    if (typeof refreshIcons === 'function') refreshIcons();
}
window.chargeAppointment = chargeAppointment;

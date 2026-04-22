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

// ==========================================
// 0. INICIALIZACIÓN DE EMERGENCIA - VERSIÓN SIMPLIFICADA
// ==========================================
window.db = window.db || {
    transactions: [], clients: [], appointments: [],
    tasks: [], services: [], employees: [], closures: [], clientFiles: []
};

// Función de inicialización simple que llama a todas las demás
function violetInit() {
    console.log('[VIOLET] violetInit() ejecutado');

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
};

// también agregar click listeners directamente
window.addEventListener('DOMContentLoaded', () => {
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

    // Forzar inicio después de 2 segundos como máximo
    setTimeout(() => violetInit(), 2000);

    // También intentar si Supabase está listo
    if (window.supabaseClient) {
        loadDataFromSupabase().then(() => violetInit()).catch(() => violetInit());
    }
});

async function loadDataFromSupabase() {
    const client = window.supabaseClient;
    if(!client) {
        showToast('Extensión de Supabase no detectada', 'error');
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
            employee: t.employee
        })},
        { name: 'appointments', stateKey: 'appointments', transform: a => ({
            ...a,
            date: a.apt_date,
            time: a.apt_time,
            clientId: a.client_id,
            clientName: a.client_name,
            serviceId: a.service_id,
            employeeId: a.employee_id
        })},
        { name: 'tasks', stateKey: 'tasks', order: { col: 'created_at', asc: true } },
        { name: 'services', stateKey: 'services' },
        { name: 'employees', stateKey: 'employees' },
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

            const { data, error } = await query;

            if (error) {
                console.warn(`⚠️ Error en ${table.name}:`, error.message);
                continue;
            }

            if (data) {
                // Usa db desde state.js actualizando ahí
                db[table.stateKey] = table.transform ? data.map(table.transform) : data;
                state.data = db; // sincroniza alias
                console.log(`✅ ${table.name}: ${data.length} registros cargados.`);
                successCount++;
            }
        } catch (err) {
            console.error(`❌ Fallo crítico en ${table.name}:`, err);
        }
    }

    if (successCount === 0) {
        console.error("No se pudo cargar ninguna tabla. Revisa las políticas de RLS en Supabase o si los datos tienen el user_id correcto.");
        showToast('Sin acceso a datos en la nube', 'error');
    }
}

// Ya no usamos saveData global porque gestionamos todo en la nube
async function saveData() {
    console.warn("saveData() global desactivado.");
}

function refreshIcons() {
    setTimeout(() => lucide.createIcons(), 10);
}

// ==========================================
// HELPERS DE CLIENTES (robustez ante esquemas Supabase incompletos)
// ==========================================
// Inserta cliente; si Supabase no tiene columnas "instagram" u otras opcionales,
// reintenta sin esos campos para evitar "Could not find column ... in schema cache".
async function insertClientSafe(payload) {
    const userId = getUserId();
    if (userId) payload.user_id = userId;
    let { data, error } = await window.supabaseClient.from('clients').insert([payload]).select();
    if (error && error.message) {
        // Detecta "Could not find the 'X' column of 'clients'"
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

// Actualiza cliente con el mismo fallback
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

// Detecta duplicados por nombre normalizado o teléfono (último 8 dígitos)
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

// ==========================================
// CONFIGURACIÓN DEL NEGOCIO (horarios, días cerrados, formato de hora)
// ==========================================
function getBusinessConfig() {
    const raw = localStorage.getItem('violet_business_config');
    const defaults = {
        openTime: '09:00',
        closeTime: '20:00',
        lunchStart: '',
        lunchEnd: '',
        closedDays: [], // sin días cerrados por defecto
        timeFormat: '24h',
        blockedSlots: [] // ej: [{date:'2026-04-21', start:'14:00', end:'16:00', reason:'...'}]
    };
    if (!raw) return defaults;
    try { return { ...defaults, ...JSON.parse(raw) }; }
    catch { return defaults; }
}

function saveBusinessConfig(cfg) {
    localStorage.setItem('violet_business_config', JSON.stringify(cfg));
}

// Devuelve array de strings con los problemas que tiene el turno propuesto
function checkAppointmentConflicts(dateStr, timeStr, employeeId = null) {
    const cfg = getBusinessConfig();
    const warnings = [];
    if (!dateStr || !timeStr) return warnings;

    // Día cerrado
    const [y, m, d] = dateStr.split('-').map(n => parseInt(n));
    const dateObj = new Date(y, m - 1, d);
    const dow = dateObj.getDay(); // 0=Dom, 6=Sab
    const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    if (cfg.closedDays && cfg.closedDays.includes(dow)) {
        warnings.push(`El negocio está cerrado los ${dayNames[dow]}.`);
    }

    // Fuera de horario
    if (cfg.openTime && timeStr < cfg.openTime) {
        warnings.push(`El horario de apertura es ${cfg.openTime}.`);
    }
    if (cfg.closeTime && timeStr >= cfg.closeTime) {
        warnings.push(`El horario de cierre es ${cfg.closeTime}.`);
    }

    // Horario de almuerzo
    if (cfg.lunchStart && cfg.lunchEnd && timeStr >= cfg.lunchStart && timeStr < cfg.lunchEnd) {
        warnings.push(`Horario de almuerzo (${cfg.lunchStart} - ${cfg.lunchEnd}).`);
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
        document.getElementById(`view-${viewId}`).classList.add('active');

        currentView = viewId;
        updateHeaderTitles(viewId);

        if (viewId === 'dashboard') initDashboard();
        else if (viewId === 'caja') { updateStats(); renderTransactionsTable(); }
        else if (viewId === 'clients') renderClientsTable();
        else if (viewId === 'analytics') updateCharts();
    }

    // Botón cerrar sesión
    const closeBtn = document.getElementById('btn-close-register');
    if (closeBtn) {
        closeBtn.addEventListener('click', async () => {
            if (confirm('¿Cerrar sesión?')) {
                await window.supabaseClient.auth.signOut();
                resetState();
                window.location.href = 'login.html';
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
        'analytics': { t: 'Analíticas del Negocio', s: 'Métricas clave de rendimiento.' },
        'settings': { t: 'Configuración', s: 'Ajustes del sistema y usuarios.' }
    };
    if (titles[viewId]) {
        title.textContent = titles[viewId].t;
        subtitle.textContent = titles[viewId].s;
    }
}

function initMobileMenu() {
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

// ==========================================
// 5. PENDIENTES (Dashboard Diario)
// ==========================================
function initDashboard() {
    console.log('[POS] initDashboard llamado');
    renderDashboardCumpleanos();
    renderDashboardTareas();
    renderDashboardDeudas();
    renderDashboardAgendaResumen();
}

function renderDashboardCumpleanos() {
    const list = document.getElementById('widget-birthdays');
    if (!list) return;
    list.innerHTML = '';

    // Verificar datos
    const clients = db?.clients || [];
    if (clients.length === 0) {
        list.innerHTML = '<span style="color:var(--text-dim);font-size:0.85rem">Sin clientes aún. ¡Agregá el primero!</span>';
        return;
    }
    const today = new Date();
    
    const upcoming = db.clients.filter(c => {
        if (!c.birthday) return false;
        // Parse "YYYY-MM-DD" but ignore Year for comparison
        const [y, m, d] = c.birthday.split('-');
        const bDate = new Date(today.getFullYear(), parseInt(m)-1, parseInt(d));
        // Ajuste si ya pasó el cumple este año, mirar al próximo
        if (bDate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
            bDate.setFullYear(today.getFullYear() + 1);
        }
        const diffTime = Math.abs(bDate - today);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= 7;
    });

    if (upcoming.length === 0) {
        list.innerHTML = `<span style="color:var(--text-dim);font-size:0.85rem">No hay cumpleaños en próximos 7 días.</span>`;
        return;
    }

    upcoming.forEach(c => {
        list.innerHTML += `
            <div class="widget-list-item">
                <div class="info">
                    <span class="main-text">${c.name}</span>
                    <span class="sub-text"><i data-lucide="phone" style="width:12px;height:12px;vertical-align:middle"></i> ${c.phone || '-'}</span>
                </div>
                <div class="badge badge-border" style="color:var(--violet-200); border-color:var(--violet-400)">${c.birthday ? c.birthday.slice(8,10)+'/'+c.birthday.slice(5,7) : ''}</div>
            </div>
        `;
    });
    refreshIcons();
}

function renderDashboardTareas() {
    const tasksContainer = document.getElementById('task-list');
    const inputRow = document.getElementById('task-input-container');
    const input = document.getElementById('new-task-input');
    
    document.getElementById('btn-add-task').onclick = () => {
        inputRow.classList.toggle('hidden');
        if(!inputRow.classList.contains('hidden')) input.focus();
    };

        input.onkeypress = async (e) => {
        if(e.key === 'Enter' && input.value.trim()) {
            const taskText = input.value.trim();
            input.value = '';
            input.disabled = true;
            const userId = getUserId();
            const { data, error } = await window.supabaseClient.from('tasks').insert([{ 
                user_id: userId,
                text: taskText, 
                completed: false 
            }]).select();
            input.disabled = false;
            if(data) {
                db.tasks.push(data[0]);
                renderDashboardTareas();
            } else {
                showToast('Error al crear tarea', 'error');
            }
        }
    };

    tasksContainer.innerHTML = '';
    
    if (db.tasks.length === 0) {
        tasksContainer.innerHTML = `<span style="color:var(--text-dim);font-size:0.85rem">Todo al día.</span>`;
        return;
    }

    db.tasks.forEach((t, index) => {
        const li = document.createElement('li');
        li.className = `task-item ${t.completed ? 'completed' : ''}`;
        li.innerHTML = `
            <input type="checkbox" class="task-checkbox" ${t.completed ? 'checked' : ''} data-id="${t.id}">
            <span class="task-text">${t.text}</span>
            <button class="btn-icon btn-sm task-del" data-id="${t.id}" style="padding:0;color:var(--danger)"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
        `;
        tasksContainer.appendChild(li);
    });

    // Events
        document.querySelectorAll('.task-checkbox').forEach(cb => {
        cb.onchange = async (e) => {
            const id = e.target.getAttribute('data-id');
            const task = db.tasks.find(x => x.id == id);
            if(task) {
                task.completed = e.target.checked;
                await window.supabaseClient.from('tasks').update({ completed: task.completed }).eq('id', id);
                renderDashboardTareas();
            }
        };
    });

        document.querySelectorAll('.task-del').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            db.tasks = db.tasks.filter(x => x.id != id);
            await window.supabaseClient.from('tasks').delete().eq('id', id);
            renderDashboardTareas();
        }
    });

    refreshIcons();
}

function renderDashboardDeudas() {
    const list = document.getElementById('widget-debts');
    list.innerHTML = '';
    const inDebt = db.clients.filter(c => c.debt && c.debt > 0);
    
    if (inDebt.length === 0) {
        list.innerHTML = `<span style="color:var(--text-dim);font-size:0.85rem">No existen cuentas por cobrar. ¡Excelente!</span>`;
        return;
    }

    const totalDeuda = inDebt.reduce((s, c) => s + parseFloat(c.debt || 0), 0);
    const fmt = n => Number(n).toLocaleString('es-UY');

    // Encabezado con total
    list.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(248,113,113,0.08);border-radius:var(--radius-sm);margin-bottom:4px;border:1px solid rgba(248,113,113,0.2);">
        <span style="font-size:0.8rem;color:var(--text-dim);">${inDebt.length} clientas deben</span>
        <span style="font-weight:800;color:var(--danger);font-size:1rem;">Total: $${fmt(totalDeuda)}</span>
    </div>`;

    inDebt.forEach(c => {
        list.innerHTML += `
            <div class="widget-list-item" style="cursor:pointer;" onclick="openClientModal('${c.id}')">
                <div class="info">
                    <span class="main-text">${c.name}</span>
                    <span class="sub-text"><i data-lucide="phone" style="width:12px;height:12px;vertical-align:middle"></i> ${c.phone || '-'}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="color:var(--danger); font-weight:700;">$${fmt(c.debt)}</div>
                    <i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text-dim)"></i>
                </div>
            </div>
        `;
    });
    refreshIcons();
}

function renderDashboardAgendaResumen() {
    const list = document.getElementById('widget-agenda');
    list.innerHTML = '';
    
    // Obtener fecha YYYY-MM-DD
    const todayLocal = new Date();
    const todayStr = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth()+1).padStart(2,'0')}-${String(todayLocal.getDate()).padStart(2,'0')}`;
    
    const todaysApts = db.appointments.filter(a => a.date === todayStr).sort((a,b) => (a.time || '').localeCompare(b.time || ''));

    if (todaysApts.length === 0) {
        list.innerHTML = `<span style="color:var(--text-dim);font-size:0.85rem;text-align:center;display:block;margin-top:20px;">No hay reservaciones agendadas para hoy.</span>`;
        return;
    }

    todaysApts.forEach(apt => {
        list.innerHTML += `
            <div class="widget-list-item" style="border-left: 3px solid var(--gold-400);">
                <div style="font-weight:700; color:var(--gold-400); min-width:70px; margin-right: 10px;">${apt.time}</div>
                <div class="info" style="flex:1;">
                    <span class="main-text">${apt.clientName}</span>
                    <span class="sub-text" style="color:var(--violet-200)">${apt.service || 'Visita'}</span>
                </div>
            </div>
        `;
    });
}

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
                const timeline = document.getElementById('agenda-timeline');
                const monthView = document.getElementById('agenda-month-view');
                const picker = document.getElementById('agenda-date-picker');
                if (view === 'month') {
                    timeline.classList.add('hidden');
                    monthView.classList.remove('hidden');
                    const [y, m] = picker.value.split('-').map(n => parseInt(n));
                    agendaMonthState.year = y;
                    agendaMonthState.month = m - 1;
                    agendaMonthState.selectedDate = picker.value;
                    renderAgendaMonth();
                } else {
                    timeline.classList.remove('hidden');
                    monthView.classList.add('hidden');
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
        document.getElementById('apt-service').addEventListener('change', (ev) => {
            const srv = db.services.find(s => s.name === ev.target.value);
            if (srv && !srv.duration) {
                openServiceDurationModal(srv);
            }
        });

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
    }

    renderAgenda(todayStr);
}

function openAgendarModal(preselectedDate = null, preselectedTime = null) {
    document.getElementById('modal-appointment').classList.add('open');
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const dateInput = document.getElementById('apt-date');
    dateInput.value = preselectedDate || agendaMonthState.selectedDate || todayStr;
    dateInput.setAttribute('min', todayStr); // Bloquea fechas pasadas
    document.getElementById('apt-time').value = preselectedTime || '';
    // Asegurar que el select de servicio esté sincronizado visualmente
    const aptSel = document.getElementById('apt-service');
    if (aptSel) {
        aptSel.value = '';
        syncCustomSelect('apt-service');
    }
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
    // Restaurar título del modal
    const title = document.getElementById('apt-modal-title');
    if (title) title.textContent = 'Agendar Cita';
}

let editingAppointmentId = null;

async function editAppointment(id) {
    const apt = db.appointments.find(a => String(a.id) === String(id));
    if (!apt) return;
    editingAppointmentId = id;
    openAgendarModal(apt.date, (apt.time || '').slice(0, 5));
    document.getElementById('apt-client-name').value = apt.clientName || '';
    aptCurrentClient = db.clients.find(c => c.id == apt.clientId) || null;
    const aptSrv = document.getElementById('apt-service');
    if (aptSrv) { aptSrv.value = apt.service || ''; syncCustomSelect('apt-service'); }
    document.getElementById('apt-notes').value = apt.notes || '';
    const aptEmp = document.getElementById('apt-employee');
    if (aptEmp && apt.employeeId) { aptEmp.value = apt.employeeId; syncCustomSelect('apt-employee'); }
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

async function saveAppointment() {
    const nameInput = document.getElementById('apt-client-name').value.trim();
    const dateInput = document.getElementById('apt-date').value;
    const timeInput = document.getElementById('apt-time').value;

    if (!nameInput) { showToast('Ingresá el nombre de la clienta', 'error'); return; }
    if (!dateInput) { showToast('Seleccioná una fecha', 'error'); return; }
    if (!timeInput) { showToast('Seleccioná una hora', 'error'); return; }

    // No permitir fechas pasadas
    const todayStr = new Date().toISOString().slice(0, 10);
    if (dateInput < todayStr) {
        showToast('No se puede agendar en una fecha pasada', 'error');
        return;
    }

    const aptEmployeeId = document.getElementById('apt-employee')?.value || null;
    const serviceVal = document.getElementById('apt-service')?.value || '';

    // Collision Detection Logic
    const selectedService = db.services.find(s => s.name === serviceVal);
    const duration = selectedService && selectedService.duration ? selectedService.duration : 60;
    const start = new Date(`${dateInput}T${timeInput}`);
    const end = new Date(start.getTime() + duration * 60000);

    const hasCollision = db.appointments.some(a => {
        if (a.employee_id != aptEmployeeId || a.apt_date !== dateInput) return false;
        const aStart = new Date(`${a.apt_date}T${a.apt_time}`);
        const aService = db.services.find(s => s.name === a.service);
        const aDuration = aService && aService.duration ? aService.duration : 60;
        const aEnd = new Date(aStart.getTime() + aDuration * 60000);
        return (start < aEnd && end > aStart);
    });

    if (hasCollision) {
        if (!confirm('¡Atención! Este horario ya está ocupado para esta funcionaria. ¿Deseas agendar de todas formas?')) {
            return;
        }
    }

    // Crear clienta si no existe
    if (!aptCurrentClient) {
        showToast('Creando clienta...', 'info');
        aptCurrentClient = await createClient(nameInput);
        if (!aptCurrentClient) return;
    }

    const userId = getUserId();
    const aptData = {
        user_id: userId,
        client_id: aptCurrentClient.id,
        client_name: aptCurrentClient.name,
        apt_date: dateInput,
        apt_time: timeInput,
        service: serviceVal,
        notes: document.getElementById('apt-notes').value,
        employee_id: aptEmployeeId
    };

    showToast('Guardando cita...', 'info');
    let res;
    if (editingAppointmentId) {
        res = await window.supabaseClient.from('appointments').update(aptData).eq('id', editingAppointmentId).select();
    } else {
        res = await window.supabaseClient.from('appointments').insert([aptData]).select();
    }

    if (!res.error && res.data) {
        const raw = res.data[0];
        // Apply same transform as loadDataFromSupabase so mapped fields (date, time, clientId, etc.) exist
        const apt = {
            ...raw,
            date: raw.apt_date,
            time: raw.apt_time,
            clientId: raw.client_id,
            clientName: raw.client_name,
            serviceId: raw.service_id,
            employeeId: raw.employee_id
        };
        if (editingAppointmentId) {
            const idx = db.appointments.findIndex(a => a.id == editingAppointmentId);
            if (idx >= 0) db.appointments[idx] = apt;
        } else {
            db.appointments.push(apt);
        }
        showToast('Cita guardada con éxito');
        closeAgendarModal();
        renderAgenda(dateInput);
        renderAgendaSidePanel(dateInput);
    } else {
        console.error(res.error);
        showToast('Error al guardar cita', 'error');
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
    const todayStr = new Date().toISOString().slice(0, 10);

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
        const isClosed = (cfg.closedDays || []).includes(dow);
        const apts = db.appointments.filter(a => a.date === dateStr);
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
    const todayStr = new Date().toISOString().slice(0, 10); // fix: defined locally

    const [y, m, d] = dateStr.split('-').map(n => parseInt(n));
    const dateObj = new Date(y, m - 1, d);
    const dow = dateObj.getDay();
    const dayNames = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const monthNames = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

    let html = `<div style="font-weight:700;font-size:1rem;margin-bottom:.8rem;">${dayNames[dow]} ${d} ${monthNames[m-1]}</div>`;

    const isClosed = (cfg.closedDays || []).includes(dow);
    if (isClosed) {
        html += `<div class="badge badge-border" style="color:var(--danger);border-color:var(--danger);margin-bottom:.8rem;">Negocio cerrado este día</div>`;
    }

    // Normaliza 'HH:MM:SS' → 'HH:MM'
    const normTime = (t) => (t || '').slice(0, 5);

    // Citas del día (clickable → abrir para editar/eliminar)
    const apts = db.appointments
        .filter(a => a.date === dateStr)
        .sort((a, b) => normTime(a.time).localeCompare(normTime(b.time)));
    html += `<h5 style="font-size:.75rem;color:var(--text-dim);text-transform:uppercase;margin:.8rem 0 .4rem;">Citas (${apts.length})</h5>`;
    if (apts.length === 0) {
        html += `<div style="color:var(--text-dim);font-size:.8rem;">Sin citas programadas.</div>`;
    } else {
        html += apts.map(a => `<div class="apt-chip" data-apt-id="${a.id}" style="padding:6px 10px;background:rgba(91,58,138,0.15);border-left:3px solid var(--violet-400);border-radius:4px;margin-bottom:4px;font-size:.82rem;cursor:pointer;transition:background .15s;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <strong>${normTime(a.time) || '--:--'}</strong> · ${a.clientName}<br>
                    <span style="color:var(--text-dim);font-size:.72rem;">${a.service || 'Servicio s/e'}</span>
                </div>
                <div style="display:flex;gap:6px;">
                    <button class="btn-icon apt-edit-btn" data-apt-id="${a.id}" title="Editar"><i data-lucide="pencil" style="width:14px;height:14px;color:var(--violet-300);"></i></button>
                    <button class="btn-icon apt-del-btn" data-apt-id="${a.id}" title="Eliminar"><i data-lucide="trash-2" style="width:14px;height:14px;color:var(--danger);"></i></button>
                </div>
            </div>
        </div>`).join('');
    }

    // Horarios disponibles (slots libres) — clickeable para agendar rápido
    if (!isClosed && cfg.openTime && cfg.closeTime) {
        const busy = new Set(apts.map(a => normTime(a.time)).filter(Boolean));
        const slots = [];
        const toMin = t => { const [h, mn] = t.split(':').map(n => parseInt(n)); return h*60 + mn; };
        const toStr = mm => `${String(Math.floor(mm/60)).padStart(2,'0')}:${String(mm%60).padStart(2,'0')}`;
        const start = toMin(cfg.openTime);
        const end = toMin(cfg.closeTime);
        const lunchS = cfg.lunchStart ? toMin(cfg.lunchStart) : null;
        const lunchE = cfg.lunchEnd ? toMin(cfg.lunchEnd) : null;
        const blocks = (cfg.blockedSlots || []).filter(b => b.date === dateStr);
        // Reserva temporal en curso
        const tempRes = (window.tempSlotReservation && window.tempSlotReservation.date === dateStr) ? window.tempSlotReservation.time : null;
        const isPastDate = dateStr < todayStr;
        for (let t = start; t < end; t += 30) {
            const inLunch = (lunchS !== null && t >= lunchS && t < lunchE);
            const inBlock = blocks.some(b => t >= toMin(b.start) && t < toMin(b.end));
            const ts = toStr(t);
            const taken = busy.has(ts);
            const tempTaken = tempRes === ts;
            if (!inLunch && !inBlock && !taken && !tempTaken && !isPastDate) slots.push(ts);
        }
        html += `<h5 style="font-size:.75rem;color:var(--text-dim);text-transform:uppercase;margin:1rem 0 .4rem;">Horarios disponibles</h5>`;
        if (slots.length === 0) {
            html += `<div style="color:var(--text-dim);font-size:.8rem;">${isPastDate ? 'Fecha pasada.' : 'Sin huecos libres.'}</div>`;
        } else {
            html += `<div style="display:flex;flex-wrap:wrap;gap:4px;">` +
                slots.map(s => `<button type="button" class="slot-btn" data-slot-date="${dateStr}" data-slot-time="${s}" style="padding:4px 10px;background:rgba(52,211,153,0.12);border:1px solid rgba(52,211,153,0.3);color:var(--success);border-radius:4px;font-size:.72rem;cursor:pointer;font-family:inherit;">${s}</button>`).join('') +
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
    panel.querySelectorAll('.apt-del-btn').forEach(btn => {
        btn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const id = btn.dataset.aptId;
            const apt = db.appointments.find(a => String(a.id) === String(id));
            if (!apt) return;
            if (!confirm(`¿Eliminar la cita de ${apt.clientName} el ${apt.date} a las ${(apt.time||'').slice(0,5)}?`)) return;
            const { error } = await window.supabaseClient.from('appointments').delete().eq('id', id);
            if (error) { console.error(error); showToast('Error eliminando cita: ' + error.message, 'error'); return; }
            db.appointments = db.appointments.filter(a => String(a.id) !== String(id));
            showToast('Cita eliminada');
            renderAgendaSidePanel(dateStr);
            renderAgendaMonth();
            if (document.getElementById('agenda-date-picker').value === dateStr) renderAgenda(dateStr);
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
    const timeline = document.getElementById('agenda-timeline');
    timeline.innerHTML = '';

    const normTime = (t) => (t || '').slice(0, 5);
    const dayApts = db.appointments.filter(a => a.date === dateStr).sort((a,b) => normTime(a.time).localeCompare(normTime(b.time)));

    if (dayApts.length === 0) {
        timeline.innerHTML = `<div class="empty-state"><i data-lucide="coffee"></i><p>Sin citas para este día.</p></div>`;
        refreshIcons();
        return;
    }

    // Render as card-based timeline (no dependency on slot DOM elements)
    dayApts.forEach(apt => {
        const emp = db.employees.find(e => e.id == apt.employee_id);
        const empColor = emp && emp.color ? emp.color : 'var(--accent)';
        const service = db.services.find(s => s.name === apt.service);
        const duration = service && service.duration ? service.duration : 60;

        const eventEl = document.createElement('div');
        eventEl.className = 'agenda-event';
        eventEl.style.backgroundColor = empColor;
        eventEl.style.borderLeft = `4px solid rgba(0,0,0,0.2)`;
        eventEl.style.padding = '10px 14px';
        eventEl.style.borderRadius = '8px';
        eventEl.style.marginBottom = '8px';
        eventEl.style.cursor = 'pointer';
        eventEl.style.transition = 'transform 0.15s, box-shadow 0.15s';
        eventEl.innerHTML = `
            <div class="event-time" style="font-weight:700;font-size:0.9rem;">${normTime(apt.time) || '--:--'}</div>
            <div class="event-title" style="font-size:0.85rem;margin-top:2px;">${apt.client_name || apt.clientName || 'Sin cliente'}</div>
            <div class="event-desc" style="font-size:0.75rem;color:rgba(255,255,255,0.7);margin-top:2px;">${apt.service || 'Servicio'} ${emp ? '· ' + emp.name : ''} · ${duration}min</div>
        `;
        eventEl.onclick = () => openAppointmentDetail(apt);
        eventEl.onmouseenter = () => { eventEl.style.transform = 'scale(1.02)'; eventEl.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)'; };
        eventEl.onmouseleave = () => { eventEl.style.transform = ''; eventEl.style.boxShadow = ''; };
        timeline.appendChild(eventEl);
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
            const persist = document.getElementById('srvdur-persist').checked;
            if (persist && srv.id) {
                // Guardar en Supabase (con retry si falta columna)
                const { error } = await window.supabaseClient.from('services').update({ duration: mins }).eq('id', srv.id);
                if (error && /Could not find the '(\w+)' column/i.test(error.message)) {
                    showToast('Columna "duration" no existe en Supabase aún. Agregala desde el panel.', 'info');
                } else if (!error) {
                    showToast(`Duración ${mins} min guardada para "${srv.name}"`);
                }
            } else {
                showToast(`Duración ${mins} min aplicada para esta sesión`, 'info');
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

function initPOS() {
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
        if (toggle.checked) {
            incomeFields.classList.remove('hidden');
            expenseFields.classList.add('hidden');
            partialSection.classList.remove('hidden');
            label.textContent = "Ingreso de Dinero";
            label.style.color = "var(--success)";
            if (splitToggleRowEl) splitToggleRowEl.classList.remove('hidden');
            if (tipSectionEl) tipSectionEl.classList.remove('hidden');
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
            document.getElementById('amount').value = srv.price;
        } else {
            document.getElementById('amount').value = '';
        }
        // Mostrar duración en POS si existe (informativo)
        if (srv && srv.duration) {
            showToast(`Duración estimada: ${srv.duration} min`, 'info');
        }
    });

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

    const btnCierreGuardar = document.getElementById('btn-closure-save') || document.getElementById('btn-cierre-cerrar');
    if (btnCierreGuardar) btnCierreGuardar.addEventListener('click', saveCashClosure);

    const btnCierreWp = document.getElementById('btn-closure-whatsapp') || document.getElementById('btn-cierre-whatsapp');
    if (btnCierreWp) btnCierreWp.addEventListener('click', compartirCierrePorWhatsApp);

    const modalTxClose = document.getElementById('modal-txdetail-close');
    if (modalTxClose) modalTxClose.addEventListener('click', () => {
        const modal = document.getElementById('modal-transaction-detail');
        if (modal) modal.classList.remove('open');
    });

    updateFormSelects();
    updateStats();
}

function updateFormSelects() {
    const serviceSelect = document.getElementById('service');
    const aptServiceSelect = document.getElementById('apt-service');
    const employeeSelect = document.getElementById('employee');

    // POS — select de servicio (guarda el ID)
    serviceSelect.innerHTML = '<option value="" disabled selected style="display:none">Seleccione servicio...</option>';
    db.services.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} ${s.priceType === 'fijo' ? '($' + s.price + ')' : '(Variable)'}`;
        serviceSelect.appendChild(opt);
    });

    // Agenda — select de servicio (guarda el nombre, que es lo que se almacena en appointments)
    if (aptServiceSelect) {
        const prevVal = aptServiceSelect.value; // conservar selección actual si la hay
        aptServiceSelect.innerHTML = '<option value="">Sin especificar</option>';
        db.services.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.name;
            opt.textContent = s.name;
            aptServiceSelect.appendChild(opt);
        });
        if (prevVal) aptServiceSelect.value = prevVal;
    }

    // Select de empleada
    employeeSelect.innerHTML = '<option value="" disabled selected style="display:none">Seleccione empleada...</option>';
    db.employees.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.name;
        opt.textContent = e.name;
        employeeSelect.appendChild(opt);
    });

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

function initQuickModals() {
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
            const use = confirm(`Ya existe una clienta similar: "${dup.name}"${dup.phone ? ' (' + dup.phone + ')' : ''}.\n\nAceptar = usar esa ficha existente.\nCancelar = crear una NUEVA de todos modos.`);
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
            showToast('Error al crear clienta: ' + (error?.message || 'verificá conexión'), 'error');
            return;
        }
        db.clients.push(data[0]);
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
        const { data, error } = await window.supabaseClient.from('services').insert([{
            name, price_type: hasPrice ? 'fijo' : 'variable', price: hasPrice ? priceVal : null
        }]).select();
        qsSave.disabled = false;
        if (error || !data?.[0]) { showToast('Error al crear servicio', 'error'); return; }
        const newSrv = data[0];
        db.services.push({ id: newSrv.id, name: newSrv.name, priceType: newSrv.price_type, price: parseFloat(newSrv.price) || null, duration: newSrv.duration ? parseInt(newSrv.duration) : null });
        showToast(`Servicio "${name}" creado`);
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
                aptSel.value = newSrv.name;
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
}

async function saveTransaction() {
    const isIncome = document.getElementById('transaction-type-toggle').checked;
    
    let amount = parseFloat(document.getElementById(isIncome ? 'amount' : 'expense-amount').value);
    if (isNaN(amount) || amount <= 0) {
        showToast('Ingrese un monto válido.', 'error');
        return;
    }

    document.getElementById('btn-save-transaction').disabled = true;

    const userId = getUserId();
    const transactionSchema = {
        user_id: userId,
        transaction_date: new Date().toISOString(),
        is_income: isIncome,
        amount: amount,
        client_name: '',
        client_id: null,
        detail: '',
        method: '',
        employee: document.getElementById('employee').value
    };

    if (isIncome) {
        const clientInput = document.getElementById('client-name').value.trim();
        transactionSchema.client_name = currentClient ? currentClient.name : clientInput;
        transactionSchema.client_id = currentClient ? currentClient.id : null;
        const srvId = document.getElementById('service').value;
        const srv = db.services.find(s => s.id == srvId); // == for types
        transactionSchema.detail = srv ? srv.name : 'Servicio';
        transactionSchema.method = document.getElementById('payment-method').value;
        
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
            if (currentClient) {
                currentClient.debt = (parseFloat(currentClient.debt) || 0) + debtAmount;
                await window.supabaseClient.from('clients').update({debt: currentClient.debt}).eq('id', currentClient.id);
                // Log de deuda
                const fmt2 = n => Number(n).toLocaleString('es-UY');
                addClientLog(currentClient.id, `⚠ DEUDA GENERADA: $${fmt2(debtAmount)}`);
            }
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
    const { data: tData, error } = await window.supabaseClient.from('transactions').insert(inserts).select();
    document.getElementById('btn-save-transaction').disabled = false;

    if (tData && tData.length > 0) {
        tData.forEach(t => {
            db.transactions.push({
                id: t.id, date: t.transaction_date, isIncome: t.is_income,
                amount: parseFloat(t.amount), clientName: t.client_name,
                clientId: t.client_id, detail: t.detail, method: t.method, employee: t.employee
            });
        });

        // Manejar propina en la empleada si se guardó
        if (tipTx) {
            const tipAmt = tipTx.amount;
            const emp = db.employees.find(e => e.name === transactionSchema.employee);
            if (emp) {
                const newTips = (parseFloat(emp.tips) || 0) + tipAmt;
                const { error: empErr } = await window.supabaseClient.from('employees').update({ tips: newTips }).eq('id', emp.id);
                if (!empErr) emp.tips = newTips;
            }
        }

        if (isIncome) {
           clearClientSelection();
           document.getElementById('amount').value = '';
           document.getElementById('full-service-price').value = '';
           document.getElementById('service').value = '';
           document.getElementById('is-partial-payment').checked = false;
           document.getElementById('full-price-container').classList.add('hidden');
           document.getElementById('is-split-payment').checked = false;
           document.getElementById('split-payment-section').classList.add('hidden');
           document.getElementById('split-amount').value = '';
           document.getElementById('seña-method-row').classList.add('hidden');
           document.getElementById('split-toggle-row').classList.remove('hidden');
           document.getElementById('is-tip').checked = false;
           document.getElementById('tip-amount').value = '';
           document.getElementById('tip-fields').classList.add('hidden');
           updateFormSelects();
        } else {
           document.getElementById('expense-amount').value = '';
           document.getElementById('expense-detail').value = '';
        }
        
        // Log de pago en ficha de clienta
        if (isIncome && tData[0].client_id) {
            const fmt2 = n => Number(n).toLocaleString('es-UY');
            addClientLog(tData[0].client_id, `💰 Pago $${fmt2(tData[0].amount)} — ${tData[0].detail || ''} (${tData[0].method}) por ${tData[0].employee || '?'}`);
        }
        updateStats();
        renderTransactionsTable();
        showToast('Movimiento registrado en caja.');
    } else {
        console.error(error);
        showToast('Error de registro en caja.', 'error');
    }
}

function updateStats() {
    const today = new Date().toLocaleDateString();
    let cache = { ef:0, tr:0, de:0, tot:0 };

    db.transactions.filter(t => isSameDay(t.date, new Date())).forEach(t => {
        if (t.isIncome) {
            if (t.method === 'efectivo') cache.ef += t.amount;
            else if (t.method === 'transferencia') cache.tr += t.amount;
            else if (t.method === 'seña') cache.de += t.amount;
            else if (t.method?.startsWith('tarjeta')) cache.tr += t.amount;
        } else {
            cache.ef -= t.amount;
        }
    });

    const fmt = n => n.toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    document.getElementById('stat-cash').textContent = `$${fmt(cache.ef)}`;
    document.getElementById('stat-transfers').textContent = `$${fmt(cache.tr)}`;
    document.getElementById('stat-deps').textContent = `$${fmt(cache.de)}`;
    document.getElementById('stat-total').textContent = `$${fmt(cache.ef + cache.tr)}`;
}

function renderTransactionsTable() {
    const tbody = document.getElementById('today-transactions-tbody');
    tbody.innerHTML = '';
    const today = new Date();
    // No filtramos por extras para permitir agrupación de 'Mixto'
    const todays = db.transactions.filter(t => {
        return isSameDay(t.date, today);
    }).reverse();

    if (todays.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state" style="padding: 2rem;"><p>Caja limpia por ahora.</p></td></tr>`;
        return;
    }

    const fmt = n => Number(n).toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    let totalIncome = 0, totalEgreso = 0;

    const grouped = {};
    todays.forEach(t => {
        if (!grouped[t.date]) grouped[t.date] = [];
        grouped[t.date].push(t);
    });

    Object.values(grouped).forEach(group => {
        if (group.length === 1) {
            const t = group[0];
            const time = new Date(t.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const bCl = t.isIncome
                ? (t.method==='efectivo' ? 'badge-efectivo'
                   : t.method==='seña' ? 'badge-seña'
                   : t.method?.startsWith('tarjeta') ? 'badge-tarjeta'
                   : 'badge-transferencia')
                : 'badge-danger';
            
            const cleanDetail = (t.detail || 'Servicio').split(' (')[0].split(' — ')[0];
            const methodLabel = t.method === 'tarjeta_debito' ? 'T.Débito'
                : t.method === 'tarjeta_credito' ? 'T.Crédito' : t.method;

            tbody.innerHTML += `
                <tr class="tx-row" data-tx-id="${t.id}" style="cursor:pointer;" title="Ver detalle">
                    <td style="color:var(--text-dim);white-space:nowrap;">${time}</td>
                    <td><strong>${t.isIncome ? (t.clientName || 'General') : 'Retiro'}</strong><br><small style="color:var(--text-dim)">${t.employee || ''}</small></td>
                    <td style="max-width:250px;white-space:normal;" title="${t.detail}">${cleanDetail}</td>
                    <td><span class="badge ${bCl}">${t.isIncome ? 'Ingreso' : 'Egreso'}</span></td>
                    <td style="color:${t.isIncome ? 'var(--success)' : 'var(--danger)'}; font-weight:700;" class="text-right">
                        ${t.isIncome ? '+' : '-'}$${fmt(t.amount)}
                    </td>
                </tr>`;
        } else {
            const tMain = group[0];
            const time = new Date(tMain.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            let sumAmount = 0;
            let methodLabels = [];
            let fullDetailHTML = `<div style="display:flex; flex-direction:column; gap:4px; margin-top: 6px; padding-left: 8px; border-left: 2px solid var(--border);">`;
            
            group.forEach(g => {
                if (g.isIncome) { sumAmount += g.amount; totalIncome += g.amount; }
                else { sumAmount -= g.amount; totalEgreso += g.amount; }
                
                const gMethodLabel = g.method === 'tarjeta_debito' ? 'T.Débito' : g.method === 'tarjeta_credito' ? 'T.Crédito' : g.method;
                methodLabels.push(gMethodLabel);
                fullDetailHTML += `<div style="font-size:0.75rem; color:var(--text-dim);">${g.detail} <strong style="color:var(--text-primary)">($${fmt(g.amount)} - ${gMethodLabel})</strong></div>`;
            });
            fullDetailHTML += `</div>`;
            
            const txIds = group.map(g => g.id).join(',');
            
            tbody.innerHTML += `
                <tr class="tx-row" data-tx-ids="${txIds}" style="cursor:pointer;" title="Movimiento Mixto">
                    <td style="color:var(--text-dim);white-space:nowrap;">${time}</td>
                    <td><strong>${tMain.isIncome ? (tMain.clientName || 'General') : 'Retiro'}</strong><br><small style="color:var(--text-dim)">${tMain.employee || ''}</small></td>
                    <td>
                        <div style="font-weight:600;">${tMain.detail.split(' (')[0]} <span class="badge" style="background:rgba(91,58,138,0.1); color:var(--primary-light); border:1px solid var(--primary-light); font-size:0.6rem; padding: 1px 4px;">Mixto</span></div>
                    </td>
                    <td><span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text-secondary); border:1px solid var(--border-subtle);">Ingreso</span></td>
                    <td style="color:${sumAmount >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:700;" class="text-right">
                        ${sumAmount >= 0 ? '+' : '-'}$${fmt(Math.abs(sumAmount))}
                    </td>
                </tr>`;
        }
    });

    // Fila de totales al pie
    tbody.innerHTML += `
        <tr style="border-top:2px solid var(--border-subtle); background:rgba(0,0,0,0.2);">
            <td colspan="3" style="font-weight:700; font-size:0.85rem; color:var(--text-secondary);">
                ${todays.length} movimientos
                ${totalEgreso > 0 ? `<span style="color:var(--danger);margin-left:12px;">Egresos: -$${fmt(totalEgreso)}</span>` : ''}
            </td>
            <td style="font-weight:700; color:var(--text-secondary); text-align:right; font-size:0.8rem;">TOTAL</td>
            <td style="font-weight:800; color:var(--success); text-align:right; font-size:1.05rem;">$${fmt(totalIncome - totalEgreso)}</td>
        </tr>`;

    // Click en fila → abrir detalle
    tbody.querySelectorAll('tr.tx-row').forEach(row => {
        row.addEventListener('click', () => {
            const txId = row.dataset.txId;
            const txIds = row.dataset.txIds;
            
            if (txId) {
                const tx = db.transactions.find(t => String(t.id) === String(txId));
                if (tx) openTransactionDetail(tx);
            } else if (txIds) {
                const ids = txIds.split(',');
                const group = db.transactions.filter(t => ids.includes(String(t.id)));
                if (group.length > 0) openTransactionDetail(group);
            }
        });
        row.addEventListener('mouseenter', () => row.style.background = 'rgba(91,58,138,0.15)');
        row.addEventListener('mouseleave', () => row.style.background = '');
    });
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
                <button type="button" onclick="openClientModal('${t.clientId}');document.getElementById('modal-transaction-detail').classList.remove('open');" class="btn btn-ghost btn-sm" style="width:100%; justify-content:center;">👤 Ver ficha de clienta</button>
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
}

function openCashClosureModal() {
    const today = new Date();
    let cache = { ef:0, digital:0, se:0, egresos:0, tot:0 };

    const todays = db.transactions.filter(t => isSameDay(t.date, today));
    
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

    document.getElementById('closure-total-display').textContent = `$${fmt(cache.ef + cache.digital)}`;
    document.getElementById('closure-cash-display').textContent = `$${fmt(cache.ef)}`;
    document.getElementById('closure-digital-display').textContent = `$${fmt(cache.digital)}`;
    document.getElementById('closure-date-display').textContent = today.toLocaleDateString('es-UY', { day:'numeric', month:'long', year:'numeric' });
    document.getElementById('closure-note').value = '';
    
    // Inyectar desglose si hay
    const container = document.getElementById('modal-closure').querySelector('.modal-body');
    const existingBreakdown = container.querySelector('.closure-breakdown');
    if (existingBreakdown) existingBreakdown.remove();
    
    const breakdownDiv = document.createElement('div');
    breakdownDiv.className = 'closure-breakdown';
    breakdownDiv.innerHTML = empBreakdown;
    container.insertBefore(breakdownDiv, document.getElementById('closure-note').parentNode);

    document.getElementById('modal-closure').classList.add('open');
}

async function saveCashClosure() {
    const today = new Date();
    let cache = { ef:0, digital:0, se:0, egresos:0 };

    db.transactions.filter(t => isSameDay(t.date, today)).forEach(t => {
        if (t.isIncome) {
            if (t.method === 'efectivo') cache.ef += t.amount;
            else if (t.method === 'seña') cache.se += t.amount;
            else cache.digital += t.amount;
        } else {
            cache.ef -= t.amount;
            cache.egresos += t.amount;
        }
    });

    const userId = getUserId();
    const closureData = {
        user_id: userId,
        closure_date: new Date().toISOString(),
        cash_amount: cache.ef,
        digital_amount: cache.digital,
        total_amount: cache.ef + cache.digital,
        income_amount: cache.ef + cache.digital + cache.egresos,
        egress_amount: cache.egresos,
        note: `Señas: ${cache.se}`,
        created_by: 'Patricia'
    };

    showToast('Guardando cierre...', 'info');
    try {
        const { data, error } = await window.supabaseClient.from('closures').insert([closureData]).select();

        if (!error && data) {
            db.closures.unshift(data[0]);
            renderClosuresHistory();
            document.getElementById('modal-cierre-caja').classList.remove('open');
            showToast('Cierre de caja guardado con éxito.');
        } else {
            console.error(error);
            showToast('Error al guardar cierre. Ver consola.', 'error');
        }
    } catch(e) {
        console.error(e);
        showToast('Error de red al guardar cierre.', 'error');
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

function openClosureDetailModal(closureId) {
    const c = db.closures.find(x => x.id == closureId);
    if (!c) return;

    const fmt = n => Number(n).toLocaleString('es-UY', { minimumFractionDigits: 0 });
    const date = new Date(c.closure_date);
    const dateStr = date.toLocaleDateString('es-UY', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    const timeStr = date.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });

    document.getElementById('closure-detail-body').innerHTML = `
        <div style="background:rgba(91,58,138,0.1); border-radius:10px; padding:15px; text-align:center; margin-bottom:1.5rem;">
            <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; margin-bottom:5px;">Recaudación Total</div>
            <div style="font-size:1.8rem; font-weight:800; color:var(--success);">$${fmt(c.total_amount)}</div>
            <div style="font-size:0.8rem; color:var(--text-dim);">${dateStr} · ${timeStr}</div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:1.5rem;">
            <div style="background:rgba(0,0,0,0.2); padding:12px; border-radius:8px;">
                <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase;">Efectivo</div>
                <div style="font-size:1rem; font-weight:700; color:var(--text-primary);">$${fmt(c.cash_amount)}</div>
            </div>
            <div style="background:rgba(0,0,0,0.2); padding:12px; border-radius:8px;">
                <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase;">Digital</div>
                <div style="font-size:1rem; font-weight:700; color:var(--text-primary);">$${fmt(c.digital_amount)}</div>
            </div>
        </div>

        <div style="background:rgba(255,255,255,0.03); padding:12px; border-radius:8px; border: 1px solid var(--border);">
            <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; margin-bottom:5px;">Notas / Observaciones</div>
            <div style="font-size:0.85rem; color:var(--text-primary); line-height:1.4;">${c.note || 'Sin observaciones.'}</div>
        </div>
        
        <div style="margin-top:1.5rem; text-align:center; font-size:0.75rem; color:var(--text-dim);">
            Realizado por ${c.created_by || 'Patricia'}
        </div>
    `;
    
    document.getElementById('modal-closure-detail').classList.add('open');
}

// ==========================================
// 8. CRM BASE DE DATOS CLIENTES
// ==========================================
function initCRM() {
    document.getElementById('btn-new-client').addEventListener('click', () => openClientModal());
    document.getElementById('btn-close-modal').addEventListener('click', closeClientModal);
    document.getElementById('btn-save-client').addEventListener('click', saveClient);
    document.getElementById('search-client-table').addEventListener('input', (e) => renderClientsTable(e.target.value));
    document.getElementById('btn-export-csv').addEventListener('click', exportClientesCSV);
    // Input file oculto para subida de foto
    let hiddenFileInput = document.getElementById('cm-photo-file');
    if (!hiddenFileInput) {
        hiddenFileInput = document.createElement('input');
        hiddenFileInput.type = 'file';
        hiddenFileInput.id = 'cm-photo-file';
        hiddenFileInput.accept = 'image/*';
        hiddenFileInput.style.display = 'none';
        document.body.appendChild(hiddenFileInput);
    }

    document.getElementById('btn-upload-photo').addEventListener('click', () => {
        if (!activeModal) {
            showToast('Guardá la clienta primero antes de subir foto', 'info');
            return;
        }
        hiddenFileInput.click();
    });

    hiddenFileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!activeModal) { showToast('Guardá la clienta primero', 'error'); return; }
        if (file.size > 5 * 1024 * 1024) { showToast('La imagen excede 5MB', 'error'); return; }

        showToast('Subiendo foto...', 'info');
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const filePath = `clients/${activeModal}_${Date.now()}.${ext}`;

        // Helper: guardar foto localmente en localStorage como base64
        const savePhotoLocally = (dataUrl) => {
            try {
                localStorage.setItem(`violet_photo_${activeModal}`, dataUrl);
            } catch(e) {
                // Si localStorage está lleno, comprimir un poco (reducir calidad)
                console.warn('localStorage lleno para foto:', e);
            }
            const c = db.clients.find(x => x.id == activeModal);
            if (c) c.photo_url = dataUrl;
            const img = document.getElementById('crm-profile-photo');
            const initials = document.getElementById('cm-initials');
            img.src = dataUrl;
            img.classList.remove('hidden');
            if (initials) initials.classList.add('hidden');
            showToast('Foto guardada localmente en este dispositivo');
        };

        try {
            const { error: upErr } = await window.supabaseClient.storage
                .from('client-photos')
                .upload(filePath, file, { upsert: true, contentType: file.type });
            if (upErr) {
                // Fallback base64 si el bucket no existe o hay error de Storage
                if (/bucket|not found|storage/i.test(upErr.message) || true) {
                    const reader = new FileReader();
                    reader.onload = (ev) => savePhotoLocally(ev.target.result);
                    reader.readAsDataURL(file);
                    hiddenFileInput.value = '';
                    return;
                }
                showToast('Error subiendo foto: ' + upErr.message, 'error');
                console.error(upErr);
                hiddenFileInput.value = '';
                return;
            }
            const { data: urlData } = window.supabaseClient.storage.from('client-photos').getPublicUrl(filePath);
            const photoUrl = urlData?.publicUrl;
            if (!photoUrl) { showToast('No se pudo obtener URL pública', 'error'); return; }

            // Guardar URL en Supabase (clients.photo_url)
            const { error: dbErr } = await updateClientSafe(activeModal, { photo_url: photoUrl });
            if (dbErr) {
                // Si falló guardar en Supabase, guardar localmente
                const reader = new FileReader();
                reader.onload = (ev) => savePhotoLocally(ev.target.result);
                reader.readAsDataURL(file);
                hiddenFileInput.value = '';
                return;
            }

            // Actualizar UI con URL de Supabase
            const c = db.clients.find(x => x.id == activeModal);
            if (c) c.photo_url = photoUrl;
            const img = document.getElementById('crm-profile-photo');
            const initials = document.getElementById('cm-initials');
            img.src = photoUrl;
            img.classList.remove('hidden');
            if (initials) initials.classList.add('hidden');
            showToast('Foto actualizada');
        } catch (err) {
            console.error(err);
            showToast('Error inesperado: ' + err.message, 'error');
        } finally {
            hiddenFileInput.value = '';
        }
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
        
        const userId = getUserId();
        const { data, error: dbErr } = await window.supabaseClient.from('client_files').insert([{
            user_id: userId,
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
    if (!confirm('¿Eliminar este archivo permanentemente?')) return;
    
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

async function createClient(name, phone = '') {
    // Evitar duplicados automáticamente: si ya existe, devolver la ficha existente
    const existing = findDuplicateClient(name, phone);
    if (existing) {
        showToast(`Usando ficha existente de "${existing.name}"`, 'info');
        return existing;
    }

    const newClientData = {
        name: name,
        phone: phone || '',
        instagram: '',
        birthday: null,
        notes: '',
        balance: 0,
        debt: 0
    };
    const { data, error } = await insertClientSafe(newClientData);
    if (data && data[0]) {
        db.clients.push(data[0]);
        return data[0];
    }
    console.error('Error creando cliente:', error);
    // Fallback local si Supabase falla
    const fallback = { id: 'cl_' + Date.now(), ...newClientData };
    db.clients.push(fallback);
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

            if (c.balance > 0 || c.debt > 0) {
                bBadge.classList.remove('hidden');
                if (c.balance > 0) {
                    bBadge.textContent = `Saldo a favor (Seña): $${fmt(c.balance)}`;
                    bBadge.style.color = 'var(--info)';
                    bBadge.style.borderColor = 'var(--info)';
                } else {
                    const debtTxs = db.transactions.filter(t => t.clientId == c.id && t.detail && t.detail.includes('Generó Deuda'));
                    let debtInfo = `Deuda pendiente: $${fmt(c.debt)}`;
                    if (debtTxs.length > 0) {
                        const debtDates = debtTxs.map(t => {
                            const d = new Date(t.date);
                            return d.toLocaleDateString('es-UY', { day:'2-digit', month:'2-digit' });
                        });
                        debtInfo += ` (Generada: ${[...new Set(debtDates)].join(', ')})`;
                    }
                    bBadge.textContent = debtInfo;
                    bBadge.style.color = 'var(--danger)';
                    bBadge.style.borderColor = 'var(--danger)';
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
    }
    refreshIcons();
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
    if (client && client.debt > 0) {
        const debtTxs = db.transactions.filter(t => t.clientId == clientId && t.detail && t.detail.includes('Generó Deuda'));
        debtTxs.forEach(t => {
            const dateStr = new Date(t.date).toLocaleDateString('es-UY', { day:'2-digit', month:'2-digit', year:'numeric' });
            list.innerHTML += `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--danger-bg);border-radius:var(--radius-sm);border:1px solid var(--danger);margin-bottom:8px;">
                    <div>
                        <div style="font-size:0.8rem;font-weight:700;color:var(--danger);">DEUDA PENDIENTE</div>
                        <div style="font-size:0.72rem;color:var(--text-dim);">${dateStr} · Por servicio realizado</div>
                    </div>
                    <div style="font-weight:800;color:var(--danger);font-size:1rem;">$${fmt(t.amount)}</div>
                </div>
            `;
        });
    }

    // 2. Historial de Servicios
    const grouped = {};
    db.transactions
        .filter(t => t.clientId == clientId && t.isIncome && !t.detail.includes('Propina'))
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
        const aptNote = db.appointments.find(a => a.clientId == clientId && a.date === dateKey)?.notes;
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
// (orphan code block removed — was a duplicate of renderClientHistory logic left from a previous refactor)

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

    const clientData = {
        name,
        phone: document.getElementById('cm-phone').value,
        instagram: document.getElementById('cm-ig').value,
        birthday: document.getElementById('cm-birthday').value || null,
        notes: document.getElementById('cm-notes').value
    };

    const btn = document.getElementById('btn-save-client');

    // Chequeo de duplicados (solo para creación nueva)
    if (!activeModal) {
        const dup = findDuplicateClient(clientData.name, clientData.phone);
        if (dup) {
            const use = confirm(`Ya existe "${dup.name}"${dup.phone ? ' (' + dup.phone + ')' : ''}.\n\nAceptar = abrir esa ficha existente.\nCancelar = crear duplicada igualmente.`);
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
            console.error(error);
            showToast('Error al guardar perfil: ' + (error.message || ''), 'error');
            btn.disabled = false;
            return;
        }
        // Log de cambios
        const changes = [];
        if (prev.name !== clientData.name) changes.push(`Nombre: "${prev.name}" → "${clientData.name}"`);
        if ((prev.phone||'') !== clientData.phone) changes.push(`Teléfono actualizado`);
        if ((prev.notes||'') !== clientData.notes) changes.push(`Notas actualizadas`);
        if ((prev.birthday||'') !== (clientData.birthday||'')) changes.push(`Cumpleaños actualizado`);
        if (changes.length > 0) addClientLog(activeModal, '✏️ ' + changes.join(' | '));
        Object.assign(db.clients.find(c => c.id == activeModal), clientData);
    } else {
        const { data: newClients, error } = await insertClientSafe({
            ...clientData,
            balance: 0,
            debt: 0
        });
        if (error || !newClients || !newClients[0]) {
            console.error('Error creando clienta:', error);
            showToast('Error al crear clienta: ' + (error?.message || 'verificá la conexión'), 'error');
            btn.disabled = false;
            return;
        }
        db.clients.push(newClients[0]);
    }

    btn.disabled = false;

    // Obtener el cliente recién guardado (ya está en db)
    const savedClient = activeModal
        ? db.clients.find(c => c.id == activeModal)
        : db.clients[db.clients.length - 1];

    closeClientModal();
    if (currentView === 'clients') renderClientsTable();
    if (currentView === 'dashboard') initDashboard();
    showToast('Ficha guardada');

    // Si veníamos desde el autocomplete de agenda, ejecutar callback y reabrir modal de cita
    if (_clientModalSavedCallback && savedClient) {
        const cb = _clientModalSavedCallback;
        _clientModalSavedCallback = null;
        cb(savedClient);
        // Reabrir modal de agenda si estaba abierto antes
        if (!document.getElementById('modal-appointment').classList.contains('open')) {
            openAgendarModal();
        }
    }
}

// ==========================================
// 9. ANALÍTICAS (Chart.js)
// ==========================================
// initAnalytics merged above

function updateCharts() {
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
    if (!dateInput.value) {
        const todayLocal = new Date();
        dateInput.value = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth()+1).padStart(2,'0')}-${String(todayLocal.getDate()).padStart(2,'0')}`;
    }
    dateInput.removeEventListener('change', renderEmployeeCashTable);
    dateInput.addEventListener('change', renderEmployeeCashTable);

    renderEmployeeCashTable();
    renderServicesRanking();
}

function renderEmployeeCashTable() {
    const tbody = document.getElementById('employee-cash-tbody');
    tbody.innerHTML = '';
    
    const selectedDateStr = document.getElementById('employee-cash-date').value;
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
        // detail sometimes contains ' (Pago parcial...', extract real service name
        let name = t.detail.split(' (')[0];
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

        // Habilitar/deshabilitar precio según tipo seleccionado
        document.getElementById('srv-type').addEventListener('change', (e) => {
            setSrvPriceState(e.target.value);
        });

        document.getElementById('fm-service').addEventListener('submit', (e) => { e.preventDefault(); saveService(); });
        document.getElementById('fm-employee').addEventListener('submit', (e) => { e.preventDefault(); saveEmployee(); });

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
    renderEmployeesList();
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
    document.getElementById('cfg-lunch-start').value = cfg.lunchStart || '';
    document.getElementById('cfg-lunch-end').value = cfg.lunchEnd || '';
    document.getElementById('cfg-time-format').value = cfg.timeFormat || '24h';

    // Sincronizar los custom selects de hora con los valores cargados
    ['cfg-open-time', 'cfg-close-time', 'cfg-lunch-start', 'cfg-lunch-end'].forEach(id => syncCustomSelect(id));
    syncCustomSelect('cfg-time-format');

    // Días de la semana (siempre se re-renderizan)
    const daysContainer = document.getElementById('cfg-closed-days');
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
            document.getElementById('cfg-lunch-start').value = latest.lunchStart || '';
            document.getElementById('cfg-lunch-end').value = latest.lunchEnd || '';
            ['cfg-open-time', 'cfg-close-time', 'cfg-lunch-start', 'cfg-lunch-end'].forEach(id => syncCustomSelect(id));
        });

        document.getElementById('btn-save-business-cfg').addEventListener('click', () => {
            const closedDays = Array.from(daysContainer.querySelectorAll('input[type="checkbox"]:checked')).map(i => parseInt(i.dataset.day));
            const current = getBusinessConfig();
            const newCfg = {
                ...current,
                openTime: document.getElementById('cfg-open-time').value,
                closeTime: document.getElementById('cfg-close-time').value,
                lunchStart: document.getElementById('cfg-lunch-start').value,
                lunchEnd: document.getElementById('cfg-lunch-end').value,
                timeFormat: document.getElementById('cfg-time-format').value,
                closedDays
            };
            saveBusinessConfig(newCfg);
            populateTimeSelects();
            showToast('Configuración guardada');
        });

        document.getElementById('btn-reset-business-cfg').addEventListener('click', () => {
            if (!confirm('¿Restaurar la configuración de agenda a los valores predeterminados?')) return;
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

    const userId = getUserId();
    const serviceData = {
        user_id: userId,
        name: name,
        price_type: type,
        price: type === 'fijo' ? price : null,
        duration: duration
    };

    const submitBtn = document.querySelector('#fm-service [type="submit"]');
    submitBtn.disabled = true;

    // Helper retry para columna faltante en services
    async function svcUpsert(payload, isUpdate) {
        let result = isUpdate
            ? await window.supabaseClient.from('services').update(payload).eq('id', editingServiceId).select()
            : await window.supabaseClient.from('services').insert([payload]).select();
        if (result.error?.message) {
            const m = result.error.message.match(/Could not find the '(\w+)' column/i);
            if (m && m[1] && m[1] in payload) {
                const clean = { ...payload }; delete clean[m[1]];
                result = isUpdate
                    ? await window.supabaseClient.from('services').update(clean).eq('id', editingServiceId).select()
                    : await window.supabaseClient.from('services').insert([clean]).select();
            }
        }
        return result;
    }

    if (editingServiceId) {
        const { error } = await svcUpsert(serviceData, true);
        if (error) {
            showToast('Error al actualizar servicio', 'error');
            submitBtn.disabled = false;
            return;
        }
        let s = db.services.find(x => x.id == editingServiceId);
        if (s) { s.name = name; s.priceType = type; s.price = serviceData.price; s.duration = duration; }
        showToast('Servicio actualizado');
    } else {
        const { data, error } = await svcUpsert(serviceData, false);
        if (error || !data || !data[0]) {
            showToast('Error al crear servicio', 'error');
            submitBtn.disabled = false;
            return;
        }
        db.services.push({ id: data[0].id, name: data[0].name, priceType: data[0].price_type, price: parseFloat(data[0].price) || null, duration: data[0].duration ? parseInt(data[0].duration) : null });
        showToast('Servicio creado');
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
            document.getElementById('emp-join-date').value = emp.joinDate || '';
            document.getElementById('emp-pay-day').value = emp.payDay || '';
            document.getElementById('emp-tips').value = emp.tips || 0;
            document.getElementById('emp-advances').value = emp.advances || 0;
        }
    } else {
        document.getElementById('fm-employee').reset();
    }
    modal.classList.add('open');
}

function closeEmployeeModal() {
    document.getElementById('modal-employee').classList.remove('open');
    editingEmployeeId = null;
}

async function saveEmployee() {
    const name = document.getElementById('emp-name').value.trim();
    if (!name) return;

    const userId = getUserId();
    const empData = {
        user_id: userId,
        name: name,
        join_date: document.getElementById('emp-join-date').value || null,
        pay_day: parseInt(document.getElementById('emp-pay-day').value) || null,
        tips: parseFloat(document.getElementById('emp-tips').value) || 0,
        advances: parseFloat(document.getElementById('emp-advances').value) || 0
    };

    const submitBtn = document.querySelector('#fm-employee [type="submit"]');
    submitBtn.disabled = true;

    if (editingEmployeeId) {
        const { error } = await window.supabaseClient.from('employees').update(empData).eq('id', editingEmployeeId);
        if (error) {
            showToast('Error al actualizar funcionaria', 'error');
            submitBtn.disabled = false;
            return;
        }
        let emp = db.employees.find(x => x.id == editingEmployeeId);
        if (emp) { emp.name = empData.name; emp.joinDate = empData.join_date; emp.payDay = empData.pay_day; emp.tips = empData.tips; emp.advances = empData.advances; }
        showToast('Funcionaria actualizada');
    } else {
        const { data, error } = await window.supabaseClient.from('employees').insert([empData]).select();
        if (error || !data || !data[0]) {
            showToast('Error al agregar funcionaria', 'error');
            submitBtn.disabled = false;
            return;
        }
        db.employees.push({ id: data[0].id, name: data[0].name, joinDate: data[0].join_date, payDay: data[0].pay_day, tips: parseFloat(data[0].tips) || 0, advances: parseFloat(data[0].advances) || 0 });
        showToast('Funcionaria agregada');
    }

    submitBtn.disabled = false;
    updateFormSelects();
    renderEmployeesList();
    if (currentView === 'analytics') updateCharts();
    closeEmployeeModal();
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
            const { error } = await window.supabaseClient.from('services').delete().eq('id', id);
            if (error) { showToast('Error al eliminar servicio', 'error'); return; }
            db.services = db.services.filter(x => x.id != id);
            updateFormSelects();
            renderServicesList();
        };
    });
    refreshIcons();
}

function renderEmployeesList() {
    const list = document.getElementById('settings-employees-list');
    list.innerHTML = '';
    if (db.employees.length === 0) {
        list.innerHTML = '<span style="color:var(--text-dim);font-size:0.85rem">No hay funcionarias registradas.</span>';
        return;
    }
    db.employees.forEach(emp => {
        const li = document.createElement('li');
        li.className = 'task-item';
        
        let subText = [];
        if (emp.payDay) subText.push('Pago: ' + emp.payDay);
        if (emp.tips) subText.push('Propinas: $' + emp.tips);
        if (emp.advances) subText.push('Adeuda: $' + emp.advances);

        li.innerHTML = `
            <div style="flex:1;">
                <span class="task-text"><i data-lucide="user" style="width:14px;height:14px;margin-right:5px;vertical-align:-2px"></i> ${emp.name}</span>
                ${subText.length > 0 ? `<div style="font-size:0.75rem; color:var(--text-dim); margin-left: 20px; margin-top:2px;">${subText.join(' | ')}</div>` : ''}
            </div>
            <div style="display:flex; gap: 5px;">
                <button class="btn-icon btn-sm" onclick="openEmployeeModal('${emp.id}')" style="padding:0;color:var(--text-dim)"><i data-lucide="edit-2" style="width:14px;height:14px"></i></button>
                <button class="btn-icon btn-sm btn-del-emp" data-id="${emp.id}" style="padding:0;color:var(--danger)"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
            </div>
        `;
        list.appendChild(li);
    });

    document.querySelectorAll('.btn-del-emp').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const { error } = await window.supabaseClient.from('employees').delete().eq('id', id);
            if (error) { showToast('Error al eliminar funcionaria', 'error'); return; }
            db.employees = db.employees.filter(x => x.id != id);
            updateFormSelects();
            renderEmployeesList();
            if (currentView === 'analytics') updateCharts();
        };
    });
    refreshIcons();
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
    const date1 = new Date(d1);
    const date2 = new Date(d2);
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
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
        `"${(t.description || '').replace(/"/g, '')}"`,
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
- Turnos hoy: ${db.appointments.filter(a => { const d = new Date(); return a.date === `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }).length}`;
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

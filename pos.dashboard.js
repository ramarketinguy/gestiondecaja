/**
 * POS.DASHBOARD.JS - Dashboard y Widgets
 * Funciones del dashboard principal
 */

function initDashboard() {
    console.log('[DASHBOARD] init');
    try {
        renderDashboardCumpleanos();
        renderDashboardTareas();
        renderDashboardDeudas();
        renderDashboardAgendaResumen();
    } catch (e) {
        console.error('[DASHBOARD] Fallo crítico durante inicialización:', e);
    }
    if (typeof refreshIcons === 'function') refreshIcons();
}


function renderDashboardCumpleanos() {
    const list = document.getElementById('widget-birthdays');
    if (!list) return;
    list.innerHTML = '';

    const clients = db?.clients || [];
    if (clients.length === 0) {
        list.innerHTML = '<span style="color:var(--text-dim);font-size:0.85rem">Sin clientes aún</span>';
        return;
    }

    const today = new Date();
    const upcoming = clients.filter(c => {
        if (!c.birthday) return false;
        try {
            const [y, m, d] = c.birthday.split('-');
            let bDate = new Date(today.getFullYear(), parseInt(m) - 1, parseInt(d));
            if (bDate < today) bDate.setFullYear(today.getFullYear() + 1);
            const diffDays = Math.ceil(Math.abs(bDate - today) / (1000 * 60 * 60 * 24));
            return diffDays <= 7;
        } catch (e) {
            return false;
        }
    });

    if (upcoming.length === 0) {
        list.innerHTML = '<span style="color:var(--text-dim);font-size:0.85rem">Sin cumpleaños próximos</span>';
        return;
    }

    upcoming.forEach(c => {
        const bday = c.birthday || '';
        const day = bday.slice(8, 10) || '';
        const month = bday.slice(5, 7) || '';
        list.innerHTML += `
            <div class="widget-list-item">
                <div class="info">
                    <span class="main-text">${c.name}</span>
                    <span class="sub-text">${c.phone || '-'}</span>
                </div>
                <div class="badge badge-border" style="color:var(--violet-200);border-color:var(--violet-400)">${day}/${month}</div>
            </div>
        `;
    });
    if (typeof refreshIcons === 'function') refreshIcons();
}


function renderDashboardTareas() {
    const list = document.getElementById('task-list');
    if (!list) return;

    const addBtn = document.getElementById('btn-add-task');
    if (addBtn) {
        addBtn.onclick = () => {
            const row = document.getElementById('task-input-container');
            if (row) row.classList.toggle('hidden');
            const input = document.getElementById('new-task-input');
            if (input && row && !row.classList.contains('hidden')) input.focus();
        };
    }

    const input = document.getElementById('new-task-input');
    if (input && !input.dataset.bound) {
        input.dataset.bound = '1';
        input.addEventListener('keydown', async (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const text = input.value.trim();
            if (!text) return;

            // Bloquear input para evitar doble envío
            input.disabled = true;
            input.placeholder = 'Guardando...';

            // Timeout de seguridad: si en 10 seg no vuelve la red, desbloquear
            const safetyTimeout = setTimeout(() => {
                if (input.disabled) {
                    input.disabled = false;
                    input.placeholder = 'Reintentando...';
                    console.warn('[DASHBOARD] Timeout de seguridad al guardar tarea');
                }
            }, 10000);

            const payload = { text, completed: false };
            const userId = typeof getUserId === 'function' ? getUserId() : null;
            if (userId) payload.user_id = userId;

            // Guardado optimista local
            const tempId = createLocalId('task');
            const tempTask = { id: tempId, ...payload, pendingSync: true };
            db.tasks.push(tempTask);
            persistCollectionLocal('tasks', db.tasks);
            
            input.value = '';
            renderDashboardTareas();

            try {
                const { data, error } = await insertRowsSafe('tasks', payload);
                if (error) throw error;
                
                // Reemplazar la temporal por la real si se guardó
                if (data && data[0]) {
                    const idx = db.tasks.findIndex(t => t.id === tempId);
                    if (idx !== -1) db.tasks[idx] = data[0];
                    persistCollectionLocal('tasks', db.tasks);
                }
                if (typeof showToast === 'function') showToast('Tarea guardada');
            } catch (err) {
                console.error('[DASHBOARD] Error sincronizando tarea:', err);
                if (typeof showToast === 'function') showToast('Tarea guardada localmente', 'warning');
            } finally {
                clearTimeout(safetyTimeout);
                input.disabled = false;
                input.placeholder = 'Nueva tarea...';
                renderDashboardTareas();
            }
        });
    }

    const tasks = db?.tasks || [];
    list.innerHTML = '';

    if (tasks.length === 0) {
        list.innerHTML = '<span style="color:var(--text-dim);font-size:0.85rem">No hay tareas</span>';
        return;
    }

    tasks.forEach(t => {
        const item = document.createElement('li');
        item.className = `task-item ${t.completed ? 'completed' : ''}`;
        item.innerHTML = `
            <input type="checkbox" class="task-checkbox" ${t.completed ? 'checked' : ''} data-id="${t.id}">
            <span class="task-text">${t.text}</span>
            <button class="btn-icon btn-sm task-del" data-id="${t.id}"><i data-lucide="trash-2"></i></button>
        `;
        list.appendChild(item);
    });

    // Event listeners para checkboxes
    list.querySelectorAll('.task-checkbox').forEach(cb => {
        cb.onchange = async (e) => {
            const id = e.target.dataset.id;
            const task = tasks.find(x => x.id == id);
            if (task && window.supabaseClient) {
                task.completed = e.target.checked;
                try {
                    const { error } = await updateRowSafe('tasks', id, { completed: task.completed });
                    if (error) throw error;
                    renderDashboardTareas();
                    persistCollectionLocal('tasks', db.tasks);
                } catch (err) {
                    console.error('[DASHBOARD] Error actualizando tarea:', err);
                    if (typeof showToast === 'function') showToast('Error al actualizar tarea', 'error');
                    // Revertir estado local si falló la red
                    task.completed = !task.completed;
                    e.target.checked = task.completed;
                }
            }
        };
    });

    list.querySelectorAll('.task-del').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.currentTarget.dataset.id;
                try {
                    const { error } = await deleteRowSafe('tasks', id);
                    if (error) throw error;
                    db.tasks = tasks.filter(x => x.id != id);
                    persistCollectionLocal('tasks', db.tasks);
                    renderDashboardTareas();
                    if (typeof showToast === 'function') showToast('Tarea eliminada', 'success');
                } catch (err) {
                    console.error('[DASHBOARD] Error eliminando tarea:', err);
                    if (typeof showToast === 'function') showToast('Error al eliminar tarea', 'error');
                }
        };
    });
    if (typeof refreshIcons === 'function') refreshIcons();
}


function renderDashboardDeudas() {
    const list = document.getElementById('widget-debts');
    if (!list) return;
    list.innerHTML = '';

    const clients = db?.clients || [];
    const inDebt = clients.filter(c => c.debt && c.debt > 0);

    if (inDebt.length === 0) {
        list.innerHTML = '<span style="color:var(--text-dim);font-size:0.85rem">Sin cuentas por cobrar</span>';
        return;
    }

    const total = inDebt.reduce((s, c) => s + parseFloat(c.debt || 0), 0);
    list.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(248,113,113,0.08);border-radius:var(--radius-sm);margin-bottom:4px;border:1px solid rgba(248,113,113,0.2);">
            <span style="font-size:0.8rem;color:var(--text-dim)">${inDebt.length} clientas deben</span>
            <span style="font-weight:800;color:var(--danger);font-size:1rem;">$${total.toLocaleString('es-UY')}</span>
        </div>
    `;

    inDebt.slice(0, 5).forEach(c => {
        list.innerHTML += `
            <div class="widget-list-item" style="cursor:pointer;" onclick="openClientModal('${c.id}')">
                <div class="info">
                    <span class="main-text">${c.name}</span>
                    <span class="sub-text">${c.phone || '-'}</span>
                </div>
                <span style="color:var(--danger);font-weight:700;">$${c.debt}</span>
            </div>
        `;
    });
    if (typeof refreshIcons === 'function') refreshIcons();
}


function renderDashboardAgendaResumen() {
    const list = document.getElementById('widget-agenda');
    if (!list) return;
    list.innerHTML = '';

    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    
    console.log('[DASHBOARD] Hoy local:', todayStr);

    const appointments = db?.appointments || [];
    console.log('[DASHBOARD] Total citas en DB:', appointments.length);
    if (appointments.length > 0) {
        console.log('[DASHBOARD] Muestra cita 0:', appointments[0].client_name || appointments[0].clientName, 'Fecha:', appointments[0].date || appointments[0].apt_date);
    }

    const aptDate = (a) => typeof getAppointmentDate === 'function' ? getAppointmentDate(a) : (a.date || a.apt_date || '');
    const aptTime = (a) => typeof getAppointmentTime === 'function' ? getAppointmentTime(a) : ((a.time || a.apt_time || '').slice(0, 5));
    
    const todaysApts = appointments.filter(a => {
        let d = aptDate(a);
        if (!d) return false;
        
        // Normalización agresiva de fecha
        let dStr = '';
        if (typeof d === 'string') {
            dStr = d.includes('T') ? d.split('T')[0] : d;
        } else if (d instanceof Date) {
            dStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        }

        const match = dStr === todayStr;
        if (match) console.log('[DASHBOARD] Coincidencia hallada:', a.clientName || a.client_name, dStr);
        return match;
    }).sort((a, b) => aptTime(a).localeCompare(aptTime(b)));

    console.log('[DASHBOARD] Citas encontradas hoy:', todaysApts.length);

    if (todaysApts.length === 0) {
        list.innerHTML = '<span style="color:var(--text-dim);font-size:0.85rem">Sin citas para hoy</span>';
        return;
    }

    todaysApts.forEach(apt => {
        const serviceLabel = typeof getAppointmentServices === 'function'
            ? (getAppointmentServices(apt).map(s => s.name).join(' + ') || apt.service || 'Visita')
            : (apt.service || 'Visita');
        
        const empId = typeof getAppointmentEmployeeId === 'function' ? getAppointmentEmployeeId(apt) : (apt.employeeId || apt.employee_id);
        const empColor = typeof getSafeEmployeeColor === 'function' ? getSafeEmployeeColor(empId) : '#7b52b5';

        list.innerHTML += `
            <div class="widget-list-item" style="border-left:4px solid ${empColor}; display:flex; justify-content:space-between; align-items:center; background:rgba(29, 18, 44, 0.3); margin-bottom:8px; border-radius:8px; padding:10px 15px; border:1px solid rgba(155,114,212,0.1); border-left:4px solid ${empColor};">
                <div style="display:flex; align-items:center; flex:1; gap:12px;">
                    <div style="font-weight:700; color:var(--text-primary); font-size:0.9rem; min-width:60px;">${aptTime(apt)}</div>
                    <div class="info" style="flex:1;">
                        <span class="main-text" style="font-weight:600; color:var(--text-primary); font-size:0.88rem;">${apt.clientName || apt.client_name || 'Sin cliente'}</span>
                        <span class="sub-text" style="display:block; font-size:0.75rem; color:var(--text-dim); margin-top:2px;">${serviceLabel}</span>
                    </div>
                </div>
                <button class="btn-cobrar-chip" onclick="chargeAppointment('${apt.id}')" title="Cobrar" style="background:var(--success-bg); color:var(--success); border:1px solid rgba(74,222,128,0.2); height:fit-content;">
                    <i data-lucide="shopping-cart" style="width:14px; height:14px;"></i>
                </button>
            </div>
        `;
    });
    if (typeof refreshIcons === 'function') refreshIcons();
}


console.log('[DASHBOARD] Módulo cargado');

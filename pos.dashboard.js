/**
 * POS.DASHBOARD.JS - Dashboard y Widgets
 * Funciones del dashboard principal
 */

function initDashboard() {
    console.log('[DASHBOARD] init');
    renderDashboardCumpleanos();
    renderDashboardTareas();
    renderDashboardDeudas();
    renderDashboardAgendaResumen();
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
            const payload = { text, completed: false };
            const userId = typeof getUserId === 'function' ? getUserId() : null;
            if (userId) payload.user_id = userId;
            let saved = null;
            try {
                const { data, error } = await insertRowsSafe('tasks', payload);
                if (error) throw error;
                saved = data?.[0] || null;
            } catch (err) {
                console.error('[DASHBOARD] Error creando tarea:', err);
            }
            const task = saved || { id: createLocalId('task'), ...payload, pendingSync: true };
            db.tasks.push(task);
            persistCollectionLocal('tasks', db.tasks);
            input.value = '';
            renderDashboardTareas();
            if (typeof showToast === 'function') showToast(saved ? 'Tarea cargada' : 'Tarea guardada localmente', saved ? 'success' : 'warning');
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

    const today = new Date().toISOString().split('T')[0];
    const appointments = db?.appointments || [];
    const aptDate = (a) => typeof getAppointmentDate === 'function' ? getAppointmentDate(a) : (a.date || a.apt_date || '');
    const aptTime = (a) => typeof getAppointmentTime === 'function' ? getAppointmentTime(a) : ((a.time || a.apt_time || '').slice(0, 5));
    const todaysApts = appointments.filter(a => aptDate(a) === today).sort((a, b) => aptTime(a).localeCompare(aptTime(b)));

    if (todaysApts.length === 0) {
        list.innerHTML = '<span style="color:var(--text-dim);font-size:0.85rem">Sin citas para hoy</span>';
        return;
    }

    todaysApts.forEach(apt => {
        const serviceLabel = typeof getAppointmentServices === 'function'
            ? (getAppointmentServices(apt).map(s => s.name).join(' + ') || apt.service || 'Visita')
            : (apt.service || 'Visita');
        
        const emp = db.employees.find(e => String(e.id) === String(getAppointmentEmployeeId(apt)));
        const empColor = emp && emp.color ? emp.color : 'var(--gold-400)';

        list.innerHTML += `
            <div class="widget-list-item" style="border-left:3px solid ${empColor}; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; flex:1;">
                    <div style="font-weight:700;color:${empColor};min-width:70px;">${aptTime(apt)}</div>
                    <div class="info" style="flex:1;">
                        <span class="main-text">${apt.clientName || apt.client_name || 'Sin cliente'}</span>
                        <span class="sub-text">${serviceLabel}</span>
                    </div>
                </div>
                <button class="btn-cobrar-chip" onclick="chargeAppointment('${apt.id}')" title="Cobrar">
                    <i data-lucide="shopping-cart"></i>
                </button>
            </div>
        `;
    });
    if (typeof refreshIcons === 'function') refreshIcons();
}


console.log('[DASHBOARD] Módulo cargado');

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
}

function renderDashboardTareas() {
    const list = document.getElementById('task-list');
    if (!list) return;

    const addBtn = document.getElementById('btn-add-task');
    if (addBtn) {
        addBtn.onclick = () => {
            const row = document.getElementById('task-input-container');
            if (row) row.classList.toggle('hidden');
        };
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
                await window.supabaseClient.from('tasks').update({ completed: task.completed }).eq('id', id);
                renderDashboardTareas();
            }
        };
    });

    list.querySelectorAll('.task-del').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.currentTarget.dataset.id;
            if (window.supabaseClient) {
                await window.supabaseClient.from('tasks').delete().eq('id', id);
                db.tasks = tasks.filter(x => x.id != id);
                renderDashboardTareas();
            }
        };
    });
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
}

function renderDashboardAgendaResumen() {
    const list = document.getElementById('widget-agenda');
    if (!list) return;
    list.innerHTML = '';

    const today = new Date().toISOString().split('T')[0];
    const appointments = db?.appointments || [];
    const todaysApts = appointments.filter(a => a.date === today).sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    if (todaysApts.length === 0) {
        list.innerHTML = '<span style="color:var(--text-dim);font-size:0.85rem">Sin citas para hoy</span>';
        return;
    }

    todaysApts.forEach(apt => {
        list.innerHTML += `
            <div class="widget-list-item" style="border-left:3px solid var(--gold-400);">
                <div style="font-weight:700;color:var(--gold-400);min-width:70px;">${(apt.time || '').slice(0,5)}</div>
                <div class="info" style="flex:1;">
                    <span class="main-text">${apt.clientName}</span>
                    <span class="sub-text">${apt.service || 'Visita'}</span>
                </div>
            </div>
        `;
    });
}

console.log('[DASHBOARD] Módulo cargado');
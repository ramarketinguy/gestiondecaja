/**
 * POS.SERVICES.JS - Servicios y Empleados
 * CRUD para servicios y personal
 */

function initSettings() {
    console.log('[SETTINGS] init');
    renderServicesList();
    renderEmployeesList();
    initBusinessConfigUI();

    // Botón guardar config
    const saveCfg = document.getElementById('btn-save-business-cfg');
    if (saveCfg) {
        saveCfg.addEventListener('click', async () => {
            const cfg = getBusinessConfig();
            cfg.openTime = document.getElementById('cfg-open-time')?.value || '09:00';
            cfg.closeTime = document.getElementById('cfg-close-time')?.value || '20:00';
            cfg.lunchStart = document.getElementById('cfg-lunch-start')?.value || '';
            cfg.lunchEnd = document.getElementById('cfg-lunch-end')?.value || '';
            cfg.timeFormat = document.getElementById('cfg-time-format')?.value || '24h';
            saveBusinessConfig(cfg);
            populateTimeSelects();
            showToast('Configuración guardada', 'success');
        });
    }
}

function getBusinessConfig() {
    // Usar pos.config.js cuando esté disponible
    if (typeof window.getBusinessConfigInternal === 'function') {
        return window.getBusinessConfigInternal();
    }
    const raw = localStorage.getItem('violet_business_config');
    const defaults = {
        openTime: '09:00', closeTime: '20:00', lunchStart: '', lunchEnd: '',
        closedDays: [], timeFormat: '24h', blockedSlots: []
    };
    if (!raw) return defaults;
    try {
        return { ...defaults, ...JSON.parse(raw) };
    } catch {
        return defaults;
    }
}

function saveBusinessConfig(cfg) {
    localStorage.setItem('violet_business_config', JSON.stringify(cfg));
    // También guardar en Supabase si está disponible
    if (typeof saveBusinessConfigToSupabase === 'function') {
        saveBusinessConfigToSupabase(cfg);
    }
}

function initBusinessConfigUI() {
    const cfg = getBusinessConfig();

    const openTime = document.getElementById('cfg-open-time');
    const closeTime = document.getElementById('cfg-close-time');
    const lunchStart = document.getElementById('cfg-lunch-start');
    const lunchEnd = document.getElementById('cfg-lunch-end');
    const timeFormat = document.getElementById('cfg-time-format');

    if (openTime) openTime.value = cfg.openTime;
    if (closeTime) closeTime.value = cfg.closeTime;
    if (lunchStart) lunchStart.value = cfg.lunchStart || '';
    if (lunchEnd) lunchEnd.value = cfg.lunchEnd || '';
    if (timeFormat) timeFormat.value = cfg.timeFormat || '24h';

    populateTimeSelects();
}

function renderServicesList() {
    const list = document.getElementById('settings-services-list');
    if (!list) return;
    list.innerHTML = '';

    const services = db?.services || [];
    if (services.length === 0) {
        list.innerHTML = '<span style="color:var(--text-dim)">No hay servicios</span>';
        return;
    }

    services.forEach(s => {
        const li = document.createElement('li');
        li.className = 'task-item';
        li.innerHTML = `
            <span style="flex:1;">${s.name} <span style="color:var(--violet-200)">(${s.priceType === 'fijo' ? '$' + s.price : 'Variable'})</span></span>
            <button class="btn-icon btn-edit-srv" data-id="${s.id}"><i data-lucide="edit-2"></i></button>
            <button class="btn-icon btn-del-srv" data-id="${s.id}" style="color:var(--danger)"><i data-lucide="trash-2"></i></button>
        `;
        list.appendChild(li);
    });

    list.querySelectorAll('.btn-edit-srv').forEach(btn => {
        btn.onclick = () => openServiceModal(btn.dataset.id);
    });
    list.querySelectorAll('.btn-del-srv').forEach(btn => {
        btn.onclick = async () => {
            if (confirm('¿Eliminar servicio?')) {
                await window.supabaseClient.from('services').delete().eq('id', btn.dataset.id);
                db.services = services.filter(s => s.id != btn.dataset.id);
                renderServicesList();
                showToast('Servicio eliminado');
            }
        };
    });
}

function renderEmployeesList() {
    const list = document.getElementById('settings-employees-list');
    if (!list) return;
    list.innerHTML = '';

    const employees = db?.employees || [];
    if (employees.length === 0) {
        list.innerHTML = '<span style="color:var(--text-dim)">No hay personal</span>';
        return;
    }

    employees.forEach(e => {
        const li = document.createElement('li');
        li.className = 'task-item';
        li.innerHTML = `
            <span style="flex:1;">${e.name}</span>
            <button class="btn-icon btn-edit-emp" data-id="${e.id}"><i data-lucide="edit-2"></i></button>
            <button class="btn-icon btn-del-emp" data-id="${e.id}" style="color:var(--danger)"><i data-lucide="trash-2"></i></button>
        `;
        list.appendChild(li);
    });

    list.querySelectorAll('.btn-edit-emp').forEach(btn => {
        btn.onclick = () => openEmployeeModal(btn.dataset.id);
    });
    list.querySelectorAll('.btn-del-emp').forEach(btn => {
        btn.onclick = async () => {
            if (confirm('¿Eliminar empleado?')) {
                await window.supabaseClient.from('employees').delete().eq('id', btn.dataset.id);
                db.employees = employees.filter(e => e.id != btn.dataset.id);
                renderEmployeesList();
                showToast('Empleado eliminado');
            }
        };
    });
}

function openServiceModal(id = null) {
    const modal = document.getElementById('modal-service');
    if (modal) modal.classList.add('open');
}

function openEmployeeModal(id = null) {
    const modal = document.getElementById('modal-employee');
    if (modal) modal.classList.add('open');
}

function updateFormSelects() {
    const serviceSelect = document.getElementById('service');
    const aptServiceSelect = document.getElementById('apt-service');
    const employeeSelect = document.getElementById('employee');

    if (serviceSelect) {
        serviceSelect.innerHTML = '<option value="">Seleccionar...</option>';
        db.services?.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = `${s.name} ${s.priceType === 'fijo' ? '($' + s.price + ')' : ''}`;
            serviceSelect.appendChild(opt);
        });
    }

    if (employeeSelect) {
        employeeSelect.innerHTML = '<option value="">Seleccionar...</option>';
        db.employees?.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.name;
            opt.textContent = e.name;
            employeeSelect.appendChild(opt);
        });
    }
}

console.log('[SERVICES] Módulo cargado');
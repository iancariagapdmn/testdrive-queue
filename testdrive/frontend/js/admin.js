// frontend/js/admin.js
// Admin: login, tabs, callout dashboard, car manager, exports

// ── State ─────────────────────────────────────────────────────────────────────
let isAdminLoggedIn = false;

// ── Login / Logout ────────────────────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('admin-username').value;
    const password = document.getElementById('admin-password').value;
    try {
        await AuthAPI.login({ username, password });
        isAdminLoggedIn = true;
        document.getElementById('admin-login').style.display = 'none';
        document.getElementById('admin-dashboard').classList.add('active');
        renderCalloutDashboard();
        updateResponseTable();
        showNotification('Login successful!');
    } catch {
        showNotification('Invalid credentials', 'error');
    }
});

function adminLogout() {
    isAdminLoggedIn = false;
    document.getElementById('admin-login').style.display = 'block';
    document.getElementById('admin-dashboard').classList.remove('active');
    document.getElementById('login-form').reset();
    showNotification('Logged out');
}

// ── Admin Tabs ────────────────────────────────────────────────────────────────
function showAdminPanel(panel, event) {
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`panel-${panel}`).classList.add('active');
    if (event?.currentTarget) event.currentTarget.classList.add('active');
    if (panel === 'callout') renderCalloutDashboard();
}

// ── Callout Dashboard ─────────────────────────────────────────────────────────
async function renderCalloutDashboard() {
    const container = document.getElementById('callout-dashboard');
    container.innerHTML = '<div class="loading">Loading…</div>';
    try {
        const cars = await CarsAPI.list();
        const regs = await RegistrationsAPI.list();

        container.innerHTML = '';

        cars.forEach(car => {
            const queue   = regs.filter(r => r.carId === car.id && r.status === 'waiting')
                                .sort((a, b) => a.timestamp - b.timestamp);
            const current = car.currentServing;

            const card = document.createElement('div');
            card.className = 'callout-card';
            card.innerHTML = `
                <div class="callout-card-header">
                    <span class="callout-car-name">
                        ${car.model}
                        ${car.plate ? `<span style="font-size:0.8rem; font-weight:normal;">(${car.plate})</span>` : ''}
                    </span>
                    <span class="callout-status ${car.available ? 'status-available' : 'status-in-use'}">
                        ${car.available ? 'Available' : 'In Use'}
                    </span>
                </div>
                <div class="callout-current">
                    <div class="callout-current-label">Currently Serving</div>
                    <div class="callout-current-ticket">${current ? current.ticketNumber : '---'}</div>
                    <div class="callout-current-name">${current ? current.name : 'No one'}</div>
                </div>
                <div class="callout-queue-list">
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Queue (${queue.length})</div>
                    ${queue.slice(0, 5).map(r => `
                        <div class="callout-queue-item">
                            <span class="callout-queue-item-ticket">${r.ticketNumber}</span>
                            <span style="font-size:0.9rem">${r.name}</span>
                        </div>
                    `).join('') || '<div style="color:var(--text-muted); font-size:0.8rem;">Empty</div>'}
                </div>
                <div class="callout-buttons">
                    <button class="callout-btn btn-call-next"
                            onclick="handleCallNext('${car.id}')"
                            ${queue.length === 0 ? 'disabled' : ''}>📢 Call Next</button>
                    <button class="callout-btn btn-call-again"
                            onclick="handleCallAgain('${car.id}')"
                            ${!current ? 'disabled' : ''}>📢 Call Again</button>
                    <button class="callout-btn btn-complete"
                            onclick="handleComplete('${car.id}')"
                            ${!current ? 'disabled' : ''}>✅ Complete</button>
                    <button class="callout-btn btn-remove"
                            onclick="handleSkip('${car.id}')"
                            ${!current ? 'disabled' : ''}>⏭️ Skip</button>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (err) {
        container.innerHTML = `<div class="loading">⚠️ ${err.message}</div>`;
    }
}

// ── Queue Action Handlers ─────────────────────────────────────────────────────
async function handleCallNext(carId) {
    try {
        const result = await QueueAPI.callNext(carId);
        if (result.next) {
            playVoiceAnnouncement(result.next.ticketNumber, result.next.carDisplay);
            showNotification(`Calling ${result.next.ticketNumber} — SMS sent`);
            setTimeout(() => QueueAPI.clearCalling(carId), 5000);
        } else {
            showNotification('Queue is empty', 'error');
        }
        renderDisplayCards();
        renderCalloutDashboard();
        updateResponseTable();
    } catch (err) {
        showNotification(err.message, 'error');
    }
}

async function handleCallAgain(carId) {
    try {
        const result = await QueueAPI.callAgain(carId);
        if (result.current) {
            playVoiceAnnouncement(result.current.ticketNumber, result.current.carDisplay);
            showNotification(`Re-calling ${result.current.ticketNumber} — SMS sent`);
            setTimeout(() => QueueAPI.clearCalling(carId), 5000);
        }
        renderCalloutDashboard();
    } catch (err) {
        showNotification(err.message, 'error');
    }
}

async function handleComplete(carId) {
    showModal('Complete Service', 'Mark current customer as completed?', async () => {
        try {
            await QueueAPI.complete(carId);
            showNotification('Service completed!');
            renderDisplayCards();
            renderCalloutDashboard();
            updateResponseTable();
        } catch (err) {
            showNotification(err.message, 'error');
        }
    });
}

async function handleSkip(carId) {
    showModal('Skip Customer', 'Skip the current customer?', async () => {
        try {
            await QueueAPI.skip(carId);
            showNotification('Customer skipped');
            renderDisplayCards();
            renderCalloutDashboard();
            updateResponseTable();
        } catch (err) {
            showNotification(err.message, 'error');
        }
    });
}

// ── Voice Announcement (local, browser TTS) ───────────────────────────────────
function playVoiceAnnouncement(ticketNumber, carDisplay) {
    if (!('speechSynthesis' in window)) return;
    const text = `Ticket number ${ticketNumber.replace('-', ' ')}, please proceed for the ${carDisplay} test drive.`;
    const utt  = new SpeechSynthesisUtterance(text);
    utt.rate   = 0.85;
    utt.pitch  = 1;
    window.speechSynthesis.speak(utt);
}

// ── Responses Table ───────────────────────────────────────────────────────────
async function updateResponseTable() {
    const tbody = document.getElementById('response-table-body');
    try {
        const regs = await RegistrationsAPI.list();
        tbody.innerHTML = '';
        regs.slice().reverse().forEach(reg => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${reg.ticketNumber}</strong></td>
                <td>${reg.name}</td>
                <td>${reg.contact}</td>
                <td>${reg.carDisplay}</td>
                <td><span class="status-badge status-${reg.status}">${reg.status}</span></td>
                <td>${reg.date} ${reg.time}</td>
                <td>${reg.preferredTransacType || '---'}</td>
                <td>${reg.customerType || '---'}</td>
                <td>${reg.salesConsultantName || '---'}</td>
                <td>${reg.dealershipName || '---'}</td>
                <td>
                    <button class="callout-btn btn-remove"
                            onclick="deleteRegistration(${reg.id})"
                            style="padding:0.4rem 0.8rem;">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="11" style="color:var(--text-muted)">Error loading data</td></tr>`;
    }
}

function filterTable() {
    const search = document.getElementById('search-box').value.toLowerCase();
    document.querySelectorAll('#response-table-body tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(search) ? '' : 'none';
    });
}

async function deleteRegistration(id) {
    showModal('Delete Registration', 'Delete this record permanently?', async () => {
        try {
            await RegistrationsAPI.delete(id);
            showNotification('Registration deleted');
            updateResponseTable();
            renderDisplayCards();
            renderCalloutDashboard();
        } catch (err) {
            showNotification(err.message, 'error');
        }
    });
}

// ── Exports ───────────────────────────────────────────────────────────────────
async function exportToCSV() {
    const regs = await RegistrationsAPI.list();
    if (regs.length === 0) return showNotification('No data to export', 'error');

    const header = ['Ticket #','Name','Address','Contact','Car Model','Status','Date','Time',
                    'Preferred Transaction Type','Customer Type','Sales Consultant Name','Dealership Name'];
    const rows   = regs.map(r => [
        r.ticketNumber, r.name, r.address, r.contact, r.carDisplay, r.status, r.date, r.time,
        r.preferredTransacType||'', r.customerType||'', r.salesConsultantName||'', r.dealershipName||'',
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');

    const a = Object.assign(document.createElement('a'), {
        href:     URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
        download: `test-drive-${new Date().toISOString().split('T')[0]}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
    showNotification('CSV downloaded!');
}

async function exportToPDF() {
    const regs = await RegistrationsAPI.list();
    if (regs.length === 0) return showNotification('No data to export', 'error');

    const rows = regs.map(r => `
        <tr>
            <td>${r.ticketNumber}</td><td>${r.name}</td><td>${r.contact}</td>
            <td>${r.carDisplay}</td><td>${r.status}</td><td>${r.date} ${r.time}</td>
            <td>${r.preferredTransacType||''}</td><td>${r.customerType||''}</td>
            <td>${r.salesConsultantName||''}</td><td>${r.dealershipName||''}</td>
        </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><title>Registrations</title>
        <style>body{font-family:Arial;padding:20px}h1{color:#00677A}
        table{width:100%;border-collapse:collapse;margin-top:20px}
        th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}
        th{background:#00677A;color:white}tr:nth-child(even){background:#f5f5f5}</style>
        </head><body>
        <h1>🚗 Test Drive Registrations</h1>
        <p>Generated: ${new Date().toLocaleString()}</p>
        <table><tr><th>Ticket #</th><th>Name</th><th>Contact</th><th>Car</th><th>Status</th>
        <th>Date/Time</th><th>Pref. Transaction</th><th>Customer Type</th>
        <th>Sales Consultant</th><th>Dealership</th></tr>
        ${rows}</table></body></html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.print();
    showNotification('PDF print dialog opened!');
}

// ── Car Manager ───────────────────────────────────────────────────────────────
function openCarManager() {
    document.getElementById('car-manager-modal').classList.add('active');
    resetCarForm();
    renderCarManagerList();
}

function closeCarManager() {
    document.getElementById('car-manager-modal').classList.remove('active');
    renderRegistrationCars();
    renderDisplayCards();
    renderCalloutDashboard();
}

async function renderCarManagerList() {
    const list = document.getElementById('car-manager-list');
    try {
        const cars = await CarsAPI.list();
        list.innerHTML = cars.map(car => `
            <div class="car-manager-item">
                <div class="car-manager-info">
                    <strong>${car.model}</strong>
                    <span style="color:var(--text-muted); font-size:0.85rem;">${car.plate || 'No plate specified'}</span>
                </div>
                <div class="car-manager-actions">
                    <button class="btn-edit"   onclick="editVehicle('${car.id}')">Edit</button>
                    <button class="btn-remove" onclick="deleteVehicle('${car.id}')">Delete</button>
                </div>
            </div>
        `).join('');
    } catch {
        list.innerHTML = '<p style="color:var(--text-muted)">Could not load vehicles.</p>';
    }
}

async function saveVehicle() {
    const model  = document.getElementById('new-car-model').value.trim();
    const plate  = document.getElementById('new-car-plate').value.trim();
    const editId = document.getElementById('edit-car-id').value;

    if (!model) return showNotification('Model name is required', 'error');

    try {
        if (editId) {
            await CarsAPI.update(editId, { model, plate });
            showNotification('Vehicle updated!');
        } else {
            await CarsAPI.create({ model, plate });
            showNotification('Vehicle added!');
        }
        resetCarForm();
        renderCarManagerList();
    } catch (err) {
        showNotification(err.message, 'error');
    }
}

async function editVehicle(id) {
    const cars = await CarsAPI.list();
    const car  = cars.find(c => c.id === id);
    if (!car) return;
    document.getElementById('car-form-title').innerText = 'Edit Vehicle';
    document.getElementById('edit-car-id').value        = car.id;
    document.getElementById('new-car-model').value      = car.model;
    document.getElementById('new-car-plate').value      = car.plate;
}

function deleteVehicle(id) {
    showModal('Delete Vehicle', 'Remove this vehicle from the list?', async () => {
        try {
            await CarsAPI.delete(id);
            showNotification('Vehicle removed');
            renderCarManagerList();
        } catch (err) {
            showNotification(err.message, 'error');
        }
    });
}

function resetCarForm() {
    document.getElementById('car-form-title').innerText = 'Add New Vehicle';
    document.getElementById('edit-car-id').value        = '';
    document.getElementById('new-car-model').value      = '';
    document.getElementById('new-car-plate').value      = '';
}
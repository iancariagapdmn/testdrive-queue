// frontend/js/ui.js
// Pure UI helpers: rendering cards, tickets, modals, notifications

// ── Notification toast ────────────────────────────────────────────────────────
function showNotification(message, type = 'success') {
    const notif = document.getElementById('notification');
    notif.textContent = message;
    notif.className = `notification show ${type === 'error' ? 'error' : ''}`;
    setTimeout(() => notif.classList.remove('show'), 3500);
}

// ── Page navigation ───────────────────────────────────────────────────────────
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
    document.getElementById(`page-${pageId}`).classList.add('active');
    document.getElementById(`nav-${pageId}`).classList.add('active');

    if (pageId === 'display')  renderDisplayCards();
    if (pageId === 'ticket')   checkCurrentTicket();
    if (pageId === 'register') renderRegistrationCars();
    if (pageId === 'admin' && isAdminLoggedIn) {
        renderCalloutDashboard();
        updateResponseTable();
    }
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────
let modalCallback = null;

function showModal(title, message, callback) {
    document.getElementById('modal-title').textContent   = title;
    document.getElementById('modal-message').textContent = message;
    document.getElementById('modal-overlay').classList.add('active');
    modalCallback = callback;
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    modalCallback = null;
}

document.getElementById('modal-confirm').addEventListener('click', () => {
    if (modalCallback) modalCallback();
    closeModal();
});

// ── Display Page: Now Serving cards ──────────────────────────────────────────
async function renderDisplayCards() {
    const container = document.getElementById('car-displays');
    try {
        const cars = await CarsAPI.list();
        const regs = await RegistrationsAPI.list();

        container.innerHTML = '';

        cars.forEach(car => {
            const queue   = regs.filter(r => r.carId === car.id && r.status === 'waiting')
                                .sort((a, b) => a.timestamp - b.timestamp);
            const current = car.currentServing;

            const card = document.createElement('div');
            card.className = `car-display-card ${current ? 'active' : ''} ${car.calling ? 'calling' : ''}`;
            card.innerHTML = `
                <div class="car-name">
                    ${car.model}
                    ${car.plate ? `<span class="car-plate-badge">${car.plate}</span>` : ''}
                </div>
                <div class="current-serving">
                    <div class="current-serving-label">NOW SERVING</div>
                    <div class="current-ticket">${current ? current.ticketNumber : '---'}</div>
                    <div class="current-name">${current ? current.name : 'Waiting…'}</div>
                </div>
                <div class="queue-info">
                    <div class="queue-stat">
                        <div class="queue-stat-value">${queue.length}</div>
                        <div class="queue-stat-label">In Queue</div>
                    </div>
                    <div class="queue-stat">
                        <div class="queue-stat-value">${queue.length > 0 ? queue[0].ticketNumber : '---'}</div>
                        <div class="queue-stat-label">Next Up</div>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (err) {
        container.innerHTML = `<div class="loading">⚠️ Could not load queue data. Is the server running?</div>`;
    }
}

// ── Register Page: car option tiles ──────────────────────────────────────────
async function renderRegistrationCars() {
    const container = document.getElementById('dynamic-car-options');
    if (!container) return;
    try {
        const cars = await CarsAPI.list();
        container.innerHTML = cars.map(car => `
            <label class="car-option" onclick="selectCar(this)">
                <input type="radio" name="car" value="${car.id}" required>
                <div class="car-option-name">${car.model}</div>
                ${car.plate ? `<div style="font-size:0.8rem; color:var(--text-muted)">${car.plate}</div>` : ''}
            </label>
        `).join('');
    } catch {
        container.innerHTML = '<p style="color:var(--text-muted)">Could not load car list.</p>';
    }
}

function selectCar(element) {
    document.querySelectorAll('.car-option').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');
    element.querySelector('input').checked = true;
}

// ── Ticket Page ───────────────────────────────────────────────────────────────
async function checkCurrentTicket() {
    const noTicket     = document.getElementById('no-ticket');
    const ticketDisplay = document.getElementById('ticket-display');

    const stored = localStorage.getItem('currentTicketId');
    if (!stored) {
        noTicket.style.display     = 'block';
        ticketDisplay.style.display = 'none';
        return;
    }

    try {
        const reg  = await RegistrationsAPI.get(stored);
        const regs = await RegistrationsAPI.list({ carId: reg.carId, status: 'waiting' });

        if (reg.status === 'completed') {
            localStorage.removeItem('currentTicketId');
            noTicket.style.display     = 'block';
            ticketDisplay.style.display = 'none';
            return;
        }

        noTicket.style.display      = 'none';
        ticketDisplay.style.display = 'block';

        document.getElementById('ticket-number').textContent  = reg.ticketNumber;
        document.getElementById('ticket-car').textContent     = reg.carDisplay;
        document.getElementById('ticket-name').textContent    = reg.name;
        document.getElementById('ticket-date').textContent    = `${reg.date} ${reg.time}`;

        const position = regs.findIndex(r => r.id === reg.id) + 1;
        document.getElementById('ticket-position').textContent =
            reg.status === 'serving' ? 'Now Serving!' : (position > 0 ? position : '—');
    } catch {
        localStorage.removeItem('currentTicketId');
        noTicket.style.display     = 'block';
        ticketDisplay.style.display = 'none';
    }
}

function printTicket() { window.print(); }
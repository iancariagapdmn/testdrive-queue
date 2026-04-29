// frontend/js/app.js
// Bootstrap: init, registration form, polling

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
    await renderRegistrationCars();
    await renderDisplayCards();
    checkCurrentTicket();
}

init();

// ── Registration Form ─────────────────────────────────────────────────────────
document.getElementById('registration-form').addEventListener('submit', async function (e) {
    e.preventDefault();

    const name    = document.getElementById('reg-name').value.trim();
    const address = document.getElementById('reg-address')?.value.trim() || '';
    const contact = document.getElementById('reg-contact').value.trim();
    const carInput = document.querySelector('input[name="car"]:checked');

    if (!carInput) return showNotification('Please select a car model', 'error');

    try {
        const reg = await RegistrationsAPI.create({ name, address, contact, carId: carInput.value });

        // Store ticket ID locally so the user can retrieve it on "My Ticket"
        localStorage.setItem('currentTicketId', reg.id);

        this.reset();
        document.querySelectorAll('.car-option').forEach(opt => opt.classList.remove('selected'));

        showNotification('Registration successful! Redirecting to your ticket…');
        setTimeout(() => showPage('ticket'), 1500);

        renderDisplayCards();
        if (isAdminLoggedIn) {
            updateResponseTable();
            renderCalloutDashboard();
        }
    } catch (err) {
        showNotification(err.message, 'error');
    }
});

// ── Polling (every 4 s) ───────────────────────────────────────────────────────
// Keeps the Display and Ticket pages live without a WebSocket
setInterval(() => {
    if (document.getElementById('page-display').classList.contains('active')) {
        renderDisplayCards();
    }
    if (document.getElementById('page-ticket').classList.contains('active')) {
        checkCurrentTicket();
    }
}, 4000);
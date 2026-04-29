// backend/routes/queue.js
const express = require('express');
const router = express.Router();
const { getDB } = require('../db');

// ── Semaphore SMS ─────────────────────────────────────────────────────────────
async function sendSMS(contactNumber, ticketNumber, carDisplay) {
    const url = process.env.TRACCAR_URL;
    const token = process.env.TRACCAR_TOKEN;
    if (!url || !token || !contactNumber) return;

    const to = contactNumber.replace(/^0/, '+63');
    const message =
        `Hi! Your ${carDisplay} is ready for you. Ticket ${ticketNumber} ` +
        `Kindly proceed to the Omoda & Jaecoo test drive area.`;

    try {
        const res = await fetch(`${url}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token,
            },
            body: JSON.stringify({ to, message }),
        });
        const data = await res.text();
        console.log('📱 SMS sent to', to, '→', data);
    } catch (err) {
        console.error('SMS error:', err.message);
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function mapReg(r) {
    return {
        id: r.id,
        ticketNumber: r.ticket_number,
        name: r.name,
        address: r.address,
        contact: r.contact,
        carId: r.car_id,
        carDisplay: r.car_display,
        status: r.status,
        timestamp: r.timestamp,
        date: r.date,
        time: r.time,
    };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /:carId — waiting queue for a car
router.get('/:carId', async (req, res) => {
    try {
        const db = await getDB();
        const rows = db.all(
            "SELECT * FROM registrations WHERE car_id = ? AND status = 'waiting' ORDER BY timestamp ASC",
            req.params.carId
        );
        res.json(rows.map(mapReg));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /:carId/call-next — complete current, serve next, send SMS
router.post('/:carId/call-next', async (req, res) => {
    try {
        const db = await getDB();
        const carId = req.params.carId;
        const status = db.get('SELECT * FROM car_status WHERE car_id = ?', carId);
        if (!status) return res.status(404).json({ error: 'Car not found' });

        let nextReg = null;
        db.transaction(() => {
            if (status.current_serving_id)
                db.run("UPDATE registrations SET status = 'completed' WHERE id = ?", status.current_serving_id);

            const next = db.get(
                "SELECT * FROM registrations WHERE car_id = ? AND status = 'waiting' ORDER BY timestamp ASC LIMIT 1",
                carId
            );
            if (next) {
                db.run("UPDATE registrations SET status = 'serving' WHERE id = ?", next.id);
                db.run('UPDATE car_status SET current_serving_id = ?, available = 0, calling = 1 WHERE car_id = ?', next.id, carId);
                nextReg = next;
            } else {
                db.run('UPDATE car_status SET current_serving_id = NULL, available = 1, calling = 0 WHERE car_id = ?', carId);
            }
        });

        // Fire SMS after transaction (non-blocking)
        if (nextReg) {
            sendSMS(nextReg.contact, nextReg.ticket_number, nextReg.car_display);
        }

        res.json({ next: nextReg ? mapReg(nextReg) : null });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /:carId/call-again — re-announce the current ticket, send SMS again
router.post('/:carId/call-again', async (req, res) => {
    try {
        const db = await getDB();
        const carId = req.params.carId;
        const status = db.get('SELECT * FROM car_status WHERE car_id = ?', carId);
        if (!status) return res.status(404).json({ error: 'Car not found' });
        if (!status.current_serving_id) return res.status(400).json({ error: 'No one currently being served' });

        const reg = db.get('SELECT * FROM registrations WHERE id = ?', status.current_serving_id);
        if (!reg) return res.status(404).json({ error: 'Current registration not found' });

        // Set calling flag so the display card pulses
        db.run('UPDATE car_status SET calling = 1 WHERE car_id = ?', carId);

        // Re-send SMS (non-blocking)
        sendSMS(reg.contact, reg.ticket_number, reg.car_display);

        res.json({ current: mapReg(reg) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /:carId/complete
router.post('/:carId/complete', async (req, res) => {
    try {
        const db = await getDB();
        const carId = req.params.carId;
        const status = db.get('SELECT * FROM car_status WHERE car_id = ?', carId);
        if (!status) return res.status(404).json({ error: 'Car not found' });
        if (!status.current_serving_id) return res.status(400).json({ error: 'No active service' });
        db.transaction(() => {
            db.run("UPDATE registrations SET status = 'completed' WHERE id = ?", status.current_serving_id);
            db.run('UPDATE car_status SET current_serving_id = NULL, available = 1, calling = 0 WHERE car_id = ?', carId);
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /:carId/skip
router.post('/:carId/skip', async (req, res) => {
    try {
        const db = await getDB();
        const carId = req.params.carId;
        const status = db.get('SELECT * FROM car_status WHERE car_id = ?', carId);
        if (!status) return res.status(404).json({ error: 'Car not found' });
        if (!status.current_serving_id) return res.status(400).json({ error: 'No active service' });
        db.transaction(() => {
            db.run("UPDATE registrations SET status = 'completed' WHERE id = ?", status.current_serving_id);
            db.run('UPDATE car_status SET current_serving_id = NULL, available = 1, calling = 0 WHERE car_id = ?', carId);
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /:carId/clear-calling
router.post('/:carId/clear-calling', async (req, res) => {
    try {
        const db = await getDB();
        db.run('UPDATE car_status SET calling = 0 WHERE car_id = ?', req.params.carId);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
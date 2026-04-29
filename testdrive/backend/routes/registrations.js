// backend/routes/registrations.js
const express     = require('express');
const router      = express.Router();
const https       = require('https');
const querystring = require('querystring');
const { getDB }   = require('../db');

// ── Semaphore SMS ─────────────────────────────────────────────────────────────
function sendSMS(to, message) {
    return new Promise((resolve, reject) => {
        const payload = querystring.stringify({
            apikey:     process.env.SEMAPHORE_API_KEY,
            number:     to,
            message:    message,
            sendername: process.env.SEMAPHORE_SENDER || 'SEMAPHORE',
        });

        const options = {
            hostname: 'api.semaphore.co',
            path:     '/api/v4/messages',
            method:   'POST',
            headers: {
                'Content-Type':   'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(payload),
            },
        };

        const req = https.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('[Semaphore] Response:', data);
                resolve(data);
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// ── Mapper ────────────────────────────────────────────────────────────────────
function mapReg(r) {
    return {
        id:r.id, ticketNumber:r.ticket_number, name:r.name, address:r.address,
        contact:r.contact, carId:r.car_id, carDisplay:r.car_display,
        status:r.status, timestamp:r.timestamp, date:r.date, time:r.time,
        preferredTransacType:r.preferred_transac_type, customerType:r.customer_type,
        salesConsultantName:r.sales_consultant_name, dealershipName:r.dealership_name
    };
}

// ── GET all ───────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const db = await getDB();
        const { carId, status } = req.query;
        let sql = 'SELECT * FROM registrations WHERE 1=1';
        const args = [];
        if (carId)  { sql += ' AND car_id = ?'; args.push(carId); }
        if (status) { sql += ' AND status  = ?'; args.push(status); }
        sql += ' ORDER BY timestamp ASC';
        res.json(db.all(sql, ...args).map(mapReg));
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── GET one ───────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const db  = await getDB();
        const row = db.get('SELECT * FROM registrations WHERE id = ?', req.params.id);
        if (!row) return res.status(404).json({ error: 'Registration not found' });
        res.json(mapReg(row));
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── POST (create + SMS) ───────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const db = await getDB();
        const { name, address, contact, carId,
                preferredTransacType, customerType, salesConsultantName, dealershipName } = req.body;

        if (!name?.trim() || !address?.trim() || !contact?.trim() || !carId)
            return res.status(400).json({ error: 'All fields (name, address, contact, carId) are required.' });
        if (!/^09\d{9}$/.test(contact.trim()))
            return res.status(400).json({ error: 'Contact must be an 11-digit PH mobile number (e.g. 09171234567).' });

        const car = db.get('SELECT * FROM cars WHERE id = ?', carId);
        if (!car) return res.status(404).json({ error: 'Car not found.' });

        let newReg;
        db.transaction(() => {
            db.run('UPDATE ticket_counters SET counter = counter + 1 WHERE car_id = ?', carId);
            const counter = db.get('SELECT counter FROM ticket_counters WHERE car_id = ?', carId).counter;
            const prefix  = car.model.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2) || 'TK';
            const ticketNumber = `${prefix}-${String(counter).padStart(3, '0')}`;
            const now = new Date();
            const carDisplay = `${car.model}${car.plate ? ` (${car.plate})` : ''}`;
            db.run(
                `INSERT INTO registrations
                 (ticket_number,name,address,contact,car_id,car_display,status,timestamp,date,time,
                  preferred_transac_type,customer_type,sales_consultant_name,dealership_name)
                 VALUES (?,?,?,?,?,?,'waiting',?,?,?,?,?,?,?)`,
                ticketNumber, name.trim(), address.trim(), contact.trim(),
                carId, carDisplay, now.getTime(),
                now.toLocaleDateString(), now.toLocaleTimeString(),
                (preferredTransacType || '').trim(), (customerType || '').trim(),
                (salesConsultantName  || '').trim(), (dealershipName   || '').trim()
            );
            const id = db.lastInsertRowid();
            newReg = db.get('SELECT * FROM registrations WHERE id = ?', id);
        });

        // Respond immediately — don't block on SMS
        res.status(201).json(mapReg(newReg));

        // Send SMS non-blocking
        const mapped = mapReg(newReg);
        const smsMessage =
            `Hi ${mapped.name}! Your queue ticket is ${mapped.ticketNumber} ` +
            `for ${mapped.carDisplay}. Please wait for your number to be called. Thank you!`;

        sendSMS(mapped.contact, smsMessage)
            .catch(err => console.error('[Semaphore] SMS failed:', err.message));

    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE ────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const db  = await getDB();
        const reg = db.get('SELECT * FROM registrations WHERE id = ?', req.params.id);
        if (!reg) return res.status(404).json({ error: 'Registration not found' });
        db.transaction(() => {
            if (reg.status === 'serving')
                db.run(
                    'UPDATE car_status SET current_serving_id = NULL, available = 1 WHERE car_id = ? AND current_serving_id = ?',
                    reg.car_id, reg.id
                );
            db.run('DELETE FROM registrations WHERE id = ?', reg.id);
        });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
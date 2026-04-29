// backend/routes/cars.js
const express = require('express');
const router  = express.Router();
const { getDB } = require('../db');

function mapReg(r) {
    return {
        id:           r.id,
        ticketNumber: r.ticket_number,
        name:         r.name,
        address:      r.address,
        contact:      r.contact,
        carId:        r.car_id,
        carDisplay:   r.car_display,
        status:       r.status,
        timestamp:    r.timestamp,
        date:         r.date,
        time:         r.time,
    };
}

router.get('/', async (req, res) => {
    try {
        const db   = await getDB();
        const cars = db.all('SELECT * FROM cars ORDER BY created_at ASC');
        const result = cars.map(car => {
            const status = db.get('SELECT * FROM car_status WHERE car_id = ?', car.id);
            let currentServing = null;
            if (status?.current_serving_id) {
                const reg = db.get('SELECT * FROM registrations WHERE id = ?', status.current_serving_id);
                if (reg) currentServing = mapReg(reg);
            }
            return {
                ...car,
                available:      Boolean(status?.available ?? 1),
                calling:        Boolean(status?.calling   ?? 0),
                currentServing,
            };
        });
        res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
    try {
        const db = await getDB();
        const { model, plate = '' } = req.body;
        if (!model?.trim()) return res.status(400).json({ error: 'Model name is required' });
        const id = model.trim().replace(/\s+/g, '_') + '_' + Date.now();
        db.transaction(() => {
            db.run('INSERT INTO cars (id, model, plate) VALUES (?, ?, ?)', id, model.trim(), plate.trim());
            db.run('INSERT INTO car_status (car_id) VALUES (?)', id);
            db.run('INSERT INTO ticket_counters (car_id) VALUES (?)', id);
        });
        res.status(201).json({ id, model: model.trim(), plate: plate.trim() });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
    try {
        const db = await getDB();
        const { model, plate = '' } = req.body;
        if (!model?.trim()) return res.status(400).json({ error: 'Model name is required' });
        const before = db.get('SELECT id FROM cars WHERE id = ?', req.params.id);
        if (!before) return res.status(404).json({ error: 'Car not found' });
        db.run('UPDATE cars SET model = ?, plate = ? WHERE id = ?', model.trim(), plate.trim(), req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
    try {
        const db = await getDB();
        const active = db.get(
            "SELECT COUNT(*) AS n FROM registrations WHERE car_id = ? AND status != 'completed'",
            req.params.id
        );
        if (active?.n > 0)
            return res.status(409).json({ error: 'Cannot delete a car with active queue entries.' });
        db.transaction(() => {
            db.run('DELETE FROM car_status      WHERE car_id = ?', req.params.id);
            db.run('DELETE FROM ticket_counters WHERE car_id = ?', req.params.id);
            db.run('DELETE FROM cars            WHERE id     = ?', req.params.id);
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
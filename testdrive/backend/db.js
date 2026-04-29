// backend/db.js
// SQLite via sql.js (pure JavaScript — no native build required)
// The database is persisted to disk as queue.db on every write.

const fs        = require('fs');
const path      = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, 'queue.db');

let _db          = null;
let _ready       = false;
let _initPromise = null;
let _inTx        = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

function persist() {
    if (_inTx) return;
    fs.writeFileSync(DB_PATH, Buffer.from(_db.export()));
}

function rowToObj(columns, values) {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = values[i]; });
    return obj;
}

// Safely normalise params so sql.js never receives undefined values.
// sql.js accepts either an Array or an Object (named bindings).
// We always pass an Array here.
function toParams(params) {
    const flat = [].concat(...params);          // flatten one level
    return flat.map(v => (v === undefined ? null : v));
}

// ── Public API ────────────────────────────────────────────────────────────────

function run(sql, ...params) {
    _db.run(sql, toParams(params));
    const res = _db.exec('SELECT last_insert_rowid() AS id');
    const id  = res[0]?.values[0]?.[0];
    persist();
    return id;
}

function get(sql, ...params) {
    const res = _db.exec(sql, toParams(params));
    if (!res.length || !res[0].values.length) return undefined;
    return rowToObj(res[0].columns, res[0].values[0]);
}

function all(sql, ...params) {
    const res = _db.exec(sql, toParams(params));
    if (!res.length) return [];
    return res[0].values.map(row => rowToObj(res[0].columns, row));
}

function exec(sql) {
    _db.run(sql);
    persist();
}

function transaction(fn) {
    _db.run('BEGIN');
    _inTx = true;
    try {
        fn();
        _db.run('COMMIT');
    } catch (err) {
        _db.run('ROLLBACK');
        throw err;
    } finally {
        _inTx = false;
        persist();
    }
}

function lastInsertRowid() {
    const res = _db.exec('SELECT last_insert_rowid() AS id');
    return res[0]?.values[0]?.[0];
}

// ── Init ──────────────────────────────────────────────────────────────────────

// Helper used only during init — bypasses our wrapper to avoid double-persist
function _run(sql, paramsArray) {
    _db.run(sql, (paramsArray || []).map(v => (v === undefined ? null : v)));
}

function getDB() {
    if (_ready)       return Promise.resolve({ run, get, all, exec, transaction, lastInsertRowid });
    if (_initPromise) return _initPromise;

    _initPromise = initSqlJs().then(SQL => {
        _db = fs.existsSync(DB_PATH)
            ? new SQL.Database(fs.readFileSync(DB_PATH))
            : new SQL.Database();

        // ── Schema ────────────────────────────────────────────────────────────

        _db.run(`CREATE TABLE IF NOT EXISTS cars (
            id         TEXT    PRIMARY KEY,
            model      TEXT    NOT NULL,
            plate      TEXT    DEFAULT '',
            created_at INTEGER DEFAULT (strftime('%s','now'))
        )`);

        _db.run(`CREATE TABLE IF NOT EXISTS registrations (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_number         TEXT    NOT NULL UNIQUE,
            name                  TEXT    NOT NULL,
            address               TEXT    NOT NULL,
            contact               TEXT    NOT NULL,
            car_id                TEXT    NOT NULL,
            car_display           TEXT    NOT NULL,
            status                TEXT    NOT NULL DEFAULT 'waiting',
            timestamp             INTEGER NOT NULL,
            date                  TEXT    NOT NULL,
            time                  TEXT    NOT NULL,
            preferred_transac_type TEXT   DEFAULT '',
            customer_type         TEXT    DEFAULT '',
            sales_consultant_name TEXT    DEFAULT '',
            dealership_name       TEXT    DEFAULT ''
        )`);

        // ── Migration: add new columns to existing databases ──────────────────
        try {
            const pragma  = _db.exec('PRAGMA table_info(registrations)');
            const cols    = pragma.length ? pragma[0].values.map(v => v[1]) : [];
            const newCols = [
                ['preferred_transac_type', "TEXT DEFAULT ''"],
                ['customer_type',          "TEXT DEFAULT ''"],
                ['sales_consultant_name',  "TEXT DEFAULT ''"],
                ['dealership_name',        "TEXT DEFAULT ''"],
            ];
            for (const [col, def] of newCols) {
                if (!cols.includes(col)) {
                    _db.run(`ALTER TABLE registrations ADD COLUMN ${col} ${def}`);
                    console.log(`✅ Migrated: added column ${col}`);
                }
            }
        } catch (e) {
            console.warn('Migration warning (non-fatal):', e.message);
        }

        _db.run(`CREATE TABLE IF NOT EXISTS car_status (
            car_id             TEXT    PRIMARY KEY,
            available          INTEGER NOT NULL DEFAULT 1,
            current_serving_id INTEGER,
            calling            INTEGER NOT NULL DEFAULT 0
        )`);

        _db.run(`CREATE TABLE IF NOT EXISTS ticket_counters (
            car_id  TEXT    PRIMARY KEY,
            counter INTEGER NOT NULL DEFAULT 0
        )`);

        // ── Seed default cars ─────────────────────────────────────────────────
        const count = _db.exec('SELECT COUNT(*) FROM cars')[0].values[0][0];

        if (count === 0) {
            const defaults = [
                { id: 'Omoda_E5',   model: 'Omoda E5',   plate: ''},
                { id: 'Omoda_C5',   model: 'Omoda C5',   plate: ''},
                { id: 'Jaecoo_EJ6', model: 'Jaecoo EJ6', plate: ''},
                { id: 'Jaecoo_J7',  model: 'Jaecoo J7',  plate: ''},
            ];
            for (const c of defaults) {
                _run('INSERT INTO cars (id, model, plate) VALUES (?, ?, ?)',
                    [c.id, c.model, c.plate]);
                _run('INSERT INTO car_status (car_id) VALUES (?)',      [c.id]);
                _run('INSERT INTO ticket_counters (car_id) VALUES (?)', [c.id]);
            }
            console.log('✅ Seeded default cars.');
        }

        fs.writeFileSync(DB_PATH, Buffer.from(_db.export()));

        _ready = true;
        console.log('✅ SQLite ready at', DB_PATH);

        return { run, get, all, exec, transaction, lastInsertRowid };
    }).catch(err => {
        console.error('DB init failed:', err.message);
        throw err;
    });

    return _initPromise;
}

module.exports = { getDB };
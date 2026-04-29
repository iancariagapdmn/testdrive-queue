# 🚗 Omoda & Jaecoo — Test Drive Queue System

A full-stack queue management system with a SQLite database, Node.js/Express REST API, and a clean multi-file frontend.

---

## Project Structure

```
testdrive/
├── backend/
│   ├── server.js          # Express entry point
│   ├── db.js              # SQLite init, schema, seed
│   ├── package.json
│   └── routes/
│       ├── cars.js        # CRUD for vehicles
│       ├── registrations.js  # CRUD for queue entries
│       └── queue.js       # call-next, complete, skip actions
└── frontend/
    ├── index.html         # Clean HTML, no inline JS/CSS
    ├── css/
    │   └── style.css      # All styles
    └── js/
        ├── api.js         # All fetch() calls (API layer)
        ├── ui.js          # Rendering helpers (display, ticket, modals)
        ├── admin.js       # Admin dashboard, car manager, exports
        └── app.js         # Bootstrap + registration form + polling
```

---

## Setup & Running

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Start the server

```bash
npm start
# or for auto-reload during development:
npm run dev
```

### 3. Open the app

Visit **http://localhost:3000** in your browser.

The database file (`queue.db`) is created automatically in the `backend/` folder on first run, pre-seeded with the four default car models.

---

## Configuration

### Admin credentials

Default: `admin` / `Dragonai2026!`

Override with environment variables before starting the server:

```bash
ADMIN_USER=myuser ADMIN_PASS=mypassword npm start
```

### Semaphore SMS

Open `frontend/js/admin.js` and replace `YOUR_SEMAPHORE_API_KEY` with your real key:

```js
const SEMAPHORE_API_KEY = 'your_real_key_here';
```

> **Security note:** For production, move the SMS call to the backend (`routes/queue.js`) so the API key is never exposed in the browser.

---

## REST API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/api/cars` | List all cars (with live status) |
| POST   | `/api/cars` | Add a car `{ model, plate }` |
| PUT    | `/api/cars/:id` | Update a car |
| DELETE | `/api/cars/:id` | Delete a car (blocks if queue active) |
| GET    | `/api/registrations` | List all registrations (filter: `?carId=&status=`) |
| GET    | `/api/registrations/:id` | Get one registration |
| POST   | `/api/registrations` | Register `{ name, address, contact, carId }` |
| DELETE | `/api/registrations/:id` | Delete a registration |
| GET    | `/api/queue/:carId` | Get waiting queue for a car |
| POST   | `/api/queue/:carId/call-next` | Call next customer |
| POST   | `/api/queue/:carId/complete` | Complete current service |
| POST   | `/api/queue/:carId/skip` | Skip current customer |
| POST   | `/api/auth/login` | Admin login `{ username, password }` |

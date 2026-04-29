// frontend/js/api.js
// All HTTP calls to the backend REST API. Returns parsed JSON or throws.

const API_BASE = '/api';

async function apiFetch(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
    
}

// ── Cars ─────────────────────────────────────────────────────────────────────
const CarsAPI = {
    list:   ()                      => apiFetch('/cars'),
    create: ({ model, plate })      => apiFetch('/cars',       { method: 'POST', body: { model, plate } }),
    update: (id, { model, plate })  => apiFetch(`/cars/${id}`, { method: 'PUT',  body: { model, plate } }),
    delete: (id)                    => apiFetch(`/cars/${id}`, { method: 'DELETE' }),
};

// ── Registrations ────────────────────────────────────────────────────────────
const RegistrationsAPI = {
    list:   (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return apiFetch(`/registrations${qs ? '?' + qs : ''}`);
    },
    get:    (id)          => apiFetch(`/registrations/${id}`),
    create: (payload)     => apiFetch('/registrations', { method: 'POST', body: payload }),
    delete: (id)          => apiFetch(`/registrations/${id}`, { method: 'DELETE' }),
};

// ── Queue actions ────────────────────────────────────────────────────────────
const QueueAPI = {
    getQueue:     (carId) => apiFetch(`/queue/${carId}`),
    callNext:     (carId) => apiFetch(`/queue/${carId}/call-next`,    { method: 'POST' }),
    complete:     (carId) => apiFetch(`/queue/${carId}/complete`,     { method: 'POST' }),
    skip:         (carId) => apiFetch(`/queue/${carId}/skip`,         { method: 'POST' }),
    clearCalling: (carId) => apiFetch(`/queue/${carId}/clear-calling`,{ method: 'POST' }),
    callAgain: carId => apiFetch(`/queue/${carId}/call-again`, { method: 'POST' }),
};

// ── Auth ─────────────────────────────────────────────────────────────────────
const AuthAPI = {
    login: ({ username, password }) => apiFetch('/auth/login', { method: 'POST', body: { username, password } }),
};


/* AA GESTIONE OFFLINE AVANZATA (CACHE & OUTBOX PATTERN) */
const DB_NAME = 'ISFplanOfflineDB';
const CACHE_STORE = 'cacheStore';
const QUEUE_STORE = 'syncQueue';

// Flag Sincronizzazione In Corso
let _isSyncing = false;

async function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 2);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE);
            if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveToOfflineCache(key, data) {
    const db = await initIndexedDB();
    db.transaction(CACHE_STORE, 'readwrite').objectStore(CACHE_STORE).put(data, key);
}

async function getFromOfflineCache(key) {
    const db = await initIndexedDB();
    return new Promise(res => {
        const req = db.transaction(CACHE_STORE, 'readonly').objectStore(CACHE_STORE).get(key);
        req.onsuccess = () => res(req.result);
    });
}

async function addToSyncQueue(operation, table, payload, matchCriteria = null) {
    const db = await initIndexedDB();
    db.transaction(QUEUE_STORE, 'readwrite').objectStore(QUEUE_STORE).add({
        operation, table, payload, matchCriteria, timestamp: Date.now()
    });
}

async function getSyncQueue() {
    const db = await initIndexedDB();
    return new Promise(res => {
        const req = db.transaction(QUEUE_STORE, 'readonly').objectStore(QUEUE_STORE).getAll();
        req.onsuccess = () => res(req.result);
    });
}

async function clearSyncQueue() {
    const db = await initIndexedDB();
    db.transaction(QUEUE_STORE, 'readwrite').objectStore(QUEUE_STORE).clear();
}

async function processSyncQueue() {
    if (!navigator.onLine) return;

    if (_isSyncing) {
        console.log('⏳ Sync Già In Corso!');
        return;
    }

    const queue = await getSyncQueue();
    if (queue.length === 0) return;

    _isSyncing = true;

    queue.sort((a, b) => {
        const order = { 'medici': 1, 'tasks': 2, 'visite': 3 };
        const orderA = order[a.table] || 4;
        const orderB = order[b.table] || 4;
        if (orderA !== orderB) return orderA - orderB;
        return a.timestamp - b.timestamp;
    });

    console.log(`🚀 Sincronizzazione Di ${queue.length} Elementi Ordinati...`);
    updateNetworkLED('syncing');

    await new Promise(resolve => setTimeout(resolve, 2000));

    const db = await initIndexedDB();

    let counters = { visiteScheduled: 0, visiteWalkin: 0, tasks: 0, altri: 0 };
    let _hadErrors = false; // BB: Traccia Se Almeno Un Elemento Ha Fallito La Sync

    for (const item of queue) {
        try {
            let query;
            const op = item.operation.toUpperCase();

            if (op === 'INSERT') {
                query = sb.from(item.table).insert(item.payload);
            } else if (op === 'UPDATE') {
                query = sb.from(item.table).update(item.payload);
                for (const [key, val] of Object.entries(item.matchCriteria)) {
                    query = query.eq(key, val);
                }
            } else if (op === 'DELETE') {
                query = sb.from(item.table).delete();
                for (const [key, val] of Object.entries(item.matchCriteria)) {
                    query = query.eq(key, val);
                }
            }

            const { error } = await query;

            if (error) {
                // CC ERRORE: Non Blocca Il Loop — L'Elemento Resta In Coda Per Il Prossimo Tentativo
                console.error(`❌ Sync Fallita Per ${item.table} (ID: ${item.id}):`, error);
                _hadErrors = true;
                continue;
            }

            // CC: SUCCESSO: Rimuoviamo Solo Questo Elemento Dalla Coda
            await new Promise(res => {
                const req = db.transaction(QUEUE_STORE, 'readwrite').objectStore(QUEUE_STORE).delete(item.id);
                req.onsuccess = () => res();
            });

            if (item.table === 'visite') {
                item.payload?.is_walkin_done === true ? counters.visiteWalkin++ : counters.visiteScheduled++;
            } else if (item.table === 'tasks') {
                counters.tasks++;
            } else {
                counters.altri++;
            }

            console.log(`✅ Sincronizzato ${op} Per ${item.table}`);

        } catch (err) {
            // CC: Errore Critico Sul Singolo Item — Logga E Continua Con Il Prossimo
            console.error("Errore Critico Su Item Di Sincronizzazione:", err);
            _hadErrors = true;
            continue;
        }
    }

    _isSyncing = false;
    updateNetworkLED('online');

    if (_hadErrors) {
        console.warn('⚠️ Sync Parziale: Alcuni Elementi Verranno Ritentati Al Prossimo Collegamento.');
    }

    const totalSynced = Object.values(counters).reduce((a, b) => a + b, 0);

    if (totalSynced > 0) {
        let msgParts = [];
        if (counters.visiteScheduled > 0) msgParts.push(`${counters.visiteScheduled} Appuntamenti`);
        if (counters.visiteWalkin > 0) msgParts.push(`${counters.visiteWalkin} Liberi`);
        if (counters.tasks > 0) msgParts.push(`${counters.tasks} Task`);
        if (counters.altri > 0) msgParts.push(`${counters.altri} Altro`);

        const finalMsg = "Sincronizzati: " + msgParts.join(", ");

        if (typeof NotificationManager !== 'undefined') {
            NotificationManager.sendLocalNotification("ISFplan Aggiornato", finalMsg);
        }
    }

    if (typeof appState !== 'undefined') {
        appState.calendarNeedsRefresh = true;
        appState.clientsNeedsRefresh = true;
        appState.tasksNeedsRefresh = true;

        if (document.getElementById('calendar-view').classList.contains('active')) {
            await loadMonthDataFromSupabase(currentDate);
        } else if (document.getElementById('clients-view').classList.contains('active')) {
            await loadAllDataFromSupabase();
        } else if (document.getElementById('tasks-view').classList.contains('active')) {
            await renderTasks();
        }
    }
}

// Network Listener
window.addEventListener('online', () => {
    updateNetworkLED('online');
    processSyncQueue();
});
window.addEventListener('offline', () => updateNetworkLED(false));


// http://192.168.1.37:5500
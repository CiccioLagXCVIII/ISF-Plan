function toggleQuickMenu() {
    const menu = document.getElementById('quick-add-menu');
    menu.classList.toggle('d-none');
    lucide.createIcons(); // Aggiorna icone se necessario
}

async function goToToday() {
    const today = dayjs().format('YYYY-MM-DD');
    currentDate = dayjs();

    await loadMonthDataFromSupabase(currentDate);
    openDayView(today);
}

// BB Gestione Vai A Data Specifica
function openJumpToDateModal() {
    // Imposta Default A Oggi
    document.getElementById('jump-to-date-input').value = dayjs().format('YYYY-MM-DD');
    openModal('modal-jump-date');
}

async function jumpToDate() {
    const dateValue = document.getElementById('jump-to-date-input').value;
    if (!dateValue) return;

    currentDate = dayjs(dateValue);
    closeModal('modal-jump-date');

    // Ricarica i dati del mese target PRIMA di aprire la day view,
    // altrimenti "appointments" contiene ancora le visite del mese precedente
    await loadMonthDataFromSupabase(currentDate);
    openDayView(dateValue);
}

function updatePref(key, value) {
    localStorage.setItem('pref_' + key, value);
    // Se Cambia Orario, Ricalcola Tutte Le Notifiche Per Oggi
    if (key === 'notifyTime' && typeof allVisits !== 'undefined') {
        scheduleAllTodayVisits(allVisits);
    }
}

async function forceSync() {
    if (!navigator.onLine) {
        openAlert("Devi Essere Online Per Sincronizzare I Dati!");
        return;
    }
    updateNetworkLED('syncing');
    await processSyncQueue();
    // Ricarica Dati Da Supabase Per Sicurezza
    await loadMonthDataFromSupabase(currentDate);
    openAlert("Sincronizzazione Completata Con Successo!");
}

async function clearAppCache() {
    // --- HELPER INTERNO: Sostituisce il confirm() nativo con il modal-confirm ---
    const askConfirm = (message) => {
        return new Promise((resolve) => {
            const desc = document.getElementById('modal-confirm-desc');
            const confirmBtn = document.getElementById('btn-execute-confirm');
            const cancelBtn = document.querySelector('#modal-confirm .btn-light');

            desc.innerText = message;

            // Funzioni con auto-rimozione: dopo il click si eliminano da sole
            // e ripristinano il comportamento originale degli altri modal
            const onConfirm = () => {
                confirmBtn.removeEventListener('click', onConfirm);
                cancelBtn.removeEventListener('click', onCancel);
                closeModal('modal-confirm');
                resolve(true);
            };

            const onCancel = () => {
                confirmBtn.removeEventListener('click', onConfirm);
                cancelBtn.removeEventListener('click', onCancel);
                closeModal('modal-confirm');
                resolve(false);
            };

            confirmBtn.addEventListener('click', onConfirm);
            cancelBtn.addEventListener('click', onCancel);

            openModal('modal-confirm');
        });
    };

    // 1. Controllo Connessione
    if (!navigator.onLine) {
        const procediOffline = await askConfirm("ATTENZIONE: Sei Offline. Se Pulisci La Cache Ora, Perderai Tutte Le Modifiche Fatte Che Non Sono Ancora State Inviate Al Server. Vuoi Procedere Comunque?");
        if (!procediOffline) return;
    } else {
        // Se Online, Effettua Sincronizzazione di sicurezza
        try {
            console.log("🔄 Avvio Sincronizzazione Di Sicurezza Prima Della Pulizia Cache...");
            updateNetworkLED('syncing');

            await processSyncQueue();

            updateNetworkLED('online');
            console.log("✅ Sincronizzazione Di Sicurezza Completata.");
        } catch (error) {
            console.error("Errore Durante La Sincronizzazione:", error);
            updateNetworkLED('online');
            const ignoraErrore = await askConfirm("La Sincronizzazione Automatica È Fallita. Se Continui, I Dati Non Salvati Andranno Persi. Procedere Comunque?");
            if (!ignoraErrore) return;
        }
    }

    // 2. Conferma Finale Prima Di Pulire La Cache
    const confermaFinale = await askConfirm("I Dati Sono Stati Sincronizzati. Vuoi Procedere Con La Pulizia Della Cache Locale? L'App Verrà Riavviata.");

    if (confermaFinale) {
        try {
            const db = await initIndexedDB();

            // Pulizia effettiva dello store
            const tx = db.transaction(['cacheStore'], 'readwrite');
            tx.objectStore('cacheStore').clear();

            tx.oncomplete = () => {
                console.log("🧹 Cache Locale Svuotata Con Successo.");

                // Prepariamo il modal alert per il successo con ricarica pagina
                const alertDesc = document.getElementById('modal-alert-desc');
                const alertBtn = document.querySelector('#modal-alert .btn-primary');

                alertDesc.innerText = "Pulizia Completata. L'App Verrà Ricaricata Per Scaricare I Dati Aggiornati.";

                // Imposta Azione Tasto OK Dell'Alert Solo Per Questa Volta
                alertBtn.onclick = () => {
                    window.location.reload();
                };

                openModal('modal-alert');
            };

            tx.onerror = (err) => {
                console.error("Errore Durante Pulizia Di IndexedDB:", err);
                openAlert("Si È Verificato UN Errore Durante La Pulizia Della Cache.");
            };
        } catch (err) {
            console.error("Impossibile Accedere Al Database Per La Pulizia:", err);
            updateNetworkLED('online');
            openAlert("Impossibile Accedere Al Database Per La Pulizia.");
        }
    }
}

function reportProblem() {
    const email = "francescolv78@gmail.com";
    const subject = "Segnalazione Problema ISFplan v1.6.9.1";
    const body = "Descrivi Qui Il Problema Che Hai Riscontrato:\n\n- Passaggi Per Riprodurre:\n- Comportamento Atteso:\n- Comportamento Effettivo:\n\nGrazie Per Il Tuo Feedback!";
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// AA GESTIONE INDIRIZZI MULTIPLI

// BB Aggiunge Riga Indirizzo Con Coppia Città + Indirizzo e Tasto Rimozione
function addAddressRow(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (container.querySelectorAll('.address-row').length >= 3) {
        openAlert('Puoi inserire al massimo 3 indirizzi.');
        return;
    }

    const row = document.createElement('div');
    row.className = 'd-flex gap-2 w-100 align-items-center address-row';
    row.innerHTML = `
        <input type="text" class="form-control address-city-input"
            style="flex: 0 0 38%;" placeholder="Città">
        <input type="text" class="form-control address-input"
            style="flex: 1; min-width: 0;" placeholder="Indirizzo aggiuntivo">
        <button type="button" class="btn-address btn-address-remove"
            style="border-radius: 10px; height: 38px; width: 38px; flex-shrink: 0;"
            onclick="this.closest('.address-row').remove()">
            <i data-lucide="x" style="width:16px;height:16px;pointer-events:none;"></i>
        </button>
    `;
    container.appendChild(row);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Wrapper retrocompatibile per chiamate precedenti a addAddressInput
function addAddressInput(inputsId, buttonsId) {
    if (inputsId === 'new-address-container' || inputsId === 'edit-address-container') {
        return addAddressRow(inputsId);
    }
    if (typeof inputsId === 'string' && inputsId.includes('new-')) return addAddressRow('new-address-container');
    if (typeof inputsId === 'string' && inputsId.includes('edit-')) return addAddressRow('edit-address-container');
}


// AA NAVIGATORE CON SELEZIONE INDIRIZZO

let _pendingNavData = null;

// BB Punto di ingresso: controlla quanti indirizzi ci sono e agisce di conseguenza
function openAddressPickerOrNavigate(navKey) {
    const data = window._navData?.[navKey];
    if (!data) return openAlert('Dati indirizzo non disponibili.');

    const { indirizzi, city } = data;

    if (!indirizzi || indirizzi.length === 0) {
        if (city) openNavigator(encodeURIComponent(city));
        else openAlert('Indirizzo mancante.');
        return;
    }

    if (indirizzi.length <= 1) {
        // Singolo indirizzo: vai direttamente al navigatore
        const item = indirizzi[0];
        const addrText = (typeof item === 'object' ? item.indirizzo : item) || '';
        const cityText = (typeof item === 'object' && item.citta ? item.citta : city) || '';
        const query = (addrText && cityText)
            ? encodeURIComponent(`${addrText}, ${cityText}`)
            : encodeURIComponent(addrText || cityText);
        openNavigator(query);
        return;
    }

    // Indirizzi multipli: mostra il picker
    _pendingNavData = { indirizzi, city };

    const list = document.getElementById('address-picker-list');
    list.innerHTML = '';

    indirizzi.forEach((item, i) => {
        const addrText = (typeof item === 'object' ? item.indirizzo : item) || '';
        const cityText = (typeof item === 'object' && item.citta ? item.citta : city) || '';
        const labelText = (addrText && cityText)
            ? `${escapeHTML(addrText)} <span class="text-secondary fw-normal">(${escapeHTML(cityText)})</span>`
            : escapeHTML(addrText || cityText);

        const div = document.createElement('div');
        div.className = 'form-check p-3 rounded-3 border mb-2';
        div.style.cursor = 'pointer';
        div.innerHTML = `
            <input class="form-check-input" type="radio" name="address-pick"
                id="addr-pick-${i}" value="${i}" ${i === 0 ? 'checked' : ''}>
            <label class="form-check-label fw-semibold ms-2 text-dark" for="addr-pick-${i}">
                ${labelText}
            </label>
        `;
        // Click sull'intera riga seleziona il radio
        div.addEventListener('click', () => {
            div.querySelector('input').checked = true;
        });
        list.appendChild(div);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
    openModal('modal-address-picker');
}

// BB Conferma la selezione e apre il navigatore
function confirmAddressPicker() {
    const selected = document.querySelector('input[name="address-pick"]:checked');
    if (!selected || !_pendingNavData) return;

    const { indirizzi, city } = _pendingNavData;
    const item = indirizzi[parseInt(selected.value)];
    const addrText = (typeof item === 'object' ? item.indirizzo : item) || '';
    const cityText = (typeof item === 'object' && item.citta ? item.citta : city) || '';
    const query = (addrText && cityText)
        ? encodeURIComponent(`${addrText}, ${cityText}`)
        : encodeURIComponent(addrText || cityText);

    closeModal('modal-address-picker');

    // Attende la chiusura del modal prima di aprire il navigatore (o il modal scelta nav)
    setTimeout(() => openNavigator(query), 350);
}

document.addEventListener('DOMContentLoaded', () => {
    const nav = localStorage.getItem('pref_defaultNav') || 'ask';
    const time = localStorage.getItem('pref_notifyTime') || '15';

    if (document.getElementById('pref-navigator')) document.getElementById('pref-navigator').value = nav;
    if (document.getElementById('pref-notify-time')) document.getElementById('pref-notify-time').value = time;
});
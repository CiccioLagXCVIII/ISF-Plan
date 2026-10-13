// ==========================================================================
// AA MODULO RILASCIO CAMPIONI (DROP CHAMP FEATURE)
// ==========================================================================
// Feature per la gestione dei passaggi veloci / consegna campioni senza orario fisso.

const SAMPLE_DROP_TAG = '[Campioni]';

/**
 * Verifica se una visita è di tipo "Rilascio Campioni"
 */
function isSampleVisit(v) {
    if (!v) return false;
    const note = v.note || v.lastNote || '';
    const time = v.ora_visita ? v.ora_visita.substring(0, 5) : (v.time || '');
    return note.includes(SAMPLE_DROP_TAG) || (time === '00:00' && note.includes('[Campioni]'));
}

/**
 * Pulisce la nota rimuovendo il tag tecnico per la visualizzazione all'utente
 */
function cleanSampleNote(note) {
    if (!note) return '';
    return note.replace(SAMPLE_DROP_TAG, '').trim();
}

/**
 * Formatta la nota per il salvataggio sul DB preservando il tag
 */
function formatSampleNoteForDB(userText) {
    const clean = (userText || '').replace(SAMPLE_DROP_TAG, '').trim();
    return clean ? `${SAMPLE_DROP_TAG} ${clean}` : SAMPLE_DROP_TAG;
}

/**
 * Aggiorna i badge numerici nel selettore mobile per dare feedback immediato sui carichi
 */
function updateMobileListBadges() {
    const scheduledCount = appointments[selectedDateISO]?.scheduled?.length || 0;
    const samplesCount = appointments[selectedDateISO]?.samples?.length || 0;

    // Calcolo liberi di oggi
    const dayOfWeek = dayjs(selectedDateISO).day();
    const scheduledIds = (appointments[selectedDateISO]?.scheduled || []).map(a => a.id);
    const samplesIds = (appointments[selectedDateISO]?.samples || []).map(a => a.id);
    const visitedTodayIds = [...scheduledIds, ...samplesIds];

    const walkinsCount = walkinQueue.filter(w =>
        w.availableDays.includes(dayOfWeek) && !visitedTodayIds.includes(w.id)
    ).length;

    const setBadge = (id, count) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (count > 0) {
            el.textContent = count;
            el.classList.remove('display-none');
        } else {
            el.textContent = '';
            el.classList.add('display-none');
        }
    };

    setBadge('badge-count-scheduled', scheduledCount);
    setBadge('badge-count-samples', samplesCount);
    setBadge('badge-count-walkins', walkinsCount);
}

/**
 * Helper riutilizzabile per creare la card uniforme di stato vuoto per qualsiasi lista
 */
function createDayEmptyState(iconName, title, subtitle) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'list-unstyled';
    emptyLi.innerHTML = `
        <div class="day-empty-card">
            <div class="day-empty-icon">
                <i data-lucide="${iconName}" style="width:24px;height:24px;"></i>
            </div>
            <div class="day-empty-title">${escapeHTML(title)}</div>
            <div class="day-empty-desc">${escapeHTML(subtitle)}</div>
        </div>`;
    return emptyLi;
}

/**
 * Rendering dedicato delle card Rilascio Campioni nella terza colonna / tab
 */
function renderSamplesAppointments(samplesList, generatePillButtons) {
    const samplesUl = document.getElementById('samples-ul');
    if (!samplesUl) return;
    samplesUl.innerHTML = '';

    if (!samplesList || samplesList.length === 0) {
        samplesUl.appendChild(createDayEmptyState(
            'package-open',
            'Nessun Rilascio Campioni',
            'Nessuna consegna programmata per questa data'
        ));
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    samplesList.forEach(app => {
        const actionPillsHtml = generatePillButtons(app, { showMove: true });
        const li = document.createElement('li');
        li.className = 'appointment-item sample-card-item shadow-sm';
        if (app.isWalkinDone) li.classList.add('sample-delivered-card');

        const spec = app.specialization || "";
        const cleanNote = cleanSampleNote(app.note);

        const statusBadge = app.isWalkinDone
            ? `<span class="badge badge-sample-done d-inline-flex align-items-center gap-1 rounded-pill px-2 py-1">
                 <i data-lucide="check-circle" style="width:12px;height:12px;"></i> Consegnato
               </span>`
            : `<span class="badge badge-sample-pending d-inline-flex align-items-center gap-1 rounded-pill px-2 py-1">
                 <i data-lucide="package" style="width:12px;height:12px;"></i> Da Consegnare
               </span>`;

        const deliveryBtn = !app.isWalkinDone
            ? `<button class="btn btn-success btn-sample-deliver" onclick="markSampleDelivered('${app.dbId}', '${escapeHTML(app.note || '')}')">
                 <i data-lucide="check" style="width:13px; height:13px;"></i> <span>Consegnato</span>
               </button>`
            : `<button class="btn btn-outline-success btn-sample-deliver disabled" style="opacity: 0.85;">
                 <i data-lucide="check-check" style="width:13px; height:13px;"></i> <span>Consegnato</span>
               </button>`;

        li.innerHTML = `
            <div class="d-flex justify-content-between align-items-start mb-2">
                <div class="list-info w-100">
                    <div class="d-flex align-items-center justify-content-between gap-2 mb-1">
                        ${statusBadge}
                        <span class="text-secondary small fw-medium"><i data-lucide="calendar" style="width:12px; height:12px;"></i> Campioni</span>
                    </div>
                    <div class="fw-bold text-dark fs-5 mt-1">${escapeHTML(app.name)}</div>
                    ${spec ? `<small class="text-muted fw-normal">(${escapeHTML(spec)})</small>` : ''}
                    <div class="text-secondary small mt-1">
                        <i data-lucide="map-pin" style="width:12px; height:12px;"></i> ${escapeHTML(app.city)}
                    </div>
                </div>
            </div>
            
            <div class="note-preview" data-visit-id="${app.dbId}" data-note="${escapeHTML(app.note || '')}" onclick="editSampleNote(this)">
                <i data-lucide="file-text" style="width:14px; height:14px;" class="me-1"></i> 
                ${cleanNote ? escapeHTML(cleanNote) : 'Aggiungi Note Campioni / Materiale...'}
            </div>

            <div class="action-buttons sample-action-buttons">
                <div class="sample-btn-group-left">
                    ${deliveryBtn}
                    <button class="btn btn-danger btn-sample-delete" onclick="deleteApp('${app.dbId}')" title="Elimina">
                        <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                    </button>
                </div>
                <div class="sample-pills-group">${actionPillsHtml}</div>
            </div>`;

        samplesUl.appendChild(li);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * Segna la visita campioni come effettuata/consegnata
 */
async function markSampleDelivered(visitDbId, currentNote) {
    try {
        const response = await executeDBAction('UPDATE', 'visite', { is_walkin_done: true }, { id: visitDbId });
        if (response?.error) {
            openAlert("Errore durante l'aggiornamento della consegna.");
            return;
        }

        // Aggiorna anche in memoria locale
        if (appointments[selectedDateISO]?.samples) {
            const found = appointments[selectedDateISO].samples.find(s => s.dbId === visitDbId);
            if (found) found.isWalkinDone = true;
        }
        const visitInAll = allVisits.find(v => v.id === visitDbId || v.dbId === visitDbId);
        if (visitInAll) visitInAll.is_walkin_done = true;

        appState.calendarNeedsRefresh = true;
        appState.clientsNeedsRefresh = true;

        // Se non ha ancora specificato cosa ha consegnato, apriamo opzionalmente la modale note
        const cleanNote = cleanSampleNote(currentNote);
        if (!cleanNote) {
            editNote(visitDbId, currentNote);
        } else {
            await loadMonthDataFromSupabase(currentDate);
            openDayView(selectedDateISO);
        }
    } catch (err) {
        console.error("Errore markSampleDelivered:", err);
        openAlert("Errore durante il salvataggio della consegna.");
    }
}

/**
 * Gestione modifica note per i campioni (mantenendo il tag [Campioni] trasparente all'utente)
 */
function editSampleNote(element) {
    const visitId = element.getAttribute('data-visit-id');
    const rawNote = element.getAttribute('data-note') || '';
    const clean = cleanSampleNote(rawNote);

    const input = document.getElementById('modal-note-input');
    const saveBtn = document.getElementById('btn-save-note');

    input.value = clean;
    openModal('modal-note');

    saveBtn.onclick = async () => {
        const userText = input.value.trim();
        const formattedNote = formatSampleNoteForDB(userText);

        const response = await executeDBAction('UPDATE', 'visite', { note: formattedNote }, { id: visitId });
        if (response?.error) {
            openAlert("Errore nel salvataggio della nota.");
        } else {
            closeModal('modal-note');
            appState.clientsNeedsRefresh = true;
            await loadMonthDataFromSupabase(currentDate);
            openDayView(selectedDateISO);
        }
    };
}


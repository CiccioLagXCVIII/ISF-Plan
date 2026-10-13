// ==========================================================================
// AA EXPORT DATI (VISTA MEDICI)
// ==========================================================================

// BB Costanti Di Configurazione
// CC Soglie Priorità (Giorni Dall'Ultima Visita): Le Stesse Delle Card
// const EXPORT_SOGLIA_ALTA = 45;   // >= 40 giorni → Alta (bordo rosso)
// const EXPORT_SOGLIA_MEDIA = 30;  // >= 30 giorni → Media (bordo giallo)

// CC Un Foglio Per Gruppo (L'Ordine Qui È L'Ordine Dei Fogli Nel File)
const EXPORT_GRUPPI = [
    { key: 'alta', sheet: 'Priorità Alta', color: 'EF4444' },
    { key: 'media', sheet: 'Priorità Media', color: 'F59E0B' },
    { key: 'bassa', sheet: 'Priorità Bassa', color: '10B981' },
    { key: 'mai', sheet: 'Mai Visitati', color: '3B82F6' }
];

// CC Colonne Dei Fogli (wch = Larghezza In Caratteri)
const EXPORT_COLONNE = [
    { titolo: 'Nome', wch: 26 },
    { titolo: 'Specializzazione', wch: 18 },
    { titolo: 'Città', wch: 16 },
    { titolo: 'Indirizzo', wch: 30 },
    { titolo: 'Cellulare', wch: 15 },
    { titolo: 'Ultima Visita', wch: 14 },
    { titolo: 'Giorni Trascorsi', wch: 12 },
    { titolo: 'Prossima Visita', wch: 14 },
    { titolo: 'Ultima Nota', wch: 40 }
];

const EXPORT_XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const EXPORT_DATE_FMT = 'dd/mm/yyyy';


// AA VISIBILITÀ BOTTONE

// BB Mostra/Nasconde Il Bottone Export In Base Alla Vista Attiva
function toggleExportButton(viewId) {
    const btn = document.getElementById('btn-export');
    if (!btn) return;
    btn.classList.toggle('display-none', viewId !== 'clients-view');
}


// AA LOGICA DI PRIORITÀ

// BB Classifica Un Medico (Stessa Logica Dei Colori Delle Card)
function getClientPriority(client, today) {
    if (!client.lastVisit) return { key: 'mai', days: null };

    const days = today.diff(dayjs(client.lastVisit).startOf('day'), 'day');
    if (days >= VISIT_THRESHOLD_HIGH) return { key: 'alta', days };
    if (days >= VISIT_THRESHOLD_MEDIUM) return { key: 'media', days };
    return { key: 'bassa', days };
}


// AA COSTRUZIONE CELLE E FOGLI

// BB Data ISO (YYYY-MM-DD) → Numero Seriale Excel
// DD Calcolo Su Date.UTC Per Evitare Problemi Di Fuso Orario E Ora Legale
function isoToExcelSerial(iso) {
    const [y, m, d] = String(iso).substring(0, 10).split('-').map(Number);
    return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}

// BB Celle
function exportCellText(value, center = false) {
    return {
        v: value == null ? '' : String(value),
        t: 's',
        s: { alignment: { vertical: 'top', horizontal: center ? 'center' : 'left', wrapText: true } }
    };
}

function exportCellNumber(value) {
    return {
        v: value,
        t: 'n',
        s: { alignment: { vertical: 'top', horizontal: 'center' } }
    };
}

function exportCellDate(iso) {
    // DD z + numFmt: Impostati Entrambi Per Sicurezza Con La Libreria Con Stili
    return {
        v: isoToExcelSerial(iso),
        t: 'n',
        z: EXPORT_DATE_FMT,
        s: { numFmt: EXPORT_DATE_FMT, alignment: { vertical: 'top', horizontal: 'center' } }
    };
}

// BB Indirizzi Multipli → Unica Stringa
function getExportAddresses(client) {
    const list = client.indirizzi?.length > 0 ? client.indirizzi : [client.address];
    return list.map(item => {
        if (!item) return '';
        if (typeof item === 'object') {
            const a = item.indirizzo || '';
            const c = item.citta || '';
            return (a && c) ? `${a} (${c})` : (a || c);
        }
        return String(item);
    }).filter(Boolean).join(' | ');
}

// BB Costruisce Un Foglio Per Un Gruppo Di Priorità
function buildExportSheet(items, gruppo) {
    const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { patternType: 'solid', fgColor: { rgb: gruppo.color } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
    };

    // CC Riga Intestazione
    const rows = [
        EXPORT_COLONNE.map(c => ({ v: c.titolo, t: 's', s: headerStyle }))
    ];

    // CC Righe Dati
    items.forEach(({ client, days }) => {
        rows.push([
            exportCellText(client.name),
            exportCellText(client.specialization),
            exportCellText(client.city),
            exportCellText(getExportAddresses(client)),
            exportCellText(client.phone),
            client.lastVisit ? exportCellDate(client.lastVisit) : exportCellText('Mai', true),
            days !== null ? exportCellNumber(days) : exportCellText('—', true),
            client.nextVisit ? exportCellDate(client.nextVisit) : exportCellText('', true),
            exportCellText(client.lastNote)
        ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = EXPORT_COLONNE.map(c => ({ wch: c.wch }));
    ws['!rows'] = [{ hpt: 24 }];
    // CC Filtro Automatico Sulle Intestazioni (Utile Per Filtrare Per Città O Specializzazione)
    ws['!autofilter'] = {
        ref: XLSX.utils.encode_range({
            s: { r: 0, c: 0 },
            e: { r: rows.length - 1, c: EXPORT_COLONNE.length - 1 }
        })
    };
    return ws;
}


// AA CONSEGNA DEL FILE

// BB Telefono: Share Sheet Nativo. Desktop / Fallback: Download Classico
async function deliverExportFile(blob, fileName) {
    const isTouch = window.matchMedia('(pointer: coarse)').matches;

    if (isTouch && navigator.canShare) {
        const file = new File([blob], fileName, { type: blob.type });
        if (navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({ files: [file], title: 'ISFplan - Elenco Medici' });
                return;
            } catch (err) {
                // CC L'Utente Ha Chiuso Il Foglio Di Condivisione: Non È Un Errore
                if (err.name === 'AbortError') return;
                console.warn('Share Fallito, Uso Il Download Classico:', err);
            }
        }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}


// AA FUNZIONE PRINCIPALE

async function exportData() {
    if (typeof XLSX === 'undefined') {
        return openAlert("Libreria Di Export Non Disponibile. Connettiti A Internet E Ricarica La Pagina.");
    }

    try {
        // BB 1: Medici Filtrati Come Nella Vista
        const clients = getFilteredClients();
        if (clients.length === 0) {
            return openAlert("Nessun Medico Da Esportare Con I Filtri Attuali.");
        }

        // BB 2: Suddivisione Per Priorità
        const today = dayjs().startOf('day');
        const gruppi = { alta: [], media: [], bassa: [], mai: [] };

        clients.forEach(client => {
            const { key, days } = getClientPriority(client, today);
            gruppi[key].push({ client, days });
        });

        // BB 3: Ordinamento (Più In Ritardo In Cima; A Parità, Alfabetico)
        const byName = (a, b) => a.client.name.localeCompare(b.client.name, 'it');
        ['alta', 'media', 'bassa'].forEach(k => {
            gruppi[k].sort((a, b) => (b.days - a.days) || byName(a, b));
        });
        gruppi.mai.sort(byName);

        // BB 4: Workbook (I Gruppi Vuoti Non Generano Il Foglio)
        const wb = XLSX.utils.book_new();
        EXPORT_GRUPPI.forEach(g => {
            if (gruppi[g.key].length === 0) return;
            XLSX.utils.book_append_sheet(wb, buildExportSheet(gruppi[g.key], g), g.sheet);
        });

        // BB 5: Scrittura E Consegna
        const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([data], { type: EXPORT_XLSX_MIME });
        const fileName = `ISFplan_Medici_${dayjs().format('YYYY-MM-DD')}.xlsx`;

        await deliverExportFile(blob, fileName);

    } catch (error) {
        console.error('Errore Export:', error);
        openAlert("Errore Durante La Creazione Del File.");
    }
}
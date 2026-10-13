dayjs.locale('it');
document.addEventListener('DOMContentLoaded', async () => {

    if (typeof getFromOfflineCache !== 'function') {
        console.error('offlineManager.js Non Caricato');
        return;
    }

    // Inizializza icone
    if (typeof lucide !== 'undefined') lucide.createIcons();

    const todayISO = dayjs().format('YYYY-MM-DD');
    document.getElementById('report-date').innerText = dayjs().format('dddd D MMMM YYYY');

    const container = document.getElementById('report-list');

    // 1. RECUPERO DATI (Dalla cache offline creata in scriptPro.js)
    const cachedVisits = await getFromOfflineCache('visitsData') || [];

    // 2. FILTRO VISITE DI OGGI
    const todayVisits = cachedVisits.filter(v => v.data_visita === todayISO)
        .sort((a, b) => a.ora_visita.localeCompare(b.ora_visita));

    document.getElementById('total-visits').innerText = todayVisits.length;

    // 3. PULIZIA DEL LOADER (FONDAMENTALE)
    container.innerHTML = '';

    if (todayVisits.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'report-empty';
        empty.innerHTML = `
            <div class="empty-icon">
                <i data-lucide="coffee" style="width:28px;height:28px;"></i>
            </div>
            <h5>Nessun Appuntamento</h5>
            <p>Goditi Un Caffè, Oggi Non Ci Sono Appuntamenti</p>`;
        container.appendChild(empty);
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    // 4. INIEZIONE DELLE CARD
    todayVisits.forEach((v, index) => {
        const medico = v.medici ? v.medici.nome : "Medico";
        const ora = v.ora_visita.substring(0, 5);
        const citta = v.medici ? v.medici.citta : "Città N.D.";
        const indirizzo = v.medici ? v.medici.indirizzo : "";

        const card = document.createElement('div');
        card.className = 'visit-report-card';
        card.style.animationDelay = `${index * 80}ms`;

        // Numero progressivo
        const num = document.createElement('div');
        num.className = 'visit-num';
        num.textContent = String(index + 1).padStart(2, '0');

        // Info centrali
        const info = document.createElement('div');
        info.className = 'visit-info';

        const h4 = document.createElement('h4');
        h4.className = 'visit-name';
        h4.textContent = medico;

        const meta = document.createElement('div');
        meta.className = 'visit-meta';

        const pinIcon = document.createElement('i');
        pinIcon.setAttribute('data-lucide', 'map-pin');
        pinIcon.style.width = '14px';
        pinIcon.style.height = '14px';
        meta.appendChild(pinIcon);
        meta.append(` ${citta}${indirizzo ? ' · ' + indirizzo : ''}`);

        info.appendChild(h4);
        info.appendChild(meta);

        // Orario + navigatore (colonna destra)
        const right = document.createElement('div');
        right.className = 'visit-right';

        const isSample = (v.note && v.note.includes('[Campioni]')) || (v.ora_visita && v.ora_visita.startsWith('00:00'));
        const timeBadge = document.createElement('div');
        timeBadge.className = 'visit-time-badge';
        if (isSample) {
            timeBadge.style.fontSize = '0.75rem';
            timeBadge.style.color = '#6366f1';
            timeBadge.textContent = 'CAMPIONI';
        } else {
            timeBadge.textContent = ora;
        }

        right.appendChild(timeBadge);

        card.appendChild(num);
        card.appendChild(info);
        card.appendChild(right);
        container.appendChild(card);
    });

    // Rinfresca le icone dopo aver aggiunto il contenuto
    if (typeof lucide !== 'undefined') lucide.createIcons();
});
let scheduledNotifications = new Set();
const btnNotifyID = 'btn-toggle-notify';

function initNotifications() {
    if (!('Notification' in window)) {
        console.warn('Notifiche Non Supportate');
        updateNotifyUI('unsupported');
        return;
    }
    updateNotifyUI(Notification.permission);
}

async function requestPermission() {
    try {
        const permission = await Notification.requestPermission();
        updateNotifyUI(permission);

        if (permission === 'denied') {
            if (typeof openAlert === 'function') {
                openAlert("Notifiche Bloccate! Attivale Nelle Impostazioni Del Browser Per Usarle");
            }
        }
    } catch (error) {
        console.error("Errore Richiesta Permessi:", error);
    }
}

function updateNotifyUI(permission) {
    const btn = document.getElementById(btnNotifyID);
    if (!btn) return;

    btn.classList.remove('active-notify', 'denied-notify', 'text-secondary', 'text-primary', 'text-danger');

    if (permission === 'granted') {
        btn.innerHTML = '<i data-lucide="bell-ring"></i>';
        btn.classList.add('active-notify', 'text-primary');
    } else if (permission === 'denied') {
        btn.innerHTML = '<i data-lucide="bell-off"></i>';
        btn.classList.add('denied-notify', 'text-danger');
    } else {
        btn.innerHTML = '<i data-lucide="bell"></i>';
        btn.classList.add('text-secondary');
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function sendLocalNotification(title, body, targetUrl = null) {
    if (Notification.permission !== 'granted') return;

    navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, {
            body: body,
            icon: 'icon/siteIcon.png',
            badge: 'icon/siteIcon.png',
            vibrate: [200, 100, 200],
            tag: targetUrl ? 'morning-report' : 'ISFplan-alert',
            renotify: true,
            data: { url: targetUrl }
        });
    });
}

function checkMorningReport(visits) {
    if (Notification.permission !== 'granted') return;

    const now = dayjs();
    const todayISO = now.format('YYYY-MM-DD');
    const lastSent = localStorage.getItem('last_morning_report_date');

    // Se sono passate le 07:00 E non è ancora stato mandato un report oggi
    if (now.hour() >= 7 && lastSent !== todayISO) {
        const todayVisits = visits.filter(v => v.data_visita === todayISO);

        if (todayVisits.length > 0) {
            sendLocalNotification(
                "Buongiorno! Briefing Pronto",
                `Oggi hai ${todayVisits.length} Visite In Programma. Clicca Per Dettagli.`,
                "dayReport.html"
            );

            localStorage.setItem('last_morning_report_date', todayISO);
        }
    }
}

function scheduleAllTodayVisits(visits) {
    if (Notification.permission !== 'granted') return;

    const today = dayjs().format('YYYY-MM-DD');
    const now = dayjs();

    const todayVisits = visits.filter(v => v.data_visita === today);

    todayVisits.forEach(visit => {
        const visitId = visit.id || visit.dbId;
        if (!visitId || scheduledNotifications.has(visitId)) return;
        if (typeof isSampleVisit === 'function' && isSampleVisit(visit)) return;
        if (visit.ora_visita === '00:00:00' || visit.ora_visita === '00:00') return;

        const visitDateTime = dayjs(`${visit.data_visita} ${visit.ora_visita}`);
        const prefMinutes = parseInt(localStorage.getItem('pref_notifyTime') || '15');
        const notificationTime = visitDateTime.subtract(prefMinutes, 'minute');

        if (notificationTime.isAfter(now)) {
            const delayMs = notificationTime.diff(now);

            const medicoNome = visit.medici ? visit.medici.nome : "Medico";
            const indirizzo = visit.medici ? `${visit.medici.indirizzo}, ${visit.medici.citta}` : "";

            scheduledNotifications.add(visitId);

            setTimeout(() => {
                sendLocalNotification(
                    "Prossima Visita Tra 15 Min",
                    `Dr. ${medicoNome} (${indirizzo})`
                );

                scheduledNotifications.delete(visitId);
            }, delayMs);

            console.log(`🔔 Notifica Programmata Per ${medicoNome} Alle ${notificationTime.format('HH:mm')}`);
        }
    });
}

async function toggleNotifications() {
    const p = Notification.permission;

    if (p === 'granted') {
        // sendLocalNotification("ISFplan", "Le Notifiche Sono Già Attive!");
        openAlert("Le Notifiche Sono Già Attive! Per Disattivarle, Usa Le Impostazion Del Browser");
    } else if (p === 'denied') {
        openAlert("Sblocca Le Notifiche Nelle Impostazioni Del Browser Per Usarle");
    } else if (p === 'default') {
        await requestPermission();
    } else {
        openAlert("Stato Notifiche Sconosciuto. Riprova.");
    }
}

// Inizializzazione Al Caricamento
document.addEventListener('DOMContentLoaded', initNotifications);
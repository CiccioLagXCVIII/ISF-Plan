// AA 1: REGISTRAZIONE E CONTROLLO SUPPORTO

// BB: Riferimento Al Nuovo Worker In Attesa Di Attivazione
let _pendingNewWorker = null;

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => {
                console.log("%c🌐 ISFplan SW Online", "color: #bf4f8a; font-weight: bold; font-size: 14px;");

                // BB 1: MONITORAGGIO NUOVE VERSIONI
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    _pendingNewWorker = newWorker; // CC: Salviamo Il Riferimento Per Usarlo Nel Toast

                    // CC 1: ASCOLTO CAMBIO STATO WORKER
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateToast();
                        }
                    });
                });
            })
            .catch(err => console.error('ISFplan: Errore SW', err));
    });
}

// AA 2: LOGICA DI INTERFACCIA (UI)

// BB 1: NOTIFICA AGGIORNAMENTO DISPONIBILE
function showUpdateToast() {
    const updateConfirmed = confirm("ISFplan Aggiornato! Scaricare La Nuova Versione?");
    if (updateConfirmed) {
        // CC: Ordiniamo Al Nuovo SW Di Prendere Il Controllo Solo Ora, Con Consenso
        if (_pendingNewWorker) {
            _pendingNewWorker.postMessage('SKIP_WAITING');
        }
        // CC: Piccolo Delay Per Dare Tempo Al SW Di Processare Il Messaggio
        setTimeout(() => window.location.reload(), 100);
    }
}
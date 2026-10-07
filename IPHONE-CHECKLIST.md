# AUTO — checklist iPhone prima della 1.0

Questa checklist serve per il collaudo reale su iPhone 17 Pro quando AUTO è pubblicata via HTTPS/GitHub Pages.

## Installazione
1. Apri l'URL di AUTO in **Safari**.
2. Apri Condividi → **Aggiungi alla schermata Home**.
3. Conferma il nome `AUTO` e apri l'icona appena installata.
4. Verifica che si apra senza barra di Safari e in orientamento verticale.

## Primo avvio
1. Crea un veicolo di prova.
2. Chiudi completamente AUTO e riaprila dalla Home.
3. Verifica che veicolo attivo e dati siano ancora presenti.
4. Registra una lettura km, un rifornimento e un costo.
5. Prova una lettura km volutamente incoerente: AUTO deve rifiutarla con un messaggio chiaro.

## Offline
1. Apri AUTO almeno una volta con connessione attiva.
2. Attiva modalità aereo.
3. Riapri AUTO dalla Home.
4. Verifica Dashboard, Veicoli, Rifornimenti, Manutenzione e Costi.
5. Registra un dato offline, chiudi e riapri: il dato deve restare disponibile.
6. Apple Maps è esclusa dal requisito offline perché è un'azione esterna.

## Backup e recovery
1. Costi → Backup & ripristino → **Esporta JSON**.
2. Salva il file tramite il foglio di condivisione nell'app File.
3. Crea manualmente un punto di ripristino.
4. Esegui **Diagnostica PWA**: l'integrità dati deve risultare OK.
5. Importa un backup valido e verifica i dati.
6. Prova un JSON incompatibile o incoerente: l'import deve essere rifiutato senza sostituire i dati correnti.

## Storici grandi
1. Con uno storico numeroso, verifica che vengano mostrati inizialmente al massimo 100 record filtrati.
2. Usa **Mostra altri** per caricare il blocco successivo.
3. Cerca un record vecchio: la ricerca deve considerare tutto lo storico, non solo il blocco già visibile.

## Integrazione ALEX HUB
1. Prova una shortcut PWA, ad esempio **Aggiungi rifornimento**.
2. Verifica il fallback `?alexTarget=auto%3A%2F%2Ffuel%2Fnew`.
3. Se HUB è sullo stesso origin, verifica `window.AlexAuto.getSnapshot()`.

## Aggiornamento
1. Dopo un nuovo deploy apri AUTO con rete attiva.
2. Chiudi e riapri l'app per permettere l'attivazione del nuovo service worker.
3. Controlla in Costi → Milestone che la versione sia quella attesa.
4. Esegui di nuovo Diagnostica PWA.

## Criterio di promozione a 1.0
La release può essere promossa solo se:
- nessuna perdita dati nei test di chiusura/riapertura;
- import/export superato;
- offline superato;
- nessuna incoerenza km accettata;
- diagnostica senza errori bloccanti;
- shortcut e deep-link funzionanti;
- touch e modali comodi su iPhone 17 Pro.

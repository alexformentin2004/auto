# AUTO v1.0.0-rc — Release Audit

## Stato
**Release candidate / feature freeze.** Il modello dati resta `schemaVersion: 5`.

## Verifiche automatiche
- [x] Sintassi JavaScript valida.
- [x] `manifest.json` e `alex-module.json` validi.
- [x] Versione coerente tra config, manifest ALEX, service worker e documentazione.
- [x] Namespace database interamente sotto `alex.auto.*`.
- [x] Contratti ALEX HUB e route deep-link coerenti tra manifest statico e runtime.
- [x] Migrazioni backup schema 1 → 5.
- [x] Validazione integrità backup prima della sostituzione locale.
- [x] Sostituzione import multi-store atomica in una singola transazione IndexedDB.
- [x] Recovery locale separato dall'IndexedDB principale.
- [x] Cache offline con asset core presenti.
- [x] Ricorrenze costi idempotenti.
- [x] Calcolo full-to-full coperto dagli smoke test esistenti.
- [x] Diagnostica PWA e progressive history presenti.
- [x] README conforme all'ALEX Integration Standard.

## Verifiche manuali ancora necessarie prima della 1.0
- [ ] Installazione reale da Safari su iPhone 17 Pro.
- [ ] Avvio dalla Home Screen e comportamento standalone.
- [ ] Chiusura completa e riapertura con persistenza dati.
- [ ] Avvio e utilizzo delle funzioni essenziali in modalità aereo.
- [ ] Export JSON → cancellazione dati di prova → import JSON sul dispositivo reale.
- [ ] Recovery locale su dispositivo reale.
- [ ] Apertura Apple Maps da distributore/officina.
- [ ] Shortcut PWA dalla Home Screen, se esposte dalla versione iOS installata.
- [ ] Aggiornamento service worker dopo nuova release pubblicata.
- [ ] Deploy GitHub Pages nel repository dedicato `AUTO`.

## Criterio di promozione a 1.0.0
La release può diventare `1.0.0` quando le verifiche manuali bloccanti di installazione, persistenza, offline ed export/import sono completate senza perdita dati. Problemi cosmetici non bloccanti possono essere rimandati a `1.0.x`.

## Rischi residui noti
- Il comportamento PWA dipende dalle capacità effettivamente esposte dalla versione iOS/Safari installata.
- Non esiste sincronizzazione cloud: il backup JSON resta il meccanismo principale di portabilità.
- Le integrazioni Apple Maps richiedono il passaggio a un'app/servizio esterno.
- TCO e autonomia dipendono dalla qualità dei dati inseriti dall'utente.

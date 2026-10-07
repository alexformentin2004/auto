# AUTO — Alex HUB module

## Scopo
AUTO è una PWA personale iPhone-first per registrare veicoli, chilometraggio, rifornimenti, manutenzione, scadenze, costi e Total Cost of Ownership. Funziona offline in modo autonomo ed è predisposta all'integrazione futura in ALEX HUB.

## Versione corrente
- `moduleId`: `auto`
- `appVersion`: `1.0.0-rc`
- `contractVersion`: `1.0.0`
- `integrationVersion`: `1.0.0`
- `schemaVersion`: `5`
- milestone: Feature Freeze & Final Audit

`schemaVersion` resta 5 perché la release candidate introduce solo hardening, audit e transazioni atomiche senza modificare il modello persistente.

## Funzioni presenti
- Gestione multi-veicolo con veicolo attivo.
- Scheda veicolo: marca, modello, allestimento, anno, targa, VIN, immatricolazione, alimentazione, cilindrata, potenza, cambio, colore, capacità serbatoio, acquisto e note.
- Valore attuale stimato e data valutazione per il calcolo del deprezzamento.
- Acquisto diretto, finanziamento o formula rateale con anticipo, importo finanziato, durata, rata, TAN/APR informativo, maxi rata e spese.
- Storico chilometraggio manuale e derivato da rifornimenti/manutenzioni.
- Rifornimenti pieno/parziale e analisi full-to-full.
- Consumo medio, ultimo consumo, media ultimi 3 intervalli, €/km, €/100 km, prezzo medio/min/max, trend e autonomia teorica.
- Manutenzione programmata per data e/o km, componenti e storico interventi.
- Scadenze amministrative separate da manutenzione e costi.
- Costi extra manuali: assicurazione, bollo, revisione, parcheggio, garage, pedaggi, lavaggio, accessori, soccorso e altro.
- Costi ricorrenti mensili, trimestrali, semestrali, annuali o ogni N mesi.
- Materializzazione automatica e idempotente delle occorrenze ricorrenti fino alla data corrente.
- Costo effettivo ultimi 30 e 365 giorni.
- Costo ricorrente equivalente mensile/annuale.
- TCO economico dal possesso, TCO medio mensile, annualizzato e €/km.
- Breakdown TCO per carburante, manutenzione, costi extra, deprezzamento e oneri finanziari.
- Dashboard con intervalli 6/12/24 mesi.
- Spesa mensile operativa con confronto mese precedente.
- Confronto YTD con lo stesso periodo dell’anno precedente.
- Composizione costi per categoria nel periodo selezionato.
- Costo operativo €/km basato sulle letture chilometriche disponibili nel periodo.
- Trend mensile del consumo full-to-full ponderato e del prezzo carburante ponderato.
- Storico sintetico dei costi annuali.
- Riferimenti a documenti nell'app File senza archivio documentale parallelo.
- Apertura officine/distributori con Apple Maps.
- Export/import JSON completo con migrazioni schema v1 → v2 → v3 → v4 → v5.
- PWA offline-first con service worker.
- Deploy predisposto per GitHub Pages tramite GitHub Actions.
- ALEX contracts: Today, Insights, Hub Summary, Upcoming Maintenance, Events, Quick Actions.
- Manifest runtime del modulo con capacità, versioni e route supportate.
- Bridge locale `window.AlexAuto` / `window.AlexModules.auto` per una futura shell ALEX HUB.
- Routing canonico `auto://...` con fallback PWA via `?alexTarget=...`.
- Apertura diretta di viste/azioni con `vehicleId` opzionale.
- Bridge `postMessage` limitato alla stessa origin per evitare condivisione dati cross-origin.
- Ricerca e filtri istantanei negli storici di rifornimenti, manutenzione e costi.
- Conteggio risultati e azzeramento rapido filtri.
- Punto di ripristino locale manuale e automatico prima di importazioni/cancellazioni distruttive.
- Ripristino dell’ultimo stato locale direttamente dall’app.
- Feedback tramite toast, salvataggi con stato busy e focus automatico nei modali.
- Miglioramenti accessibilità: skip-link, focus visibile, target touch minimi, `aria-current`, reduced motion.
- Manifest PWA con shortcut rapide per rifornimento, chilometraggio e costo.
- Validazione coerente di date, importi, chilometraggi e relazioni tra record.
- Controllo integrità completo prima dell’import JSON.
- Rendering progressivo degli storici a blocchi da 100 record con ricerca sull’intero dataset.
- Diagnostica PWA locale per dati, IndexedDB, service worker, rete e storage.
- Checklist di collaudo dedicata a iPhone 17 Pro.

## Struttura file
- `index.html`: shell PWA.
- `styles.css`: design iPhone-first.
- `manifest.json`: manifest installabile.
- `alex-module.json`: manifest statico ALEX HUB per discovery del modulo senza avviare l’app.
- `sw.js`: cache offline.
- `js/config.js`: identità modulo, versione e namespace.
- `js/db.js`: wrapper IndexedDB, upgrade object store e sostituzione multi-store atomica.
- `js/data.js`: repository dati e snapshot.
- `js/costs.js`: ricorrenze, annualizzazione e logica costi.
- `js/analytics.js`: consumi, costi, TCO, dashboard temporale e motore manutenzione.
- `js/contracts.js`: contratti ALEX HUB.
- `js/integration.js`: manifest modulo, resolver deep-link, bridge runtime e interoperabilità HUB.
- `js/export-import.js`: backup, validazione e migrazioni.
- `js/recovery.js`: punto di ripristino locale di emergenza, separato dallo schema IndexedDB.
- `js/validation.js`: validazione record, coerenza chilometrica e controllo integrità backup.
- `js/diagnostics.js`: diagnostica PWA, storage, service worker e integrità dati.
- `js/app.js`: UI e flussi.
- `tests/integration-smoke.mjs`: smoke test dei contratti di integrazione e coerenza manifest statico/runtime.
- `tests/ux-hardening-smoke.mjs`: smoke test recovery, manifest PWA e hardening UX.
- `tests/release-candidate-smoke.mjs`: smoke test validazione, diagnostica, progressive history e asset RC.
- `tests/final-audit-smoke.mjs`: audit finale di versioni, namespace, asset offline, migrazioni e import atomico.
- `RELEASE-AUDIT.md`: matrice di audit della release candidate.
- `CHANGELOG.md`: cronologia sintetica delle milestone.
- `IPHONE-CHECKLIST.md`: checklist di collaudo reale su iPhone prima della 1.0.
- `.github/workflows/pages.yml`: deploy statico GitHub Pages.

## Schema dati
### Vehicle
`id, name, make, model, trim, year, plate, vin, registrationDate, currentKm, fuelType, engineCc, powerKw, tankCapacityLiters, transmission, color, purchaseDate, purchasePrice, purchaseKm, estimatedValue, valuationDate, financeType, downPayment, financedAmount, financeStartDate, financeMonths, financeMonthlyPayment, financeAprPct, balloonPayment, financeFees, notes, createdAt, updatedAt`

`financeType`: `cash | loan | lease`.

### OdometerEntry
`id, vehicleId, date, km, source, sourceId?, notes?, createdAt, updatedAt`

`source`: `manual | fuel | maintenance`.

### FuelEntry
`id, vehicleId, date, odometerKm, liters, pricePerLiter, totalCost, fillType, fuelGrade, drivingContext, station, receiptRef, notes, createdAt, updatedAt`

### MaintenanceEntry
`id, vehicleId, planId?, componentId?, title, category, date, cost, odometerKm, parts, place, documentRef, notes, createdAt, updatedAt`

### MaintenancePlan
`id, vehicleId, componentId?, title, category, intervalKm, intervalMonths, lastServiceDate, lastServiceKm, nextDueDate, nextDueKm, warningDays, warningKm, priority, active, notes, createdAt, updatedAt`

### VehicleComponent
`id, vehicleId, name, type, location, brand, model, installedDate, installedKm, lastServiceDate?, lastServiceKm?, status, documentRef, notes, createdAt, updatedAt`

### CostEntry
`id, vehicleId, title, category, amount, date, merchant, documentRef, notes, source, recurringCostId?, occurrenceKey?, createdAt, updatedAt`

`source`: `manual | recurring`.

Le occorrenze generate automaticamente mantengono `recurringCostId` e una `occurrenceKey` univoca `<planId>:<date>` per impedire duplicati.

### RecurringCost
`id, vehicleId, title, category, amount, frequency, intervalMonths, startDate, endDate?, active, merchant, notes, createdAt, updatedAt`

`frequency`: `monthly | quarterly | semiannual | annual | custom`.

### Deadline
`id, vehicleId, title, type, date, priority, completed, notes, createdAt, updatedAt`

Le scadenze amministrative restano intenzionalmente separate dai costi. Esempio: l'assicurazione può avere sia un costo ricorrente sia una scadenza; i due oggetti hanno scopi diversi e non sono duplicazioni di storage.

## Chiavi storage / database
Database IndexedDB: `alex.auto.db`

Object store:
- `alex.auto.vehicles`
- `alex.auto.odometer`
- `alex.auto.fuel`
- `alex.auto.maintenance`
- `alex.auto.maintenancePlans`
- `alex.auto.components`
- `alex.auto.costs`
- `alex.auto.recurringCosts`
- `alex.auto.deadlines`
- `alex.auto.settings`
- `alex.auto.metadata`

Impostazione persistente:
- `selectedVehicleId` nello store `alex.auto.settings`.

Nessuna chiave generica globale come `data`, `settings` o `history`.

## Export format
```json
{
  "moduleId": "auto",
  "appVersion": "1.0.0-rc",
  "schemaVersion": 5,
  "exportedAt": "ISO-8601",
  "settings": [],
  "data": {
    "vehicles": [],
    "odometer": [],
    "fuel": [],
    "maintenance": [],
    "maintenancePlans": [],
    "components": [],
    "costs": [],
    "recurringCosts": [],
    "deadlines": []
  },
  "metadata": []
}
```

L'import rifiuta moduli diversi e schema più recenti. I backup schema 1, 2, 3 e 4 vengono migrati automaticamente allo schema 5.

## Migrazioni schema
### v1 → v2
- aggiunge storico odometro;
- assegna `fillType: full` ai vecchi rifornimenti;
- inizializza i campi veicolo introdotti nella v0.2.

### v2 → v3
- aggiunge `tankCapacityLiters`;
- aggiunge `fuelGrade`, `drivingContext`, `receiptRef`.

### v3 → v4
- crea `maintenancePlans` e `components`;
- preserva manutenzione e scadenze esistenti;
- aggiunge a ogni vecchio intervento `planId`, `componentId` e `parts` vuoti.

### v4 → v5
- crea `costs` e `recurringCosts`;
- aggiunge al veicolo i dati di valore attuale e finanziamento;
- non converte automaticamente vecchie scadenze in costi, evitando assunzioni sui pagamenti realmente effettuati.

## Motore costi ricorrenti
`buildMissingRecurringEntries()` calcola tutte le occorrenze dovute tra `startDate` e oggi, rispettando `endDate`, frequenza e stato del piano.

Prima di creare una voce verifica `occurrenceKey`, quindi riaprire l'app o ricaricare i dati non duplica le spese.

Disattivare o eliminare un piano non cancella i costi storici già materializzati. Questo preserva la contabilità reale.

## TCO — Total Cost of Ownership
AUTO separa volutamente:
1. **spese effettive**: carburante + manutenzione + CostEntry;
2. **costi ricorrenti programmati**: previsione annualizzata dei piani attivi;
3. **costo economico di possesso**: spese dal possesso + deprezzamento + oneri finanziari maturati stimati.

Formula principale:

`TCO = costi operativi dal possesso + deprezzamento + oneri finanziari maturati`

Deprezzamento:

`max(0, prezzo acquisto - valore attuale stimato)`

Il prezzo d'acquisto non viene sommato integralmente al TCO insieme al deprezzamento, perché ciò conterebbe due volte il capitale dell'auto.

Gli oneri finanziari sono stimati dalla differenza tra pagamenti contrattuali complessivi e prezzo di acquisto, maturata proporzionalmente alla durata trascorsa. `financeAprPct` è conservato come dato informativo; AUTO non ricostruisce ancora un piano di ammortamento bancario rata-per-rata.

Il TCO è marcato come **completo** solo quando sono disponibili prezzo d'acquisto e valore attuale stimato. Senza valore attuale AUTO mostra un TCO parziale.

## Dashboard & Statistiche
`dashboardAnalytics(state, vehicleId?, vehicles, rangeMonths)` costruisce statistiche senza creare nuovi record di database.

La dashboard supporta intervalli da 6, 12 e 24 mesi e separa sempre:
- **costi operativi effettivi**: carburante + manutenzione + CostEntry;
- **TCO**: costi operativi dal possesso + deprezzamento + oneri finanziari;
- **costi ricorrenti programmati**: mostrati come previsione ma non duplicati nelle spese finché non vengono materializzati;
- **metriche carburante**: consumi e prezzi derivati dai rifornimenti.

Il costo operativo/km del periodo viene calcolato solo se esistono letture chilometriche sufficienti. AUTO usa la lettura più vicina disponibile all’inizio del periodo e l’ultima lettura disponibile entro la fine; in assenza di copertura adeguata mostra `—` invece di inventare una percorrenza.

Il trend consumo raggruppa gli intervalli full-to-full per mese di chiusura e usa una media ponderata su litri/distanza. Il trend prezzo carburante usa costo/litri mensili, quindi è anch’esso ponderato.

## Today Contract
`getTodaySummary(state, vehicleId?)` valuta manutenzione e scadenze amministrative e produce:
`title, status, priority, shortText, actionLabel, actionTarget, timestamp` quando applicabile.

## Insights Contract
`getInsights(state, vehicleId?)` espone metriche normalizzate:
- `monthly_vehicle_cost` — EUR
- `annual_vehicle_cost` — EUR
- `average_consumption` — L/100km
- `last_consumption` — L/100km
- `fuel_cost_per_km` — EUR/km
- `average_fuel_price` — EUR/L
- `recurring_annual_vehicle_cost` — EUR/year
- `ytd_vehicle_cost` — EUR
- `operating_cost_per_km_12m` — EUR/km, quando disponibile
- `monthly_vehicle_cost_change` — percent, quando confrontabile
- `total_cost_of_ownership` — EUR
- `tco_per_km` — EUR/km
- `estimated_full_tank_range` — km, quando disponibile
- `maintenance_attention_count` — count
- `next_maintenance_days` — days, quando disponibile
- `next_maintenance_km` — km, quando disponibile

Ogni metrica contiene `timestamp, metricId, value, unit, category, sourceModule`.

## Hub Summary
`getHubSummary(state, vehicleId?)` restituisce al massimo 5 informazioni selezionate tra:
- costo ultimi 30 giorni;
- costo ultimi 365 giorni;
- consumo medio;
- TCO dal possesso quando completo;
- manutenzione imminente;
- prossima scadenza amministrativa.

`getUpcomingMaintenance(state, vehicleId?)` espone separatamente il prossimo piano tecnico rilevante.

## Quick actions
Ogni quick action dichiara `id, actionId, sourceModule, kind, label, target`.

- `Aggiungi rifornimento` → `auto://fuel/new`
- `Registra km` → `auto://odometer/new`
- `Registra manutenzione` → `auto://maintenance/new`
- `Aggiungi costo` → `auto://costs/new`

## Eventi
`getEvents(state)` normalizza:
- scadenze amministrative con `type: deadline`;
- piani manutenzione con `nextDueDate` e `type: maintenance`;
- prossime occorrenze dei costi ricorrenti con `type: cost`.

Campi base: `eventId, sourceModule, type, title, startAt, priority, completed`. AUTO aggiunge anche `actionTarget` quando l’evento può aprire direttamente una sezione.

## ALEX HUB Integration Contract
### Manifest statico
`alex-module.json` espone identità, versioni, capacità, contratti, route e quick actions senza eseguire JavaScript. Il runtime verifica la stessa identità tramite `getModuleManifest()`.

`getModuleManifest()` descrive AUTO senza richiedere conoscenza interna dell’app:
- identità e versioni;
- namespace;
- contratti disponibili;
- capacità;
- route/azioni supportate;
- proprietà offline/standalone;
- policy di trasporto locale.

Target canonici supportati:
- `auto://dashboard`
- `auto://vehicles`
- `auto://fuel`
- `auto://fuel/new`
- `auto://odometer/new`
- `auto://maintenance`
- `auto://maintenance/new`
- `auto://maintenance/plan/new`
- `auto://component/new`
- `auto://costs`
- `auto://costs/new`
- `auto://deadlines`
- `auto://deadlines/new`

Un target può includere il contesto del veicolo, ad esempio:
`auto://fuel/new?vehicleId=veh_123`

Poiché una PWA iOS non può fare affidamento su un protocollo custom registrato nativamente, AUTO accetta anche un fallback web:
`https://<host-auto>/?alexTarget=auto%3A%2F%2Ffuel%2Fnew`

`readIncomingTarget()` legge il target dall’URL e `clearIncomingTarget()` lo rimuove dopo l’esecuzione per evitare aperture duplicate al refresh.

### Runtime bridge
Quando AUTO è caricata espone:
- `window.AlexAuto`
- `window.AlexModules.auto`

Metodi principali:
- `describe()`
- `getTodaySummary()`
- `getHubSummary()`
- `getInsights()`
- `getEvents()`
- `getQuickActions()`
- `getUpcomingMaintenance()`
- `getSnapshot()`
- `resolveTarget(target)`
- `open(target)`

`getSnapshot()` restituisce in un solo oggetto manifest, contesto veicolo, Today, Hub Summary, manutenzione imminente, Insights, Events e Quick Actions.

AUTO emette inoltre `alex:module-ready` quando il bridge è disponibile. Un contenitore sulla stessa origin può usare `postMessage` con `type: alex:module:request`; per privacy le richieste cross-origin vengono ignorate e i dati restano locali.


## UX & PWA Hardening v0.8
### Ricerca e filtri
Gli storici di rifornimenti, manutenzione e costi espongono una ricerca testuale locale istantanea. Rifornimenti supporta anche il filtro `pieno/parziale`; manutenzione e costi espongono il filtro categoria. I filtri non modificano i dati e restano in memoria solo per la sessione corrente.

### Recovery locale
AUTO salva un singolo punto di ripristino d’emergenza in `localStorage` con chiave `alex.auto.recovery.v1`. Il contenuto è un export ALEX completo con metadati `savedAt` e `reason`.

Il punto viene tentato automaticamente prima di:
- import JSON;
- eliminazione veicolo;
- eliminazione record;
- eliminazione piano manutenzione, componente o costo ricorrente.

È inoltre possibile creare, ripristinare o rimuovere manualmente il punto dalla sezione Backup. Il salvataggio è best-effort: se il browser esaurisce la quota locale, AUTO continua a funzionare e avvisa l’utente. Il recovery locale non sostituisce l’export JSON esterno.

### Accessibilità e touch
- target interattivi principali di almeno 44 px;
- focus keyboard visibile;
- skip-link al contenuto;
- voce di navigazione attiva con `aria-current=page`;
- supporto `prefers-reduced-motion`;
- messaggi di stato tramite area live toast;
- focus automatico al primo controllo utile dei modali.

### PWA hardening
Il service worker v0.8 limita la cache runtime alla stessa origin, aggiorna la cache versionata e include il modulo recovery. Il manifest aggiunge `id`, orientamento portrait e shortcut rapide.

## Release Candidate Preparation v0.9
### Validazione dati
`js/validation.js` applica le stesse regole ai form e agli import JSON. I principali controlli bloccanti sono:
- date storiche non future per km, rifornimenti, manutenzione e costi effettivi;
- importi, litri e prezzi positivi dove richiesto;
- chilometraggio cronologicamente non decrescente tra date diverse;
- `currentKm` del veicolo non inferiore allo storico odometro;
- costi ricorrenti con fine non precedente all'inizio;
- piani manutenzione con almeno un intervallo o una prossima soglia;
- backup senza ID duplicati, `vehicleId` orfani o `occurrenceKey` duplicate.

L'import esegue prima la migrazione allo schema corrente e poi un controllo integrità completo. Se trova errori bloccanti, i dati locali non vengono sostituiti. Nella release candidate la sostituzione finale di tutti gli object store avviene inoltre in **un'unica transazione IndexedDB atomica**: o l'intero backup viene applicato, oppure la transazione viene annullata.

### Performance storici
Rifornimenti, manutenzione e costi vengono filtrati sull'intero dataset ma renderizzati a blocchi da 100 record. `Mostra altri` aggiunge blocchi successivi. Questo evita DOM molto grandi senza ridurre la completezza di ricerca e filtri.

### Diagnostica PWA
Dalla sezione Costi è disponibile **Diagnostica PWA**. Controlla:
- integrità strutturale dei dati;
- disponibilità IndexedDB;
- service worker;
- contesto sicuro;
- rete online/offline;
- quota/uso storage quando il browser espone `navigator.storage.estimate()`.

La diagnostica non invia dati in rete.

### Collaudo iPhone
`IPHONE-CHECKLIST.md` definisce installazione Home, persistenza, test offline, backup/recovery, validazione km, storici grandi, deep-link e criteri di promozione alla 1.0.

## Feature Freeze & Final Audit v1.0.0-rc
La release candidate congela il perimetro funzionale della 1.0. Le modifiche ammesse da qui alla stable sono bug fix, compatibilità e rifiniture emerse dal collaudo reale.

Hardening aggiuntivo:
- import multi-store atomico in IndexedDB;
- operazioni IndexedDB risolte solo al completamento della transazione;
- chiusura automatica della connessione in caso di `versionchange`;
- audit automatico di versioni, namespace, manifest, cache offline e migrazioni;
- documentazione separata tra test automatici e verifiche manuali iPhone.

Vedi `RELEASE-AUDIT.md` per la matrice completa.

## File e documenti
AUTO conserva riferimenti testuali, nomi o link a ricevute/fatture nell'app File. Non duplica File.

## Offline first
Database, storico, calcoli, piani, componenti, costi, TCO, dashboard, grafici ed export/import funzionano localmente. Apple Maps è un'azione esterna e può richiedere connettività.

## Compatibilità futura
AUTO funziona anche senza ALEX HUB. Tutte le integrazioni sono contratti dati e non dipendenze rigide da altre app.

## Limiti noti v1.0.0-rc
- Veicoli elettrici non hanno ancora un modello dedicato kWh/100 km.
- Il TCO dipende dal valore attuale stimato inserito dall'utente; non esiste ancora una valutazione automatica di mercato.
- Il finanziamento usa una stima aggregata degli oneri, non un piano di ammortamento bancario completo.
- Le spese ricorrenti vengono materializzate quando AUTO viene aperta; non esiste un processo server in background, coerentemente con offline-first e budget 0 €.
- Il costo operativo/km dei filtri 6/12/24 mesi dipende dalla copertura delle letture odometro; AUTO evita estrapolazioni quando i dati non bastano.
- I grafici sono volutamente locali e leggeri, senza librerie esterne, per mantenere offline-first e budget 0 €.
- La sincronizzazione cloud dei dati utente non è prevista in questa milestone.
- I target `auto://...` sono identificatori logici ALEX, non protocolli iOS registrati; l’apertura da una PWA esterna usa il fallback HTTPS con `alexTarget`.
- Il bridge runtime condivide dati solo nello stesso contesto/origin; un futuro HUB ospitato su un dominio diverso dovrà integrare AUTO nello stesso origin oppure usare un meccanismo di scambio esplicito scelto successivamente.

## Avvio locale su Windows
Per service worker e comportamento PWA usare HTTP/HTTPS. Dalla cartella del progetto:

`python -m http.server 8080`

Poi aprire `http://localhost:8080`.

## Deploy GitHub Pages
Il progetto include `.github/workflows/pages.yml` e `.nojekyll`.

Nel repository GitHub dedicato `AUTO`:
1. caricare i file sulla branch `main`;
2. in GitHub → Settings → Pages selezionare una sola volta **GitHub Actions** come sorgente, se necessario;
3. ogni push su `main` avvierà il deploy statico.

## Prossima milestone prevista
- `1.0.0`: release stabile dopo collaudo reale iPhone, verifica offline/installazione e deploy GitHub Pages del repository dedicato.

Da `1.0.0-rc` a `1.0.0` non sono previste nuove macro-funzioni: solo fix e rifiniture emerse dalla checklist finale.

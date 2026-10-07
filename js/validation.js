import { todayIso } from './utils.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const COLLECTIONS = ['vehicles','odometer','fuel','maintenance','maintenancePlans','components','costs','recurringCosts','deadlines'];

const num = value => Number(value);
const has = value => value !== '' && value !== null && value !== undefined;
const label = (name, fallback='Valore') => name || fallback;

export function isValidIsoDate(value) {
  if (!ISO_DATE.test(String(value || ''))) return false;
  const [y,m,d] = String(value).split('-').map(Number);
  const dt = new Date(Date.UTC(y,m-1,d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m-1 && dt.getUTCDate() === d;
}

export function assertValidDate(value, name='Data', { required=true, allowFuture=true } = {}) {
  if (!has(value)) {
    if (required) throw new Error(`${label(name)} obbligatoria.`);
    return;
  }
  if (!isValidIsoDate(value)) throw new Error(`${label(name)} non valida.`);
  if (!allowFuture && String(value) > todayIso()) throw new Error(`${label(name)} non può essere futura.`);
}

export function assertNumber(value, name='Valore', { min=0, max=Number.POSITIVE_INFINITY, positive=false, integer=false } = {}) {
  const n = num(value);
  if (!Number.isFinite(n)) throw new Error(`${label(name)} non valido.`);
  if (positive && n <= 0) throw new Error(`${label(name)} deve essere maggiore di zero.`);
  if (!positive && n < min) throw new Error(`${label(name)} non può essere inferiore a ${min}.`);
  if (n > max) throw new Error(`${label(name)} supera il limite consentito.`);
  if (integer && !Number.isInteger(n)) throw new Error(`${label(name)} deve essere un numero intero.`);
  return n;
}

function vehicleExists(state, vehicleId) {
  return Boolean(vehicleId && state?.vehicles?.some(v => v.id === vehicleId));
}

export function validateOdometerCandidate(entries, candidate, { ignoreId='' } = {}) {
  if (!candidate?.vehicleId) throw new Error('Veicolo obbligatorio.');
  assertValidDate(candidate.date, 'Data chilometraggio', { allowFuture:false });
  const km = assertNumber(candidate.km, 'Chilometraggio', { min:0 });
  const relevant = (entries || []).filter(x => x.vehicleId === candidate.vehicleId && x.id !== ignoreId && isValidIsoDate(x.date) && Number.isFinite(Number(x.km)));
  const before = relevant.filter(x => x.date < candidate.date);
  const after = relevant.filter(x => x.date > candidate.date);
  if (before.length) {
    const maxBefore = Math.max(...before.map(x => Number(x.km)));
    if (maxBefore > km) throw new Error(`Chilometraggio incoerente: esiste una lettura precedente di ${Math.round(maxBefore).toLocaleString('it-IT')} km.`);
  }
  if (after.length) {
    const minAfter = Math.min(...after.map(x => Number(x.km)));
    if (minAfter < km) throw new Error(`Chilometraggio incoerente: esiste una lettura successiva di ${Math.round(minAfter).toLocaleString('it-IT')} km.`);
  }
  return true;
}

export function validateVehiclePayload(payload, state={}) {
  if (!String(payload?.name || '').trim()) throw new Error('Nome veicolo obbligatorio.');
  const currentKm = assertNumber(payload.currentKm || 0, 'Km attuali', { min:0 });
  const purchaseKm = assertNumber(payload.purchaseKm || 0, 'Km all’acquisto', { min:0 });
  if (currentKm && purchaseKm > currentKm) throw new Error('I km all’acquisto non possono superare i km attuali.');
  if (payload.registrationDate) assertValidDate(payload.registrationDate, 'Prima immatricolazione', { allowFuture:false });
  if (payload.purchaseDate) assertValidDate(payload.purchaseDate, 'Data acquisto', { allowFuture:false });
  if (payload.valuationDate) assertValidDate(payload.valuationDate, 'Data valutazione', { allowFuture:false });
  if (payload.purchaseDate && payload.registrationDate && payload.purchaseDate < payload.registrationDate) throw new Error('La data di acquisto non può precedere la prima immatricolazione.');
  if (payload.valuationDate && payload.purchaseDate && payload.valuationDate < payload.purchaseDate) throw new Error('La data di valutazione non può precedere l’acquisto.');
  ['purchasePrice','estimatedValue','downPayment','financedAmount','financeMonthlyPayment','financeAprPct','balloonPayment','financeFees','engineCc','powerKw','tankCapacityLiters'].forEach(k => assertNumber(payload[k] || 0, k, { min:0 }));
  assertNumber(payload.financeMonths || 0, 'Durata finanziamento', { min:0, integer:true });
  const existingMax = Math.max(0, ...(state.odometer || []).filter(x => x.vehicleId === payload.id).map(x => Number(x.km) || 0));
  if (existingMax > currentKm) throw new Error(`Km attuali inferiori allo storico: lo storico arriva a ${Math.round(existingMax).toLocaleString('it-IT')} km.`);
  return true;
}

export function validateOdometerPayload(payload, state, { ignoreOdometerId='' } = {}) {
  if (!vehicleExists(state, payload.vehicleId)) throw new Error('Veicolo non valido.');
  return validateOdometerCandidate(state.odometer, { vehicleId:payload.vehicleId, date:payload.date, km:payload.km }, { ignoreId:ignoreOdometerId });
}

export function validateFuelPayload(payload, state, { ignoreOdometerId='' } = {}) {
  if (!vehicleExists(state, payload.vehicleId)) throw new Error('Veicolo non valido.');
  assertValidDate(payload.date, 'Data rifornimento', { allowFuture:false });
  assertNumber(payload.odometerKm, 'Km odometro', { min:0 });
  assertNumber(payload.liters, 'Litri', { positive:true, max:500 });
  assertNumber(payload.pricePerLiter, 'Prezzo/L', { positive:true, max:20 });
  assertNumber(payload.totalCost, 'Costo totale', { positive:true, max:10000 });
  validateOdometerCandidate(state.odometer, { vehicleId:payload.vehicleId, date:payload.date, km:payload.odometerKm }, { ignoreId:ignoreOdometerId });
  return true;
}

export function validateMaintenancePayload(payload, state, { ignoreOdometerId='' } = {}) {
  if (!vehicleExists(state, payload.vehicleId)) throw new Error('Veicolo non valido.');
  if (!String(payload.title || '').trim()) throw new Error('Titolo intervento obbligatorio.');
  assertValidDate(payload.date, 'Data intervento', { allowFuture:false });
  assertNumber(payload.cost || 0, 'Costo intervento', { min:0, max:1000000 });
  const km = assertNumber(payload.odometerKm || 0, 'Km intervento', { min:0 });
  if (km > 0) validateOdometerCandidate(state.odometer, { vehicleId:payload.vehicleId, date:payload.date, km }, { ignoreId:ignoreOdometerId });
  return true;
}

export function validateMaintenancePlanPayload(payload, state) {
  if (!vehicleExists(state, payload.vehicleId)) throw new Error('Veicolo non valido.');
  if (!String(payload.title || '').trim()) throw new Error('Nome piano obbligatorio.');
  const intervalKm = assertNumber(payload.intervalKm || 0, 'Intervallo km', { min:0 });
  const intervalMonths = assertNumber(payload.intervalMonths || 0, 'Intervallo mesi', { min:0, integer:true });
  const nextDueKm = assertNumber(payload.nextDueKm || 0, 'Prossima soglia km', { min:0 });
  assertNumber(payload.lastServiceKm || 0, 'Km ultimo intervento', { min:0 });
  assertNumber(payload.warningDays || 0, 'Preavviso giorni', { min:0, integer:true });
  assertNumber(payload.warningKm || 0, 'Preavviso km', { min:0 });
  if (payload.lastServiceDate) assertValidDate(payload.lastServiceDate, 'Data ultimo intervento', { allowFuture:false });
  if (payload.nextDueDate) assertValidDate(payload.nextDueDate, 'Prossima data');
  if (!intervalKm && !intervalMonths && !nextDueKm && !payload.nextDueDate) throw new Error('Imposta almeno un intervallo o una prossima soglia per il piano.');
  if (payload.lastServiceDate && payload.nextDueDate && payload.nextDueDate < payload.lastServiceDate) throw new Error('La prossima scadenza non può precedere l’ultimo intervento.');
  return true;
}

export function validateComponentPayload(payload, state) {
  if (!vehicleExists(state, payload.vehicleId)) throw new Error('Veicolo non valido.');
  if (!String(payload.name || '').trim()) throw new Error('Nome componente obbligatorio.');
  if (payload.installedDate) assertValidDate(payload.installedDate, 'Data installazione', { allowFuture:false });
  const km = assertNumber(payload.installedKm || 0, 'Km installazione', { min:0 });
  const vehicle = state.vehicles.find(v => v.id === payload.vehicleId);
  if (vehicle && Number(vehicle.currentKm || 0) > 0 && km > Number(vehicle.currentKm || 0)) throw new Error('I km di installazione superano i km attuali del veicolo.');
  return true;
}

export function validateCostPayload(payload, state) {
  if (!vehicleExists(state, payload.vehicleId)) throw new Error('Veicolo non valido.');
  if (!String(payload.title || '').trim()) throw new Error('Titolo costo obbligatorio.');
  assertValidDate(payload.date, 'Data costo', { allowFuture:false });
  assertNumber(payload.amount, 'Importo', { positive:true, max:10000000 });
  return true;
}

export function validateRecurringCostPayload(payload, state) {
  if (!vehicleExists(state, payload.vehicleId)) throw new Error('Veicolo non valido.');
  if (!String(payload.title || '').trim()) throw new Error('Titolo costo ricorrente obbligatorio.');
  assertNumber(payload.amount, 'Importo', { positive:true, max:10000000 });
  assertValidDate(payload.startDate, 'Prima occorrenza');
  if (payload.endDate) assertValidDate(payload.endDate, 'Data fine');
  if (payload.endDate && payload.endDate < payload.startDate) throw new Error('La data di fine non può precedere la prima occorrenza.');
  if (payload.frequency === 'custom') assertNumber(payload.intervalMonths, 'Intervallo mesi', { min:1, integer:true });
  return true;
}

export function validateDeadlinePayload(payload, state) {
  if (!vehicleExists(state, payload.vehicleId)) throw new Error('Veicolo non valido.');
  if (!String(payload.title || '').trim()) throw new Error('Titolo scadenza obbligatorio.');
  assertValidDate(payload.date, 'Data scadenza');
  return true;
}

function pushDateIssue(issues, collection, id, field, value, { allowFuture=true }={}) {
  if (!has(value)) return;
  if (!isValidIsoDate(value)) issues.errors.push(`${collection}/${id || '?'}: ${field} non valida.`);
  else if (!allowFuture && value > todayIso()) issues.errors.push(`${collection}/${id || '?'}: ${field} futura.`);
}

function checkUniqueIds(rows, collection, issues) {
  const seen = new Set();
  for (const row of rows) {
    if (!row?.id) { issues.errors.push(`${collection}: record senza id.`); continue; }
    if (seen.has(row.id)) issues.errors.push(`${collection}: id duplicato ${row.id}.`);
    seen.add(row.id);
  }
}

export function inspectSnapshotIntegrity(data={}) {
  const issues = { errors:[], warnings:[], counts:{} };
  for (const name of COLLECTIONS) {
    const rows = Array.isArray(data[name]) ? data[name] : [];
    issues.counts[name] = rows.length;
    if (!Array.isArray(data[name])) issues.errors.push(`${name}: collezione mancante o non valida.`);
    checkUniqueIds(rows, name, issues);
  }
  const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
  const vehicleIds = new Set(vehicles.map(v => v.id));
  for (const name of COLLECTIONS.filter(x => x !== 'vehicles')) {
    for (const row of (data[name] || [])) {
      if (row.vehicleId && !vehicleIds.has(row.vehicleId)) issues.errors.push(`${name}/${row.id || '?'}: vehicleId orfano (${row.vehicleId}).`);
    }
  }
  for (const v of vehicles) {
    if (!String(v.name || '').trim()) issues.errors.push(`vehicles/${v.id}: nome mancante.`);
    for (const k of ['currentKm','purchaseKm','purchasePrice','estimatedValue','tankCapacityLiters']) {
      if (has(v[k]) && (!Number.isFinite(Number(v[k])) || Number(v[k]) < 0)) issues.errors.push(`vehicles/${v.id}: ${k} non valido.`);
    }
    pushDateIssue(issues,'vehicles',v.id,'registrationDate',v.registrationDate,{allowFuture:false});
    pushDateIssue(issues,'vehicles',v.id,'purchaseDate',v.purchaseDate,{allowFuture:false});
    pushDateIssue(issues,'vehicles',v.id,'valuationDate',v.valuationDate,{allowFuture:false});
  }
  for (const x of (data.odometer || [])) {
    pushDateIssue(issues,'odometer',x.id,'date',x.date,{allowFuture:false});
    if (!Number.isFinite(Number(x.km)) || Number(x.km) < 0) issues.errors.push(`odometer/${x.id}: km non validi.`);
  }
  for (const vehicleId of vehicleIds) {
    const rows = (data.odometer || []).filter(x => x.vehicleId === vehicleId && isValidIsoDate(x.date) && Number.isFinite(Number(x.km))).sort((a,b) => a.date.localeCompare(b.date));
    let maxPrevious = -Infinity;
    let previousDate = '';
    for (const row of rows) {
      const km = Number(row.km);
      if (row.date !== previousDate && km < maxPrevious) issues.errors.push(`odometer/${row.id}: sequenza km decrescente rispetto a una data precedente.`);
      maxPrevious = Math.max(maxPrevious, km);
      previousDate = row.date;
    }
    const maxOdo = rows.reduce((m,x)=>Math.max(m,Number(x.km)||0),0);
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (vehicle && Number(vehicle.currentKm || 0) < maxOdo) issues.errors.push(`vehicles/${vehicle.id}: currentKm inferiore allo storico (${maxOdo}).`);
  }
  for (const x of (data.fuel || [])) {
    pushDateIssue(issues,'fuel',x.id,'date',x.date,{allowFuture:false});
    if (!(Number(x.liters) > 0)) issues.errors.push(`fuel/${x.id}: litri non validi.`);
    if (!(Number(x.pricePerLiter) > 0)) issues.errors.push(`fuel/${x.id}: prezzo/L non valido.`);
    if (!(Number(x.totalCost) > 0)) issues.errors.push(`fuel/${x.id}: costo totale non valido.`);
  }
  for (const x of (data.maintenance || [])) {
    pushDateIssue(issues,'maintenance',x.id,'date',x.date,{allowFuture:false});
    if (Number(x.cost || 0) < 0) issues.errors.push(`maintenance/${x.id}: costo negativo.`);
    if (Number(x.odometerKm || 0) < 0) issues.errors.push(`maintenance/${x.id}: km negativi.`);
  }
  for (const x of (data.costs || [])) {
    pushDateIssue(issues,'costs',x.id,'date',x.date,{allowFuture:false});
    if (!(Number(x.amount) > 0)) issues.errors.push(`costs/${x.id}: importo non valido.`);
  }
  const occurrence = new Set();
  for (const x of (data.costs || [])) {
    if (!x.occurrenceKey) continue;
    if (occurrence.has(x.occurrenceKey)) issues.errors.push(`costs: occurrenceKey duplicata ${x.occurrenceKey}.`);
    occurrence.add(x.occurrenceKey);
  }
  for (const x of (data.recurringCosts || [])) {
    pushDateIssue(issues,'recurringCosts',x.id,'startDate',x.startDate);
    pushDateIssue(issues,'recurringCosts',x.id,'endDate',x.endDate);
    if (!(Number(x.amount) > 0)) issues.errors.push(`recurringCosts/${x.id}: importo non valido.`);
    if (x.endDate && x.startDate && x.endDate < x.startDate) issues.errors.push(`recurringCosts/${x.id}: fine precedente all’inizio.`);
  }
  for (const x of (data.deadlines || [])) pushDateIssue(issues,'deadlines',x.id,'date',x.date);
  for (const x of (data.maintenancePlans || [])) {
    if (!Number(x.intervalKm || 0) && !Number(x.intervalMonths || 0) && !Number(x.nextDueKm || 0) && !x.nextDueDate) issues.warnings.push(`maintenancePlans/${x.id}: nessuna soglia configurata.`);
  }
  return issues;
}

export function assertSnapshotIntegrity(data) {
  const report = inspectSnapshotIntegrity(data);
  if (report.errors.length) {
    const preview = report.errors.slice(0,4).join(' ');
    const more = report.errors.length > 4 ? ` (+${report.errors.length - 4} altri errori)` : '';
    throw new Error(`Backup incoerente. ${preview}${more}`);
  }
  return report;
}

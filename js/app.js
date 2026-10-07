import { repo } from './data.js';
import { calcStats, fuelAnalytics, dashboardAnalytics, maintenanceOverview, maintenancePlanStatus, nextPlanDueValues, normalizeMaintenancePlan } from './analytics.js';
import { buildMissingRecurringEntries, nextRecurringOccurrence, annualizedRecurringAmount, recurrenceMonths } from './costs.js';
import { getTodaySummary, getHubSummary, getQuickActions, getUpcomingMaintenance } from './contracts.js';
import { buildExport, downloadExport, importPayload } from './export-import.js';
import { saveRecoveryPoint, readRecoveryPoint, clearRecoveryPoint } from './recovery.js';
import { MODULE } from './config.js';
import { resolveActionTarget, readIncomingTarget, clearIncomingTarget, installAlexBridge, getModuleManifest } from './integration.js';
import { money, number, dateLabel, daysFromNow, todayIso, escapeHtml, mapsSearchUrl } from './utils.js';
import { validateVehiclePayload, validateOdometerPayload, validateFuelPayload, validateMaintenancePayload, validateMaintenancePlanPayload, validateComponentPayload, validateCostPayload, validateRecurringCostPayload, validateDeadlinePayload } from './validation.js';
import { runDiagnostics } from './diagnostics.js';

const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const modalTitle = document.querySelector('#modalTitle');
const modalBody = document.querySelector('#modalBody');
const quickFuelBtn = document.querySelector('#quickFuelBtn');
const importFile = document.querySelector('#importFile');
let view = 'dashboard';
let dashboardRangeMonths = 12;
let selectedVehicleId = '';
const filters = { fuelQuery:'', fuelType:'all', maintenanceQuery:'', maintenanceCategory:'all', costsQuery:'', costsCategory:'all' };
const HISTORY_BATCH = 100;
const historyLimits = { fuel:HISTORY_BATCH, maintenance:HISTORY_BATCH, costs:HISTORY_BATCH };
let diagnosticsReport = null;
let state = { vehicles:[], odometer:[], fuel:[], maintenance:[], maintenancePlans:[], components:[], costs:[], recurringCosts:[], deadlines:[] };

async function load() {
  diagnosticsReport = null;
  const [vehicles, odometer, fuel, maintenance, maintenancePlans, components, costs, recurringCosts, deadlines, selected] = await Promise.all([
    repo.vehicles.all(), repo.odometer.all(), repo.fuel.all(), repo.maintenance.all(), repo.maintenancePlans.all(), repo.components.all(), repo.costs.all(), repo.recurringCosts.all(), repo.deadlines.all(), repo.settings.get('selectedVehicleId')
  ]);
  const missingRecurring = buildMissingRecurringEntries(recurringCosts, costs, todayIso());
  if (missingRecurring.length) await Promise.all(missingRecurring.map(x => repo.costs.save(x)));
  const currentCosts = missingRecurring.length ? await repo.costs.all() : costs;
  state = { vehicles, odometer, fuel, maintenance, maintenancePlans, components, costs:currentCosts, recurringCosts, deadlines };
  state.odometer.sort((a,b) => String(b.date).localeCompare(String(a.date)) || Number(b.km) - Number(a.km));
  state.fuel.sort((a,b) => String(b.date).localeCompare(String(a.date)) || Number(b.odometerKm) - Number(a.odometerKm));
  state.maintenance.sort((a,b) => String(b.date).localeCompare(String(a.date)) || Number(b.odometerKm) - Number(a.odometerKm));
  state.costs.sort((a,b) => String(b.date).localeCompare(String(a.date)));
  state.recurringCosts.sort((a,b) => String(a.startDate || '9999').localeCompare(String(b.startDate || '9999')));
  state.deadlines.sort((a,b) => String(a.date || '9999').localeCompare(String(b.date || '9999')));
  const preferred = selected?.value;
  selectedVehicleId = state.vehicles.some(v => v.id === preferred) ? preferred : (state.vehicles[0]?.id || '');
  if (selectedVehicleId && preferred !== selectedVehicleId) await repo.settings.save('selectedVehicleId', selectedVehicleId);
}

function selectedVehicle() { return state.vehicles.find(v => v.id === selectedVehicleId) || state.vehicles[0] || null; }
function vehicleRows(rows) { return selectedVehicleId ? rows.filter(x => x.vehicleId === selectedVehicleId) : rows; }
function val(v) { return escapeHtml(v ?? ''); }
function statsFor(vehicleId = selectedVehicleId) { return calcStats(state, vehicleId || null, state.vehicles); }
function componentById(id) { return state.components.find(x => x.id === id) || null; }
function planById(id) { return state.maintenancePlans.find(x => x.id === id) || null; }
function recurringCostById(id) { return state.recurringCosts.find(x => x.id === id) || null; }

function normalized(value) { return String(value ?? '').trim().toLocaleLowerCase('it'); }
function searchable(...parts) { return val(parts.filter(Boolean).join(' ').toLocaleLowerCase('it')); }
function filterToolbar(kind, { query='', type='all', categories=[], count='—' } = {}) {
  const typeSelect = kind === 'fuel' ? `<select data-filter="fuelType" aria-label="Tipo rifornimento"><option value="all" ${type === 'all' ? 'selected' : ''}>Tutti</option><option value="full" ${type === 'full' ? 'selected' : ''}>Pieni</option><option value="partial" ${type === 'partial' ? 'selected' : ''}>Parziali</option></select>` : '';
  const categorySelect = categories.length ? `<select data-filter="${kind}Category" aria-label="Categoria"><option value="all">Tutte le categorie</option>${categories.map(c => `<option value="${val(c)}" ${type === c ? 'selected' : ''}>${val(c)}</option>`).join('')}</select>` : '';
  return `<div class="filter-bar" data-filter-kind="${kind}"><div class="filter-search"><span aria-hidden="true">⌕</span><input type="search" data-filter="${kind}Query" value="${val(query)}" placeholder="Cerca nello storico…" autocomplete="off" aria-label="Cerca nello storico"></div>${typeSelect}${categorySelect}<button class="ghost compact filter-clear" data-clear-filter="${kind}" aria-label="Azzera filtri">Azzera</button><span class="filter-count" data-filter-count>${val(count)}</span></div>`;
}

function filterHistoryData(kind, rows, searchGetter, typeGetter) {
  const q = normalized(filters[`${kind}Query`]);
  const typeKey = kind === 'fuel' ? 'fuelType' : `${kind}Category`;
  const type = filters[typeKey] || 'all';
  const matched = rows.filter(row => {
    const matchesQuery = !q || normalized(searchGetter(row)).includes(q);
    const matchesType = type === 'all' || String(typeGetter(row) || '') === type;
    return matchesQuery && matchesType;
  });
  const limit = Math.max(HISTORY_BATCH, Number(historyLimits[kind] || HISTORY_BATCH));
  return { total:rows.length, matched, visible:matched.slice(0,limit), hasMore:matched.length > limit };
}

function historyFooter(kind, history) {
  if (!history.hasMore) return '';
  return `<div class="history-more"><span>Mostrati ${history.visible.length} di ${history.matched.length}</span><button class="secondary compact" data-history-more="${kind}">Mostra altri ${Math.min(HISTORY_BATCH, history.matched.length-history.visible.length)}</button></div>`;
}

function refocusFilter(kind, caret=null) {
  requestAnimationFrame(() => {
    const input = app.querySelector(`[data-filter="${kind}Query"]`);
    if (!input) return;
    input.focus({preventScroll:true});
    const pos = caret ?? input.value.length;
    try { input.setSelectionRange(pos,pos); } catch {}
  });
}

function toast(message, tone = 'info') {
  const el = document.querySelector('#toast');
  if (!el) return;
  el.textContent = message;
  el.dataset.tone = tone;
  el.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove('show'), 2800);
}

async function createRecoveryPoint(reason) {
  try {
    const payload = await buildExport();
    const result = saveRecoveryPoint(payload, reason);
    if (!result.ok) toast('Punto di ripristino non creato: spazio locale insufficiente.', 'warn');
    return result.ok;
  } catch {
    toast('Punto di ripristino non disponibile.', 'warn');
    return false;
  }
}

async function openAlexTarget(target) {
  const parsed = typeof target === 'string' ? resolveActionTarget(target) : target;
  if (!parsed) return { ok:false, error:'Target AUTO non riconosciuto' };
  const requestedVehicleId = parsed.params?.vehicleId || '';
  if (requestedVehicleId && state.vehicles.some(v => v.id === requestedVehicleId)) {
    selectedVehicleId = requestedVehicleId;
    await repo.settings.save('selectedVehicleId', selectedVehicleId);
  }
  const route = parsed.route;
  if (route === 'dashboard') { view='dashboard'; render(); }
  else if (route === 'vehicles') { view='vehicles'; render(); }
  else if (route === 'fuel') { view='fuel'; render(); }
  else if (route === 'maintenance') { view='maintenance'; render(); }
  else if (route === 'costs' || route === 'deadlines') { view='costs'; render(); }
  else if (route === 'fuel/new') { view='fuel'; render(); formFuel(); }
  else if (route === 'odometer/new') { view='vehicles'; render(); formOdometer(selectedVehicleId); }
  else if (route === 'maintenance/new') { view='maintenance'; render(); formMaintenance(); }
  else if (route === 'maintenance/plan/new') { view='maintenance'; render(); formPlan(); }
  else if (route === 'component/new') { view='maintenance'; render(); formComponent(); }
  else if (route === 'costs/new') { view='costs'; render(); formCost(); }
  else if (route === 'deadlines/new') { view='costs'; render(); formDeadline(); }
  return { ok:true, moduleId:'auto', route, vehicleId:selectedVehicleId || null };
}


async function chooseVehicle(id) {
  if (!state.vehicles.some(v => v.id === id)) return;
  selectedVehicleId = id;
  await repo.settings.save('selectedVehicleId', id);
  render();
}

function vehiclePicker() {
  if (state.vehicles.length < 2) return '';
  return `<div class="vehicle-switch"><span>Veicolo attivo</span><select data-vehicle-picker>${state.vehicles.map(v => `<option value="${v.id}" ${v.id === selectedVehicleId ? 'selected' : ''}>${val(v.name)}</option>`).join('')}</select></div>`;
}

function vehicleSelect(selected = selectedVehicleId) {
  if (!state.vehicles.length) return '<p class="muted">Prima aggiungi un veicolo.</p>';
  return `<div class="field"><label>Veicolo</label><select name="vehicleId" required>${state.vehicles.map(v => `<option value="${v.id}" ${v.id === selected ? 'selected' : ''}>${val(v.name)}</option>`).join('')}</select></div>`;
}

function componentSelect(vehicleId, selected = '') {
  const rows = state.components.filter(x => x.vehicleId === vehicleId);
  return `<div class="field"><label>Componente collegato <span class="field-help">opzionale</span></label><select name="componentId"><option value="">— Nessuno —</option>${rows.map(x => `<option value="${x.id}" ${x.id === selected ? 'selected' : ''}>${val(x.name)} · ${val(x.type)}</option>`).join('')}</select></div>`;
}

function planSelect(vehicleId, selected = '') {
  const rows = state.maintenancePlans.filter(x => x.vehicleId === vehicleId && (x.active !== false && String(x.active) !== 'false'));
  return `<div class="field"><label>Piano manutenzione <span class="field-help">opzionale</span></label><select name="planId"><option value="">— Intervento libero —</option>${rows.map(x => `<option value="${x.id}" ${x.id === selected ? 'selected' : ''}>${val(x.title)}</option>`).join('')}</select></div>`;
}

function lineChart(points, digits = 2, unit = '', limit = 10) {
  const clean = (points || []).filter(x => Number.isFinite(Number(x.value)) && Number(x.value) > 0).slice(-Math.max(2, Number(limit) || 10));
  if (clean.length < 2) return '<div class="chart-empty">Servono almeno 2 dati validi.</div>';
  const values = clean.map(x => Number(x.value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 320, height = 108, padX = 8, padY = 13;
  const coords = clean.map((x, i) => {
    const px = padX + (i / (clean.length - 1)) * (width - padX * 2);
    const py = padY + (1 - (Number(x.value) - min) / range) * (height - padY * 2);
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  }).join(' ');
  return `<div class="chart-wrap"><svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafico andamento"><polyline points="${coords}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="chart-range"><span>${number(min,digits)} ${unit}</span><strong>${number(values.at(-1),digits)} ${unit}</strong><span>${number(max,digits)} ${unit}</span></div></div>`;
}

function metricCard(value, label, note = '') {
  return `<article class="card"><div class="metric">${value}</div><div class="label">${label}</div>${note ? `<div class="metric-note">${note}</div>` : ''}</article>`;
}

function monthlyBarChart(rows = []) {
  const clean = rows || [];
  if (!clean.length || !clean.some(x => Number(x.total) > 0)) return '<div class="chart-empty">Nessuna spesa nel periodo selezionato.</div>';
  const width = 360, height = 150, padX = 10, top = 12, bottom = 30;
  const chartH = height - top - bottom;
  const max = Math.max(...clean.map(x => Number(x.total) || 0), 1);
  const slot = (width - padX * 2) / clean.length;
  const barW = Math.max(3, Math.min(20, slot * .68));
  const labelsEvery = clean.length > 18 ? 4 : clean.length > 10 ? 2 : 1;
  const bars = clean.map((x,i) => {
    const v = Number(x.total) || 0;
    const h = v / max * chartH;
    const px = padX + i * slot + (slot - barW) / 2;
    const py = top + chartH - h;
    const label = i % labelsEvery === 0 || i === clean.length - 1 ? `<text x="${(px+barW/2).toFixed(1)}" y="${height-8}" text-anchor="middle" class="chart-label">${val(String(x.label || '').replace('.', ''))}</text>` : '';
    return `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1,h).toFixed(1)}" rx="3" class="chart-bar"><title>${val(x.label)}: ${money(v)}</title></rect>${label}`;
  }).join('');
  return `<div class="chart-wrap"><svg class="bar-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Spesa mensile"><line x1="${padX}" y1="${top+chartH}" x2="${width-padX}" y2="${top+chartH}" class="chart-axis"/>${bars}</svg><div class="chart-foot"><span>Massimo</span><strong>${money(max)}</strong></div></div>`;
}

function categoryBars(rows = [], total = 0) {
  if (!rows.length || total <= 0) return '<div class="chart-empty">Nessun costo da suddividere.</div>';
  return `<div class="category-bars">${rows.map(x => `<div class="category-row"><div><strong>${val(x.category)}</strong><span>${money(x.amount)} · ${number(x.amount / total * 100,0)}%</span></div><div class="bar-track"><span style="width:${Math.max(3,x.amount/total*100)}%"></span></div></div>`).join('')}</div>`;
}

function deltaChip(delta, lowerIsBetter = true) {
  if (!Number.isFinite(delta)) return '<span class="chip">confronto n/d</span>';
  const cls = Math.abs(delta) < .05 ? '' : ((delta < 0) === lowerIsBetter ? 'good' : 'warn');
  const arrow = delta > .05 ? '↑' : delta < -.05 ? '↓' : '→';
  return `<span class="chip ${cls}">${arrow} ${number(Math.abs(delta),1)}%</span>`;
}

function maintenanceStatusLabel(status) {
  if (status === 'overdue') return { text:'Scaduta', cls:'danger' };
  if (status === 'dueSoon') return { text:'Imminente', cls:'warn' };
  if (status === 'paused') return { text:'In pausa', cls:'' };
  return { text:'Regolare', cls:'' };
}

function componentStatusLabel(status) {
  if (status === 'replaceSoon') return { text:'Da sostituire', cls:'danger' };
  if (status === 'monitor') return { text:'Da controllare', cls:'warn' };
  return { text:'OK', cls:'' };
}

function dueText(m) {
  const parts = [];
  if (m.nextDueDate) parts.push(dateLabel(m.nextDueDate));
  if (m.nextDueKm) parts.push(`${number(m.nextDueKm,0)} km`);
  return parts.length ? parts.join(' · ') : 'Nessuna soglia impostata';
}

function remainingText(m) {
  const parts = [];
  if (Number.isFinite(m.daysRemaining)) parts.push(m.daysRemaining < 0 ? `${Math.abs(m.daysRemaining)} gg oltre` : `${m.daysRemaining} gg`);
  if (Number.isFinite(m.kmRemaining)) parts.push(m.kmRemaining <= 0 ? `${number(Math.abs(m.kmRemaining),0)} km oltre` : `${number(m.kmRemaining,0)} km`);
  return parts.join(' / ') || '—';
}

function renderDashboard() {
  const vehicle = selectedVehicle();
  const stats = statsFor(vehicle?.id || null);
  const analytics = dashboardAnalytics(state, vehicle?.id || null, state.vehicles, dashboardRangeMonths);
  const today = getTodaySummary(state, vehicle?.id || null);
  const hub = getHubSummary(state, vehicle?.id || null);
  const next = state.deadlines.filter(x => !x.completed && (!vehicle || x.vehicleId === vehicle.id))[0];
  const maintenance = getUpcomingMaintenance(state, vehicle?.id || null);
  const highest = analytics.highestMonth?.total > 0 ? `${analytics.highestMonth.label} · ${money(analytics.highestMonth.total)}` : '—';
  const distanceNote = analytics.loggedDistanceKm > 0 ? `${number(analytics.loggedDistanceKm,0)} km tracciati nel periodo` : 'servono letture km nel periodo';
  const ytdLabel = `${analytics.currentYear} YTD`;
  const previousYtdLabel = `${analytics.currentYear - 1} stesso periodo`;
  app.innerHTML = `
    ${vehiclePicker()}
    <section class="hero dashboard-hero"><div class="hero-top"><span class="chip ${today.priority === 'high' ? 'danger' : today.priority === 'medium' ? 'warn' : ''}">${val(today.status.toUpperCase())}</span>${vehicle ? `<span class="hero-km">${number(vehicle.currentKm,0)} km</span>` : ''}</div><h2>${vehicle ? val(vehicle.name) : 'AUTO'}</h2><p>${vehicle ? val([vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' · ')) : 'Inizia aggiungendo la tua auto.'}</p><div class="today-strip"><span>Oggi</span><strong>${val(today.shortText)}</strong></div></section>
    <div class="dashboard-toolbar"><div><h2>Dashboard</h2><p class="section-sub">Costi operativi e andamento del veicolo</p></div><div class="range-tabs">${[6,12,24].map(m => `<button class="range-tab ${dashboardRangeMonths === m ? 'active' : ''}" data-dashboard-range="${m}">${m}M</button>`).join('')}</div></div>
    <section class="grid dashboard-kpi-grid">
      ${metricCard(money(analytics.rangeTotal), `Spesa · ${analytics.rangeMonths} mesi`, `${analytics.monthsWithSpend}/${analytics.rangeMonths} mesi con movimenti`)}
      ${metricCard(money(analytics.rangeAverageMonthly), 'Media mensile', `Picco: ${highest}`)}
      ${metricCard(analytics.operatingCostPerKm ? money(analytics.operatingCostPerKm) : '—', 'Costo operativo / km', distanceNote)}
      ${metricCard(stats.tcoComplete && stats.tcoPerKm ? money(stats.tcoPerKm) : '—', 'TCO / km', stats.tcoComplete ? 'include deprezzamento' : 'serve valore attuale')}
      ${metricCard(stats.fullToFullIntervals ? `${number(stats.avgConsumption,1)} <small>L/100 km</small>` : '—', 'Consumo medio reale', stats.lastConsumption ? `Ultimo ${number(stats.lastConsumption,1)} L/100 km` : '')}
      ${metricCard(stats.weightedAvgFuelPrice ? `${number(stats.weightedAvgFuelPrice,3)} <small>€/L</small>` : '—', 'Prezzo carburante medio', stats.estimatedFullTankRangeKm ? `Autonomia ≈ ${number(stats.estimatedFullTankRangeKm,0)} km` : '')}
    </section>
    ${!stats.fullToFullIntervals && vehicle ? '<div class="info-banner">Il consumo reale comparirà dopo almeno due pieni completi. I rifornimenti parziali tra i due pieni vengono inclusi automaticamente.</div>' : ''}
    <section class="card dashboard-chart-card"><div class="section-head"><div><h3>Spesa mensile</h3><p class="section-sub">Carburante + manutenzione + costi extra effettivamente registrati</p></div>${deltaChip(analytics.monthDeltaPct)}</div>${monthlyBarChart(analytics.monthly)}<div class="compare-strip"><div><span>Mese corrente</span><strong>${money(analytics.currentMonthCost)}</strong></div><div><span>Mese precedente</span><strong>${money(analytics.previousMonthCost)}</strong></div></div></section>
    <section class="dashboard-two-col">
      <section class="card"><div class="section-head"><div><h3>Composizione spesa</h3><p class="section-sub">Periodo selezionato</p></div><span class="chip">${money(analytics.rangeTotal)}</span></div>${categoryBars(analytics.categories, analytics.rangeTotal)}</section>
      <section class="card"><div class="section-head"><div><h3>Confronto annuale</h3><p class="section-sub">Stesso intervallo dell'anno</p></div>${deltaChip(analytics.ytdDeltaPct)}</div><div class="compare-year"><div><span>${ytdLabel}</span><strong>${money(analytics.currentYtdCost)}</strong></div><div><span>${previousYtdLabel}</span><strong>${money(analytics.previousYtdCost)}</strong></div></div>${analytics.annual.length ? `<div class="annual-mini">${analytics.annual.map(x => `<div><span>${x.year}</span><strong>${money(x.total)}</strong></div>`).join('')}</div>` : ''}</section>
    </section>
    <section class="dashboard-two-col">
      <section class="card"><div class="section-head"><div><h3>Trend consumo</h3><p class="section-sub">Media full-to-full ponderata per mese</p></div><span class="chip">L/100 km</span></div>${lineChart(analytics.consumptionMonthly,1,'',dashboardRangeMonths)}</section>
      <section class="card"><div class="section-head"><div><h3>Trend carburante</h3><p class="section-sub">Prezzo medio ponderato mensile</p></div><span class="chip">€/L</span></div>${lineChart(analytics.fuelPriceMonthly,3,'',dashboardRangeMonths)}</section>
    </section>
    ${maintenance ? `<section class="card maintenance-highlight"><div><div class="label">Prossima manutenzione</div><div class="maintenance-title">${val(maintenance.title)}</div><div class="list-meta">${maintenance.date ? dateLabel(maintenance.date) : ''}${maintenance.date && maintenance.dueKm ? ' · ' : ''}${maintenance.dueKm ? `${number(maintenance.dueKm,0)} km` : ''}</div></div><div class="maintenance-right"><span class="chip ${maintenance.status === 'overdue' ? 'danger' : maintenance.status === 'dueSoon' ? 'warn' : ''}">${maintenance.status === 'overdue' ? 'SCADUTA' : maintenance.status === 'dueSoon' ? 'IMMINENTE' : 'PROGRAMMATA'}</span><button class="secondary compact" data-view-jump="maintenance">Apri</button></div></section>` : ''}
    ${vehicle?.purchaseDate ? `<section class="card tco-highlight"><div><div class="label">Total Cost of Ownership</div><div class="maintenance-title">${stats.tcoComplete ? money(stats.tcoToDate) : money(stats.operatingSincePurchase)}</div><div class="list-meta">${stats.tcoComplete ? `${money(stats.tcoMonthlyAverage)}/mese · ${money(stats.tcoPerKm)}/km` : 'Parziale: inserisci il valore attuale per includere il deprezzamento.'}</div></div><button class="secondary compact" data-view-jump="costs">Dettagli</button></section>` : ''}
    <section class="card"><h3>Riepilogo ALEX HUB</h3><div class="kpi-stack">${hub.map(x => `<div class="kpi-line"><span>${val(x.label)}</span><span>${typeof x.value === 'number' ? number(x.value,2) : val(x.value)} ${val(x.unit || '')}</span></div>`).join('')}</div></section>
    <section class="dashboard-two-col">
      <section class="card"><div class="section-head"><h3>Prossima scadenza</h3><button class="secondary compact" data-action="new-deadline">+ Aggiungi</button></div>${next ? `<div class="list-item inset"><div class="list-row"><div><div class="list-title">${val(next.title)}</div><div class="list-meta">${dateLabel(next.date)} · ${daysFromNow(next.date)} gg</div></div><span class="chip ${daysFromNow(next.date) < 0 ? 'danger' : daysFromNow(next.date) <= 14 ? 'warn' : ''}">${val(next.type || 'Scadenza')}</span></div></div>` : '<div class="empty inset">Nessuna scadenza registrata.</div>'}</section>
      <section class="card"><h3>Azioni rapide</h3><div class="actions">${getQuickActions().map(a => `<button class="${a.id === 'add-fuel' ? 'primary' : 'secondary'}" data-alex-target="${val(a.target)}">${val(a.label)}</button>`).join('')}</div></section>
    </section>`;
}

function renderVehicles() {
  app.innerHTML = `<div class="section-head"><h2>Veicoli</h2><button class="primary compact" data-action="new-vehicle">+ Veicolo</button></div><div class="list">${state.vehicles.length ? state.vehicles.map(v => {
    const st = statsFor(v.id);
    const latest = state.odometer.find(x => x.vehicleId === v.id);
    return `<article class="list-item ${v.id === selectedVehicleId ? 'selected-card' : ''}">
      <div class="list-row"><div><div class="list-title">${val(v.name)}</div><div class="list-meta">${val([v.make,v.model,v.trim,v.year].filter(Boolean).join(' · '))}${v.plate ? `<br>Targa ${val(v.plate)}` : ''}</div></div><span class="chip">${val(v.fuelType || 'Auto')}</span></div>
      <div class="vehicle-stats"><div><strong>${number(v.currentKm,0)}</strong><span>km attuali</span></div><div><strong>${st.fullToFullIntervals ? number(st.avgConsumption,1) : '—'}</strong><span>L/100 km</span></div><div><strong>${money(st.annualCost)}</strong><span>12 mesi</span></div></div>${st.tcoComplete ? `<div class="list-meta">TCO dal possesso: <strong>${money(st.tcoToDate)}</strong> · ${money(st.tcoPerKm)}/km</div>` : ''}
      ${v.tankCapacityLiters ? `<div class="list-meta">Serbatoio: ${number(v.tankCapacityLiters,1)} L${st.estimatedFullTankRangeKm ? ` · autonomia teorica ≈ ${number(st.estimatedFullTankRangeKm,0)} km` : ''}</div>` : ''}
      ${latest ? `<div class="list-meta">Ultima lettura km: ${dateLabel(latest.date)}</div>` : ''}
      <div class="actions"><button class="primary compact" data-select-vehicle="${v.id}">${v.id === selectedVehicleId ? 'Attivo' : 'Usa'}</button><button class="secondary compact" data-action="new-odometer" data-vehicle-id="${v.id}">Registra km</button><button class="secondary compact" data-edit-vehicle="${v.id}">Modifica</button><button class="danger compact" data-delete-vehicle="${v.id}">Elimina</button></div>
    </article>`;
  }).join('') : '<div class="empty">Nessun veicolo. Aggiungi la tua auto.</div>'}</div>`;
}

function renderFuel() {
  const vehicle = selectedVehicle();
  const rows = vehicleRows(state.fuel);
  const fuelHistory = filterHistoryData('fuel', rows, x => [x.date,x.station,x.fuelGrade,x.drivingContext,x.notes,x.liters,x.totalCost,x.odometerKm].filter(Boolean).join(' '), x => x.fillType === 'partial' ? 'partial' : 'full');
  const pro = fuelAnalytics(rows, { tankCapacityLiters:vehicle?.tankCapacityLiters });
  const monthMax = Math.max(...pro.monthly.map(x => x.cost), 0);
  const monthlyHtml = pro.monthly.length ? pro.monthly.map(x => `<div class="month-row"><div class="month-label"><strong>${val(x.label)}</strong><span>${x.fills} rif. · ${number(x.liters,1)} L</span></div><div class="bar-track"><span style="width:${monthMax ? Math.max(5, x.cost / monthMax * 100) : 0}%"></span></div><div class="month-value">${money(x.cost)}</div></div>`).join('') : '<div class="chart-empty">Nessun dato mensile.</div>';
  app.innerHTML = `${vehiclePicker()}
    <div class="section-head"><div><h2>Rifornimenti</h2><p class="section-sub">Analisi full-to-full e andamento carburante</p></div><button class="primary compact" data-action="new-fuel">+ Rifornimento</button></div>
    <section class="grid fuel-grid">
      ${metricCard(pro.totalFills ? number(pro.weightedAvgPrice,3) + ' <small>€/L</small>' : '—', 'Prezzo medio ponderato', pro.lastPrice ? `Ultimo ${money(pro.lastPrice)}/L` : '')}
      ${metricCard(pro.intervals ? number(pro.avgConsumption,1) + ' <small>L/100 km</small>' : '—', 'Consumo medio reale', pro.lastConsumption ? `Ultimo ${number(pro.lastConsumption,1)}` : '')}
      ${metricCard(pro.intervals ? money(pro.euroPer100) : '—', 'Costo / 100 km')}
      ${metricCard(pro.totalFills ? money(pro.avgFillCost) : '—', 'Spesa media per rifornimento')}
      ${metricCard(pro.intervals ? number(pro.avgDistancePerInterval,0) + ' <small>km</small>' : '—', 'Km medi tra pieni')}
      ${metricCard(pro.estimatedFullTankRangeKm ? '≈ ' + number(pro.estimatedFullTankRangeKm,0) + ' <small>km</small>' : '—', 'Autonomia teorica pieno')}
    </section>
    <section class="card"><div class="section-head"><h3>Consumo per intervallo</h3><span class="chip">${pro.intervals} intervalli</span></div>${lineChart(pro.consumptionTrend,1,'L/100 km')}${pro.rolling3Consumption ? `<div class="chart-foot">Media ultimi 3 intervalli <strong>${number(pro.rolling3Consumption,1)} L/100 km</strong></div>` : ''}</section>
    <section class="card"><div class="section-head"><h3>Prezzo carburante</h3><span class="chip">${pro.totalLiters ? `${number(pro.totalLiters,1)} L totali` : 'nessun dato'}</span></div>${lineChart(pro.priceTrend,3,'€/L')}${pro.totalFills ? `<div class="chart-foot"><span>Min ${money(pro.minPrice)}/L</span><strong>Media ${money(pro.weightedAvgPrice)}/L</strong><span>Max ${money(pro.maxPrice)}/L</span></div>` : ''}</section>
    <section class="card"><h3>Spesa carburante · ultimi mesi</h3><div class="month-list">${monthlyHtml}</div></section>
    ${pro.intervals ? `<section class="card"><h3>Intervalli full-to-full</h3><div class="interval-summary"><div><span>Migliore</span><strong>${number(pro.bestInterval.consumption,1)} L/100 km</strong><small>${dateLabel(pro.bestInterval.endDate)}</small></div><div><span>Peggiore</span><strong>${number(pro.worstInterval.consumption,1)} L/100 km</strong><small>${dateLabel(pro.worstInterval.endDate)}</small></div></div><div class="list inset">${pro.intervalRows.slice().reverse().slice(0,8).map(x => `<div class="mini-row interval-row"><div><strong>${number(x.consumption,1)} L/100 km</strong><span>${dateLabel(x.startDate)} → ${dateLabel(x.endDate)} · ${number(x.distanceKm,0)} km${x.partialFills ? ` · ${x.partialFills} parziali` : ''}</span></div><div class="interval-cost"><strong>${money(x.euroPer100)}</strong><span>/100 km</span></div></div>`).join('')}</div></section>` : '<div class="info-banner">Per creare il primo intervallo di consumo servono due pieni completi con chilometraggi crescenti. Eventuali rifornimenti parziali tra i due vengono sommati automaticamente.</div>'}
    <div class="section-head"><h3>Storico rifornimenti</h3><span class="muted">${rows.length} record</span></div>
    ${filterToolbar('fuel',{ query:filters.fuelQuery, type:filters.fuelType, count:`${fuelHistory.matched.length}/${rows.length}` })}
    <div class="list" data-history-list="fuel">${fuelHistory.visible.length ? fuelHistory.visible.map(x => `<article class="list-item" data-filter-item data-type="${x.fillType === 'partial' ? 'partial' : 'full'}" data-search="${searchable(x.date,x.station,x.fuelGrade,x.drivingContext,x.notes,x.liters,x.totalCost,x.odometerKm)}"><div class="list-row"><div><div class="list-title">${dateLabel(x.date)} · ${x.fillType === 'partial' ? 'Parziale' : 'Pieno completo'}</div><div class="list-meta">${number(x.liters,2)} L · ${money(x.pricePerLiter)}/L · ${number(x.odometerKm,0)} km${x.station ? ' · ' + val(x.station) : ''}${x.fuelGrade ? `<br>${val(x.fuelGrade)}` : ''}${x.drivingContext ? ` · ${val(x.drivingContext)}` : ''}</div></div><div class="amount">${money(x.totalCost)}</div></div>${x.notes ? `<div class="list-meta">${val(x.notes)}</div>` : ''}${x.receiptRef ? `<div class="document-ref">📎 ${val(x.receiptRef)}</div>` : ''}<div class="actions">${x.station ? `<a class="secondary compact" href="${mapsSearchUrl(x.station)}" target="_blank" rel="noopener">Apri in Mappe</a>` : ''}<button class="secondary compact" data-edit-fuel="${x.id}">Modifica</button><button class="danger compact" data-delete-fuel="${x.id}">Elimina</button></div></article>`).join('') : rows.length ? '<div class="empty">Nessun risultato con questi filtri.</div>' : '<div class="empty empty-action"><strong>Nessun rifornimento registrato.</strong><span>Aggiungi il primo pieno per iniziare lo storico.</span><button class="primary compact" data-action="new-fuel">+ Rifornimento</button></div>'}</div>${historyFooter('fuel', fuelHistory)}`;
}

function renderMaintenance() {
  const vehicle = selectedVehicle();
  const rows = vehicleRows(state.maintenance);
  const maintenanceHistory = filterHistoryData('maintenance', rows, x => [x.title,x.category,x.date,x.place,x.parts,x.notes,x.cost,x.odometerKm].filter(Boolean).join(' '), x => x.category || 'Altro');
  const plans = vehicleRows(state.maintenancePlans);
  const components = vehicleRows(state.components);
  const overview = maintenanceOverview(state.maintenancePlans, state.vehicles, vehicle?.id || null);
  const attentionComponents = components.filter(x => x.status === 'monitor' || x.status === 'replaceSoon').length;
  const maintenance12m = rows.filter(x => x.date && new Date(`${x.date}T12:00:00`).getTime() >= Date.now() - 365*86400000).reduce((s,x) => s + Number(x.cost || 0),0);

  const displayedPlans = [...overview.sorted, ...overview.rows.filter(x => !x.active)];
  const plansHtml = plans.length ? displayedPlans.map(p => {
    const badge = maintenanceStatusLabel(p.status);
    const component = componentById(p.componentId);
    return `<article class="list-item plan-card ${p.status === 'overdue' ? 'plan-overdue' : p.status === 'dueSoon' ? 'plan-soon' : ''}">
      <div class="list-row"><div><div class="list-title">${val(p.title)}</div><div class="list-meta">${val(p.category || 'Manutenzione')}${component ? ` · ${val(component.name)}` : ''}</div></div><span class="chip ${badge.cls}">${badge.text}</span></div>
      <div class="plan-due"><div><span>Prossima soglia</span><strong>${dueText(p)}</strong></div><div><span>Residuo</span><strong>${remainingText(p)}</strong></div></div>
      ${p.lastServiceDate || p.lastServiceKm ? `<div class="list-meta">Ultimo intervento: ${p.lastServiceDate ? dateLabel(p.lastServiceDate) : '—'}${p.lastServiceKm ? ` · ${number(p.lastServiceKm,0)} km` : ''}</div>` : ''}
      ${p.notes ? `<div class="list-meta">${val(p.notes)}</div>` : ''}
      <div class="actions"><button class="primary compact" data-service-plan="${p.id}">Registra intervento</button><button class="secondary compact" data-edit-plan="${p.id}">Modifica</button><button class="secondary compact" data-toggle-plan="${p.id}">${p.active === false || String(p.active) === 'false' ? 'Riattiva' : 'Pausa'}</button><button class="danger compact" data-delete-plan="${p.id}">Elimina</button></div>
    </article>`;
  }).join('') : '<div class="empty">Nessun piano programmato. Crea tagliandi o controlli con intervallo in km e/o mesi.</div>';

  const componentHtml = components.length ? components.map(c => {
    const badge = componentStatusLabel(c.status);
    return `<article class="list-item"><div class="list-row"><div><div class="list-title">${val(c.name)}</div><div class="list-meta">${val(c.type)}${c.location ? ` · ${val(c.location)}` : ''}${c.brand ? `<br>${val(c.brand)}${c.model ? ` ${val(c.model)}` : ''}` : ''}</div></div><span class="chip ${badge.cls}">${badge.text}</span></div>${c.installedDate || c.installedKm ? `<div class="list-meta">Installato: ${c.installedDate ? dateLabel(c.installedDate) : '—'}${c.installedKm ? ` · ${number(c.installedKm,0)} km` : ''}</div>` : ''}${c.documentRef ? `<div class="document-ref">📎 ${val(c.documentRef)}</div>` : ''}${c.notes ? `<div class="list-meta">${val(c.notes)}</div>` : ''}<div class="actions"><button class="secondary compact" data-service-component="${c.id}">Intervento</button><button class="secondary compact" data-edit-component="${c.id}">Modifica</button><button class="danger compact" data-delete-component="${c.id}">Elimina</button></div></article>`;
  }).join('') : '<div class="empty">Nessun componente monitorato. Puoi aggiungere pneumatici, freni, batteria, filtri e altri elementi.</div>';

  app.innerHTML = `${vehiclePicker()}
    <div class="section-head"><div><h2>Manutenzione</h2><p class="section-sub">Programmazione per data e chilometraggio</p></div><button class="primary compact" data-action="new-maintenance">+ Intervento</button></div>
    <section class="grid maintenance-grid">
      ${metricCard(String(overview.active.length), 'Piani attivi')}
      ${metricCard(String(overview.overdueCount + overview.dueSoonCount), 'Da gestire', overview.overdueCount ? `${overview.overdueCount} scaduti` : '')}
      ${metricCard(money(maintenance12m), 'Spesa manutenzione 12 mesi')}
      ${metricCard(String(attentionComponents), 'Componenti da controllare')}
    </section>
    <section class="card"><div class="section-head"><div><h3>Piani manutenzione</h3><p class="section-sub">Scadenze tecniche automatiche, senza duplicare “Scadenze”</p></div><button class="secondary compact" data-action="new-plan">+ Piano</button></div><div class="list inset">${plansHtml}</div></section>
    <section class="card"><div class="section-head"><h3>Componenti</h3><button class="secondary compact" data-action="new-component">+ Componente</button></div><div class="list inset">${componentHtml}</div></section>
    <div class="section-head"><div><h3>Storico interventi</h3><p class="section-sub">${rows.length} interventi registrati</p></div></div>
    ${filterToolbar('maintenance',{ query:filters.maintenanceQuery, type:filters.maintenanceCategory, categories:[...new Set(rows.map(x => x.category).filter(Boolean))].sort(), count:`${maintenanceHistory.matched.length}/${rows.length}` })}
    <div class="list" data-history-list="maintenance">${maintenanceHistory.visible.length ? maintenanceHistory.visible.map(x => {
      const plan = planById(x.planId); const component = componentById(x.componentId);
      return `<article class="list-item" data-filter-item data-type="${val(x.category || 'Altro')}" data-search="${searchable(x.title,x.category,x.date,x.place,x.parts,x.notes,x.cost,x.odometerKm)}"><div class="list-row"><div><div class="list-title">${val(x.title)}</div><div class="list-meta">${dateLabel(x.date)} · ${val(x.category)}${x.odometerKm ? ` · ${number(x.odometerKm,0)} km` : ''}${plan ? `<br>Piano: ${val(plan.title)}` : ''}${component ? ` · ${val(component.name)}` : ''}</div></div><div class="amount">${money(x.cost)}</div></div>${x.parts ? `<div class="document-ref">Ricambi/lavori: ${val(x.parts)}</div>` : ''}${x.notes ? `<div class="list-meta">${val(x.notes)}</div>` : ''}${x.documentRef ? `<div class="document-ref">📎 ${val(x.documentRef)}</div>` : ''}<div class="actions">${x.place ? `<a class="secondary compact" href="${mapsSearchUrl(x.place)}" target="_blank" rel="noopener">Mappe</a>` : ''}<button class="secondary compact" data-edit-maintenance="${x.id}">Modifica</button><button class="danger compact" data-delete-maintenance="${x.id}">Elimina</button></div></article>`;
    }).join('') : rows.length ? '<div class="empty">Nessun risultato con questi filtri.</div>' : '<div class="empty">Nessun intervento registrato per questo veicolo.</div>'}</div>${historyFooter('maintenance', maintenanceHistory)}`;
}

function diagnosticsMarkup() {
  if (!diagnosticsReport) return '<div class="diagnostics-empty">Esegui il controllo prima della 1.0 o dopo un import importante.</div>';
  const statusLabel = diagnosticsReport.status === 'ok' ? 'Tutto OK' : diagnosticsReport.status === 'warning' ? 'Con avvisi' : 'Da controllare';
  const statusClass = diagnosticsReport.status === 'ok' ? 'good' : diagnosticsReport.status === 'warning' ? 'warn' : 'danger';
  return `<div class="diagnostics-summary"><span class="chip ${statusClass}">${statusLabel}</span><span>${new Date(diagnosticsReport.generatedAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}</span></div><div class="diagnostics-list">${diagnosticsReport.checks.map(c => `<div class="diagnostic-row"><span>${c.ok ? '✓' : '!'}</span><div><strong>${val(c.label)}</strong><small>${val(c.detail)}</small></div></div>`).join('')}</div>${diagnosticsReport.integrity.warnings.length ? `<div class="info-banner">${diagnosticsReport.integrity.warnings.length} avvisi dati non bloccanti. Il backup resta esportabile.</div>` : ''}${diagnosticsReport.integrity.errors.length ? `<div class="error-banner">${val(diagnosticsReport.integrity.errors.slice(0,3).join(' · '))}</div>` : ''}`;
}

function renderCosts() {
  const vehicle = selectedVehicle();
  const stats = statsFor(vehicle?.id || null);
  const costs = vehicleRows(state.costs);
  const costsHistory = filterHistoryData('costs', costs, x => [x.title,x.category,x.date,x.merchant,x.notes,x.amount].filter(Boolean).join(' '), x => x.category || 'Altro');
  const recurring = vehicleRows(state.recurringCosts);
  const activeDeadlines = vehicleRows(state.deadlines).filter(x => !x.completed);
  const odo = vehicleRows(state.odometer).slice(0,12);
  const breakdown = stats.tcoBreakdown || [];
  const breakdownMax = Math.max(...breakdown.map(x => x.amount), 0);
  const breakdownHtml = breakdown.length ? breakdown.map(x => `<div class="cost-break-row"><div><strong>${val(x.category)}</strong><span>${money(x.amount)}</span></div><div class="bar-track"><span style="width:${breakdownMax ? Math.max(4,x.amount/breakdownMax*100) : 0}%"></span></div></div>`).join('') : '<div class="chart-empty">Registra costi per costruire la composizione del TCO.</div>';
  const recurringHtml = recurring.length ? recurring.map(x => {
    const next = nextRecurringOccurrence(x, todayIso());
    const months = recurrenceMonths(x);
    return `<article class="list-item"><div class="list-row"><div><div class="list-title">${val(x.title)}</div><div class="list-meta">${val(x.category || 'Altro')} · ogni ${months === 1 ? 'mese' : months === 12 ? 'anno' : `${months} mesi`}${next ? `<br>Prossimo: ${dateLabel(next)}` : ''}</div></div><div class="amount">${money(x.amount)}</div></div><div class="list-meta">Equivalente annuo: ${money(annualizedRecurringAmount(x))}${x.active === false || String(x.active) === 'false' ? ' · IN PAUSA' : ''}</div><div class="actions"><button class="secondary compact" data-edit-recurring-cost="${x.id}">Modifica</button><button class="secondary compact" data-toggle-recurring-cost="${x.id}">${x.active === false || String(x.active) === 'false' ? 'Riattiva' : 'Pausa'}</button><button class="danger compact" data-delete-recurring-cost="${x.id}">Elimina piano</button></div></article>`;
  }).join('') : '<div class="empty">Nessun costo ricorrente. Puoi registrare assicurazione, bollo, garage e altri costi periodici.</div>';

  app.innerHTML = `${vehiclePicker()}
    <div class="section-head"><div><h2>Costi & TCO</h2><p class="section-sub">Cassa reale, ricorrenze e costo economico di possesso</p></div><button class="primary compact" data-action="new-cost">+ Costo</button></div>
    <section class="grid cost-grid">
      ${metricCard(money(stats.monthlyCost), 'Spese effettive · 30 gg')}
      ${metricCard(money(stats.annualCost), 'Spese effettive · 365 gg')}
      ${metricCard(money(stats.recurringMonthlyCost), 'Ricorrenti · mese', 'equivalente programmato')}
      ${metricCard(money(stats.recurringAnnualCost), 'Ricorrenti · anno', 'equivalente programmato')}
      ${metricCard(vehicle?.purchaseDate ? money(stats.tcoToDate) : '—', 'TCO dal possesso', stats.tcoComplete ? 'incl. deprezzamento' : 'parziale')}
      ${metricCard(stats.tcoComplete && stats.tcoPerKm ? money(stats.tcoPerKm) : '—', 'TCO / km')}
    </section>
    ${vehicle?.purchaseDate && !stats.tcoComplete ? '<div class="info-banner">Per il TCO completo inserisci nella scheda veicolo il valore attuale stimato. Fino ad allora AUTO mostra solo i costi operativi e gli eventuali oneri di finanziamento.</div>' : ''}
    <section class="card"><div class="section-head"><h3>Composizione TCO</h3><span class="chip">${vehicle?.purchaseDate ? `${number(stats.finance.ownedMonths,1)} mesi` : 'acquisto non impostato'}</span></div><div class="tco-grid"><div><span>Costi operativi dal possesso</span><strong>${money(stats.operatingSincePurchase)}</strong></div><div><span>Deprezzamento</span><strong>${stats.finance.depreciationAvailable ? money(stats.finance.depreciation) : '—'}</strong></div><div><span>Oneri finanziari stimati maturati</span><strong>${money(stats.finance.financeChargesToDate)}</strong></div><div><span>Media TCO mensile</span><strong>${stats.tcoComplete ? money(stats.tcoMonthlyAverage) : '—'}</strong></div></div><div class="cost-breakdown">${breakdownHtml}</div></section>
    <section class="card"><div class="section-head"><div><h3>Costi ricorrenti</h3><p class="section-sub">Le occorrenze scadute vengono registrate automaticamente quando apri AUTO.</p></div><button class="secondary compact" data-action="new-recurring-cost">+ Ricorrente</button></div><div class="list inset">${recurringHtml}</div></section>
    <section class="card"><div class="section-head"><h3>Storico costi extra</h3><span class="muted">${costs.length} record</span></div>${filterToolbar('costs',{ query:filters.costsQuery, type:filters.costsCategory, categories:[...new Set(costs.map(x => x.category || 'Altro'))].sort(), count:`${costsHistory.matched.length}/${costs.length}` })}<div class="list inset" data-history-list="costs">${costsHistory.visible.length ? costsHistory.visible.map(x => `<article class="list-item" data-filter-item data-type="${val(x.category || 'Altro')}" data-search="${searchable(x.title,x.category,x.date,x.merchant,x.notes,x.amount)}"><div class="list-row"><div><div class="list-title">${val(x.title)}</div><div class="list-meta">${dateLabel(x.date)} · ${val(x.category || 'Altro')}${x.merchant ? ` · ${val(x.merchant)}` : ''}</div></div><div class="amount">${money(x.amount)}</div></div>${x.source === 'recurring' ? '<span class="chip">AUTO</span>' : ''}${x.documentRef ? `<div class="document-ref">📎 ${val(x.documentRef)}</div>` : ''}${x.notes ? `<div class="list-meta">${val(x.notes)}</div>` : ''}<div class="actions"><button class="secondary compact" data-edit-cost="${x.id}">Modifica</button>${x.source === 'recurring' ? '' : `<button class="danger compact" data-delete-cost="${x.id}">Elimina</button>`}</div></article>`).join('') : costs.length ? '<div class="empty">Nessun risultato con questi filtri.</div>' : '<div class="empty empty-action"><strong>Nessun costo extra.</strong><span>Registra una spesa per iniziare lo storico economico.</span><button class="primary compact" data-action="new-cost">+ Costo</button></div>'}</div>${historyFooter('costs', costsHistory)}</section>
    <section class="card"><div class="section-head"><h3>Scadenze amministrative</h3><button class="secondary compact" data-action="new-deadline">+ Scadenza</button></div><div class="list inset">${activeDeadlines.length ? activeDeadlines.map(x => `<div class="list-item"><div class="list-row"><div><div class="list-title">${val(x.title)}</div><div class="list-meta">${dateLabel(x.date)} · ${val(x.type || 'Scadenza')}</div></div><span class="chip ${daysFromNow(x.date) < 0 ? 'danger' : daysFromNow(x.date) <= 14 ? 'warn' : ''}">${daysFromNow(x.date) < 0 ? 'Scaduta' : daysFromNow(x.date) + ' gg'}</span></div><div class="actions"><button class="secondary compact" data-edit-deadline="${x.id}">Modifica</button><button class="secondary compact" data-complete-deadline="${x.id}">Completata</button><button class="danger compact" data-delete-deadline="${x.id}">Elimina</button></div></div>`).join('') : '<div class="empty">Nessuna scadenza attiva.</div>'}</div></section>
    <section class="card"><div class="section-head"><h3>Storico chilometraggio</h3><button class="secondary compact" data-action="new-odometer">+ Km</button></div><div class="list inset">${odo.length ? odo.map(x => `<div class="mini-row"><div><strong>${number(x.km,0)} km</strong><span>${dateLabel(x.date)} · ${val(x.source === 'fuel' ? 'Rifornimento' : x.source === 'maintenance' ? 'Manutenzione' : 'Manuale')}</span></div>${x.source === 'manual' ? `<button class="danger compact" data-delete-odometer="${x.id}">Elimina</button>` : ''}</div>`).join('') : '<div class="empty">Nessuna lettura chilometrica.</div>'}</div></section>
    <section class="card"><div class="section-head"><div><h3>Backup & ripristino</h3><p class="section-sub">Export ALEX completo + rete di sicurezza locale</p></div><span class="chip">offline</span></div><p class="muted">Prima di importazioni e cancellazioni AUTO prova a conservare automaticamente l'ultimo stato nel dispositivo. Il punto locale è una rete di sicurezza, non sostituisce l'export JSON.</p><div class="recovery-status" data-recovery-status></div><div class="actions"><button class="secondary" data-action="export">Esporta JSON</button><button class="secondary" data-action="import">Importa JSON</button><button class="secondary" data-action="recovery-save">Crea punto ripristino</button><button class="secondary" data-action="recovery-restore">Ripristina ultimo</button></div></section>
    <section class="card"><div class="section-head"><div><h3>Diagnostica PWA</h3><p class="section-sub">Integrità, offline e storage prima della release</p></div><button class="secondary compact" data-action="diagnostics">Esegui controllo</button></div><div data-diagnostics>${diagnosticsMarkup()}</div></section>
    <section class="card"><h3>ALEX HUB Integration</h3><p class="muted">Contratto v${MODULE.contractVersion} · bridge v${MODULE.integrationVersion} · ${getModuleManifest().routes.length} target supportati. AUTO espone summary, insights, eventi e quick actions senza dipendere da HUB.</p><div class="kpi-stack"><div class="kpi-line"><span>Modulo</span><span>${MODULE.moduleId}</span></div><div class="kpi-line"><span>Schema dati</span><span>${MODULE.schemaVersion}</span></div><div class="kpi-line"><span>Bridge runtime</span><span>window.AlexAuto</span></div></div></section>
    <section class="card"><h3>Milestone</h3><p class="muted">AUTO v${MODULE.appVersion} · schemaVersion ${MODULE.schemaVersion} · offline-first.</p></section>`;
}

function render() {
  document.querySelectorAll('.nav-btn').forEach(b => { const active = b.dataset.view === view; b.classList.toggle('active', active); if (active) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
  ({ dashboard:renderDashboard, vehicles:renderVehicles, fuel:renderFuel, maintenance:renderMaintenance, costs:renderCosts }[view] || renderDashboard)();
  const recoveryEl = app.querySelector('[data-recovery-status]');
  if (recoveryEl) {
    const recovery = readRecoveryPoint();
    recoveryEl.innerHTML = recovery ? `<span>Ultimo punto: <strong>${dateLabel(recovery.savedAt.slice(0,10))} · ${new Date(recovery.savedAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}</strong> · ${val(recovery.reason || 'manuale')}${recovery.stale ? ' · <em>datato</em>' : ''}</span><button class="ghost compact" data-action="recovery-clear">Rimuovi</button>` : '<span>Nessun punto di ripristino locale.</span>';
  }
}

function openModal(title, html, onSubmit) {
  modalTitle.textContent = title;
  modalBody.innerHTML = `<div class="form-grid">${html}</div>`;
  const wrap = document.querySelector('#modalFormWrap');
  wrap.onsubmit = async (e) => {
    e.preventDefault();
    const submitter = e.submitter;
    if (submitter?.value === 'cancel') { modal.close(); return; }
    const saveBtn = submitter || wrap.querySelector('.primary');
    try {
      if (saveBtn) { saveBtn.disabled = true; saveBtn.dataset.originalText = saveBtn.textContent; saveBtn.textContent = 'Salvataggio…'; }
      const fd = new FormData(wrap);
      await onSubmit(Object.fromEntries(fd.entries()));
      modal.close();
      await load();
      render();
      toast('Salvato.', 'success');
    } catch (err) {
      toast(`Salvataggio non riuscito: ${err?.message || 'errore inatteso'}`, 'error');
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || 'Salva'; }
    }
  };
  modal.showModal();
  requestAnimationFrame(() => modalBody.querySelector('input:not([type="hidden"]), select, textarea, button')?.focus({preventScroll:true}));
}

function formVehicle(vehicle = null) {
  const v = vehicle || {};
  openModal(vehicle ? 'Modifica veicolo' : 'Nuovo veicolo', `
    <div class="field"><label>Nome veicolo</label><input name="name" value="${val(v.name)}" placeholder="es. Golf GTI" required></div>
    <div class="two"><div class="field"><label>Marca</label><input name="make" value="${val(v.make)}"></div><div class="field"><label>Modello</label><input name="model" value="${val(v.model)}"></div></div>
    <div class="two"><div class="field"><label>Versione / allestimento</label><input name="trim" value="${val(v.trim)}"></div><div class="field"><label>Anno</label><input name="year" type="number" min="1900" max="2100" value="${val(v.year)}"></div></div>
    <div class="two"><div class="field"><label>Targa</label><input name="plate" value="${val(v.plate)}" autocapitalize="characters"></div><div class="field"><label>VIN / telaio</label><input name="vin" value="${val(v.vin)}"></div></div>
    <div class="two"><div class="field"><label>Prima immatricolazione</label><input name="registrationDate" type="date" value="${val(v.registrationDate)}"></div><div class="field"><label>Km attuali</label><input name="currentKm" type="number" min="0" value="${Number(v.currentKm || 0)}"></div></div>
    <div class="field"><label>Alimentazione</label><select name="fuelType">${['Benzina','Diesel','GPL','Metano','Ibrida','Plug-in hybrid','Elettrica','Altro'].map(x => `<option ${v.fuelType === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    <div class="two"><div class="field"><label>Cilindrata cc</label><input name="engineCc" type="number" min="0" value="${Number(v.engineCc || 0)}"></div><div class="field"><label>Potenza kW</label><input name="powerKw" type="number" min="0" step="0.1" value="${Number(v.powerKw || 0)}"></div></div>
    <div class="two"><div class="field"><label>Serbatoio litri</label><input name="tankCapacityLiters" type="number" min="0" step="0.1" value="${Number(v.tankCapacityLiters || 0)}" placeholder="es. 50"></div><div class="field"><label>Cambio</label><input name="transmission" value="${val(v.transmission)}" placeholder="Manuale / Automatico"></div></div>
    <div class="field"><label>Colore</label><input name="color" value="${val(v.color)}"></div>
    <div class="divider"></div><div class="subhead">Acquisto & valore</div>
    <div class="two"><div class="field"><label>Data acquisto</label><input name="purchaseDate" type="date" value="${val(v.purchaseDate)}"></div><div class="field"><label>Prezzo acquisto €</label><input name="purchasePrice" type="number" min="0" step="0.01" value="${Number(v.purchasePrice || 0)}"></div></div>
    <div class="two"><div class="field"><label>Km all'acquisto</label><input name="purchaseKm" type="number" min="0" value="${Number(v.purchaseKm || 0)}"></div><div class="field"><label>Valore attuale stimato €</label><input name="estimatedValue" type="number" min="0" step="0.01" value="${Number(v.estimatedValue || 0)}"></div></div>
    <div class="field"><label>Data valutazione</label><input name="valuationDate" type="date" value="${val(v.valuationDate)}"></div>
    <div class="divider"></div><div class="subhead">Pagamento / finanziamento</div>
    <div class="field"><label>Modalità</label><select name="financeType"><option value="cash" ${!v.financeType || v.financeType === 'cash' ? 'selected' : ''}>Acquisto diretto</option><option value="loan" ${v.financeType === 'loan' ? 'selected' : ''}>Finanziamento</option><option value="lease" ${v.financeType === 'lease' ? 'selected' : ''}>Leasing / formula rateale</option></select></div>
    <div class="two"><div class="field"><label>Anticipo €</label><input name="downPayment" type="number" min="0" step="0.01" value="${Number(v.downPayment || 0)}"></div><div class="field"><label>Importo finanziato €</label><input name="financedAmount" type="number" min="0" step="0.01" value="${Number(v.financedAmount || 0)}"></div></div>
    <div class="two"><div class="field"><label>Inizio</label><input name="financeStartDate" type="date" value="${val(v.financeStartDate || v.purchaseDate)}"></div><div class="field"><label>Durata mesi</label><input name="financeMonths" type="number" min="0" step="1" value="${Number(v.financeMonths || 0)}"></div></div>
    <div class="two"><div class="field"><label>Rata mensile €</label><input name="financeMonthlyPayment" type="number" min="0" step="0.01" value="${Number(v.financeMonthlyPayment || 0)}"></div><div class="field"><label>TAN/APR % <span class="field-help">informativo</span></label><input name="financeAprPct" type="number" min="0" step="0.01" value="${Number(v.financeAprPct || 0)}"></div></div>
    <div class="two"><div class="field"><label>Maxi rata finale €</label><input name="balloonPayment" type="number" min="0" step="0.01" value="${Number(v.balloonPayment || 0)}"></div><div class="field"><label>Spese finanziamento €</label><input name="financeFees" type="number" min="0" step="0.01" value="${Number(v.financeFees || 0)}"></div></div>
    <div class="field"><label>Note</label><textarea name="notes">${val(v.notes)}</textarea></div>
    <div class="form-actions"><button value="cancel" class="ghost">Annulla</button><button class="primary">Salva</button></div>`, async d => {
      const saved = { ...v, ...d, year:d.year ? Number(d.year) : '', currentKm:Number(d.currentKm || 0), engineCc:Number(d.engineCc || 0), powerKw:Number(d.powerKw || 0), tankCapacityLiters:Number(d.tankCapacityLiters || 0), purchasePrice:Number(d.purchasePrice || 0), purchaseKm:Number(d.purchaseKm || 0), estimatedValue:Number(d.estimatedValue || 0), downPayment:Number(d.downPayment || 0), financedAmount:Number(d.financedAmount || 0), financeMonths:Number(d.financeMonths || 0), financeMonthlyPayment:Number(d.financeMonthlyPayment || 0), financeAprPct:Number(d.financeAprPct || 0), balloonPayment:Number(d.balloonPayment || 0), financeFees:Number(d.financeFees || 0) };
      validateVehiclePayload(saved, state);
      const savedId = await repo.vehicles.save(saved);
      if (!vehicle && savedId) await repo.settings.save('selectedVehicleId', savedId);
    });
}

function formOdometer(vehicleId = selectedVehicleId) {
  if (!state.vehicles.length) { formVehicle(); return; }
  const vehicle = state.vehicles.find(v => v.id === vehicleId) || selectedVehicle();
  openModal('Registra chilometraggio', `${vehicleSelect(vehicle?.id)}<div class="two"><div class="field"><label>Data</label><input name="date" type="date" value="${todayIso()}" required></div><div class="field"><label>Chilometri</label><input name="km" type="number" min="0" step="1" value="${Number(vehicle?.currentKm || 0)}" required></div></div><div class="field"><label>Note</label><textarea name="notes" placeholder="es. lettura cruscotto"></textarea></div><div class="form-actions"><button value="cancel" class="ghost">Annulla</button><button class="primary">Salva</button></div>`, async d => {
    const km = Number(d.km);
    validateOdometerPayload({ ...d, km }, state);
    await repo.odometer.save({ ...d, km, source:'manual' });
    const v = state.vehicles.find(v => v.id === d.vehicleId);
    if (v && km > Number(v.currentKm || 0)) await repo.vehicles.save({ ...v, currentKm:km });
  });
}

function formFuel(entry = null) {
  if (!state.vehicles.length) { formVehicle(); return; }
  const x = entry || {};
  const vehicle = state.vehicles.find(v => v.id === x.vehicleId) || selectedVehicle();
  openModal(entry ? 'Modifica rifornimento' : 'Aggiungi rifornimento', `${vehicleSelect(vehicle?.id)}
    <div class="two"><div class="field"><label>Data</label><input name="date" type="date" value="${val(x.date || todayIso())}" required></div><div class="field"><label>Km odometro</label><input name="odometerKm" type="number" min="0" value="${x.odometerKm ?? Number(vehicle?.currentKm || 0)}" required></div></div>
    <div class="field"><label>Tipo rifornimento</label><select name="fillType"><option value="full" ${x.fillType !== 'partial' ? 'selected' : ''}>Pieno completo</option><option value="partial" ${x.fillType === 'partial' ? 'selected' : ''}>Rifornimento parziale</option></select></div>
    <div class="two"><div class="field"><label>Litri</label><input name="liters" type="number" step="0.01" min="0.01" value="${x.liters ?? ''}" required></div><div class="field"><label>Prezzo/L</label><input name="pricePerLiter" type="number" step="0.001" min="0" value="${x.pricePerLiter ?? ''}" required></div></div>
    <div class="field"><label>Costo totale € <span class="field-help">se vuoto = litri × prezzo/L</span></label><input name="totalCost" type="number" step="0.01" min="0" value="${x.totalCost ?? ''}"></div>
    <div class="two"><div class="field"><label>Carburante / specifica</label><input name="fuelGrade" value="${val(x.fuelGrade)}" placeholder="es. Benzina 95 E5"></div><div class="field"><label>Uso prevalente</label><select name="drivingContext"><option value="">—</option>${['Città','Misto','Extraurbano','Autostrada'].map(c => `<option ${x.drivingContext === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
    <div class="field"><label>Distributore / luogo</label><input name="station" value="${val(x.station)}" placeholder="es. Q8 Via Roma"></div>
    <div class="field"><label>Riferimento ricevuta in File</label><input name="receiptRef" value="${val(x.receiptRef)}" placeholder="Nome file, cartella o link condiviso"></div>
    <div class="field"><label>Note</label><textarea name="notes">${val(x.notes)}</textarea></div>
    <div class="form-actions"><button value="cancel" class="ghost">Annulla</button><button class="primary">Salva</button></div>`, async d => {
      const liters = Number(d.liters), ppl = Number(d.pricePerLiter), km = Number(d.odometerKm);
      const payload = { ...x, ...d, odometerKm:km, liters, pricePerLiter:ppl, totalCost:Number(d.totalCost || liters * ppl) };
      const existingSourceId = String(x.id || '');
      const existingOdoBeforeSave = existingSourceId ? state.odometer.find(o => o.source === 'fuel' && o.sourceId === existingSourceId) : null;
      validateFuelPayload(payload, state, { ignoreOdometerId:existingOdoBeforeSave?.id || '' });
      const savedId = await repo.fuel.save(payload);
      const sourceId = String(x.id || savedId || '');
      const existingOdo = state.odometer.find(o => o.source === 'fuel' && o.sourceId === sourceId);
      await repo.odometer.save({ ...(existingOdo || {}), vehicleId:d.vehicleId, date:d.date, km, source:'fuel', sourceId });
      const v = state.vehicles.find(v => v.id === d.vehicleId);
      if (v && km > Number(v.currentKm || 0)) await repo.vehicles.save({ ...v, currentKm:km });
    });
}

function formMaintenance(entry = null, defaults = {}) {
  if (!state.vehicles.length) { formVehicle(); return; }
  const x = { ...(entry || {}), ...defaults };
  const vehicle = state.vehicles.find(v => v.id === x.vehicleId) || selectedVehicle();
  const linkedPlan = planById(x.planId);
  const category = x.category || linkedPlan?.category || 'Tagliando';
  const title = x.title || linkedPlan?.title || '';
  openModal(entry ? 'Modifica intervento' : 'Registra intervento', `${vehicleSelect(vehicle?.id)}
    ${planSelect(vehicle?.id, x.planId || '')}
    ${componentSelect(vehicle?.id, x.componentId || linkedPlan?.componentId || '')}
    <div class="field"><label>Titolo</label><input name="title" value="${val(title)}" placeholder="es. Tagliando 60.000 km" required></div>
    <div class="two"><div class="field"><label>Categoria</label><select name="category">${['Tagliando','Olio e filtri','Olio','Filtro olio','Filtro aria','Filtro abitacolo','Pneumatici','Freni','Batteria','Cinghia / distribuzione','Liquidi','Controllo','Riparazione','Altro'].map(c => `<option ${category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div class="field"><label>Data</label><input name="date" type="date" value="${val(x.date || todayIso())}" required></div></div>
    <div class="two"><div class="field"><label>Costo</label><input name="cost" type="number" step="0.01" min="0" value="${Number(x.cost || 0)}"></div><div class="field"><label>Km</label><input name="odometerKm" type="number" min="0" value="${x.odometerKm ?? Number(vehicle?.currentKm || 0)}"></div></div>
    <div class="field"><label>Ricambi / lavori eseguiti</label><textarea name="parts" placeholder="es. olio 5W30, filtro olio, filtro aria">${val(x.parts)}</textarea></div>
    <div class="field"><label>Officina / luogo</label><input name="place" value="${val(x.place)}"></div>
    <div class="field"><label>Riferimento documento in File</label><input name="documentRef" value="${val(x.documentRef)}" placeholder="Nome file, cartella o link condiviso"></div>
    <div class="field"><label>Note</label><textarea name="notes">${val(x.notes)}</textarea></div>
    <div class="form-actions"><button value="cancel" class="ghost">Annulla</button><button class="primary">Salva</button></div>`, async d => {
      const km = Number(d.odometerKm || 0);
      const maintenancePayload = { ...entry, ...d, cost:Number(d.cost || 0), odometerKm:km };
      const existingSourceId = String(entry?.id || '');
      const existingOdoBeforeSave = existingSourceId ? state.odometer.find(o => o.source === 'maintenance' && o.sourceId === existingSourceId) : null;
      validateMaintenancePayload(maintenancePayload, state, { ignoreOdometerId:existingOdoBeforeSave?.id || '' });
      const savedId = await repo.maintenance.save(maintenancePayload);
      const sourceId = String(entry?.id || savedId || '');
      const existingOdo = state.odometer.find(o => o.source === 'maintenance' && o.sourceId === sourceId);
      if (km > 0) {
        await repo.odometer.save({ ...(existingOdo || {}), vehicleId:d.vehicleId, date:d.date, km, source:'maintenance', sourceId });
        const v = state.vehicles.find(v => v.id === d.vehicleId);
        if (v && km > Number(v.currentKm || 0)) await repo.vehicles.save({ ...v, currentKm:km });
      } else if (existingOdo) {
        await repo.odometer.remove(existingOdo.id);
      }
      if (d.planId) {
        const plan = planById(d.planId);
        if (plan && (!plan.lastServiceDate || d.date >= plan.lastServiceDate)) {
          const due = nextPlanDueValues(plan, d.date, km);
          await repo.maintenancePlans.save({ ...plan, ...due, active:true });
        }
      }
      if (d.componentId) {
        const component = componentById(d.componentId);
        if (component && (!component.lastServiceDate || d.date >= component.lastServiceDate)) {
          await repo.components.save({ ...component, lastServiceDate:d.date, lastServiceKm:km });
        }
      }
    });
}

function formPlan(plan = null) {
  if (!state.vehicles.length) { formVehicle(); return; }
  const x = normalizeMaintenancePlan(plan || {});
  const vehicle = state.vehicles.find(v => v.id === x.vehicleId) || selectedVehicle();
  const active = plan ? x.active : true;
  openModal(plan ? 'Modifica piano' : 'Nuovo piano manutenzione', `${vehicleSelect(vehicle?.id)}
    <div class="field"><label>Nome piano</label><input name="title" value="${val(x.title)}" placeholder="es. Tagliando motore" required></div>
    <div class="two"><div class="field"><label>Categoria</label><select name="category">${['Tagliando','Olio e filtri','Pneumatici','Freni','Batteria','Cinghia / distribuzione','Liquidi','Controllo','Altro'].map(c => `<option ${x.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div class="field"><label>Stato</label><select name="active"><option value="true" ${active ? 'selected' : ''}>Attivo</option><option value="false" ${!active ? 'selected' : ''}>In pausa</option></select></div></div>
    ${componentSelect(vehicle?.id, x.componentId || '')}
    <div class="divider"></div><div class="subhead">Intervallo</div>
    <div class="two"><div class="field"><label>Ogni km</label><input name="intervalKm" type="number" min="0" step="100" value="${Number(x.intervalKm || 0)}" placeholder="es. 15000"></div><div class="field"><label>Ogni mesi</label><input name="intervalMonths" type="number" min="0" step="1" value="${Number(x.intervalMonths || 0)}" placeholder="es. 12"></div></div>
    <div class="divider"></div><div class="subhead">Ultimo intervento</div>
    <div class="two"><div class="field"><label>Data</label><input name="lastServiceDate" type="date" value="${val(x.lastServiceDate)}"></div><div class="field"><label>Km</label><input name="lastServiceKm" type="number" min="0" value="${Number(x.lastServiceKm || 0)}"></div></div>
    <div class="divider"></div><div class="subhead">Prossima soglia <span class="field-help">se vuota viene calcolata dall'intervallo</span></div>
    <div class="two"><div class="field"><label>Data</label><input name="nextDueDate" type="date" value="${val(x.nextDueDate)}"></div><div class="field"><label>Km</label><input name="nextDueKm" type="number" min="0" value="${Number(x.nextDueKm || 0)}"></div></div>
    <div class="two"><div class="field"><label>Avvisa prima · giorni</label><input name="warningDays" type="number" min="0" value="${Number(x.warningDays || 30)}"></div><div class="field"><label>Avvisa prima · km</label><input name="warningKm" type="number" min="0" value="${Number(x.warningKm || 1000)}"></div></div>
    <div class="field"><label>Priorità</label><select name="priority"><option value="medium" ${x.priority === 'medium' || !x.priority ? 'selected' : ''}>Media</option><option value="high" ${x.priority === 'high' ? 'selected' : ''}>Alta</option><option value="low" ${x.priority === 'low' ? 'selected' : ''}>Bassa</option></select></div>
    <div class="field"><label>Note</label><textarea name="notes">${val(x.notes)}</textarea></div>
    <div class="form-actions"><button value="cancel" class="ghost">Annulla</button><button class="primary">Salva piano</button></div>`, async d => {
      const base = {
        ...plan, ...d,
        active:d.active === 'true',
        intervalKm:Number(d.intervalKm || 0), intervalMonths:Number(d.intervalMonths || 0),
        lastServiceKm:Number(d.lastServiceKm || 0), nextDueKm:Number(d.nextDueKm || 0),
        warningDays:Number(d.warningDays || 30), warningKm:Number(d.warningKm || 1000)
      };
      const normalized = normalizeMaintenancePlan(base);
      validateMaintenancePlanPayload(normalized, state);
      await repo.maintenancePlans.save(normalized);
    });
}

function formComponent(component = null) {
  if (!state.vehicles.length) { formVehicle(); return; }
  const x = component || {};
  const vehicle = state.vehicles.find(v => v.id === x.vehicleId) || selectedVehicle();
  openModal(component ? 'Modifica componente' : 'Nuovo componente', `${vehicleSelect(vehicle?.id)}
    <div class="field"><label>Nome</label><input name="name" value="${val(x.name)}" placeholder="es. Pneumatici estivi" required></div>
    <div class="two"><div class="field"><label>Tipo</label><select name="type">${['Pneumatici','Freni','Batteria','Olio','Filtro olio','Filtro aria','Filtro abitacolo','Cinghia / distribuzione','Liquidi','Altro'].map(c => `<option ${x.type === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div class="field"><label>Posizione</label><input name="location" value="${val(x.location)}" placeholder="es. Anteriore / Tutti"></div></div>
    <div class="two"><div class="field"><label>Marca</label><input name="brand" value="${val(x.brand)}"></div><div class="field"><label>Modello / specifica</label><input name="model" value="${val(x.model)}"></div></div>
    <div class="two"><div class="field"><label>Data installazione</label><input name="installedDate" type="date" value="${val(x.installedDate)}"></div><div class="field"><label>Km installazione</label><input name="installedKm" type="number" min="0" value="${Number(x.installedKm || 0)}"></div></div>
    <div class="field"><label>Stato</label><select name="status"><option value="ok" ${!x.status || x.status === 'ok' ? 'selected' : ''}>OK</option><option value="monitor" ${x.status === 'monitor' ? 'selected' : ''}>Da controllare</option><option value="replaceSoon" ${x.status === 'replaceSoon' ? 'selected' : ''}>Da sostituire</option></select></div>
    <div class="field"><label>Riferimento documento in File</label><input name="documentRef" value="${val(x.documentRef)}" placeholder="es. fattura gomme.pdf"></div>
    <div class="field"><label>Note</label><textarea name="notes">${val(x.notes)}</textarea></div>
    <div class="form-actions"><button value="cancel" class="ghost">Annulla</button><button class="primary">Salva</button></div>`, async d => { const payload = { ...component, ...d, installedKm:Number(d.installedKm || 0) }; validateComponentPayload(payload, state); await repo.components.save(payload); });
}

function formCost(entry = null) {
  if (!state.vehicles.length) { formVehicle(); return; }
  const x = entry || {};
  openModal(entry ? 'Modifica costo' : 'Aggiungi costo', `${vehicleSelect(x.vehicleId || selectedVehicleId)}
    <div class="field"><label>Titolo</label><input name="title" value="${val(x.title)}" placeholder="es. Assicurazione annuale" required></div>
    <div class="two"><div class="field"><label>Categoria</label><select name="category">${['Assicurazione','Bollo','Revisione','Parcheggio','Garage','Pedaggi','Lavaggio','Accessori','Soccorso','Altro'].map(c => `<option ${x.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div class="field"><label>Data</label><input name="date" type="date" value="${val(x.date || todayIso())}" required></div></div>
    <div class="field"><label>Importo €</label><input name="amount" type="number" min="0" step="0.01" value="${Number(x.amount || 0)}" required></div>
    <div class="field"><label>Fornitore / luogo</label><input name="merchant" value="${val(x.merchant)}" placeholder="es. compagnia assicurativa"></div>
    <div class="field"><label>Riferimento documento in File</label><input name="documentRef" value="${val(x.documentRef)}" placeholder="Nome file, cartella o link condiviso"></div>
    <div class="field"><label>Note</label><textarea name="notes">${val(x.notes)}</textarea></div>
    <div class="form-actions"><button value="cancel" class="ghost">Annulla</button><button class="primary">Salva</button></div>`, async d => { const payload = { ...entry, ...d, amount:Number(d.amount || 0), source:entry?.source || 'manual' }; validateCostPayload(payload, state); await repo.costs.save(payload); });
}

function formRecurringCost(plan = null) {
  if (!state.vehicles.length) { formVehicle(); return; }
  const x = plan || {};
  openModal(plan ? 'Modifica costo ricorrente' : 'Nuovo costo ricorrente', `${vehicleSelect(x.vehicleId || selectedVehicleId)}
    <div class="field"><label>Titolo</label><input name="title" value="${val(x.title)}" placeholder="es. Assicurazione" required></div>
    <div class="two"><div class="field"><label>Categoria</label><select name="category">${['Assicurazione','Bollo','Revisione','Parcheggio','Garage','Pedaggi','Lavaggio','Accessori','Soccorso','Altro'].map(c => `<option ${x.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div class="field"><label>Importo €</label><input name="amount" type="number" min="0" step="0.01" value="${Number(x.amount || 0)}" required></div></div>
    <div class="two"><div class="field"><label>Frequenza</label><select name="frequency"><option value="monthly" ${x.frequency === 'monthly' ? 'selected' : ''}>Mensile</option><option value="quarterly" ${x.frequency === 'quarterly' ? 'selected' : ''}>Ogni 3 mesi</option><option value="semiannual" ${x.frequency === 'semiannual' ? 'selected' : ''}>Ogni 6 mesi</option><option value="annual" ${!x.frequency || x.frequency === 'annual' ? 'selected' : ''}>Annuale</option><option value="custom" ${x.frequency === 'custom' ? 'selected' : ''}>Intervallo personalizzato</option></select></div><div class="field"><label>Ogni N mesi <span class="field-help">solo personalizzato</span></label><input name="intervalMonths" type="number" min="1" step="1" value="${Number(x.intervalMonths || 1)}"></div></div>
    <div class="two"><div class="field"><label>Prima occorrenza</label><input name="startDate" type="date" value="${val(x.startDate || todayIso())}" required></div><div class="field"><label>Fine <span class="field-help">opzionale</span></label><input name="endDate" type="date" value="${val(x.endDate)}"></div></div>
    <div class="field"><label>Stato</label><select name="active"><option value="true" ${x.active !== false && String(x.active) !== 'false' ? 'selected' : ''}>Attivo</option><option value="false" ${x.active === false || String(x.active) === 'false' ? 'selected' : ''}>In pausa</option></select></div>
    <div class="field"><label>Fornitore</label><input name="merchant" value="${val(x.merchant)}"></div>
    <div class="field"><label>Note</label><textarea name="notes">${val(x.notes)}</textarea></div>
    <div class="info-banner">AUTO crea le occorrenze dovute fino alla data corrente senza duplicati. Modificare un piano non altera le spese storiche già registrate.</div>
    <div class="form-actions"><button value="cancel" class="ghost">Annulla</button><button class="primary">Salva piano</button></div>`, async d => { const payload = { ...plan, ...d, amount:Number(d.amount || 0), intervalMonths:Number(d.intervalMonths || 1), active:d.active === 'true' }; validateRecurringCostPayload(payload, state); await repo.recurringCosts.save(payload); });
}

function formDeadline(deadline = null) {
  if (!state.vehicles.length) { formVehicle(); return; }
  const x = deadline || {};
  openModal(deadline ? 'Modifica scadenza' : 'Nuova scadenza', `${vehicleSelect(x.vehicleId || selectedVehicleId)}<div class="field"><label>Titolo</label><input name="title" value="${val(x.title)}" placeholder="es. Scadenza assicurazione" required></div><div class="two"><div class="field"><label>Tipo</label><select name="type">${['Assicurazione','Bollo','Revisione','Altro'].map(c => `<option ${x.type === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div class="field"><label>Data</label><input name="date" type="date" value="${val(x.date)}" required></div></div><div class="field"><label>Priorità</label><select name="priority"><option value="medium" ${!x.priority || x.priority === 'medium' ? 'selected' : ''}>Media</option><option value="high" ${x.priority === 'high' ? 'selected' : ''}>Alta</option><option value="low" ${x.priority === 'low' ? 'selected' : ''}>Bassa</option></select></div><div class="field"><label>Note</label><textarea name="notes">${val(x.notes)}</textarea></div><div class="form-actions"><button value="cancel" class="ghost">Annulla</button><button class="primary">Salva</button></div>`, async d => { const payload = { ...deadline, ...d, completed:deadline?.completed || false }; validateDeadlinePayload(payload, state); await repo.deadlines.save(payload); });
}

async function recalcPlanAfterMaintenanceDelete(entry) {
  if (!entry?.planId) return;
  const plan = planById(entry.planId);
  if (!plan) return;
  const remaining = state.maintenance.filter(x => x.id !== entry.id && x.planId === entry.planId).sort((a,b) => String(b.date).localeCompare(String(a.date)) || Number(b.odometerKm) - Number(a.odometerKm));
  const latest = remaining[0];
  if (latest) {
    const due = nextPlanDueValues(plan, latest.date, Number(latest.odometerKm || 0));
    await repo.maintenancePlans.save({ ...plan, ...due });
  }
}

async function deleteItem(kind, id) {
  if (!confirm('Eliminare questo elemento?')) return;
  await createRecoveryPoint(`prima eliminazione ${kind}`);
  const deletedMaintenance = kind === 'maintenance' ? state.maintenance.find(x => x.id === id) : null;
  await repo[kind].remove(id);
  if (kind === 'fuel' || kind === 'maintenance') {
    const sources = state.odometer.filter(x => x.sourceId === id);
    await Promise.all(sources.map(x => repo.odometer.remove(x.id)));
  }
  if (deletedMaintenance) await recalcPlanAfterMaintenanceDelete(deletedMaintenance);
  await load();
  render();
}

async function deletePlan(id) {
  const linked = state.maintenance.filter(x => x.planId === id).length;
  if (!confirm(`Eliminare questo piano? Lo storico di ${linked} interventi collegati resterà conservato.`)) return;
  await createRecoveryPoint('prima eliminazione piano manutenzione');
  await repo.maintenancePlans.remove(id);
  await load(); render();
}

async function deleteComponent(id) {
  const linkedPlans = state.maintenancePlans.filter(x => x.componentId === id).length;
  const linkedHistory = state.maintenance.filter(x => x.componentId === id).length;
  if (!confirm(`Eliminare questo componente? ${linkedPlans} piani e ${linkedHistory} interventi conserveranno lo storico ma perderanno il collegamento visuale.`)) return;
  await createRecoveryPoint('prima eliminazione componente');
  await repo.components.remove(id);
  await load(); render();
}

async function deleteRecurringCost(id) {
  const plan = recurringCostById(id);
  if (!plan) return;
  const generated = state.costs.filter(x => x.recurringCostId === id).length;
  if (!confirm(`Eliminare il piano ricorrente "${plan.title}"? Le ${generated} spese già registrate resteranno nello storico.`)) return;
  await createRecoveryPoint('prima eliminazione costo ricorrente');
  await repo.recurringCosts.remove(id);
  await load(); render();
}

async function deleteVehicle(id) {
  const v = state.vehicles.find(x => x.id === id);
  if (!v) return;
  const related = state.fuel.filter(x => x.vehicleId === id).length + state.maintenance.filter(x => x.vehicleId === id).length + state.maintenancePlans.filter(x => x.vehicleId === id).length + state.components.filter(x => x.vehicleId === id).length + state.costs.filter(x => x.vehicleId === id).length + state.recurringCosts.filter(x => x.vehicleId === id).length + state.deadlines.filter(x => x.vehicleId === id).length + state.odometer.filter(x => x.vehicleId === id).length;
  if (!confirm(`Eliminare ${v.name}? Verranno eliminati anche ${related} record collegati.`)) return;
  await createRecoveryPoint('prima eliminazione veicolo');
  await Promise.all([
    ...state.fuel.filter(x => x.vehicleId === id).map(x => repo.fuel.remove(x.id)),
    ...state.maintenance.filter(x => x.vehicleId === id).map(x => repo.maintenance.remove(x.id)),
    ...state.maintenancePlans.filter(x => x.vehicleId === id).map(x => repo.maintenancePlans.remove(x.id)),
    ...state.components.filter(x => x.vehicleId === id).map(x => repo.components.remove(x.id)),
    ...state.costs.filter(x => x.vehicleId === id).map(x => repo.costs.remove(x.id)),
    ...state.recurringCosts.filter(x => x.vehicleId === id).map(x => repo.recurringCosts.remove(x.id)),
    ...state.deadlines.filter(x => x.vehicleId === id).map(x => repo.deadlines.remove(x.id)),
    ...state.odometer.filter(x => x.vehicleId === id).map(x => repo.odometer.remove(x.id))
  ]);
  await repo.vehicles.remove(id);
  await load();
  render();
}

app.addEventListener('input', e => {
  const input = e.target.closest('[data-filter$="Query"]');
  if (!input) return;
  const key = input.dataset.filter;
  const kind = key.replace(/Query$/, '');
  const caret = input.selectionStart;
  filters[key] = input.value;
  historyLimits[kind] = HISTORY_BATCH;
  render();
  refocusFilter(kind, caret);
});

app.addEventListener('change', async e => {
  const p = e.target.closest('[data-vehicle-picker]');
  if (p) { await chooseVehicle(p.value); return; }
  const filter = e.target.closest('select[data-filter]');
  if (filter) {
    filters[filter.dataset.filter] = filter.value;
    const kind = filter.dataset.filter.replace(/(?:Type|Category)$/, '');
    historyLimits[kind] = HISTORY_BATCH;
    render();
  }
});

app.addEventListener('click', async e => {
  const t = e.target.closest('button,a');
  if (!t) return;
  if (t.dataset.clearFilter) {
    const kind = t.dataset.clearFilter;
    filters[`${kind}Query`] = '';
    if (`${kind}Type` in filters) filters[`${kind}Type`] = 'all';
    if (`${kind}Category` in filters) filters[`${kind}Category`] = 'all';
    historyLimits[kind] = HISTORY_BATCH;
    render();
    return;
  }
  if (t.dataset.historyMore) { const kind = t.dataset.historyMore; historyLimits[kind] = Number(historyLimits[kind] || HISTORY_BATCH) + HISTORY_BATCH; render(); return; }
  if (t.dataset.alexTarget) { await openAlexTarget(t.dataset.alexTarget); return; }
  if (t.dataset.viewJump) { view = t.dataset.viewJump; render(); return; }
  if (t.dataset.dashboardRange) { dashboardRangeMonths = Number(t.dataset.dashboardRange) || 12; render(); return; }
  if (t.dataset.action === 'new-vehicle') formVehicle();
  if (t.dataset.action === 'new-odometer') formOdometer(t.dataset.vehicleId || selectedVehicleId);
  if (t.dataset.action === 'new-fuel') formFuel();
  if (t.dataset.action === 'new-maintenance') formMaintenance();
  if (t.dataset.action === 'new-plan') formPlan();
  if (t.dataset.action === 'new-component') formComponent();
  if (t.dataset.action === 'new-cost') formCost();
  if (t.dataset.action === 'new-recurring-cost') formRecurringCost();
  if (t.dataset.action === 'new-deadline') formDeadline();
  if (t.dataset.action === 'export') { await downloadExport(); toast('Backup JSON esportato.', 'success'); }
  if (t.dataset.action === 'import') importFile.click();
  if (t.dataset.action === 'diagnostics') { diagnosticsReport = await runDiagnostics(state); render(); toast(diagnosticsReport.status === 'ok' ? 'Diagnostica completata: tutto OK.' : 'Diagnostica completata: controlla gli avvisi.', diagnosticsReport.status === 'ok' ? 'success' : 'warn'); }
  if (t.dataset.action === 'recovery-save') { const ok = await createRecoveryPoint('manuale'); if (ok) { toast('Punto di ripristino creato.', 'success'); render(); } }
  if (t.dataset.action === 'recovery-clear') { if (confirm('Rimuovere il punto di ripristino locale?')) { clearRecoveryPoint(); toast('Punto di ripristino rimosso.'); render(); } }
  if (t.dataset.action === 'recovery-restore') {
    const recovery = readRecoveryPoint();
    if (!recovery) { toast('Nessun punto di ripristino disponibile.', 'warn'); return; }
    if (!confirm(`Ripristinare lo stato salvato il ${new Date(recovery.savedAt).toLocaleString('it-IT')}? I dati attuali verranno sostituiti.`)) return;
    await createRecoveryPoint('prima del ripristino');
    await importPayload(recovery.payload);
    await load(); render(); toast('Ripristino completato.', 'success');
  }
  if (t.dataset.editVehicle) { const v = state.vehicles.find(x => x.id === t.dataset.editVehicle); if (v) formVehicle(v); }
  if (t.dataset.editFuel) { const x = state.fuel.find(f => f.id === t.dataset.editFuel); if (x) formFuel(x); }
  if (t.dataset.editMaintenance) { const x = state.maintenance.find(f => f.id === t.dataset.editMaintenance); if (x) formMaintenance(x); }
  if (t.dataset.editPlan) { const x = planById(t.dataset.editPlan); if (x) formPlan(x); }
  if (t.dataset.editComponent) { const x = componentById(t.dataset.editComponent); if (x) formComponent(x); }
  if (t.dataset.editCost) { const x = state.costs.find(c => c.id === t.dataset.editCost); if (x) formCost(x); }
  if (t.dataset.editRecurringCost) { const x = recurringCostById(t.dataset.editRecurringCost); if (x) formRecurringCost(x); }
  if (t.dataset.editDeadline) { const x = state.deadlines.find(d => d.id === t.dataset.editDeadline); if (x) formDeadline(x); }
  if (t.dataset.servicePlan) { const p = planById(t.dataset.servicePlan); if (p) formMaintenance(null,{ vehicleId:p.vehicleId, planId:p.id, componentId:p.componentId || '', title:p.title, category:p.category }); }
  if (t.dataset.serviceComponent) { const c = componentById(t.dataset.serviceComponent); if (c) formMaintenance(null,{ vehicleId:c.vehicleId, componentId:c.id, title:`Intervento ${c.name}`, category:c.type }); }
  if (t.dataset.toggleRecurringCost) { const p = recurringCostById(t.dataset.toggleRecurringCost); if (p) { await repo.recurringCosts.save({ ...p, active:!(p.active !== false && String(p.active) !== 'false') }); await load(); render(); } }
  if (t.dataset.togglePlan) { const p = planById(t.dataset.togglePlan); if (p) { await repo.maintenancePlans.save({ ...p, active:!(p.active !== false && String(p.active) !== 'false') }); await load(); render(); } }
  if (t.dataset.selectVehicle) await chooseVehicle(t.dataset.selectVehicle);
  if (t.dataset.deleteVehicle) await deleteVehicle(t.dataset.deleteVehicle);
  if (t.dataset.deleteFuel) await deleteItem('fuel', t.dataset.deleteFuel);
  if (t.dataset.deleteMaintenance) await deleteItem('maintenance', t.dataset.deleteMaintenance);
  if (t.dataset.deletePlan) await deletePlan(t.dataset.deletePlan);
  if (t.dataset.deleteComponent) await deleteComponent(t.dataset.deleteComponent);
  if (t.dataset.deleteCost) await deleteItem('costs', t.dataset.deleteCost);
  if (t.dataset.deleteRecurringCost) await deleteRecurringCost(t.dataset.deleteRecurringCost);
  if (t.dataset.deleteDeadline) await deleteItem('deadlines', t.dataset.deleteDeadline);
  if (t.dataset.deleteOdometer) await deleteItem('odometer', t.dataset.deleteOdometer);
  if (t.dataset.completeDeadline) {
    const x = state.deadlines.find(d => d.id === t.dataset.completeDeadline);
    if (x) { await repo.deadlines.save({ ...x, completed:true }); await load(); render(); }
  }
});

document.querySelector('.bottom-nav').addEventListener('click', e => {
  const b = e.target.closest('[data-view]');
  if (!b) return;
  view = b.dataset.view;
  render();
});
quickFuelBtn.addEventListener('click', () => formFuel());
importFile.addEventListener('change', async () => {
  const f = importFile.files?.[0];
  if (!f) return;
  try {
    const payload = JSON.parse(await f.text());
    await createRecoveryPoint('prima import JSON');
    await importPayload(payload);
    await load();
    render();
    toast('Import completato.', 'success');
  } catch (err) {
    toast(`Import non riuscito: ${err.message}`, 'error');
  } finally {
    importFile.value = '';
  }
});

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.error));
const incomingAlexTarget = readIncomingTarget();
await load();
render();
installAlexBridge({ getState:() => state, getVehicleId:() => selectedVehicleId || null, openTarget:openAlexTarget });
if (incomingAlexTarget) { await openAlexTarget(incomingAlexTarget); clearIncomingTarget(); }

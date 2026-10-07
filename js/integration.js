import { MODULE } from './config.js';
import { getTodaySummary, getHubSummary, getInsights, getEvents, getQuickActions, getUpcomingMaintenance } from './contracts.js';

export const ALEX_ROUTES = Object.freeze([
  { route:'dashboard', target:'auto://dashboard', kind:'view', label:'Home AUTO' },
  { route:'vehicles', target:'auto://vehicles', kind:'view', label:'Veicoli' },
  { route:'fuel', target:'auto://fuel', kind:'view', label:'Rifornimenti' },
  { route:'fuel/new', target:'auto://fuel/new', kind:'action', label:'Aggiungi rifornimento' },
  { route:'odometer/new', target:'auto://odometer/new', kind:'action', label:'Registra km' },
  { route:'maintenance', target:'auto://maintenance', kind:'view', label:'Manutenzione' },
  { route:'maintenance/new', target:'auto://maintenance/new', kind:'action', label:'Registra manutenzione' },
  { route:'maintenance/plan/new', target:'auto://maintenance/plan/new', kind:'action', label:'Nuovo piano manutenzione' },
  { route:'component/new', target:'auto://component/new', kind:'action', label:'Nuovo componente' },
  { route:'costs', target:'auto://costs', kind:'view', label:'Costi & TCO' },
  { route:'costs/new', target:'auto://costs/new', kind:'action', label:'Aggiungi costo' },
  { route:'deadlines', target:'auto://deadlines', kind:'view', label:'Scadenze' },
  { route:'deadlines/new', target:'auto://deadlines/new', kind:'action', label:'Aggiungi scadenza' }
]);

const ROUTE_SET = new Set(ALEX_ROUTES.map(x => x.route));

export function getModuleManifest() {
  return {
    moduleId: MODULE.moduleId,
    appVersion: MODULE.appVersion,
    schemaVersion: MODULE.schemaVersion,
    contractVersion: MODULE.contractVersion,
    integrationVersion: MODULE.integrationVersion,
    namespace: MODULE.namespace,
    name: 'AUTO',
    offlineFirst: true,
    standalone: true,
    contracts: ['today','insights','hubSummary','events','quickActions','upcomingMaintenance'],
    capabilities: ['vehicles','odometer','fuel','maintenance','maintenancePlans','components','costs','recurringCosts','deadlines','tco','backup','historyFilters','localRecovery','accessibilityHardening','strictValidation','pwaDiagnostics','progressiveHistory','atomicImport'],
    routes: ALEX_ROUTES.map(x => ({ ...x })),
    privacy: { transport:'local-only', crossOriginDataSharing:false }
  };
}

function parseParams(query = '') {
  const params = {};
  const qs = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  for (const [k,v] of qs.entries()) params[k] = v;
  return params;
}

export function resolveActionTarget(target) {
  if (!target) return null;
  const raw = String(target).trim();
  let route = '';
  let query = '';

  if (raw.startsWith('auto://')) {
    const body = raw.slice('auto://'.length);
    const i = body.indexOf('?');
    route = (i >= 0 ? body.slice(0,i) : body).replace(/^\/+|\/+$/g,'');
    query = i >= 0 ? body.slice(i+1) : '';
  } else if (raw.startsWith('auto:')) {
    const body = raw.slice('auto:'.length).replace(/^\/+/, '');
    const i = body.indexOf('?');
    route = (i >= 0 ? body.slice(0,i) : body).replace(/^\/+|\/+$/g,'');
    query = i >= 0 ? body.slice(i+1) : '';
  } else {
    const i = raw.indexOf('?');
    route = (i >= 0 ? raw.slice(0,i) : raw).replace(/^\/+|\/+$/g,'');
    query = i >= 0 ? raw.slice(i+1) : '';
  }

  if (!route) route = 'dashboard';
  if (!ROUTE_SET.has(route)) return null;
  return { moduleId:MODULE.moduleId, route, params:parseParams(query), target:`auto://${route}${query ? `?${query}` : ''}` };
}

export function targetToWebUrl(target, baseUrl) {
  const parsed = resolveActionTarget(target);
  if (!parsed) return null;
  const base = baseUrl || (typeof location !== 'undefined' ? location.href : 'https://example.invalid/');
  const url = new URL(base);
  url.searchParams.set('alexTarget', parsed.target);
  url.hash = '';
  return url.toString();
}

export function readIncomingTarget(urlLike) {
  const value = urlLike || (typeof location !== 'undefined' ? location.href : '');
  if (!value) return null;
  try {
    const url = new URL(value, 'https://example.invalid/');
    const direct = url.searchParams.get('alexTarget') || url.searchParams.get('target');
    if (direct) return resolveActionTarget(direct);
    const hash = String(url.hash || '').replace(/^#/, '');
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      const fromHash = hashParams.get('alexTarget') || hashParams.get('target');
      if (fromHash) return resolveActionTarget(fromHash);
      if (hash.startsWith('auto://') || hash.startsWith('auto:')) return resolveActionTarget(hash);
    }
  } catch (_) {}
  return null;
}

export function clearIncomingTarget() {
  if (typeof location === 'undefined' || typeof history === 'undefined') return;
  try {
    const url = new URL(location.href);
    let changed = false;
    for (const key of ['alexTarget','target']) if (url.searchParams.has(key)) { url.searchParams.delete(key); changed = true; }
    const hash = String(url.hash || '').replace(/^#/, '');
    if (hash) {
      const hp = new URLSearchParams(hash);
      if (hp.has('alexTarget') || hp.has('target') || hash.startsWith('auto:')) { url.hash = ''; changed = true; }
    }
    if (changed) history.replaceState(history.state, '', url.toString());
  } catch (_) {}
}

export function buildBridgeSnapshot(state, vehicleId = null) {
  const vehicle = (state.vehicles || []).find(x => x.id === vehicleId) || null;
  return {
    module: getModuleManifest(),
    generatedAt: new Date().toISOString(),
    context: { vehicleId:vehicle?.id || null, vehicleName:vehicle?.name || null },
    today: getTodaySummary(state, vehicleId),
    hubSummary: getHubSummary(state, vehicleId),
    upcomingMaintenance: getUpcomingMaintenance(state, vehicleId),
    insights: getInsights(state, vehicleId),
    events: getEvents(state),
    quickActions: getQuickActions()
  };
}

export function installAlexBridge({ getState, getVehicleId, openTarget }) {
  if (typeof window === 'undefined') return null;
  const bridge = Object.freeze({
    manifest: getModuleManifest(),
    describe: () => getModuleManifest(),
    getTodaySummary: () => getTodaySummary(getState(), getVehicleId()),
    getHubSummary: () => getHubSummary(getState(), getVehicleId()),
    getInsights: () => getInsights(getState(), getVehicleId()),
    getEvents: () => getEvents(getState()),
    getQuickActions: () => getQuickActions(),
    getUpcomingMaintenance: () => getUpcomingMaintenance(getState(), getVehicleId()),
    getSnapshot: () => buildBridgeSnapshot(getState(), getVehicleId()),
    resolveTarget: resolveActionTarget,
    open: target => openTarget(target)
  });

  window.AlexModules = window.AlexModules || {};
  window.AlexModules[MODULE.moduleId] = bridge;
  window.AlexAuto = bridge;

  const onMessage = async event => {
    // Per privacy, risponde solo a richieste provenienti dalla stessa origin.
    if (event.origin !== window.location.origin || !event.data || event.data.type !== 'alex:module:request') return;
    if (event.data.moduleId && event.data.moduleId !== MODULE.moduleId) return;
    const requestId = event.data.requestId || null;
    const operation = event.data.operation || 'getSnapshot';
    let result = null;
    let error = null;
    try {
      if (operation === 'describe') result = bridge.describe();
      else if (operation === 'getSnapshot') result = bridge.getSnapshot();
      else if (operation === 'getTodaySummary') result = bridge.getTodaySummary();
      else if (operation === 'getHubSummary') result = bridge.getHubSummary();
      else if (operation === 'getInsights') result = bridge.getInsights();
      else if (operation === 'getEvents') result = bridge.getEvents();
      else if (operation === 'getQuickActions') result = bridge.getQuickActions();
      else if (operation === 'open') result = await bridge.open(event.data.target);
      else throw new Error('Operazione bridge non supportata.');
    } catch (e) { error = e?.message || String(e); }
    const payload = { type:'alex:module:response', moduleId:MODULE.moduleId, requestId, operation, result, error };
    if (event.source && typeof event.source.postMessage === 'function') event.source.postMessage(payload, event.origin);
  };
  window.addEventListener('message', onMessage);
  window.dispatchEvent(new CustomEvent('alex:module-ready', { detail:getModuleManifest() }));
  return bridge;
}

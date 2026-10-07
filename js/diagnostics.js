import { MODULE } from './config.js';
import { inspectSnapshotIntegrity } from './validation.js';

function humanBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'n/d';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024**2) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1024**2).toFixed(1)} MB`;
}

export async function runDiagnostics(state, env = globalThis) {
  const integrity = inspectSnapshotIntegrity(state || {});
  let storage = null;
  try {
    const estimate = await env.navigator?.storage?.estimate?.();
    if (estimate) storage = { usage:estimate.usage || 0, quota:estimate.quota || 0, usageLabel:humanBytes(estimate.usage || 0), quotaLabel:humanBytes(estimate.quota || 0), pct:estimate.quota ? estimate.usage / estimate.quota * 100 : 0 };
  } catch {}
  let swRegistration = null;
  try { swRegistration = await env.navigator?.serviceWorker?.getRegistration?.(); } catch {}
  const checks = [
    { id:'integrity', label:'Integrità dati', ok:integrity.errors.length === 0, detail:integrity.errors.length ? `${integrity.errors.length} errori` : integrity.warnings.length ? `${integrity.warnings.length} avvisi` : 'OK' },
    { id:'indexeddb', label:'IndexedDB', ok:Boolean(env.indexedDB), detail:env.indexedDB ? 'Disponibile' : 'Non disponibile' },
    { id:'serviceWorker', label:'Service worker', ok:Boolean(env.navigator?.serviceWorker), detail:swRegistration ? 'Registrato' : env.navigator?.serviceWorker ? 'Supportato · non ancora controllante' : 'Non supportato' },
    { id:'secure', label:'Contesto sicuro', ok:env.isSecureContext !== false, detail:env.isSecureContext === false ? 'HTTPS richiesto per alcune funzioni PWA' : 'OK' },
    { id:'online', label:'Rete', ok:true, detail:env.navigator?.onLine === false ? 'Offline · funzioni essenziali locali disponibili' : 'Online' }
  ];
  if (storage) checks.push({ id:'storage', label:'Spazio locale', ok:storage.pct < 90, detail:`${storage.usageLabel} / ${storage.quotaLabel}${storage.pct ? ` · ${storage.pct.toFixed(1)}%` : ''}` });
  const hardFailures = checks.filter(x => !x.ok).length;
  return {
    generatedAt:new Date().toISOString(),
    appVersion:MODULE.appVersion,
    schemaVersion:MODULE.schemaVersion,
    status:integrity.errors.length || hardFailures ? 'attention' : integrity.warnings.length ? 'warning' : 'ok',
    checks,
    integrity,
    storage
  };
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULE, DB_CONFIG } from '../js/config.js';
import { getModuleManifest, ALEX_ROUTES } from '../js/integration.js';
import { migratePayload, validateImport } from '../js/export-import.js';
import { inspectSnapshotIntegrity } from '../js/validation.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

assert(MODULE.moduleId === 'auto', 'moduleId mismatch');
assert(MODULE.appVersion === '1.0.0-rc', 'config version mismatch');
assert(MODULE.schemaVersion === 5, 'schemaVersion changed unexpectedly');
for (const store of Object.values(DB_CONFIG.stores)) assert(store.startsWith('alex.auto.'), `invalid namespace: ${store}`);

const alex = JSON.parse(await fs.readFile(path.join(root,'alex-module.json'),'utf8'));
const runtime = getModuleManifest();
assert(alex.appVersion === MODULE.appVersion, 'alex-module appVersion mismatch');
assert(alex.schemaVersion === MODULE.schemaVersion, 'alex-module schema mismatch');
assert(alex.routes.length === ALEX_ROUTES.length, 'route count mismatch');
assert(runtime.capabilities.includes('atomicImport'), 'runtime atomicImport capability missing');
assert(alex.capabilities.includes('atomicImport'), 'static atomicImport capability missing');

const sw = await fs.readFile(path.join(root,'sw.js'),'utf8');
assert(sw.includes(`alex-auto-v${MODULE.appVersion}`), 'service worker cache version mismatch');
const assetMatch = sw.match(/const ASSETS=\[(.*?)\];/s);
assert(assetMatch, 'service worker asset list not found');
const assets = [...assetMatch[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);
for (const asset of assets) {
  if (asset === './') continue;
  const rel = asset.replace(/^\.\//,'');
  await fs.access(path.join(root,rel));
}

const dbSource = await fs.readFile(path.join(root,'js/db.js'),'utf8');
const dataSource = await fs.readFile(path.join(root,'js/data.js'),'utf8');
assert(dbSource.includes('replaceAllAtomic'), 'atomic database replacement missing');
assert(dbSource.includes("database.transaction(storeNames, 'readwrite')"), 'multi-store transaction missing');
assert(dataSource.includes('db.replaceAllAtomic(map)'), 'snapshot replacement is not atomic');
assert(dbSource.includes('database.onversionchange = () => database.close()'), 'versionchange handling missing');

const legacy = {
  moduleId:'auto', appVersion:'0.1.0', schemaVersion:1, exportedAt:'2026-01-01T00:00:00.000Z',
  settings:[], metadata:[],
  data:{
    vehicles:[{id:'veh1',name:'Auto',currentKm:10000,fuelType:'benzina'}],
    fuel:[{id:'fuel1',vehicleId:'veh1',date:'2026-01-01',odometerKm:9000,liters:40,pricePerLiter:1.8,totalCost:72}],
    maintenance:[], deadlines:[]
  }
};
validateImport(legacy);
const migrated = migratePayload(structuredClone(legacy));
assert(migrated.schemaVersion === 5, 'legacy payload not migrated to schema 5');
for (const name of ['odometer','maintenancePlans','components','costs','recurringCosts']) assert(Array.isArray(migrated.data[name]), `missing migrated collection ${name}`);
const report = inspectSnapshotIntegrity({
  vehicles:migrated.data.vehicles || [], odometer:migrated.data.odometer || [], fuel:migrated.data.fuel || [],
  maintenance:migrated.data.maintenance || [], maintenancePlans:migrated.data.maintenancePlans || [], components:migrated.data.components || [],
  costs:migrated.data.costs || [], recurringCosts:migrated.data.recurringCosts || [], deadlines:migrated.data.deadlines || []
});
assert(report.errors.length === 0, `migrated backup invalid: ${report.errors.join(' | ')}`);

const readme = await fs.readFile(path.join(root,'README.md'),'utf8');
for (const heading of ['## Scopo','## Versione corrente','## Funzioni presenti','## Struttura file','## Schema dati','## Chiavi storage / database','## Export format','## Today Contract','## Insights Contract','## Hub Summary','## Quick actions','## Limiti noti']) {
  assert(readme.includes(heading), `README missing ${heading}`);
}
for (const required of ['CHANGELOG.md','RELEASE-AUDIT.md','IPHONE-CHECKLIST.md']) await fs.access(path.join(root,required));

console.log(JSON.stringify({ok:true,version:MODULE.appVersion,schema:MODULE.schemaVersion,routes:ALEX_ROUTES.length,assets:assets.length,atomicImport:true}));

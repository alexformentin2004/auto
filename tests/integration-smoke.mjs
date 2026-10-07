import fs from 'node:fs/promises';
import { getModuleManifest, resolveActionTarget, targetToWebUrl, readIncomingTarget, buildBridgeSnapshot } from '../js/integration.js';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const staticManifest = JSON.parse(await fs.readFile(new URL('../alex-module.json', import.meta.url), 'utf8'));
const runtimeManifest = getModuleManifest();
assert(staticManifest.moduleId === runtimeManifest.moduleId, 'moduleId static/runtime mismatch');
assert(staticManifest.appVersion === runtimeManifest.appVersion, 'appVersion static/runtime mismatch');
assert(staticManifest.schemaVersion === runtimeManifest.schemaVersion, 'schemaVersion static/runtime mismatch');
assert(staticManifest.contractVersion === runtimeManifest.contractVersion, 'contractVersion static/runtime mismatch');
assert(staticManifest.integrationVersion === runtimeManifest.integrationVersion, 'integrationVersion static/runtime mismatch');
assert(staticManifest.routes.length === runtimeManifest.routes.length, 'route count static/runtime mismatch');

const fuel = resolveActionTarget('auto://fuel/new?vehicleId=veh_test');
assert(fuel?.route === 'fuel/new', 'fuel route not resolved');
assert(fuel.params.vehicleId === 'veh_test', 'vehicle context lost');
assert(resolveActionTarget('auto://not-supported') === null, 'unsupported route accepted');

const web = targetToWebUrl('auto://costs/new', 'https://example.test/AUTO/');
assert(readIncomingTarget(web)?.route === 'costs/new', 'web fallback roundtrip failed');

const emptyState = { vehicles:[], odometer:[], fuel:[], maintenance:[], maintenancePlans:[], components:[], costs:[], recurringCosts:[], deadlines:[] };
const snapshot = buildBridgeSnapshot(emptyState, null);
assert(snapshot.module.moduleId === 'auto', 'snapshot module mismatch');
assert(Array.isArray(snapshot.insights), 'snapshot insights missing');
assert(Array.isArray(snapshot.events), 'snapshot events missing');
assert(snapshot.quickActions.length === 4, 'quick actions mismatch');

console.log(JSON.stringify({ ok:true, routes:runtimeManifest.routes.length, quickActions:snapshot.quickActions.length, today:snapshot.today.status }));

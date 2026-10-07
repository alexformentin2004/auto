import fs from 'node:fs/promises';
import { validateOdometerCandidate, validateCostPayload, validateRecurringCostPayload, inspectSnapshotIntegrity } from '../js/validation.js';
import { runDiagnostics } from '../js/diagnostics.js';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const mustThrow = (fn, message) => { let threw=false; try { fn(); } catch { threw=true; } assert(threw,message); };
const base = {
  vehicles:[{id:'veh_1',name:'Test',currentKm:20000}],
  odometer:[{id:'o1',vehicleId:'veh_1',date:'2026-01-10',km:10000},{id:'o2',vehicleId:'veh_1',date:'2026-06-10',km:15000}],
  fuel:[], maintenance:[], maintenancePlans:[], components:[], costs:[], recurringCosts:[], deadlines:[]
};

validateOdometerCandidate(base.odometer,{vehicleId:'veh_1',date:'2026-03-10',km:12000});
mustThrow(() => validateOdometerCandidate(base.odometer,{vehicleId:'veh_1',date:'2026-03-10',km:16000}), 'decreasing future odometer accepted');
mustThrow(() => validateCostPayload({vehicleId:'veh_1',title:'Costo',date:'2026-05-01',amount:0},base), 'zero cost accepted');
mustThrow(() => validateRecurringCostPayload({vehicleId:'veh_1',title:'RC',amount:100,startDate:'2026-08-01',endDate:'2026-07-01',frequency:'annual',intervalMonths:12},base), 'invalid recurring dates accepted');

const report = inspectSnapshotIntegrity(base);
assert(report.errors.length === 0, `unexpected integrity errors: ${report.errors.join(' | ')}`);
const duplicate = structuredClone(base);
duplicate.fuel = [{id:'f1',vehicleId:'veh_1',date:'2026-06-20',liters:30,pricePerLiter:1.8,totalCost:54},{id:'f1',vehicleId:'veh_1',date:'2026-07-20',liters:30,pricePerLiter:1.8,totalCost:54}];
assert(inspectSnapshotIntegrity(duplicate).errors.some(x => x.includes('id duplicato')), 'duplicate id not detected');

const env = { indexedDB:{}, isSecureContext:true, navigator:{ onLine:false, serviceWorker:{ getRegistration:async()=>({scope:'test'}) }, storage:{ estimate:async()=>({usage:1024,quota:1024*1024}) } } };
const diag = await runDiagnostics(base,env);
assert(diag.status === 'ok', `diagnostics not ok: ${diag.status}`);
assert(diag.checks.some(x => x.id === 'online' && x.detail.includes('Offline')), 'offline diagnostic missing');

const alex = JSON.parse(await fs.readFile(new URL('../alex-module.json', import.meta.url),'utf8'));
assert(alex.appVersion === '1.0.0-rc','manifest version mismatch');
for (const cap of ['strictValidation','pwaDiagnostics','progressiveHistory']) assert(alex.capabilities.includes(cap),`missing capability ${cap}`);
const sw = await fs.readFile(new URL('../sw.js', import.meta.url),'utf8');
assert(sw.includes('alex-auto-v1.0.0-rc'),'cache version mismatch');
assert(sw.includes('./js/validation.js') && sw.includes('./js/diagnostics.js'),'RC modules not cached');
const checklist = await fs.readFile(new URL('../IPHONE-CHECKLIST.md', import.meta.url),'utf8');
assert(checklist.includes('Aggiungi alla schermata Home'),'iPhone install checklist incomplete');

console.log(JSON.stringify({ok:true,validation:true,diagnostics:diag.status,capabilities:3}));

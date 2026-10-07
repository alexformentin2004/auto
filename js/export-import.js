import { MODULE } from './config.js';
import { snapshot, replaceSnapshot } from './data.js';
import { assertSnapshotIntegrity } from './validation.js';

export async function buildExport() {
  const snap = await snapshot();
  return {
    moduleId: MODULE.moduleId,
    appVersion: MODULE.appVersion,
    schemaVersion: MODULE.schemaVersion,
    exportedAt: new Date().toISOString(),
    settings: snap.settings,
    data: {
      vehicles: snap.vehicles,
      odometer: snap.odometer,
      fuel: snap.fuel,
      maintenance: snap.maintenance,
      maintenancePlans: snap.maintenancePlans,
      components: snap.components,
      costs: snap.costs,
      recurringCosts: snap.recurringCosts,
      deadlines: snap.deadlines
    },
    metadata: snap.metadata
  };
}

export async function downloadExport() {
  const payload = await buildExport();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `alex-auto-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function validateImport(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('File JSON non valido.');
  if (payload.moduleId !== MODULE.moduleId) throw new Error(`Modulo non compatibile: atteso "${MODULE.moduleId}".`);
  if (!Number.isInteger(payload.schemaVersion)) throw new Error('schemaVersion mancante o non valido.');
  if (payload.schemaVersion > MODULE.schemaVersion) throw new Error('Backup creato con uno schema più recente: aggiorna AUTO prima di importare.');
  if (!payload.data || !Array.isArray(payload.data.vehicles)) throw new Error('Struttura dati incompleta.');
  return true;
}

export function migratePayload(payload) {
  if (payload.schemaVersion === 1) {
    payload.data.odometer = payload.data.odometer || [];
    payload.data.fuel = (payload.data.fuel || []).map(x => ({ ...x, fillType:x.fillType || 'full' }));
    payload.data.vehicles = (payload.data.vehicles || []).map(v => ({
      ...v,
      year:v.year || '', trim:v.trim || '', vin:v.vin || '', registrationDate:v.registrationDate || '',
      purchaseDate:v.purchaseDate || '', purchasePrice:Number(v.purchasePrice || 0), purchaseKm:Number(v.purchaseKm || 0),
      engineCc:Number(v.engineCc || 0), powerKw:Number(v.powerKw || 0), transmission:v.transmission || '', color:v.color || '', notes:v.notes || ''
    }));
    payload.schemaVersion = 2;
  }
  if (payload.schemaVersion === 2) {
    payload.data.vehicles = (payload.data.vehicles || []).map(v => ({ ...v, tankCapacityLiters:Number(v.tankCapacityLiters || 0) }));
    payload.data.fuel = (payload.data.fuel || []).map(x => ({
      ...x,
      fuelGrade:x.fuelGrade || '',
      drivingContext:x.drivingContext || '',
      receiptRef:x.receiptRef || ''
    }));
    payload.schemaVersion = 3;
  }
  if (payload.schemaVersion === 3) {
    payload.data.maintenancePlans = payload.data.maintenancePlans || [];
    payload.data.components = payload.data.components || [];
    payload.data.maintenance = (payload.data.maintenance || []).map(x => ({
      ...x,
      planId:x.planId || '',
      componentId:x.componentId || '',
      parts:x.parts || ''
    }));
    payload.schemaVersion = 4;
  }
  if (payload.schemaVersion === 4) {
    payload.data.costs = payload.data.costs || [];
    payload.data.recurringCosts = payload.data.recurringCosts || [];
    payload.data.vehicles = (payload.data.vehicles || []).map(v => ({
      ...v,
      estimatedValue:Number(v.estimatedValue || 0), valuationDate:v.valuationDate || '',
      financeType:v.financeType || 'cash', downPayment:Number(v.downPayment || 0),
      financedAmount:Number(v.financedAmount || 0), financeStartDate:v.financeStartDate || v.purchaseDate || '',
      financeMonths:Number(v.financeMonths || 0), financeMonthlyPayment:Number(v.financeMonthlyPayment || 0),
      financeAprPct:Number(v.financeAprPct || 0), balloonPayment:Number(v.balloonPayment || 0), financeFees:Number(v.financeFees || 0)
    }));
    payload.schemaVersion = 5;
  }
  return payload;
}

export async function importPayload(payload) {
  validateImport(payload);
  const migrated = migratePayload(structuredClone(payload));
  assertSnapshotIntegrity({
    vehicles: migrated.data.vehicles || [],
    odometer: migrated.data.odometer || [],
    fuel: migrated.data.fuel || [],
    maintenance: migrated.data.maintenance || [],
    maintenancePlans: migrated.data.maintenancePlans || [],
    components: migrated.data.components || [],
    costs: migrated.data.costs || [],
    recurringCosts: migrated.data.recurringCosts || [],
    deadlines: migrated.data.deadlines || []
  });
  await replaceSnapshot({
    vehicles: migrated.data.vehicles || [],
    odometer: migrated.data.odometer || [],
    fuel: migrated.data.fuel || [],
    maintenance: migrated.data.maintenance || [],
    maintenancePlans: migrated.data.maintenancePlans || [],
    components: migrated.data.components || [],
    costs: migrated.data.costs || [],
    recurringCosts: migrated.data.recurringCosts || [],
    deadlines: migrated.data.deadlines || [],
    settings: migrated.settings || [],
    metadata: migrated.metadata || []
  });
}

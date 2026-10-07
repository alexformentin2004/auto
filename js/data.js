import { DB_CONFIG } from './config.js';
import { db } from './db.js';
import { uid, nowIso } from './utils.js';

const S = DB_CONFIG.stores;
const collection = (store, prefix) => ({
  all: () => db.all(store),
  get: (id) => db.get(store,id),
  save: (v) => db.put(store, { id: v.id || uid(prefix), createdAt: v.createdAt || nowIso(), ...v, updatedAt: nowIso() }),
  remove: (id) => db.delete(store,id)
});

export const repo = {
  vehicles: collection(S.vehicles,'veh'),
  odometer: collection(S.odometer,'odo'),
  fuel: collection(S.fuel,'fuel'),
  maintenance: collection(S.maintenance,'mnt'),
  maintenancePlans: collection(S.maintenancePlans,'plan'),
  components: collection(S.components,'cmp'),
  costs: collection(S.costs,'cost'),
  recurringCosts: collection(S.recurringCosts,'rcost'),
  deadlines: collection(S.deadlines,'due'),
  settings: {
    all: () => db.all(S.settings),
    get: (id) => db.get(S.settings,id),
    save: (id,value) => db.put(S.settings,{id,value,updatedAt:nowIso()})
  }
};

export async function snapshot() {
  const [vehicles,odometer,fuel,maintenance,maintenancePlans,components,costs,recurringCosts,deadlines,settings,metadata] = await Promise.all([
    db.all(S.vehicles), db.all(S.odometer), db.all(S.fuel), db.all(S.maintenance), db.all(S.maintenancePlans), db.all(S.components), db.all(S.costs), db.all(S.recurringCosts), db.all(S.deadlines), db.all(S.settings), db.all(S.metadata)
  ]);
  return {vehicles,odometer,fuel,maintenance,maintenancePlans,components,costs,recurringCosts,deadlines,settings,metadata};
}

export async function replaceSnapshot(data) {
  const map = {
    [S.vehicles]: data.vehicles || [],
    [S.odometer]: data.odometer || [],
    [S.fuel]: data.fuel || [],
    [S.maintenance]: data.maintenance || [],
    [S.maintenancePlans]: data.maintenancePlans || [],
    [S.components]: data.components || [],
    [S.costs]: data.costs || [],
    [S.recurringCosts]: data.recurringCosts || [],
    [S.deadlines]: data.deadlines || [],
    [S.settings]: data.settings || [],
    [S.metadata]: data.metadata || []
  };
  await db.replaceAllAtomic(map);
}

export const MODULE = Object.freeze({
  moduleId: 'auto',
  appVersion: '1.0.0-rc',
  integrationVersion: '1.0.0',
  contractVersion: '1.0.0',
  schemaVersion: 5,
  namespace: 'alex.auto'
});

export const DB_CONFIG = Object.freeze({
  name: 'alex.auto.db',
  version: 5,
  stores: {
    vehicles: 'alex.auto.vehicles',
    odometer: 'alex.auto.odometer',
    fuel: 'alex.auto.fuel',
    maintenance: 'alex.auto.maintenance',
    maintenancePlans: 'alex.auto.maintenancePlans',
    components: 'alex.auto.components',
    costs: 'alex.auto.costs',
    recurringCosts: 'alex.auto.recurringCosts',
    deadlines: 'alex.auto.deadlines',
    settings: 'alex.auto.settings',
    metadata: 'alex.auto.metadata'
  }
});

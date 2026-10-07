import { MODULE } from './config.js';
import { calcStats, dashboardAnalytics, maintenanceOverview } from './analytics.js';
import { daysFromNow } from './utils.js';
import { nextRecurringOccurrence } from './costs.js';

const LEGACY_MAINTENANCE_TYPES = new Set(['Tagliando','Pneumatici','Freni','Batteria','Riparazione','Manutenzione']);

function sortedOpenDeadlines(state, vehicleId = null) {
  return [...(state.deadlines || [])]
    .filter(x => !x.completed && (!vehicleId || x.vehicleId === vehicleId))
    .sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')));
}

function legacyMaintenance(state, vehicleId = null) {
  const due = sortedOpenDeadlines(state, vehicleId).find(x => LEGACY_MAINTENANCE_TYPES.has(x.type));
  if (!due) return null;
  return {
    eventId: due.id,
    title: due.title,
    type: due.type,
    date: due.date,
    dueKm: null,
    days: due.date ? daysFromNow(due.date) : null,
    kmRemaining: null,
    status: due.date && daysFromNow(due.date) < 0 ? 'overdue' : 'dueSoon',
    priority: due.priority || 'medium',
    source: 'deadline'
  };
}

export function getUpcomingMaintenance(state, vehicleId = null) {
  const overview = maintenanceOverview(state.maintenancePlans || [], state.vehicles || [], vehicleId);
  const due = overview.next;
  if (due) {
    return {
      eventId: due.id,
      title: due.title,
      type: due.category || 'Manutenzione',
      date: due.nextDueDate || null,
      dueKm: due.nextDueKm || null,
      days: due.daysRemaining,
      kmRemaining: due.kmRemaining,
      status: due.status,
      priority: due.status === 'overdue' ? 'high' : due.status === 'dueSoon' ? 'medium' : (due.priority || 'low'),
      source: 'maintenancePlan'
    };
  }
  return legacyMaintenance(state, vehicleId);
}

function maintenanceText(m) {
  const bits = [];
  if (Number.isFinite(m.days)) bits.push(m.days < 0 ? `${Math.abs(m.days)} gg oltre` : m.days === 0 ? 'oggi' : `tra ${m.days} gg`);
  if (Number.isFinite(m.kmRemaining)) bits.push(m.kmRemaining <= 0 ? `${Math.abs(m.kmRemaining)} km oltre` : `tra ${Math.round(m.kmRemaining)} km`);
  return bits.length ? bits.join(' / ') : 'programmata';
}

export function getTodaySummary(state, vehicleId = null) {
  const maintenance = getUpcomingMaintenance(state, vehicleId);
  const nextDeadline = sortedOpenDeadlines(state, vehicleId)[0];
  const deadlineDays = nextDeadline?.date ? daysFromNow(nextDeadline.date) : null;
  const deadlineSeverity = nextDeadline ? (deadlineDays < 0 ? 3 : deadlineDays <= 14 ? 2 : 1) : 0;
  const maintenanceSeverity = maintenance ? (maintenance.status === 'overdue' ? 3 : maintenance.status === 'dueSoon' ? 2 : 1) : 0;

  if (nextDeadline && deadlineSeverity >= 2 && deadlineSeverity >= maintenanceSeverity) {
    const days = deadlineDays;
    return {
      title: 'AUTO',
      status: days < 0 ? 'overdue' : 'attention',
      priority: days < 0 ? 'high' : 'medium',
      shortText: `${nextDeadline.title}: ${days < 0 ? 'scaduta' : days === 0 ? 'oggi' : `tra ${days} gg`}`,
      actionLabel: 'Apri scadenze',
      actionTarget: 'auto://deadlines',
      timestamp: nextDeadline.date
    };
  }

  if (maintenance && maintenanceSeverity >= 2) {
    return {
      title: 'AUTO',
      status: maintenance.status === 'overdue' ? 'overdue' : 'attention',
      priority: maintenance.status === 'overdue' ? 'high' : 'medium',
      shortText: `${maintenance.title}: ${maintenanceText(maintenance)}`,
      actionLabel: 'Apri manutenzione',
      actionTarget: 'auto://maintenance',
      timestamp: maintenance.date || undefined
    };
  }

  if (nextDeadline) {
    const days = deadlineDays;
    return {
      title: 'AUTO',
      status: 'ok',
      priority: nextDeadline.priority || 'low',
      shortText: `${nextDeadline.title}: ${days === 0 ? 'oggi' : `tra ${days} gg`}`,
      actionLabel: 'Apri scadenze',
      actionTarget: 'auto://deadlines',
      timestamp: nextDeadline.date
    };
  }

  if (maintenance) {
    return {
      title: 'AUTO',
      status: 'ok',
      priority: 'low',
      shortText: `${maintenance.title}: ${maintenanceText(maintenance)}`,
      actionLabel: 'Apri manutenzione',
      actionTarget: 'auto://maintenance',
      timestamp: maintenance.date || undefined
    };
  }

  return {
    title: 'AUTO',
    status: 'ok',
    priority: 'low',
    shortText: 'Nessuna scadenza o manutenzione imminente',
    actionTarget: 'auto://dashboard'
  };
}

export function getInsights(state, vehicleId = null) {
  const s = calcStats(state, vehicleId, state.vehicles || []);
  const dashboard = dashboardAnalytics(state, vehicleId, state.vehicles || [], 12);
  const maintenance = getUpcomingMaintenance(state, vehicleId);
  const overview = maintenanceOverview(state.maintenancePlans || [], state.vehicles || [], vehicleId);
  const stamp = new Date().toISOString().slice(0, 10);
  const metrics = [
    { metricId:'monthly_vehicle_cost', value:s.monthlyCost, unit:'EUR', category:'auto' },
    { metricId:'annual_vehicle_cost', value:s.annualCost, unit:'EUR', category:'auto' },
    { metricId:'average_consumption', value:s.avgConsumption, unit:'L/100km', category:'fuel' },
    { metricId:'last_consumption', value:s.lastConsumption, unit:'L/100km', category:'fuel' },
    { metricId:'fuel_cost_per_km', value:s.euroPerKm, unit:'EUR/km', category:'fuel' },
    { metricId:'average_fuel_price', value:s.weightedAvgFuelPrice, unit:'EUR/L', category:'fuel' },
    { metricId:'recurring_annual_vehicle_cost', value:s.recurringAnnualCost, unit:'EUR/year', category:'auto' },
    { metricId:'ytd_vehicle_cost', value:dashboard.currentYtdCost, unit:'EUR', category:'auto' },
    { metricId:'maintenance_attention_count', value:overview.overdueCount + overview.dueSoonCount, unit:'count', category:'maintenance' }
  ];
  if (dashboard.operatingCostPerKm > 0) metrics.push({ metricId:'operating_cost_per_km_12m', value:dashboard.operatingCostPerKm, unit:'EUR/km', category:'auto' });
  if (Number.isFinite(dashboard.monthDeltaPct)) metrics.push({ metricId:'monthly_vehicle_cost_change', value:dashboard.monthDeltaPct, unit:'percent', category:'auto' });
  if (s.tcoComplete) metrics.push({ metricId:'total_cost_of_ownership', value:s.tcoToDate, unit:'EUR', category:'auto' }, { metricId:'tco_per_km', value:s.tcoPerKm, unit:'EUR/km', category:'auto' });
  if (s.estimatedFullTankRangeKm > 0) metrics.push({ metricId:'estimated_full_tank_range', value:s.estimatedFullTankRangeKm, unit:'km', category:'fuel' });
  if (maintenance && Number.isFinite(maintenance.days)) metrics.push({ metricId:'next_maintenance_days', value:maintenance.days, unit:'days', category:'maintenance' });
  if (maintenance && Number.isFinite(maintenance.kmRemaining)) metrics.push({ metricId:'next_maintenance_km', value:maintenance.kmRemaining, unit:'km', category:'maintenance' });
  return metrics.map(x => ({ timestamp:stamp, ...x, sourceModule:MODULE.moduleId }));
}

export function getHubSummary(state, vehicleId = null) {
  const s = calcStats(state, vehicleId, state.vehicles || []);
  const next = sortedOpenDeadlines(state, vehicleId)[0];
  const maintenance = getUpcomingMaintenance(state, vehicleId);
  const maintenanceValue = maintenance ? maintenanceText(maintenance) : null;
  const rows = [
    { id:'monthly-cost', label:'Costo 30 giorni', value:s.monthlyCost, unit:'EUR' },
    { id:'annual-cost', label:'Costo 12 mesi', value:s.annualCost, unit:'EUR' },
    { id:'consumption', label:'Consumo medio', value:s.avgConsumption, unit:'L/100km' }
  ];
  if (s.tcoComplete) rows.push({ id:'tco', label:'TCO dal possesso', value:s.tcoToDate, unit:'EUR' });
  if (maintenance) rows.push({ id:'next-maintenance', label:maintenance.status === 'overdue' || maintenance.status === 'dueSoon' ? 'Manutenzione imminente' : 'Prossima manutenzione', value:maintenance.title, unit:maintenanceValue });
  if (next) rows.push({ id:'next-deadline', label:'Prossima scadenza', value:next.title, unit:next.date });
  return rows.slice(0, 5);
}

export function getEvents(state) {
  const deadlineEvents = (state.deadlines || []).map(x => ({
    eventId: x.id,
    sourceModule: MODULE.moduleId,
    type: 'deadline',
    title: x.title,
    startAt: x.date,
    priority: x.priority || 'medium',
    completed: !!x.completed,
    actionTarget: 'auto://deadlines'
  }));
  const maintenanceEvents = (state.maintenancePlans || [])
    .filter(x => x.active !== false && String(x.active) !== 'false' && x.nextDueDate)
    .map(x => ({
      eventId: x.id,
      sourceModule: MODULE.moduleId,
      type: 'maintenance',
      title: x.title,
      startAt: x.nextDueDate,
      priority: x.priority || 'medium',
      completed: false,
      actionTarget: 'auto://maintenance'
    }));
  const recurringCostEvents = (state.recurringCosts || []).map(x => ({ ...x, nextDate:nextRecurringOccurrence(x) }))
    .filter(x => x.nextDate)
    .map(x => ({
      eventId:`${x.id}:${x.nextDate}`, sourceModule:MODULE.moduleId, type:'cost', title:x.title, startAt:x.nextDate, priority:'low', completed:false, actionTarget:'auto://costs'
    }));
  return [...deadlineEvents, ...maintenanceEvents, ...recurringCostEvents];
}

export function getQuickActions() {
  return [
    { id:'add-fuel', actionId:'fuel.new', sourceModule:MODULE.moduleId, kind:'create', label:'Aggiungi rifornimento', target:'auto://fuel/new' },
    { id:'log-odometer', actionId:'odometer.new', sourceModule:MODULE.moduleId, kind:'create', label:'Registra km', target:'auto://odometer/new' },
    { id:'add-maintenance', actionId:'maintenance.new', sourceModule:MODULE.moduleId, kind:'create', label:'Registra manutenzione', target:'auto://maintenance/new' },
    { id:'add-cost', actionId:'costs.new', sourceModule:MODULE.moduleId, kind:'create', label:'Aggiungi costo', target:'auto://costs/new' }
  ];
}

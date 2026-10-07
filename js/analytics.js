import { annualizedRecurringAmount, costBreakdown } from './costs.js';
const DAY = 86400000;
const validNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const toTime = (date) => date ? new Date(`${date}T12:00:00`).getTime() : 0;
const round = (n, digits = 3) => Number(Number(n || 0).toFixed(digits));

function sortFuel(entries = [], requireOdometer = true) {
  return [...entries]
    .filter(x => validNumber(x.liters) > 0 && (!requireOdometer || validNumber(x.odometerKm) >= 0))
    .sort((a, b) => toTime(a.date) - toTime(b.date) || validNumber(a.odometerKm) - validNumber(b.odometerKm));
}

export function fullToFullIntervals(fuelEntries = []) {
  const rows = sortFuel(fuelEntries, true);
  const fullIndexes = rows.map((x, i) => ((x.fillType || 'full') === 'full' ? i : -1)).filter(i => i >= 0);
  const intervals = [];

  for (let k = 1; k < fullIndexes.length; k++) {
    const prevIndex = fullIndexes[k - 1];
    const currIndex = fullIndexes[k];
    const start = rows[prevIndex];
    const end = rows[currIndex];
    const distanceKm = validNumber(end.odometerKm) - validNumber(start.odometerKm);
    if (distanceKm <= 0) continue;

    let liters = 0;
    let cost = 0;
    let partialFills = 0;
    for (let i = prevIndex + 1; i <= currIndex; i++) {
      liters += validNumber(rows[i].liters);
      cost += validNumber(rows[i].totalCost);
      if ((rows[i].fillType || 'full') === 'partial') partialFills++;
    }
    if (liters <= 0) continue;

    intervals.push({
      id: `${start.id || prevIndex}_${end.id || currIndex}`,
      startId: start.id || null,
      endId: end.id || null,
      startDate: start.date,
      endDate: end.date,
      startOdometerKm: validNumber(start.odometerKm),
      endOdometerKm: validNumber(end.odometerKm),
      distanceKm,
      liters,
      cost,
      partialFills,
      consumption: liters / distanceKm * 100,
      euroPerKm: cost / distanceKm,
      euroPer100: cost / distanceKm * 100,
      avgPricePerLiter: cost / liters
    });
  }
  return intervals;
}

export function fullToFullStats(fuelEntries = []) {
  const intervalRows = fullToFullIntervals(fuelEntries);
  const distanceKm = intervalRows.reduce((s, x) => s + x.distanceKm, 0);
  const liters = intervalRows.reduce((s, x) => s + x.liters, 0);
  const cost = intervalRows.reduce((s, x) => s + x.cost, 0);
  return {
    distanceKm,
    liters,
    cost,
    intervals: intervalRows.length,
    avgConsumption: distanceKm > 0 ? liters / distanceKm * 100 : 0,
    euroPerKm: distanceKm > 0 ? cost / distanceKm : 0,
    euroPer100: distanceKm > 0 ? cost / distanceKm * 100 : 0,
    avgDistancePerInterval: intervalRows.length ? distanceKm / intervalRows.length : 0,
    intervalRows
  };
}

function monthKey(date) { return date ? String(date).slice(0, 7) : ''; }
function monthLabel(key) {
  if (!/^\d{4}-\d{2}$/.test(key)) return key;
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit' }).format(new Date(y, m - 1, 1));
}

export function fuelAnalytics(fuelEntries = [], options = {}) {
  const rows = sortFuel(fuelEntries, false);
  const trip = fullToFullStats(rows);
  const totalLiters = rows.reduce((s, x) => s + validNumber(x.liters), 0);
  const totalCost = rows.reduce((s, x) => s + validNumber(x.totalCost), 0);
  const prices = rows.map(x => validNumber(x.pricePerLiter)).filter(x => x > 0);
  const intervalRows = trip.intervalRows;
  const consumptions = intervalRows.map(x => x.consumption);
  const lastInterval = intervalRows.at(-1) || null;
  const recent3 = intervalRows.slice(-3);
  const recentDistance = recent3.reduce((s, x) => s + x.distanceKm, 0);
  const recentLiters = recent3.reduce((s, x) => s + x.liters, 0);
  const bestInterval = intervalRows.length ? intervalRows.reduce((a, b) => a.consumption <= b.consumption ? a : b) : null;
  const worstInterval = intervalRows.length ? intervalRows.reduce((a, b) => a.consumption >= b.consumption ? a : b) : null;
  const tankCapacityLiters = validNumber(options.tankCapacityLiters);

  const byMonth = new Map();
  for (const x of rows) {
    const key = monthKey(x.date);
    if (!key) continue;
    if (!byMonth.has(key)) byMonth.set(key, { key, label: monthLabel(key), cost: 0, liters: 0, fills: 0 });
    const bucket = byMonth.get(key);
    bucket.cost += validNumber(x.totalCost);
    bucket.liters += validNumber(x.liters);
    bucket.fills++;
  }
  const monthly = [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-6).map(x => ({
    ...x,
    avgPricePerLiter: x.liters > 0 ? x.cost / x.liters : 0
  }));

  return {
    totalFills: rows.length,
    fullFills: rows.filter(x => (x.fillType || 'full') === 'full').length,
    partialFills: rows.filter(x => x.fillType === 'partial').length,
    totalLiters,
    totalFuelCost: totalCost,
    avgFillCost: rows.length ? totalCost / rows.length : 0,
    weightedAvgPrice: totalLiters > 0 ? totalCost / totalLiters : 0,
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
    lastPrice: rows.length ? validNumber(rows.at(-1).pricePerLiter) : 0,
    firstOdometerKm: rows.length ? validNumber(rows[0].odometerKm) : 0,
    lastOdometerKm: rows.length ? validNumber(rows.at(-1).odometerKm) : 0,
    ...trip,
    lastInterval,
    lastConsumption: lastInterval?.consumption || 0,
    rolling3Consumption: recentDistance > 0 ? recentLiters / recentDistance * 100 : 0,
    bestInterval,
    worstInterval,
    minConsumption: consumptions.length ? Math.min(...consumptions) : 0,
    maxConsumption: consumptions.length ? Math.max(...consumptions) : 0,
    estimatedFullTankRangeKm: tankCapacityLiters > 0 && trip.avgConsumption > 0 ? tankCapacityLiters / trip.avgConsumption * 100 : 0,
    monthly,
    priceTrend: rows.map(x => ({ date: x.date, value: validNumber(x.pricePerLiter), id: x.id })).filter(x => x.value > 0),
    consumptionTrend: intervalRows.map(x => ({ date: x.endDate, value: x.consumption, id: x.id }))
  };
}

function datedCost(rows, costKey) {
  return rows.map(x => ({ date: x.date, cost: validNumber(x[costKey]) }));
}

function dateOnOrAfter(row, minDate = '') {
  return !minDate || (row?.date && String(row.date) >= String(minDate));
}

export function financeSummary(vehicle = {}, now = new Date()) {
  const purchasePrice = Math.max(0, validNumber(vehicle.purchasePrice));
  const estimatedValue = Math.max(0, validNumber(vehicle.estimatedValue));
  const purchaseDate = vehicle.purchaseDate || '';
  const purchaseTime = purchaseDate ? toTime(purchaseDate) : 0;
  const ownedDays = purchaseTime ? Math.max(1, Math.floor((now.getTime() - purchaseTime) / DAY) + 1) : 0;
  const ownedMonths = ownedDays ? ownedDays / 30.4375 : 0;
  const ownershipKm = Math.max(0, validNumber(vehicle.currentKm) - validNumber(vehicle.purchaseKm));
  const depreciationAvailable = purchasePrice > 0 && estimatedValue > 0;
  const depreciation = depreciationAvailable ? Math.max(0, purchasePrice - estimatedValue) : 0;
  const appreciation = depreciationAvailable ? Math.max(0, estimatedValue - purchasePrice) : 0;

  const financeType = vehicle.financeType || 'cash';
  const financeMonths = Math.max(0, Math.round(validNumber(vehicle.financeMonths)));
  const monthlyPayment = Math.max(0, validNumber(vehicle.financeMonthlyPayment));
  const downPayment = Math.max(0, validNumber(vehicle.downPayment));
  const balloonPayment = Math.max(0, validNumber(vehicle.balloonPayment));
  const financeFees = Math.max(0, validNumber(vehicle.financeFees));
  const financedAmount = Math.max(0, validNumber(vehicle.financedAmount) || Math.max(0, purchasePrice - downPayment));
  const financedRepayment = monthlyPayment * financeMonths + balloonPayment + financeFees;
  const projectedPayments = financeType === 'cash' ? purchasePrice : downPayment + financedRepayment;
  const projectedFinanceCharges = financeType === 'cash' ? 0 : Math.max(0, financedRepayment - financedAmount);

  const financeStart = vehicle.financeStartDate || purchaseDate;
  const financeStartTime = financeStart ? toTime(financeStart) : 0;
  const financeElapsedDays = financeStartTime ? Math.max(0, (now.getTime() - financeStartTime) / DAY) : 0;
  const financeElapsedMonths = financeElapsedDays / 30.4375;
  const financeProgress = financeMonths > 0 ? Math.min(1, financeElapsedMonths / financeMonths) : (projectedFinanceCharges > 0 ? 1 : 0);
  const financeChargesToDate = projectedFinanceCharges * financeProgress;
  const installmentsPaidEstimate = financeType === 'cash' || !financeStartTime ? 0 : Math.min(financeMonths, Math.max(0, Math.floor(financeElapsedMonths) + 1));
  const financeCashPaidEstimate = financeType === 'cash' ? purchasePrice : Math.min(projectedPayments, downPayment + installmentsPaidEstimate * monthlyPayment + financeFees + (financeProgress >= 1 ? balloonPayment : 0));

  return {
    purchasePrice, estimatedValue, purchaseDate, ownedDays, ownedMonths, ownershipKm,
    depreciationAvailable, depreciation, appreciation,
    financeType, financeMonths, monthlyPayment, downPayment, balloonPayment, financeFees, financedAmount,
    projectedPayments, financedRepayment, projectedFinanceCharges, financeChargesToDate, financeProgress,
    installmentsPaidEstimate, financeCashPaidEstimate
  };
}

export function calcStats({ fuel = [], maintenance = [], costs = [], recurringCosts = [] }, vehicleId = null, vehicles = []) {
  const f = fuel.filter(x => !vehicleId || x.vehicleId === vehicleId);
  const m = maintenance.filter(x => !vehicleId || x.vehicleId === vehicleId);
  const c = costs.filter(x => !vehicleId || x.vehicleId === vehicleId);
  const recurring = recurringCosts.filter(x => !vehicleId || x.vehicleId === vehicleId);
  const vehicle = vehicles.find?.(x => x.id === vehicleId) || null;
  const fuelCost = f.reduce((s, x) => s + validNumber(x.totalCost), 0);
  const maintenanceCost = m.reduce((s, x) => s + validNumber(x.cost), 0);
  const otherCost = c.reduce((s, x) => s + validNumber(x.amount), 0);
  const totalOperatingCost = fuelCost + maintenanceCost + otherCost;
  const fuelPro = fuelAnalytics(f, { tankCapacityLiters: vehicle?.tankCapacityLiters });
  const now = new Date();
  const costRows = [...datedCost(f, 'totalCost'), ...datedCost(m, 'cost'), ...datedCost(c, 'amount')];
  const costSince = (days) => {
    const min = now.getTime() - days * DAY;
    return costRows.filter(x => x.date && toTime(x.date) >= min).reduce((sum, x) => sum + x.cost, 0);
  };

  const recurringAnnualCost = recurring.reduce((sum, x) => sum + annualizedRecurringAmount(x), 0);
  const recurringMonthlyCost = recurringAnnualCost / 12;
  const finance = financeSummary(vehicle || {}, now);
  const purchaseDate = finance.purchaseDate;
  const operatingSincePurchase = [
    ...f.filter(x => dateOnOrAfter(x, purchaseDate)).map(x => validNumber(x.totalCost)),
    ...m.filter(x => dateOnOrAfter(x, purchaseDate)).map(x => validNumber(x.cost)),
    ...c.filter(x => dateOnOrAfter(x, purchaseDate)).map(x => validNumber(x.amount))
  ].reduce((a,b) => a+b, 0);
  const tcoToDate = operatingSincePurchase + finance.depreciation + finance.financeChargesToDate;
  const tcoMonthlyAverage = finance.ownedDays > 0 ? tcoToDate / finance.ownedDays * 30.4375 : 0;
  const tcoAnnualized = finance.ownedDays > 0 ? tcoToDate / finance.ownedDays * 365 : 0;
  const tcoPerKm = finance.ownershipKm > 0 ? tcoToDate / finance.ownershipKm : 0;
  const ownedCosts = c.filter(x => dateOnOrAfter(x, purchaseDate));
  const otherBreakdown = costBreakdown(ownedCosts);
  const tcoBreakdown = [
    { category:'Carburante', amount:f.filter(x => dateOnOrAfter(x,purchaseDate)).reduce((s,x)=>s+validNumber(x.totalCost),0) },
    { category:'Manutenzione', amount:m.filter(x => dateOnOrAfter(x,purchaseDate)).reduce((s,x)=>s+validNumber(x.cost),0) },
    ...otherBreakdown.map(x => ({ category:x.category, amount:x.amount })),
    ...(finance.depreciationAvailable ? [{ category:'Deprezzamento', amount:finance.depreciation }] : []),
    ...(finance.financeChargesToDate > 0 ? [{ category:'Costo finanziamento', amount:finance.financeChargesToDate }] : [])
  ].filter(x => x.amount > 0).sort((a,b) => b.amount-a.amount);

  return {
    fuelCost,
    maintenanceCost,
    otherCost,
    totalCost: totalOperatingCost,
    totalOperatingCost,
    distanceKm: fuelPro.distanceKm,
    avgConsumption: fuelPro.avgConsumption,
    euroPerKm: fuelPro.euroPerKm,
    euroPer100: fuelPro.euroPer100,
    fullToFullIntervals: fuelPro.intervals,
    monthlyCost: costSince(30),
    annualCost: costSince(365),
    recurringMonthlyCost,
    recurringAnnualCost,
    estimatedFullTankRangeKm: fuelPro.estimatedFullTankRangeKm,
    weightedAvgFuelPrice: fuelPro.weightedAvgPrice,
    lastConsumption: fuelPro.lastConsumption,
    fuelPro,
    finance,
    operatingSincePurchase,
    tcoToDate,
    tcoMonthlyAverage,
    tcoAnnualized,
    tcoPerKm,
    tcoComplete: finance.depreciationAvailable,
    tcoBreakdown,
    otherBreakdown
  };
}

export function summarizeFuelForExport(fuelEntries = [], tankCapacityLiters = 0) {
  const a = fuelAnalytics(fuelEntries, { tankCapacityLiters });
  return {
    totalFills: a.totalFills,
    totalLiters: round(a.totalLiters, 2),
    totalFuelCost: round(a.totalFuelCost, 2),
    weightedAvgPrice: round(a.weightedAvgPrice, 3),
    avgConsumption: round(a.avgConsumption, 2),
    euroPer100: round(a.euroPer100, 2),
    estimatedFullTankRangeKm: round(a.estimatedFullTankRangeKm, 0)
  };
}


function localIso(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function monthKeyFromDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonthKey(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1, 12, 0, 0);
  return monthKeyFromDate(d);
}

function monthKeysEndingAt(now = new Date(), count = 12) {
  const end = monthKeyFromDate(now);
  return Array.from({ length: Math.max(1, count) }, (_, i) => shiftMonthKey(end, i - count + 1));
}

function operatingEvents(state = {}, vehicleId = null) {
  const filter = (rows = []) => rows.filter(x => !vehicleId || x.vehicleId === vehicleId);
  return [
    ...filter(state.fuel).map(x => ({ date:x.date, amount:validNumber(x.totalCost), category:'Carburante', source:'fuel' })),
    ...filter(state.maintenance).map(x => ({ date:x.date, amount:validNumber(x.cost), category:'Manutenzione', source:'maintenance' })),
    ...filter(state.costs).map(x => ({ date:x.date, amount:validNumber(x.amount), category:x.category || 'Altro', source:'cost' }))
  ].filter(x => x.date && x.amount >= 0);
}

function percentDelta(current, previous) {
  if (previous <= 0) return null;
  return (current - previous) / previous * 100;
}

function dateBetween(date, start, end) {
  return !!date && (!start || date >= start) && (!end || date <= end);
}

function comparablePreviousYearEnd(now = new Date()) {
  const d = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 12, 0, 0);
  if (d.getMonth() !== now.getMonth()) d.setDate(0);
  return localIso(d);
}

function loggedDistanceInRange(odometer = [], vehicleId = null, startDate = '', endDate = '') {
  const rows = odometer
    .filter(x => (!vehicleId || x.vehicleId === vehicleId) && x.date && validNumber(x.km) >= 0)
    .map(x => ({ date:String(x.date), km:validNumber(x.km) }))
    .sort((a,b) => a.date.localeCompare(b.date) || a.km - b.km);
  if (rows.length < 2) return { distanceKm:0, start:null, end:null };
  const beforeOrAtStart = rows.filter(x => !startDate || x.date <= startDate).at(-1);
  const firstInside = rows.find(x => dateBetween(x.date, startDate, endDate));
  const start = beforeOrAtStart || firstInside;
  const end = rows.filter(x => !endDate || x.date <= endDate).at(-1);
  if (!start || !end || end.km <= start.km || end.date < start.date) return { distanceKm:0, start, end };
  return { distanceKm:end.km - start.km, start, end };
}

export function dashboardAnalytics(state = {}, vehicleId = null, vehicles = [], rangeMonths = 12, now = new Date()) {
  const months = Math.max(3, Math.min(36, Number(rangeMonths) || 12));
  const monthKeys = monthKeysEndingAt(now, months);
  const rangeStart = `${monthKeys[0]}-01`;
  const rangeEnd = localIso(now);
  const allEvents = operatingEvents(state, vehicleId);
  const events = allEvents.filter(x => dateBetween(x.date, rangeStart, rangeEnd));

  const buckets = new Map(monthKeys.map(key => [key, {
    key,
    label:monthLabel(key),
    fuel:0,
    maintenance:0,
    other:0,
    total:0
  }]));
  for (const e of events) {
    const key = monthKey(e.date);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (e.source === 'fuel') bucket.fuel += e.amount;
    else if (e.source === 'maintenance') bucket.maintenance += e.amount;
    else bucket.other += e.amount;
    bucket.total += e.amount;
  }
  const monthly = [...buckets.values()];
  const rangeTotal = monthly.reduce((s,x) => s + x.total, 0);
  const rangeAverageMonthly = monthly.length ? rangeTotal / monthly.length : 0;
  const highestMonth = monthly.reduce((a,b) => !a || b.total > a.total ? b : a, null);
  const monthsWithSpend = monthly.filter(x => x.total > 0).length;

  const categoryMap = new Map();
  for (const e of events) categoryMap.set(e.category, (categoryMap.get(e.category) || 0) + e.amount);
  let categories = [...categoryMap.entries()].map(([category, amount]) => ({ category, amount })).sort((a,b) => b.amount-a.amount);
  if (categories.length > 6) {
    const top = categories.slice(0,5);
    const rest = categories.slice(5).reduce((s,x) => s+x.amount,0);
    categories = [...top, { category:'Altri costi', amount:rest }];
  }

  const currentMonthKey = monthKeyFromDate(now);
  const previousMonthKey = shiftMonthKey(currentMonthKey, -1);
  const currentMonthCost = allEvents.filter(x => monthKey(x.date) === currentMonthKey && x.date <= rangeEnd).reduce((s,x)=>s+x.amount,0);
  const previousMonthCost = allEvents.filter(x => monthKey(x.date) === previousMonthKey).reduce((s,x)=>s+x.amount,0);

  const currentYear = now.getFullYear();
  const currentYtdStart = `${currentYear}-01-01`;
  const previousYtdStart = `${currentYear - 1}-01-01`;
  const previousYtdEnd = comparablePreviousYearEnd(now);
  const currentYtdCost = allEvents.filter(x => dateBetween(x.date, currentYtdStart, rangeEnd)).reduce((s,x)=>s+x.amount,0);
  const previousYtdCost = allEvents.filter(x => dateBetween(x.date, previousYtdStart, previousYtdEnd)).reduce((s,x)=>s+x.amount,0);

  const vehicle = vehicles.find?.(x => x.id === vehicleId) || null;
  const fuelRows = (state.fuel || []).filter(x => !vehicleId || x.vehicleId === vehicleId);
  const fuelPro = fuelAnalytics(fuelRows, { tankCapacityLiters:vehicle?.tankCapacityLiters });
  const intervalMap = new Map(monthKeys.map(key => [key, { key, label:monthLabel(key), liters:0, distanceKm:0, value:0 }]));
  for (const x of fuelPro.intervalRows || []) {
    const key = monthKey(x.endDate);
    const b = intervalMap.get(key);
    if (!b) continue;
    b.liters += validNumber(x.liters);
    b.distanceKm += validNumber(x.distanceKm);
  }
  const consumptionMonthly = [...intervalMap.values()].map(x => ({
    ...x,
    value:x.distanceKm > 0 ? x.liters / x.distanceKm * 100 : 0
  })).filter(x => x.value > 0);

  const priceMap = new Map(monthKeys.map(key => [key, { key, label:monthLabel(key), cost:0, liters:0, value:0 }]));
  for (const x of fuelRows) {
    const key = monthKey(x.date);
    const b = priceMap.get(key);
    if (!b) continue;
    b.cost += validNumber(x.totalCost);
    b.liters += validNumber(x.liters);
  }
  const fuelPriceMonthly = [...priceMap.values()].map(x => ({ ...x, value:x.liters > 0 ? x.cost/x.liters : 0 })).filter(x => x.value > 0);

  const distance = loggedDistanceInRange(state.odometer || [], vehicleId, rangeStart, rangeEnd);
  const operatingCostPerKm = distance.distanceKm > 0 ? rangeTotal / distance.distanceKm : 0;

  const annualMap = new Map();
  for (const e of allEvents) {
    const year = String(e.date).slice(0,4);
    if (!/^\d{4}$/.test(year)) continue;
    annualMap.set(year, (annualMap.get(year) || 0) + e.amount);
  }
  const annual = [...annualMap.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-4).map(([year,total]) => ({ year, total }));

  const stats = calcStats(state, vehicleId, vehicles);
  return {
    rangeMonths:months,
    rangeStart,
    rangeEnd,
    monthly,
    categories,
    rangeTotal,
    rangeAverageMonthly,
    highestMonth,
    monthsWithSpend,
    currentMonthCost,
    previousMonthCost,
    monthDeltaPct:percentDelta(currentMonthCost, previousMonthCost),
    currentYtdCost,
    previousYtdCost,
    ytdDeltaPct:percentDelta(currentYtdCost, previousYtdCost),
    currentYear,
    annual,
    consumptionMonthly,
    fuelPriceMonthly,
    loggedDistanceKm:distance.distanceKm,
    operatingCostPerKm,
    odometerRangeStart:distance.start,
    odometerRangeEnd:distance.end,
    tcoPerKm:stats.tcoPerKm,
    tcoComplete:stats.tcoComplete,
    tcoToDate:stats.tcoToDate,
    tcoMonthlyAverage:stats.tcoMonthlyAverage,
    avgConsumption:stats.avgConsumption,
    weightedAvgFuelPrice:stats.weightedAvgFuelPrice,
    recurringAnnualCost:stats.recurringAnnualCost
  };
}

const MS_DAY = 86400000;

function addMonthsIso(date, months) {
  if (!date || !Number(months)) return '';
  const d = new Date(`${date}T12:00:00`);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + Number(months));
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d.toISOString().slice(0,10);
}

export function normalizeMaintenancePlan(plan = {}) {
  const intervalKm = Math.max(0, validNumber(plan.intervalKm));
  const intervalMonths = Math.max(0, validNumber(plan.intervalMonths));
  const lastServiceKm = Math.max(0, validNumber(plan.lastServiceKm));
  const nextDueKm = validNumber(plan.nextDueKm) > 0 ? validNumber(plan.nextDueKm) : (intervalKm > 0 && lastServiceKm > 0 ? lastServiceKm + intervalKm : 0);
  const nextDueDate = plan.nextDueDate || (plan.lastServiceDate && intervalMonths > 0 ? addMonthsIso(plan.lastServiceDate, intervalMonths) : '');
  return {
    ...plan,
    intervalKm,
    intervalMonths,
    lastServiceKm,
    nextDueKm,
    nextDueDate,
    warningDays: Math.max(0, validNumber(plan.warningDays || 30)),
    warningKm: Math.max(0, validNumber(plan.warningKm || 1000)),
    active: plan.active !== false && String(plan.active) !== 'false'
  };
}

export function maintenancePlanStatus(plan = {}, vehicle = {}, now = new Date()) {
  const p = normalizeMaintenancePlan(plan);
  const currentKm = Math.max(0, validNumber(vehicle?.currentKm));
  const daysRemaining = p.nextDueDate ? Math.ceil((new Date(`${p.nextDueDate}T23:59:59`) - now) / MS_DAY) : null;
  const kmRemaining = p.nextDueKm > 0 ? p.nextDueKm - currentKm : null;
  const dateOverdue = daysRemaining !== null && daysRemaining < 0;
  const kmOverdue = kmRemaining !== null && kmRemaining <= 0;
  const dateSoon = daysRemaining !== null && daysRemaining <= p.warningDays;
  const kmSoon = kmRemaining !== null && kmRemaining <= p.warningKm;
  const status = !p.active ? 'paused' : (dateOverdue || kmOverdue ? 'overdue' : (dateSoon || kmSoon ? 'dueSoon' : 'ok'));
  const severity = status === 'overdue' ? 3 : status === 'dueSoon' ? 2 : status === 'ok' ? 1 : 0;
  return {
    ...p,
    currentKm,
    daysRemaining,
    kmRemaining,
    status,
    severity,
    overdueByDays: dateOverdue ? Math.abs(daysRemaining) : 0,
    overdueByKm: kmOverdue ? Math.abs(kmRemaining) : 0
  };
}

export function maintenanceOverview(plans = [], vehicles = [], vehicleId = null) {
  const vehicleMap = new Map((vehicles || []).map(v => [v.id, v]));
  const rows = (plans || [])
    .filter(p => !vehicleId || p.vehicleId === vehicleId)
    .map(p => maintenancePlanStatus(p, vehicleMap.get(p.vehicleId) || {}));
  const active = rows.filter(x => x.active);
  const sorted = [...active].sort((a,b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    const aDays = a.daysRemaining ?? Number.POSITIVE_INFINITY;
    const bDays = b.daysRemaining ?? Number.POSITIVE_INFINITY;
    const aKm = a.kmRemaining ?? Number.POSITIVE_INFINITY;
    const bKm = b.kmRemaining ?? Number.POSITIVE_INFINITY;
    return Math.min(aDays * 50, aKm) - Math.min(bDays * 50, bKm);
  });
  return {
    rows,
    active,
    sorted,
    next: sorted[0] || null,
    overdueCount: active.filter(x => x.status === 'overdue').length,
    dueSoonCount: active.filter(x => x.status === 'dueSoon').length,
    okCount: active.filter(x => x.status === 'ok').length,
    pausedCount: rows.filter(x => !x.active).length
  };
}

export function nextPlanDueValues(plan = {}, serviceDate = '', serviceKm = 0) {
  const p = normalizeMaintenancePlan(plan);
  return {
    lastServiceDate: serviceDate || p.lastServiceDate || '',
    lastServiceKm: Math.max(0, validNumber(serviceKm || p.lastServiceKm)),
    nextDueDate: p.intervalMonths > 0 && serviceDate ? addMonthsIso(serviceDate, p.intervalMonths) : (p.nextDueDate || ''),
    nextDueKm: p.intervalKm > 0 && validNumber(serviceKm) > 0 ? validNumber(serviceKm) + p.intervalKm : (p.nextDueKm || 0)
  };
}

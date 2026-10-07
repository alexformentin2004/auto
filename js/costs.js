const DAY = 86400000;
const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const iso = (d) => d.toISOString().slice(0,10);
const parse = (s) => s ? new Date(`${s}T12:00:00`) : null;

export function recurrenceMonths(plan = {}) {
  const frequency = plan.frequency || 'annual';
  if (frequency === 'monthly') return 1;
  if (frequency === 'quarterly') return 3;
  if (frequency === 'semiannual') return 6;
  if (frequency === 'annual') return 12;
  return Math.max(1, Math.round(n(plan.intervalMonths) || 1));
}

export function addMonthsIso(date, months) {
  const d = parse(date);
  if (!d) return '';
  const originalDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + Number(months || 0));
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(originalDay, last));
  return iso(d);
}

export function annualizedRecurringAmount(plan = {}) {
  if (plan.active === false || String(plan.active) === 'false') return 0;
  const months = recurrenceMonths(plan);
  return n(plan.amount) * 12 / months;
}

export function recurringOccurrenceDates(plan = {}, untilDate = iso(new Date()), maxOccurrences = 240) {
  if (plan.active === false || String(plan.active) === 'false' || !plan.startDate || n(plan.amount) <= 0) return [];
  const until = parse(untilDate);
  const end = plan.endDate ? parse(plan.endDate) : null;
  if (!until) return [];
  const step = recurrenceMonths(plan);
  const result = [];
  let cursor = plan.startDate;
  let guard = 0;
  while (cursor && guard++ < maxOccurrences) {
    const date = parse(cursor);
    if (!date || date > until || (end && date > end)) break;
    result.push(cursor);
    cursor = addMonthsIso(cursor, step);
  }
  return result;
}

export function buildMissingRecurringEntries(plans = [], costs = [], untilDate = iso(new Date())) {
  const existing = new Set((costs || []).map(x => x.occurrenceKey).filter(Boolean));
  const output = [];
  for (const plan of plans || []) {
    for (const date of recurringOccurrenceDates(plan, untilDate)) {
      const occurrenceKey = `${plan.id}:${date}`;
      if (existing.has(occurrenceKey)) continue;
      output.push({
        vehicleId: plan.vehicleId,
        title: plan.title,
        category: plan.category || 'Altro',
        amount: n(plan.amount),
        date,
        merchant: plan.merchant || '',
        documentRef: '',
        notes: plan.notes ? `Generato automaticamente da: ${plan.title}` : 'Generato automaticamente da costo ricorrente',
        source: 'recurring',
        recurringCostId: plan.id,
        occurrenceKey
      });
      existing.add(occurrenceKey);
    }
  }
  return output;
}

export function nextRecurringOccurrence(plan = {}, fromDate = iso(new Date())) {
  if (plan.active === false || String(plan.active) === 'false' || !plan.startDate) return '';
  const from = parse(fromDate);
  const end = plan.endDate ? parse(plan.endDate) : null;
  const step = recurrenceMonths(plan);
  let cursor = plan.startDate;
  let guard = 0;
  while (cursor && guard++ < 600) {
    const d = parse(cursor);
    if (!d || (end && d > end)) return '';
    if (d >= from) return cursor;
    cursor = addMonthsIso(cursor, step);
  }
  return '';
}

export function costBreakdown(costs = []) {
  const map = new Map();
  for (const row of costs || []) {
    const key = row.category || 'Altro';
    map.set(key, (map.get(key) || 0) + n(row.amount));
  }
  return [...map.entries()].map(([category, amount]) => ({ category, amount })).sort((a,b) => b.amount-a.amount);
}

export function costSince(costs = [], days = 365, now = new Date()) {
  const min = now.getTime() - days * DAY;
  return (costs || []).filter(x => x.date && parse(x.date)?.getTime() >= min).reduce((s,x) => s + n(x.amount), 0);
}

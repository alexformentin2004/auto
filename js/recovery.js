const RECOVERY_KEY = 'alex.auto.recovery.v1';
const MAX_AGE_DAYS = 30;

export function saveRecoveryPoint(payload, reason = 'manual') {
  const record = {
    version: 1,
    moduleId: 'auto',
    reason,
    savedAt: new Date().toISOString(),
    payload
  };
  try {
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(record));
    return { ok:true, savedAt:record.savedAt };
  } catch (error) {
    return { ok:false, error:error?.message || 'Spazio locale non sufficiente per il punto di ripristino.' };
  }
}

export function readRecoveryPoint() {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (!record || record.moduleId !== 'auto' || !record.payload) return null;
    const ageMs = Date.now() - new Date(record.savedAt).getTime();
    return { ...record, stale:Number.isFinite(ageMs) && ageMs > MAX_AGE_DAYS * 86400000 };
  } catch {
    return null;
  }
}

export function clearRecoveryPoint() {
  localStorage.removeItem(RECOVERY_KEY);
}

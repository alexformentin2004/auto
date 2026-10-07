import fs from 'node:fs/promises';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const memory = new Map();
globalThis.localStorage = {
  setItem(k,v){ memory.set(k,String(v)); },
  getItem(k){ return memory.has(k) ? memory.get(k) : null; },
  removeItem(k){ memory.delete(k); }
};

const { saveRecoveryPoint, readRecoveryPoint, clearRecoveryPoint } = await import('../js/recovery.js');
const payload = { moduleId:'auto', appVersion:'1.0.0-rc', schemaVersion:5, data:{vehicles:[]} };
assert(saveRecoveryPoint(payload,'smoke').ok, 'recovery save failed');
const point = readRecoveryPoint();
assert(point?.payload?.moduleId === 'auto', 'recovery payload mismatch');
assert(point.reason === 'smoke', 'recovery reason mismatch');
clearRecoveryPoint();
assert(readRecoveryPoint() === null, 'recovery clear failed');

const manifest = JSON.parse(await fs.readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
assert(manifest.id === './', 'PWA id missing');
assert(manifest.orientation === 'portrait-primary', 'orientation hardening missing');
assert(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 3, 'PWA shortcuts missing');

const alex = JSON.parse(await fs.readFile(new URL('../alex-module.json', import.meta.url), 'utf8'));
assert(alex.appVersion === '1.0.0-rc', 'ALEX manifest version mismatch');
assert(alex.capabilities.includes('localRecovery'), 'localRecovery capability missing');
assert(alex.capabilities.includes('historyFilters'), 'historyFilters capability missing');

const sw = await fs.readFile(new URL('../sw.js', import.meta.url), 'utf8');
assert(sw.includes("alex-auto-v1.0.0-rc"), 'service worker cache version mismatch');
assert(sw.includes("./js/recovery.js"), 'recovery module missing from offline cache');

console.log(JSON.stringify({ok:true,recovery:true,shortcuts:manifest.shortcuts.length,cache:'alex-auto-v1.0.0-rc'}));

export const uid = (prefix='id') => `${prefix}_${crypto.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2)}`;
export const nowIso = () => new Date().toISOString();
export const todayIso = () => new Date().toISOString().slice(0,10);
export const money = (value) => new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(value || 0));
export const number = (value, digits=1) => new Intl.NumberFormat('it-IT',{maximumFractionDigits:digits,minimumFractionDigits:0}).format(Number(value || 0));
export const dateLabel = (value) => value ? new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${value}T12:00:00`)) : '—';
export const daysFromNow = (date) => Math.ceil((new Date(`${date}T23:59:59`) - new Date()) / 86400000);
export const escapeHtml = (str='') => String(str).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
export const mapsSearchUrl = (query) => `https://maps.apple.com/?q=${encodeURIComponent(query)}`;

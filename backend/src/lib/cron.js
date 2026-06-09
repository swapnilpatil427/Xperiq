// Minimal 5-field cron matcher (no dependency — node-cron isn't installed).
// Fields: minute hour day-of-month month day-of-week.
// Supports: *  a  a,b,c  a-b  */n  a-b/n . day-of-week 0/7 = Sunday.
// cronMatches(expr, date) → true when `date` falls in the cron's minute window.

function parseField(field, min, max) {
  const allowed = new Set();
  for (const part of String(field).split(',')) {
    let step = 1;
    let range = part;
    const slash = part.indexOf('/');
    if (slash !== -1) { step = parseInt(part.slice(slash + 1), 10) || 1; range = part.slice(0, slash); }
    let lo = min;
    let hi = max;
    if (range !== '*') {
      const dash = range.indexOf('-');
      if (dash !== -1) { lo = parseInt(range.slice(0, dash), 10); hi = parseInt(range.slice(dash + 1), 10); }
      else { lo = hi = parseInt(range, 10); }
    }
    if (Number.isNaN(lo) || Number.isNaN(hi)) continue;
    for (let v = lo; v <= hi; v += step) allowed.add(v);
  }
  return allowed;
}

/**
 * @param {string} expr  5-field cron expression
 * @param {Date}   [date=now]
 * @returns {boolean}
 */
function cronMatches(expr, date = new Date()) {
  const fields = String(expr || '').trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [m, h, dom, mon, dow] = fields;

  const minutes = parseField(m, 0, 59);
  const hours = parseField(h, 0, 23);
  const doms = parseField(dom, 1, 31);
  const mons = parseField(mon, 1, 12);
  const dowsRaw = parseField(dow, 0, 7);
  // Normalize 7 → 0 (Sunday).
  const dows = new Set([...dowsRaw].map((v) => (v === 7 ? 0 : v)));

  if (!minutes.has(date.getMinutes())) return false;
  if (!hours.has(date.getHours())) return false;
  if (!mons.has(date.getMonth() + 1)) return false;

  // Standard cron: if both DOM and DOW are restricted, match either; else match both.
  const domRestricted = dom !== '*';
  const dowRestricted = dow !== '*';
  const domOk = doms.has(date.getDate());
  const dowOk = dows.has(date.getDay());
  if (domRestricted && dowRestricted) return domOk || dowOk;
  return domOk && dowOk;
}

module.exports = { cronMatches, parseField };

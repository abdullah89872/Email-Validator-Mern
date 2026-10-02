export function formatNumber(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '0';
  return Number(n).toLocaleString();
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function timeAgo(value) {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return '—';
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const suffix = diff >= 0 ? 'ago' : 'from now';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ${suffix}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ${suffix}`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ${suffix}`;
  return formatDate(value);
}

export function formatDuration(ms) {
  if (!ms && ms !== 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Consistent colours for the four validation statuses. */
export const STATUS_STYLES = {
  VALID: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500', bar: '#10b981' },
  INVALID: { badge: 'bg-rose-50 text-rose-700 ring-rose-600/20', dot: 'bg-rose-500', bar: '#f43f5e' },
  RISKY: { badge: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: 'bg-amber-500', bar: '#f59e0b' },
  UNKNOWN: { badge: 'bg-slate-100 text-slate-600 ring-slate-500/20', dot: 'bg-slate-400', bar: '#94a3b8' },
  PENDING: { badge: 'bg-brand-50 text-brand-700 ring-brand-600/20', dot: 'bg-brand-500', bar: '#3b63f6' },
  ERROR: { badge: 'bg-rose-50 text-rose-700 ring-rose-600/20', dot: 'bg-rose-500', bar: '#f43f5e' },
};

export const JOB_STATUS_STYLES = {
  pending: { badge: 'bg-slate-100 text-slate-600 ring-slate-500/20', dot: 'bg-slate-400', label: 'Pending' },
  running: { badge: 'bg-brand-50 text-brand-700 ring-brand-600/20', dot: 'bg-brand-500', label: 'Running' },
  completed: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500', label: 'Completed' },
  failed: { badge: 'bg-rose-50 text-rose-700 ring-rose-600/20', dot: 'bg-rose-500', label: 'Failed' },
  cancelled: { badge: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: 'bg-amber-500', label: 'Cancelled' },
};

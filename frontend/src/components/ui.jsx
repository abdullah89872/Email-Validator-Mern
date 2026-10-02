import { STATUS_STYLES, JOB_STATUS_STYLES, formatNumber } from '../utils/format.js';

/** Pill badge for VALID / INVALID / RISKY / UNKNOWN rows. */
export function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.UNKNOWN;
  return (
    <span className={`chip ${style.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}

/** Pill badge for job lifecycle status. */
export function JobStatusBadge({ status }) {
  const style = JOB_STATUS_STYLES[status] || JOB_STATUS_STYLES.pending;
  return (
    <span className={`chip ${style.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

/** KPI tile used across the dashboard and job page. */
export function StatCard({ label, value, icon: Icon, accent = 'brand', hint, loading }) {
  const accents = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-100 text-slate-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <div className="card card-hover p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-900 tabular-nums">
            {loading ? <span className="skeleton inline-block h-7 w-16" /> : formatNumber(value)}
          </p>
          {hint && <p className="mt-1 text-[11px] text-slate-500 truncate">{hint}</p>}
        </div>
        {Icon && (
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${accents[accent] || accents.brand}`}>
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
    </div>
  );
}

/** Horizontal progress bar with optional animated stripes while running. */
export function ProgressBar({ value = 0, running = false, label }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      {label !== undefined && (
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-600">{label}</span>
          <span className="font-bold text-slate-900 tabular-nums">{pct}%</span>
        </div>
      )}
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-500
            ${running ? 'animate-pulse' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Consistent empty / no-results state. */
export function EmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && (
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
          <Icon className="h-7 w-7" />
        </span>
      )}
      <h3 className="mt-4 text-sm font-bold text-slate-800">{title}</h3>
      {subtitle && <p className="mt-1 max-w-sm text-xs text-slate-500">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

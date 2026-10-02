import { Activity } from 'lucide-react';

/**
 * Live indicator of API / validator / Mongo connectivity.
 * `health` is fetched from GET /api/health by the app shell.
 */
export default function SystemStatus({ health }) {
  const rows = [
    { label: 'API', up: Boolean(health) },
    { label: 'Validator', up: health?.validator === 'up' },
    { label: 'Database', up: health?.mongo === 'connected' },
  ];

  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3.5">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
        <Activity className="h-4 w-4 text-brand-600" />
        System status
      </div>
      <dl className="mt-2.5 space-y-1.5 text-[11px]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <dt className="text-slate-500">{row.label}</dt>
            <dd className="flex items-center gap-1.5 font-semibold text-slate-700">
              <span className={`h-1.5 w-1.5 rounded-full ${row.up ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {health ? (row.up ? 'Up' : 'Down') : '…'}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2.5 text-[10px] leading-snug text-slate-400">
        MX checks confirm domain setup only — mailbox existence is never claimed.
      </p>
    </div>
  );
}

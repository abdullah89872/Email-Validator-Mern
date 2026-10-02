import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Accessible pagination control.
 * Shows a windowed page list so large result sets stay navigable.
 */
export default function Pagination({ page, totalPages, total, onChange, disabled }) {
  if (!totalPages || totalPages <= 1) {
    return total ? (
      <p className="text-xs text-slate-500">{total.toLocaleString()} result{total === 1 ? '' : 's'}</p>
    ) : null;
  }

  const window = [];
  const from = Math.max(1, Math.min(page - 2, totalPages - 4));
  const to = Math.min(totalPages, Math.max(page + 2, 5));
  for (let i = from; i <= to; i += 1) window.push(i);

  const go = (p) => {
    if (disabled) return;
    if (p < 1 || p > totalPages || p === page) return;
    onChange(p);
  };

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-xs text-slate-500">
        Page <span className="font-semibold text-slate-700">{page}</span> of{' '}
        <span className="font-semibold text-slate-700">{totalPages}</span>
        {typeof total === 'number' && <> · {total.toLocaleString()} total</>}
      </p>
      <div className="flex items-center gap-1">
        <button className="btn-ghost !px-2 !py-1.5" onClick={() => go(page - 1)} disabled={disabled || page <= 1}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        {window.map((p) => (
          <button
            key={p}
            onClick={() => go(p)}
            disabled={disabled}
            className={`min-w-8 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition
              ${p === page
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {p}
          </button>
        ))}
        <button className="btn-ghost !px-2 !py-1.5" onClick={() => go(page + 1)} disabled={disabled || page >= totalPages}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

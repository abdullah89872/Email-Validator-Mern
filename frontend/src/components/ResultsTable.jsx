import { useState } from 'react';
import { ChevronDown, ChevronUp, Search, X, SlidersHorizontal } from 'lucide-react';
import { StatusBadge } from './ui.jsx';
import { formatDate } from '../utils/format.js';

const COLUMNS = [
  { key: 'email', label: 'Email', sortable: true, className: 'min-w-[220px]' },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'mxFound', label: 'MX' },
  { key: 'disposable', label: 'Disposable', sortable: true },
  { key: 'roleAccount', label: 'Role', sortable: true },
  { key: 'mailboxVerification', label: 'Mailbox' },
  { key: 'reasons', label: 'Reasons' },
  { key: 'checkedAt', label: 'Checked', sortable: true },
];

function BoolCell({ value, yes, no }) {
  return value
    ? <span className="font-semibold text-emerald-600">{yes}</span>
    : <span className="text-slate-400">{no}</span>;
}

/**
 * Paginated, searchable, sortable results table.
 * The parent owns fetching; this component handles local sorting UI only.
 */
export default function ResultsTable({
  results = [], loading, sort, onSortChange,
  search, onSearchChange, statusFilter, onStatusFilterChange,
  showFilters = true, reasonPreview = 2,
}) {
  const [expanded, setExpanded] = useState(() => new Set());

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSort = (key) => {
    if (!onSortChange) return;
    const dir = sort?.key === key && sort?.dir === 'asc' ? 'desc' : 'asc';
    onSortChange({ key, dir });
  };

  return (
    <div className="card overflow-hidden">
      {showFilters && (
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input !pl-9"
              placeholder="Search email addresses…"
              value={search}
              onChange={(e) => onSearchChange?.(e.target.value)}
            />
            {search && (
              <button
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100"
                onClick={() => onSearchChange?.('')}
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden items-center gap-1.5 text-xs font-semibold text-slate-500 sm:flex">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filter
            </span>
            {['ALL', 'VALID', 'INVALID', 'RISKY', 'UNKNOWN'].map((s) => (
              <button
                key={s}
                onClick={() => onStatusFilterChange?.(s)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition
                  ${statusFilter === s
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {s === 'ALL' ? 'All' : s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto thin-scroll">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="w-8 px-3 py-2.5" />
              {COLUMNS.map((col) => (
                <th key={col.key} className={`px-3 py-2.5 font-bold ${col.className || ''}`}>
                  {col.sortable && onSortChange ? (
                    <button
                      className="inline-flex items-center gap-1 hover:text-slate-800"
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      {sort?.key === col.key && (
                        sort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                  ) : col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={`sk-${i}`}>
                <td className="px-3 py-3" colSpan={9}>
                  <span className="skeleton block h-4 w-full" />
                </td>
              </tr>
            ))}

            {!loading && results.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                  No results match your filters.
                </td>
              </tr>
            )}

            {!loading && results.map((r) => {
              const reasons = r.reasons || [];
              const isOpen = expanded.has(r._id);
              const shown = isOpen ? reasons : reasons.slice(0, reasonPreview);
              return (
                <tr key={r._id} className="align-top hover:bg-slate-50/60 transition-colors">
                  <td className="px-3 py-3">
                    {reasons.length > reasonPreview && (
                      <button
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                        onClick={() => toggle(r._id)}
                        aria-label={isOpen ? 'Show fewer reasons' : 'Show all reasons'}
                      >
                        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-semibold text-slate-800 break-all">{r.email}</span>
                  </td>
                  <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-3"><BoolCell value={r.mxFound} yes="Found" no="None" /></td>
                  <td className="px-3 py-3"><BoolCell value={r.disposable} yes="Yes" no="No" /></td>
                  <td className="px-3 py-3"><BoolCell value={r.roleAccount} yes="Yes" no="No" /></td>
                  <td className="px-3 py-3 text-slate-500">{r.mailboxVerification}</td>
                  <td className="px-3 py-3">
                    {shown.length === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <ul className="space-y-0.5 max-w-xs">
                        {shown.map((reason, i) => (
                          <li key={`${r._id}-${i}`} className="text-slate-600 leading-snug">• {reason}</li>
                        ))}
                        {!isOpen && reasons.length > reasonPreview && (
                          <li className="text-[10px] font-semibold text-brand-600">
                            +{reasons.length - reasonPreview} more
                          </li>
                        )}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                    {r.checkedAt ? formatDate(r.checkedAt) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

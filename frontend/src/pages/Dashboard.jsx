import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2, XCircle, AlertTriangle,
  UploadCloud, Activity, Layers, Copy,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { listJobs } from '../api/client.js';
import { StatCard, EmptyState, JobStatusBadge } from '../components/ui.jsx';
import { formatNumber, timeAgo, STATUS_STYLES } from '../utils/format.js';

const PIE_COLORS = [
  STATUS_STYLES.VALID.bar,
  STATUS_STYLES.INVALID.bar,
  STATUS_STYLES.RISKY.bar,
  STATUS_STYLES.UNKNOWN.bar,
];

export default function Dashboard() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    listJobs({ page: 1, limit: 10 })
      .then((data) => { setJobs(data.jobs || []); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const totals = useMemo(() => {
    return jobs.reduce(
      (acc, j) => {
        acc.valid += j.validCount || 0;
        acc.invalid += j.invalidCount || 0;
        acc.risky += j.riskyCount || 0;
        acc.unknown += j.unknownCount || 0;
        acc.processed += j.processedEmails || 0;
        acc.duplicates += j.duplicateCount || 0;
        acc.jobs += 1;
        if (j.status === 'running') acc.running += 1;
        return acc;
      },
      { valid: 0, invalid: 0, risky: 0, unknown: 0, processed: 0, duplicates: 0, jobs: 0, running: 0 }
    );
  }, [jobs]);

  const pieData = [
    { name: 'Valid', value: totals.valid },
    { name: 'Invalid', value: totals.invalid },
    { name: 'Risky', value: totals.risky },
    { name: 'Unknown', value: totals.unknown },
  ].filter((d) => d.value > 0);

  const totalClassified = pieData.reduce((s, d) => s + d.value, 0);

  // Newest-first trend across the recent jobs we loaded.
  const trendData = useMemo(
    () => [...jobs].reverse().map((j) => ({
      name: (j.originalName || '').slice(0, 16),
      valid: j.validCount || 0,
      invalid: j.invalidCount || 0,
      risky: j.riskyCount || 0,
      unknown: j.unknownCount || 0,
    })),
    [jobs]
  );
return (
    <div className="space-y-6 animate-fadeUp">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Dashboard</h2>
          <p className="text-sm text-slate-500">
            Overview of your recent validation activity.
          </p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/upload')}>
          <UploadCloud className="h-4 w-4" />
          New validation
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Could not load jobs: {error}
        </div>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Emails checked" value={totals.processed} icon={Activity} accent="brand" loading={loading} />
        <StatCard label="Valid" value={totals.valid} icon={CheckCircle2} accent="emerald" loading={loading} />
        <StatCard label="Invalid" value={totals.invalid} icon={XCircle} accent="rose" loading={loading} />
        <StatCard label="Risky" value={totals.risky} icon={AlertTriangle} accent="amber" loading={loading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Distribution donut */}
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Status distribution</h3>
            <Layers className="h-4 w-4 text-slate-400" />
          </div>
          {totalClassified === 0 ? (
            <EmptyState
              icon={Layers}
              title={loading ? 'Loading…' : 'No data yet'}
              subtitle={loading ? '' : 'Run a validation job to see how your list breaks down.'}
            />
          ) : (
            <>
              <div className="mt-3 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={86}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [formatNumber(value), name]}
                      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 space-y-2">
                {pieData.map((entry, i) => (
                  <li key={entry.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      {entry.name}
                    </span>
                    <span className="font-bold text-slate-800 tabular-nums">
                      {formatNumber(entry.value)}
                      <span className="ml-1 font-medium text-slate-400">
                        ({Math.round((entry.value / totalClassified) * 100)}%)
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
{/* Trend */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Recent job outcomes</h3>
            <Copy className="h-4 w-4 text-slate-400" />
          </div>
          {trendData.length === 0 ? (
            <EmptyState icon={Activity} title="Nothing to chart yet" subtitle="Completed jobs will appear here." />
          ) : (
            <div className="mt-3 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 5, right: 8, left: -14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gValid" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={STATUS_STYLES.VALID.bar} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={STATUS_STYLES.VALID.bar} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gInvalid" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={STATUS_STYLES.INVALID.bar} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={STATUS_STYLES.INVALID.bar} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    formatter={(value, name) => [formatNumber(value), name]}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="valid" name="Valid" stroke={STATUS_STYLES.VALID.bar} strokeWidth={2} fill="url(#gValid)" />
                  <Area type="monotone" dataKey="invalid" name="Invalid" stroke={STATUS_STYLES.INVALID.bar} strokeWidth={2} fill="url(#gInvalid)" />
                  <Area type="monotone" dataKey="risky" name="Risky" stroke={STATUS_STYLES.RISKY.bar} strokeWidth={2} fillOpacity={0.12} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
{/* Recent jobs */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Recent jobs</h3>
            <p className="text-xs text-slate-500">Your latest uploads and their status</p>
          </div>
          <Link to="/jobs" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
            View all →
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => <span key={i} className="skeleton block h-10 w-full" />)}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={UploadCloud}
            title="No validation jobs yet"
            subtitle="Upload a CSV, XLS, or XLSX file to clean your first list."
            action={<Link to="/upload" className="btn-primary">Upload a file</Link>}
          />
        ) : (
          <div className="overflow-x-auto thin-scroll">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-bold">File</th>
                  <th className="px-3 py-2.5 font-bold">Status</th>
                  <th className="px-3 py-2.5 font-bold">Progress</th>
                  <th className="px-3 py-2.5 font-bold text-right">Valid</th>
                  <th className="px-3 py-2.5 font-bold text-right">Invalid</th>
                  <th className="px-3 py-2.5 font-bold text-right">Risky</th>
                  <th className="px-5 py-2.5 font-bold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job) => (
                  <tr
                    key={job._id}
                    className="cursor-pointer hover:bg-slate-50/70 transition-colors"
                    onClick={() => navigate(`/jobs/${job._id}`)}
                  >
                    <td className="px-5 py-3">
                      <span className="font-semibold text-slate-800">{job.originalName}</span>
                      <span className="block text-[10px] text-slate-400">
                        {formatNumber(job.uniqueEmails)} unique · {formatNumber(job.duplicateCount)} dupes
                      </span>
                    </td>
                    <td className="px-3 py-3"><JobStatusBadge status={job.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${job.progress || 0}%` }} />
                        </div>
                        <span className="text-[10px] font-semibold text-slate-500 tabular-nums">{job.progress || 0}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-emerald-600 tabular-nums">{formatNumber(job.validCount)}</td>
                    <td className="px-3 py-3 text-right font-bold text-rose-600 tabular-nums">{formatNumber(job.invalidCount)}</td>
                    <td className="px-3 py-3 text-right font-bold text-amber-600 tabular-nums">{formatNumber(job.riskyCount)}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-slate-500">{timeAgo(job.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-slate-400">
        Unknown = DNS could not be confirmed. Mailbox existence is never asserted — only MX presence is checked.
      </p>
    </div>
  );
}
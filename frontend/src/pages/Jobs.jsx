import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ListChecks, Search, UploadCloud, RefreshCw, Trash2, Play, Eye } from 'lucide-react';
import { listJobs, deleteJob, retryJob, startJob } from '../api/client.js';
import { JobStatusBadge, EmptyState } from '../components/ui.jsx';
import Pagination from '../components/Pagination.jsx';
import { formatNumber, timeAgo, formatDuration } from '../utils/format.js';

const STATUS_FILTERS = ['all', 'pending', 'running', 'completed', 'failed', 'cancelled'];

export default function Jobs() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const page = Number(params.get('page')) || 1;
  const status = params.get('status') || 'all';
  const q = params.get('q') || '';

  const [searchDraft, setSearchDraft] = useState(q);
  useEffect(() => setSearchDraft(q), [q]);

  const load = useCallback(() => {
    setLoading(true);
    const query = { page, limit: 10 };
    if (status !== 'all') query.status = status;
    if (q) query.q = q;
    listJobs(query)
      .then((data) => {
        setJobs(data.jobs || []);
        setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, status, q]);

  useEffect(load, [load]);

  // Auto-refresh while something is running so progress stays live.
  useEffect(() => {
    const active = jobs.some((j) => j.status === 'running' || j.status === 'pending');
    if (!active) return undefined;
    const id = setInterval(load, 2500);
    return () => clearInterval(id);
  }, [jobs, load]);

  const updateParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'all') next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const submitSearch = (e) => {
    e.preventDefault();
    updateParam('q', searchDraft.trim());
  };

  const act = async (job, action) => {
    setBusyId(job._id);
    setError(null);
    try {
      if (action === 'delete') {
        if (!window.confirm(`Delete "${job.originalName}" and all its results?`)) return;
        await deleteJob(job._id);
      } else if (action === 'retry') {
        await retryJob(job._id);
      } else if (action === 'start') {
        await startJob(job._id, {});
      }
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5 animate-fadeUp">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Validation jobs</h2>
          <p className="text-sm text-slate-500">
            {pagination.total ? `${formatNumber(pagination.total)} job${pagination.total === 1 ? '' : 's'}` : 'No jobs yet'}
          </p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/upload')}>
          <UploadCloud className="h-4 w-4" />
          New upload
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form onSubmit={submitSearch} className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input !pl-9"
            placeholder="Search by filenameâ€¦"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
          />
        </form>

        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => updateParam('status', s)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold capitalize transition
                ${status === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
            >
              {s}
            </button>
          ))}
        </div>

        <button className="btn-secondary !py-2" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <div className="card overflow-hidden">
        {loading && jobs.length === 0 ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => <span key={i} className="skeleton block h-12 w-full" />)}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="No jobs found"
            subtitle={q || status !== 'all'
              ? 'Try clearing your search or status filter.'
              : 'Upload a file to create your first validation job.'}
            action={!q && status === 'all'
              ? <button className="btn-primary" onClick={() => navigate('/upload')}>Upload a file</button>
              : null}
          />
        ) : (
          <div className="overflow-x-auto thin-scroll">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-bold">File</th>
                  <th className="px-3 py-3 font-bold">Status</th>
                  <th className="px-3 py-3 font-bold">Progress</th>
                  <th className="px-3 py-3 font-bold text-right">Unique</th>
                  <th className="px-3 py-3 font-bold text-right">Valid</th>
                  <th className="px-3 py-3 font-bold text-right">Invalid</th>
                  <th className="px-3 py-3 font-bold text-right">Risky</th>
                  <th className="px-3 py-3 font-bold text-right">Unknown</th>
                  <th className="px-3 py-3 font-bold">Created</th>
                  <th className="px-5 py-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job) => {
                  const isRunning = job.status === 'running' || busyId === job._id;
                  const canStart = ['pending', 'failed', 'cancelled'].includes(job.status)
                    && job.uniqueEmails > 0;
                  return (
                    <tr key={job._id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5">
                        <button
                          className="text-left font-semibold text-slate-800 hover:text-brand-600"
                          onClick={() => navigate(`/jobs/${job._id}`)}
                        >
                          {job.originalName}
                        </button>
                        <span className="block text-[10px] text-slate-400">
                          {job.emailColumn ? `column: ${job.emailColumn}` : 'column not set'}
                          {job.duplicateCount > 0 && ` · ${formatNumber(job.duplicateCount)} duplicates`}
                        </span>
                        {job.status === 'failed' && job.error && (
                          <span className="mt-1 block max-w-xs truncate text-[10px] font-medium text-rose-600">
                            {job.error}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3.5"><JobStatusBadge status={job.status} /></td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${isRunning ? 'bg-brand-500 animate-pulse' : 'bg-brand-600'}`}
                              style={{ width: `${job.progress || 0}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-semibold text-slate-500 tabular-nums">{job.progress || 0}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-right font-semibold text-slate-700 tabular-nums">{formatNumber(job.uniqueEmails)}</td>
                      <td className="px-3 py-3.5 text-right font-bold text-emerald-600 tabular-nums">{formatNumber(job.validCount)}</td>
                      <td className="px-3 py-3.5 text-right font-bold text-rose-600 tabular-nums">{formatNumber(job.invalidCount)}</td>
                      <td className="px-3 py-3.5 text-right font-bold text-amber-600 tabular-nums">{formatNumber(job.riskyCount)}</td>
                      <td className="px-3 py-3.5 text-right font-bold text-slate-500 tabular-nums">{formatNumber(job.unknownCount)}</td>
                      <td className="px-3 py-3.5 whitespace-nowrap text-slate-500">
                        {timeAgo(job.createdAt)}
                        {job.completedAt && job.startedAt && (
                          <span className="block text-[10px] text-slate-400">
                            took {formatDuration(new Date(job.completedAt) - new Date(job.startedAt))}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button className="btn-ghost !p-1.5" title="View" onClick={() => navigate(`/jobs/${job._id}`)}>
                            <Eye className="h-4 w-4" />
                          </button>
                          {canStart && (
                            <button
                              className="btn-ghost !p-1.5"
                              title={job.status === 'pending' ? 'Start' : 'Retry'}
                              onClick={() => act(job, job.status === 'pending' ? 'start' : 'retry')}
                              disabled={busyId === job._id}
                            >
                              <Play className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            className="btn-ghost !p-1.5 text-rose-600 hover:!bg-rose-50"
                            title="Delete"
                            onClick={() => act(job, 'delete')}
                            disabled={busyId === job._id || isRunning}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        disabled={loading}
        onChange={(p) => updateParam('page', String(p))}
      />
    </div>
  );
}

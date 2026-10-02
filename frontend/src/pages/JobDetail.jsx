import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Download, RefreshCw, Trash2, Play, CheckCircle2,
  XCircle, AlertTriangle, HelpCircle, Layers, FileSpreadsheet, Loader2,
} from 'lucide-react';
import {
  getJob, getJobResults, deleteJob, retryJob, startJob, downloadUrl,
} from '../api/client.js';
import { StatCard, ProgressBar, JobStatusBadge, EmptyState } from '../components/ui.jsx';
import ResultsTable from '../components/ResultsTable.jsx';
import Pagination from '../components/Pagination.jsx';
import { formatNumber, formatDate, formatDuration, timeAgo } from '../utils/format.js';

const DOWNLOADS = [
  { kind: 'valid', label: 'Valid', icon: CheckCircle2 },
  { kind: 'invalid', label: 'Invalid', icon: XCircle },
  { kind: 'risky', label: 'Risky', icon: AlertTriangle },
  { kind: 'unknown', label: 'Unknown', icon: HelpCircle },
  { kind: 'all', label: 'All results', icon: Layers },
];

export default function JobDetail() {
  const { jobId } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [results, setResults] = useState([]);
  const [counts, setCounts] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loadingJob, setLoadingJob] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');

  useEffect(() => setSearchDraft(search), [search]);

  // Debounce search input so we don't fire a request per keystroke.
  useEffect(() => {
    if (searchDraft === search) return undefined;
    const t = setTimeout(() => { setSearch(searchDraft.trim()); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchDraft, search]);

  const loadJob = useCallback(() => {
    return getJob(jobId)
      .then((data) => { setJob(data.job); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingJob(false));
  }, [jobId]);

  const loadResults = useCallback(() => {
    setLoadingRows(true);
    const params = { page, limit: 25 };
    if (statusFilter && statusFilter !== 'ALL') params.status = statusFilter;
    if (search) params.q = search;
    return getJobResults(jobId, params)
      .then((data) => {
        setResults(data.results || []);
        setCounts(data.counts || null);
        setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingRows(false));
  }, [jobId, page, statusFilter, search]);

  useEffect(() => { loadJob(); }, [loadJob]);
  useEffect(() => { loadResults(); }, [loadResults]);

  // Poll while the job is live so progress and rows stay current.
  useEffect(() => {
    if (!job || !['running', 'pending'].includes(job.status)) return undefined;
    const id = setInterval(() => { loadJob(); loadResults(); }, 3000);
    return () => clearInterval(id);
  }, [job, loadJob, loadResults]);

  const changeFilter = (setter) => (value) => { setter(value); setPage(1); };

  const act = async (action) => {
    setBusy(true);
    setError(null);
    try {
      if (action === 'delete') {
        if (!window.confirm(`Delete "${job.originalName}" and all its results?`)) {
          setBusy(false);
          return;
        }
        await deleteJob(job._id);
        navigate('/jobs');
        return;
      }
      if (action === 'retry') await retryJob(job._id);
      if (action === 'start') await startJob(job._id, {});
      await loadJob();
      await loadResults();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const statCards = useMemo(() => ([
    { label: 'Valid', value: counts?.valid ?? job?.validCount, icon: CheckCircle2, accent: 'emerald' },
    { label: 'Invalid', value: counts?.invalid ?? job?.invalidCount, icon: XCircle, accent: 'rose' },
    { label: 'Risky', value: counts?.risky ?? job?.riskyCount, icon: AlertTriangle, accent: 'amber' },
    { label: 'Unknown', value: counts?.unknown ?? job?.unknownCount, icon: HelpCircle, accent: 'slate' },
  ]), [counts, job]);

  if (loadingJob) {
    return (
      <div className="space-y-4">
        <span className="skeleton block h-8 w-64" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <span key={i} className="skeleton block h-28 w-full" />)}
        </div>
        <span className="skeleton block h-64 w-full" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="card">
        <EmptyState
          icon={FileSpreadsheet}
          title={error || 'Job not found'}
          subtitle="It may have been deleted."
          action={<Link to="/jobs" className="btn-primary">Back to jobs</Link>}
        />
      </div>
    );
  }

  const isRunning = job.status === 'running';
  const canStart = ['pending', 'failed', 'cancelled'].includes(job.status) && job.uniqueEmails > 0;
  const duration = job.startedAt
    ? formatDuration(new Date(job.completedAt || Date.now()) - new Date(job.startedAt))
    : '—';

  return (
    <div className="space-y-6 animate-fadeUp">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <button className="btn-ghost !p-2" onClick={() => navigate('/jobs')} title="Back to jobs">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{job.originalName}</h2>
              <JobStatusBadge status={job.status} />
            </div>
            <p className="text-xs text-slate-500">
              {job.emailColumn ? `Column “${job.emailColumn}” · ` : ''}
              {formatNumber(job.uniqueEmails)} unique of {formatNumber(job.totalEmails)} rows
              {job.duplicateCount > 0 && ` · ${formatNumber(job.duplicateCount)} duplicates removed`}
            </p>
            <p className="text-[11px] text-slate-400">
              Created {formatDate(job.createdAt)}{job.startedAt && ` · started ${timeAgo(job.startedAt)}`}{job.status === 'completed' && ` · took ${duration}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canStart && (
            <button className="btn-primary" onClick={() => act(job.status === 'pending' ? 'start' : 'retry')} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {job.status === 'pending' ? 'Start validation' : 'Retry failed'}
            </button>
          )}
          <button className="btn-secondary" onClick={loadJob} disabled={loadingJob}>
            <RefreshCw className={`h-4 w-4 ${isRunning ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button className="btn-danger" onClick={() => act('delete')} disabled={busy || isRunning}>
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {/* Progress */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Progress</p>
            <p className="mt-0.5 text-sm text-slate-600">
              <span className="font-bold text-slate-900 tabular-nums">{formatNumber(job.processedEmails)}</span>
              {' '}of{' '}
              <span className="font-bold text-slate-900 tabular-nums">{formatNumber(job.uniqueEmails)}</span>
              {' '}emails processed
            </p>
          </div>
          {job.status === 'failed' && job.error && (
            <p className="max-w-md rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{job.error}</p>
          )}
        </div>
        <div className="mt-3">
          <ProgressBar value={job.progress} running={isRunning} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((card) => (
          <StatCard key={card.label} {...card} loading={loadingJob} />
        ))}
      </div>

      {/* Downloads */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Download results</h3>
            <p className="text-xs text-slate-500">
              CSV export includes status, MX, disposable, role, reasons and timestamps.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {DOWNLOADS.map(({ kind, label, icon: Icon }) => (
              <a
                key={kind}
                href={downloadUrl(job._id, kind)}
                className="btn-secondary !py-2 !text-xs"
                download
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                <Download className="h-3 w-3 opacity-60" />
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="space-y-4">
        <ResultsTable
          results={results}
          loading={loadingRows}
          search={searchDraft}
          onSearchChange={setSearchDraft}
          statusFilter={statusFilter}
          onStatusFilterChange={(v) => { setStatusFilter(v); setPage(1); }}
        />

        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          disabled={loadingRows}
          onChange={(p) => setPage(p)}
        />
      </div>

      <p className="text-center text-[11px] text-slate-400">
        Mailbox verification is always “not_checked”: an MX record proves the domain accepts mail,
        not that the mailbox exists. No SMTP probing is performed.
      </p>
    </div>
  );
}

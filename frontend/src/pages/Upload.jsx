import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle,
  Loader2, ArrowRight, Columns3,
} from 'lucide-react';
import { uploadJob, startJob } from '../api/client.js';
import { formatBytes } from '../utils/format.js';

const MAX_SIZE = 20 * 1024 * 1024; // mirrors the backend multer limit
const ACCEPTED = '.csv,.xls,.xlsx';

export default function Upload() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploadPct, setUploadPct] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | uploading | parsing | needsColumn | starting | error
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null); // { job, detection, columns }
  const [selectedColumn, setSelectedColumn] = useState(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const reset = () => {
    setFile(null); setUploadPct(null); setPhase('idle');
    setError(null); setMeta(null); setSelectedColumn(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const validate = (f) => {
    if (!f) return 'No file selected.';
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!['csv', 'xls', 'xlsx'].includes(ext)) return 'Only CSV, XLS, and XLSX files are supported.';
    if (f.size > MAX_SIZE) return `File is too large (${formatBytes(f.size)}). Maximum is 20 MB.`;
    return null;
  };

  const beginUpload = async (f) => {
    const problem = validate(f);
    if (problem) { setError(problem); return; }
    setError(null);
    setFile(f);
    setPhase('uploading');
    setUploadPct(0);
    try {
      const data = await uploadJob(f, setUploadPct);
      setMeta({ job: data.job, detection: data.detection, columns: data.job?.columns || [] });

      if (data.needsColumnSelection) {
        setSelectedColumn(null);
        setPhase('needsColumn');
        return;
      }

      setPhase('starting');
      const started = await startJob(data.job._id);
      navigate(`/jobs/${started.job._id}`);
    } catch (err) {
      setError(err.message);
      setPhase('error');
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) beginUpload(f);
  };

  const startWithColumn = async () => {
    if (selectedColumn === null || !meta?.job) {
      setError('Select the column that contains email addresses.');
      return;
    }
    setError(null);
    setPhase('starting');
    try {
      const started = await startJob(meta.job._id, { emailColumn: selectedColumn });
      navigate(`/jobs/${started.job._id}`);
    } catch (err) {
      setError(err.message);
      setPhase('needsColumn');
    }
  };

  const busy = ['uploading', 'parsing', 'starting'].includes(phase);

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fadeUp">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Upload a list</h2>
        <p className="text-sm text-slate-500">
          Upload a CSV, XLS, or XLSX file containing email addresses. We detect the email column
          automatically — you can override it if needed.
        </p>
      </div>
{/* Dropzone / selection */}
      {phase === 'idle' || phase === 'error' ? (
        <div
          className={`card border-2 border-dashed p-8 text-center transition-colors
            ${dragging ? 'border-brand-400 bg-brand-50/50' : 'border-slate-200 hover:border-slate-300'}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => beginUpload(e.target.files?.[0])}
          />
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-600">
            <UploadCloud className="h-8 w-8" />
          </span>
          <h3 className="mt-4 text-base font-bold text-slate-900">Drop your file here</h3>
          <p className="mt-1 text-sm text-slate-500">or</p>
          <button className="btn-primary mt-3" onClick={() => inputRef.current?.click()}>
            Browse files
          </button>
          <p className="mt-4 text-xs text-slate-400">
            CSV, XLS, XLSX · up to 20 MB · duplicates are removed automatically
          </p>

          {file && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <span className="font-semibold text-slate-700">{file.name}</span>
              <span className="text-slate-400">{formatBytes(file.size)}</span>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left text-xs text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      ) : null}
{/* Manual column selection when auto-detection fails */}
      {phase === 'needsColumn' && meta && (
        <div className="card p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
              <Columns3 className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Choose the email column</h3>
              <p className="text-xs text-slate-500">
                We could not confidently detect which column holds email addresses.
                Pick one below to continue.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(meta.columns || []).map((col, i) => (
              <label
                key={`${col}-${i}`}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition
                  ${selectedColumn === i
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700'}`}
              >
                <input
                  type="radio"
                  name="emailColumn"
                  className="accent-brand-600"
                  checked={selectedColumn === i}
                  onChange={() => setSelectedColumn(i)}
                />
                <span className="truncate font-medium">{col}</span>
              </label>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className="btn-primary" onClick={startWithColumn} disabled={selectedColumn === null}>
              <CheckCircle2 className="h-4 w-4" />
              Start validation
              <ArrowRight className="h-4 w-4" />
            </button>
            <button className="btn-secondary" onClick={reset}>Cancel</button>
            {error && <span className="text-xs font-semibold text-rose-600">{error}</span>}
          </div>
        </div>
      )}
{/* Upload / parse progress */}
      {busy && (
        <div className="card p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">
                {phase === 'uploading' && `Uploading ${file?.name}…`}
                {phase === 'parsing' && 'Detecting email column…'}
                {phase === 'starting' && 'Starting validation…'}
              </p>
              {phase === 'uploading' && (
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${uploadPct || 0}%` }} />
                </div>
              )}
            </div>
            {phase === 'uploading' && <span className="text-xs font-bold text-slate-600 tabular-nums">{uploadPct || 0}%</span>}
          </div>
        </div>
      )}

      {/* Help */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { t: '1. Upload', d: 'CSV, XLS or XLSX with a column of email addresses.' },
          { t: '2. Validate', d: 'Syntax, DNS/MX, disposable and role-account checks run per row.' },
          { t: '3. Download', d: 'Export VALID / INVALID / RISKY / UNKNOWN results as CSV.' },
        ].map((s) => (
          <div key={s.t} className="card p-4">
            <p className="text-xs font-bold text-brand-600">{s.t}</p>
            <p className="mt-1 text-xs text-slate-500">{s.d}</p>
          </div>
        ))}
      </div>

      <p className="text-center text-[11px] text-slate-400">
        Files are processed in batches; live progress appears on the job page.
      </p>
    </div>
  );
}
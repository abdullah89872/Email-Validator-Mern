import { useEffect, useState } from 'react';
import {
  Settings2, Server, Database, Shield, Info, RefreshCw, ExternalLink, Sparkles,
} from 'lucide-react';
import { fetchHealth, apiBaseUrl } from '../api/client.js';

function Row({ label, value, ok }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="flex items-center gap-2 text-xs font-semibold text-slate-800">
        {typeof ok === 'boolean' && (
          <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        )}
        {value}
      </span>
    </div>
  );
}

export default function Settings({ health: healthProp }) {
  const [health, setHealth] = useState(healthProp || null);
  const [loading, setLoading] = useState(!healthProp);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    fetchHealth()
      .then((data) => { setHealth(data); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fadeUp">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Settings</h2>
        <p className="text-sm text-slate-500">Environment, service status and configuration notes.</p>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-bold text-slate-900">Service status</h3>
          </div>
          <button className="btn-ghost !py-1.5 !text-xs" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Re-check
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-2 divide-y divide-slate-100">
          <Row label="Express API" value={health ? 'Reachable' : loading ? '…' : 'Unreachable'} ok={Boolean(health)} />
          <Row label="Python validator" value={health ? (health.validator === 'up' ? 'Up' : 'Down') : '…'} ok={health?.validator === 'up'} />
          <Row label="MongoDB" value={health ? (health.mongo === 'connected' ? 'Connected' : 'Disconnected') : '…'} ok={health?.mongo === 'connected'} />
          <Row label="API base URL" value={apiBaseUrl} />
          <Row label="Service version" value={health?.version || '—'} />
          <Row label="Server time" value={health ? new Date(health.time).toLocaleString() : '—'} />
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-bold text-slate-900">Configuration</h3>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Values are read from each service&apos;s <code className="rounded bg-slate-100 px-1">.env</code> file.
          See <code className="rounded bg-slate-100 px-1">.env.example</code> in every folder for the full list.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            {
              title: 'frontend/',
              icon: Sparkles,
              items: ['VITE_API_BASE_URL', 'Points at the Node API', 'React never calls Python'],
            },
            {
              title: 'backend/',
              icon: Database,
              items: ['MONGO_URI', 'VALIDATOR_URL', 'VALIDATION_BATCH_SIZE', 'MAX_FILE_SIZE'],
            },
            {
              title: 'validator/',
              icon: Server,
              items: ['PORT', 'DNS_TIMEOUT', 'MAX_CONCURRENCY', 'MAX_EMAILS_PER_REQUEST'],
            },
          ].map((block) => (
            <div key={block.title} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <p className="text-xs font-bold text-slate-800">{block.title}</p>
              <ul className="mt-2 space-y-1">
                {block.items.map((item) => (
                  <li key={item} className="text-[11px] text-slate-500 break-all">• {item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-slate-900">Validation policy</h3>
        </div>
        <ul className="mt-3 space-y-2 text-xs text-slate-600">
          <li className="flex gap-2">
            <span className="text-brand-600">•</span>
            Checks performed: RFC syntax, domain existence, MX/A records, disposable-domain list,
            role-based local-parts.
          </li>
          <li className="flex gap-2">
            <span className="text-brand-600">•</span>
            <span>
              <strong className="text-slate-800">No SMTP probing.</strong> Mailbox verification stays{' '}
              <code className="rounded bg-slate-100 px-1">not_checked</code> — an MX record proves the
              domain accepts mail, never that a specific mailbox exists.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-600">•</span>
            <strong className="text-slate-800">No fake data.</strong> Every count, reason and chart
            value comes from real MongoDB records produced by real DNS checks.
          </li>
          <li className="flex gap-2">
            <span className="text-brand-600">•</span>
            <strong className="text-slate-800">Statuses:</strong>&nbsp;
            <span>VALID · INVALID · RISKY · UNKNOWN — each row carries its own reasons list.</span>
          </li>
        </ul>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-900">About</h3>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          EmailClean AI — a three-tier email validation SaaS.
          React (Vite) → Node/Express + MongoDB → Python FastAPI validation service.
        </p>
        <p className="mt-2 text-[11px] text-slate-400">
          The optional AI assistant layer (<code className="rounded bg-slate-100 px-1">aiService.js</code>)
          exposes read-only tools over real job data and is disabled unless{' '}
          <code className="rounded bg-slate-100 px-1">AI_API_KEY</code> is set.
        </p>
        <a
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
          href="https://fastapi.tiangolo.com/"
          target="_blank"
          rel="noreferrer"
        >
          FastAPI docs <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}


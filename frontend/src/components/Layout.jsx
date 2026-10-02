import { NavLink, Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard, UploadCloud, ListChecks, Settings2, Sparkles,
  Menu, X,
} from 'lucide-react';
import SystemStatus from './SystemStatus.jsx';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/upload', label: 'Upload', icon: UploadCloud },
  { to: '/jobs', label: 'Jobs', icon: ListChecks },
  { to: '/settings', label: 'Settings', icon: Settings2 },
];

function Logo() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5 group">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-600/25 group-hover:scale-105 transition-transform">
        <Sparkles className="h-5 w-5 text-white" />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-extrabold tracking-tight text-slate-900">
          EmailClean<span className="text-brand-600"> AI</span>
        </span>
        <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
          List hygiene
        </span>
      </span>
    </Link>
  );
}

export default function Layout({ children, health }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const statusColors = { ok: 'bg-emerald-500', warn: 'bg-amber-500', error: 'bg-rose-500' };
  const statusKey = !health ? 'warn'
    : health.validator === 'up' && health.mongo === 'connected' ? 'ok' : 'warn';

  return (
    <div className="min-h-screen bg-surface-100">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-slate-200 bg-white
          transition-transform duration-200 lg:translate-x-0
          ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-16 items-center justify-between px-5 border-b border-slate-100">
          <Logo />
          <button className="lg:hidden btn-ghost !p-1.5" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="p-3 space-y-1">
          <p className="px-3 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Workspace
          </p>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 shadow-sm shadow-brand-600/10'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-0 inset-x-0 p-4">
          <SystemStatus health={health} />
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 backdrop-blur px-4 sm:px-6">
          <button className="lg:hidden btn-ghost !p-2" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden sm:block">
            <h1 className="text-sm font-bold text-slate-900">
              {NAV.find((n) => n.to === location.pathname)?.label || 'EmailClean AI'}
            </h1>
            <p className="text-[11px] text-slate-500">Clean, validate and score your mailing lists</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className={`chip ${
              statusKey === 'ok'
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                : 'bg-amber-50 text-amber-700 ring-amber-600/20'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusColors[statusKey]}`} />
              {statusKey === 'ok' ? 'All systems operational' : 'Degraded'}
            </span>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">{children}</main>
      </div>
    </div>
  );
}

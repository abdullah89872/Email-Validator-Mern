import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Upload from './pages/Upload.jsx';
import Jobs from './pages/Jobs.jsx';
import JobDetail from './pages/JobDetail.jsx';
import Settings from './pages/Settings.jsx';
import { fetchHealth } from './api/client.js';

export default function App() {
  const [health, setHealth] = useState(null);

  // Poll system health so the sidebar indicators stay honest.
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchHealth()
        .then((data) => { if (alive) setHealth(data); })
        .catch(() => { if (alive) setHealth(null); });

    load();
    const id = setInterval(load, 20000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <Layout health={health}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/:jobId" element={<JobDetail />} />
        <Route path="/settings" element={<Settings health={health} />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  );
}

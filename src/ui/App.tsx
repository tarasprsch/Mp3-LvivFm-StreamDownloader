import { useEffect, useState } from 'react';
import { Activity, FileText, Settings, SlidersHorizontal } from 'lucide-react';
import { Login } from './components/Login';
import { LogsPage } from './pages/LogsPage';
import { MainPage } from './pages/MainPage';
import { SettingsPage } from './pages/SettingsPage';
import type { Page, StateResponse } from './types';

export function App() {
  const [authenticated, setAuthenticated] = useState<boolean | undefined>(undefined);
  const [page, setPage] = useState<Page>('main');
  const [state, setState] = useState<StateResponse | undefined>();
  const [error, setError] = useState('');

  async function refresh() {
    const response = await fetch('/api/state');
    if (response.status === 401) {
      setAuthenticated(false);
      return;
    }
    if (!response.ok) throw new Error('Unable to load state.');
    setState(await response.json());
    setAuthenticated(true);
  }

  useEffect(() => {
    void refresh().catch((loadError: Error) => setError(loadError.message));
    const timer = setInterval(() => void refresh().catch(() => undefined), 5000);
    return () => clearInterval(timer);
  }, []);

  if (authenticated === undefined) return <div className="boot">Lviv FM Stream Recorder</div>;
  if (!authenticated) return <Login onLogin={() => void refresh()} />;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <Activity size={22} />
          <span>Lviv FM</span>
        </div>
        <button className={page === 'main' ? 'active' : ''} onClick={() => setPage('main')}>
          <SlidersHorizontal size={18} /> Main
        </button>
        <button className={page === 'logs' ? 'active' : ''} onClick={() => setPage('logs')}>
          <FileText size={18} /> Logs
        </button>
        <button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}>
          <Settings size={18} /> Settings
        </button>
      </aside>
      <main>
        {error && <div className="notice danger">{error}</div>}
        {page === 'main' && state && <MainPage state={state} onRefresh={refresh} />}
        {page === 'logs' && <LogsPage />}
        {page === 'settings' && <SettingsPage onLogout={() => setAuthenticated(false)} />}
      </main>
    </div>
  );
}

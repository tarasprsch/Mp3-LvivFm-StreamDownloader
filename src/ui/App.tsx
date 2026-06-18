import { useEffect, useState } from 'react';
import { Activity, FileText, LogOut, Settings, SlidersHorizontal } from 'lucide-react';
import { Login } from './components/Login';
import { LogsPage } from './pages/LogsPage';
import { MainPage } from './pages/MainPage';
import { SettingsPage } from './pages/SettingsPage';
import type { Page, StateResponse } from './types';
import './App.css';

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

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    setAuthenticated(false);
  }

  if (authenticated === undefined) return <div className="app-boot">Lviv FM Stream Recorder</div>;
  if (!authenticated) return <Login onLogin={() => void refresh()} />;

  return (
    <div className="app">
      <aside className="app__sidebar">
        <div>
          <div className="app__brand">
            <Activity size={22} />
            <span>Lviv FM</span>
          </div>
          <nav className="app__nav" aria-label="Primary">
            <button
              className={page === 'main' ? 'app__nav-button app__nav-button--active' : 'app__nav-button'}
              onClick={() => setPage('main')}
            >
              <SlidersHorizontal size={18} /> Main
            </button>
            <button
              className={page === 'logs' ? 'app__nav-button app__nav-button--active' : 'app__nav-button'}
              onClick={() => setPage('logs')}
            >
              <FileText size={18} /> Logs
            </button>
            <button
              className={page === 'settings' ? 'app__nav-button app__nav-button--active' : 'app__nav-button'}
              onClick={() => setPage('settings')}
            >
              <Settings size={18} /> Settings
            </button>
          </nav>
        </div>
        <div className="app__sidebar-footer">
          <button className="app__nav-button" onClick={() => void logout()}>
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>
      <main className="app__main">
        {error && <div className="app__notice app__notice--danger">{error}</div>}
        {page === 'main' && state && <MainPage state={state} onRefresh={refresh} />}
        {page === 'logs' && <LogsPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

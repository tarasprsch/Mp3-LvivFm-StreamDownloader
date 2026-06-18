import { useEffect, useState } from 'react';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
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
      <Sidebar page={page} onPageChange={setPage} onLogout={() => void logout()} />
      <main className="app__main">
        {error && <div className="app__notice app__notice--danger">{error}</div>}
        {page === 'main' && state && <MainPage state={state} onRefresh={refresh} />}
        {page === 'logs' && <LogsPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

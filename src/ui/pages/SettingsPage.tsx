import { FormEvent, useEffect, useState } from 'react';
import { LogOut, Save } from 'lucide-react';
import type { SettingsResponse } from '../types';

export function SettingsPage({ onLogout }: { onLogout: () => void }) {
  const [settings, setSettings] = useState<SettingsResponse | undefined>();
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void fetch('/api/settings')
      .then((response) => response.json())
      .then(setSettings);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setSaved('');
    setError('');
    const payload = {
      enabled: settings.enabled,
      schedule: settings.schedule,
      recording: { splitSize: Number(settings.recording.splitSize) },
      auth: settings.auth.password ? { password: settings.auth.password } : undefined
    };
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error);
      return;
    }
    setSettings(body);
    setSaved('Saved');
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    onLogout();
  }

  if (!settings) return <div className="boot">Loading settings</div>;

  return (
    <form className="settings" onSubmit={submit}>
      <header className="pageHeader">
        <div>
          <h1>Settings</h1>
          <p>Editable capture settings</p>
        </div>
        <div className="actions">
          <button type="submit">
            <Save size={18} /> Save
          </button>
          <button type="button" onClick={() => void logout()}>
            <LogOut size={18} /> Logout
          </button>
        </div>
      </header>
      <label className="toggle">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })}
        />
        Enabled
      </label>
      <div className="formGrid">
        <label>
          Start
          <input
            type="time"
            value={settings.schedule.start}
            onChange={(event) => setSettings({ ...settings, schedule: { ...settings.schedule, start: event.target.value } })}
          />
        </label>
        <label>
          End
          <input
            type="time"
            value={settings.schedule.end}
            onChange={(event) => setSettings({ ...settings, schedule: { ...settings.schedule, end: event.target.value } })}
          />
        </label>
        <label>
          Split MB
          <input
            type="number"
            min="1"
            step="0.1"
            value={settings.recording.splitSize}
            onChange={(event) =>
              setSettings({ ...settings, recording: { splitSize: Number(event.target.value) } })
            }
          />
        </label>
        <label>
          New password
          <input
            type="password"
            value={settings.auth.password}
            onChange={(event) => setSettings({ ...settings, auth: { password: event.target.value } })}
          />
        </label>
      </div>
      {saved && <div className="notice ok">{saved}</div>}
      {error && <div className="notice danger">{error}</div>}
    </form>
  );
}

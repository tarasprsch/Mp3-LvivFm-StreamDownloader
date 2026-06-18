import { FormEvent, useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import type { SettingsResponse } from '../types';

export function SettingsPage() {
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

  if (!settings) return <div className="boot">Loading settings</div>;

  return (
    <form className="settings" onSubmit={submit}>
      <header className="pageHeader">
        <div>
          <h1>Settings</h1>
          <p>Configuration</p>
        </div>
        <div className="actions">
          <button type="submit">
            <Save size={18} /> Save
          </button>
        </div>
      </header>
      <div className="settingsGroups">
        <section className="settingsGroup">
          <h2>Capture Availability</h2>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })}
            />
            Enabled
          </label>
        </section>
        <section className="settingsGroup">
          <h2>Daily Schedule</h2>
          <div className="formGrid twoColumns">
            <label>
              Start time
              <input
                type="time"
                value={settings.schedule.start}
                onChange={(event) =>
                  setSettings({ ...settings, schedule: { ...settings.schedule, start: event.target.value } })
                }
              />
            </label>
            <label>
              End time
              <input
                type="time"
                value={settings.schedule.end}
                onChange={(event) =>
                  setSettings({ ...settings, schedule: { ...settings.schedule, end: event.target.value } })
                }
              />
            </label>
          </div>
        </section>
        <section className="settingsGroup">
          <h2>File Splitting</h2>
          <label>
            Split size, MB
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
        </section>
        <section className="settingsGroup">
          <h2>Password Security</h2>
          <label>
            New password
            <input
              type="password"
              value={settings.auth.password}
              onChange={(event) => setSettings({ ...settings, auth: { password: event.target.value } })}
            />
          </label>
        </section>
      </div>
      {saved && <div className="notice ok">{saved}</div>}
      {error && <div className="notice danger">{error}</div>}
    </form>
  );
}

import { FormEvent, useState } from 'react';
import { Play } from 'lucide-react';

export function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: 'Invalid password.' }));
      setError(body.error);
      return;
    }
    onLogin();
  }

  return (
    <div className="login">
      <form onSubmit={submit}>
        <h1>Lviv FM Stream Recorder</h1>
        <label>
          Password
          <input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <div className="notice danger">{error}</div>}
        <button type="submit">
          <Play size={18} /> Login
        </button>
      </form>
    </div>
  );
}

import { FormEvent, useState } from 'react';
import { Play } from 'lucide-react';
import './Login.css';

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
      <form className="login__form" onSubmit={submit}>
        <h1>Lviv FM Stream Recorder</h1>
        <label className="login__field">
          Password
          <input
            className="login__input"
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <div className="login__notice login__notice--danger">{error}</div>}
        <button className="login__submit" type="submit">
          <Play size={18} /> Login
        </button>
      </form>
    </div>
  );
}

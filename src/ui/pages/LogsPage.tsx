import { useEffect, useState } from 'react';
import { formatLogLine } from '../format';
import './LogsPage.css';

export function LogsPage() {
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      const response = await fetch(`/api/logs?search=${encodeURIComponent(search)}`);
      const body = await response.json();
      setLines(body.lines);
    }
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [search]);

  return (
    <div className="logs-page">
      <header className="logs-page__header">
        <div>
          <h1>Logs</h1>
          <p>{lines.length} entries</p>
        </div>
        <input
          className="logs-page__search"
          placeholder="Search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </header>
      <pre className="logs-page__output">{lines.map(formatLogLine).join('\n')}</pre>
    </div>
  );
}

import { CircleStop, Play } from 'lucide-react';
import { Metric } from '../components/Metric';
import { formatBytes, formatDate, formatDuration } from '../format';
import type { StateResponse } from '../types';

export function MainPage({ state, onRefresh }: { state: StateResponse; onRefresh: () => Promise<void> }) {
  const disabledMessage = !state.enabled ? 'Capture is disabled in settings.' : '';

  async function command(path: string) {
    const response = await fetch(path, { method: 'POST' });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: 'Command failed.' }));
      alert(body.error);
    }
    await onRefresh();
  }

  return (
    <>
      <header className="pageHeader">
        <div>
          <h1>Main</h1>
          <p>{state.recorder.active ? `Recording ${state.recorder.source}` : 'Recorder idle'}</p>
        </div>
        <div className="actions">
          <button disabled={!state.enabled || state.recorder.active} onClick={() => void command('/api/manual/start')}>
            <Play size={18} /> Start
          </button>
          <button disabled={!state.recorder.active} onClick={() => void command('/api/manual/stop')}>
            <CircleStop size={18} /> Stop
          </button>
        </div>
      </header>
      {disabledMessage && <div className="notice warn">{disabledMessage}</div>}
      <section className="grid">
        <Metric label="State" value={state.recorder.active ? 'Recording' : 'Stopped'} />
        <Metric label="Current file" value={state.recorder.currentFilename ?? '-'} />
        <Metric label="Current size" value={formatBytes(state.recorder.currentSize)} />
        <Metric label="Duration" value={formatDuration(state.recorder.durationSeconds)} />
        <Metric label="Capture start" value={formatDate(state.recorder.startedAt)} />
        <Metric label="Expected stop" value={formatDate(state.expectedStop)} />
        <Metric label="Next start" value={formatDate(state.schedule.nextStart)} />
        <Metric label="Next end" value={formatDate(state.schedule.nextEnd)} />
        <Metric label="Manual override" value={state.manualOverride} />
        <Metric label="Service uptime" value={formatDuration(state.serviceUptimeSeconds)} />
        <Metric label="Files created" value={String(state.stats.filesCreated)} />
        <Metric label="Bytes created" value={formatBytes(state.stats.bytesCreated)} />
        <Metric label="Recording time" value={formatDuration(state.stats.recordingSeconds)} />
        <Metric label="Recording days" value={String(state.stats.recordingDays.length)} />
        <Metric label="Failures" value={String(state.stats.failures)} />
        <Metric label="Last connection" value={formatDate(state.stats.lastSuccessfulConnection)} />
        <Metric label="Last error" value={state.lastError ?? '-'} />
        <Metric label="Available space" value={state.disk ? formatBytes(state.disk.availableBytes) : '-'} />
      </section>
      <section className="wide">
        <h2>Recent Sessions</h2>
        <table>
          <thead>
            <tr>
              <th>Started</th>
              <th>Source</th>
              <th>Status</th>
              <th>Files</th>
              <th>Bytes</th>
            </tr>
          </thead>
          <tbody>
            {state.stats.sessions.map((session) => (
              <tr key={session.id}>
                <td>{formatDate(session.startedAt)}</td>
                <td>{session.source}</td>
                <td>{session.status}</td>
                <td>{session.files}</td>
                <td>{formatBytes(session.bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {state.partialFiles.length > 0 && (
        <section className="wide">
          <h2>Partial Files</h2>
          <div className="chips">
            {state.partialFiles.map((file) => (
              <span key={file.name}>{file.name} - {formatBytes(file.size)}</span>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

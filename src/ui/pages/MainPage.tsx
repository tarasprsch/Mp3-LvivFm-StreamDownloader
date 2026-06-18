import type { ReactNode } from 'react';
import { CircleStop, Play } from 'lucide-react';
import { formatBytes, formatDate, formatDuration } from '../format';
import type { StateResponse } from '../types';

export function MainPage({ state, onRefresh }: { state: StateResponse; onRefresh: () => Promise<void> }) {
  const disabledMessage = !state.enabled ? 'Capture is disabled in settings.' : '';
  const recorderState = state.recorder.active ? 'Recording' : 'Stopped';
  const source = state.recorder.source ? titleCase(state.recorder.source) : '-';

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
          <p>{state.recorder.active ? `${source} recording` : 'Recorder idle'}</p>
        </div>
        <div className="controlActions">
          <button
            className="controlButton start"
            disabled={!state.enabled || state.recorder.active}
            onClick={() => void command('/api/manual/start')}
          >
            <Play size={24} /> Start
          </button>
          <button
            className="controlButton stop"
            disabled={!state.recorder.active}
            onClick={() => void command('/api/manual/stop')}
          >
            <CircleStop size={24} /> Stop
          </button>
        </div>
      </header>
      {disabledMessage && <div className="notice warn">{disabledMessage}</div>}
      <section className="statusStrip" aria-label="Recorder status">
        <div>
          <span>Status</span>
          <strong>{recorderState}</strong>
        </div>
        <div>
          <span>Current file</span>
          <strong>{state.recorder.currentFilename ?? '-'}</strong>
        </div>
        <div>
          <span>Current size</span>
          <strong>{formatBytes(state.recorder.currentSize)}</strong>
        </div>
      </section>
      <section className="dashboardGroups">
        <InfoGroup title="Live Recording">
          <InfoRow label="Source" value={source} />
          <InfoRow label="Capture start" value={formatDate(state.recorder.startedAt)} />
          <InfoRow label="Duration" value={formatDuration(state.recorder.durationSeconds)} />
          <InfoRow label="Files in session" value={String(state.recorder.filesInSession)} />
          <InfoRow label="Bytes in session" value={formatBytes(state.recorder.bytesInSession)} />
        </InfoGroup>
        <InfoGroup title="Schedule">
          <InfoRow label="Schedule state" value={state.schedule.active ? 'Active window' : 'Waiting'} />
          <InfoRow label="Expected stop" value={formatDate(state.expectedStop)} />
          <InfoRow label="Next start" value={formatDate(state.schedule.nextStart)} />
          <InfoRow label="Next end" value={formatDate(state.schedule.nextEnd)} />
        </InfoGroup>
        <InfoGroup title="Recording Totals">
          <InfoRow label="Service uptime" value={formatDuration(state.serviceUptimeSeconds)} />
          <InfoRow label="Recording time" value={formatDuration(state.stats.recordingSeconds)} />
          <InfoRow label="Files created" value={String(state.stats.filesCreated)} />
          <InfoRow label="Bytes created" value={formatBytes(state.stats.bytesCreated)} />
          <InfoRow label="Recording days" value={String(state.stats.recordingDays.length)} />
        </InfoGroup>
        <InfoGroup title="Health And Storage">
          <InfoRow label="Failures" value={String(state.stats.failures)} />
          <InfoRow label="Last connection" value={formatDate(state.stats.lastSuccessfulConnection)} />
          <InfoRow label="Last error" value={state.lastError ?? state.stats.lastError ?? '-'} />
          <InfoRow label="Disk total" value={state.disk ? formatBytes(state.disk.totalBytes) : '-'} />
          <InfoRow label="Available space" value={state.disk ? formatBytes(state.disk.availableBytes) : '-'} />
        </InfoGroup>
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

function InfoGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="infoGroup">
      <h2>{title}</h2>
      <dl>{children}</dl>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="infoRow">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

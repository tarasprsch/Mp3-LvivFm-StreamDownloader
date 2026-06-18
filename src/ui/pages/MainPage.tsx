import type { ReactNode } from 'react';
import { CircleStop, Play, Trash2 } from 'lucide-react';
import { formatBytes, formatDate, formatDuration } from '../format';
import type { StateResponse } from '../types';
import './MainPage.css';

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

  async function deletePartialFile(name: string) {
    const response = await fetch(`/api/partial-files/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: 'Delete failed.' }));
      alert(body.error);
      return;
    }
    await onRefresh();
  }

  return (
    <div className="main-page">
      <header className="main-page__header">
        <div>
          <h1>Main</h1>
          <p>{state.recorder.active ? `${source} recording` : 'Recorder idle'}</p>
        </div>
        <div className="main-page__control-actions">
          <button
            className="main-page__control-button main-page__control-button--start"
            disabled={!state.enabled || state.recorder.active}
            onClick={() => void command('/api/manual/start')}
          >
            <Play size={24} /> Start
          </button>
          <button
            className="main-page__control-button main-page__control-button--stop"
            disabled={!state.recorder.active}
            onClick={() => void command('/api/manual/stop')}
          >
            <CircleStop size={24} /> Stop
          </button>
        </div>
      </header>
      {disabledMessage && <div className="main-page__notice main-page__notice--warn">{disabledMessage}</div>}
      <section className="main-page__status-strip" aria-label="Recorder status">
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
      <section className="main-page__dashboard-groups">
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
      <section className="main-page__wide">
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
        <section className="main-page__wide main-page__partial-files">
          <div className="main-page__partial-files-header">
            <div>
              <h2>Partial Files</h2>
              <p>{state.partialFiles.length} unfinished {state.partialFiles.length === 1 ? 'file' : 'files'}</p>
            </div>
          </div>
          <div className="main-page__partial-files-table" role="table" aria-label="Partial files">
            <div className="main-page__partial-files-head" role="row">
              <span role="columnheader">File</span>
              <span role="columnheader">Size</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Action</span>
            </div>
            {state.partialFiles.map((file) => {
              const isCurrent = isCurrentPartialFile(state, file.name);
              return (
                <div
                  className={
                    isCurrent
                      ? 'main-page__partial-file main-page__partial-file--current'
                      : 'main-page__partial-file'
                  }
                  key={file.name}
                  role="row"
                >
                  <span className="main-page__partial-file-name" role="cell">{file.name}</span>
                  <span className="main-page__partial-file-size" role="cell">{formatBytes(file.size)}</span>
                  <span
                    className={
                      isCurrent
                        ? 'main-page__partial-file-status main-page__partial-file-status--current'
                        : 'main-page__partial-file-status'
                    }
                    role="cell"
                  >
                    {isCurrent ? 'Recording' : 'Partial'}
                  </span>
                  <span className="main-page__partial-file-action" role="cell">
                    {isCurrent ? (
                      <span className="main-page__partial-file-locked">Current</span>
                    ) : (
                      <button
                        className="main-page__icon-button main-page__icon-button--danger"
                        type="button"
                        aria-label={`Delete ${file.name}`}
                        title="Delete partial file"
                        onClick={() => void deletePartialFile(file.name)}
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function InfoGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="main-page__info-group">
      <h2>{title}</h2>
      <dl>{children}</dl>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="main-page__info-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function isCurrentPartialFile(state: StateResponse, name: string): boolean {
  if (name === state.recorder.currentPartFilename) return true;
  return Boolean(
    state.recorder.active &&
      state.recorder.currentFilename &&
      name.startsWith(`${state.recorder.currentFilename}.`) &&
      name.endsWith('.part')
  );
}

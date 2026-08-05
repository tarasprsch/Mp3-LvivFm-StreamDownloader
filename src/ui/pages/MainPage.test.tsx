import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MainPage } from './MainPage';
import type { StateResponse } from '../types';

describe('MainPage partial files', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('disables the stop button when recording is stopped', () => {
    const pageState = state();
    pageState.recorder.active = false;

    render(<MainPage state={pageState} onRefresh={async () => undefined} />);

    expect(screen.getByRole('button', { name: /stop/i })).toBeDisabled();
  });

  it('places the configured online player between status and dashboard sections', () => {
    const pageState = state();
    pageState.stream.url = 'https://radio.example.test/live';

    const { container } = render(
      <MainPage state={pageState} onRefresh={async () => undefined} />
    );

    const status = container.querySelector('.main-page__status-strip');
    const player = container.querySelector('.main-page__stream-player');
    const dashboard = container.querySelector('.main-page__dashboard-groups');
    const audio = screen.getByLabelText('Lviv FM online stream');
    expect(status?.nextElementSibling).toBe(player);
    expect(player?.nextElementSibling).toBe(dashboard);
    expect(audio).toHaveAttribute('src', 'https://radio.example.test/live');
    expect(audio).toHaveAttribute('controls');
    expect(audio).toHaveAttribute('preload', 'none');
    expect(audio).not.toHaveAttribute('autoplay');
  });

  it.each([
    { enabled: false, active: false },
    { enabled: true, active: true }
  ])('keeps the online player visible for recorder state $enabled/$active', ({ enabled, active }) => {
    const pageState = state();
    pageState.enabled = enabled;
    pageState.recorder.active = active;

    render(<MainPage state={pageState} onRefresh={async () => undefined} />);

    expect(screen.getByRole('heading', { name: 'Online Stream' })).toBeInTheDocument();
  });

  it('keeps recorder controls usable when the online stream fails', () => {
    const pageState = state();
    pageState.recorder.active = false;
    render(<MainPage state={pageState} onRefresh={async () => undefined} />);

    fireEvent.error(screen.getByLabelText('Lviv FM online stream'));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to play the configured stream in this browser.'
    );
    expect(screen.getByRole('button', { name: /start/i })).toBeEnabled();
  });

  it('shows partial files in rows and protects the current recording partial', () => {
    render(<MainPage state={state()} onRefresh={async () => undefined} />);

    expect(screen.getByText('old.mp3.part')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete old.mp3.part')).toBeInTheDocument();
    expect(screen.queryByLabelText('Delete active.mp3.part')).not.toBeInTheDocument();
    const currentRow = screen.getByText('active.mp3.part').closest('.main-page__partial-file');
    expect(currentRow).toHaveClass('main-page__partial-file--current');
    expect(within(currentRow as HTMLElement).getByText('Recording')).toBeInTheDocument();
    expect(within(currentRow as HTMLElement).getByText('Current')).toBeInTheDocument();
  });

  it('protects a generated active partial when the exact partial filename is absent from state', () => {
    const pageState = state();
    pageState.recorder.currentFilename = '2026-06-18__01.mp3';
    pageState.recorder.currentPartFilename = undefined;
    pageState.partialFiles = [
      { name: '2026-06-18__01.mp3.123.456.part', size: 1000 },
      { name: 'old.mp3.part', size: 2000 }
    ];

    render(<MainPage state={pageState} onRefresh={async () => undefined} />);

    expect(screen.queryByLabelText('Delete 2026-06-18__01.mp3.123.456.part')).not.toBeInTheDocument();
    expect(screen.getByText('2026-06-18__01.mp3.123.456.part').closest('.main-page__partial-file')).toHaveClass(
      'main-page__partial-file--current'
    );
  });

  it('deletes an old partial file and refreshes state', async () => {
    const refresh = vi.fn(async () => undefined);
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true })
    } as Response);
    render(<MainPage state={state()} onRefresh={refresh} />);

    fireEvent.click(screen.getByLabelText('Delete old.mp3.part'));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/partial-files/old.mp3.part', { method: 'DELETE' })
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('places a Recalculate action in Recording Totals and disables it while recording', () => {
    render(<MainPage state={state()} onRefresh={async () => undefined} />);

    const totals = screen.getByRole('heading', { name: 'Recording Totals' }).closest('section');
    expect(within(totals as HTMLElement).getByRole('button', { name: /recalculate statistics/i })).toBeDisabled();
  });

  it('prevents duplicate recalculations while pending and refreshes after success', async () => {
    const pageState = state();
    pageState.recorder.active = false;
    const refresh = vi.fn(async () => undefined);
    let resolveRequest!: (response: Response) => void;
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise<Response>((resolve) => { resolveRequest = resolve; })
    );
    render(<MainPage state={pageState} onRefresh={refresh} />);
    const button = screen.getByRole('button', { name: /recalculate statistics/i });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/stats/recalculate', { method: 'POST' });
    expect(refresh).not.toHaveBeenCalled();
    resolveRequest({ ok: true, json: async () => ({ ok: true }) } as Response);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('shows a recalculation error and does not refresh', async () => {
    const pageState = state();
    pageState.recorder.active = false;
    const refresh = vi.fn(async () => undefined);
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, error: 'scan failed' })
    } as Response);
    render(<MainPage state={pageState} onRefresh={refresh} />);

    fireEvent.click(screen.getByRole('button', { name: /recalculate statistics/i }));

    await waitFor(() => expect(alert).toHaveBeenCalledWith('scan failed'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('renders one accessible checkbox per recent session and enables Delete only after selection', () => {
    const pageState = stateWithSessions();
    render(<MainPage state={pageState} onRefresh={async () => undefined} />);
    const deleteButton = screen.getByRole('button', { name: /delete selected sessions/i });
    const checkboxes = screen.getAllByRole('checkbox', { name: /select session started/i });

    expect(checkboxes).toHaveLength(2);
    expect(deleteButton).toBeDisabled();
    fireEvent.click(checkboxes[0]!);
    expect(deleteButton).toBeEnabled();
  });

  it('opens the server-provided recording date only from the keyboard-accessible Started control', () => {
    const openRecordingDate = vi.fn();
    render(
      <MainPage
        state={stateWithSessions()}
        onRefresh={async () => undefined}
        onOpenRecordingDate={openRecordingDate}
      />
    );

    const started = screen.getByRole('button', { name: /aug 4, 2026/i });
    expect(started.tagName).toBe('BUTTON');
    fireEvent.click(started);
    expect(openRecordingDate).toHaveBeenCalledWith('2026-08-04');

    for (const value of ['manual', 'stopped', '2', '5 B']) {
      fireEvent.click(screen.getAllByText(value)[0]!);
    }
    expect(openRecordingDate).toHaveBeenCalledTimes(1);
  });

  it('disables session selection and Delete while recording is active', () => {
    const pageState = stateWithSessions();
    pageState.recorder.active = true;
    render(<MainPage state={pageState} onRefresh={async () => undefined} />);

    expect(screen.getAllByRole('checkbox', { name: /select session started/i })[0]).toBeDisabled();
    expect(screen.getByRole('button', { name: /delete selected sessions/i })).toBeDisabled();
  });

  it('does not request deletion when destructive confirmation is cancelled', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<MainPage state={stateWithSessions()} onRefresh={async () => undefined} />);
    fireEvent.click(screen.getAllByRole('checkbox', { name: /select session started/i })[0]!);

    fireEvent.click(screen.getByRole('button', { name: /delete selected sessions/i }));

    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/all recordings.*day or days.*permanently deleted/i));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('prevents duplicate deletion, clears selection, and refreshes after success', async () => {
    const refresh = vi.fn(async () => undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let resolveRequest!: (response: Response) => void;
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise<Response>((resolve) => { resolveRequest = resolve; })
    );
    render(<MainPage state={stateWithSessions()} onRefresh={refresh} />);
    fireEvent.click(screen.getAllByRole('checkbox', { name: /select session started/i })[0]!);
    const deleteButton = screen.getByRole('button', { name: /delete selected sessions/i });

    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    expect(deleteButton).toBeDisabled();
    expect(screen.getAllByRole('checkbox', { name: /select session started/i })[0]).toBeDisabled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/recordings/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionIds: ['session-1'] })
    });
    resolveRequest({ ok: true, json: async () => ({ ok: true }) } as Response);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getAllByRole('checkbox', { name: /select session started/i })[0]).not.toBeChecked();
    expect(deleteButton).toBeDisabled();
  });

  it('shows a deletion error and still refreshes partial results', async () => {
    const refresh = vi.fn(async () => undefined);
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, error: 'unlink failed', deletedFiles: 1 })
    } as Response);
    render(<MainPage state={stateWithSessions()} onRefresh={refresh} />);
    fireEvent.click(screen.getAllByRole('checkbox', { name: /select session started/i })[0]!);

    fireEvent.click(screen.getByRole('button', { name: /delete selected sessions/i }));

    await waitFor(() => expect(alert).toHaveBeenCalledWith('unlink failed'));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('drops selected IDs when refreshed state removes their rows', () => {
    const pageState = stateWithSessions();
    const { rerender } = render(<MainPage state={pageState} onRefresh={async () => undefined} />);
    fireEvent.click(screen.getAllByRole('checkbox', { name: /select session started/i })[0]!);
    expect(screen.getByRole('button', { name: /delete selected sessions/i })).toBeEnabled();

    const refreshed = structuredClone(pageState);
    refreshed.stats.sessions = refreshed.stats.sessions.filter((session) => session.id !== 'session-1');
    rerender(<MainPage state={refreshed} onRefresh={async () => undefined} />);

    expect(screen.getByRole('button', { name: /delete selected sessions/i })).toBeDisabled();
  });
});

function stateWithSessions(): StateResponse {
  const pageState = state();
  pageState.recorder.active = false;
  pageState.stats.sessions = [
    {
      id: 'session-1',
      source: 'manual',
      startedAt: '2026-08-04T10:00:00.000Z',
      recordingDate: '2026-08-04',
      stoppedAt: '2026-08-04T10:30:00.000Z',
      files: 2,
      bytes: 5,
      status: 'stopped'
    },
    {
      id: 'session-2',
      source: 'scheduled',
      startedAt: '2026-08-05T10:00:00.000Z',
      recordingDate: '2026-08-05',
      stoppedAt: '2026-08-05T10:30:00.000Z',
      files: 1,
      bytes: 4,
      status: 'stopped'
    }
  ];
  return pageState;
}

function state(): StateResponse {
  return {
    enabled: true,
    stream: { url: 'https://radio.example.test/default' },
    recorder: {
      active: true,
      source: 'manual',
      currentFilename: 'active.mp3',
      currentPartFilename: 'active.mp3.part',
      currentSize: 1000,
      startedAt: '2026-06-18T12:00:00.000Z',
      durationSeconds: 12,
      filesInSession: 0,
      bytesInSession: 1000
    },
    schedule: {
      active: false,
      nextStart: '2026-06-18T20:00:00.000Z',
      nextEnd: '2026-06-19T03:00:00.000Z'
    },
    manualOverride: 'none',
    serviceUptimeSeconds: 30,
    stats: {
      recordingSeconds: 12,
      filesCreated: 0,
      bytesCreated: 0,
      recordingDays: [],
      failures: 0,
      sessions: []
    },
    partialFiles: [
      { name: 'active.mp3.part', size: 1000 },
      { name: 'old.mp3.part', size: 2000 }
    ]
  };
}

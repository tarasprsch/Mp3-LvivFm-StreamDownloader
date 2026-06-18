import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MainPage } from './MainPage';
import type { StateResponse } from '../types';

describe('MainPage partial files', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows partial files in rows and protects the current recording partial', () => {
    render(<MainPage state={state()} onRefresh={async () => undefined} />);

    expect(screen.getByText('old.mp3.part')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete old.mp3.part')).toBeInTheDocument();
    expect(screen.queryByLabelText('Delete active.mp3.part')).not.toBeInTheDocument();
    const currentRow = screen.getByText('active.mp3.part').closest('.partialFile');
    expect(currentRow).toHaveClass('current');
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
    expect(screen.getByText('2026-06-18__01.mp3.123.456.part').closest('.partialFile')).toHaveClass('current');
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
});

function state(): StateResponse {
  return {
    enabled: true,
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

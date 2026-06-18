import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the password-only login when unauthenticated', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ status: 401, ok: false } as Response);

    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('Password')).toBeInTheDocument());
    expect(screen.queryByText(/username/i)).not.toBeInTheDocument();
  });

  it('renders the main dashboard after authenticated state loads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        enabled: true,
        recorder: {
          active: false,
          currentSize: 0,
          durationSeconds: 0,
          filesInSession: 0,
          bytesInSession: 0
        },
        schedule: {
          active: false,
          nextStart: '2026-06-17T20:00:00.000Z',
          nextEnd: '2026-06-18T03:00:00.000Z'
        },
        manualOverride: 'none',
        serviceUptimeSeconds: 10,
        stats: {
          recordingSeconds: 0,
          filesCreated: 0,
          bytesCreated: 0,
          recordingDays: [],
          failures: 0,
          sessions: []
        },
        partialFiles: []
      })
    } as Response);

    render(<App />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Main' })).toBeInTheDocument());
    expect(screen.getByText('Recorder idle')).toBeInTheDocument();
  });
});

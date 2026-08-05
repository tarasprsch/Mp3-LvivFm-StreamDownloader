import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { StateResponse } from './types';

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the password-only login when unauthenticated", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 401,
      ok: false,
    } as Response);

    render(<App />);

    await waitFor(() =>
      expect(screen.getByLabelText("Password")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/username/i)).not.toBeInTheDocument();
  });

  it("renders the main dashboard after authenticated state loads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        enabled: true,
        stream: { url: "https://radio.example.test/live" },
        recorder: {
          active: false,
          currentSize: 0,
          durationSeconds: 0,
          filesInSession: 0,
          bytesInSession: 0,
        },
        schedule: {
          active: false,
          nextStart: "2026-06-17T20:00:00.000Z",
          nextEnd: "2026-06-18T03:00:00.000Z",
        },
        manualOverride: "none",
        serviceUptimeSeconds: 10,
        stats: {
          recordingSeconds: 0,
          filesCreated: 0,
          bytesCreated: 0,
          recordingDays: [],
          failures: 0,
          sessions: [],
        },
        partialFiles: [],
      }),
    } as Response);

    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Main" })).toBeInTheDocument(),
    );
    expect(screen.getByText("Record stopped")).toBeInTheDocument();
  });

  it('opens recording files in-app, keeps Main selected, and Back restores the dashboard', async () => {
    mockAppFetch();
    render(<App />);
    await screen.findByRole('heading', { name: 'Main' });

    fireEvent.click(screen.getByRole('button', { name: /aug 4, 2026/i }));

    expect(await screen.findByRole('heading', { name: 'Recordings for 2026-08-04' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Main' })).toHaveClass('sidebar__nav-button--active');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Main' })).toBeInTheDocument();
  });

  it('clears recording details when navigating through the sidebar', async () => {
    mockAppFetch();
    render(<App />);
    await screen.findByRole('heading', { name: 'Main' });
    fireEvent.click(screen.getByRole('button', { name: /aug 4, 2026/i }));
    await screen.findByRole('heading', { name: 'Recordings for 2026-08-04' });

    fireEvent.click(screen.getByRole('button', { name: 'Logs' }));
    expect(await screen.findByRole('heading', { name: 'Logs' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Main' }));

    expect(await screen.findByRole('heading', { name: 'Main' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recordings for 2026-08-04' })).not.toBeInTheDocument();
  });
});

function mockAppFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/recordings/')) {
      return {
        ok: true,
        json: async () => ({ date: '2026-08-04', files: [], filesCount: 0, bytes: 0 })
      } as Response;
    }
    if (url.startsWith('/api/logs')) {
      return { ok: true, json: async () => ({ lines: [] }) } as Response;
    }
    return { status: 200, ok: true, json: async () => appState() } as Response;
  });
}

function appState(): StateResponse {
  return {
    enabled: true,
    stream: { url: 'https://radio.example.test/live' },
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
      filesCreated: 1,
      bytesCreated: 5,
      recordingDays: ['2026-08-04'],
      failures: 0,
      sessions: [{
        id: 'session-1',
        source: 'manual',
        startedAt: '2026-08-04T10:00:00.000Z',
        recordingDate: '2026-08-04',
        stoppedAt: '2026-08-04T10:30:00.000Z',
        files: 1,
        bytes: 5,
        status: 'stopped'
      }]
    },
    partialFiles: []
  };
}

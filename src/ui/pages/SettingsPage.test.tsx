import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';

const initialSettings = {
  enabled: true,
  stream: { url: 'https://example.test/original' },
  schedule: { start: '23:00', end: '06:00' },
  recording: { splitSize: 19.2 },
  auth: { password: '' }
};

describe('SettingsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('displays the current stream URL immediately before Daily Schedule', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(initialSettings));

    render(<SettingsPage />);

    expect(await screen.findByLabelText('Stream URL')).toHaveValue('https://example.test/original');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual([
      'Capture Availability',
      'Stream URL',
      'Daily Schedule',
      'File Splitting',
      'Password Security'
    ]);
    expect(screen.getByLabelText('Stream URL')).toHaveAttribute('type', 'url');
    expect(screen.getByLabelText('Stream URL')).toHaveAttribute('autocomplete', 'url');
  });

  it('submits the stream field and displays the normalized response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okResponse(initialSettings))
      .mockResolvedValueOnce(okResponse({
        ...initialSettings,
        stream: { url: 'https://example.test/next' }
      }));
    render(<SettingsPage />);
    const input = await screen.findByLabelText('Stream URL');

    fireEvent.change(input, { target: { value: '  https://example.test/next  ' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/settings', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({
        enabled: true,
        stream: { url: 'https://example.test/next' },
        schedule: initialSettings.schedule,
        recording: { splitSize: 19.2 }
      })
    }));
    expect(input).toHaveValue('https://example.test/next');
  });

  it('shows stream validation failures in the existing settings error area', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okResponse(initialSettings))
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Stream URL must use HTTP or HTTPS.' })
      } as Response);
    render(<SettingsPage />);
    const input = await screen.findByLabelText('Stream URL');

    fireEvent.change(input, { target: { value: 'ftp://example.test/live' } });
    fireEvent.submit(input.closest('form')!);

    expect(await screen.findByText('Stream URL must use HTTP or HTTPS.')).toHaveClass(
      'settings-page__notice--danger'
    );
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });
});

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body
  } as Response;
}

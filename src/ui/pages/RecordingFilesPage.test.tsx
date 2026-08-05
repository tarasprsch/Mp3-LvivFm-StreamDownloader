import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecordingFilesPage } from './RecordingFilesPage';

describe('RecordingFilesPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loading state while the date-specific request is pending', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => undefined));

    render(<RecordingFilesPage date="2026-08-04" onBack={() => undefined} />);

    expect(screen.getByText('Loading recordings')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/recordings/2026-08-04', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('renders completed file names and formatted sizes in a semantic table', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      date: '2026-08-04',
      files: [
        { name: '2026-08-04__01.mp3', size: 1500 },
        { name: '2026-08-04__02-1.mp3', size: 20 }
      ],
      filesCount: 2,
      bytes: 1520
    }));

    render(<RecordingFilesPage date="2026-08-04" onBack={() => undefined} />);

    expect(await screen.findByRole('table', { name: 'Recordings for 2026-08-04' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'File',
      'Playback',
      'Size'
    ]);
    expect(screen.getByText('2026-08-04__01.mp3')).toBeInTheDocument();
    expect(screen.getByText('1.5 KB')).toBeInTheDocument();

    const firstPlayer = screen.getByLabelText('Play 2026-08-04__01.mp3') as HTMLAudioElement;
    expect(firstPlayer).toHaveAttribute(
      'src',
      '/api/recordings/2026-08-04/files/2026-08-04__01.mp3'
    );
    expect(firstPlayer).toHaveAttribute('controls');
    expect(firstPlayer).toHaveAttribute('preload', 'none');
    expect(firstPlayer).not.toHaveAttribute('autoplay');
  });

  it('shows and clears a concise playback error for the affected row', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      date: '2026-08-04',
      files: [{ name: '2026-08-04__01.mp3', size: 5 }],
      filesCount: 1,
      bytes: 5
    }));
    render(<RecordingFilesPage date="2026-08-04" onBack={() => undefined} />);
    const player = await screen.findByLabelText('Play 2026-08-04__01.mp3');

    fireEvent.error(player);
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to play this recording.');

    fireEvent.canPlay(player);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('pauses the previous recording when another row starts playing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      date: '2026-08-04',
      files: [
        { name: '2026-08-04__01.mp3', size: 5 },
        { name: '2026-08-04__02.mp3', size: 6 }
      ],
      filesCount: 2,
      bytes: 11
    }));
    render(<RecordingFilesPage date="2026-08-04" onBack={() => undefined} />);
    const first = await screen.findByLabelText('Play 2026-08-04__01.mp3') as HTMLAudioElement;
    const second = screen.getByLabelText('Play 2026-08-04__02.mp3') as HTMLAudioElement;
    const pauseFirst = vi.spyOn(first, 'pause').mockImplementation(() => undefined);

    fireEvent.play(first);
    fireEvent.play(second);

    expect(pauseFirst).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalledWith('/api/manual/start', expect.anything());
    expect(fetch).not.toHaveBeenCalledWith('/api/manual/stop', expect.anything());
  });

  it('shows a clear empty-day message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      date: '2026-08-04', files: [], filesCount: 0, bytes: 0
    }));

    render(<RecordingFilesPage date="2026-08-04" onBack={() => undefined} />);

    expect(await screen.findByText('No completed recordings were found for this day.')).toBeInTheDocument();
  });

  it('shows the server error when loading fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(
      { ok: false, error: 'Unable to list recordings.' },
      false
    ));

    render(<RecordingFilesPage date="2026-08-04" onBack={() => undefined} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to list recordings.');
  });

  it('calls Back without reloading the browser', () => {
    const onBack = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => undefined));
    render(<RecordingFilesPage date="2026-08-04" onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('ignores an obsolete response after the selected date changes', async () => {
    const requests = new Map<string, (value: Response) => void>();
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
      new Promise<Response>((resolve) => requests.set(String(input), resolve))
    );
    const { rerender } = render(<RecordingFilesPage date="2026-08-04" onBack={() => undefined} />);
    rerender(<RecordingFilesPage date="2026-08-05" onBack={() => undefined} />);

    requests.get('/api/recordings/2026-08-05')!(response({
      date: '2026-08-05',
      files: [{ name: '2026-08-05__01.mp3', size: 5 }],
      filesCount: 1,
      bytes: 5
    }));
    expect(await screen.findByText('2026-08-05__01.mp3')).toBeInTheDocument();

    requests.get('/api/recordings/2026-08-04')!(response({
      date: '2026-08-04',
      files: [{ name: '2026-08-04__01.mp3', size: 4 }],
      filesCount: 1,
      bytes: 4
    }));
    await waitFor(() => expect(screen.queryByText('2026-08-04__01.mp3')).not.toBeInTheDocument());
    expect(screen.getByText('2026-08-05__01.mp3')).toBeInTheDocument();
    expect(screen.getByLabelText('Play 2026-08-05__01.mp3')).toHaveAttribute(
      'src',
      '/api/recordings/2026-08-05/files/2026-08-05__01.mp3'
    );
    expect(screen.queryByLabelText('Play 2026-08-04__01.mp3')).not.toBeInTheDocument();
  });
});

function response(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatBytes } from '../format';
import './RecordingFilesPage.css';

type RecordingFile = {
  name: string;
  size: number;
};

type RecordingListing = {
  date: string;
  files: RecordingFile[];
  filesCount: number;
  bytes: number;
};

export function RecordingFilesPage({ date, onBack }: { date: string; onBack: () => void }) {
  const [listing, setListing] = useState<RecordingListing>();
  const [error, setError] = useState('');
  const [playbackErrors, setPlaybackErrors] = useState<Set<string>>(() => new Set());
  const activePlayer = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setListing(undefined);
    setError('');
    setPlaybackErrors(new Set());
    activePlayer.current = null;

    void fetch(`/api/recordings/${encodeURIComponent(date)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as Partial<RecordingListing> & { error?: string };
        if (!response.ok) throw new Error(body.error ?? 'Unable to load recordings.');
        return body as RecordingListing;
      })
      .then((next) => {
        if (current) setListing(next);
      })
      .catch((loadError: unknown) => {
        if (!current || controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load recordings.');
      });

    return () => {
      current = false;
      controller.abort();
    };
  }, [date]);

  const setPlaybackError = (name: string, failed: boolean) => {
    setPlaybackErrors((previous) => {
      const next = new Set(previous);
      if (failed) next.add(name);
      else next.delete(name);
      return next;
    });
  };

  const handlePlay = (player: HTMLAudioElement) => {
    if (activePlayer.current && activePlayer.current !== player) activePlayer.current.pause();
    activePlayer.current = player;
  };

  return (
    <div className="recording-files-page">
      <header className="recording-files-page__header">
        <button type="button" className="recording-files-page__back" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        <div>
          <h1>Recordings for {date}</h1>
          <p>Completed MP3 files for this recording day</p>
        </div>
      </header>

      <section className="recording-files-page__panel">
        {!listing && !error && <p>Loading recordings</p>}
        {error && <div className="recording-files-page__error" role="alert">{error}</div>}
        {listing?.files.length === 0 && <p>No completed recordings were found for this day.</p>}
        {listing && listing.files.length > 0 && (
          <table aria-label={`Recordings for ${date}`}>
            <thead>
              <tr>
                <th>File</th>
                <th>Playback</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              {listing.files.map((file) => (
                <tr key={file.name}>
                  <td>{file.name}</td>
                  <td className="recording-files-page__playback">
                    <audio
                      aria-label={`Play ${file.name}`}
                      controls
                      preload="none"
                      src={recordingUrl(date, file.name)}
                      onPlay={(event) => handlePlay(event.currentTarget)}
                      onEnded={(event) => {
                        if (activePlayer.current === event.currentTarget) activePlayer.current = null;
                      }}
                      onError={() => setPlaybackError(file.name, true)}
                      onCanPlay={() => setPlaybackError(file.name, false)}
                    >
                      Your browser does not support the audio element.
                    </audio>
                    {playbackErrors.has(file.name) && (
                      <p className="recording-files-page__playback-error" role="alert">
                        Unable to play this recording.
                      </p>
                    )}
                  </td>
                  <td>{formatBytes(file.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function recordingUrl(date: string, name: string): string {
  return `/api/recordings/${encodeURIComponent(date)}/files/${encodeURIComponent(name)}`;
}

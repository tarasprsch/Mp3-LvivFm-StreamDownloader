import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
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

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setListing(undefined);
    setError('');

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
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              {listing.files.map((file) => (
                <tr key={file.name}>
                  <td>{file.name}</td>
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

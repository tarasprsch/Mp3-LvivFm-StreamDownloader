import { useEffect, useState } from 'react';

const playbackErrorMessage =
  'Unable to play the configured stream in this browser.';

export function StreamPlayer({ url }: { url: string }) {
  const [hasPlaybackError, setHasPlaybackError] = useState(false);

  useEffect(() => {
    setHasPlaybackError(false);
  }, [url]);

  return (
    <section
      className="main-page__stream-player"
      aria-labelledby="online-stream-heading"
    >
      <h2 id="online-stream-heading">Online Stream</h2>
      <audio
        key={url}
        aria-label="Lviv FM online stream"
        controls
        preload="none"
        src={url}
        onError={() => setHasPlaybackError(true)}
        onCanPlay={() => setHasPlaybackError(false)}
      >
        Your browser does not support the audio element.
      </audio>
      {hasPlaybackError && <p role="alert">{playbackErrorMessage}</p>}
    </section>
  );
}

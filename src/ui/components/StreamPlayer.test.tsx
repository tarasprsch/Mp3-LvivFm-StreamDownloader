import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StreamPlayer } from './StreamPlayer';

describe('StreamPlayer', () => {
  it('shows a concise media error and clears it when media becomes playable', () => {
    render(<StreamPlayer url="https://radio.example.test/one" />);
    const audio = screen.getByLabelText('Lviv FM online stream');

    fireEvent.error(audio);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to play the configured stream in this browser.'
    );

    fireEvent.canPlay(audio);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('replaces the media element and clears its error when the URL changes', () => {
    const { rerender } = render(
      <StreamPlayer url="https://radio.example.test/one" />
    );
    const oldAudio = screen.getByLabelText('Lviv FM online stream');
    fireEvent.error(oldAudio);

    rerender(<StreamPlayer url="https://radio.example.test/two" />);

    const newAudio = screen.getByLabelText('Lviv FM online stream');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(newAudio).not.toBe(oldAudio);
    expect(newAudio).toHaveAttribute('src', 'https://radio.example.test/two');
  });

  it('does not issue recorder commands for native media interaction', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    render(<StreamPlayer url="https://radio.example.test/one" />);
    const audio = screen.getByLabelText('Lviv FM online stream');

    fireEvent.click(audio);
    fireEvent.play(audio);
    fireEvent.pause(audio);
    fireEvent.volumeChange(audio);

    expect(fetch).not.toHaveBeenCalled();
  });
});

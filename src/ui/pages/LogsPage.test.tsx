import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogsPage } from './LogsPage';

describe('LogsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders every log entry returned by the API', async () => {
    const lines = Array.from({ length: 20 }, (_, index) =>
      JSON.stringify({ time: '2026-08-04T00:10:00.000Z', message: `Log message ${index + 1}` })
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ lines })
      })
    );

    render(<LogsPage />);

    await waitFor(() => expect(screen.getByText('20 entries')).toBeInTheDocument());
    expect(screen.getByText(/Log message 1/)).toBeInTheDocument();
    expect(screen.getByText(/Log message 20/)).toBeInTheDocument();
  });
});

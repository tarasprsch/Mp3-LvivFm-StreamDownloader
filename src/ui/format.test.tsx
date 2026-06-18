import { describe, expect, it } from 'vitest';
import { formatLogLine } from './format';

describe('formatLogLine', () => {
  it('renders JSON log entries as a readable timestamp and message', () => {
    expect(
      formatLogLine(JSON.stringify({ time: '2026-01-18T15:58:04', message: 'Application started' }))
    ).toBe('18 jan 2026 15:58:04 : Application started');
  });

  it('keeps unexpected log lines unchanged', () => {
    expect(formatLogLine('Application started')).toBe('Application started');
  });
});

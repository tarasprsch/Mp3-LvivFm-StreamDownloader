import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLogger } from './logger.js';

describe('application logger', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes entries from different dates to one app.log file', async () => {
    vi.useFakeTimers();
    const directory = tempDirectory();
    const logger = new AppLogger(directory);

    vi.setSystemTime(new Date('2026-08-03T23:59:59.000Z'));
    await logger.log('app_start', 'Before midnight');
    vi.setSystemTime(new Date('2026-08-04T00:00:01.000Z'));
    await logger.log('app_stop', 'After midnight');

    expect(await readdir(directory)).toEqual(['app.log']);
    const body = await readFile(path.join(directory, 'app.log'), 'utf8');
    expect(body).toContain('Before midnight');
    expect(body).toContain('After midnight');
  });

  it('returns every app.log entry newest-first and searches the complete log', async () => {
    const directory = tempDirectory();
    await mkdir(directory, { recursive: true });
    const lines = Array.from({ length: 300 }, (_, index) =>
      JSON.stringify({
        time: new Date(Date.UTC(2026, 7, 4, 0, 0, index)).toISOString(),
        event: 'app_start',
        message: index === 0 ? 'Special oldest entry' : `Entry ${index}`
      })
    );
    await writeFile(path.join(directory, 'app.log'), `${lines.join('\n')}\n`, 'utf8');
    await writeFile(path.join(directory, 'app-2026-08-03.log'), 'legacy entry\n', 'utf8');
    const logger = new AppLogger(directory);

    const recent = await logger.recent();
    expect(recent).toHaveLength(300);
    expect(recent[0]).toContain('Entry 299');
    expect(recent.at(-1)).toContain('Special oldest entry');
    await expect(logger.recent('SPECIAL OLDEST')).resolves.toEqual([lines[0]]);
  });
});

function tempDirectory(): string {
  return path.join(os.tmpdir(), `lfm-logger-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

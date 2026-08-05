import { mkdir, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { StatsStore } from './stats.js';

describe('statistics store', () => {
  it('atomically replaces only recording inventory totals', async () => {
    const directory = await tempDirectory();
    const store = new StatsStore(directory);
    await store.load();
    const startedAt = new Date('2026-08-03T21:10:00.000Z');
    await store.startSession('session-1', 'manual', startedAt);
    await store.markSuccessfulConnection(new Date('2026-08-03T21:11:00.000Z'));
    await store.addFailure('temporary failure');
    await store.finishSession('session-1', new Date('2026-08-03T21:20:00.000Z'), 'stopped', 1, 123, '2026-08-04');
    const before = store.value;

    const updated = await store.replaceRecordingInventory({
      recordingSeconds: 900,
      filesCreated: 3,
      bytesCreated: 14_400_000,
      recordingDays: ['2026-08-02', '2026-08-04']
    });
    const persisted = JSON.parse(await readFile(path.join(directory, 'stats.json'), 'utf8'));

    expect(updated).toEqual({
      ...before,
      recordingSeconds: 900,
      filesCreated: 3,
      bytesCreated: 14_400_000,
      recordingDays: ['2026-08-02', '2026-08-04']
    });
    expect(persisted).toEqual(updated);
    expect((await readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('uses the configured-local session date instead of the UTC start date', async () => {
    const directory = await tempDirectory();
    const store = new StatsStore(directory);
    await store.load();
    await store.startSession('session-1', 'scheduled', new Date('2026-08-03T21:10:00.000Z'));

    await store.finishSession('session-1', new Date('2026-08-03T21:20:00.000Z'), 'stopped', 1, 100, '2026-08-04');

    expect(store.value.recordingDays).toEqual(['2026-08-04']);
  });

  it('atomically removes every session on supplied configured-local dates and preserves other fields', async () => {
    const directory = await tempDirectory();
    const store = new StatsStore(directory);
    await store.load();
    await store.startSession('same-day-1', 'manual', new Date('2026-08-03T21:10:00.000Z'));
    await store.startSession('same-day-2', 'scheduled', new Date('2026-08-04T12:00:00.000Z'));
    await store.startSession('other-day', 'manual', new Date('2026-08-05T12:00:00.000Z'));
    await store.addFailure('preserve me');
    const before = store.value;

    const updated = await store.removeSessionsForDates(new Set(['2026-08-04']), 'Europe/Kyiv');
    const persisted = JSON.parse(await readFile(path.join(directory, 'stats.json'), 'utf8'));

    expect(updated.sessions.map((session) => session.id)).toEqual(['other-day']);
    expect(updated).toEqual({ ...before, sessions: [before.sessions[0]] });
    expect(persisted).toEqual(updated);
    expect((await readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});

async function tempDirectory(): Promise<string> {
  const directory = path.join(os.tmpdir(), `lfm-stats-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(directory, { recursive: true });
  return directory;
}

import { EventEmitter } from 'node:events';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigStore, defaultConfig } from './config.js';
import { CaptureController, type RecorderLike } from './controller.js';
import { AppLogger } from './logger.js';
import {
  deleteRecordingsForDates,
  inventoryRecordings,
  type RecordingInventory
} from './files.js';
import type { RecorderSession, RecorderSource, RecorderStatus } from './recorder.js';
import { StatsStore } from './stats.js';

describe('capture controller transitions', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks manual start when capture is disabled', async () => {
    const { controller } = await fixture({ enabled: false });

    const result = await controller.manualStart();

    expect(result.ok).toBe(false);
    await expect(controller.status()).resolves.toMatchObject({
      enabled: false,
      recorder: { active: false }
    });
  });

  it('resets manual override after a manual stream failure', async () => {
    const fakeRecorder = new FakeRecorder();
    const { controller } = await fixture({}, fakeRecorder);

    await expect(controller.manualStart()).resolves.toEqual({ ok: true });
    fakeRecorder.fail(new Error('stream dropped'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(controller.status()).resolves.toMatchObject({
      manualOverride: 'none',
      lastError: 'stream dropped'
    });
  });

  it('keeps an active recording on its URL and uses an updated URL for the next recording', async () => {
    const fakeRecorder = new FakeRecorder();
    const { controller, configStore } = await fixture({}, fakeRecorder);

    await expect(controller.manualStart()).resolves.toEqual({ ok: true });
    expect(fakeRecorder.streamUrls).toEqual([defaultConfig.stream.url]);

    await configStore.updatePublicSettings({ stream: { url: 'https://example.test/next' } });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fakeRecorder.active).toBe(true);
    expect(fakeRecorder.startCalls).toEqual(['manual']);
    expect(fakeRecorder.stopCalls).toBe(0);

    await controller.manualStop();
    await expect(controller.manualStart()).resolves.toEqual({ ok: true });

    expect(fakeRecorder.streamUrls).toEqual([defaultConfig.stream.url, 'https://example.test/next']);
  });

  it('resumes scheduled recording in the next window after a manual stop', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-04T20:10:00.000Z'));
    const fakeRecorder = new FakeRecorder();
    const { controller } = await fixture({}, fakeRecorder);

    try {
      await controller.start();
      expect(fakeRecorder.startCalls).toEqual(['scheduled']);

      await controller.manualStop();
      await vi.advanceTimersByTimeAsync(15_000);
      expect(fakeRecorder.startCalls).toEqual(['scheduled']);

      vi.setSystemTime(new Date('2026-08-05T20:10:00.000Z'));
      await vi.advanceTimersByTimeAsync(15_000);
      expect(fakeRecorder.startCalls).toEqual(['scheduled', 'scheduled']);
    } finally {
      await controller.shutdown();
    }
  });

  it('refuses to delete the current active partial file', async () => {
    const fakeRecorder = new FakeRecorder();
    fakeRecorder.currentPartFilename = 'active.mp3.part';
    const { controller } = await fixture({}, fakeRecorder);

    await expect(controller.deletePartialFile('active.mp3.part')).resolves.toEqual({
      ok: false,
      error: 'Current recording partial file cannot be deleted.',
      status: 409
    });
  });

  it('refuses to delete the generated current partial file when only the final filename is known', async () => {
    const fakeRecorder = new FakeRecorder();
    fakeRecorder.active = true;
    fakeRecorder.currentFilename = '2026-06-18__01.mp3';
    const { controller } = await fixture({}, fakeRecorder);

    await expect(controller.deletePartialFile('2026-06-18__01.mp3.123.456.part')).resolves.toEqual({
      ok: false,
      error: 'Current recording partial file cannot be deleted.',
      status: 409
    });
  });

  it('deletes an old partial file from the output directory', async () => {
    const { controller, outputDirectory } = await fixture();
    await writeFile(path.join(outputDirectory, 'old.mp3.part'), 'abc');

    await expect(controller.deletePartialFile('old.mp3.part')).resolves.toEqual({ ok: true });

    await expect(controller.status()).resolves.toMatchObject({
      partialFiles: []
    });
  });

  it('recalculates statistics with the currently configured bitrate and logs the totals', async () => {
    const inventory: RecordingInventory = {
      recordingSeconds: 8,
      filesCreated: 2,
      bytesCreated: 64_000,
      recordingDays: ['2026-08-04']
    };
    const scan = vi.fn(async () => inventory);
    const { controller, outputDirectory, logger } = await fixture(
      { stream: { ...defaultConfig.stream, bitrateKbps: 64 } },
      new FakeRecorder(),
      scan
    );

    await expect(controller.recalculateStatistics()).resolves.toEqual({ ok: true, stats: expect.objectContaining(inventory) });
    expect(scan).toHaveBeenCalledWith(outputDirectory, 64);
    const event = JSON.parse((await logger.recent('statistics_recalculated'))[0]!);
    expect(event).toMatchObject({ event: 'statistics_recalculated', meta: { ...inventory, bitrateKbps: 64 } });
  });

  it('rejects recalculation without scanning while recording is active', async () => {
    const recorder = new FakeRecorder();
    recorder.active = true;
    const scan = vi.fn();
    const { controller } = await fixture({}, recorder, scan);

    await expect(controller.recalculateStatistics()).resolves.toEqual({
      ok: false,
      error: 'Stop recording before recalculating statistics.',
      status: 409
    });
    expect(scan).not.toHaveBeenCalled();
  });

  it('leaves statistics unchanged when the inventory scan fails', async () => {
    const scan = vi.fn(async () => { throw new Error('scan failed'); });
    const { controller, stats } = await fixture({}, new FakeRecorder(), scan);
    const before = stats.value;

    await expect(controller.recalculateStatistics()).resolves.toEqual({ ok: false, error: 'scan failed', status: 500 });
    expect(stats.value).toEqual(before);
  });

  it('deletes a selected local date once and removes every same-day session', async () => {
    const { controller, outputDirectory, stats, logger } = await fixture({}, new FakeRecorder(), inventoryRecordings);
    await addStoppedSession(stats, 'selected', '2026-08-03T21:10:00.000Z');
    await addStoppedSession(stats, 'same-day', '2026-08-04T12:00:00.000Z');
    await addStoppedSession(stats, 'other-day', '2026-08-05T12:00:00.000Z');
    await writeFile(path.join(outputDirectory, '2026-08-04__01.mp3'), 'abc');
    await writeFile(path.join(outputDirectory, '2026-08-04__02-1.mp3'), 'de');
    await writeFile(path.join(outputDirectory, '2026-08-05__01.mp3'), 'keep');
    await writeFile(path.join(outputDirectory, '2026-08-04__03.mp3.part'), 'partial');

    await expect(controller.deleteRecordings(['selected'])).resolves.toMatchObject({
      ok: true,
      deletedDates: ['2026-08-04'],
      deletedFiles: 2,
      deletedBytes: 5,
      stats: {
        filesCreated: 1,
        bytesCreated: 4,
        recordingDays: ['2026-08-05'],
        sessions: [expect.objectContaining({ id: 'other-day' })]
      }
    });
    expect((await readdir(outputDirectory)).sort()).toEqual([
      '2026-08-04__03.mp3.part',
      '2026-08-05__01.mp3'
    ]);
    const event = JSON.parse((await logger.recent('recordings_deleted'))[0]!);
    expect(event).toMatchObject({
      event: 'recordings_deleted',
      meta: {
        requestedSessionIds: ['selected'],
        affectedDates: ['2026-08-04'],
        deletedFiles: 2,
        deletedBytes: 5
      }
    });
  });

  it('deduplicates selected sessions across two local dates', async () => {
    const { controller, outputDirectory, stats } = await fixture({}, new FakeRecorder(), inventoryRecordings);
    await addStoppedSession(stats, 'day-one-a', '2026-08-04T10:00:00.000Z');
    await addStoppedSession(stats, 'day-one-b', '2026-08-04T12:00:00.000Z');
    await addStoppedSession(stats, 'day-two', '2026-08-05T12:00:00.000Z');
    await writeFile(path.join(outputDirectory, '2026-08-04__01.mp3'), 'a');
    await writeFile(path.join(outputDirectory, '2026-08-05__01.mp3'), 'bb');

    await expect(controller.deleteRecordings(['day-one-a', 'day-one-b', 'day-two'])).resolves.toMatchObject({
      ok: true,
      deletedDates: ['2026-08-04', '2026-08-05'],
      deletedFiles: 2,
      deletedBytes: 3,
      stats: { sessions: [] }
    });
  });

  it('rejects unknown session IDs before touching recordings', async () => {
    const { controller, outputDirectory, stats } = await fixture({}, new FakeRecorder(), inventoryRecordings);
    await addStoppedSession(stats, 'known', '2026-08-04T10:00:00.000Z');
    await writeFile(path.join(outputDirectory, '2026-08-04__01.mp3'), 'abc');

    await expect(controller.deleteRecordings(['missing'])).resolves.toEqual({
      ok: false,
      error: 'One or more sessions no longer exist.',
      status: 404
    });
    expect(await readdir(outputDirectory)).toEqual(['2026-08-04__01.mp3']);
  });

  it('rejects completed recording deletion while recording is active', async () => {
    const recorder = new FakeRecorder();
    recorder.active = true;
    const { controller, stats } = await fixture({}, recorder, inventoryRecordings);
    await addStoppedSession(stats, 'known', '2026-08-04T10:00:00.000Z');

    await expect(controller.deleteRecordings(['known'])).resolves.toEqual({
      ok: false,
      error: 'Stop recording before deleting recordings.',
      status: 409
    });
  });

  it('removes stale same-day sessions when no completed files exist', async () => {
    const { controller, stats } = await fixture({}, new FakeRecorder(), inventoryRecordings);
    await addStoppedSession(stats, 'stale-a', '2026-08-04T10:00:00.000Z');
    await addStoppedSession(stats, 'stale-b', '2026-08-04T12:00:00.000Z');

    await expect(controller.deleteRecordings(['stale-a'])).resolves.toMatchObject({
      ok: true,
      deletedDates: ['2026-08-04'],
      deletedFiles: 0,
      deletedBytes: 0,
      stats: { filesCreated: 0, bytesCreated: 0, recordingDays: [], sessions: [] }
    });
  });

  it('recalculates remaining files and preserves the date sessions after a partial unlink failure', async () => {
    let calls = 0;
    const partiallyFailingDelete: typeof deleteRecordingsForDates = (directory, dates) =>
      deleteRecordingsForDates(directory, dates, async (filePath) => {
        calls += 1;
        if (calls === 2) throw new Error('unlink failed');
        await unlink(filePath);
      });
    const { controller, outputDirectory, stats } = await fixture(
      {},
      new FakeRecorder(),
      inventoryRecordings,
      partiallyFailingDelete
    );
    await addStoppedSession(stats, 'known', '2026-08-04T10:00:00.000Z');
    await writeFile(path.join(outputDirectory, '2026-08-04__01.mp3'), 'abc');
    await writeFile(path.join(outputDirectory, '2026-08-04__02.mp3'), 'de');

    await expect(controller.deleteRecordings(['known'])).resolves.toMatchObject({
      ok: false,
      error: 'Unable to delete one or more recordings.',
      status: 500,
      deletedFiles: 1,
      deletedBytes: 3,
      stats: {
        filesCreated: 1,
        bytesCreated: 2,
        recordingDays: ['2026-08-04'],
        sessions: [expect.objectContaining({ id: 'known' })]
      }
    });
    expect(await readdir(outputDirectory)).toEqual(['2026-08-04__02.mp3']);
  });
});

class FakeRecorder extends EventEmitter implements RecorderLike {
  active = false;
  currentFilename: string | undefined;
  currentPartFilename: string | undefined;
  readonly startCalls: RecorderSource[] = [];
  readonly streamUrls: string[] = [];
  stopCalls = 0;
  private session: RecorderSession | undefined;

  get status(): RecorderStatus {
    return {
      active: this.active,
      source: this.session?.source,
      currentFilename: this.currentFilename,
      currentPartFilename: this.currentPartFilename,
      currentSize: 0,
      durationSeconds: 0,
      filesInSession: 0,
      bytesInSession: 0
    };
  }

  async start(options: Parameters<RecorderLike['start']>[0]): Promise<RecorderSession> {
    this.active = true;
    this.startCalls.push(options.source);
    this.streamUrls.push(options.streamUrl);
    this.session = {
      id: `fake-session-${this.startCalls.length}`,
      source: options.source,
      streamUrl: options.streamUrl,
      outputDirectory: options.outputDirectory,
      splitBytes: 10,
      startedAt: new Date(),
      sessionDate: '2026-06-17'
    };
    return this.session;
  }

  async stop(): Promise<void> {
    this.stopCalls += 1;
    if (!this.session) return;
    const session = this.session;
    this.active = false;
    this.session = undefined;
    this.emit('stopped', { session, files: 0, bytes: 0 });
  }

  fail(error: Error): void {
    if (!this.session) return;
    const session = this.session;
    this.active = false;
    this.session = undefined;
    this.emit('stopped', { session, files: 0, bytes: 0, error });
  }
}

async function fixture(
  overrides: Partial<typeof defaultConfig> = {},
  recorder = new FakeRecorder(),
  inventory: (directory: string, bitrateKbps: number) => Promise<RecordingInventory> = async () => ({
    recordingSeconds: 0,
    filesCreated: 0,
    bytesCreated: 0,
    recordingDays: []
  }),
  deleteRecordings = deleteRecordingsForDates
) {
  const directory = path.join(os.tmpdir(), `lfm-controller-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const outputDirectory = path.join(directory, 'mp3');
  await mkdir(outputDirectory, { recursive: true });
  const configStore = new ConfigStore(directory);
  await configStore.save({
    ...defaultConfig,
    ...overrides,
    recording: {
      ...defaultConfig.recording,
      outputDirectory
    },
    schedule: {
      ...defaultConfig.schedule,
      start: '23:00',
      end: '06:00'
    }
  });
  const logger = new AppLogger(directory);
  const stats = new StatsStore(directory);
  await stats.load();
  const controller = new CaptureController(configStore, logger, stats, recorder, inventory, deleteRecordings);
  return { controller, recorder, outputDirectory, logger, stats, configStore };
}

async function addStoppedSession(stats: StatsStore, id: string, startedAt: string): Promise<void> {
  const started = new Date(startedAt);
  await stats.startSession(id, 'manual', started);
  await stats.finishSession(id, new Date(started.getTime() + 60_000), 'stopped', 1, 1, 'unused-by-deletion');
}

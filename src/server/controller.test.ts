import { EventEmitter } from 'node:events';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigStore, defaultConfig } from './config.js';
import { CaptureController, type RecorderLike } from './controller.js';
import { AppLogger } from './logger.js';
import type { RecorderSession, RecorderStatus } from './recorder.js';
import { StatsStore } from './stats.js';

describe('capture controller transitions', () => {
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
});

class FakeRecorder extends EventEmitter implements RecorderLike {
  active = false;
  private session: RecorderSession | undefined;

  get status(): RecorderStatus {
    return {
      active: this.active,
      source: this.session?.source,
      currentSize: 0,
      durationSeconds: 0,
      filesInSession: 0,
      bytesInSession: 0
    };
  }

  async start(options: Parameters<RecorderLike['start']>[0]): Promise<RecorderSession> {
    this.active = true;
    this.session = {
      id: 'fake-session',
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

async function fixture(overrides: Partial<typeof defaultConfig> = {}, recorder = new FakeRecorder()) {
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
  const controller = new CaptureController(configStore, logger, stats, recorder);
  return { controller, recorder };
}

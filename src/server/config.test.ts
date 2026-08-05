import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigStore, configSchema, defaultConfig } from './config.js';

describe('configuration', () => {
  it('creates the default config atomically when missing', async () => {
    const directory = await tempDirectory();
    const store = new ConfigStore(directory);

    const config = await store.load();
    const raw = await readFile(path.join(directory, 'config.json'), 'utf8');

    expect(config.stream.url).toBe(defaultConfig.stream.url);
    expect(config.stream.bitrateKbps).toBe(128);
    expect(JSON.parse(raw).auth.password).toBe('change-me');
  });

  it('accepts positive stream bitrates and rejects invalid values', () => {
    expect(configSchema.parse({ ...defaultConfig, stream: { ...defaultConfig.stream, bitrateKbps: 64 } }).stream.bitrateKbps).toBe(64);

    for (const bitrateKbps of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '128']) {
      expect(() =>
        configSchema.parse({ ...defaultConfig, stream: { ...defaultConfig.stream, bitrateKbps } })
      ).toThrow();
    }
  });

  it('atomically migrates a legacy config without emitting a change event', async () => {
    const directory = await tempDirectory();
    const configPath = path.join(directory, 'config.json');
    const legacy = {
      ...defaultConfig,
      stream: { url: 'https://example.com/radio' },
      enabled: false,
      recording: { ...defaultConfig.recording, splitSize: 42 }
    };
    await writeFile(configPath, `${JSON.stringify(legacy, null, 2)}\n`, 'utf8');
    const store = new ConfigStore(directory);
    let changes = 0;
    store.on('change', () => changes += 1);

    const loaded = await store.load();
    const persisted = JSON.parse(await readFile(configPath, 'utf8'));

    expect(loaded).toMatchObject({
      enabled: false,
      stream: { url: 'https://example.com/radio', bitrateKbps: 128 },
      recording: { splitSize: 42 }
    });
    expect(persisted).toEqual(loaded);
    expect(changes).toBe(0);
    expect((await readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('updates only public settings through the UI patch', async () => {
    const directory = await tempDirectory();
    const store = new ConfigStore(directory);
    await store.load();

    const updated = await store.updatePublicSettings({
      enabled: false,
      schedule: { start: '21:10' },
      recording: { splitSize: 12.5 },
      auth: { password: 'secret' }
    });

    expect(updated.enabled).toBe(false);
    expect(updated.schedule.start).toBe('21:10');
    expect(updated.schedule.timezone).toBe('Europe/Kyiv');
    expect(updated.recording.outputDirectory).toBe('/mp3');
    expect(updated.auth.password).toBe('secret');
  });
});

async function tempDirectory(): Promise<string> {
  const directory = path.join(os.tmpdir(), `lfm-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(directory, { recursive: true });
  return directory;
}

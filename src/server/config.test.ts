import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigStore, configSchema, defaultConfig, exposeSettings, publicSettingsSchema } from './config.js';

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

  it.each([
    ['  https://example.test/live  ', 'https://example.test/live'],
    ['http://example.test/live', 'http://example.test/live']
  ])('accepts and trims a public HTTP(S) stream URL', async (input, expected) => {
    const directory = await tempDirectory();
    const store = new ConfigStore(directory);
    await store.load();

    const updated = await store.updatePublicSettings({ stream: { url: input } });
    const persisted = JSON.parse(await readFile(path.join(directory, 'config.json'), 'utf8'));

    expect(updated.stream.url).toBe(expected);
    expect(store.value.stream.url).toBe(expected);
    expect(persisted.stream.url).toBe(expected);
  });

  it.each([
    '',
    '   ',
    'not a URL',
    '/live',
    'ftp://example.test/live',
    'https://listener:secret@example.test/live',
    'https://listener@example.test/live'
  ])('rejects invalid public stream URL %j without changing memory or disk', async (url) => {
    const directory = await tempDirectory();
    const configPath = path.join(directory, 'config.json');
    const store = new ConfigStore(directory);
    await store.load();
    const before = store.value;
    const rawBefore = await readFile(configPath, 'utf8');

    await expect(store.updatePublicSettings({ stream: { url } })).rejects.toThrow();

    expect(store.value).toEqual(before);
    await expect(readFile(configPath, 'utf8')).resolves.toBe(rawBefore);
  });

  it('preserves hidden fields when updating only the public stream URL', async () => {
    const directory = await tempDirectory();
    const store = new ConfigStore(directory);
    await store.save({
      ...defaultConfig,
      stream: { url: defaultConfig.stream.url, bitrateKbps: 192 },
      schedule: { ...defaultConfig.schedule, timezone: 'America/Toronto' },
      recording: { ...defaultConfig.recording, outputDirectory: '/private/recordings' },
      web: { host: '127.0.0.1', port: 54321 }
    });

    const updated = await store.updatePublicSettings({ stream: { url: 'https://example.test/next' } });

    expect(updated).toMatchObject({
      stream: { url: 'https://example.test/next', bitrateKbps: 192 },
      schedule: { timezone: 'America/Toronto' },
      recording: { outputDirectory: '/private/recordings' },
      web: { host: '127.0.0.1', port: 54321 }
    });
  });

  it('defines stream URL as an optional public settings patch', () => {
    expect(publicSettingsSchema.parse({})).toEqual({});
    expect(publicSettingsSchema.parse({ stream: {} })).toEqual({ stream: {} });
  });

  it('exposes the stream URL without exposing hidden configuration', () => {
    expect(exposeSettings(defaultConfig)).toEqual({
      enabled: defaultConfig.enabled,
      stream: { url: defaultConfig.stream.url },
      schedule: { start: defaultConfig.schedule.start, end: defaultConfig.schedule.end },
      recording: { splitSize: defaultConfig.recording.splitSize },
      auth: { password: '' }
    });
  });
});

async function tempDirectory(): Promise<string> {
  const directory = path.join(os.tmpdir(), `lfm-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(directory, { recursive: true });
  return directory;
}

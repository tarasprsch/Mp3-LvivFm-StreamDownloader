import { mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigStore, defaultConfig } from './config.js';

describe('configuration', () => {
  it('creates the default config atomically when missing', async () => {
    const directory = await tempDirectory();
    const store = new ConfigStore(directory);

    const config = await store.load();
    const raw = await readFile(path.join(directory, 'config.json'), 'utf8');

    expect(config.stream.url).toBe(defaultConfig.stream.url);
    expect(JSON.parse(raw).auth.password).toBe('change-me');
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

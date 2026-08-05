import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { ConfigStore, defaultConfig } from './config.js';
import type { CaptureController } from './controller.js';
import { AppLogger } from './logger.js';

describe('app partial file API', () => {
  const servers: http.Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.map((server) => closeServer(server)));
    servers.length = 0;
  });

  it('deletes a partial file through the authenticated API', async () => {
    const deleted: string[] = [];
    const { baseUrl, cookie } = await fixture({
      deletePartialFile: async (name: string) => {
        deleted.push(name);
        return { ok: true };
      }
    });

    const response = await fetch(`${baseUrl}/api/partial-files/old.mp3.part`, {
      method: 'DELETE',
      headers: { Cookie: cookie }
    });

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.status).toBe(200);
    expect(deleted).toEqual(['old.mp3.part']);
  });

  it('uses the controller status when partial deletion is rejected', async () => {
    const { baseUrl, cookie } = await fixture({
      deletePartialFile: async () => ({
        ok: false,
        error: 'Current recording partial file cannot be deleted.',
        status: 409
      })
    });

    const response = await fetch(`${baseUrl}/api/partial-files/active.mp3.part`, {
      method: 'DELETE',
      headers: { Cookie: cookie }
    });

    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Current recording partial file cannot be deleted.',
      status: 409
    });
    expect(response.status).toBe(409);
  });

  it('returns rebuilt statistics through the authenticated API', async () => {
    const stats = { recordingSeconds: 10, filesCreated: 2, bytesCreated: 160_000, recordingDays: ['2026-08-04'] };
    const { baseUrl, cookie } = await fixture({
      recalculateStatistics: async () => ({ ok: true, stats } as Awaited<ReturnType<CaptureController['recalculateStatistics']>>)
    });

    const response = await fetch(`${baseUrl}/api/stats/recalculate`, { method: 'POST', headers: { Cookie: cookie } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, stats });
  });

  it.each([
    [409, 'Stop recording before recalculating statistics.'],
    [500, 'scan failed']
  ])('returns controller recalculation error status %i', async (status, error) => {
    const { baseUrl, cookie } = await fixture({
      recalculateStatistics: async () => ({ ok: false, error, status } as Awaited<ReturnType<CaptureController['recalculateStatistics']>>)
    });

    const response = await fetch(`${baseUrl}/api/stats/recalculate`, { method: 'POST', headers: { Cookie: cookie } });

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ ok: false, error });
  });

  it('deletes selected sessions through the authenticated API', async () => {
    const stats = {
      appStartedAt: '2026-08-04T00:00:00.000Z',
      recordingSeconds: 0,
      filesCreated: 0,
      bytesCreated: 0,
      recordingDays: [],
      failures: 0,
      sessions: []
    };
    const deleteRecordings = vi.fn(async () => ({
      ok: true as const,
      deletedDates: ['2026-08-04'],
      deletedFiles: 2,
      deletedBytes: 5,
      stats
    }));
    const { baseUrl, cookie } = await fixture({ deleteRecordings } as Partial<CaptureController>);

    const response = await fetch(`${baseUrl}/api/recordings/delete`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionIds: ['session-1', 'session-2'] })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      deletedDates: ['2026-08-04'],
      deletedFiles: 2,
      deletedBytes: 5,
      stats
    });
    expect(deleteRecordings).toHaveBeenCalledWith(['session-1', 'session-2']);
  });

  it('requires authentication for completed recording deletion', async () => {
    const { baseUrl } = await fixture({});

    const response = await fetch(`${baseUrl}/api/recordings/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionIds: ['session-1'] })
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required' });
  });

  it.each([
    {},
    { sessionIds: [] },
    { sessionIds: [''] },
    { sessionIds: ['duplicate', 'duplicate'] },
    { sessionIds: Array.from({ length: 26 }, (_, index) => `session-${index}`) },
    { sessionIds: 'session-1' }
  ])('rejects an invalid completed recording deletion payload %#', async (body) => {
    const deleteRecordings = vi.fn();
    const { baseUrl, cookie } = await fixture({ deleteRecordings } as Partial<CaptureController>);

    const response = await fetch(`${baseUrl}/api/recordings/delete`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'Select between 1 and 25 unique sessions.' });
    expect(deleteRecordings).not.toHaveBeenCalled();
  });

  it('returns the stream URL but no hidden configuration from authenticated settings', async () => {
    const { baseUrl, cookie } = await fixture({});

    const response = await fetch(`${baseUrl}/api/settings`, { headers: { Cookie: cookie } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ stream: { url: defaultConfig.stream.url } });
    expect(body.stream).not.toHaveProperty('bitrateKbps');
    expect(body.schedule).not.toHaveProperty('timezone');
    expect(body.recording).not.toHaveProperty('outputDirectory');
    expect(body).not.toHaveProperty('web');
  });

  it('updates and returns a normalized stream URL through authenticated settings', async () => {
    const { baseUrl, cookie, configStore } = await fixture({});

    const response = await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ stream: { url: '  https://example.test/live  ' } })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ stream: { url: 'https://example.test/live' } });
    expect(configStore.value.stream.url).toBe('https://example.test/live');
  });

  it.each([
    '',
    'not a URL',
    '/live',
    'ftp://example.test/live',
    'https://listener:secret@example.test/live'
  ])('rejects invalid stream URL %j without changing memory or disk', async (url) => {
    const { baseUrl, cookie, configStore, directory } = await fixture({});
    const before = configStore.value;
    const rawBefore = await readFile(path.join(directory, 'config.json'), 'utf8');

    const response = await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ stream: { url } })
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: expect.any(String) });
    expect(configStore.value).toEqual(before);
    await expect(readFile(path.join(directory, 'config.json'), 'utf8')).resolves.toBe(rawBefore);
  });

  it.each([
    [404, 'One or more sessions no longer exist.'],
    [409, 'Stop recording before deleting recordings.'],
    [500, 'unlink failed']
  ])('returns completed recording deletion error status %i', async (status, error) => {
    const { baseUrl, cookie } = await fixture({
      deleteRecordings: async () => ({
        ok: false,
        error,
        status,
        ...(status === 500 ? { deletedFiles: 1, deletedBytes: 3 } : {})
      })
    } as unknown as Partial<CaptureController>);

    const response = await fetch(`${baseUrl}/api/recordings/delete`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionIds: ['session-1'] })
    });

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error,
      ...(status === 500 ? { deletedFiles: 1, deletedBytes: 3 } : {})
    });
  });

  async function fixture(controllerPatch: Partial<CaptureController>) {
    const directory = path.join(os.tmpdir(), `lfm-app-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(directory, { recursive: true });
    const configStore = new ConfigStore(directory);
    await configStore.save({
      ...defaultConfig,
      auth: {
        password: 'secret'
      }
    });
    const controller = {
      status: async () => ({}),
      manualStart: async () => ({ ok: true }),
      manualStop: async () => ({ ok: true }),
      ...controllerPatch
    } as unknown as CaptureController;
    const app = createApp({
      configStore,
      controller,
      logger: new AppLogger(directory),
      uiDirectory: directory
    });
    const server = http.createServer(app);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const login = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'secret' })
    });
    const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(cookie).toContain('lfm_session=');
    return { baseUrl, cookie, configStore, directory };
  }
});

async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

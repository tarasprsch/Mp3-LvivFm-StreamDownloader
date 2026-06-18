import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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
    return { baseUrl, cookie };
  }
});

async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

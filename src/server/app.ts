import express, { type Express } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { AuthService, clearSessionCookie, readCookie, setSessionCookie } from './auth.js';
import { ConfigStore, describeConfigError, exposeSettings, publicSettingsSchema } from './config.js';
import type { CaptureController } from './controller.js';
import type { AppLogger } from './logger.js';

const loginSchema = z.object({
  password: z.string()
});

export function createApp(options: {
  configStore: ConfigStore;
  controller: CaptureController;
  logger: AppLogger;
  uiDirectory?: string;
}): Express {
  const app = express();
  const auth = new AuthService(options.configStore);
  const uiDirectory = options.uiDirectory ?? defaultUiDirectory();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_request, response) => {
    response.json({ ok: true });
  });

  app.post('/api/login', (request, response) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      response.status(400).json({ error: 'Password is required.' });
      return;
    }
    const token = auth.login(body.data.password);
    if (!token) {
      response.status(401).json({ error: 'Invalid password.' });
      return;
    }
    setSessionCookie(response, token);
    response.json({ ok: true });
  });

  app.post('/api/logout', (request, response) => {
    auth.logout(readCookie(request, 'lfm_session'));
    clearSessionCookie(response);
    response.json({ ok: true });
  });

  app.use('/api', auth.middleware);

  app.get('/api/state', async (_request, response) => {
    response.json(await options.controller.status());
  });

  app.get('/api/settings', (_request, response) => {
    response.json(exposeSettings(options.configStore.value));
  });

  app.put('/api/settings', async (request, response) => {
    const body = publicSettingsSchema.safeParse(request.body);
    if (!body.success) {
      response.status(400).json({ error: describeConfigError(body.error) });
      return;
    }
    const previous = options.configStore.value;
    try {
      const next = await options.configStore.updatePublicSettings(body.data);
      response.json(exposeSettings(next));
      if (previous.enabled !== next.enabled) {
        await options.logger.log('schedule_changed', 'Capture enabled setting changed', { enabled: next.enabled });
      }
    } catch (error) {
      response.status(400).json({ error: describeConfigError(error) });
    }
  });

  app.post('/api/manual/start', async (_request, response) => {
    const result = await options.controller.manualStart();
    response.status(result.ok ? 200 : 409).json(result);
  });

  app.post('/api/manual/stop', async (_request, response) => {
    response.json(await options.controller.manualStop());
  });

  app.get('/api/logs', async (request, response) => {
    const search = typeof request.query.search === 'string' ? request.query.search : '';
    response.json({ lines: await options.logger.recent(search) });
  });

  app.use(express.static(uiDirectory));
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(uiDirectory, 'index.html'));
  });

  return app;
}

function defaultUiDirectory(): string {
  if (process.env.UI_DIST_DIR) return process.env.UI_DIST_DIR;
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../ui');
}

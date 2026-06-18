import http from 'node:http';
import { ConfigStore } from './config.js';
import { CaptureController } from './controller.js';
import { createApp } from './app.js';
import { ensureOutputDirectory } from './files.js';
import { AppLogger } from './logger.js';
import { StatsStore } from './stats.js';
import { describeStartupError, listen } from './startup.js';

async function main(): Promise<void> {
  const configStore = new ConfigStore();
  const config = await configStore.load();
  const logger = new AppLogger(configStore.dataDirectory);
  const stats = new StatsStore(configStore.dataDirectory);
  await stats.load();
  await ensureOutputDirectory(config.recording.outputDirectory);

  const controller = new CaptureController(configStore, logger, stats);
  const app = createApp({ configStore, controller, logger });
  const server = http.createServer(app);
  let controllerStarted = false;

  try {
    await listen(server, config.web.host, config.web.port);
    console.log(`Lviv FM Stream Recorder listening on http://${config.web.host}:${config.web.port}`);
    await controller.start();
    controllerStarted = true;
    configStore.watch();
    await logger.log('app_start', 'Application started');
  } catch (error) {
    configStore.stopWatching();
    if (controllerStarted) await controller.shutdown();
    if (server.listening) server.close();
    throw error;
  }

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    console.log(`Received ${signal}, shutting down`);
    configStore.stopWatching();
    server.close();
    await controller.shutdown();
    await logger.log('app_stop', 'Application stopped', { signal });
    process.exit(0);
  };

  process.once('SIGINT', (signal) => void shutdown(signal));
  process.once('SIGTERM', (signal) => void shutdown(signal));
}

main().catch((error) => {
  console.error(describeStartupError(error));
  process.exit(1);
});

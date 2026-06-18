import type { Server } from 'node:http';

type ListenError = NodeJS.ErrnoException & {
  address?: string;
  port?: number;
};

export function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      server.off('error', onError);
      server.off('listening', onListening);
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onListening = (): void => {
      cleanup();
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

export function describeStartupError(error: unknown): string {
  if (isListenError(error) && error.code === 'EADDRINUSE') {
    const address = typeof error.address === 'string' ? error.address : 'configured host';
    const port = typeof error.port === 'number' ? error.port : 'configured port';
    return [
      `Port ${port} is already in use on ${address}.`,
      'Stop the existing process or change web.port in your data/config.json file, then start the app again.'
    ].join('\n');
  }

  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

function isListenError(error: unknown): error is ListenError {
  return error instanceof Error && 'code' in error;
}

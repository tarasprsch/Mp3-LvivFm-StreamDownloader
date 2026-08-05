import { mkdir, readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';

export type LogEvent =
  | 'app_start'
  | 'app_stop'
  | 'schedule_changed'
  | 'scheduled_recording_started'
  | 'scheduled_recording_stopped'
  | 'manual_recording_started'
  | 'manual_recording_stopped'
  | 'file_error'
  | 'stream_error'
  | 'storage_error'
  | 'statistics_recalculated'
  | 'recordings_deleted'
  | 'config_validation_error'
  | 'partial_files_found';

export class AppLogger {
  constructor(private readonly dataDirectory: string) {}

  async log(event: LogEvent, message: string, meta?: Record<string, unknown>): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true });
    const line = JSON.stringify({
      time: new Date().toISOString(),
      event,
      message,
      ...(meta ? { meta } : {})
    });
    await appendFile(this.currentPath(), `${line}\n`, 'utf8');
  }

  async recent(search = ''): Promise<string[]> {
    await mkdir(this.dataDirectory, { recursive: true });
    const needle = search.trim().toLowerCase();
    const body = await readFile(this.currentPath(), 'utf8').catch(() => '');
    return body
      .split('\n')
      .reverse()
      .filter((line) => Boolean(line) && (!needle || line.toLowerCase().includes(needle)));
  }

  private currentPath(): string {
    return path.join(this.dataDirectory, 'app.log');
  }
}

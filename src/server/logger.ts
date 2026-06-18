import { mkdir, readdir, readFile, appendFile } from 'node:fs/promises';
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

  async recent(search = '', limit = 250): Promise<string[]> {
    await mkdir(this.dataDirectory, { recursive: true });
    const files = (await readdir(this.dataDirectory))
      .filter((name) => /^app-\d{4}-\d{2}-\d{2}\.log$/.test(name))
      .sort()
      .reverse()
      .slice(0, 7);
    const needle = search.trim().toLowerCase();
    const lines: string[] = [];
    for (const file of files) {
      const body = await readFile(path.join(this.dataDirectory, file), 'utf8').catch(() => '');
      for (const line of body.split('\n').reverse()) {
        if (!line) continue;
        if (needle && !line.toLowerCase().includes(needle)) continue;
        lines.push(line);
        if (lines.length >= limit) return lines;
      }
    }
    return lines;
  }

  private currentPath(): string {
    const date = new Date().toISOString().slice(0, 10);
    return path.join(this.dataDirectory, `app-${date}.log`);
  }
}

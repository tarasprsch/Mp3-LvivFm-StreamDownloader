import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { RecordingInventory } from './files.js';
import { sessionDateFrom } from './files.js';

const recordingInventorySchema = z.object({
  recordingSeconds: z.number().int().nonnegative(),
  filesCreated: z.number().int().nonnegative(),
  bytesCreated: z.number().int().nonnegative(),
  recordingDays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
});

const statsSchema = z.object({
  appStartedAt: z.string(),
  recordingSeconds: z.number().nonnegative(),
  filesCreated: z.number().int().nonnegative(),
  bytesCreated: z.number().int().nonnegative(),
  recordingDays: z.array(z.string()),
  failures: z.number().int().nonnegative(),
  sessions: z.array(
    z.object({
      id: z.string(),
      source: z.enum(['scheduled', 'manual']),
      startedAt: z.string(),
      stoppedAt: z.string().optional(),
      files: z.number().int().nonnegative(),
      bytes: z.number().int().nonnegative(),
      status: z.enum(['recording', 'stopped', 'failed'])
    })
  ),
  lastSuccessfulConnection: z.string().optional(),
  lastError: z.string().optional()
});

export type AppStats = z.infer<typeof statsSchema>;

export class StatsStore {
  private current: AppStats = {
    appStartedAt: new Date().toISOString(),
    recordingSeconds: 0,
    filesCreated: 0,
    bytesCreated: 0,
    recordingDays: [],
    failures: 0,
    sessions: []
  };

  constructor(private readonly dataDirectory: string, private readonly filePath = path.join(dataDirectory, 'stats.json')) {}

  get value(): AppStats {
    return structuredClone(this.current);
  }

  async load(): Promise<AppStats> {
    await mkdir(this.dataDirectory, { recursive: true });
    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.current = statsSchema.parse(JSON.parse(raw));
      this.current.appStartedAt = new Date().toISOString();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await this.save();
    return this.value;
  }

  async startSession(id: string, source: 'scheduled' | 'manual', startedAt: Date): Promise<void> {
    this.current.sessions.unshift({
      id,
      source,
      startedAt: startedAt.toISOString(),
      files: 0,
      bytes: 0,
      status: 'recording'
    });
    this.trimSessions();
    await this.save();
  }

  async markSuccessfulConnection(connectedAt: Date): Promise<void> {
    this.current.lastSuccessfulConnection = connectedAt.toISOString();
    await this.save();
  }

  async finishSession(
    id: string,
    stoppedAt: Date,
    status: 'stopped' | 'failed',
    files: number,
    bytes: number,
    sessionDate: string
  ): Promise<void> {
    const session = this.current.sessions.find((item) => item.id === id);
    if (session) {
      const seconds = Math.max(0, Math.round((stoppedAt.getTime() - Date.parse(session.startedAt)) / 1000));
      session.stoppedAt = stoppedAt.toISOString();
      session.status = status;
      session.files = files;
      session.bytes = bytes;
      this.current.recordingSeconds += seconds;
      this.current.recordingDays = [...new Set([...this.current.recordingDays, sessionDate])].sort();
    }
    if (status === 'failed') this.current.failures += 1;
    await this.save();
  }

  async addFile(bytes: number): Promise<void> {
    this.current.filesCreated += 1;
    this.current.bytesCreated += bytes;
    await this.save();
  }

  async addFailure(error: string): Promise<void> {
    this.current.failures += 1;
    this.current.lastError = error;
    await this.save();
  }

  async replaceRecordingInventory(inventory: RecordingInventory): Promise<AppStats> {
    const validated = recordingInventorySchema.parse(inventory);
    const next = statsSchema.parse({
      ...this.current,
      ...validated
    });
    await this.persist(next);
    this.current = next;
    return this.value;
  }

  async removeSessionsForDates(dates: ReadonlySet<string>, timeZone: string): Promise<AppStats> {
    const next = statsSchema.parse({
      ...this.current,
      sessions: this.current.sessions.filter(
        (session) => !dates.has(sessionDateFrom(new Date(session.startedAt), timeZone))
      )
    });
    await this.persist(next);
    this.current = next;
    return this.value;
  }

  private async save(): Promise<void> {
    await this.persist(this.current);
  }

  private async persist(stats: AppStats): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true });
    const temp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
    await rename(temp, this.filePath);
  }

  private trimSessions(): void {
    this.current.sessions = this.current.sessions.slice(0, 25);
  }
}

import { EventEmitter } from 'node:events';
import { createWriteStream, type WriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import {
  ensureOutputDirectory,
  finalizePartFile,
  finalName,
  nextRecordingNumber,
  sessionDateFrom
} from './files.js';

export type RecorderSource = 'scheduled' | 'manual';

export type RecorderSession = {
  id: string;
  source: RecorderSource;
  streamUrl: string;
  outputDirectory: string;
  splitBytes: number;
  startedAt: Date;
  sessionDate: string;
};

export type RecorderStatus = {
  active: boolean;
  source?: RecorderSource;
  currentFilename?: string;
  currentPartFilename?: string;
  currentSize: number;
  startedAt?: string;
  durationSeconds: number;
  filesInSession: number;
  bytesInSession: number;
};

type RecorderEvents = {
  file: [{ path: string; bytes: number }];
  connected: [{ session: RecorderSession; connectedAt: Date }];
  stopped: [{ session: RecorderSession; files: number; bytes: number; error?: Error }];
};

export class Recorder extends EventEmitter {
  private session: RecorderSession | undefined;
  private controller: AbortController | undefined;
  private writeStream: WriteStream | undefined;
  private currentPartPath = '';
  private currentFinalPath = '';
  private currentFilename = '';
  private currentSize = 0;
  private nextNumber = 1;
  private filesInSession = 0;
  private bytesInSession = 0;
  private stopping = false;

  override on<T extends keyof RecorderEvents>(event: T, listener: (...args: RecorderEvents[T]) => void): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  get active(): boolean {
    return Boolean(this.session);
  }

  get status(): RecorderStatus {
    const now = Date.now();
    return {
      active: this.active,
      source: this.session?.source,
      currentFilename: this.currentFilename || undefined,
      currentPartFilename: this.currentPartPath ? path.basename(this.currentPartPath) : undefined,
      currentSize: this.currentSize,
      startedAt: this.session?.startedAt.toISOString(),
      durationSeconds: this.session ? Math.round((now - this.session.startedAt.getTime()) / 1000) : 0,
      filesInSession: this.filesInSession,
      bytesInSession: this.bytesInSession + this.currentSize
    };
  }

  async start(options: {
    source: RecorderSource;
    streamUrl: string;
    outputDirectory: string;
    splitMegabytes: number;
  }): Promise<RecorderSession> {
    if (this.session) return this.session;
    await ensureOutputDirectory(options.outputDirectory);
    const startedAt = new Date();
    const sessionDate = sessionDateFrom(startedAt);
    this.nextNumber = await nextRecordingNumber(options.outputDirectory, sessionDate);
    this.controller = new AbortController();
    this.stopping = false;
    this.filesInSession = 0;
    this.bytesInSession = 0;
    this.session = {
      id: `${startedAt.toISOString()}-${Math.random().toString(36).slice(2)}`,
      source: options.source,
      streamUrl: options.streamUrl,
      outputDirectory: options.outputDirectory,
      splitBytes: Math.round(options.splitMegabytes * 1_000_000),
      startedAt,
      sessionDate
    };
    await this.openNextPart();
    void this.capture().catch((error: Error) => {
      void this.finish(error);
    });
    return this.session;
  }

  async stop(): Promise<void> {
    if (!this.session) return;
    this.stopping = true;
    this.controller?.abort();
    await this.finish();
  }

  private async capture(): Promise<void> {
    const session = this.session;
    const controller = this.controller;
    if (!session || !controller) return;

    await new Promise<void>((resolve, reject) => {
      const request = https.get(session.streamUrl, { signal: controller.signal }, (response) => {
        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`Stream returned HTTP ${response.statusCode}`));
          response.resume();
          return;
        }
        this.emit('connected', { session, connectedAt: new Date() });
        response.on('data', (chunk: Buffer) => {
          response.pause();
          this.writeChunk(chunk)
            .then(() => response.resume())
            .catch((error: Error) => {
              controller.abort();
              reject(error);
            });
        });
        response.once('end', () => reject(new Error('Stream ended unexpectedly')));
        response.once('error', reject);
      });
      request.once('error', (error) => {
        if (this.stopping && controller.signal.aborted) resolve();
        else reject(error);
      });
      request.once('close', () => {
        if (this.stopping || controller.signal.aborted) resolve();
      });
    });
  }

  private async writeChunk(chunk: Buffer): Promise<void> {
    if (!this.session || !this.writeStream) return;
    await new Promise<void>((resolve, reject) => {
      const done = (error?: Error | null) => (error ? reject(error) : resolve());
      if (this.writeStream!.write(chunk, done)) return;
    });
    this.currentSize += chunk.length;
    if (this.currentSize >= this.session.splitBytes) await this.rotate();
  }

  private async rotate(): Promise<void> {
    if (!this.session || !this.writeStream) return;
    const size = this.currentSize;
    await closeStream(this.writeStream);
    const completedPath = await finalizePartFile(this.currentPartPath, this.currentFinalPath);
    this.filesInSession += 1;
    this.bytesInSession += size;
    this.emit('file', { path: completedPath, bytes: size });
    await this.openNextPart();
  }

  private async openNextPart(): Promise<void> {
    if (!this.session) return;
    const number = this.nextNumber;
    this.nextNumber += 1;
    this.currentFilename = finalName(this.session.sessionDate, number);
    this.currentFinalPath = path.join(this.session.outputDirectory, this.currentFilename);
    this.currentPartPath = path.join(
      this.session.outputDirectory,
      `${this.currentFilename}.${process.pid}.${Date.now()}.part`
    );
    this.currentSize = 0;
    this.writeStream = createWriteStream(this.currentPartPath, { flags: 'wx' });
    await new Promise<void>((resolve, reject) => {
      this.writeStream!.once('open', () => resolve());
      this.writeStream!.once('error', reject);
    });
  }

  private async finish(error?: Error): Promise<void> {
    const session = this.session;
    if (!session) return;
    const stream = this.writeStream;
    this.writeStream = undefined;
    this.session = undefined;
    this.controller = undefined;

    try {
      if (stream) await closeStream(stream);
      if (this.currentPartPath && this.currentSize > 0) {
        const completedPath = await finalizePartFile(this.currentPartPath, this.currentFinalPath);
        const bytes = (await stat(completedPath)).size;
        this.filesInSession += 1;
        this.bytesInSession += bytes;
        this.emit('file', { path: completedPath, bytes });
      }
    } catch (finalizeError) {
      error = finalizeError instanceof Error ? finalizeError : new Error(String(finalizeError));
    }

    const files = this.filesInSession;
    const bytes = this.bytesInSession;
    this.currentPartPath = '';
    this.currentFinalPath = '';
    this.currentFilename = '';
    this.currentSize = 0;
    this.filesInSession = 0;
    this.bytesInSession = 0;
    this.emit('stopped', { session, files, bytes, error });
  }
}

async function closeStream(stream: WriteStream): Promise<void> {
  if (stream.closed || stream.destroyed) return;
  await new Promise<void>((resolve, reject) => {
    stream.once('finish', resolve);
    stream.once('error', reject);
    stream.end();
  });
}

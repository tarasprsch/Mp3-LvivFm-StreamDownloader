import { statfs } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { type AppConfig, type ConfigStore } from './config.js';
import { deletePartialRecording, listPartialRecordings, PartialRecordingDeleteError } from './files.js';
import type { AppLogger } from './logger.js';
import { Recorder, type RecorderSession, type RecorderSource, type RecorderStatus } from './recorder.js';
import { getScheduleState, isScheduleChanged } from './schedule.js';
import type { StatsStore } from './stats.js';

type ManualOverride = 'none' | 'manual-start' | 'stopped-until-next-start';

export class CaptureController extends EventEmitter {
  private timer: NodeJS.Timeout | undefined;
  private manualOverride: ManualOverride = 'none';
  private blockedWindowId: string | undefined;
  private failedWindowId: string | undefined;
  private currentSessionId: string | undefined;
  private currentSource: RecorderSource | undefined;
  private lastError: string | undefined;
  private lastScheduleActive = false;

  constructor(
    private readonly configStore: ConfigStore,
    private readonly logger: AppLogger,
    private readonly stats: StatsStore,
    private readonly recorder: RecorderLike = new Recorder()
  ) {
    super();
    this.recorder.on('file', ({ bytes }) => {
      void this.stats.addFile(bytes);
    });
    this.recorder.on('connected', ({ connectedAt }) => {
      void this.stats.markSuccessfulConnection(connectedAt);
    });
    this.recorder.on('stopped', ({ session, files, bytes, error }) => {
      void this.handleRecorderStopped(session.id, session.source, files, bytes, error);
    });
    this.configStore.on('change', (next: AppConfig, previous: AppConfig) => {
      if (isScheduleChanged(previous, next)) {
        void this.logger.log('schedule_changed', 'Schedule changed', {
          start: next.schedule.start,
          end: next.schedule.end
        });
      }
      void this.tick();
    });
    this.configStore.on('invalid', (error: string) => {
      this.lastError = error;
      void this.logger.log('config_validation_error', 'Invalid external config ignored', { error });
    });
  }

  async start(): Promise<void> {
    const config = this.configStore.value;
    const partials = await listPartialRecordings(config.recording.outputDirectory);
    if (partials.length > 0) {
      await this.logger.log('partial_files_found', 'Existing partial recording files were left untouched', {
        files: partials.map((partial) => partial.name)
      });
    }
    await this.tick();
    this.timer = setInterval(() => void this.tick(), 15_000);
    this.timer.unref();
  }

  async shutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.recorder.stop();
  }

  async manualStart(): Promise<{ ok: true } | { ok: false; error: string }> {
    const config = this.configStore.value;
    if (!config.enabled) {
      return { ok: false, error: 'Capture is disabled in settings.' };
    }
    this.manualOverride = 'manual-start';
    this.blockedWindowId = undefined;
    if (!this.recorder.active) {
      try {
        await this.startRecording('manual');
      } catch (error) {
        this.manualOverride = 'none';
        const message = describeError(error);
        this.lastError = message;
        await this.logger.log('stream_error', 'Manual recording failed to start', { error: message });
        await this.stats.addFailure(message);
        return { ok: false, error: message };
      }
    }
    return { ok: true };
  }

  async manualStop(): Promise<{ ok: true }> {
    const config = this.configStore.value;
    const schedule = getScheduleState(config.schedule);
    this.manualOverride = schedule.active ? 'stopped-until-next-start' : 'none';
    this.blockedWindowId = schedule.active ? schedule.windowId : undefined;
    await this.recorder.stop();
    return { ok: true };
  }

  async deletePartialFile(name: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
    if (isCurrentPartialFile(this.recorder.status, name)) {
      return { ok: false, error: 'Current recording partial file cannot be deleted.', status: 409 };
    }

    try {
      await deletePartialRecording(this.configStore.value.recording.outputDirectory, name);
      return { ok: true };
    } catch (error) {
      if (error instanceof PartialRecordingDeleteError) {
        return {
          ok: false,
          error: error.message,
          status: error.code === 'not-found' ? 404 : 400
        };
      }
      return { ok: false, error: describeError(error), status: 500 };
    }
  }

  async status() {
    const config = this.configStore.value;
    const schedule = getScheduleState(config.schedule);
    const recorder = this.recorder.status;
    const partials = await listPartialRecordings(config.recording.outputDirectory).catch(() => []);
    const disk = await readDisk(config.recording.outputDirectory);

    return {
      enabled: config.enabled,
      recorder,
      schedule: {
        active: schedule.active,
        currentStart: schedule.currentStart?.toISOString(),
        currentEnd: schedule.currentEnd?.toISOString(),
        nextStart: schedule.nextStart.toISOString(),
        nextEnd: schedule.nextEnd.toISOString()
      },
      manualOverride: this.manualOverride,
      expectedStop: schedule.active ? schedule.currentEnd?.toISOString() : undefined,
      serviceUptimeSeconds: Math.round((Date.now() - Date.parse(this.stats.value.appStartedAt)) / 1000),
      stats: this.stats.value,
      lastError: this.lastError ?? this.stats.value.lastError,
      partialFiles: partials,
      disk
    };
  }

  private async tick(): Promise<void> {
    const config = this.configStore.value;
    const schedule = getScheduleState(config.schedule);

    if (!schedule.active) {
      const scheduleJustEnded = this.lastScheduleActive;
      this.lastScheduleActive = false;
      this.blockedWindowId = undefined;
      this.failedWindowId = undefined;
      if (this.recorder.active && this.currentSource === 'scheduled') await this.stopForScheduleEnd();
      if (scheduleJustEnded && this.recorder.active && this.currentSource === 'manual') {
        await this.stopForScheduleEnd();
        this.manualOverride = 'none';
      }
      return;
    }

    this.lastScheduleActive = true;
    if (this.recorder.active) return;
    if (!config.enabled) return;
    if (this.blockedWindowId === schedule.windowId) return;
    if (this.failedWindowId === schedule.windowId) return;
    if (this.manualOverride === 'stopped-until-next-start') return;

    try {
      await this.startRecording('scheduled');
    } catch (error) {
      const message = describeError(error);
      this.failedWindowId = schedule.windowId;
      this.lastError = message;
      await this.logger.log('stream_error', 'Scheduled recording failed to start', { error: message });
      await this.stats.addFailure(message);
    }
  }

  private async startRecording(source: RecorderSource): Promise<void> {
    const config = this.configStore.value;
    const session = await this.recorder.start({
      source,
      streamUrl: config.stream.url,
      outputDirectory: config.recording.outputDirectory,
      splitMegabytes: config.recording.splitSize
    });
    this.currentSessionId = session.id;
    this.currentSource = source;
    await this.stats.startSession(session.id, source, session.startedAt);
    await this.logger.log(
      source === 'scheduled' ? 'scheduled_recording_started' : 'manual_recording_started',
      `${source === 'scheduled' ? 'Scheduled' : 'Manual'} recording started`
    );
  }

  private async stopForScheduleEnd(): Promise<void> {
    const source = this.currentSource;
    await this.recorder.stop();
    if (source === 'scheduled') {
      await this.logger.log('scheduled_recording_stopped', 'Scheduled recording stopped');
    }
  }

  private async handleRecorderStopped(
    sessionId: string,
    source: RecorderSource,
    files: number,
    bytes: number,
    error: Error | undefined
  ): Promise<void> {
    const wasCurrent = this.currentSessionId === sessionId;
    this.currentSessionId = undefined;
    this.currentSource = undefined;
    const stoppedAt = new Date();

    if (error) {
      const message = describeError(error);
      this.lastError = message;
      const schedule = getScheduleState(this.configStore.value.schedule);
      if (source === 'scheduled' && schedule.active) this.failedWindowId = schedule.windowId;
      if (source === 'manual') this.manualOverride = 'none';
      await this.logger.log('stream_error', 'Stream error stopped recording', { error: message });
      await this.stats.finishSession(sessionId, stoppedAt, 'failed', files, bytes);
      return;
    }

    if (wasCurrent && source === 'manual') {
      await this.logger.log('manual_recording_stopped', 'Manual recording stopped');
    }
    await this.stats.finishSession(sessionId, stoppedAt, 'stopped', files, bytes);
  }
}

export type RecorderLike = EventEmitter & {
  active: boolean;
  status: RecorderStatus;
  start(options: {
    source: RecorderSource;
    streamUrl: string;
    outputDirectory: string;
    splitMegabytes: number;
  }): Promise<RecorderSession>;
  stop(): Promise<void>;
};

async function readDisk(directory: string) {
  try {
    const info = await statfs(directory);
    return {
      totalBytes: info.blocks * info.bsize,
      availableBytes: info.bavail * info.bsize
    };
  } catch {
    return undefined;
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isCurrentPartialFile(status: RecorderStatus, name: string): boolean {
  if (name === status.currentPartFilename) return true;
  return Boolean(status.active && status.currentFilename && name.startsWith(`${status.currentFilename}.`) && name.endsWith('.part'));
}

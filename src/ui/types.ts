export type Page = 'main' | 'logs' | 'settings';

export type StateResponse = {
  enabled: boolean;
  recorder: {
    active: boolean;
    source?: 'manual' | 'scheduled';
    currentFilename?: string;
    currentSize: number;
    startedAt?: string;
    durationSeconds: number;
    filesInSession: number;
    bytesInSession: number;
  };
  schedule: {
    active: boolean;
    currentStart?: string;
    currentEnd?: string;
    nextStart: string;
    nextEnd: string;
  };
  manualOverride: string;
  expectedStop?: string;
  serviceUptimeSeconds: number;
  stats: {
    recordingSeconds: number;
    filesCreated: number;
    bytesCreated: number;
    recordingDays: string[];
    failures: number;
    sessions: Array<{
      id: string;
      source: string;
      startedAt: string;
      stoppedAt?: string;
      files: number;
      bytes: number;
      status: string;
    }>;
    lastSuccessfulConnection?: string;
    lastError?: string;
  };
  lastError?: string;
  partialFiles: Array<{ name: string; size: number }>;
  disk?: { totalBytes: number; availableBytes: number };
};

export type SettingsResponse = {
  enabled: boolean;
  schedule: { start: string; end: string };
  recording: { splitSize: number };
  auth: { password: string };
};

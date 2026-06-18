import { EventEmitter } from 'node:events';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export const configSchema = z.object({
  enabled: z.boolean(),
  stream: z.object({
    url: z.string().url()
  }),
  schedule: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().min(1)
  }),
  recording: z.object({
    splitSize: z.number().positive(),
    outputDirectory: z.string().min(1)
  }),
  web: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535)
  }),
  auth: z.object({
    password: z.string().min(1)
  })
});

export const publicSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  schedule: z
    .object({
      start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      end: z.string().regex(/^\d{2}:\d{2}$/).optional()
    })
    .optional(),
  recording: z
    .object({
      splitSize: z.number().positive().optional()
    })
    .optional(),
  auth: z
    .object({
      password: z.string().min(1).optional()
    })
    .optional()
});

export type AppConfig = z.infer<typeof configSchema>;
export type PublicSettingsPatch = z.infer<typeof publicSettingsSchema>;

export const defaultConfig: AppConfig = {
  enabled: true,
  stream: {
    url: 'https://onair.lviv.fm:8443/lviv.fm'
  },
  schedule: {
    start: '23:00',
    end: '06:00',
    timezone: 'Europe/Kyiv'
  },
  recording: {
    splitSize: 19.2,
    outputDirectory: '/mp3'
  },
  web: {
    host: '0.0.0.0',
    port: 11080
  },
  auth: {
    password: 'change-me'
  }
};

export class ConfigStore extends EventEmitter {
  private current: AppConfig = defaultConfig;
  private watchTimer: NodeJS.Timeout | undefined;
  private lastRaw = '';

  constructor(
    readonly dataDirectory = process.env.DATA_DIR ?? '/data',
    readonly configPath = path.join(dataDirectory, 'config.json')
  ) {
    super();
  }

  get value(): AppConfig {
    return structuredClone(this.current);
  }

  async load(): Promise<AppConfig> {
    await mkdir(this.dataDirectory, { recursive: true });
    try {
      const raw = await readFile(this.configPath, 'utf8');
      const parsed = configSchema.parse(JSON.parse(raw));
      this.current = parsed;
      this.lastRaw = JSON.stringify(parsed);
      return this.value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        await this.save(defaultConfig);
        return this.value;
      }
      throw error;
    }
  }

  async reloadExternal(): Promise<{ ok: true; config: AppConfig } | { ok: false; error: string }> {
    try {
      const raw = await readFile(this.configPath, 'utf8');
      const parsed = configSchema.parse(JSON.parse(raw));
      const serialized = JSON.stringify(parsed);
      if (serialized !== this.lastRaw) {
        const previous = this.current;
        this.current = parsed;
        this.lastRaw = serialized;
        this.emit('change', this.value, previous);
      }
      return { ok: true, config: this.value };
    } catch (error) {
      return { ok: false, error: describeConfigError(error) };
    }
  }

  watch(intervalMs = 5000): void {
    if (this.watchTimer) return;
    this.watchTimer = setInterval(() => {
      void this.reloadExternal().then((result) => {
        if (!result.ok) this.emit('invalid', result.error);
      });
    }, intervalMs);
    this.watchTimer.unref();
  }

  stopWatching(): void {
    if (this.watchTimer) clearInterval(this.watchTimer);
    this.watchTimer = undefined;
  }

  async updatePublicSettings(patch: PublicSettingsPatch): Promise<AppConfig> {
    const safePatch = publicSettingsSchema.parse(patch);
    const next: AppConfig = {
      ...this.current,
      enabled: safePatch.enabled ?? this.current.enabled,
      schedule: {
        ...this.current.schedule,
        start: safePatch.schedule?.start ?? this.current.schedule.start,
        end: safePatch.schedule?.end ?? this.current.schedule.end
      },
      recording: {
        ...this.current.recording,
        splitSize: safePatch.recording?.splitSize ?? this.current.recording.splitSize
      },
      auth: {
        ...this.current.auth,
        password: safePatch.auth?.password ?? this.current.auth.password
      }
    };
    return this.save(configSchema.parse(next));
  }

  async save(config: AppConfig): Promise<AppConfig> {
    await mkdir(this.dataDirectory, { recursive: true });
    const parsed = configSchema.parse(config);
    const body = `${JSON.stringify(parsed, null, 2)}\n`;
    const tempPath = `${this.configPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, body, { encoding: 'utf8', mode: 0o600 });
    await rename(tempPath, this.configPath);
    const previous = this.current;
    this.current = parsed;
    this.lastRaw = JSON.stringify(parsed);
    this.emit('change', this.value, previous);
    return this.value;
  }
}

export function exposeSettings(config: AppConfig) {
  return {
    enabled: config.enabled,
    schedule: {
      start: config.schedule.start,
      end: config.schedule.end
    },
    recording: {
      splitSize: config.recording.splitSize
    },
    auth: {
      password: ''
    }
  };
}

export function describeConfigError(error: unknown): string {
  if (error instanceof z.ZodError) return z.prettifyError(error);
  if (error instanceof Error) return error.message;
  return String(error);
}

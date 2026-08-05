import { EventEmitter } from 'node:events';
import type { WriteStream } from 'node:fs';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const httpsGet = vi.hoisted(() => vi.fn());

vi.mock('node:https', () => ({
  default: { get: httpsGet }
}));

import { Recorder, type RecorderSession } from './recorder.js';

type StoppedEvent = {
  session: RecorderSession;
  files: number;
  bytes: number;
  error?: Error;
};

type RecorderInternals = {
  writeChunk(chunk: Buffer): Promise<void>;
  writeStream?: WriteStream;
  currentPartPath: string;
};

describe('recorder part settlement', () => {
  let request: EventEmitter;

  beforeEach(() => {
    request = new EventEmitter();
    httpsGet.mockReset();
    httpsGet.mockImplementation(() => request);
  });

  it('finalizes and reports one nonempty unsplit part on manual stop', async () => {
    const { directory, recorder } = await startedRecorder(100);
    const files: Array<{ path: string; bytes: number }> = [];
    recorder.on('file', (file) => files.push(file));
    const stopped = nextStopped(recorder);

    await write(recorder, 10);
    await recorder.stop();

    await expect(stopped).resolves.toMatchObject({ files: 1, bytes: 10, error: undefined });
    expect(files).toEqual([{ path: expect.stringMatching(/\.mp3$/), bytes: 10 }]);
    expect(await recordingEntries(directory)).toEqual([{ extension: '.mp3', size: 10 }]);
  });

  it('discards a nonempty tail after one completed split on manual stop', async () => {
    const { directory, recorder } = await startedRecorder(10);
    const files: Array<{ path: string; bytes: number }> = [];
    recorder.on('file', (file) => files.push(file));
    const stopped = nextStopped(recorder);

    await write(recorder, 10);
    await write(recorder, 4);
    await recorder.stop();

    await expect(stopped).resolves.toMatchObject({ files: 1, bytes: 10, error: undefined });
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ bytes: 10 });
    expect(await recordingEntries(directory)).toEqual([{ extension: '.mp3', size: 10 }]);
  });

  it('removes the empty part opened after multiple completed splits', async () => {
    const { directory, recorder } = await startedRecorder(10);
    const files: Array<{ path: string; bytes: number }> = [];
    recorder.on('file', (file) => files.push(file));
    const stopped = nextStopped(recorder);

    await write(recorder, 10);
    await write(recorder, 10);
    await recorder.stop();

    await expect(stopped).resolves.toMatchObject({ files: 2, bytes: 20, error: undefined });
    expect(files).toHaveLength(2);
    expect(await recordingEntries(directory)).toEqual([
      { extension: '.mp3', size: 10 },
      { extension: '.mp3', size: 10 }
    ]);
  });

  it('removes a zero-byte sole part without reporting a file', async () => {
    const { directory, recorder } = await startedRecorder(10);
    const files: Array<{ path: string; bytes: number }> = [];
    recorder.on('file', (file) => files.push(file));
    const stopped = nextStopped(recorder);

    await recorder.stop();

    await expect(stopped).resolves.toMatchObject({ files: 0, bytes: 0, error: undefined });
    expect(files).toEqual([]);
    await expect(readdir(directory)).resolves.toEqual([]);
  });

  it('uses the same tail-discard rule when capture fails', async () => {
    const { directory, recorder } = await startedRecorder(10);
    const files: Array<{ path: string; bytes: number }> = [];
    recorder.on('file', (file) => files.push(file));
    const stopped = nextStopped(recorder);

    await write(recorder, 10);
    await write(recorder, 4);
    request.emit('error', new Error('stream failed'));

    await expect(stopped).resolves.toMatchObject({
      files: 1,
      bytes: 10,
      error: { message: 'stream failed' }
    });
    expect(files).toHaveLength(1);
    expect(await recordingEntries(directory)).toEqual([{ extension: '.mp3', size: 10 }]);
  });

  it('reports a failed tail deletion once and does not rename or count the tail', async () => {
    const { directory, recorder } = await startedRecorder(10);
    const files: Array<{ path: string; bytes: number }> = [];
    const stoppedEvents: StoppedEvent[] = [];
    recorder.on('file', (file) => files.push(file));
    recorder.on('stopped', (event) => stoppedEvents.push(event));

    await write(recorder, 10);
    await write(recorder, 4);
    const internals = recorder as unknown as RecorderInternals;
    const partPath = internals.currentPartPath;
    await closeForTest(internals.writeStream!);
    await unlink(partPath);
    await mkdir(partPath);
    const stopped = nextStopped(recorder);

    await recorder.stop();

    const result = await stopped;
    expect(result).toMatchObject({ files: 1, bytes: 10, error: expect.any(Error) });
    expect(stoppedEvents).toHaveLength(1);
    expect(files).toHaveLength(1);
    expect((await readdir(directory)).sort()).toEqual([
      path.basename(partPath),
      path.basename(files[0]!.path)
    ].sort());
  });

  it('settles and emits stopped only once when stop races capture closure', async () => {
    const { directory, recorder } = await startedRecorder(10);
    const stoppedEvents: StoppedEvent[] = [];
    recorder.on('stopped', (event) => stoppedEvents.push(event));

    await write(recorder, 10);
    await write(recorder, 4);
    const stopping = recorder.stop();
    request.emit('error', new Error('capture closed during stop'));
    request.emit('close');
    await stopping;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(stoppedEvents).toHaveLength(1);
    expect(stoppedEvents[0]).toMatchObject({ files: 1, bytes: 10, error: undefined });
    expect(await recordingEntries(directory)).toEqual([{ extension: '.mp3', size: 10 }]);
  });
});

async function startedRecorder(splitBytes: number): Promise<{ directory: string; recorder: Recorder }> {
  const directory = path.join(os.tmpdir(), `lfm-recorder-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(directory, { recursive: true });
  const recorder = new Recorder();
  await recorder.start({
    source: 'manual',
    streamUrl: 'https://example.test/stream',
    outputDirectory: directory,
    splitMegabytes: splitBytes / 1_000_000,
    timezone: 'Europe/Kyiv'
  });
  return { directory, recorder };
}

async function write(recorder: Recorder, bytes: number): Promise<void> {
  await (recorder as unknown as RecorderInternals).writeChunk(Buffer.alloc(bytes));
}

function nextStopped(recorder: Recorder): Promise<StoppedEvent> {
  return new Promise((resolve) => recorder.once('stopped', resolve));
}

async function recordingEntries(directory: string): Promise<Array<{ extension: string; size: number }>> {
  const names = (await readdir(directory)).sort();
  return Promise.all(names.map(async (name) => ({ extension: path.extname(name), size: (await stat(path.join(directory, name))).size })));
}

async function closeForTest(stream: WriteStream): Promise<void> {
  if (stream.closed || stream.destroyed) return;
  await new Promise<void>((resolve, reject) => {
    stream.once('close', resolve);
    stream.once('error', reject);
    stream.end();
  });
}

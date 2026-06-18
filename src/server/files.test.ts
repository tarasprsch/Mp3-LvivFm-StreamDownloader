import { mkdir, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { finalizePartFile, listPartialRecordings, nextRecordingNumber } from './files.js';

describe('recording files', () => {
  it('chooses the next number from completed mp3 files and ignores partials', async () => {
    const directory = await tempDirectory();
    await writeFile(path.join(directory, '2026-06-17__01.mp3'), 'a');
    await writeFile(path.join(directory, '2026-06-17__08.mp3'), 'a');
    await writeFile(path.join(directory, '2026-06-17__09.mp3.part'), 'a');

    await expect(nextRecordingNumber(directory, '2026-06-17')).resolves.toBe(9);
  });

  it('reports existing partial files on startup', async () => {
    const directory = await tempDirectory();
    await writeFile(path.join(directory, 'old.mp3.part'), 'abc');

    const partials = await listPartialRecordings(directory);
    expect(partials).toEqual([
      expect.objectContaining({
        name: 'old.mp3.part',
        size: 3
      })
    ]);
  });

  it('does not overwrite an existing final file when finalizing', async () => {
    const directory = await tempDirectory();
    const part = path.join(directory, 'active.part');
    const final = path.join(directory, '2026-06-17__01.mp3');
    await writeFile(part, 'new');
    await writeFile(final, 'old');

    const completed = await finalizePartFile(part, final);
    const names = await readdir(directory);
    expect(completed).toContain('2026-06-17__01-1.mp3');
    expect(names.sort()).toEqual(['2026-06-17__01-1.mp3', '2026-06-17__01.mp3']);
  });
});

async function tempDirectory(): Promise<string> {
  const directory = path.join(os.tmpdir(), `lfm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(directory, { recursive: true });
  return directory;
}

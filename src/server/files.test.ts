import { mkdir, readdir, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deletePartialRecording,
  deleteRecordingsForDates,
  finalName,
  finalizePartFile,
  listPartialRecordings,
  inventoryRecordings,
  listCompletedRecordings,
  nextRecordingNumber,
  sessionDateFrom
} from './files.js';

describe('recording files', () => {
  it('inventories only recorder-owned completed files and rounds duration once', async () => {
    const directory = await tempDirectory();
    await writeFile(path.join(directory, '2026-06-18__01.mp3'), Buffer.alloc(1_000));
    await writeFile(path.join(directory, '2026-06-18__02-1.mp3'), Buffer.alloc(2_000));
    await writeFile(path.join(directory, '2026-06-17__100.mp3'), Buffer.alloc(500));
    await writeFile(path.join(directory, '2026-06-18__03.mp3.part'), Buffer.alloc(9_000));
    await writeFile(path.join(directory, 'song.mp3'), Buffer.alloc(9_000));
    await mkdir(path.join(directory, '2026-06-18__04.mp3'));
    await mkdir(path.join(directory, 'nested'));
    await writeFile(path.join(directory, 'nested', '2026-06-18__05.mp3'), Buffer.alloc(9_000));
    try {
      await symlink(path.join(directory, '2026-06-18__01.mp3'), path.join(directory, '2026-06-18__06.mp3'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
    }

    await expect(inventoryRecordings(directory, 128)).resolves.toEqual({
      recordingSeconds: Math.round(3_500 * 8 / 128_000),
      filesCreated: 3,
      bytesCreated: 3_500,
      recordingDays: ['2026-06-17', '2026-06-18']
    });
    await expect(inventoryRecordings(directory, 64)).resolves.toMatchObject({
      recordingSeconds: Math.round(3_500 * 8 / 64_000)
    });
  });

  it('creates a missing output directory and returns an empty inventory', async () => {
    const parent = await tempDirectory();
    const directory = path.join(parent, 'missing');

    await expect(inventoryRecordings(directory, 128)).resolves.toEqual({
      recordingSeconds: 0,
      filesCreated: 0,
      bytesCreated: 0,
      recordingDays: []
    });
    await expect(readdir(directory)).resolves.toEqual([]);
  });

  it('uses the configured timezone for the recording filename date', () => {
    const startedAt = new Date('2026-08-03T21:10:00.000Z');

    expect(finalName(sessionDateFrom(startedAt, 'Europe/Kyiv'), 1)).toBe('2026-08-04__01.mp3');
  });

  it('maps session starts to the configured local date across the Kyiv UTC boundary', () => {
    expect(sessionDateFrom(new Date('2026-08-03T20:59:59.000Z'), 'Europe/Kyiv')).toBe('2026-08-03');
    expect(sessionDateFrom(new Date('2026-08-03T21:00:00.000Z'), 'Europe/Kyiv')).toBe('2026-08-04');
  });

  it('lists and deletes only direct recorder-owned completed files for deduplicated dates', async () => {
    const directory = await tempDirectory();
    await writeFile(path.join(directory, '2026-08-03__01.mp3'), 'abc');
    await writeFile(path.join(directory, '2026-08-03__02-1.mp3'), 'de');
    await writeFile(path.join(directory, '2026-08-04__01.mp3'), 'keep');
    await writeFile(path.join(directory, '2026-08-03__03.mp3.part'), 'partial');
    await writeFile(path.join(directory, 'song.mp3'), 'unrelated');
    await mkdir(path.join(directory, 'nested'));
    await writeFile(path.join(directory, 'nested', '2026-08-03__04.mp3'), 'nested');
    let symlinkCreated = false;
    try {
      await symlink(path.join(directory, '2026-08-03__01.mp3'), path.join(directory, '2026-08-03__05.mp3'));
      symlinkCreated = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
    }

    const listed = await listCompletedRecordings(directory);
    expect(listed.map(({ name, date, size }) => ({ name, date, size }))).toEqual([
      { name: '2026-08-03__01.mp3', date: '2026-08-03', size: 3 },
      { name: '2026-08-03__02-1.mp3', date: '2026-08-03', size: 2 },
      { name: '2026-08-04__01.mp3', date: '2026-08-04', size: 4 }
    ]);

    await expect(deleteRecordingsForDates(directory, ['2026-08-03', '2026-08-03'])).resolves.toEqual({
      deletedFiles: 2,
      deletedBytes: 5
    });
    const remaining = (await readdir(directory)).sort();
    expect(remaining).toEqual([
      '2026-08-03__03.mp3.part',
      ...(symlinkCreated ? ['2026-08-03__05.mp3'] : []),
      '2026-08-04__01.mp3',
      'nested',
      'song.mp3'
    ]);
  });

  it('reports successful counts when deleting a later target fails', async () => {
    const directory = await tempDirectory();
    await writeFile(path.join(directory, '2026-08-03__01.mp3'), 'abc');
    await writeFile(path.join(directory, '2026-08-03__02.mp3'), 'de');
    let calls = 0;

    await expect(deleteRecordingsForDates(directory, ['2026-08-03'], async () => {
      calls += 1;
      if (calls === 2) throw new Error('unlink failed');
    })).rejects.toMatchObject({
      message: 'Unable to delete one or more recordings.',
      deletedFiles: 1,
      deletedBytes: 3
    });
  });

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

  it('lists partial files with the latest names first', async () => {
    const directory = await tempDirectory();
    await writeFile(path.join(directory, '2026-06-17__01.mp3.part'), 'a');
    await writeFile(path.join(directory, '2026-06-18__02.mp3.part'), 'b');

    const partials = await listPartialRecordings(directory);

    expect(partials.map((partial) => partial.name)).toEqual([
      '2026-06-18__02.mp3.part',
      '2026-06-17__01.mp3.part'
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

  it('deletes an existing partial recording by filename', async () => {
    const directory = await tempDirectory();
    await writeFile(path.join(directory, 'old.mp3.part'), 'abc');

    await deletePartialRecording(directory, 'old.mp3.part');

    await expect(listPartialRecordings(directory)).resolves.toEqual([]);
  });

  it('refuses to delete non-partial files', async () => {
    const directory = await tempDirectory();
    await writeFile(path.join(directory, 'recording.mp3'), 'abc');

    await expect(deletePartialRecording(directory, 'recording.mp3')).rejects.toThrow(
      'Only partial recording files can be deleted.'
    );
  });

  it('refuses to delete nested or traversal paths', async () => {
    const directory = await tempDirectory();

    await expect(deletePartialRecording(directory, '../old.mp3.part')).rejects.toThrow(
      'Only partial recording files can be deleted.'
    );
    await expect(deletePartialRecording(directory, 'nested\\old.mp3.part')).rejects.toThrow(
      'Only partial recording files can be deleted.'
    );
  });
});

async function tempDirectory(): Promise<string> {
  const directory = path.join(os.tmpdir(), `lfm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(directory, { recursive: true });
  return directory;
}

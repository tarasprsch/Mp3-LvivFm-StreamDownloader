import { lstat, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

export type PartialRecording = {
  name: string;
  path: string;
  size: number;
};

export type RecordingInventory = {
  recordingSeconds: number;
  filesCreated: number;
  bytesCreated: number;
  recordingDays: string[];
};

export type CompletedRecording = {
  name: string;
  path: string;
  date: string;
  size: number;
};

export type SettlePartOptions = {
  partPath: string;
  finalPath: string;
  currentBytes: number;
  completedFiles: number;
};

export type SettledPart =
  | { action: 'finalized'; path: string; bytes: number }
  | { action: 'discarded' };

const completedRecordingPattern = /^(\d{4}-\d{2}-\d{2})__(\d{2,})(?:-\d+)?\.mp3$/;

export async function ensureOutputDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
}

export async function listPartialRecordings(directory: string): Promise<PartialRecording[]> {
  await ensureOutputDirectory(directory);
  const names = await readdir(directory);
  const partials = names.filter((name) => name.endsWith('.part')).sort().reverse();
  return Promise.all(
    partials.map(async (name) => ({
      name,
      path: path.join(directory, name),
      size: (await stat(path.join(directory, name))).size
    }))
  );
}

export async function inventoryRecordings(directory: string, bitrateKbps: number): Promise<RecordingInventory> {
  const recordings = await listCompletedRecordings(directory);
  const bytesCreated = recordings.reduce((total, recording) => total + recording.size, 0);
  const recordingDays = new Set<string>();
  for (const recording of recordings) recordingDays.add(recording.date);

  return {
    recordingSeconds: Math.round(bytesCreated * 8 / (bitrateKbps * 1_000)),
    filesCreated: recordings.length,
    bytesCreated,
    recordingDays: [...recordingDays].sort()
  };
}

export async function listCompletedRecordings(directory: string): Promise<CompletedRecording[]> {
  await ensureOutputDirectory(directory);
  const entries = await readdir(directory, { withFileTypes: true });
  const recordings: CompletedRecording[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const match = completedRecordingPattern.exec(entry.name);
    if (!entry.isFile() || !match?.[1]) continue;
    const filePath = path.join(directory, entry.name);
    const info = await lstat(filePath);
    if (!info.isFile() || info.isSymbolicLink()) continue;
    recordings.push({ name: entry.name, path: filePath, date: match[1], size: info.size });
  }

  return recordings;
}

export async function deleteRecordingsForDates(
  directory: string,
  dates: Iterable<string>,
  removeFile: (filePath: string) => Promise<void> = unlink
): Promise<{ deletedFiles: number; deletedBytes: number }> {
  const requestedDates = new Set(dates);
  const targets = (await listCompletedRecordings(directory)).filter((recording) => requestedDates.has(recording.date));
  let deletedFiles = 0;
  let deletedBytes = 0;

  for (const target of targets) {
    try {
      await removeFile(target.path);
      deletedFiles += 1;
      deletedBytes += target.size;
    } catch {
      throw new RecordingDeleteError('Unable to delete one or more recordings.', deletedFiles, deletedBytes);
    }
  }

  return { deletedFiles, deletedBytes };
}

export class RecordingDeleteError extends Error {
  constructor(
    message: string,
    readonly deletedFiles: number,
    readonly deletedBytes: number
  ) {
    super(message);
  }
}

export async function deletePartialRecording(directory: string, name: string): Promise<void> {
  if (!isSafePartialRecordingName(name)) {
    throw new PartialRecordingDeleteError('Only partial recording files can be deleted.', 'invalid-name');
  }

  try {
    await unlink(path.join(directory, name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new PartialRecordingDeleteError('Partial file was not found.', 'not-found');
    }
    throw error;
  }
}

export class PartialRecordingDeleteError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid-name' | 'not-found'
  ) {
    super(message);
  }
}

export async function nextRecordingNumber(directory: string, sessionDate: string): Promise<number> {
  await ensureOutputDirectory(directory);
  const names = await readdir(directory);
  const pattern = new RegExp(`^${escapeRegExp(sessionDate)}__(\\d{2,})\\.mp3$`);
  let max = 0;
  for (const name of names) {
    const match = pattern.exec(name);
    if (match?.[1]) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

export function finalName(sessionDate: string, number: number): string {
  return `${sessionDate}__${String(number).padStart(2, '0')}.mp3`;
}

export function partName(sessionDate: string, number: number): string {
  return `${finalName(sessionDate, number)}.part`;
}

export async function finalizePartFile(partPath: string, finalPath: string): Promise<string> {
  let target = finalPath;
  const parsed = path.parse(finalPath);
  let suffix = 1;
  while (await exists(target)) {
    target = path.join(parsed.dir, `${parsed.name}-${suffix}${parsed.ext}`);
    suffix += 1;
  }
  await rename(partPath, target);
  return target;
}

export async function settlePartFile(options: SettlePartOptions): Promise<SettledPart> {
  if (options.completedFiles > 0 || options.currentBytes === 0) {
    try {
      await unlink(options.partPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return { action: 'discarded' };
  }

  const completedPath = await finalizePartFile(options.partPath, options.finalPath);
  return {
    action: 'finalized',
    path: completedPath,
    bytes: (await stat(completedPath)).size
  };
}

export function sessionDateFrom(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isSafePartialRecordingName(name: string): boolean {
  return Boolean(name) && name.endsWith('.part') && !name.includes('/') && !name.includes('\\') && path.basename(name) === name;
}

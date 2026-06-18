import { mkdir, readdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';

export type PartialRecording = {
  name: string;
  path: string;
  size: number;
};

export async function ensureOutputDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
}

export async function listPartialRecordings(directory: string): Promise<PartialRecording[]> {
  await ensureOutputDirectory(directory);
  const names = await readdir(directory);
  const partials = names.filter((name) => name.endsWith('.part')).sort();
  return Promise.all(
    partials.map(async (name) => ({
      name,
      path: path.join(directory, name),
      size: (await stat(path.join(directory, name))).size
    }))
  );
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

export function sessionDateFrom(date: Date): string {
  return date.toISOString().slice(0, 10);
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

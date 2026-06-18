export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest].map((part) => String(part).padStart(2, '0')).join(':');
}

export function formatDate(value: string | undefined): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function formatLogLine(line: string): string {
  const parsed = parseLogLine(line);
  if (!parsed) return line;

  return `${formatLogDate(parsed.time)} : ${parsed.message}`;
}

function parseLogLine(line: string): { time: string; message: string } | undefined {
  try {
    const body = JSON.parse(line) as { time?: unknown; message?: unknown };
    if (typeof body.time !== 'string' || typeof body.message !== 'string') return undefined;
    return { time: body.time, message: body.message };
  } catch {
    return undefined;
  }
}

function formatLogDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? '';
  return `${Number(get('day'))} ${get('month').toLowerCase()} ${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

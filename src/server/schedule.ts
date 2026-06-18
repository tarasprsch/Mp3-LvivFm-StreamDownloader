import type { AppConfig } from './config.js';

export type ScheduleState = {
  active: boolean;
  windowId: string;
  currentStart?: Date;
  currentEnd?: Date;
  nextStart: Date;
  nextEnd: Date;
};

type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function getScheduleState(schedule: AppConfig['schedule'], now = new Date()): ScheduleState {
  const local = getZonedParts(now, schedule.timezone);
  const today = dateOnly(local);
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const candidates = [
    buildWindow(yesterday, schedule),
    buildWindow(today, schedule),
    buildWindow(tomorrow, schedule),
    buildWindow(addDays(today, 2), schedule)
  ];
  const activeWindow = candidates.find((window) => now >= window.start && now < window.end);
  const nextWindow = candidates.find((window) => window.start > now) ?? candidates[candidates.length - 1]!;

  if (activeWindow) {
    return {
      active: true,
      windowId: activeWindow.id,
      currentStart: activeWindow.start,
      currentEnd: activeWindow.end,
      nextStart: nextWindow.start,
      nextEnd: activeWindow.end
    };
  }

  return {
    active: false,
    windowId: nextWindow.id,
    nextStart: nextWindow.start,
    nextEnd: nextWindow.end
  };
}

export function expectedStop(schedule: AppConfig['schedule'], now = new Date()): Date | undefined {
  const state = getScheduleState(schedule, now);
  return state.active ? state.currentEnd : undefined;
}

export function isScheduleChanged(previous: AppConfig, next: AppConfig): boolean {
  return previous.schedule.start !== next.schedule.start || previous.schedule.end !== next.schedule.end;
}

function buildWindow(startDate: Date, schedule: AppConfig['schedule']) {
  const startTime = parseTime(schedule.start);
  const endTime = parseTime(schedule.end);
  const crossesMidnight = minutesOf(startTime) >= minutesOf(endTime);
  const endDate = crossesMidnight ? addDays(startDate, 1) : startDate;
  const start = zonedDateTimeToUtc({ ...dateToPlain(startDate), ...startTime, second: 0 }, schedule.timezone);
  const end = zonedDateTimeToUtc({ ...dateToPlain(endDate), ...endTime, second: 0 }, schedule.timezone);
  const id = `${formatPlainDate(startDate)}T${schedule.start}`;
  return { id, start, end };
}

function parseTime(value: string) {
  const [hourRaw, minuteRaw] = value.split(':');
  return { hour: Number(hourRaw), minute: Number(minuteRaw) };
}

function minutesOf(time: { hour: number; minute: number }) {
  return time.hour * 60 + time.minute;
}

function getZonedParts(date: Date, timeZone: string): Parts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function zonedDateTimeToUtc(parts: Parts, timeZone: string): Date {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let guess = new Date(target);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = getZonedParts(guess, timeZone);
    const actualUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const delta = target - actualUtc;
    if (delta === 0) return guess;
    guess = new Date(guess.getTime() + delta);
  }
  return guess;
}

function dateOnly(parts: Parts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function dateToPlain(date: Date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(date.getUTCDate() + days);
  return next;
}

function formatPlainDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

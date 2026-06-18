import { describe, expect, it } from 'vitest';
import { getScheduleState } from './schedule.js';
import { defaultConfig } from './config.js';

describe('schedule calculations', () => {
  const schedule = defaultConfig.schedule;

  it('treats crossing-midnight windows as active after midnight', () => {
    const state = getScheduleState(schedule, new Date('2026-06-17T01:30:00.000Z'));
    expect(state.active).toBe(true);
    expect(state.currentStart?.toISOString()).toBe('2026-06-16T20:00:00.000Z');
    expect(state.currentEnd?.toISOString()).toBe('2026-06-17T03:00:00.000Z');
  });

  it('reports the next start and end outside the active window', () => {
    const state = getScheduleState(schedule, new Date('2026-06-17T10:00:00.000Z'));
    expect(state.active).toBe(false);
    expect(state.nextStart.toISOString()).toBe('2026-06-17T20:00:00.000Z');
    expect(state.nextEnd.toISOString()).toBe('2026-06-18T03:00:00.000Z');
  });
});

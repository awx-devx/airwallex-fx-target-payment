import { cutoffInstant, executionSchedule, subtractBusinessDays } from '@/server/domain/deadline';
import { describe, expect, it } from 'vitest';

describe('execution deadline', () => {
  it('steps back across weekends and non-conversion days', () => {
    expect(subtractBusinessDays('2026-10-05', 1)).toBe('2026-10-02');
    expect(subtractBusinessDays('2026-10-03', 1)).toBe('2026-10-02');
    expect(subtractBusinessDays('2026-10-05', 1, ['2026-10-02'])).toBe('2026-10-01');
    expect(subtractBusinessDays('2026-10-05', 0)).toBe('2026-10-05');
  });

  it('places 14:00 on the right side of daylight saving', () => {
    expect(cutoffInstant('2026-10-03', '14:00', 'Australia/Melbourne').toISOString()).toBe(
      '2026-10-03T04:00:00.000Z',
    );
    expect(cutoffInstant('2026-10-05', '14:00', 'Australia/Melbourne').toISOString()).toBe(
      '2026-10-05T03:00:00.000Z',
    );
    expect(cutoffInstant('2026-10-24', '14:00', 'Europe/London').toISOString()).toBe(
      '2026-10-24T13:00:00.000Z',
    );
    expect(cutoffInstant('2026-10-26', '14:00', 'Europe/London').toISOString()).toBe(
      '2026-10-26T14:00:00.000Z',
    );
    expect(cutoffInstant('2026-10-31', '14:00', 'America/Los_Angeles').toISOString()).toBe(
      '2026-10-31T21:00:00.000Z',
    );
    expect(cutoffInstant('2026-11-02', '14:00', 'America/Los_Angeles').toISOString()).toBe(
      '2026-11-02T22:00:00.000Z',
    );
  });

  it('builds the cutoff from the due date and the lead', () => {
    const schedule = executionSchedule({
      dueDate: '2026-10-05',
      leadDays: 1,
      cutoff: '14:00',
      timeZone: 'America/Los_Angeles',
    });
    expect(schedule.executionDeadline).toBe('2026-10-02');
    expect(schedule.autosettleAt.toISOString()).toBe('2026-10-02T21:00:00.000Z');
  });
});

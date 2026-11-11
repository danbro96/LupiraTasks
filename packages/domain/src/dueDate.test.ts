import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  NO_DUE,
  dueAtTime,
  dueDateOf,
  dueFromInputs,
  dueFromText,
  dueInDays,
  dueNextWeekend,
  dueOnDate,
  formatDue,
  toDateInputValue,
  toTimeInputValue,
  withDay,
} from './dueDate';

// Fixed "now" = noon on Wed 2026-06-10 (local), away from midnight so day-boundary math is stable.
describe('dueDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10, 12, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('quick picks and the date picker give a whole-day due', () => {
    expect(dueInDays(0)).toEqual({ dueOn: '2026-06-10', dueAt: null });
    expect(dueInDays(1)).toEqual({ dueOn: '2026-06-11', dueAt: null });
    expect(dueInDays(-1)).toEqual({ dueOn: '2026-06-09', dueAt: null });
    expect(dueOnDate(new Date(2026, 5, 20, 9, 0, 0))).toEqual({ dueOn: '2026-06-20', dueAt: null });
  });

  it('dueNextWeekend lands on the coming Saturday', () => {
    expect(dueNextWeekend()).toEqual({ dueOn: '2026-06-13', dueAt: null });
  });

  it('dueAtTime gives a timed due at that local time on that day', () => {
    const { dueOn, dueAt } = dueAtTime(new Date(2026, 5, 20), 14, 30);
    expect(dueOn).toBeNull();
    expect(dueAt).toBe(new Date(2026, 5, 20, 14, 30).toISOString());
  });

  it('labels today / tomorrow / yesterday relative to now', () => {
    expect(formatDue(dueInDays(0))?.label).toBe('Today');
    expect(formatDue(dueInDays(1))?.label).toBe('Tomorrow');
    expect(formatDue(dueInDays(-1))?.label).toBe('Yesterday');
  });

  it('uses a short month/day label for further-out dates', () => {
    const r = formatDue(dueInDays(40));
    expect(r).not.toBeNull();
    expect(['Today', 'Tomorrow', 'Yesterday']).not.toContain(r!.label);
  });

  it('shows the time beside the day for a timed due', () => {
    const time = new Date(2026, 5, 11, 9, 5).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    expect(formatDue(dueAtTime(new Date(2026, 5, 11), 9, 5))?.label).toBe(`Tomorrow ${time}`);
  });

  it('a whole-day due is overdue only once its day has passed', () => {
    expect(formatDue(dueInDays(0))?.overdue).toBe(false);
    expect(formatDue(dueInDays(-1))?.overdue).toBe(true);
    expect(formatDue(dueInDays(5))?.overdue).toBe(false);
    vi.setSystemTime(new Date(2026, 5, 10, 23, 59, 59));
    expect(formatDue({ dueOn: '2026-06-10' })?.overdue).toBe(false);
    vi.setSystemTime(new Date(2026, 5, 11, 0, 0, 0));
    expect(formatDue({ dueOn: '2026-06-10' })?.overdue).toBe(true);
  });

  it('a timed due is overdue once its instant has passed', () => {
    expect(formatDue(dueAtTime(new Date(2026, 5, 10), 11, 59))?.overdue).toBe(true);
    expect(formatDue(dueAtTime(new Date(2026, 5, 10), 12, 1))?.overdue).toBe(false);
  });

  it('returns null when there is no readable due', () => {
    expect(formatDue(null)).toBeNull();
    expect(formatDue(undefined)).toBeNull();
    expect(formatDue(NO_DUE)).toBeNull();
    expect(formatDue({ dueAt: 'not-a-date' })).toBeNull();
    expect(formatDue({ dueOn: '2026-02-30' })).toBeNull();
  });

  it('dueDateOf is midnight of a whole-day due and the instant of a timed one', () => {
    expect(dueDateOf({ dueOn: '2026-06-18' })).toEqual(new Date(2026, 5, 18));
    const at = dueAtTime(new Date(2026, 5, 18), 8, 15);
    expect(dueDateOf(at)).toEqual(new Date(2026, 5, 18, 8, 15));
    expect(dueDateOf(NO_DUE)).toBeNull();
  });

  it('withDay moves a due to another day, keeping a timed due\'s time', () => {
    expect(withDay({ dueOn: '2026-06-18' }, new Date(2026, 5, 20))).toEqual({ dueOn: '2026-06-20', dueAt: null });
    expect(withDay(null, new Date(2026, 5, 20))).toEqual({ dueOn: '2026-06-20', dueAt: null });
    expect(withDay(dueAtTime(new Date(2026, 5, 18), 8, 15), new Date(2026, 5, 20))).toEqual(dueAtTime(new Date(2026, 5, 20), 8, 15));
  });

  it('round-trips through the date and time inputs', () => {
    expect(toDateInputValue({ dueOn: '2026-06-18' })).toBe('2026-06-18');
    expect(toTimeInputValue({ dueOn: '2026-06-18' })).toBe('');
    const timed = dueAtTime(new Date(2026, 5, 18), 7, 5);
    expect(toDateInputValue(timed)).toBe('2026-06-18');
    expect(toTimeInputValue(timed)).toBe('07:05');
    expect(dueFromInputs('2026-06-18', '07:05')).toEqual(timed);
    expect(dueFromInputs('2026-06-18', '')).toEqual({ dueOn: '2026-06-18', dueAt: null });
    expect(dueFromInputs('', '07:05')).toEqual(NO_DUE);
    expect(dueFromInputs('0202-06-18', '')).toBeNull();
  });

  it('input values are empty for a missing or unparseable due', () => {
    expect(toDateInputValue(null)).toBe('');
    expect(toDateInputValue({ dueAt: 'not-a-date' })).toBe('');
    expect(toTimeInputValue(undefined)).toBe('');
  });

  it('dueFromText reads yyyy-mm-dd as a whole day and an instant as timed', () => {
    expect(dueFromText('2026-06-20')).toEqual({ dueOn: '2026-06-20', dueAt: null });
    expect(dueFromText('2026-06-20T09:00:00.000Z')).toEqual({ dueOn: null, dueAt: '2026-06-20T09:00:00.000Z' });
    expect(dueFromText('2026-13-01')).toBeNull();
    expect(dueFromText('soon')).toBeNull();
  });
});

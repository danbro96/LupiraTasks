import { describe, it, expect } from 'vitest';
import { dueInDays, dueOnDate, formatDue, toDateInputValue } from './dueDate';

describe('formatDue', () => {
  it('returns null for empty/invalid input', () => {
    expect(formatDue(null)).toBeNull();
    expect(formatDue(undefined)).toBeNull();
    expect(formatDue('not-a-date')).toBeNull();
  });

  it('labels today / tomorrow / yesterday relative to now', () => {
    expect(formatDue(dueInDays(0))?.label).toBe('Today');
    expect(formatDue(dueInDays(1))?.label).toBe('Tomorrow');
    expect(formatDue(dueInDays(-1))?.label).toBe('Yesterday');
  });

  it('flags past due dates as overdue', () => {
    expect(formatDue(dueInDays(-1))?.overdue).toBe(true);
    expect(formatDue(dueInDays(3))?.overdue).toBe(false);
  });

  it('uses a short month/day label for further-out dates', () => {
    const res = formatDue(dueInDays(40));
    expect(res).not.toBeNull();
    expect(res!.label).not.toBe('Today');
  });
});

describe('dueOnDate / toDateInputValue', () => {
  it('round-trips a calendar date through end-of-day and back to yyyy-mm-dd', () => {
    const d = new Date(2026, 5, 18); // 18 Jun 2026, local
    const iso = dueOnDate(d);
    expect(toDateInputValue(iso)).toBe('2026-06-18');
  });

  it('toDateInputValue is empty for no date', () => {
    expect(toDateInputValue(null)).toBe('');
  });
});

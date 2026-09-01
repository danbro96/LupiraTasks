// Quick-pick chips instead of a date-picker dependency — on mobile that would force a native build.

const DAY_MS = 86_400_000;

function atEndOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** ISO for end-of-day, `days` from today (0 = today, 1 = tomorrow, …). */
export function dueInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return atEndOfLocalDay(d).toISOString();
}

/** ISO for end-of-day on a specific calendar date (web date input / native picker). */
export function dueOnDate(date: Date): string {
  return atEndOfLocalDay(date).toISOString();
}

/** ISO for end-of-day on the next upcoming Saturday. */
export function dueNextWeekend(): string {
  const d = new Date();
  const daysUntilSat = (6 - d.getDay() + 7) % 7 || 7; // always 1..7 ahead
  d.setDate(d.getDate() + daysUntilSat);
  return atEndOfLocalDay(d).toISOString();
}

/** Human label for a due date, plus whether it's past. Null when there's no due date. */
export function formatDue(iso: string | null | undefined): { label: string; overdue: boolean } | null {
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;

  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dueDay.getTime() - startToday.getTime()) / DAY_MS);

  let label: string;
  if (diffDays === 0) label = 'Today';
  else if (diffDays === 1) label = 'Tomorrow';
  else if (diffDays === -1) label = 'Yesterday';
  else label = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return { label, overdue: due.getTime() < now.getTime() };
}

/** `<input type="date">` wants a local `yyyy-mm-dd` value; derive it from a due ISO. */
export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

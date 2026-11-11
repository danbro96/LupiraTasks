// A due is a whole local day (`dueOn`, `yyyy-mm-dd`) or an instant (`dueAt`, ISO); at most one is set.

const DAY_MS = 86_400_000;
const DATE_ONLY = /^([12]\d{3})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{1,2}):(\d{2})/;

export interface Due {
  dueOn: string | null;
  dueAt: string | null;
}

/** The due fields an item carries, whichever shape it comes in. */
export interface DueFields {
  dueOn?: string | null;
  dueAt?: string | null;
}

export const NO_DUE: Due = { dueOn: null, dueAt: null };

const pad = (n: number) => String(n).padStart(2, '0');

const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local midnight of a `yyyy-mm-dd` day; null unless it names a real calendar day. */
function dayOf(dueOn: string): Date | null {
  const m = DATE_ONLY.exec(dueOn);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const day = new Date(y, mo, d);
  return day.getFullYear() === y && day.getMonth() === mo && day.getDate() === d ? day : null;
}

function instantOf(dueAt: string): Date | null {
  const at = new Date(dueAt);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** Whole-day due on a calendar date (web date input / native picker). */
export function dueOnDate(date: Date): Due {
  return { dueOn: localDay(date), dueAt: null };
}

/** Whole-day due `days` from today (0 = today, 1 = tomorrow, …). */
export function dueInDays(days: number): Due {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return dueOnDate(d);
}

/** Whole-day due on the next upcoming Saturday. */
export function dueNextWeekend(): Due {
  const d = new Date();
  const daysUntilSat = (6 - d.getDay() + 7) % 7 || 7; // always 1..7 ahead
  d.setDate(d.getDate() + daysUntilSat);
  return dueOnDate(d);
}

/** Timed due at local `hours:minutes` on `date`'s calendar day. */
export function dueAtTime(date: Date, hours: number, minutes: number): Due {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return { dueOn: null, dueAt: d.toISOString() };
}

/** The due as a local Date: midnight of a whole-day due, the instant of a timed one. Null when there's none. */
export function dueDateOf(due: DueFields | null | undefined): Date | null {
  if (due?.dueOn) return dayOf(due.dueOn);
  if (due?.dueAt) return instantOf(due.dueAt);
  return null;
}

/** The due moved to `date`'s day, keeping a timed due's time of day. */
export function withDay(due: DueFields | null | undefined, date: Date): Due {
  const at = due?.dueAt ? instantOf(due.dueAt) : null;
  return at ? dueAtTime(date, at.getHours(), at.getMinutes()) : dueOnDate(date);
}

/** A due from `<input type="date">` and `<input type="time">` values: no date is no due, no time a whole day.
 *  Null while the date is unreadable, as when a year is still being typed. */
export function dueFromInputs(date: string, time: string): Due | null {
  if (!date) return NO_DUE;
  const day = dayOf(date);
  if (!day) return null;
  const t = TIME.exec(time);
  return t ? dueAtTime(day, Number(t[1]), Number(t[2])) : dueOnDate(day);
}

/** A `yyyy-mm-dd` text as a whole-day due, any other parseable date as a timed one; null when unreadable. */
export function dueFromText(text: string): Due | null {
  if (DATE_ONLY.test(text)) return dayOf(text) ? { dueOn: text, dueAt: null } : null;
  const at = instantOf(text);
  return at ? { dueOn: null, dueAt: at.toISOString() } : null;
}

function dayLabel(d: Date): string {
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diffDays = Math.round((day.getTime() - startToday.getTime()) / DAY_MS);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Human label for a due (with its time when timed), plus whether it's past: a whole-day due once its day has
 *  ended, a timed one once its instant has. Null when there's no due. */
export function formatDue(due: DueFields | null | undefined): { label: string; overdue: boolean } | null {
  if (due?.dueOn) {
    const day = dayOf(due.dueOn);
    if (!day) return null;
    return { label: dayLabel(day), overdue: due.dueOn < localDay(new Date()) };
  }
  const at = due?.dueAt ? instantOf(due.dueAt) : null;
  if (!at) return null;
  const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return { label: `${dayLabel(at)} ${time}`, overdue: at.getTime() < Date.now() };
}

/** `<input type="date">` value (local `yyyy-mm-dd`) for a due; empty when there's none. */
export function toDateInputValue(due: DueFields | null | undefined): string {
  const d = dueDateOf(due);
  return d ? localDay(d) : '';
}

/** `<input type="time">` value (local `HH:mm`) for a timed due; empty for a whole-day due or none. */
export function toTimeInputValue(due: DueFields | null | undefined): string {
  const at = due?.dueAt ? instantOf(due.dueAt) : null;
  return at ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : '';
}

/** Collapse hard line breaks to single spaces — task titles are single-line data. */
export function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, ' ');
}

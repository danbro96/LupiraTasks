/** Collapse hard line breaks to single spaces — task titles are single-line data.
 *  Ported verbatim from the mobile app (src/domain/text.ts) so titles normalize identically. */
export function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, ' ');
}

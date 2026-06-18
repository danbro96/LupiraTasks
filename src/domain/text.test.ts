import { describe, it, expect } from 'vitest';
import { oneLine } from './text';

describe('oneLine', () => {
  it('collapses newlines and carriage returns to single spaces', () => {
    expect(oneLine('a\nb')).toBe('a b');
    expect(oneLine('a\r\nb')).toBe('a b');
    expect(oneLine('a\n\n\nb')).toBe('a b');
  });

  it('leaves single-line text unchanged', () => {
    expect(oneLine('buy milk')).toBe('buy milk');
  });
});

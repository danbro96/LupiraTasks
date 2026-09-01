import { describe, it, expect } from 'vitest';
import { priorityLabel } from './priority';

describe('priorityLabel', () => {
  it('reports None for 0 in both modes', () => {
    expect(priorityLabel(true, 0)).toBe('None');
    expect(priorityLabel(false, 0)).toBe('None');
  });

  it('labels a starred task in simple mode', () => {
    expect(priorityLabel(true, 1)).toBe('Starred');
    expect(priorityLabel(true, 7)).toBe('Starred');
  });

  it('labels the scale value in scale mode', () => {
    expect(priorityLabel(false, 3)).toBe('Priority 3');
  });
});

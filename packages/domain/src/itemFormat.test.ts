import { describe, it, expect } from 'vitest';
import { priorityLabel, qtyLabel } from './itemFormat';

describe('qtyLabel', () => {
  it('joins quantity and unit, and omits either when absent', () => {
    expect(qtyLabel({ quantity: 2, unit: 'kg' })).toBe('2 kg');
    expect(qtyLabel({ quantity: 3, unit: null })).toBe('3');
    expect(qtyLabel({ quantity: null, unit: 'pcs' })).toBe('pcs');
  });

  it('is null when there is nothing to show', () => {
    expect(qtyLabel({ quantity: null, unit: null })).toBeNull();
    expect(qtyLabel({})).toBeNull();
  });
});

describe('priorityLabel', () => {
  it('is a star toggle in simple mode', () => {
    expect(priorityLabel(true, 0)).toBe('Not starred');
    expect(priorityLabel(true, 1)).toBe('Starred');
    expect(priorityLabel(true, 7)).toBe('Starred');
  });

  it('is a level in scale mode, with None for zero', () => {
    expect(priorityLabel(false, 0)).toBe('None');
    expect(priorityLabel(false, 3)).toBe('Level 3');
  });
});

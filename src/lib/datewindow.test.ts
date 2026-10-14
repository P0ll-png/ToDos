import { describe, it, expect } from 'vitest';
import { isValidRange, rangeOverlaps } from './datewindow';

describe('isValidRange', () => {
  it('accepts equal from and to dates', () => {
    expect(isValidRange('2025-06-15', '2025-06-15')).toBe(true);
  });

  it('accepts an ascending range', () => {
    expect(isValidRange('2025-06-15', '2025-06-20')).toBe(true);
  });

  it('rejects a reversed range', () => {
    expect(isValidRange('2025-06-20', '2025-06-15')).toBe(false);
  });

  it('rejects a missing bound', () => {
    expect(isValidRange('', '2025-06-15')).toBe(false);
    expect(isValidRange('2025-06-15', '')).toBe(false);
  });
});

describe('rangeOverlaps', () => {
  it('is true for ranges touching at an endpoint', () => {
    expect(
      rangeOverlaps(
        { from: '2025-06-01', to: '2025-06-10' },
        { from: '2025-06-10', to: '2025-06-20' },
      ),
    ).toBe(true);
  });

  it('is true for a nested range', () => {
    expect(
      rangeOverlaps(
        { from: '2025-06-01', to: '2025-06-30' },
        { from: '2025-06-10', to: '2025-06-15' },
      ),
    ).toBe(true);
  });

  it('is false for disjoint ranges', () => {
    expect(
      rangeOverlaps(
        { from: '2025-06-01', to: '2025-06-10' },
        { from: '2025-06-11', to: '2025-06-20' },
      ),
    ).toBe(false);
  });
});

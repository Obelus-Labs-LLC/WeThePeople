import { describe, it, expect } from 'vitest';
import { formatMoney, formatDate, partyColor } from '../../utils/helpers';

describe('formatMoney', () => {
  it('formats billions', () => {
    expect(formatMoney(1_500_000_000)).toBe('$1.5B');
    expect(formatMoney(2_000_000_000)).toBe('$2.0B');
  });

  it('formats millions', () => {
    expect(formatMoney(1_200_000)).toBe('$1.2M');
    expect(formatMoney(500_000_000)).toBe('$500.0M');
  });

  it('formats thousands', () => {
    expect(formatMoney(5_000)).toBe('$5K');
    expect(formatMoney(42_000)).toBe('$42K');
  });

  it('formats small numbers', () => {
    const result = formatMoney(123);
    expect(result).toContain('$');
    expect(result).toContain('123');
  });

  it('formats zero', () => {
    const result = formatMoney(0);
    expect(result).toContain('$');
  });

  it('formats exact boundary values', () => {
    expect(formatMoney(1_000_000_000)).toBe('$1.0B');
    expect(formatMoney(1_000_000)).toBe('$1.0M');
    expect(formatMoney(1_000)).toBe('$1K');
  });
});

describe('formatDate', () => {
  it('formats a valid ISO date string', () => {
    const result = formatDate('2024-03-15');
    expect(result).toContain('Mar');
    expect(result).toContain('15');
    expect(result).toContain('2024');
  });

  it('formats a full ISO datetime', () => {
    const result = formatDate('2024-01-01T12:00:00Z');
    expect(result).toContain('Jan');
    expect(result).toContain('2024');
  });

  it('returns em dash for null', () => {
    expect(formatDate(null)).toBe('\u2014');
  });

  it('returns em dash for undefined', () => {
    expect(formatDate(undefined)).toBe('\u2014');
  });

  it('returns em dash for empty string', () => {
    expect(formatDate('')).toBe('\u2014');
  });

  it('returns em dash for invalid date string', () => {
    expect(formatDate('not-a-date')).toBe('\u2014');
  });
});

describe('partyColor', () => {
  it('returns blue for Democrat', () => {
    expect(partyColor('Democrat')).toBe('#3B82F6');
    expect(partyColor('D')).toBe('#3B82F6');
  });

  it('returns red for Republican', () => {
    expect(partyColor('Republican')).toBe('#EF4444');
    expect(partyColor('R')).toBe('#EF4444');
  });

  it('returns purple for Independent', () => {
    expect(partyColor('Independent')).toBe('#A855F7');
    expect(partyColor('I')).toBe('#A855F7');
  });

  it('returns gray for unknown party', () => {
    expect(partyColor('Unknown')).toBe('#6B7280');
    expect(partyColor('')).toBe('#6B7280');
  });

  it('handles null/undefined gracefully', () => {
    expect(partyColor(null as unknown as string)).toBe('#6B7280');
    expect(partyColor(undefined as unknown as string)).toBe('#6B7280');
  });
});

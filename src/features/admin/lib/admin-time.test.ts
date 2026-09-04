import { describe, expect, it } from 'vitest';

import { formatAdminTimestamp, taipeiLocalToIso } from './admin-time';

describe('admin time formatting', () => {
  it('reads a datetime-local value as Taipei time regardless of browser zone', () => {
    // 2026-08-09 00:00 台北 = 2026-08-08 16:00 UTC
    expect(taipeiLocalToIso('2026-08-09T00:00')).toBe(
      '2026-08-08T16:00:00.000Z',
    );
    expect(taipeiLocalToIso('2026-08-09T23:59')).toBe(
      '2026-08-09T15:59:00.000Z',
    );
  });

  it('accepts a value that already carries seconds', () => {
    expect(taipeiLocalToIso('2026-08-09T00:00:30')).toBe(
      '2026-08-08T16:00:30.000Z',
    );
  });

  it('treats an empty value as no bound', () => {
    expect(taipeiLocalToIso('')).toBeNull();
  });

  it('rejects an unparseable value rather than sending NaN', () => {
    expect(taipeiLocalToIso('not-a-date')).toBeNull();
  });

  it('renders a UTC timestamp in Taipei time', () => {
    // 16:00Z = 隔日 00:00 台北
    expect(formatAdminTimestamp('2026-08-08T16:00:00Z')).toContain('2026');
    expect(
      new Date('2026-08-08T16:00:00Z').toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei',
      }),
    ).toBe(formatAdminTimestamp('2026-08-08T16:00:00Z'));
  });

  it('degrades to a dash for an invalid timestamp', () => {
    expect(formatAdminTimestamp('nonsense')).toBe('—');
  });
});

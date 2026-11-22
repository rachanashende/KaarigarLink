import { expect, it } from 'vitest';
import { calendarDay, dayInIndia } from './mappers';

it('reads backend calendar dates as stored, without shifting end-of-day values to the next day (M13 regression)', () => {
  // POST /jobs { deadline: "2026-12-22" } is stored as 2026-12-22T23:59:59.999Z.
  expect(calendarDay('2026-12-22T23:59:59.999Z')).toBe('2026-12-22');
  // Start dates are stored at 00:00 UTC.
  expect(calendarDay('2026-12-01T00:00:00.000Z')).toBe('2026-12-01');
  expect(calendarDay(null)).toBe('');
  expect(calendarDay('not a date')).toBe('');
});

it('converts moments (timestamps) to the India calendar day', () => {
  expect(dayInIndia('2026-12-22T23:59:59.999Z')).toBe('2026-12-23'); // 05:29 IST on the 23rd
  expect(dayInIndia('2026-12-22T10:00:00.000Z')).toBe('2026-12-22');
});

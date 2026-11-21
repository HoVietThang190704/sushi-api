import { BadRequestException } from '@nestjs/common';

const VN_OFFSET_HOURS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's calendar date in Vietnam (UTC+7) as YYYY-MM-DD. */
export function todayInVietnam(now: Date = new Date()): string {
  return new Date(now.getTime() + VN_OFFSET_HOURS * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
}

function parseYmd(dateStr: string): [number, number, number] {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new BadRequestException(
      `Ngày "${dateStr}" không đúng định dạng YYYY-MM-DD`,
    );
  }
  const [year, month, day] = parts;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new BadRequestException(`Ngày "${dateStr}" không tồn tại trên lịch`);
  }
  return [year, month, day];
}

/** UTC instant of 00:00:00.000 (or 23:59:59.999) Vietnam time on that day. */
export function vietnamDayBoundary(dateStr: string, endOfDay = false): Date {
  const [y, m, d] = parseYmd(dateStr);
  return endOfDay
    ? new Date(Date.UTC(y, m - 1, d, 23 - VN_OFFSET_HOURS, 59, 59, 999))
    : new Date(Date.UTC(y, m - 1, d, 0 - VN_OFFSET_HOURS, 0, 0, 0));
}

/** Shift a YYYY-MM-DD string by a number of days (calendar arithmetic). */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = parseYmd(dateStr);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Inclusive number of calendar days between two YYYY-MM-DD strings. */
export function inclusiveDays(startDate: string, endDate: string): number {
  const [sy, sm, sd] = parseYmd(startDate);
  const [ey, em, ed] = parseYmd(endDate);
  return (
    Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / DAY_MS) +
    1
  );
}

/** Every YYYY-MM-DD from startDate to endDate inclusive. */
export function eachDay(startDate: string, endDate: string): string[] {
  const total = inclusiveDays(startDate, endDate);
  return Array.from({ length: total }, (_, i) => addDays(startDate, i));
}

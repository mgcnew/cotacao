import type { DemandRecurrence } from "@/features/demand-calendar/model";

const DAY_MS = 86_400_000;

export type RecurringDemandPeriod = {
  startDate: string;
  endDate: string;
  recurrence: DemandRecurrence;
  recurrenceUntil: string | null;
};

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function daysBetween(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function occurrenceAt(
  originalStart: Date,
  recurrence: Exclude<DemandRecurrence, "one_time">,
  index: number,
) {
  if (recurrence === "weekly") return addDays(originalStart, index * 7);

  const originalYear = originalStart.getUTCFullYear();
  const originalMonth = originalStart.getUTCMonth();
  const originalDay = originalStart.getUTCDate();
  if (recurrence === "monthly") {
    const absoluteMonth = originalMonth + index;
    const year = originalYear + Math.floor(absoluteMonth / 12);
    const month = ((absoluteMonth % 12) + 12) % 12;
    return new Date(
      Date.UTC(year, month, Math.min(originalDay, daysInMonth(year, month))),
    );
  }

  const year = originalYear + index;
  return new Date(
    Date.UTC(
      year,
      originalMonth,
      Math.min(originalDay, daysInMonth(year, originalMonth)),
    ),
  );
}

function estimatedOccurrenceIndex(
  originalStart: Date,
  earliestRelevantStart: Date,
  recurrence: Exclude<DemandRecurrence, "one_time">,
) {
  if (earliestRelevantStart <= originalStart) return 0;
  if (recurrence === "weekly") {
    return Math.max(
      0,
      Math.floor(daysBetween(originalStart, earliestRelevantStart) / 7) - 1,
    );
  }
  if (recurrence === "monthly") {
    const monthDistance =
      (earliestRelevantStart.getUTCFullYear() -
        originalStart.getUTCFullYear()) *
        12 +
      earliestRelevantStart.getUTCMonth() -
      originalStart.getUTCMonth();
    return Math.max(0, monthDistance - 1);
  }
  return Math.max(
    0,
    earliestRelevantStart.getUTCFullYear() - originalStart.getUTCFullYear() - 1,
  );
}

function overlaps(
  occurrenceStart: Date,
  occurrenceEnd: Date,
  rangeStart: Date,
  rangeEnd: Date,
) {
  return occurrenceStart <= rangeEnd && occurrenceEnd >= rangeStart;
}

export function demandPeriodOverlapsRange(
  event: RecurringDemandPeriod,
  rangeStartValue: string,
  rangeEndValue: string,
) {
  const originalStart = parseDate(event.startDate);
  const originalEnd = parseDate(event.endDate);
  const rangeStart = parseDate(rangeStartValue);
  const rangeEnd = parseDate(rangeEndValue);
  const durationDays = Math.max(0, daysBetween(originalStart, originalEnd));

  if (event.recurrence === "one_time") {
    return overlaps(originalStart, originalEnd, rangeStart, rangeEnd);
  }

  const recurrenceUntil = event.recurrenceUntil
    ? parseDate(event.recurrenceUntil)
    : null;
  const earliestRelevantStart = addDays(rangeStart, -durationDays);
  const initialIndex = estimatedOccurrenceIndex(
    originalStart,
    earliestRelevantStart,
    event.recurrence,
  );

  // A estimativa começa uma ocorrência antes da faixa. Poucas iterações são
  // suficientes mesmo para datas antigas e evitam percorrer todo o histórico.
  for (let offset = 0; offset < 8; offset += 1) {
    const occurrenceStart = occurrenceAt(
      originalStart,
      event.recurrence,
      initialIndex + offset,
    );
    if (recurrenceUntil && occurrenceStart > recurrenceUntil) return false;
    if (occurrenceStart > rangeEnd) return false;
    const occurrenceEnd = addDays(occurrenceStart, durationDays);
    if (overlaps(occurrenceStart, occurrenceEnd, rangeStart, rangeEnd)) {
      return true;
    }
  }

  return false;
}

const BANGLADESH_TIME_ZONE = 'Asia/Dhaka';

function getBangladeshDateParts(value: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGLADESH_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(value);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    return null;
  }

  return { year, month, day };
}

export function formatBangladeshDateTime(value: string | Date | null | undefined) {
  if (!value) return 'Date TBD';

  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: BANGLADESH_TIME_ZONE,
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

export function getBangladeshDayKey(value: string | Date) {
  const parts = getBangladeshDateParts(new Date(value));
  if (!parts) return null;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getBangladeshYear(value: Date = new Date()) {
  const parts = getBangladeshDateParts(value);
  return parts ? Number(parts.year) : value.getFullYear();
}

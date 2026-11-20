/// <summary>
/// Given a number of seconds, formats it as HH:mm:ss.
/// </summary>
/// <param name="totalSeconds">Total elapsed time in seconds.</param>
/// <returns>Formatted time string in HH:mm:ss format.</returns>
export function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);

  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/// <summary>
/// Normalizes and cleans a task or issue ID by trimming whitespace and removing leading hashes (#).
/// </summary>
/// <param name="taskId">The raw task ID (string, number, or null/undefined).</param>
/// <returns>Sanitized task ID string, or an empty string if null/empty.</returns>
export function cleanTaskId(taskId: string | number | undefined | null): string {
  if (taskId === undefined || taskId === null) return '';
  return taskId.toString().replace(/^#/, '').trim();
}

/// <summary>
/// Formats key-value custom field records into Redmine API payload objects with non-empty values.
/// </summary>
/// <param name="customFieldValues">Record mapping custom field IDs to their string or number values.</param>
/// <returns>Array of Redmine custom field payload objects ready for API submission.</returns>
export function formatCustomFieldsPayload(
  customFieldValues: Record<string | number, string | number | undefined | null>
): Array<{ id: number; value: string | number }> {
  return Object.entries(customFieldValues)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([id, value]) => ({
      id: parseInt(id, 10),
      value: value as string | number,
    }));
}

const BG_MONTHS = [
  'януари',
  'февруари',
  'март',
  'април',
  'май',
  'юни',
  'юли',
  'август',
  'септември',
  'октомври',
  'ноември',
  'декември',
];

const EN_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const BG_WEEKDAYS_LONG = [
  'неделя',
  'понеделник',
  'вторник',
  'сряда',
  'четвъртък',
  'петък',
  'събота',
];

const BG_WEEKDAYS_SHORT = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const EN_WEEKDAYS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const EN_WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/// <summary>
/// Parses a YYYY-MM-DD string, DD.MM.YYYY string, timestamp, or Date into a local Date instance without UTC day shifts.
/// </summary>
function parseLocalDate(input: string | Date | number | null | undefined): Date | null {
  if (input === null || input === undefined) return null;

  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }

  if (typeof input === 'number') {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;

    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (isoMatch) {
      const y = parseInt(isoMatch[1], 10);
      const m = parseInt(isoMatch[2], 10) - 1;
      const d = parseInt(isoMatch[3], 10);
      const dt = new Date(y, m, d);
      return isNaN(dt.getTime()) ? null : dt;
    }

    const bgMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
    if (bgMatch) {
      const d = parseInt(bgMatch[1], 10);
      const m = parseInt(bgMatch[2], 10) - 1;
      const y = parseInt(bgMatch[3], 10);
      const dt = new Date(y, m, d);
      return isNaN(dt.getTime()) ? null : dt;
    }

    const fallback = new Date(trimmed);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  return null;
}

function capitalizeFirst(value: string): string {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/// <summary>
/// Formats a date using full month name in words (e.g. "23 май 2026" in BG or "23 May 2026" in EN).
/// </summary>
export function formatDisplayDate(
  input: string | Date | number | null | undefined,
  language: 'bg' | 'en' = 'bg',
  options?: { includeYear?: boolean; weekday?: 'long' | 'short' }
): string {
  const date = parseLocalDate(input);
  if (!date) {
    return typeof input === 'string' ? input : '';
  }

  const day = date.getDate();
  const months = language === 'bg' ? BG_MONTHS : EN_MONTHS;
  const monthName = months[date.getMonth()];
  const year = date.getFullYear();

  const includeYear = options?.includeYear !== false;
  const base = includeYear ? `${day} ${monthName} ${year}` : `${day} ${monthName}`;

  if (options?.weekday === 'long') {
    const weekdays = language === 'bg' ? BG_WEEKDAYS_LONG : EN_WEEKDAYS_LONG;
    const weekdayName = capitalizeFirst(weekdays[date.getDay()]);
    return `${weekdayName}, ${base}`;
  }

  if (options?.weekday === 'short') {
    const weekdays = language === 'bg' ? BG_WEEKDAYS_SHORT : EN_WEEKDAYS_SHORT;
    const weekdayName = weekdays[date.getDay()];
    return `${base} (${weekdayName})`;
  }

  return base;
}

/// <summary>
/// Returns a relative day label ("днес"/"вчера"/"утре" in BG, "today"/"yesterday"/"tomorrow" in EN) when the date is within +-1 day of today.
/// </summary>
export function getRelativeDayLabel(
  input: string | Date | number | null | undefined,
  language: 'bg' | 'en' = 'bg'
): string | null {
  const date = parseLocalDate(input);
  if (!date) return null;

  const now = new Date();
  const targetUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((targetUtc - todayUtc) / 86_400_000);

  if (diffDays === 0) return language === 'bg' ? 'днес' : 'today';
  if (diffDays === -1) return language === 'bg' ? 'вчера' : 'yesterday';
  if (diffDays === 1) return language === 'bg' ? 'утре' : 'tomorrow';
  return null;
}

/// <summary>
/// Formats a date using full month name in words with an optional relative day suffix (e.g. "20 ноември 2026 (днес)").
/// </summary>
export function formatDisplayDateWithRelative(
  input: string | Date | number | null | undefined,
  language: 'bg' | 'en' = 'bg'
): string {
  const base = formatDisplayDate(input, language);
  if (!base) return '';
  const relative = getRelativeDayLabel(input, language);
  return relative ? `${base} (${relative})` : base;
}

/// <summary>
/// Formats a date and time using full month name in words and 24-hour HH:mm time (e.g. "23 май 2026, 15:30").
/// </summary>
export function formatDisplayDateTime(
  input: string | Date | number | null | undefined,
  language: 'bg' | 'en' = 'bg'
): string {
  const date = parseLocalDate(input);
  if (!date) {
    return typeof input === 'string' ? input : '';
  }

  const datePart = formatDisplayDate(date, language);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${datePart}, ${hh}:${mm}`;
}

/// <summary>
/// Formats a month name capitalized (e.g. "Май" in BG or "May" in EN).
/// </summary>
export function formatDisplayMonth(
  dateOrMonthIndex: Date | number,
  language: 'bg' | 'en' = 'bg'
): string {
  const monthIndex =
    typeof dateOrMonthIndex === 'number'
      ? Math.max(0, Math.min(11, dateOrMonthIndex))
      : dateOrMonthIndex.getMonth();
  const months = language === 'bg' ? BG_MONTHS : EN_MONTHS;
  return capitalizeFirst(months[monthIndex]);
}

/// <summary>
/// Formats a month and year using full month name in words without trailing abbreviations (e.g. "Май 2026").
/// </summary>
export function formatDisplayMonthYear(
  date: Date,
  language: 'bg' | 'en' = 'bg'
): string {
  return `${formatDisplayMonth(date, language)} ${date.getFullYear()}`;
}

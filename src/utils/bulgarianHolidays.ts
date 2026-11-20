/// <summary>
/// Computes Orthodox Easter Sunday (Gregorian calendar) for a given year using Meeus's Julian algorithm.
/// </summary>
function getOrthodoxEaster(year: number): Date {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const julianMonth = Math.floor((d + e + 114) / 31); // 3 = March, 4 = April
  const julianDay = ((d + e + 114) % 31) + 1;

  // Julian to Gregorian offset (13 days for 1900–2099)
  const century = Math.floor(year / 100);
  const offset = century - Math.floor(century / 4) - 2;

  const date = new Date(year, julianMonth - 1, julianDay);
  date.setDate(date.getDate() + offset);
  return date;
}

/// <summary>
/// Formats a local Date instance as YYYY-MM-DD.
/// </summary>
export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

/// <summary>
/// Returns a Map of official Bulgarian non-working public holidays (YYYY-MM-DD -> holiday name)
/// for the specified year, including Orthodox Easter and Labor Code Art. 154(2) substitute Mondays/Tuesdays.
/// </summary>
export function getBulgarianHolidays(year: number): Map<string, string> {
  const holidays = new Map<string, string>();

  // Fixed official Bulgarian public holidays (Art. 154, Labor Code)
  const fixedHolidays: Array<[number, number, string]> = [
    [0, 1, 'Нова година'],
    [2, 3, 'Ден на Освобождението'],
    [4, 1, 'Ден на труда'],
    [4, 6, 'Гергьовден'],
    [4, 24, 'Ден на българската просвета и култура'],
    [8, 6, 'Ден на Съединението'],
    [8, 22, 'Ден на Независимостта'],
    [11, 24, 'Бъдни вечер'],
    [11, 25, 'Рождество Христово (Коледа)'],
    [11, 26, 'Рождество Христово (Коледа)'],
  ];

  // Register fixed holidays first
  const fixedDates: Array<{ date: Date; name: string }> = [];
  for (const [month, day, name] of fixedHolidays) {
    const dt = new Date(year, month, day);
    holidays.set(formatDateISO(dt), name);
    fixedDates.push({ date: dt, name });
  }

  // Orthodox Easter holidays (Good Friday through Easter Monday — never trigger substitute days)
  const easterSunday = getOrthodoxEaster(year);
  holidays.set(formatDateISO(addDays(easterSunday, -2)), 'Разпети петък');
  holidays.set(formatDateISO(addDays(easterSunday, -1)), 'Велика събота');
  holidays.set(formatDateISO(easterSunday), 'Великден');
  holidays.set(formatDateISO(addDays(easterSunday, 1)), 'Великденски понеделник');

  // Substitute working days when a fixed holiday falls on Saturday or Sunday
  for (const { date, name } of fixedDates) {
    const dow = date.getDay();
    if (dow === 0 || dow === 6) {
      let candidate = addDays(date, dow === 6 ? 2 : 1); // Next Monday
      while (
        candidate.getDay() === 0 ||
        candidate.getDay() === 6 ||
        holidays.has(formatDateISO(candidate))
      ) {
        candidate = addDays(candidate, 1);
      }
      if (candidate.getFullYear() === year) {
        holidays.set(formatDateISO(candidate), `Почивен ден (${name})`);
      }
    }
  }

  return holidays;
}

/// <summary>
/// Returns all working days (YYYY-MM-DD) in the given year up to `endDate` (inclusive),
/// excluding weekends and official Bulgarian public holidays.
/// </summary>
export function getWorkingDaysInYear(year: number, endDate: Date): {
  workingDays: string[];
  holidaysMap: Map<string, string>;
} {
  const holidaysMap = getBulgarianHolidays(year);
  const start = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const limit = endDate < yearEnd ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) : yearEnd;

  const workingDays: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());

  while (cursor <= limit) {
    const dow = cursor.getDay();
    const iso = formatDateISO(cursor);
    if (dow !== 0 && dow !== 6 && !holidaysMap.has(iso)) {
      workingDays.push(iso);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return { workingDays, holidaysMap };
}

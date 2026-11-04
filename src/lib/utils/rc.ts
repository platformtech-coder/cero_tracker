// ============================================================
// Reading Circle Business Logic Utilities
// ============================================================

/**
 * Compute the RC Category from a cub's grade and selected session.
 * Supports configurable category names (read from admin settings).
 *
 * Grade 1–4  → "{lowerCategory} - {Day from session}"
 * Grade 5–8  → "{upperCategory} - {Day from session}"
 * Everything else → "Unknown"
 *
 * @param grade           The cub's grade string (e.g. "Grade / Class 2", "3", "Grade 7 / JHS 1")
 * @param session         The selected session string (e.g. "Saturdays 9:00 am – 9:45 am")
 * @param lowerCategory   Category name for grades 1–4 (default: "Word Astronauts")
 * @param upperCategory   Category name for grades 5–8 (default: "Word Miners")
 */
export function computeRCCategory(
  grade: string | null | undefined,
  session: string | null | undefined,
  lowerCategory = 'Word Astronauts',
  upperCategory = 'Word Miners',
): string {
  if (!grade || !session) return 'Unknown';

  // Extract the FIRST digit sequence from various formats:
  // "Grade / Class 2" → 2, "Grade 7 / JHS 1" → 7 (not 71), "3" → 3
  const gradeMatch = grade.match(/\d+/);
  const gradeNum = gradeMatch ? parseInt(gradeMatch[0], 10) : NaN;
  if (isNaN(gradeNum)) return 'Unknown';

  // Extract day from session string, stripping trailing "s" if present
  // "Saturdays 9:00 am – 9:45 am" → "Saturday"
  // "Tuesday (14-Oct) 7:00 pm – 8:00 pm" → "Tuesday"
  const rawDay = session.trim().split(/\s+/)[0] ?? '';
  const day = rawDay.endsWith('s') ? rawDay.slice(0, -1) : rawDay;

  if (gradeNum >= 1 && gradeNum <= 4) return `${lowerCategory} - ${day}`;
  if (gradeNum >= 5 && gradeNum <= 8) return `${upperCategory} - ${day}`;
  return 'Unknown';
}

/**
 * Extract the day portion from a session string (strips trailing "s").
 * "Saturdays 9:00 am – 9:45 am" → "Saturday"
 * "Tuesday (14-Oct) 7:00 pm – 8:00 pm" → "Tuesday"
 */
export function extractSessionDay(session: string): string {
  const raw = session.trim().split(/\s+/)[0] ?? session;
  return raw.endsWith('s') ? raw.slice(0, -1) : raw;
}

/**
 * Checks if a session string is only a bare day of the week (e.g. "Saturday", "Tuesday")
 * without any accompanying time window.
 */
export function isBareDaySession(session: string): boolean {
  if (!session) return false;
  return /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?$/i.test(session.trim());
}

export const RC_DAY_ORDER: Record<string, number> = {
  sunday: 1,
  monday: 2,
  tuesday: 3,
  wednesday: 4,
  thursday: 5,
  friday: 6,
  saturday: 7,
};

/**
 * Parses time string like "5:00 pm" or "9:00 am" into total minutes from midnight for sorting.
 */
export function parseSessionTimeToMinutes(session: string): number {
  const match = session.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!match) return 0;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const meridiem = match[3].toLowerCase();
  if (meridiem === 'pm' && h < 12) h += 12;
  if (meridiem === 'am' && h === 12) h = 0;
  return h * 60 + m;
}

/**
 * Compares two session strings: day of week (Sunday first), then chronologically by time.
 */
export function compareRCSessionStrings(sessionA: string, sessionB: string): number {
  const dayA = extractSessionDay(sessionA).toLowerCase();
  const dayB = extractSessionDay(sessionB).toLowerCase();
  const orderA = RC_DAY_ORDER[dayA] ?? 99;
  const orderB = RC_DAY_ORDER[dayB] ?? 99;
  if (orderA !== orderB) return orderA - orderB;
  return parseSessionTimeToMinutes(sessionA) - parseSessionTimeToMinutes(sessionB);
}

/**
 * Normalizes a Reading Circle session string to canonical singular form:
 * - Strips plural 's' from day name (e.g. "Tuesdays 5:00 pm – 5:45 pm" → "Tuesday 5:00 pm – 5:45 pm")
 * - Normalizes dash spacing
 */
export function normalizeSessionName(session?: string | null): string {
  if (!session) return '';
  let s = session.trim();
  if (!s) return '';

  // Replace plural day prefix with singular
  s = s.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s\b/i, (_match, day) => {
    return day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
  });

  return s;
}

/**
 * Sorts and deduplicates Reading Circle session strings logically by day-of-week, then chronologically by time.
 */
export function sortRCSessions(sessions: string[]): string[] {
  // Normalize and deduplicate
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of sessions) {
    const s = normalizeSessionName(raw);
    if (s && !seen.has(s)) {
      seen.add(s);
      normalized.push(s);
    }
  }

  return normalized.sort((a, b) => compareRCSessionStrings(a, b));
}

export const DAY_NAME_TO_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export const INDEX_TO_DAY_NAME = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * Returns YYYY-MM-DD for local date (avoids UTC timezone shift bugs)
 */
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses YYYY-MM-DD as local midnight date (avoids UTC parsing shift)
 */
export function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return new Date();
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

/**
 * Sorts and deduplicates Reading Circle session strings starting from a specific day of the week,
 * then chronologically by time.
 */
export function sortRCSessionsFromDay(sessions: string[], startDay: string | number): string[] {
  const startIdx = typeof startDay === 'number'
    ? ((startDay % 7) + 7) % 7
    : (DAY_NAME_TO_INDEX[startDay.toLowerCase().replace(/s$/, '')] ?? 0);

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of sessions) {
    const s = normalizeSessionName(raw);
    if (s && !seen.has(s)) {
      seen.add(s);
      normalized.push(s);
    }
  }

  return normalized.sort((a, b) => {
    const dayA = extractSessionDay(a).toLowerCase();
    const dayB = extractSessionDay(b).toLowerCase();
    const idxA = DAY_NAME_TO_INDEX[dayA] ?? 99;
    const idxB = DAY_NAME_TO_INDEX[dayB] ?? 99;

    const relA = (idxA - startIdx + 7) % 7;
    const relB = (idxB - startIdx + 7) % 7;

    if (relA !== relB) return relA - relB;
    return parseSessionTimeToMinutes(a) - parseSessionTimeToMinutes(b);
  });
}

/**
 * Smart session selector for RC Attendance:
 * 1. Finds sessions on targetDate's day of the week.
 * 2. If targetDate is today, finds the next upcoming or ongoing session based on current time.
 * 3. If all sessions today have passed, returns the first session of that day.
 * 4. If targetDate has no sessions, finds the first session of the next upcoming day that has sessions.
 */
export function getSmartRCSession(
  sessions: string[],
  targetDate: Date = new Date(),
  currentTime: Date = new Date()
): string {
  if (!sessions || sessions.length === 0) return '';

  const targetDayIdx = targetDate.getDay();
  const sortedFromTarget = sortRCSessionsFromDay(sessions, targetDayIdx);
  if (sortedFromTarget.length === 0) return sessions[0];

  const targetDayName = INDEX_TO_DAY_NAME[targetDayIdx].toLowerCase();
  const daySessions = sortedFromTarget.filter(s =>
    extractSessionDay(s).toLowerCase() === targetDayName
  );

  if (daySessions.length > 0) {
    const isToday = targetDate.toDateString() === currentTime.toDateString();
    if (isToday) {
      const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
      for (const s of daySessions) {
        const startMin = parseSessionTimeToMinutes(s);
        // Find end time if specified (e.g. "5:00 pm – 5:45 pm")
        const allTimes = Array.from(s.matchAll(/(\d{1,2}):(\d{2})\s*(am|pm)/gi));
        const endMin = allTimes.length >= 2
          ? parseSessionTimeToMinutes(allTimes[1][0])
          : startMin + 45;

        // If current time is before the end of this session, select it!
        if (currentMinutes < endMin) {
          return s;
        }
      }
    }
    // If not today or all sessions on this day have passed, return the first session of that day
    return daySessions[0];
  }

  // If no sessions on targetDay, pick the first session of the next day that has sessions
  return sortedFromTarget[0];
}


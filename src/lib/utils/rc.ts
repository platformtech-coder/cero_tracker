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


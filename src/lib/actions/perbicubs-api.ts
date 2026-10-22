'use server';

// ============================================================
// Perbicubs External API — Reading Audit
// Mirrors the logic in the end_of_term_report GAS script but
// scoped to a single cub_id and exposed as a Next.js Server Action.
// ============================================================

const API_BASE_URL = 'https://api.perbicubs.com/api/v1/reports/quiz';
const LOGIN_URL    = 'https://api.perbicubs.com/api/v1/auth/login';
const PAGE_LIMIT   = 100;

// In-memory token cache (per server instance — ephemeral, not persisted)
let _cachedToken: string | null = null;

export interface ReadingAuditBook {
  book:      string;
  quiz_date: string; // 'yyyy-MM-dd'
  score:     number;
  status:    string; // e.g. 'completed', 'failed', etc.
}

export interface ReadingAuditResult {
  total_points: number;
  books: ReadingAuditBook[];
}

// ─── Internal: Refresh bearer token ─────────────────────────────────────────
async function _refreshToken(apiKey: string): Promise<string> {
  const username = process.env.PERBICUBS_API_USER;
  let password = process.env.PERBICUBS_API_PASS;

  // Normalize escaped dollar signs if copied directly from dotenv files
  if (password && password.includes('\\$')) {
    password = password.replace(/\\\$/g, '$');
  }



  if (!username || !password) {
    throw new Error(
      'PERBICUBS_API_USER and PERBICUBS_API_PASS must be set in environment variables.'
    );
  }

  const res = await fetch(LOGIN_URL, {
    method:  'POST',
    headers: { 'api-key': apiKey, 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username, password }),
    cache:   'no-store',
  });

  // Read as text first so we can log it if anything goes wrong
  const rawText = await res.text();

  if (!res.ok) {
    throw new Error(`Perbicubs login failed (HTTP ${res.status}): ${rawText.substring(0, 300)}`);
  }

  let json: any;
  try {
    json = JSON.parse(rawText);
  } catch {
    throw new Error(`Perbicubs login: non-JSON response (HTTP ${res.status}). Body: ${rawText.substring(0, 300)}`);
  }

  // Log the keys we see at the top level and inside data for diagnosis
  console.log('[Perbicubs] Login response top-level keys:', Object.keys(json));
  console.log('[Perbicubs] Login response data keys:', json?.data ? Object.keys(json.data) : 'no data key');

  const token: string | undefined =
    json?.data?.access_token ??   // standard path
    json?.access_token        ??  // flat path
    json?.data?.token         ??  // alternative key
    json?.token;                  // alternative flat key

  if (!token) {
    throw new Error(
      `Perbicubs login: token not found. Response shape: ${rawText.substring(0, 500)}`
    );
  }

  _cachedToken = token;
  return token;
}

// ─── Internal: Fetch one page, retry on 401 ─────────────────────────────────
async function _fetchPage(
  url: string,
  apiKey: string,
  token: string,
  isRetry = false,
): Promise<{ records: any[]; hasMore: boolean; token: string; lastPage: number; total: number }> {
  const res = await fetch(url, {
    method:  'GET',
    headers: {
      'api-key':       apiKey,
      'Authorization': `Bearer ${token}`,
      'Accept':        'application/json',
    },
    cache: 'no-store',
  });

  if (res.status === 401 && !isRetry) {
    // Token expired — refresh and retry once
    const newToken = await _refreshToken(apiKey);
    return _fetchPage(url, apiKey, newToken, true);
  }

  if (res.status === 429) throw new Error('Perbicubs API rate limit exceeded. Please try again later.');
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Perbicubs API error (HTTP ${res.status}): ${text}`);
  }

  const json = await res.json();
  const paginator = json?.data ?? {};
  const records: any[] = Array.isArray(paginator.data)
    ? paginator.data
    : Array.isArray(paginator)
    ? paginator
    : [];

  const lastPage = Number(paginator.last_page) || 1;
  const total = Number(paginator.total) || 0;
  const hasMore =
    paginator.current_page && paginator.last_page
      ? paginator.current_page < paginator.last_page
      : false;

  return { records, hasMore, token, lastPage, total };
}

// ─── Internal: Interpolative target cub search ──────────────────────────────
async function _findCubRecord(
  cubId: string,
  startDate: string,
  endDate: string,
  apiKey: string,
  initialToken: string,
): Promise<{ record: any | null; token: string }> {
  let token = initialToken;
  const cleanCubId = cubId.trim().toUpperCase();
  const idMatch = cleanCubId.match(/\d{5}$/);
  const targetId = idMatch ? parseInt(idMatch[0], 10) : NaN;

  // Fallback if ID does not follow the standard 5-digit sequence format
  if (isNaN(targetId) || targetId <= 0) {
    const url = `${API_BASE_URL}?date_from=${startDate}&date_to=${endDate}&limit=${PAGE_LIMIT}&page=1`;
    const res = await _fetchPage(url, apiKey, token);
    token = res.token;
    const match = res.records.find((r: any) => r.cub_id?.trim().toUpperCase() === cleanCubId);
    return { record: match ?? null, token };
  }

  let lowPage = 1;
  let highPage = 250;
  // The Perbicubs API sorts records by integer id ASC with ~101 IDs per page at limit=100.
  let estimatedPage = Math.max(1, Math.min(highPage, Math.round(targetId / 101) || 1));
  const visitedPages = new Set<number>();
  let attempts = 0;
  const MAX_ATTEMPTS = 5;

  while (lowPage <= highPage && attempts < MAX_ATTEMPTS) {
    let pageToFetch = estimatedPage;
    if (visitedPages.has(pageToFetch)) {
      pageToFetch = lowPage;
      while (visitedPages.has(pageToFetch) && pageToFetch <= highPage) {
        pageToFetch++;
      }
      if (pageToFetch > highPage) break;
    }

    visitedPages.add(pageToFetch);
    attempts++;

    const url = `${API_BASE_URL}?date_from=${startDate}&date_to=${endDate}&limit=${PAGE_LIMIT}&page=${pageToFetch}`;
    const res = await _fetchPage(url, apiKey, token);
    token = res.token;
    highPage = Math.min(highPage, res.lastPage || highPage);

    if (res.records.length === 0) {
      if (pageToFetch > 1) highPage = pageToFetch - 1;
      continue;
    }

    // Check if the target cub is in this page
    const found = res.records.find(
      (r: any) => r.cub_id?.trim().toUpperCase() === cleanCubId || r.id === targetId,
    );
    if (found) {
      return { record: found, token };
    }

    const firstId = Number(res.records[0].id);
    const lastId = Number(res.records[res.records.length - 1].id);

    if (targetId < firstId) {
      highPage = pageToFetch - 1;
      const step = Math.max(1, Math.round((firstId - targetId) / PAGE_LIMIT));
      estimatedPage = Math.max(lowPage, Math.min(highPage, pageToFetch - step));
    } else if (targetId > lastId) {
      lowPage = pageToFetch + 1;
      const step = Math.max(1, Math.round((targetId - lastId) / PAGE_LIMIT));
      estimatedPage = Math.max(lowPage, Math.min(highPage, pageToFetch + step));
    } else {
      // targetId falls between firstId and lastId on this page, but record was not found
      // (indicates this ID was skipped or deleted in Perbicubs database)
      break;
    }
  }

  return { record: null, token };
}

// ─── Public Server Action ────────────────────────────────────────────────────
/**
 * Fetches quiz/reading data for a single cub from the Perbicubs system.
 * Returns the cub's total points and a flat list of book quiz records
 * strictly within the given date range.
 *
 * No data is saved — purely for CER investigation purposes.
 */
export async function getCubReadingAudit(
  cubId: string,
  startDate: string, // 'yyyy-MM-dd'
  endDate: string,   // 'yyyy-MM-dd'
): Promise<{ success: true; data: ReadingAuditResult } | { success: false; error: string }> {
  const apiKey = process.env.PERBICUBS_API_KEY;

  if (!apiKey) {
    return { success: false, error: 'PERBICUBS_API_KEY is not configured. Please ask your admin to set it up.' };
  }

  if (!cubId?.trim()) return { success: false, error: 'Cub ID is required.' };
  if (!startDate || !endDate) return { success: false, error: 'Both start and end dates are required.' };

  try {
    // Get or refresh token
    let token = _cachedToken;
    if (!token) token = await _refreshToken(apiKey);

    const { record, token: updatedToken } = await _findCubRecord(
      cubId,
      startDate,
      endDate,
      apiKey,
      token,
    );
    _cachedToken = updatedToken;

    if (!record) {
      return {
        success: true,
        data: { total_points: 0, books: [] },
      };
    }

    const books: ReadingAuditBook[] = [];
    let totalPoints = 0;

    const quizResults: any[] = Array.isArray(record.quiz_result) ? record.quiz_result : [];

    for (const quiz of quizResults) {
      const rawDate: string =
        quiz.quiz_date || quiz.date || quiz.created_at || quiz.updated_at || '';
      const quizDate = rawDate ? String(rawDate).substring(0, 10) : '';

      // Strictly filter to the requested date window
      if (startDate && quizDate && quizDate < startDate) continue;
      if (endDate && quizDate && quizDate > endDate) continue;

      const score = Number(quiz.score) || 0;
      totalPoints += score;

      const bookTitle: string =
        quiz.book?.title?.trim() || quiz.book_title?.trim() || 'Untitled Book';

      books.push({
        book:      bookTitle,
        quiz_date: quizDate,
        score,
        status:    quiz.status || '—',
      });
    }

    // Sort by quiz date descending (most recent first)
    books.sort((a, b) => {
      if (!a.quiz_date && !b.quiz_date) return 0;
      if (!a.quiz_date) return 1;
      if (!b.quiz_date) return -1;
      return b.quiz_date.localeCompare(a.quiz_date);
    });

    return {
      success: true,
      data: { total_points: totalPoints, books },
    };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error fetching reading data.' };
  }
}

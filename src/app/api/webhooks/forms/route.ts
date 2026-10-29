import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { executeRebuildForms } from '@/lib/actions/forms';

// ─── Types ─────────────────────────────────────────────────────
interface FormPayload {
  form_source: 'Reading Circle Signup' | 'Orientation Signup';
  parent_name: string;
  parent_phone: string; // 233XXXXXXXXX format
  cub_name: string;
  library_card?: string; // Cub ID if provided
  selected_session?: string;
  grade?: string;
  idempotency_key?: string; // Form response ID to prevent duplicates
}

type MatchConfidence = 'High' | 'Medium' | 'Low' | 'None';

interface MatchResult {
  matched_cub_id: string | null;
  match_confidence: MatchConfidence;
}

// ─── Phone normalisation ────────────────────────────────────────
function normalisePhone(raw?: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('233')) return digits;
  if (digits.startsWith('0')) return '233' + digits.slice(1);
  if (digits.length === 9) return '233' + digits; // Missing country code
  return digits;
}

// ─── Levenshtein Distance & Normalized Similarity ──────────────
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const row = new Array(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;

  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = row[j];
      if (a[i - 1] === b[j - 1]) {
        row[j] = prev;
      } else {
        row[j] = 1 + Math.min(prev, row[j], row[j - 1]);
      }
      prev = temp;
    }
  }
  return row[n];
}

function stringSimilarity(a: string, b: string): number {
  const s1 = a.trim().toLowerCase();
  const s2 = b.trim().toLowerCase();
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  const maxLen = Math.max(s1.length, s2.length);
  const dist = levenshteinDistance(s1, s2);
  return Math.max(0, 1 - dist / maxLen);
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Computes multi-factor fuzzy name similarity between a submitted cub name
 * and a candidate cub in the database (firstName + lastName).
 *
 * Accounts for:
 * - One character added, missing, or changed (Levenshtein distance)
 * - Name reordering (e.g. "Mensah Kofi" vs "Kofi Mensah")
 * - One name added or missing (e.g. "Kofi Mensah" vs "Kofi Kwesi Mensah")
 *
 * Returns a score between 0.0 and 1.0.
 */
function computeNameMatchScore(
  submittedName: string,
  candidateFirst: string = '',
  candidateLast: string = ''
): number {
  const subTokens = tokenize(submittedName);
  const candTokens = tokenize(`${candidateFirst} ${candidateLast}`);

  if (subTokens.length === 0 || candTokens.length === 0) return 0.0;

  const subJoined = subTokens.join(' ');
  const candJoined = candTokens.join(' ');

  // 1. Direct full string similarity (tolerates minor character typos)
  const fullSim = stringSimilarity(subJoined, candJoined);
  if (fullSim === 1.0) return 1.0;

  // 2. Token-sorted string similarity (tolerates name reordering like "Surname Firstname")
  const subSorted = [...subTokens].sort().join(' ');
  const candSorted = [...candTokens].sort().join(' ');
  const tokenSortSim = stringSimilarity(subSorted, candSorted);

  // 3. Token-level matching (tolerates added/omitted middle names)
  let candMatchedCount = 0;
  for (const cToken of candTokens) {
    let bestTMatch = 0;
    for (const sToken of subTokens) {
      bestTMatch = Math.max(bestTMatch, stringSimilarity(cToken, sToken));
    }
    if (bestTMatch >= 0.80) candMatchedCount++;
  }

  let subMatchedCount = 0;
  for (const sToken of subTokens) {
    let bestTMatch = 0;
    for (const cToken of candTokens) {
      bestTMatch = Math.max(bestTMatch, stringSimilarity(sToken, cToken));
    }
    if (bestTMatch >= 0.80) subMatchedCount++;
  }

  const tokenOverlap =
    (2 * Math.min(candMatchedCount, subMatchedCount)) /
    (candTokens.length + subTokens.length);

  // If all candidate tokens (e.g. first and last name) matched inside submitted tokens (middle name added),
  // or vice versa (middle name omitted), this is a very strong match:
  let subsetBonus = 0;
  if (candMatchedCount === candTokens.length && candTokens.length >= 2) {
    subsetBonus = 0.88;
  } else if (subMatchedCount === subTokens.length && subTokens.length >= 2) {
    subsetBonus = 0.88;
  }

  // 4. First name and Last name specific verification if candidate has both:
  let firstAndLastScore = 0;
  if (candidateFirst && candidateLast) {
    const cFirst = candidateFirst.trim().toLowerCase();
    const cLast = candidateLast.trim().toLowerCase();

    let firstBest = 0;
    let lastBest = 0;
    for (const sToken of subTokens) {
      firstBest = Math.max(firstBest, stringSimilarity(cFirst, sToken));
      lastBest = Math.max(lastBest, stringSimilarity(cLast, sToken));
    }

    if (firstBest >= 0.75 && lastBest >= 0.75) {
      firstAndLastScore = (firstBest + lastBest) / 2;
    }
  }

  return Math.max(fullSim, tokenSortSim, tokenOverlap, subsetBonus, firstAndLastScore);
}

// ─── Auto-match logic ───────────────────────────────────────────
async function autoMatch(
  supabase: any,
  payload: FormPayload
): Promise<MatchResult> {
  const phone = normalisePhone(payload.parent_phone);

  // 1. Check Library Card (if provided)
  if (payload.library_card) {
    const cardTrimmed = payload.library_card.trim();
    const { data: byCard } = await supabase
      .from('master_cubs')
      .select('cub_id, cub_first_name, cub_last_name, parent_phone')
      .eq('cub_id', cardTrimmed)
      .maybeSingle();

    if (byCard) {
      const cardPhone = normalisePhone(byCard.parent_phone);
      const nameScore = computeNameMatchScore(
        payload.cub_name,
        byCard.cub_first_name,
        byCard.cub_last_name
      );

      // Verify that the library card belongs to this family (same phone) OR name matches (>= 0.75)
      // Prevents a typo in the library card from attaching to a stranger's cub
      if ((phone && cardPhone && phone === cardPhone) || nameScore >= 0.75) {
        return {
          matched_cub_id: byCard.cub_id,
          match_confidence: 'High',
        };
      }
    }
  }

  // 2. Primary matching: Lookup all cubs under this parent's phone
  if (phone) {
    const { data: byPhone } = await supabase
      .from('master_cubs')
      .select('cub_id, cub_first_name, cub_last_name, parent_first_name, parent_last_name')
      .eq('parent_phone', phone);

    const phoneMatches = byPhone ?? [];

    if (phoneMatches.length > 0) {
      // Score EACH cub under this parent against the submitted cub name
      const scored = phoneMatches.map((cub: any) => ({
        cub_id: cub.cub_id,
        score: computeNameMatchScore(payload.cub_name, cub.cub_first_name, cub.cub_last_name),
      })).sort((a: any, b: any) => b.score - a.score);

      const topMatch = scored[0];

      // Threshold: must be at least 80% (0.80) to match!
      // This guarantees we NEVER wrongly assign an existing cub's ID to a different sibling!
      if (topMatch && topMatch.score >= 0.80) {
        return {
          matched_cub_id: topMatch.cub_id,
          match_confidence: topMatch.score >= 0.90 ? 'High' : 'Medium',
        };
      }

      // If phone matches the parent, but none of the cubs under that phone match >= 80%:
      // DO NOT assign any cub ID! The cub is either new or needs manual verification.
      return { matched_cub_id: null, match_confidence: 'None' };
    }
  }

  // 3. Fallback: Phone did not match any parent — search master_cubs by cub name
  const nameParts = tokenize(payload.cub_name);
  if (nameParts.length >= 2) {
    const firstName = nameParts[0];
    const lastName = nameParts[nameParts.length - 1];

    const { data: candidates } = await supabase
      .from('master_cubs')
      .select('cub_id, cub_first_name, cub_last_name, parent_phone')
      .or(`cub_first_name.ilike.%${firstName}%,cub_last_name.ilike.%${lastName}%`)
      .limit(10);

    if (candidates && candidates.length > 0) {
      const scoredGlobal = candidates
        .map((c: any) => ({
          cub_id: c.cub_id,
          score: computeNameMatchScore(payload.cub_name, c.cub_first_name, c.cub_last_name),
        }))
        .filter((x: any) => x.score >= 0.80)
        .sort((a: any, b: any) => b.score - a.score);

      // Only match if there is a clear, unambiguous best match
      if (scoredGlobal.length === 1 || (scoredGlobal.length > 1 && scoredGlobal[0].score > scoredGlobal[1].score + 0.15)) {
        return {
          matched_cub_id: scoredGlobal[0].cub_id,
          match_confidence: scoredGlobal[0].score >= 0.90 ? 'Medium' : 'Low',
        };
      }
    }
  }

  return { matched_cub_id: null, match_confidence: 'None' };
}

// GET /api/webhooks/forms (rebuilds forms / automated daily trigger)
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret') || req.nextUrl.searchParams.get('secret');
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await executeRebuildForms();
    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST /api/webhooks/forms
// Called by: Apps Script onRCFormSubmit / onOrientationFormSubmit relay
// Shared secret in header: x-webhook-secret
export async function POST(req: NextRequest) {
  // 1. Verify shared secret (constant-time comparison to prevent timing oracle)
  const secret = req.headers.get('x-webhook-secret');
  const expectedSecret = process.env.WEBHOOK_SECRET;
  const isValidSecret = (() => {
    if (!secret || !expectedSecret) return false;
    try {
      const a = Buffer.from(secret);
      const b = Buffer.from(expectedSecret);
      if (a.length !== b.length) return false;
      return require('crypto').timingSafeEqual(a, b);
    } catch {
      return false;
    }
  })();
  if (!isValidSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Handle rebuild request
  if (payload.action === 'rebuild') {
    try {
      const res = await executeRebuildForms();
      return NextResponse.json(res);
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  if (!payload.form_source || !payload.cub_name) {
    return NextResponse.json({ error: 'Missing required fields (form_source, cub_name)' }, { status: 400 });
  }

  // 2. Use service role client (bypasses RLS — webhooks are server-to-server)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // 3. Idempotency check — if idempotency_key already exists, skip
  if (payload.idempotency_key) {
    const { data: existing } = await supabase
      .from('pending_signups')
      .select('id')
      .eq('idempotency_key', payload.idempotency_key)
      .eq('form_source', payload.form_source)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'duplicate' });
    }
  }

  // 4. Auto-match
  const match = await autoMatch(supabase, payload);

  // 5. Normalise phone
  const normalisedPhone = normalisePhone(payload.parent_phone);

  // 6. Resolve parent_name if missing or mistakenly sent as phone digits
  let cleanParentName = (payload.parent_name || '').trim();
  const isParentNameDigits = /^[\d\s+\-()]{6,}$/.test(cleanParentName) || cleanParentName === payload.parent_phone;
  if (!cleanParentName || isParentNameDigits) {
    if (match.matched_cub_id) {
      const { data: cubMatch } = await supabase
        .from('master_cubs')
        .select('parent_first_name, parent_last_name')
        .eq('cub_id', match.matched_cub_id)
        .limit(1)
        .maybeSingle();
      if (cubMatch && (cubMatch.parent_first_name || cubMatch.parent_last_name)) {
        cleanParentName = `${cubMatch.parent_first_name || ''} ${cubMatch.parent_last_name || ''}`.trim();
      }
    }
    if ((!cleanParentName || isParentNameDigits) && normalisedPhone) {
      const { data: phoneMatch } = await supabase
        .from('master_cubs')
        .select('parent_first_name, parent_last_name')
        .eq('parent_phone', normalisedPhone)
        .limit(1)
        .maybeSingle();
      if (phoneMatch && (phoneMatch.parent_first_name || phoneMatch.parent_last_name)) {
        cleanParentName = `${phoneMatch.parent_first_name || ''} ${phoneMatch.parent_last_name || ''}`.trim();
      }
    }
  }

  // 7. Insert into pending_signups
  const { error: insertErr } = await supabase.from('pending_signups').insert({
    form_source: payload.form_source,
    parent_name: cleanParentName,
    parent_phone: normalisedPhone,
    cub_name: payload.cub_name.trim(),
    library_card: payload.library_card?.trim() || null,
    idempotency_key: payload.idempotency_key || null,
    selected_session: payload.selected_session || null,
    grade: payload.grade || null,
    matched_cub_id: match.matched_cub_id,
    match_confidence: match.match_confidence,
    status: 'Pending',
  });

  if (insertErr) {
    // Postgres unique constraint violation (23505) means a concurrent request already
    // inserted the same idempotency_key. Treat this as a successful duplicate acknowledgment
    // rather than an error — prevents Google Apps Script from entering an infinite retry loop.
    if ((insertErr as any).code === '23505') {
      console.info(`[webhook/forms] duplicate idempotency_key skipped: ${payload.idempotency_key}`);
      return NextResponse.json({ ok: true, skipped: true, reason: 'duplicate' });
    }
    console.error('[webhook/forms] insert error:', insertErr);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  console.info(`[webhook/forms] ${payload.form_source} → ${match.match_confidence} match → ${match.matched_cub_id ?? 'unmatched'}`);
  return NextResponse.json({ ok: true, match_confidence: match.match_confidence });
}

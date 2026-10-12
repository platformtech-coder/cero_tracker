// @ts-nocheck
/**
 * Supabase Edge Function: sync-master-cubs
 *
 * Reads sheet config from `app_config` table at runtime.
 * Writes one sync_state row per sheet:
 *   - directory       -> master_cubs + cubs + families
 *   - reading_data    -> enriches cubs reading fields
 *   - score_calendar  -> enriches cubs weekly points
 *   - email_history   -> (future) email log import
 *
 * POST body (optional): { "sheet": "directory" | "reading_data" | "score_calendar" | "all" }
 * Defaults to "all" if not specified.
 *
 * Required Supabase secrets:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_PRIVATE_KEY  (raw PEM -- newlines can be literal \n or \\n)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SA_EMAIL = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')!;
const PRIVATE_KEY_RAW = Deno.env.get('GOOGLE_PRIVATE_KEY')!;

// --- Google Sheets JWT auth -----------------------------------------------
async function getGoogleAccessToken(): Promise<string> {
  const raw = PRIVATE_KEY_RAW?.trim() ?? '';
  let privateKeyPem: string;
  if (raw.startsWith('-----')) {
    privateKeyPem = raw.replace(/\\n/g, '\n');
  } else {
    try {
      privateKeyPem = atob(raw).replace(/\\n/g, '\n');
    } catch {
      privateKeyPem = raw.replace(/\\n/g, '\n');
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const b64url = (s: string) => btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = b64url(JSON.stringify({
    iss: SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  }));
  const signingInput = `${header}.${claimSet}`;
  const keyData = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  const b64sig = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${signingInput}.${b64sig}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error(`Google auth failed: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token;
}

// --- Fetch a sheet range --------------------------------------------------
async function fetchSheet(token: string, sheetId: string, range: string): Promise<any[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
  return ((await res.json()).values ?? []) as any[][];
}

// --- Helpers --------------------------------------------------------------
const colIdx = (h: any[], n: string) => h.findIndex(x => String(x || '').trim().toLowerCase() === n.toLowerCase());
// Try multiple aliases for a column - returns first match found
const colIdxAny = (h: any[], ...names: string[]) => {
  for (const n of names) {
    const idx = h.findIndex(x => String(x || '').trim().toLowerCase() === n.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
};
function safe(row: any[], idx: number): string | null {
  if (idx < 0 || idx >= row.length) return null;
  const v = row[idx];
  if (v === null || v === undefined || v === '') return null;
  return String(v).trim();
}
function safeDate(row: any[], idx: number): string | null {
  if (idx < 0 || idx >= row.length) return null;
  const v = row[idx];
  if (v === null || v === undefined || v === '') return null;
  
  if (typeof v === 'number') {
    const Math_trunc = Math.trunc || Math.floor;
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math_trunc(v));
    return epoch.toISOString().slice(0, 10);
  }
  
  const str = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(str)) {
    const [d, m, y] = str.split('/');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  
  const t = Date.parse(str);
  if (!isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}
function safeInt(row: any[], idx: number): number {
  const v = row[idx];
  if (typeof v === 'number') return v;
  const n = parseInt(safe(row, idx) ?? '', 10); return isNaN(n) ? 0 : n;
}
function computeSubStatus(end: string | null): 'active' | 'almost expiring' | 'expired' {
  if (!end) return 'expired';
  const daysLeft = Math.floor((new Date(end).getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'almost expiring';
  return 'active';
}
function computeNoSubDays(s: string | null, e: string | null): number | null {
  if (!s || !e) return null;
  const d = Math.round((new Date(e).getTime() - new Date(s).getTime()) / 86400000);
  return d >= 0 ? d : null;
}

// Normalize any sheet status value to the three DB-allowed values
function normalizeSubStatus(raw: string | null, subEnd: string | null): 'active' | 'almost expiring' | 'expired' {
  if (raw) {
    const v = raw.trim().toLowerCase();
    if (v === 'active' || v.includes('active')) return 'active';
    if (v === 'almost expiring' || v.includes('almost') || v.includes('expir') && v.includes('soon')) return 'almost expiring';
    if (v === 'expired' || v.includes('expir')) return 'expired';
  }
  // Fall back to date-based calculation
  return computeSubStatus(subEnd);
}

// --- sync_state helpers ---------------------------------------------------
async function markRunning(db: any, key: string) {
  await db.from('sync_state').upsert({
    sync_type: key, status: 'running', last_run_at: new Date().toISOString(),
    error_message: null, processed_count: 0, last_processed_row: 0, updated_at: new Date().toISOString()
  }, { onConflict: 'sync_type' });
}
async function markDone(db: any, key: string, n: number) {
  await db.from('sync_state').upsert({
    sync_type: key, status: 'completed', last_run_at: new Date().toISOString(),
    processed_count: n, last_processed_row: n, error_message: null, updated_at: new Date().toISOString()
  }, { onConflict: 'sync_type' });
}
async function markFailed(db: any, key: string, msg: string) {
  await db.from('sync_state').upsert({
    sync_type: key, status: 'failed', last_run_at: new Date().toISOString(),
    error_message: msg, updated_at: new Date().toISOString()
  }, { onConflict: 'sync_type' });
}

// --- Sync: Directory -> master_cubs + cubs + families ------------------
async function syncDirectory(db: any, token: string, sheetId: string, tab: string, debug = false) {
  await markRunning(db, 'directory');
  try {
    const rows = await fetchSheet(token, sheetId, `${tab}!A:Z`);
    if (rows.length < 2) { await markDone(db, 'directory', 0); return 0; }
    const h = rows[0].map((x: any) => String(x || '').trim().toLowerCase());
    // Log actual headers to help debug mismatches
    console.log('[sync-directory] Sheet headers:', h.slice(0, 30).join(' | '));
    if (debug) {
      return {
        headers: h,
        firstRow: rows[1],
        firstRowDates: {
          start: rows[1][colIdxAny(h,'sub start date','subscription start','start date','sub start')],
          end: rows[1][colIdxAny(h,'sub end date','subscription end','end date','sub end','expiry date')],
        }
      };
    }
    const COL = {
      date_onboarded: colIdxAny(h,'date','onboarding date','onboarded date','date onboarded'),
      cub_id: colIdxAny(h,'cub id','id','cub_id','student id','student_id'), 
      cub_first: colIdxAny(h,'cub first name','first name','cub first','firstname'),
      cub_last: colIdxAny(h,'cub last name','last name','cub last','lastname'),
      gender: colIdx(h,'gender'), dob: colIdxAny(h,'date of birth','dob','birth date'),
      grade: colIdx(h,'grade'),
      stream: colIdx(h,'stream'), school_code: colIdxAny(h,'school code','school_code'),
      school_name: colIdxAny(h,'school name','school','school_name'),
      sub_start: colIdxAny(h,'sub start date','subscription start','start date','sub start'),
      sub_end: colIdxAny(h,'sub end date','subscription end','end date','sub end','expiry date'),
      sub_status: colIdxAny(h,'sub status','subscription status','status'),
      parent_first: colIdxAny(h,'parent first name','parent first','guardian first name'),
      parent_last: colIdxAny(h,'parent last name','parent last','guardian last name'),
      parent_email: colIdxAny(h,'parent email','email','guardian email'),
      parent_phone: colIdxAny(h,'parent phone','phone','guardian phone','contact'),
      parent_whatsapp: colIdxAny(h,'whatsapp','parent whatsapp','wa'),
      segment: colIdx(h,'segment'),
      total_subs: colIdxAny(h,'total subscriptions','total subs','subscriptions'),
      update_history: colIdxAny(h,'update history','history'),
      rep: colIdxAny(h,'relationship owner','rep','account owner','agent','handled by','assigned to','owner'),
    };
    console.log('[sync-directory] Total sheet rows (incl. header):', rows.length);
    console.log('[sync-directory] COL map:', JSON.stringify(COL));
    
    // Filter out rows without rep
    const validRows = rows.slice(1).filter((r: string[]) => {
      if (!safe(r, COL.cub_id)) return false;
      const repRaw = safe(r, COL.rep);
      if (!repRaw || repRaw.trim() === '' || repRaw.trim().toLowerCase() === 'unknown') return false;
      return true;
    });
    
    console.log('[sync-directory] Valid rows after filtering:', validRows.length, '/ Total data rows:', rows.length - 1);
    if (validRows.length === 0) {
      console.log('[sync-directory] COL.rep index:', COL.rep, '| COL.cub_id index:', COL.cub_id);
      // Log a sample of what the first data row looks like
      if (rows.length > 1) console.log('[sync-directory] Sample row[0]:', JSON.stringify(rows[1]?.slice(0,15)));
    }

    let processed = 0; const CHUNK = 100;
    
    // Process in chunks to avoid 1000 limit and memory issues
    for (let i = 0; i < validRows.length; i += CHUNK) {
      const chunkData = validRows.slice(i, i + CHUNK);
      
      const masterCubsChunk = chunkData.map((r: string[]) => {
        const subEnd = safeDate(r, COL.sub_end), subStart = safeDate(r, COL.sub_start);
        const onboardedDate = safeDate(r, COL.date_onboarded >= 0 ? COL.date_onboarded : 0);
        const seg = safe(r, COL.segment);
        const repRaw = safe(r, COL.rep) ?? '';
        const subStatusRaw = normalizeSubStatus(safe(r, COL.sub_status), subEnd);
        return {
          cub_id: safe(r, COL.cub_id)!,
          date_onboarded: onboardedDate,
          cub_first_name: safe(r, COL.cub_first) ?? 'Unknown',
          cub_last_name: safe(r, COL.cub_last) ?? '', gender: safe(r, COL.gender),
          date_of_birth: safeDate(r, COL.dob), grade: safe(r, COL.grade), stream: safe(r, COL.stream),
          school_code: String(safeInt(r, COL.school_code) || safe(r, COL.school_code) || ''),
          school_name: safe(r, COL.school_name),
          sub_start_date: subStart, sub_end_date: subEnd, sub_status: subStatusRaw,
          parent_first_name: safe(r, COL.parent_first), parent_last_name: safe(r, COL.parent_last),
          parent_email: safe(r, COL.parent_email), parent_phone: safe(r, COL.parent_phone),
          parent_whatsapp: safe(r, COL.parent_whatsapp),
          segment: (['Gen. Comm','CDLS','RCS'].includes(seg ?? '')) ? seg : 'Gen. Comm',
          total_subscriptions: safeInt(r, COL.total_subs), update_history: safe(r, COL.update_history),
          rep_name: repRaw, external_synced_at: new Date().toISOString(),
        };
      });
      
      if (!masterCubsChunk.length) continue;
      
      // Upsert master_cubs
      const { error: err1 } = await db.from('master_cubs').upsert(masterCubsChunk, { onConflict: 'cub_id' });
      if (err1) {
        console.error('[sync-directory] master_cubs upsert error:', JSON.stringify(err1));
        throw new Error(`master_cubs upsert failed: ${err1.message}`);
      }
      processed += masterCubsChunk.length;
      
      // Fetch existing cubs to preserve fields
      const cubIds = masterCubsChunk.map((m: any) => m.cub_id);
      const { data: existing } = await db.from('cubs')
        .select('cub_id,date_onboarded,last_engagement_activity,handled_by_last,purpose_last,orientation_stage,orientation_stage_status,orientation_next_stage,orientation_completion_date,reading_circle_category,no_present,last_attendance_date,current_streak,longest_streak,streak_label,current_league,medallion_status,flag,cumulative_points,cumulative_weekly_points,last_reading_activity')
        .in('cub_id', cubIds);
      const exMap = new Map((existing ?? []).map((c: any) => [c.cub_id, c]));
      
      const cubsChunk = masterCubsChunk.map((m: any) => {
        const ex: any = exMap.get(m.cub_id) ?? {};
        return {
          cub_id: m.cub_id, 
          date_onboarded: m.date_onboarded ?? ex.date_onboarded ?? m.sub_start_date ?? null,
          segment: m.segment, gender: m.gender, grade: m.grade, stream: m.stream,
          school_name: m.school_name, sub_start_date: m.sub_start_date, sub_end_date: m.sub_end_date,
          no_sub_days: computeNoSubDays(m.sub_start_date, m.sub_end_date),
          sub_status: m.sub_status, relationship_owner: m.rep_name || ex.relationship_owner || 'Unassigned',
          current_streak: ex.current_streak ?? 0, longest_streak: ex.longest_streak ?? 0,
          streak_label: ex.streak_label ?? null, current_league: ex.current_league ?? null,
          medallion_status: ex.medallion_status ?? null, flag: ex.flag ?? null,
          cumulative_points: ex.cumulative_points ?? 0, cumulative_weekly_points: ex.cumulative_weekly_points ?? 0,
          last_reading_activity: ex.last_reading_activity ?? null,
          last_engagement_activity: ex.last_engagement_activity ?? null,
          handled_by_last: ex.handled_by_last ?? null, purpose_last: ex.purpose_last ?? null,
          reading_circle_category: ex.reading_circle_category ?? null,
          no_present: ex.no_present ?? 0, last_attendance_date: ex.last_attendance_date ?? null,
          orientation_stage: ex.orientation_stage ?? null, orientation_stage_status: ex.orientation_stage_status ?? null,
          orientation_next_stage: ex.orientation_next_stage ?? null,
          orientation_completion_date: ex.orientation_completion_date ?? null,
        };
      });
      const { error: err2 } = await db.from('cubs').upsert(cubsChunk, { onConflict: 'cub_id' });
      if (err2) {
        console.error('[sync-directory] cubs upsert error:', JSON.stringify(err2));
        throw new Error(`cubs upsert failed: ${err2.message}`);
      }
    }
    
    // Auto-enroll newly synced Gen. Comm cubs into Orientation
    const { data: enrolledCount, error: enrollErr } = await db.rpc('enroll_gen_comm_orientation');
    if (enrollErr) {
      console.warn('[sync-directory] enroll_gen_comm_orientation warning:', enrollErr.message);
    } else if (enrolledCount && enrolledCount > 0) {
      console.log(`[sync-directory] Auto-enrolled ${enrolledCount} new Gen. Comm cubs into Orientation`);
    }

    console.log(`[sync-directory] Processed ${processed} rows. Building families...`);
    
    // Families sync (computed from validRows in memory)
    // Use phone as the primary dedup key, then email, then name combo
    const fMap = new Map<string, any>();
    for (const r of validRows) {
      const phone = safe(r, COL.parent_phone);
      const email = safe(r, COL.parent_email);
      const first = safe(r, COL.parent_first);
      const last = safe(r, COL.parent_last);
      const repRaw = safe(r, COL.rep) ?? '';
      const whatsapp = safe(r, COL.parent_whatsapp);
      
      // Primary key: phone (normalized, no spaces/dashes), else email, else name
      const normalizedPhone = phone ? phone.replace(/[^0-9+]/g,'') : null;
      const k = normalizedPhone ?? email?.toLowerCase().trim() ?? `${first?.toLowerCase()}_${last?.toLowerCase()}`;
      
      if (!k || k === '_') continue; // Skip if no identifiable parent data
      
      if (!fMap.has(k)) {
        fMap.set(k, {
          parent_first_name: first ?? 'Unknown', parent_last_name: last ?? '',
          parent_phone: normalizedPhone, parent_email: email?.toLowerCase().trim() ?? null,
          parent_whatsapp: whatsapp, relationship_owner: repRaw, count: 1
        });
      } else {
        const existing = fMap.get(k);
        existing.count++;
        // Update with richer data if available
        if (!existing.parent_phone && normalizedPhone) existing.parent_phone = normalizedPhone;
        if (!existing.parent_email && email) existing.parent_email = email.toLowerCase().trim();
        if (!existing.parent_whatsapp && whatsapp) existing.parent_whatsapp = whatsapp;
      }
    }
    
    const fRows = [...fMap.values()].map(f => ({
      parent_first_name: f.parent_first_name, parent_last_name: f.parent_last_name,
      parent_phone: f.parent_phone, parent_email: f.parent_email,
      parent_whatsapp: f.parent_whatsapp, relationship_owner: f.relationship_owner || 'Unassigned',
      no_cubs: f.count,
    }));
    
    // Upsert using the new COALESCE-based unique index columns
    let familiesProcessed = 0;
    for (let i = 0; i < fRows.length; i += CHUNK) {
      const fChunk = fRows.slice(i, i + CHUNK);
      // Use a raw SQL upsert to handle the functional index
      const { error: errF } = await db.rpc('upsert_families', { rows: fChunk });
      if (errF) {
        // Fallback: insert one by one
        for (const fRow of fChunk) {
          const { error: e2 } = await db.from('families').upsert(fRow, {
            ignoreDuplicates: false,
          });
          if (e2) console.error('[sync-directory] family row error:', JSON.stringify(e2), JSON.stringify(fRow));
          else familiesProcessed++;
        }
      } else {
        familiesProcessed += fChunk.length;
      }
    }
    console.log(`[sync-directory] Families upserted: ${familiesProcessed} unique parents from ${validRows.length} cubs`);
    await markDone(db, 'directory', processed);
    return processed;
  } catch (err: any) { await markFailed(db, 'directory', err?.message ?? String(err)); throw err; }
}

// --- Sync: Reading Data -> cubs reading enrichment -----------------------
async function syncReadingData(db: any, token: string, sheetId: string, tab: string, debug = false) {
  await markRunning(db, 'reading_data');
  try {
    const rows = await fetchSheet(token, sheetId, `${tab}!A:Z`);
    if (rows.length < 2) { await markDone(db, 'reading_data', 0); return 0; }
    const h = rows[0].map((x: any) => String(x || '').trim().toLowerCase());
    if (debug) {
      return {
        headers: h,
        firstRow: rows[1],
        cub_id_match: colIdxAny(h,'cub id','id','cub_id','student id','student_id')
      };
    }
    const COL = {
      cub_id: colIdxAny(h,'cub id','id','cub_id','student id','student_id'),
      streak: colIdxAny(h,'current streak','streak'),
      longest_streak: colIdxAny(h,'longest streak'), streak_label: colIdxAny(h,'streak label'),
      league: colIdxAny(h,'current league'), medallion: colIdxAny(h,'medallion status'),
      flag: colIdxAny(h,'flag'), points: colIdxAny(h,'cumulative points'),
    };
    console.log('[sync-reading] Total sheet rows:', rows.length);
    console.log('[sync-reading] COL map:', JSON.stringify(COL));
    
    let processed = 0; const CHUNK = 100;
    const data = rows.slice(1).filter((r: string[]) => safe(r, COL.cub_id));
    
    console.log('[sync-reading] Valid rows with Cub ID:', data.length);
    if (data.length === 0 && rows.length > 1) {
      console.log('[sync-reading] Sample row[1]:', JSON.stringify(rows[1].slice(0,10)));
    }
    
    for (let i = 0; i < data.length; i += CHUNK) {
      const slice = data.slice(i, i + CHUNK);
      const cubIds = slice.map((r: any[]) => safe(r, COL.cub_id)!);
      
      const { data: existing } = await db.from('cubs').select('*').in('cub_id', cubIds);
      const exMap = new Map((existing ?? []).map((c: any) => [c.cub_id, c]));

      const chunk = slice.map((r: any[]) => {
        const id = safe(r, COL.cub_id)!;
        const ex = exMap.get(id);
        if (!ex) return null;
        return {
          ...ex,
          current_streak: safeInt(r, COL.streak),
          longest_streak: safeInt(r, COL.longest_streak), streak_label: safe(r, COL.streak_label),
          current_league: safe(r, COL.league), medallion_status: safe(r, COL.medallion),
          flag: safe(r, COL.flag), cumulative_points: safeInt(r, COL.points),
        };
      }).filter(Boolean);

      if (chunk.length > 0) {
        const { error } = await db.from('cubs').upsert(chunk, { onConflict: 'cub_id' });
        if (error) {
          throw new Error(`cubs upsert failed: ${error.message} - details: ${JSON.stringify(error)}`);
        } else {
          processed += chunk.length;
        }
      }
    }
    await markDone(db, 'reading_data', processed); return processed;
  } catch (err: any) { await markFailed(db, 'reading_data', err?.message ?? String(err)); throw err; }
}

// --- Sync: Score Calendar -> cubs weekly scores --------------------------
async function syncScoreCalendar(db: any, token: string, sheetId: string, tab: string) {
  await markRunning(db, 'score_calendar');
  try {
    const rows = await fetchSheet(token, sheetId, `${tab}!A:Z`);
    if (rows.length < 2) { await markDone(db, 'score_calendar', 0); return 0; }
    
    const h = rows[0].map((x: any) => String(x || '').trim().toLowerCase());
    const idIdx = colIdxAny(h, 'cub id', 'id', 'cub_id', 'student id', 'student_id');
    
    if (idIdx === -1) {
      await markDone(db, 'score_calendar', 0);
      return 0; // cannot process without ID
    }

    let processed = 0; const CHUNK = 100;
    const data = rows.slice(1).filter((r: string[]) => safe(r, idIdx));
    
    for (let i = 0; i < data.length; i += CHUNK) {
      const slice = data.slice(i, i + CHUNK);
      const cubIds = slice.map((r: any[]) => safe(r, idIdx)!);
      
      const { data: existing } = await db.from('cubs').select('*').in('cub_id', cubIds);
      const exMap = new Map((existing ?? []).map((c: any) => [c.cub_id, c]));

      const chunk = slice.map((r: any[]) => {
        const cubId = safe(r, idIdx)!;
        const ex = exMap.get(cubId);
        if (!ex) return null;
        
        // Calculate weekly points (sum of last 7 columns)
        let weeklyPoints = 0;
        const maxCols = r.length;
        const weekStartIdx = Math.max(idIdx + 1, maxCols - 7);
        for (let j = weekStartIdx; j < maxCols; j++) {
          const n = parseFloat(r[j]);
          if (!isNaN(n) && n > 0) weeklyPoints += n;
        }

        // Calculate last reading date (right-most column with score >= 1)
        let lastReadingDate = null;
        for (let j = maxCols - 1; j > idIdx; j--) {
          const n = parseFloat(r[j]);
          if (!isNaN(n) && n >= 1) {
            lastReadingDate = safeDate(rows[0], j); // use the header string as date
            break;
          }
        }

        return {
          ...ex,
          cumulative_weekly_points: weeklyPoints,
          last_reading_activity: lastReadingDate,
        };
      }).filter(Boolean);

      if (chunk.length > 0) {
        const { error } = await db.from('cubs').upsert(chunk, { onConflict: 'cub_id' });
        if (error) {
          throw new Error(`cubs upsert failed: ${error.message} - details: ${JSON.stringify(error)}`);
        } else {
          processed += chunk.length;
        }
      }
    }
    await markDone(db, 'score_calendar', processed); return processed;
  } catch (err: any) { await markFailed(db, 'score_calendar', err?.message ?? String(err)); throw err; }
}

// --- Sync: Email History -> email_history table --------------------------
async function syncEmailHistory(db: any, token: string, sheetId: string, tab: string) {
  await markRunning(db, 'email_history');
  try {
    const rows = await fetchSheet(token, sheetId, `${tab}!A:Z`);
    if (rows.length < 2) { await markDone(db, 'email_history', 0); return 0; }
    
    const h = rows[0].map((x: any) => String(x || '').trim().toLowerCase());
    const idIdx = colIdxAny(h, 'cub id', 'id', 'cub_id', 'student id', 'student_id');
    
    if (idIdx === -1) {
      await markDone(db, 'email_history', 0);
      return 0; // cannot process without ID
    }

    let processed = 0; const CHUNK = 200;
    const data = rows.slice(1).filter((r: string[]) => safe(r, idIdx));
    
    for (let i = 0; i < data.length; i += CHUNK) {
      const slice = data.slice(i, i + CHUNK);
      const cubIds = slice.map((r: any[]) => safe(r, idIdx)!);
      
      const { data: existing } = await db.from('cubs').select('cub_id').in('cub_id', cubIds);
      const validIds = new Set((existing ?? []).map((c: any) => c.cub_id));
      
      const chunk = slice.map((r: any[]) => {
        const cubId = safe(r, idIdx)!;
        if (!validIds.has(cubId)) return null; // Skip if cub_id doesn't exist in DB
        
        const rowData: Record<string, any> = { cub_id: cubId };
        
        // Loop over the message dates/types pairs.
        // Assuming pairs start right after the ID column or at index 1
        const startIdx = idIdx + 1;
        let msgNum = 1;
        for (let j = startIdx; j < r.length && msgNum <= 7; j += 2) {
          const dateStr = safeDate(r, j);
          const typeStr = safe(r, j + 1);
          
          if (dateStr || typeStr) {
            rowData[`msg_${msgNum}_date`] = dateStr;
            rowData[`msg_${msgNum}_type`] = typeStr;
          }
          msgNum++;
        }

        return rowData;
      }).filter(Boolean);

      if (chunk.length > 0) {
        const { error } = await db.from('email_history').upsert(chunk, { onConflict: 'cub_id' });
        if (error) {
          throw new Error(`email_history upsert failed: ${error.message} - details: ${JSON.stringify(error)}`);
        } else {
          processed += chunk.length;
        }
      }
    }
    await markDone(db, 'email_history', processed); return processed;
  } catch (err: any) { await markFailed(db, 'email_history', err?.message ?? String(err)); throw err; }
}

// --- Main handler --------------------------------------------------------
Deno.serve(async (req: Request) => {
  const t0 = Date.now();
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  let targetSheet = 'all';
  try { const body = await req.json().catch(() => ({})); targetSheet = body?.sheet ?? 'all'; } catch { }

  const { data: cfgRows } = await db.from('app_config').select('key,value');
  const cfg: Record<string, string> = {};
  (cfgRows ?? []).forEach((r: any) => { cfg[r.key] = r.value; });

  const directoryId  = cfg['sheet_directory_id'] ?? '';
  const directoryTab = cfg['sheet_directory_tab'] ?? 'Master';
  const readingId    = cfg['sheet_reading_data_id'] ?? '';
  const readingTab   = cfg['sheet_reading_data_tab'] ?? 'Cubs Registry';
  const scoreId      = cfg['sheet_score_calendar_id'] ?? '';
  const scoreTab     = cfg['sheet_score_calendar_tab'] ?? 'Score Calendar';

  const results: Record<string, any> = {};
  try {
    const token = await getGoogleAccessToken();
    if (targetSheet === 'debug_dir' && directoryId) {
      const debug = await syncDirectory(db, token, directoryId, directoryTab, true);
      return new Response(JSON.stringify({ ok: true, debug }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (targetSheet === 'debug_reading' && readingId) {
      const debug = await syncReadingData(db, token, readingId, readingTab, true);
      return new Response(JSON.stringify({ ok: true, debug }), { headers: { 'Content-Type': 'application/json' } });
    }
    if ((targetSheet === 'all' || targetSheet === 'directory') && directoryId)
      results.directory = await syncDirectory(db, token, directoryId, directoryTab);
    if ((targetSheet === 'all' || targetSheet === 'reading_data') && readingId)
      results.reading_data = await syncReadingData(db, token, readingId, readingTab);
    if ((targetSheet === 'all' || targetSheet === 'score_calendar') && scoreId)
      results.score_calendar = await syncScoreCalendar(db, token, scoreId, scoreTab);
    if ((targetSheet === 'all' || targetSheet === 'email_history') && cfg['sheet_email_history_id'])
      results.email_history = await syncEmailHistory(db, token, cfg['sheet_email_history_id'], cfg['sheet_email_history_tab'] || 'Email History');

    const duration = Date.now() - t0;
    await db.from('audit_log').insert({
      action: 'SYNC_COMPLETED',
      details: `Sheets synced: ${Object.keys(results).join(', ')} | ${JSON.stringify(results)}`,
      status: 'ok', duration_ms: duration, timestamp: new Date().toISOString(),
    });
    return new Response(JSON.stringify({ ok: true, results, duration_ms: duration }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    await db.from('audit_log').insert({
      action: 'SYNC_FAILED', details: `Error: ${msg}`, status: 'error',
      duration_ms: Date.now() - t0, timestamp: new Date().toISOString(),
    });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});


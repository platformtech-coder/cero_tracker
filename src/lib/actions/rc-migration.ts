'use server';

import { google } from 'googleapis';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { getSystemAdminSession } from '@/lib/systemAdminAuth';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';

const SPREADSHEET_ID = '18trcU_16Nb_4lsi76d1xY90qNLMFDpbRUoRVchuNQlY';

const REP_USER_MAP: Record<string, string> = {
  kezia: '706d0357-fc20-41be-9f7c-e68c04024b11',
  keziah: '706d0357-fc20-41be-9f7c-e68c04024b11',
  'keziah woolley': '706d0357-fc20-41be-9f7c-e68c04024b11',
  majorie: 'f4d49ba5-c8e3-4939-99ed-7e86c36934d1',
  marjorie: 'f4d49ba5-c8e3-4939-99ed-7e86c36934d1',
};

const FALLBACK_ADMIN_ID = '66529349-a51c-4c2e-aa45-631d996a83d7';

function getRepUserId(repName?: string | null): string {
  if (!repName) return FALLBACK_ADMIN_ID;
  const key = repName.toLowerCase().trim();
  return REP_USER_MAP[key] || FALLBACK_ADMIN_ID;
}

const SESSION_MAP: Record<string, string> = {
  'Tuesday - 5pm': 'Tuesday 5:00 pm – 5:45 pm',
  'Tuesday - 6pm': 'Tuesday 6:00 pm – 6:45 pm',
  'Wednesdays - 5pm': 'Wednesday 5:00 pm – 5:45 pm',
  'Wednesdays - 6pm': 'Wednesday 6:00 pm – 6:45 pm',
  'Saturday - 8am': 'Saturday 8:00 am – 8:45 am',
  'Saturday - 9am': 'Saturday 9:00 am – 9:45 am',
  'Saturday - 10am': 'Saturday 10:00 am – 10:45 am',
  'Sunday- 3pm': 'Sunday 3:00 pm – 3:45 pm',
  'Sunday- 4pm': 'Sunday 4:00 pm – 4:45 pm',
};

function normalizeSessionName(session?: string | null): string {
  if (!session) return '';
  let s = session.trim();
  if (!s) return '';
  return s.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s\b/i, (_m, day) => {
    return day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
  });
}

function parseDateString(str?: string | null): string | null {
  if (!str) return null;
  const s = str.trim();
  if (!s) return null;

  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  const match = s.match(/(?:[A-Za-z]+,\s*)?(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const mon = months[match[2].toLowerCase()];
    let yr = match[3];
    if (yr.length === 2) yr = '20' + yr;
    if (mon) return `${yr}-${mon}-${day}`;
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function requireAdminSession(): Promise<string> {
  try {
    const sysSession = await getSystemAdminSession();
    if (sysSession) return sysSession.email;
  } catch {}

  try {
    const supabase = await createSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, email')
        .eq('id', user.id)
        .single();

      if (profile?.role === 'admin') return profile.email ?? user.email ?? user.id;
    }
  } catch {}

  // Fallback for trusted server environments / CLI testing
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return 'system-admin';
  }

  throw new Error('Unauthorized - Admin authentication required');
}

export interface MigrationResult {
  success: boolean;
  message?: string;
  error?: string;
  details?: string;
  cubsCount?: number;
  attendanceCount?: number;
  presentCount?: number;
  absentCount?: number;
}

export async function migrateReadingCircleData(): Promise<MigrationResult> {
  const startTime = Date.now();
  let adminIdentifier = 'system';
  try {
    adminIdentifier = await requireAdminSession();
  } catch (authErr: any) {
    return { success: false, error: authErr.message || 'Unauthorized' };
  }

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    return { success: false, error: 'Google service account credentials missing in environment variables.' };
  }

  try {
    // 1. Initialize Google Sheets API
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // 2. Read "All Cubs" Tab
    const allCubsRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "'All Cubs'!A2:L250",
    });
    const allCubsRows = allCubsRes.data.values || [];

    interface CubRecord {
      cub_id: string;
      completion_date: string;
      selected_session: string;
      rc_category: string;
      weeks_active: number;
      no_present: number;
      last_attendance_date: string | null;
    }

    const cubsMap = new Map<string, CubRecord>();

    for (const row of allCubsRows) {
      const cubId = (row[3] || '').trim();
      if (!cubId || !cubId.startsWith('C')) continue;

      const compDate = parseDateString(row[0]) || '2026-06-01';
      const selectedSession = normalizeSessionName(row[6]);
      const rcCategory = (row[7] || '').trim();
      const weeksActive = parseInt(row[8] || '0', 10) || 0;
      const noPresent = parseInt(row[9] || '0', 10) || 0;
      const lastAttDate = parseDateString(row[11]);

      cubsMap.set(cubId, {
        cub_id: cubId,
        completion_date: compDate,
        selected_session: selectedSession,
        rc_category: rcCategory,
        weeks_active: weeksActive,
        no_present: noPresent,
        last_attendance_date: lastAttDate,
      });
    }

    // 3. Read All 9 Session Tabs
    interface AttendanceRecord {
      cub_id: string;
      session: string;
      attendance_date: string;
      status: 'Present' | 'Absent' | 'Rescheduled';
      recorded_by: string;
    }

    const attendanceRecords: AttendanceRecord[] = [];
    let presentCount = 0;
    let absentCount = 0;

    for (const [tabName, canonicalSession] of Object.entries(SESSION_MAP)) {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${tabName}'!A1:ZZ100`,
      });
      const rows = res.data.values || [];
      if (rows.length < 3) continue;

      const row0 = rows[0];
      const row1 = rows[1];

      // Identify attendance columns (groups of 3: CER Rep, Attendance, Feedback)
      const attCols: number[] = [];
      for (let c = 5; c < row1.length; c += 3) {
        const sub1 = (row1[c] || '').trim().toLowerCase();
        const sub2 = (row1[c + 1] || '').trim().toLowerCase();
        if (sub2 === 'attendance' || sub1 === 'cer rep') {
          attCols.push(c);
        }
      }

      // First pass: extract explicit dates
      const dateColMap: Record<number, string> = {};
      for (const c of attCols) {
        const explicit = parseDateString(row0[c] || row0[c + 1] || '');
        if (explicit) dateColMap[c] = explicit;
      }

      // Second pass: interpolate missing dates (weekly, 7-day intervals)
      for (let i = 0; i < attCols.length; i++) {
        const c = attCols[i];
        if (!dateColMap[c]) {
          let prevDate: string | null = null;
          let prevDist = 0;
          for (let j = i - 1; j >= 0; j--) {
            if (dateColMap[attCols[j]]) {
              prevDate = dateColMap[attCols[j]];
              prevDist = i - j;
              break;
            }
          }
          if (prevDate) {
            dateColMap[c] = addDays(prevDate, prevDist * 7);
          } else {
            let nextDate: string | null = null;
            let nextDist = 0;
            for (let j = i + 1; j < attCols.length; j++) {
              if (dateColMap[attCols[j]]) {
                nextDate = dateColMap[attCols[j]];
                nextDist = j - i;
                break;
              }
            }
            if (nextDate) dateColMap[c] = addDays(nextDate, -nextDist * 7);
          }
        }
      }

      // Parse cubs in this session
      for (let r = 2; r < rows.length; r++) {
        const row = rows[r];
        const cubId = (row[1] || '').trim();
        if (!cubId || !cubId.startsWith('C')) continue;

        // If cub is not in All Cubs tab (e.g. sibling), add them
        if (!cubsMap.has(cubId)) {
          const joinDate = parseDateString(row[0]) || '2026-06-01';
          let category = '';
          if (canonicalSession.includes('Sunday')) category = 'Word Astronauts - Sunday';
          else if (canonicalSession.includes('Saturday')) category = 'Word Astronauts - Saturday';
          else if (canonicalSession.includes('Tuesday')) category = 'Word Astronauts - Tuesday';
          else if (canonicalSession.includes('Wednesday')) category = 'Word Astronauts - Wednesday';

          cubsMap.set(cubId, {
            cub_id: cubId,
            completion_date: joinDate,
            selected_session: canonicalSession,
            rc_category: category,
            weeks_active: 0,
            no_present: 0,
            last_attendance_date: null,
          });
        }

        // Parse each attendance entry
        for (const c of attCols) {
          const repName = (row[c] || '').trim();
          const rawStatus = (row[c + 1] || '').trim();
          const date = dateColMap[c];
          if (!rawStatus || !date) continue;

          const normStatus = rawStatus.toLowerCase() === 'present' ? 'Present'
            : rawStatus.toLowerCase() === 'absent' ? 'Absent'
            : rawStatus.toLowerCase() === 'rescheduled' ? 'Rescheduled' : null;

          if (!normStatus) continue;

          attendanceRecords.push({
            cub_id: cubId,
            session: canonicalSession,
            attendance_date: date,
            status: normStatus,
            recorded_by: getRepUserId(repName),
          });

          if (normStatus === 'Present') presentCount++;
          if (normStatus === 'Absent') absentCount++;
        }
      }
    }

    // 4. Initialize Supabase Service Client
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const cubsList = Array.from(cubsMap.values());

    // 5. Upsert orientation records (161 records)
    const orientationPayload = cubsList.map(c => ({
      cub_id: c.cub_id,
      stage: 'Completed',
      stage_status: 'Completed',
      next_stage: null,
      completion_date: c.completion_date,
      invited_status: 'Yes',
      booked_status: 'Completed',
      booked_date: c.completion_date,
      attended_status: 'Present',
      attended_date: c.completion_date,
      first_win_status: 'Yes',
      first_win_date: c.completion_date,
      rc_selected_status: 'Completed',
      rc_selected_date: c.completion_date,
      session: c.selected_session,
      last_updated_by: FALLBACK_ADMIN_ID,
    }));

    const { error: oriError } = await supabase
      .from('orientation')
      .upsert(orientationPayload, { onConflict: 'cub_id' });

    if (oriError) {
      throw new Error(`Failed to upsert orientation: ${oriError.message}`);
    }

    // 6. Update cubs directory fields in parallel batches of 25
    const CUBS_CHUNK_SIZE = 25;
    for (let i = 0; i < cubsList.length; i += CUBS_CHUNK_SIZE) {
      const chunk = cubsList.slice(i, i + CUBS_CHUNK_SIZE);
      await Promise.all(
        chunk.map(c =>
          supabase
            .from('cubs')
            .update({
              orientation_stage: 'Completed',
              orientation_stage_status: 'Completed',
              orientation_next_stage: null,
              orientation_completion_date: c.completion_date,
              reading_circle_category: c.rc_category || null,
            })
            .eq('cub_id', c.cub_id)
        )
      );
    }

    // 7. Upsert reading_circle records
    const rcPayload = cubsList.map(c => ({
      cub_id: c.cub_id,
      selected_session: c.selected_session,
      rc_category: c.rc_category || null,
      weeks_active: c.weeks_active,
      no_present: c.no_present,
      last_attendance_date: c.last_attendance_date,
    }));

    const { error: rcError } = await supabase
      .from('reading_circle')
      .upsert(rcPayload, { onConflict: 'cub_id' });

    if (rcError) {
      throw new Error(`Failed to upsert reading_circle: ${rcError.message}`);
    }

    // 8. Upsert rc_attendance records in batches of 400
    // Deduplicate any accidental duplicates in attendanceRecords by (cub_id, attendance_date)
    const dedupedAttendanceMap = new Map<string, AttendanceRecord>();
    for (const rec of attendanceRecords) {
      const key = `${rec.cub_id}_${rec.attendance_date}`;
      dedupedAttendanceMap.set(key, rec);
    }
    const finalAttendance = Array.from(dedupedAttendanceMap.values());

    const BATCH_SIZE = 400;
    for (let i = 0; i < finalAttendance.length; i += BATCH_SIZE) {
      const chunk = finalAttendance.slice(i, i + BATCH_SIZE);
      const { error: attError } = await supabase
        .from('rc_attendance')
        .upsert(chunk, { onConflict: 'cub_id,attendance_date' });

      if (attError) {
        throw new Error(`Failed to upsert rc_attendance (chunk ${i}): ${attError.message}`);
      }
    }

    const durationMs = Date.now() - startTime;

    // 9. Audit log entry
    try {
      await supabase.from('audit_log').insert({
        action: 'MIGRATE_READING_CIRCLE',
        status: 'SUCCESS',
        user_id: adminIdentifier,
        details: `Migrated ${cubsList.length} cubs and ${finalAttendance.length} attendance records (${presentCount} Present, ${absentCount} Absent) in ${durationMs}ms`,
        duration_ms: durationMs,
        timestamp: new Date().toISOString(),
      });
    } catch { /* ignore audit insert error */ }

    // 10. Revalidate Next.js cache paths
    try {
      revalidatePath('/reading-circle');
      revalidatePath('/orientation');
      revalidatePath('/system-admin');
      revalidatePath('/directory');
    } catch { /* ignore outside request context */ }

    return {
      success: true,
      message: `Successfully migrated ${cubsList.length} cubs and ${finalAttendance.length} attendance records.`,
      details: `${cubsList.length} cubs enrolled • ${finalAttendance.length} attendance logs (${presentCount} Present, ${absentCount} Absent)`,
      cubsCount: cubsList.length,
      attendanceCount: finalAttendance.length,
      presentCount,
      absentCount,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      error: err.message || 'Unknown error occurred during migration',
      details: `Failed after ${durationMs}ms`,
    };
  }
}

# CERO TRACKER — MIGRATION ARCHITECTURE & IMPLEMENTATION PLAN

---

## 1. TARGET ARCHITECTURE

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Frontend** | Next.js 15 (App Router) + React 19 + TypeScript | SSR/SSG, RSC, streaming, Turbopack, Server Actions |
| **State** | TanStack Query v5 (server state) + Zustand (client UI state) | Replaces manual cache/invalidation, built-in optimistic updates, real-time via Supabase Realtime |
| **Auth** | Supabase Auth (email/password) + Row Level Security | Managed sessions, password reset, MFA-ready, replaces custom token system |
| **Database** | Supabase (PostgreSQL 16) | Relational, RLS, Realtime, pg_cron, functions, extensions |
| **API** | Next.js Server Actions + Route Handlers | Type-safe end-to-end, replaces `google.script.run` RPC |
| **Background Jobs** | Supabase Edge Functions (Deno) + pg_cron | Replaces time-driven triggers, resume logic, form webhooks |
| **Cache** | Upstash Redis (global) + Supabase Realtime subscriptions | Replaces Apps Script CacheService, shared across Vercel instances |
| **File Storage** | Supabase Storage | For future file uploads |
| **Observability** | Sentry (errors) + Supabase Logs + custom `audit_log` table | Replaces Log sheet |
| **Deployment** | Vercel (frontend) + Supabase (db/auth/storage/realtime) | Git-based, preview deployments, instant rollback |
| **Rate Limiting** | Upstash Redis + `@upstash/ratelimit` at Edge | Per-IP / per-user tiers, protects auth & paid endpoints |

### Architecture Diagram
```
┌─────────────┐     HTTPS      ┌──────────────────┐
│   Browser   │ ◄─────────────► │   Vercel Edge    │
│  (Next.js)  │                │  (Server Actions,│
└──────┬──────┘                │   Route Handlers)│
       │                       └────────┬─────────┘
       │                                │
       │ Supabase Realtime              │ Supabase Client
       │ (WebSocket)                    │ (PostgREST)
       ▼                                ▼
┌──────────────────┐          ┌──────────────────┐
│  Supabase Realtime│          │  Supabase (PG)   │
│  (Publications)   │          │  ┌────────────┐  │
└──────────────────┘          │  │ Tables + RLS│  │
                              │  │ Functions  │  │
                              │  │ pg_cron    │  │
                              │  └────────────┘  │
                              └────────┬─────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
             ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
             │ Upstash     │    │ Supabase    │    │ Supabase    │
             │ Redis       │    │ Auth        │    │ Storage     │
             │ (Rate limit,│    │ (Users,     │    │ (Files)     │
             │  Cache)     │    │  Sessions)  │    │             │
             └─────────────┘    └─────────────┘    └─────────────┘
```

---

## 2. APPS SCRIPT → NEXT.JS MAPPING

| Existing System | New System |
|-----------------|------------|
| Google Sheet (14 tabs) | PostgreSQL tables (normalized) |
| Apps Script `.gs` functions | Server Actions / Route Handlers / Edge Functions |
| `HtmlService` (Index.html + App.html) | Next.js App Router (RSC + Client Components) |
| Script Properties | Vercel Environment Variables + Supabase `config` table |
| CacheService (Script Cache) | Upstash Redis (global, shared) + TanStack Query cache |
| LockService (Script Lock) | PostgreSQL `SELECT ... FOR UPDATE` / Advisory Locks / Optimistic Locking |
| Time-driven Triggers | `pg_cron` + Supabase Edge Functions (scheduled) |
| Form Submit Triggers | Google Forms → Webhook → Supabase Edge Function → `pending_signups` table |
| `doGet`/`doPost` | Next.js Route Handlers (`/api/*`) |
| User permissions (Config tab J-M) | Supabase Auth `users` + `profiles` table + RLS |
| Session tokens (CacheService) | Supabase Auth JWT (access token + refresh token) |
| Spreadsheet formulas | Computed columns / Materialized views / Application logic |
| Sheet filters/sorts | SQL `WHERE` / `ORDER BY` / Indexes |
| Apps Script validation | Zod schemas (shared client/server) |
| Log sheet | `audit_log` table + Sentry |

---

## 3. DATABASE DESIGN (PostgreSQL Schema)

### 3.1 Core Tables

```sql
-- ============================================================
-- USERS & AUTH (Supabase Auth + extended profile)
-- ============================================================
-- auth.users managed by Supabase Auth
-- We extend with a profiles table for role, name, etc.

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('rep', 'admin')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: Users see own profile, admins see all
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Admins can insert/update profiles" ON public.profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- MASTER (Source of Truth - synced from external sheet)
-- ============================================================
CREATE TABLE public.master_cubs (
  id BIGSERIAL PRIMARY KEY,
  cub_id TEXT NOT NULL UNIQUE, -- Format: C + 14 digits (15 chars)
  cub_first_name TEXT NOT NULL,
  cub_last_name TEXT NOT NULL,
  gender TEXT,
  date_of_birth DATE,
  grade TEXT,
  stream TEXT,
  school_code TEXT,
  school_name TEXT,
  sub_start_date DATE,
  sub_end_date DATE,
  sub_status TEXT NOT NULL CHECK (sub_status IN ('active', 'almost expiring', 'expired')),
  parent_first_name TEXT,
  parent_last_name TEXT,
  parent_email TEXT,
  parent_phone TEXT, -- Stored as 233XXXXXXXXX (no +)
  parent_whatsapp TEXT,
  segment TEXT NOT NULL CHECK (segment IN ('Gen. Comm', 'CDLS', 'RCS')),
  total_subscriptions INTEGER DEFAULT 0,
  update_history TEXT,
  rep_name TEXT NOT NULL, -- Relationship Owner
  external_synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_master_cubs_rep ON public.master_cubs(rep_name);
CREATE INDEX idx_master_cubs_segment ON public.master_cubs(segment);
CREATE INDEX idx_master_cubs_sub_status ON public.master_cubs(sub_status);
CREATE INDEX idx_master_cubs_parent_phone ON public.master_cubs(parent_phone);
CREATE INDEX idx_master_cubs_parent_email ON public.master_cubs(parent_email);

-- ============================================================
-- FAMILIES (Aggregated per parent)
-- ============================================================
CREATE TABLE public.families (
  id BIGSERIAL PRIMARY KEY,
  parent_phone TEXT, -- 233XXXXXXXXX
  parent_email TEXT,
  parent_first_name TEXT NOT NULL,
  parent_last_name TEXT NOT NULL,
  parent_whatsapp TEXT,
  no_cubs INTEGER DEFAULT 0,
  relationship_owner TEXT NOT NULL, -- Rep name
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (parent_phone, parent_email) -- Composite unique for upsert
);

CREATE INDEX idx_families_owner ON public.families(relationship_owner);

-- ============================================================
-- CUBS (Enriched working table)
-- ============================================================
CREATE TABLE public.cubs (
  id BIGSERIAL PRIMARY KEY,
  cub_id TEXT NOT NULL UNIQUE REFERENCES public.master_cubs(cub_id) ON DELETE CASCADE,
  date_onboarded DATE NOT NULL,
  segment TEXT NOT NULL,
  gender TEXT,
  grade TEXT,
  stream TEXT,
  school_name TEXT,
  sub_start_date DATE,
  sub_end_date DATE,
  no_sub_days INTEGER,
  sub_status TEXT NOT NULL CHECK (sub_status IN ('active', 'almost expiring', 'expired')),
  -- Registry enrichment
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  streak_label TEXT,
  current_league TEXT,
  medallion_status TEXT,
  flag TEXT,
  cumulative_points BIGINT DEFAULT 0,
  cumulative_weekly_points BIGINT DEFAULT 0,
  last_reading_activity DATE,
  -- Reading Circle enrichment
  reading_circle_category TEXT,
  no_present INTEGER DEFAULT 0,
  last_attendance_date DATE,
  -- Orientation enrichment
  orientation_stage TEXT,
  orientation_stage_status TEXT,
  orientation_next_stage TEXT,
  orientation_completion_date DATE,
  -- Engagement tracking
  last_engagement_activity TIMESTAMPTZ,
  handled_by_last TEXT,
  purpose_last TEXT,
  relationship_owner TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cubs_owner ON public.cubs(relationship_owner);
CREATE INDEX idx_cubs_segment ON public.cubs(segment);
CREATE INDEX idx_cubs_sub_status ON public.cubs(sub_status);
CREATE INDEX idx_cubs_orientation_stage ON public.cubs(orientation_stage);
CREATE INDEX idx_cubs_rc_category ON public.cubs(reading_circle_category);
CREATE INDEX idx_cubs_flag ON public.cubs(flag) WHERE flag IS NOT NULL;

-- ============================================================
-- INTERACTIONS (Append-only log)
-- ============================================================
CREATE TABLE public.interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id UUID NOT NULL DEFAULT gen_random_uuid(), -- For compatibility
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  parent_first_name TEXT NOT NULL,
  parent_last_name TEXT NOT NULL,
  cub_id TEXT NOT NULL REFERENCES public.master_cubs(cub_id) ON DELETE RESTRICT,
  cub_first_name TEXT NOT NULL,
  cub_last_name TEXT NOT NULL,
  handled_by TEXT NOT NULL,
  type TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT,
  feedback TEXT,
  action_required TEXT NOT NULL CHECK (action_required IN ('Yes', 'No')) DEFAULT 'No',
  action TEXT,
  action_deadline DATE,
  action_status TEXT,
  logged_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_interactions_cub ON public.interactions(cub_id);
CREATE INDEX idx_interactions_date ON public.interactions(date DESC);
CREATE INDEX idx_interactions_handled_by ON public.interactions(handled_by);
CREATE INDEX idx_interactions_action_required ON public.interactions(action_required) WHERE action_required = 'Yes';
CREATE INDEX idx_interactions_logged_by ON public.interactions(logged_by);

-- ============================================================
-- ACTIONS (Action queue derived from interactions)
-- ============================================================
CREATE TABLE public.actions (
  id BIGSERIAL PRIMARY KEY,
  interaction_id UUID NOT NULL REFERENCES public.interactions(interaction_id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL,
  parent_first_name TEXT NOT NULL,
  parent_last_name TEXT NOT NULL,
  cub_id TEXT NOT NULL REFERENCES public.master_cubs(cub_id) ON DELETE RESTRICT,
  cub_first_name TEXT NOT NULL,
  cub_last_name TEXT NOT NULL,
  handled_by TEXT NOT NULL,
  type TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT,
  feedback TEXT,
  action_required TEXT NOT NULL CHECK (action_required IN ('Yes', 'No')),
  action TEXT NOT NULL,
  action_deadline DATE,
  action_status TEXT NOT NULL DEFAULT 'Pending',
  overdue_status TEXT GENERATED ALWAYS AS (
    CASE 
      WHEN action_deadline IS NULL THEN 'No'
      WHEN action_deadline < CURRENT_DATE THEN 'Yes'
      ELSE 'No'
    END
  ) STORED,
  logged_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_actions_cub ON public.actions(cub_id);
CREATE INDEX idx_actions_deadline ON public.actions(action_deadline) WHERE action_status NOT IN ('Completed', 'Cancelled');
CREATE INDEX idx_actions_status ON public.actions(action_status);
CREATE INDEX idx_actions_overdue ON public.actions(overdue_status) WHERE overdue_status = 'Yes';
CREATE INDEX idx_actions_relationship_owner ON public.actions(handled_by); -- For cover page

-- ============================================================
-- READING CIRCLE (Normalized - no dynamic columns)
-- ============================================================
CREATE TABLE public.reading_circle (
  id BIGSERIAL PRIMARY KEY,
  cub_id TEXT NOT NULL UNIQUE REFERENCES public.master_cubs(cub_id) ON DELETE CASCADE,
  selected_session TEXT NOT NULL,
  rc_category TEXT,
  weeks_active INTEGER DEFAULT 0,
  no_present INTEGER DEFAULT 0,
  last_attendance_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.rc_attendance (
  id BIGSERIAL PRIMARY KEY,
  cub_id TEXT NOT NULL REFERENCES public.master_cubs(cub_id) ON DELETE CASCADE,
  session TEXT NOT NULL,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'Rescheduled')),
  recorded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (cub_id, attendance_date)
);

CREATE INDEX idx_rc_attendance_cub_date ON public.rc_attendance(cub_id, attendance_date DESC);
CREATE INDEX idx_rc_attendance_session_date ON public.rc_attendance(session, attendance_date);

-- ============================================================
-- ORIENTATION (One row per cub + blocks)
-- ============================================================
CREATE TABLE public.orientation (
  id BIGSERIAL PRIMARY KEY,
  cub_id TEXT NOT NULL UNIQUE REFERENCES public.master_cubs(cub_id) ON DELETE CASCADE,
  session TEXT NOT NULL CHECK (session IN ('Tuesday', 'Sunday')),
  stage TEXT CHECK (stage IN ('Booked', 'Attended', 'RC Selected', 'First Win Sent', 'Completed')),
  stage_status TEXT,
  next_stage TEXT,
  completion_date DATE,
  -- Block 1: Invited
  invited_status TEXT CHECK (invited_status IN ('Yes', 'No')),
  -- Block 2: Booked
  booked_date DATE,
  booked_status TEXT CHECK (booked_status IN ('Completed')),
  -- Block 3: Attended
  attended_date DATE,
  attended_status TEXT CHECK (attended_status IN ('Present', 'Absent', 'Rescheduled')),
  attended_feedback TEXT,
  -- Block 4: First Win
  first_win_date DATE,
  first_win_status TEXT CHECK (first_win_status IN ('Yes', 'No')),
  first_win_feedback TEXT,
  -- Block 5: RC Selected
  rc_selected_date DATE,
  rc_selected_status TEXT CHECK (rc_selected_status IN ('Pending', 'Completed')),
  rc_selected_feedback TEXT,
  -- Optimistic locking
  version_ts BIGINT NOT NULL DEFAULT 0, -- Unix milliseconds
  last_updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- PENDING SIGNUPS (Unified for RC + Orientation)
-- ============================================================
CREATE TABLE public.pending_signups (
  id BIGSERIAL PRIMARY KEY,
  pending_id UUID NOT NULL DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  form_source TEXT NOT NULL CHECK (form_source IN ('Reading Circle Signup', 'Orientation Signup')),
  parent_name TEXT NOT NULL,
  parent_phone TEXT NOT NULL, -- 233XXXXXXXXX
  cub_name TEXT NOT NULL,
  library_card TEXT, -- Cub ID from form
  selected_session TEXT,
  grade TEXT,
  matched_cub_id TEXT REFERENCES public.master_cubs(cub_id),
  match_confidence TEXT NOT NULL CHECK (match_confidence IN ('High', 'Medium', 'Low', 'None')),
  confirmed_by UUID REFERENCES auth.users(id),
  confirmed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Confirmed', 'Rejected')) DEFAULT 'Pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pending_status ON public.pending_signups(status);
CREATE INDEX idx_pending_form_source ON public.pending_signups(form_source);
CREATE INDEX idx_pending_parent_phone ON public.pending_signups(parent_phone);

-- ============================================================
-- HANDOVER NOTES
-- ============================================================
CREATE TABLE public.handover_notes (
  id BIGSERIAL PRIMARY KEY,
  note_id UUID NOT NULL DEFAULT gen_random_uuid(),
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  logged_by UUID NOT NULL REFERENCES auth.users(id),
  summary TEXT NOT NULL,
  pending_issues TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_handover_logged_by ON public.handover_notes(logged_by);
CREATE INDEX idx_handover_date ON public.handover_notes(date DESC);

-- ============================================================
-- EMAIL HISTORY (Wide table - keep as-is for compatibility)
-- ============================================================
CREATE TABLE public.email_history (
  id BIGSERIAL PRIMARY KEY,
  cub_id TEXT NOT NULL REFERENCES public.master_cubs(cub_id) ON DELETE CASCADE,
  msg_1_date DATE,
  msg_1_type TEXT,
  msg_2_date DATE,
  msg_2_type TEXT,
  msg_3_date DATE,
  msg_3_type TEXT,
  msg_4_date DATE,
  msg_4_type TEXT,
  msg_5_date DATE,
  msg_5_type TEXT,
  msg_6_date DATE,
  msg_6_type TEXT,
  msg_7_date DATE,
  msg_7_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- CONFIG (Dropdowns + Settings)
-- ============================================================
CREATE TABLE public.config_dropdowns (
  id BIGSERIAL PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('handled_by', 'type', 'purpose', 'status', 'action_status', 'orientation_stages')),
  value TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (category, value)
);

-- ============================================================
-- AUDIT LOG (Replaces Log sheet)
-- ============================================================
CREATE TABLE public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'ERROR', 'WARNING', 'INFO')),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  details JSONB,
  duration_ms INTEGER,
  ip_address INET
);

CREATE INDEX idx_audit_timestamp ON public.audit_log(timestamp DESC);
CREATE INDEX idx_audit_user ON public.audit_log(user_id);
CREATE INDEX idx_audit_action ON public.audit_log(action);

-- ============================================================
-- SYNC STATE (For external sheet sync resume)
-- ============================================================
CREATE TABLE public.sync_state (
  id BIGSERIAL PRIMARY KEY,
  sync_type TEXT NOT NULL UNIQUE, -- 'master', 'registry', 'score_calendar'
  last_processed_row INTEGER DEFAULT 0,
  processed_count INTEGER DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('idle', 'running', 'completed', 'failed')),
  last_run_at TIMESTAMPTZ,
  error_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.2 RLS Policies (Critical for Multi-Rep Security)

```sql
-- Master Cubs: Admins see all, Reps see only their own
ALTER TABLE public.master_cubs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.master_cubs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Rep owns cubs" ON public.master_cubs FOR SELECT
  USING (rep_name = (SELECT full_name FROM public.profiles WHERE id = auth.uid()));

-- Cubs table: Same as master
ALTER TABLE public.cubs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.cubs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Rep owns cubs" ON public.cubs FOR SELECT
  USING (relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Rep updates own cubs" ON public.cubs FOR UPDATE
  USING (relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid()));

-- Families: Admins see all, Reps see only their own
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.families FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Rep owns families" ON public.families FOR SELECT
  USING (relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid()));

-- Interactions: Admins see all, Reps see interactions on their cubs OR logged by them
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.interactions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Rep sees own cubs interactions" ON public.interactions FOR SELECT
  USING (
    cub_id IN (SELECT cub_id FROM public.cubs WHERE relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid()))
    OR logged_by = auth.uid()
  );
CREATE POLICY "Rep inserts interactions" ON public.interactions FOR INSERT
  WITH CHECK (true); -- UI enforces cub ownership, but allow cross-rep logging via searchAll

-- Actions: Same as interactions (action belongs to cub relationship)
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.actions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Rep sees own cubs actions" ON public.actions FOR SELECT
  USING (
    cub_id IN (SELECT cub_id FROM public.cubs WHERE relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid()))
  );
CREATE POLICY "Cover page sees all" ON public.actions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')); -- Cover page is admin-only in practice

-- Reading Circle: Admins see all, Reps see Gen. Comm segment only (per current logic)
ALTER TABLE public.reading_circle ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.reading_circle FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Rep sees Gen Comm" ON public.reading_circle FOR SELECT
  USING (
    cub_id IN (SELECT cub_id FROM public.cubs WHERE relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid()) AND segment = 'Gen. Comm')
  );

-- Orientation: Same as Reading Circle
ALTER TABLE public.orientation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.orientation FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Rep sees Gen Comm" ON public.orientation FOR SELECT
  USING (
    cub_id IN (SELECT cub_id FROM public.cubs WHERE relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid()) AND segment = 'Gen. Comm')
  );

-- Pending Signups: Admins see all, Reps see only Pending for their segment
ALTER TABLE public.pending_signups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.pending_signups FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Rep sees pending for own segment" ON public.pending_signups FOR SELECT
  USING (
    status = 'Pending'
    AND (
      form_source = 'Reading Circle Signup' AND matched_cub_id IN (
        SELECT cub_id FROM public.cubs WHERE relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid()) AND segment = 'Gen. Comm'
      )
      OR
      form_source = 'Orientation Signup' AND matched_cub_id IN (
        SELECT cub_id FROM public.cubs WHERE relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid()) AND segment = 'Gen. Comm'
      )
    )
  );

-- Handover Notes: Users see only their own, Admins see all
ALTER TABLE public.handover_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.handover_notes FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "User sees own notes" ON public.handover_notes FOR SELECT
  USING (logged_by = auth.uid());
CREATE POLICY "User inserts own notes" ON public.handover_notes FOR INSERT
  WITH CHECK (logged_by = auth.uid());
CREATE POLICY "User updates own notes" ON public.handover_notes FOR UPDATE
  USING (logged_by = auth.uid());

-- Config Dropdowns: Admins manage, all authenticated users read
ALTER TABLE public.config_dropdowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated read" ON public.config_dropdowns FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Admin manages" ON public.config_dropdowns FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
```

### 3.3 Helper Functions & Triggers

```sql
-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER set_master_cubs_updated_at BEFORE UPDATE ON public.master_cubs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
-- Repeat for all tables with updated_at

-- Increment version_ts on orientation update (optimistic locking)
CREATE OR REPLACE FUNCTION public.increment_orientation_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.version_ts = EXTRACT(EPOCH FROM now()) * 1000; -- Unix ms
  NEW.last_updated_by = auth.uid();
  RETURN NEW;
END $$;

CREATE TRIGGER orientation_version_ts BEFORE UPDATE ON public.orientation
  FOR EACH ROW EXECUTE FUNCTION public.increment_orientation_version();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 'rep');
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Realtime publications
ALTER PUBLICATION supabase_realtime ADD TABLE 
  public.cubs,
  public.actions,
  public.interactions,
  public.reading_circle,
  public.orientation,
  public.pending_signups,
  public.handover_notes;
```

---

## 4. PERFORMANCE ARCHITECTURE

### Query Strategy
- **Server-side filtering**: All filtering/sorting/pagination in SQL, not client-side
- **Indexes**: Every filtered column indexed (see schema above)
- **Pagination**: Keyset pagination (cursor-based) for large tables, offset for small
- **Realtime**: Subscribe to `cubs`, `actions`, `interactions`, `pending_signups` for instant UI updates
- **Caching**: 
  - TanStack Query: 5-min staleTime, 10-min gcTime
  - Upstash Redis: Dashboard stats (2-min), dropdowns (1-hr), search index (1-hr)
  - Invalidate on mutation via `queryClient.invalidateQueries()`

### Data Volume Projections
| Table | Current | 6-Month | Index Strategy |
|-------|---------|---------|----------------|
| master_cubs | 3,000 | 9,000 | B-tree on cub_id, rep_name, segment, sub_status, parent_phone |
| cubs | 3,000 | 9,000 | Same + orientation_stage, rc_category, flag |
| interactions | ~2,000 | ~10,000/yr | cub_id, date DESC, handled_by, logged_by |
| actions | ~500 | ~2,000 | cub_id, action_deadline (partial), action_status |
| rc_attendance | New | ~5,000/yr | (cub_id, attendance_date), (session, attendance_date) |
| pending_signups | ~50 | ~200 | status, form_source, parent_phone |

All well within single-node PostgreSQL capacity. Read replicas only needed if >50k concurrent reads.

---

## 5. CONCURRENCY STRATEGY

| Operation | Mechanism |
|-----------|-----------|
| **Cub updates (interactions, engagement)** | `SELECT ... FOR UPDATE` on `cubs` row → update → commit (short transaction) |
| **Orientation stage/blocks** | Optimistic locking: `version_ts` column, `WHERE version_ts = $client_version` |
| **Pending signup confirm** | `SELECT ... FOR UPDATE SKIP LOCKED` on pending row → delete/confirm |
| **RC Attendance** | Upsert on `rc_attendance` (unique constraint) + `cubs` update in same transaction |
| **Daily Sync** | Advisory lock `pg_advisory_xact_lock(hashtext('daily_sync'))` prevents overlap |
| **Form Webhook** | Idempotency key = form response ID → `ON CONFLICT DO NOTHING` on `pending_signups` |

---

## 6. UI MIGRATION PLAN

### Page Structure (Next.js App Router)
```
/                          → Redirect to /dashboard
/login                     → Login page (Server Component + Client Form)
/dashboard                 → Dashboard (RSC + Client Components for tables)
/engagements               → Engagements (Tabs: Actions / Interactions)
/directory                 → Directory (Tabs: Cubs / Families)
/orientation               → Orientation (Tabs: Pending / Master / Sessions)
/reading-circle            → Reading Circle (Tabs: Pending / Roster)
/shift-actions             → Shift Actions (Cover page)
/handover                  → Handover Notes
/settings                  → Settings (Admin only: Dropdowns / Users)
```

### Component Architecture
```
app/
├── layout.tsx                    → Providers (Session, Query, Theme)
├── page.tsx                      → Redirect
├── login/page.tsx                → Login (Server)
├── (auth)/                       → Route group with auth middleware
│   ├── dashboard/
│   │   ├── page.tsx              → RSC: fetches stats, actions, cubs, families
│   │   ├── DashboardClient.tsx   → Client: tables, filters, drawers
│   │   └── components/
│   ├── engagements/
│   ├── directory/
│   ├── orientation/
│   ├── reading-circle/
│   ├── shift-actions/
│   ├── handover/
│   └── settings/
├── api/
│   ├── auth/                     → Supabase Auth helpers
│   ├── webhooks/
│   │   └── forms/                → Google Forms webhook endpoint
│   └── sync/                     → Manual sync triggers (admin)
├── components/
│   ├── ui/                       → Base components (Button, Input, Table, Drawer, Modal, Badge, Toast)
│   ├── forms/                    → InteractionForm, OrientationBlocks, RCAttendance, etc.
│   ├── tables/                   → DataTable (virtualized, sortable, filterable)
│   └── layout/                   → Sidebar, Header, SplashScreen
├── lib/
│   ├── supabase/
│   │   ├── server.ts             → Server client (cookies)
│   │   ├── client.ts             → Browser client
│   │   └── middleware.ts         → Auth refresh
│   ├── queries/                  → TanStack Query keys & fetchers
│   ├── mutations/                → Server Actions (mutations)
│   ├── validations/              → Zod schemas
│   ├── utils/                    → Date formatting, phone normalization, etc.
│   └── constants/                → RC_SESSIONS, STAGE_ORDER, etc.
└── hooks/                        → Custom hooks (useDebounce, usePagination, etc.)
```

### Key UI Decisions
- **Exact visual parity**: Lexend font, Lucide icons, CSS custom properties (light/dark), drawer patterns, skeleton loading
- **Drawers**: Right-slide (Interaction, Cub, Family, Handover), Left-slide (Stat drill-down), Center modals (Confirm, User)
- **Tables**: TanStack Table v8 (virtualized, sortable, filterable, paginated)
- **Forms**: React Hook Form + Zod validation
- **Real-time**: Supabase Realtime subscriptions on key tables → TanStack Query `setQueryData` for instant updates

---

## 7. DATA MIGRATION PLAN

**Decision**: No historical data migration (per clarification #5). Fresh start.

### Sync from External Sheets (Ongoing)
| Source | Target | Method | Frequency |
|--------|--------|--------|-----------|
| Master Source (B2) | `master_cubs` | Supabase Edge Function + `pg_cron` | Daily 6 AM |
| Cubs Registry (B3) | `cubs` (registry fields) | Same function | Daily 6 AM |
| Score Calendar (B3) | `cubs` (weekly points, last reading) | Same function | Daily 6 AM |

### Sync Implementation
```typescript
// Supabase Edge Function: sync-master-cubs
// 1. Fetch external Master sheet via Google Sheets API (service account)
// 2. Upsert into master_cubs (ON CONFLICT cub_id DO UPDATE)
// 3. Trigger Cubs enrichment (registry + score + local RC + local Orientation)
// 4. Recompute families aggregation
// 5. Invalidate TanStack Query caches via Upstash Redis pub/sub
```

### Google Forms → Pending Signups
```typescript
// Route Handler: POST /api/webhooks/forms
// 1. Verify webhook signature (Google Forms doesn't sign — use shared secret in header)
// 2. Parse response (same logic as FormHandler.gs)
// 3. Build phone index from master_cubs (cached in Redis)
// 4. Auto-match → insert into pending_signups
// 5. Realtime publishes new pending row → UI updates instantly
```

---

## 8. TESTING STRATEGY

| Layer | Tool | Coverage |
|-------|------|----------|
| **Unit** | Vitest | Business logic (date calc, RC category, orientation stage, phone normalize, matching) |
| **Integration** | Vitest + Supabase Local | Server Actions, RLS policies, database functions, migrations |
| **E2E** | Playwright | Critical flows: Login → Dashboard → Log Interaction → Follow-up → Orientation → RC Attendance |
| **Regression** | Custom parity suite | Compare new API outputs vs Apps Script for same inputs (run against staging) |
| **Concurrency** | Artillery / k6 | 10-20 concurrent users: submit interactions, update orientation, confirm pending |
| **Performance** | k6 + Supabase pg_stat_statements | P95 < 200ms for reads, < 500ms for writes under load |
| **Edge Cases** | Vitest | Empty states, duplicate cub IDs, network failure retry, optimistic lock conflict |

### Test Data Fixtures
- Seed script: 100 cubs, 50 families, 200 interactions, 50 actions, 20 orientation, 30 RC, 10 pending

---

## 9. IMPLEMENTATION PHASES

### Phase A: Foundation (Week 1)
- [ ] Next.js 15 + TypeScript + Tailwind (or CSS Modules matching current design system)
- [ ] Supabase project: Auth, DB, Realtime, Storage, Edge Functions
- [ ] Vercel project + GitHub integration
- [ ] Environment variables (3 envs: local, staging, prod)
- [ ] `middleware.ts` (auth refresh, role check)
- [ ] Base UI components (Button, Input, Select, Table, Drawer, Modal, Toast, Badge, Skeleton)
- [ ] Theme provider (light/dark, localStorage sync)
- [ ] TanStack Query + Supabase client setup

### Phase B: Authentication & Authorization (Week 1-2)
- [ ] Login page (Server Component + Client Form)
- [ ] Supabase Auth email/password + password reset flow
- [ ] `profiles` table + RLS + trigger on signup
- [ ] Role-based redirects (Admin → /settings, Rep → /dashboard)
- [ ] Session persistence + logout
- [ ] Admin user creation script

### Phase C: Database Schema & Migrations (Week 2)
- [ ] All tables, indexes, RLS policies, functions, triggers
- [ ] Supabase Realtime publications
- [ ] `pg_cron` jobs for daily sync
- [ ] Seed script for dev/staging

### Phase D: Core Read APIs (Week 2-3)
- [ ] Server Actions: `getDashboardStats`, `getDashboardActions`, `getDashboardCubs`, `getDashboardFamilies`
- [ ] TanStack Query hooks with 5-min staleTime
- [ ] Real-time subscriptions for `cubs`, `actions`, `interactions`, `pending_signups`
- [ ] Admin filter (rep dropdown) → passes to all queries

### Phase E: Dashboard Page (Week 3)
- [ ] Stats cards (overview + scorecards + priorities)
- [ ] Actions table (paginated, filterable, clickable → drawer)
- [ ] Real-time updates via Supabase Realtime
- [ ] Splash/skeleton loading

### Phase F: Engagements Page (Week 3-4)
- [ ] Actions tab (full list, follow-up drawer)
- [ ] Interactions tab (search, filters, edit/delete drawer)
- [ ] Real-time

### Phase G: Directory Page (Week 4)
- [ ] Cubs table (21 cols, search, filters, clickable → drawer)
- [ ] Families table (search, clickable → drawer)
- [ ] Cub Drawer: Profile, Engagement History, Email History, Orientation, RC, Interactions tabs

### Phase H: Orientation Page (Week 4-5)
- [ ] Pending tab (search, filter, confirm/reject drawer)
- [ ] Master Journey table (search, stage filter)
- [ ] Sessions tab (session + stage filter)
- [ ] Orientation Journey Drawer (block checklist, optimistic lock via version_ts)
- [ ] Real-time

### Phase I: Reading Circle Page (Week 5)
- [ ] Pending tab (same as orientation)
- [ ] RC Roster table (search, session filter, category filter)
- [ ] Mark Attendance Drawer (date picker, session filter, Present/Absent/Rescheduled per cub)
- [ ] Change Session Drawer (recomputes category from grade)
- [ ] Real-time

### Phase J: Shift Actions (Cover) Page (Week 5)
- [ ] All reps' pending actions (search, rep filter, dynamic filters)
- [ ] Log Interaction button per row
- [ ] Real-time

### Phase K: Handover Notes (Week 5)
- [ ] Notes table (search, rep filter)
- [ ] Log Note Drawer (create/edit own only)
- [ ] Real-time

### Phase L: Settings Page - Admin Only (Week 5-6)
- [ ] Dropdowns tab (sync reps from master, edit 6 dropdown categories, save)
- [ ] Users tab (CRUD users: name, role, email, password)
- [ ] Real-time

### Phase M: External Sync & Forms (Week 6)
- [ ] Supabase Edge Function: Daily Master Sync (Google Sheets API → upsert master_cubs → enrich cubs)
- [ ] Supabase Edge Function: Registry + Score Calendar enrichment
- [ ] Route Handler: Google Forms webhook → pending_signups
- [ ] `pg_cron` scheduling (6 AM sync, 1 AM form date refresh)
- [ ] Form date refresh: Update Google Form choices via Forms API

### Phase N: Observability & Hardening (Week 6)
- [ ] Sentry integration (client + server)
- [ ] `audit_log` table + helper (replaces `writeLog`)
- [ ] Rate limiting (Upstash): Auth (5/5min), API (100/min), Sync (1/min)
- [ ] Error boundaries + fallback UI
- [ ] CSP headers, security headers

### Phase O: Testing & Parity Verification (Week 7)
- [ ] Unit tests (target 80%+ on lib/)
- [ ] Integration tests (all Server Actions, RLS)
- [ ] E2E tests (10 critical flows)
- [ ] Concurrency tests (10 concurrent users)
- [ ] Performance tests (k6, 50 VUs)
- [ ] Parity verification: Compare key outputs vs Apps Script on same data
- [ ] Load test: 100 concurrent, 9,000 cubs

### Phase P: Deployment & Cutover (Week 7-8)
- [ ] Staging deployment → UAT with 2-3 reps
- [ ] Production deployment
- [ ] DNS cutover
- [ ] Apps Script deprecation (keep read-only for 30 days)
- [ ] Post-launch monitoring (Sentry, Supabase dashboards)

---

## 10. FEATURE PARITY MATRIX (Initial)

| ID | Existing Feature | Apps Script Location | New Location | Status |
|----|------------------|---------------------|--------------|--------|
| F001 | Login/Session | Auth.gs | Supabase Auth + `/login` | Planned |
| F002 | Dashboard Stats | DashboardData.gs | `getDashboardStats` action | Planned |
| F003 | Dashboard Actions Table | DashboardData.gs + App.html | Dashboard page | Planned |
| F004 | Log Interaction | DashboardWrite.gs + App.html | Interaction Drawer + `submitInteraction` action | Planned |
| F005 | Action Follow-up | DashboardWrite.gs + App.html | Action Follow-up Drawer | Planned |
| F006 | Delete Interaction | DashboardWrite.gs + App.html | Interaction Drawer delete | Planned |
| F007 | Edit Interaction | DashboardWrite.gs + App.html | Interaction Drawer edit | Planned |
| F008 | Engagements - Actions | DashboardData.gs + App.html | Engagements page | Planned |
| F009 | Engagements - Interactions | DashboardData.gs + App.html | Engagements page | Planned |
| F010 | Directory - Cubs | DashboardData.gs + App.html | Directory page | Planned |
| F011 | Directory - Families | DashboardData.gs + App.html | Directory page | Planned |
| F012 | Cub Drawer (full) | App.html | Cub Drawer component | Planned |
| F013 | Family Drawer | App.html | Family Drawer component | Planned |
| F014 | Orientation - Pending | DashboardData.gs + App.html | Orientation page | Planned |
| F015 | Orientation - Master Journey | DashboardData.gs + App.html | Orientation page | Planned |
| F016 | Orientation - Sessions | DashboardData.gs + App.html | Orientation page | Planned |
| F017 | Orientation Journey Drawer | DashboardWrite.gs + App.html | Orientation Drawer | Planned |
| F018 | Reading Circle - Pending | DashboardData.gs + App.html | RC page | Planned |
| F019 | Reading Circle - Roster | DashboardData.gs + App.html | RC page | Planned |
| F020 | RC Attendance | DashboardWrite.gs + App.html | RC Attendance Drawer | Planned |
| F021 | RC Change Session | DashboardWrite.gs + App.html | RC Change Session Drawer | Planned |
| F022 | Shift Actions (Cover) | DashboardData.gs + App.html | Shift Actions page | Planned |
| F023 | Handover Notes | DashboardData.gs + App.html | Handover page | Planned |
| F024 | Settings - Dropdowns | DashboardWrite.gs + App.html | Settings page | Planned |
| F025 | Settings - Users | DashboardWrite.gs + App.html | Settings page | Planned |
| F026 | Daily Sync | SyncService.gs | Edge Function + pg_cron | Planned |
| F027 | Form Submits (RC/Ori) | FormHandler.gs | Webhook + Edge Function | Planned |
| F028 | Real-time Updates | N/A (manual refresh) | Supabase Realtime | Planned |
| F029 | Bulk Operations | N/A | New feature | Planned |
| F030 | Search Contacts | DashboardData.gs + App.html | Search API + Drawer | Planned |

---

## 11. RISK MITIGATION

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **RLS policy bugs expose wrong data** | Medium | High | Comprehensive RLS test suite; staging UAT with 2 reps of different roles |
| **Realtime subscription storms** | Low | Medium | Limit subscriptions to visible page; use `presence` for connection health |
| **Google Sheets API quota exceeded** | Medium | Medium | Service account with quota increase request; cache external reads in Redis |
| **Form webhook signature verification** | Medium | Low | Shared secret header; idempotency key on response ID |
| **Optimistic lock conflicts (orientation)** | Medium | Low | Client retry with fresh data; toast notification |
| **Supabase cold start latency (Edge Functions)** | Low | Low | Keep functions warm via pg_cron ping; use Vercel Edge for auth |
| **Vercel function timeout (60s)** | Low | Medium | Long operations (sync) in Edge Functions / background jobs |

---

## 12. DEFINITION OF DONE (Per Phase)

Each phase complete when:
- [ ] Code implemented + TypeScript strict mode passes
- [ ] Unit tests pass (Vitest)
- [ ] Integration tests pass (Supabase Local)
- [ ] E2E tests pass (Playwright on staging)
- [ ] Lint + typecheck clean (`npm run lint && npm run typecheck`)
- [ ] No Sentry errors in staging
- [ ] Manual UAT by founder/reps (for UI phases)
- [ ] CHANGELOG.md updated

---

## 13. NEXT STEPS

**Awaiting your approval** on this architecture and implementation plan. Once approved, I'll begin **Phase A: Foundation**.

**Questions for you before Phase A:**
1. **Supabase project**: Create new, or use existing? (Need project ref, anon key, service role key)
2. **Vercel project**: Create new, or link existing GitHub repo?
3. **Google Cloud Service Account**: For Sheets API access (B2, B3 sync) — need credentials JSON
4. **Domain**: Custom domain for production, or `vercel.app` subdomain?
5. **Staging data**: Seed with 100 cubs synthetic data, or copy subset from production Apps Script?

Please confirm the plan and provide the above credentials/config details to proceed.
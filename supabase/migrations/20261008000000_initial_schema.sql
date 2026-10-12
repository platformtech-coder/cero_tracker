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

-- ============================================================
-- 3.2 RLS Policies
-- ============================================================

-- Master Cubs
ALTER TABLE public.master_cubs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.master_cubs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Rep owns cubs" ON public.master_cubs FOR SELECT
  USING (rep_name = (SELECT full_name FROM public.profiles WHERE id = auth.uid()));

-- Cubs table
ALTER TABLE public.cubs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.cubs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Rep owns cubs" ON public.cubs FOR SELECT
  USING (relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Rep updates own cubs" ON public.cubs FOR UPDATE
  USING (relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid()));

-- Families
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.families FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Rep owns families" ON public.families FOR SELECT
  USING (relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid()));

-- Interactions
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.interactions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Rep sees own cubs interactions" ON public.interactions FOR SELECT
  USING (
    cub_id IN (SELECT cub_id FROM public.cubs WHERE relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid()))
    OR logged_by = auth.uid()
  );
CREATE POLICY "Rep inserts interactions" ON public.interactions FOR INSERT
  WITH CHECK (true); 

-- Actions
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.actions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Rep sees own cubs actions" ON public.actions FOR SELECT
  USING (
    cub_id IN (SELECT cub_id FROM public.cubs WHERE relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid()))
  );
CREATE POLICY "Cover page sees all" ON public.actions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')); 

-- Reading Circle
ALTER TABLE public.reading_circle ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.reading_circle FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Rep sees Gen Comm" ON public.reading_circle FOR SELECT
  USING (
    cub_id IN (SELECT cub_id FROM public.cubs WHERE relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid()) AND segment = 'Gen. Comm')
  );

-- Orientation
ALTER TABLE public.orientation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.orientation FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Rep sees Gen Comm" ON public.orientation FOR SELECT
  USING (
    cub_id IN (SELECT cub_id FROM public.cubs WHERE relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid()) AND segment = 'Gen. Comm')
  );

-- Pending Signups
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

-- Handover Notes
ALTER TABLE public.handover_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.handover_notes FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "User sees own notes" ON public.handover_notes FOR SELECT
  USING (logged_by = auth.uid());
CREATE POLICY "User inserts own notes" ON public.handover_notes FOR INSERT
  WITH CHECK (logged_by = auth.uid());
CREATE POLICY "User updates own notes" ON public.handover_notes FOR UPDATE
  USING (logged_by = auth.uid());

-- Config Dropdowns
ALTER TABLE public.config_dropdowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated read" ON public.config_dropdowns FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Admin manages" ON public.config_dropdowns FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 3.3 Helper Functions & Triggers
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER set_master_cubs_updated_at BEFORE UPDATE ON public.master_cubs FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_families_updated_at BEFORE UPDATE ON public.families FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_cubs_updated_at BEFORE UPDATE ON public.cubs FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_actions_updated_at BEFORE UPDATE ON public.actions FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_reading_circle_updated_at BEFORE UPDATE ON public.reading_circle FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_orientation_updated_at BEFORE UPDATE ON public.orientation FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_email_history_updated_at BEFORE UPDATE ON public.email_history FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_sync_state_updated_at BEFORE UPDATE ON public.sync_state FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

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
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unknown User'), 'rep');
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Realtime publications
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;
ALTER PUBLICATION supabase_realtime ADD TABLE 
  public.cubs,
  public.actions,
  public.interactions,
  public.reading_circle,
  public.orientation,
  public.pending_signups,
  public.handover_notes;

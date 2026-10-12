BEGIN;
ALTER POLICY "Rep sees own master_cubs" ON public.master_cubs USING (rep_name = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
   FROM profiles
  WHERE (profiles.id = auth.uid())));
ALTER POLICY "Rep sees own families" ON public.families USING (relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
   FROM profiles
  WHERE (profiles.id = auth.uid())));
ALTER POLICY "Rep sees own cubs" ON public.cubs USING (relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
   FROM profiles
  WHERE (profiles.id = auth.uid())));
ALTER POLICY "Rep updates own cubs" ON public.cubs USING (relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
   FROM profiles
  WHERE (profiles.id = auth.uid())));
ALTER POLICY "Rep sees own cubs interactions" ON public.interactions USING ((cub_id IN ( SELECT cubs.cub_id
   FROM cubs
  WHERE (cubs.relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
           FROM profiles
          WHERE (profiles.id = auth.uid()))))) OR (logged_by = auth.uid()));
ALTER POLICY "Rep sees own cubs actions" ON public.actions USING (cub_id IN ( SELECT cubs.cub_id
   FROM cubs
  WHERE (cubs.relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
           FROM profiles
          WHERE (profiles.id = auth.uid())))));
ALTER POLICY "Rep updates own actions" ON public.actions USING (cub_id IN ( SELECT cubs.cub_id
   FROM cubs
  WHERE (cubs.relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
           FROM profiles
          WHERE (profiles.id = auth.uid())))));
ALTER POLICY "Rep sees Gen Comm reading_circle" ON public.reading_circle USING (cub_id IN ( SELECT cubs.cub_id
   FROM cubs
  WHERE ((cubs.relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
           FROM profiles
          WHERE (profiles.id = auth.uid()))) AND (cubs.segment = 'Gen. Comm'::text))));
ALTER POLICY "Rep manages Gen Comm rc_attendance" ON public.rc_attendance USING (cub_id IN ( SELECT cubs.cub_id
   FROM cubs
  WHERE ((cubs.relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
           FROM profiles
          WHERE (profiles.id = auth.uid()))) AND (cubs.segment = 'Gen. Comm'::text))));
ALTER POLICY "Rep sees Gen Comm orientation" ON public.orientation USING (cub_id IN ( SELECT cubs.cub_id
   FROM cubs
  WHERE ((cubs.relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
           FROM profiles
          WHERE (profiles.id = auth.uid()))) AND (cubs.segment = 'Gen. Comm'::text))));
ALTER POLICY "Rep updates Gen Comm orientation" ON public.orientation USING (cub_id IN ( SELECT cubs.cub_id
   FROM cubs
  WHERE ((cubs.relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
           FROM profiles
          WHERE (profiles.id = auth.uid()))) AND (cubs.segment = 'Gen. Comm'::text))));
ALTER POLICY "Rep sees pending for own cubs" ON public.pending_signups USING ((status = 'Pending'::text) AND (matched_cub_id IN ( SELECT cubs.cub_id
   FROM cubs
  WHERE ((cubs.relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
           FROM profiles
          WHERE (profiles.id = auth.uid()))) AND (cubs.segment = 'Gen. Comm'::text)))));
ALTER POLICY "Rep sees own cubs email_history" ON public.email_history USING (cub_id IN ( SELECT cubs.cub_id
   FROM cubs
  WHERE (cubs.relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
           FROM profiles
          WHERE (profiles.id = auth.uid())))));
ALTER POLICY "Rep inserts own cubs orientation" ON public.orientation WITH CHECK (cub_id IN ( SELECT cubs.cub_id
   FROM cubs
  WHERE (cubs.relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
           FROM profiles
          WHERE (profiles.id = auth.uid())))));
ALTER POLICY "Rep updates own cubs orientation" ON public.orientation USING (cub_id IN ( SELECT cubs.cub_id
   FROM cubs
  WHERE (cubs.relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
           FROM profiles
          WHERE (profiles.id = auth.uid())))));
ALTER POLICY "Rep inserts own cubs reading circle" ON public.reading_circle WITH CHECK (cub_id IN ( SELECT cubs.cub_id
   FROM cubs
  WHERE (cubs.relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
           FROM profiles
          WHERE (profiles.id = auth.uid())))));
ALTER POLICY "Rep updates own cubs reading circle" ON public.reading_circle USING (cub_id IN ( SELECT cubs.cub_id
   FROM cubs
  WHERE (cubs.relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
           FROM profiles
          WHERE (profiles.id = auth.uid())))));
ALTER POLICY "Rep sees own cubs attendance" ON public.rc_attendance USING (cub_id IN ( SELECT cubs.cub_id
   FROM cubs
  WHERE (cubs.relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
           FROM profiles
          WHERE (profiles.id = auth.uid())))));
ALTER POLICY "Rep inserts families" ON public.families WITH CHECK (relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
   FROM profiles
  WHERE (profiles.id = auth.uid())));
ALTER POLICY "Rep updates own families" ON public.families USING (relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
   FROM profiles
  WHERE (profiles.id = auth.uid())));
ALTER POLICY "Rep inserts own cubs" ON public.cubs WITH CHECK (relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
   FROM profiles
  WHERE (profiles.id = auth.uid())));
ALTER POLICY "Rep updates pending signups" ON public.pending_signups USING ((matched_cub_id IN ( SELECT cubs.cub_id
   FROM cubs
  WHERE (cubs.relationship_owner = ( SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
           FROM profiles
          WHERE (profiles.id = auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
COMMIT;

-- Update RLS policies to use sheet_rep_name if available

-- Master Cubs
ALTER POLICY "Rep owns cubs" ON public.master_cubs
  USING (rep_name = (SELECT COALESCE(sheet_rep_name, full_name) FROM public.profiles WHERE id = auth.uid()));

-- Cubs
ALTER POLICY "Rep owns cubs" ON public.cubs
  USING (relationship_owner = (SELECT COALESCE(sheet_rep_name, full_name) FROM public.profiles WHERE id = auth.uid()));
ALTER POLICY "Rep updates own cubs" ON public.cubs
  USING (relationship_owner = (SELECT COALESCE(sheet_rep_name, full_name) FROM public.profiles WHERE id = auth.uid()));
ALTER POLICY "Rep inserts own cubs" ON public.cubs
  WITH CHECK (relationship_owner = (SELECT COALESCE(sheet_rep_name, full_name) FROM public.profiles WHERE id = auth.uid()));

-- Families
ALTER POLICY "Rep owns families" ON public.families
  USING (relationship_owner = (SELECT COALESCE(sheet_rep_name, full_name) FROM public.profiles WHERE id = auth.uid()));
ALTER POLICY "Rep inserts families" ON public.families
  WITH CHECK (relationship_owner = (SELECT COALESCE(sheet_rep_name, full_name) FROM public.profiles WHERE id = auth.uid()));
ALTER POLICY "Rep updates own families" ON public.families
  USING (relationship_owner = (SELECT COALESCE(sheet_rep_name, full_name) FROM public.profiles WHERE id = auth.uid()));

-- Interactions
ALTER POLICY "Rep sees own cubs interactions" ON public.interactions
  USING (
    logged_by = auth.uid() OR
    cub_id IN (SELECT cub_id FROM public.cubs WHERE relationship_owner = (SELECT COALESCE(sheet_rep_name, full_name) FROM public.profiles WHERE id = auth.uid()))
  );

-- Actions
ALTER POLICY "Rep sees own cubs actions" ON public.actions
  USING (
    handled_by = (SELECT COALESCE(sheet_rep_name, full_name) FROM public.profiles WHERE id = auth.uid()) OR
    cub_id IN (SELECT cub_id FROM public.cubs WHERE relationship_owner = (SELECT COALESCE(sheet_rep_name, full_name) FROM public.profiles WHERE id = auth.uid()))
  );

-- Orientation
ALTER POLICY "Rep sees Gen Comm" ON public.orientation
  USING (
    cub_id IN (SELECT cub_id FROM public.cubs WHERE relationship_owner = (SELECT COALESCE(sheet_rep_name, full_name) FROM public.profiles WHERE id = auth.uid()) AND segment = 'Gen. Comm')
  );
ALTER POLICY "Rep inserts own cubs orientation" ON public.orientation
  WITH CHECK (
    cub_id IN (
      SELECT cub_id FROM public.cubs 
      WHERE relationship_owner = (SELECT COALESCE(sheet_rep_name, full_name) FROM public.profiles WHERE id = auth.uid())
    )
  );
ALTER POLICY "Rep updates own cubs orientation" ON public.orientation
  USING (
    cub_id IN (
      SELECT cub_id FROM public.cubs 
      WHERE relationship_owner = (SELECT COALESCE(sheet_rep_name, full_name) FROM public.profiles WHERE id = auth.uid())
    )
  );

-- Reading Circle
ALTER POLICY "Rep sees Gen Comm" ON public.reading_circle
  USING (
    cub_id IN (SELECT cub_id FROM public.cubs WHERE relationship_owner = (SELECT COALESCE(sheet_rep_name, full_name) FROM public.profiles WHERE id = auth.uid()) AND segment = 'Gen. Comm')
  );
ALTER POLICY "Rep inserts own cubs reading circle" ON public.reading_circle
  WITH CHECK (
    cub_id IN (
      SELECT cub_id FROM public.cubs 
      WHERE relationship_owner = (SELECT COALESCE(sheet_rep_name, full_name) FROM public.profiles WHERE id = auth.uid())
    )
  );
ALTER POLICY "Rep updates own cubs reading circle" ON public.reading_circle
  USING (
    cub_id IN (
      SELECT cub_id FROM public.cubs 
      WHERE relationship_owner = (SELECT COALESCE(sheet_rep_name, full_name) FROM public.profiles WHERE id = auth.uid())
    )
  );

-- RC Attendance
ALTER POLICY "Rep sees own cubs attendance" ON public.rc_attendance
  USING (
    cub_id IN (
      SELECT cub_id FROM public.cubs 
      WHERE relationship_owner = (SELECT COALESCE(sheet_rep_name, full_name) FROM public.profiles WHERE id = auth.uid())
    )
  );
ALTER POLICY "Rep updates own cubs attendance" ON public.rc_attendance
  USING (
    cub_id IN (
      SELECT cub_id FROM public.cubs 
      WHERE relationship_owner = (SELECT COALESCE(sheet_rep_name, full_name) FROM public.profiles WHERE id = auth.uid())
    )
  );

-- Pending Signups
ALTER POLICY "Rep sees pending for own segment" ON public.pending_signups
  USING (
    matched_cub_id IN (
      SELECT cub_id FROM public.cubs WHERE relationship_owner = (SELECT COALESCE(sheet_rep_name, full_name) FROM public.profiles WHERE id = auth.uid()) AND segment = 'Gen. Comm'
    )
  );
ALTER POLICY "Rep updates pending signups" ON public.pending_signups
  USING (
    matched_cub_id IN (
      SELECT cub_id FROM public.cubs 
      WHERE relationship_owner = (SELECT COALESCE(sheet_rep_name, full_name) FROM public.profiles WHERE id = auth.uid())
    )
  );

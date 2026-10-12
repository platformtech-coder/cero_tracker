import fs from 'fs';

const data = [
  {"policyname":"Rep sees own master_cubs","tablename":"master_cubs","qual":"(rep_name = ( SELECT profiles.full_name\n   FROM profiles\n  WHERE (profiles.id = auth.uid())))","with_check":null},
  {"policyname":"Rep sees own families","tablename":"families","qual":"(relationship_owner = ( SELECT profiles.full_name\n   FROM profiles\n  WHERE (profiles.id = auth.uid())))","with_check":null},
  {"policyname":"Rep sees own cubs","tablename":"cubs","qual":"(relationship_owner = ( SELECT profiles.full_name\n   FROM profiles\n  WHERE (profiles.id = auth.uid())))","with_check":null},
  {"policyname":"Rep updates own cubs","tablename":"cubs","qual":"(relationship_owner = ( SELECT profiles.full_name\n   FROM profiles\n  WHERE (profiles.id = auth.uid())))","with_check":null},
  {"policyname":"Rep sees own cubs interactions","tablename":"interactions","qual":"((cub_id IN ( SELECT cubs.cub_id\n   FROM cubs\n  WHERE (cubs.relationship_owner = ( SELECT profiles.full_name\n           FROM profiles\n          WHERE (profiles.id = auth.uid()))))) OR (logged_by = auth.uid()))","with_check":null},
  {"policyname":"Rep sees own cubs actions","tablename":"actions","qual":"(cub_id IN ( SELECT cubs.cub_id\n   FROM cubs\n  WHERE (cubs.relationship_owner = ( SELECT profiles.full_name\n           FROM profiles\n          WHERE (profiles.id = auth.uid())))))","with_check":null},
  {"policyname":"Rep updates own actions","tablename":"actions","qual":"(cub_id IN ( SELECT cubs.cub_id\n   FROM cubs\n  WHERE (cubs.relationship_owner = ( SELECT profiles.full_name\n           FROM profiles\n          WHERE (profiles.id = auth.uid())))))","with_check":null},
  {"policyname":"Rep sees Gen Comm reading_circle","tablename":"reading_circle","qual":"(cub_id IN ( SELECT cubs.cub_id\n   FROM cubs\n  WHERE ((cubs.relationship_owner = ( SELECT profiles.full_name\n           FROM profiles\n          WHERE (profiles.id = auth.uid()))) AND (cubs.segment = 'Gen. Comm'::text))))","with_check":null},
  {"policyname":"Rep manages Gen Comm rc_attendance","tablename":"rc_attendance","qual":"(cub_id IN ( SELECT cubs.cub_id\n   FROM cubs\n  WHERE ((cubs.relationship_owner = ( SELECT profiles.full_name\n           FROM profiles\n          WHERE (profiles.id = auth.uid()))) AND (cubs.segment = 'Gen. Comm'::text))))","with_check":null},
  {"policyname":"Rep sees Gen Comm orientation","tablename":"orientation","qual":"(cub_id IN ( SELECT cubs.cub_id\n   FROM cubs\n  WHERE ((cubs.relationship_owner = ( SELECT profiles.full_name\n           FROM profiles\n          WHERE (profiles.id = auth.uid()))) AND (cubs.segment = 'Gen. Comm'::text))))","with_check":null},
  {"policyname":"Rep updates Gen Comm orientation","tablename":"orientation","qual":"(cub_id IN ( SELECT cubs.cub_id\n   FROM cubs\n  WHERE ((cubs.relationship_owner = ( SELECT profiles.full_name\n           FROM profiles\n          WHERE (profiles.id = auth.uid()))) AND (cubs.segment = 'Gen. Comm'::text))))","with_check":null},
  {"policyname":"Rep sees pending for own cubs","tablename":"pending_signups","qual":"((status = 'Pending'::text) AND (matched_cub_id IN ( SELECT cubs.cub_id\n   FROM cubs\n  WHERE ((cubs.relationship_owner = ( SELECT profiles.full_name\n           FROM profiles\n          WHERE (profiles.id = auth.uid()))) AND (cubs.segment = 'Gen. Comm'::text)))))","with_check":null},
  {"policyname":"Rep sees own cubs email_history","tablename":"email_history","qual":"(cub_id IN ( SELECT cubs.cub_id\n   FROM cubs\n  WHERE (cubs.relationship_owner = ( SELECT profiles.full_name\n           FROM profiles\n          WHERE (profiles.id = auth.uid())))))","with_check":null},
  {"policyname":"Rep inserts own cubs orientation","tablename":"orientation","qual":null,"with_check":"(cub_id IN ( SELECT cubs.cub_id\n   FROM cubs\n  WHERE (cubs.relationship_owner = ( SELECT profiles.full_name\n           FROM profiles\n          WHERE (profiles.id = auth.uid())))))"},
  {"policyname":"Rep updates own cubs orientation","tablename":"orientation","qual":"(cub_id IN ( SELECT cubs.cub_id\n   FROM cubs\n  WHERE (cubs.relationship_owner = ( SELECT profiles.full_name\n           FROM profiles\n          WHERE (profiles.id = auth.uid())))))","with_check":null},
  {"policyname":"Rep inserts own cubs reading circle","tablename":"reading_circle","qual":null,"with_check":"(cub_id IN ( SELECT cubs.cub_id\n   FROM cubs\n  WHERE (cubs.relationship_owner = ( SELECT profiles.full_name\n           FROM profiles\n          WHERE (profiles.id = auth.uid())))))"},
  {"policyname":"Rep updates own cubs reading circle","tablename":"reading_circle","qual":"(cub_id IN ( SELECT cubs.cub_id\n   FROM cubs\n  WHERE (cubs.relationship_owner = ( SELECT profiles.full_name\n           FROM profiles\n          WHERE (profiles.id = auth.uid())))))","with_check":null},
  {"policyname":"Rep sees own cubs attendance","tablename":"rc_attendance","qual":"(cub_id IN ( SELECT cubs.cub_id\n   FROM cubs\n  WHERE (cubs.relationship_owner = ( SELECT profiles.full_name\n           FROM profiles\n          WHERE (profiles.id = auth.uid())))))","with_check":null},
  {"policyname":"Rep inserts families","tablename":"families","qual":null,"with_check":"(relationship_owner = ( SELECT profiles.full_name\n   FROM profiles\n  WHERE (profiles.id = auth.uid())))"},
  {"policyname":"Rep updates own families","tablename":"families","qual":"(relationship_owner = ( SELECT profiles.full_name\n   FROM profiles\n  WHERE (profiles.id = auth.uid())))","with_check":null},
  {"policyname":"Rep inserts own cubs","tablename":"cubs","qual":null,"with_check":"(relationship_owner = ( SELECT profiles.full_name\n   FROM profiles\n  WHERE (profiles.id = auth.uid())))"},
  {"policyname":"Rep updates pending signups","tablename":"pending_signups","qual":"((matched_cub_id IN ( SELECT cubs.cub_id\n   FROM cubs\n  WHERE (cubs.relationship_owner = ( SELECT profiles.full_name\n           FROM profiles\n          WHERE (profiles.id = auth.uid()))))) OR (EXISTS ( SELECT 1\n   FROM profiles\n  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))","with_check":null}
];

let sql = `BEGIN;\n`;

for (const p of data) {
  let alter = `ALTER POLICY "${p.policyname}" ON public.${p.tablename} `;
  let hasUsing = false;
  if (p.qual) {
    const q = p.qual.replace(/profiles\.full_name/g, 'COALESCE(profiles.sheet_rep_name, profiles.full_name)');
    alter += `USING ${q}`;
    hasUsing = true;
  }
  if (p.with_check) {
    const wc = p.with_check.replace(/profiles\.full_name/g, 'COALESCE(profiles.sheet_rep_name, profiles.full_name)');
    if (hasUsing) alter += ` WITH CHECK ${wc}`;
    else alter += `WITH CHECK ${wc}`;
  }
  alter += `;\n`;
  sql += alter;
}

sql += `COMMIT;\n`;

fs.writeFileSync('scripts/apply-rls.sql', sql);
console.log('Saved to scripts/apply-rls.sql');

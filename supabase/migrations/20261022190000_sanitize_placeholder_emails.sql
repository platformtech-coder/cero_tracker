-- ─── Sanitize Placeholder Emails in master_cubs and families ─────────────
-- Fixes bug where placeholder values such as '-', '.', 'kmm', etc. caused
-- getCubsForFamily and getSiblingsForCub to match all cubs with '-' placeholder email.

UPDATE public.master_cubs 
SET parent_email = NULL 
WHERE parent_email IN ('-', '--', '.', 'none', 'n/a', 'na', 'nil', 'null', '0', 'KMM', 'kmm')
   OR (parent_email IS NOT NULL AND (parent_email NOT LIKE '%@%' OR parent_email NOT LIKE '%.%'));

UPDATE public.families 
SET parent_email = NULL 
WHERE parent_email IN ('-', '--', '.', 'none', 'n/a', 'na', 'nil', 'null', '0', 'KMM', 'kmm')
   OR (parent_email IS NOT NULL AND (parent_email NOT LIKE '%@%' OR parent_email NOT LIKE '%.%'));

-- Migration to add 'Not started' and 'In Progress' to action_status options
INSERT INTO public.config_dropdowns (category, value, sort_order, is_active)
VALUES 
  ('action_status', 'Not started', 1, true),
  ('action_status', 'In Progress', 2, true)
ON CONFLICT (category, value) DO NOTHING;

-- WORKFLOW TRACKING MIGRATION
-- Copy this entire file and paste into: https://supabase.com/dashboard/project/REDACTED_SUPABASE_PROJECT/sql/new

-- Add columns
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS reflection_status TEXT DEFAULT 'new';
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS asana_project_id TEXT;
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS asana_task_id TEXT;
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS asana_task_url TEXT;
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS implementation_notes TEXT;

-- Add constraint
ALTER TABLE reflections DROP CONSTRAINT IF EXISTS valid_reflection_status;
ALTER TABLE reflections ADD CONSTRAINT valid_reflection_status CHECK (reflection_status IN ('new','under_review','accepted','rejected','implemented','deferred'));

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_reflections_status ON reflections(reflection_status);
CREATE INDEX IF NOT EXISTS idx_reflections_asana_task ON reflections(asana_task_id) WHERE asana_task_id IS NOT NULL;

-- Update RLS
DROP POLICY IF EXISTS "auth_update_workflow" ON reflections;
CREATE POLICY "auth_update_workflow" ON reflections FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Create views
CREATE OR REPLACE VIEW reflection_triage_queue AS SELECT id,created_at,org,focus_area,outcome,total_issues,jsonb_array_length(priority_issues) as high_priority_count,roi_annual_value,user_email FROM reflections WHERE reflection_status='new' ORDER BY roi_annual_value DESC NULLS LAST,total_issues DESC,created_at DESC;

CREATE OR REPLACE VIEW reflection_backlog AS SELECT id,created_at,org,focus_area,outcome,total_issues,roi_annual_value,asana_project_id,asana_task_id,asana_task_url,reviewed_at,reviewed_by FROM reflections WHERE reflection_status='accepted' ORDER BY roi_annual_value DESC NULLS LAST;

CREATE OR REPLACE VIEW reflection_implementation_status AS SELECT reflection_status,COUNT(*) as count,SUM(total_issues) as total_issues_identified,SUM(roi_annual_value) as total_roi,AVG(roi_annual_value) as avg_roi FROM reflections GROUP BY reflection_status ORDER BY CASE reflection_status WHEN 'new' THEN 1 WHEN 'under_review' THEN 2 WHEN 'accepted' THEN 3 WHEN 'implemented' THEN 4 WHEN 'deferred' THEN 5 WHEN 'rejected' THEN 6 END;

-- Grant permissions
GRANT SELECT ON reflection_triage_queue TO anon,authenticated;
GRANT SELECT ON reflection_backlog TO anon,authenticated;
GRANT SELECT ON reflection_implementation_status TO anon,authenticated;

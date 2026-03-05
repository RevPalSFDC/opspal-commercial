-- ============================================================================
-- COMPLETE REFLECTIONS SCHEMA - PASTE THIS INTO SUPABASE SQL EDITOR
-- ============================================================================
-- 1. Go to: https://supabase.com/dashboard/project/REDACTED_SUPABASE_PROJECT/sql/new
-- 2. Copy this entire file
-- 3. Paste into the SQL Editor
-- 4. Click "RUN"
-- 5. Verify with: node scripts/verify-workflow-migration.js
-- ============================================================================

-- ============================================================================
-- PART 1: BASE REFLECTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_email TEXT,
  org TEXT,
  focus_area TEXT,
  outcome TEXT,
  duration_minutes INTEGER,
  data JSONB NOT NULL,
  total_issues INTEGER,
  priority_issues JSONB,
  roi_annual_value NUMERIC,
  search_vector TSVECTOR,

  -- Workflow tracking columns (added immediately)
  reflection_status TEXT DEFAULT 'new',
  asana_project_id TEXT,
  asana_task_id TEXT,
  asana_task_url TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  rejection_reason TEXT,
  implementation_notes TEXT
);

-- ============================================================================
-- PART 2: CONSTRAINTS
-- ============================================================================

ALTER TABLE reflections DROP CONSTRAINT IF EXISTS valid_reflection_status;
ALTER TABLE reflections ADD CONSTRAINT valid_reflection_status
  CHECK (reflection_status IN ('new','under_review','accepted','rejected','implemented','deferred'));

-- ============================================================================
-- PART 3: INDEXES
-- ============================================================================

-- Base indexes
CREATE INDEX IF NOT EXISTS idx_reflections_created_at ON reflections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reflections_org ON reflections(org);
CREATE INDEX IF NOT EXISTS idx_reflections_data ON reflections USING gin(data jsonb_path_ops);

-- Workflow indexes
CREATE INDEX IF NOT EXISTS idx_reflections_status ON reflections(reflection_status);
CREATE INDEX IF NOT EXISTS idx_reflections_asana_task ON reflections(asana_task_id)
  WHERE asana_task_id IS NOT NULL;

-- ============================================================================
-- PART 4: ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (for /reflect command)
DROP POLICY IF EXISTS "anon_insert_reflections" ON reflections;
CREATE POLICY "anon_insert_reflections" ON reflections
  FOR INSERT TO anon WITH CHECK (true);

-- Allow public reads (for analytics/transparency)
DROP POLICY IF EXISTS "public_select_reflections" ON reflections;
CREATE POLICY "public_select_reflections" ON reflections
  FOR SELECT TO anon, authenticated USING (true);

-- Allow authenticated users to update workflow fields
DROP POLICY IF EXISTS "auth_update_workflow" ON reflections;
CREATE POLICY "auth_update_workflow" ON reflections
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 5: VIEWS FOR WORKFLOW MANAGEMENT
-- ============================================================================

-- Triage Queue: New reflections sorted by ROI
CREATE OR REPLACE VIEW reflection_triage_queue AS
SELECT
  id,
  created_at,
  org,
  focus_area,
  outcome,
  total_issues,
  jsonb_array_length(priority_issues) as high_priority_count,
  roi_annual_value,
  user_email
FROM reflections
WHERE reflection_status = 'new'
ORDER BY
  roi_annual_value DESC NULLS LAST,
  total_issues DESC,
  created_at DESC;

-- Backlog: Accepted reflections awaiting implementation
CREATE OR REPLACE VIEW reflection_backlog AS
SELECT
  id,
  created_at,
  org,
  focus_area,
  outcome,
  total_issues,
  roi_annual_value,
  asana_project_id,
  asana_task_id,
  asana_task_url,
  reviewed_at,
  reviewed_by
FROM reflections
WHERE reflection_status = 'accepted'
ORDER BY roi_annual_value DESC NULLS LAST;

-- Implementation Status: Summary by status
CREATE OR REPLACE VIEW reflection_implementation_status AS
SELECT
  reflection_status,
  COUNT(*) as count,
  SUM(total_issues) as total_issues_identified,
  SUM(roi_annual_value) as total_roi,
  AVG(roi_annual_value) as avg_roi
FROM reflections
GROUP BY reflection_status
ORDER BY
  CASE reflection_status
    WHEN 'new' THEN 1
    WHEN 'under_review' THEN 2
    WHEN 'accepted' THEN 3
    WHEN 'implemented' THEN 4
    WHEN 'deferred' THEN 5
    WHEN 'rejected' THEN 6
  END;

-- ============================================================================
-- PART 6: VIEW PERMISSIONS
-- ============================================================================

GRANT SELECT ON reflection_triage_queue TO anon, authenticated;
GRANT SELECT ON reflection_backlog TO anon, authenticated;
GRANT SELECT ON reflection_implementation_status TO anon, authenticated;

-- ============================================================================
-- SUCCESS!
-- ============================================================================
-- You should see "Success. No rows returned"
-- Run: node scripts/verify-workflow-migration.js
-- ============================================================================

-- Migration: 004-reflection-session-context
-- Description: Add session context, verification, and retention columns to reflections
-- Author: Claude Code (Reflection System Improvement Plan)
-- Date: 2026-01-03

-- ============================================================================
-- PHASE 1: Session Context Columns
-- ============================================================================

-- Session context JSONB for full session data
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS session_context JSONB;

-- Denormalized counts for quick queries
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS files_edited_count INTEGER DEFAULT 0;
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS tools_invoked_count INTEGER DEFAULT 0;
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS errors_captured_count INTEGER DEFAULT 0;

-- Agents used during the session
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS agents_used TEXT[];

-- Cohort ID for pattern grouping
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS cohort_id TEXT;
CREATE INDEX IF NOT EXISTS idx_reflections_cohort_id ON reflections(cohort_id);

-- ============================================================================
-- PHASE 2: Duration and ROI Confidence
-- ============================================================================

-- Track how duration was captured
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS duration_source TEXT;

-- Add constraint if column didn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'reflections_duration_source_check'
    ) THEN
        ALTER TABLE reflections ADD CONSTRAINT reflections_duration_source_check
            CHECK (duration_source IS NULL OR duration_source IN ('auto_captured', 'user_provided', 'estimated'));
    END IF;
END $$;

-- Track confidence level of ROI estimates
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS roi_confidence TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'reflections_roi_confidence_check'
    ) THEN
        ALTER TABLE reflections ADD CONSTRAINT reflections_roi_confidence_check
            CHECK (roi_confidence IS NULL OR roi_confidence IN ('high', 'medium', 'low', 'estimated'));
    END IF;
END $$;

-- ============================================================================
-- PHASE 3: Closed-Loop Verification
-- ============================================================================

-- Link to fix plan being verified
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS verifies_fix_id UUID;

-- Verification result
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS verification_result TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'reflections_verification_result_check'
    ) THEN
        ALTER TABLE reflections ADD CONSTRAINT reflections_verification_result_check
            CHECK (verification_result IS NULL OR verification_result IN ('fixed', 'partially_fixed', 'not_fixed', 'regressed'));
    END IF;
END $$;

-- ============================================================================
-- PHASE 4: Retention Management
-- ============================================================================

-- Track when reflection was archived
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- ============================================================================
-- PHASE 5: Fix Plans Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS fix_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Cohort linkage
    cohort_id TEXT,
    cohort_title TEXT,

    -- Fix details
    title TEXT NOT NULL,
    description TEXT,
    prevention_depth TEXT CHECK (prevention_depth IN ('LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4', 'LEVEL_5')),
    five_why_analysis JSONB,  -- Store the 5-why RCA

    -- Implementation tracking
    implementation_status TEXT DEFAULT 'planned' CHECK (implementation_status IN ('planned', 'in_progress', 'implemented', 'verified', 'reverted')),
    implemented_at TIMESTAMPTZ,
    implementation_notes TEXT,

    -- Verification metrics
    verification_count INTEGER DEFAULT 0,
    last_verified_at TIMESTAMPTZ,
    verified_fixed_count INTEGER DEFAULT 0,
    verified_not_fixed_count INTEGER DEFAULT 0,
    verified_regressed_count INTEGER DEFAULT 0,

    -- ROI tracking
    estimated_roi_annual NUMERIC,
    actual_roi_annual NUMERIC,
    roi_calculation_method TEXT,

    -- External links
    asana_task_id TEXT,
    github_issue_url TEXT,

    -- Taxonomy
    taxonomy_category TEXT,
    prevention_category TEXT,

    -- Plugin/org context
    plugin TEXT,
    org TEXT
);

-- Index for cohort lookups
CREATE INDEX IF NOT EXISTS idx_fix_plans_cohort_id ON fix_plans(cohort_id);

-- Index for status queries
CREATE INDEX IF NOT EXISTS idx_fix_plans_status ON fix_plans(implementation_status);

-- Index for taxonomy lookups
CREATE INDEX IF NOT EXISTS idx_fix_plans_taxonomy ON fix_plans(taxonomy_category, prevention_category);

-- ============================================================================
-- PHASE 6: Retention Policies Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Scope
    org TEXT NOT NULL UNIQUE,
    plugin TEXT,

    -- Retention settings
    retention_days INTEGER DEFAULT 365,      -- Keep data for this long
    archive_after_days INTEGER DEFAULT 90,   -- Archive after this long
    delete_after_days INTEGER DEFAULT 730,   -- Hard delete after this

    -- Status-based overrides (JSONB for flexibility)
    status_overrides JSONB DEFAULT '{}'::JSONB,
    -- Example: {"implemented": {"archive_after_days": 365, "delete_after_days": null}}

    -- Metadata
    notes TEXT,
    created_by TEXT
);

-- Index for org lookups
CREATE INDEX IF NOT EXISTS idx_retention_policies_org ON retention_policies(org);

-- ============================================================================
-- PHASE 7: Verification Tracking Views
-- ============================================================================

-- View for fix plan effectiveness
CREATE OR REPLACE VIEW fix_plan_effectiveness AS
SELECT
    fp.id,
    fp.title,
    fp.cohort_id,
    fp.implementation_status,
    fp.implemented_at,
    fp.verification_count,
    fp.verified_fixed_count,
    fp.verified_not_fixed_count,
    fp.verified_regressed_count,
    CASE
        WHEN fp.verification_count = 0 THEN 0
        ELSE ROUND((fp.verified_fixed_count::NUMERIC / fp.verification_count) * 100, 2)
    END AS effectiveness_percentage,
    fp.estimated_roi_annual,
    fp.actual_roi_annual,
    fp.taxonomy_category,
    fp.prevention_category,
    fp.plugin,
    fp.org
FROM fix_plans fp
WHERE fp.implementation_status IN ('implemented', 'verified');

-- View for reflections with session context stats
CREATE OR REPLACE VIEW reflection_session_stats AS
SELECT
    r.id,
    r.org,
    r.plugin,
    r.created_at,
    r.duration_minutes,
    r.duration_source,
    r.files_edited_count,
    r.tools_invoked_count,
    r.errors_captured_count,
    CARDINALITY(COALESCE(r.agents_used, ARRAY[]::TEXT[])) AS agents_used_count,
    r.roi_confidence,
    r.verification_result,
    r.verifies_fix_id,
    r.archived_at IS NOT NULL AS is_archived,
    CASE
        WHEN r.session_context IS NOT NULL THEN TRUE
        ELSE FALSE
    END AS has_session_context
FROM reflections r;

-- View for singleton analysis
CREATE OR REPLACE VIEW reflection_singletons AS
SELECT
    r.id,
    r.org,
    r.plugin,
    r.summary,
    r.taxonomy_category,
    r.prevention_category,
    r.estimated_roi_annual,
    r.created_at
FROM reflections r
WHERE NOT EXISTS (
    SELECT 1 FROM reflections r2
    WHERE r2.id != r.id
    AND r2.org = r.org
    AND r2.taxonomy_category = r.taxonomy_category
    AND r2.created_at > r.created_at - INTERVAL '30 days'
    AND r2.created_at < r.created_at + INTERVAL '30 days'
)
AND r.archived_at IS NULL;

-- ============================================================================
-- PHASE 8: Update Triggers
-- ============================================================================

-- Trigger to update updated_at on fix_plans
CREATE OR REPLACE FUNCTION update_fix_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fix_plans_updated_at_trigger ON fix_plans;
CREATE TRIGGER fix_plans_updated_at_trigger
    BEFORE UPDATE ON fix_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_fix_plans_updated_at();

-- Trigger to update updated_at on retention_policies
DROP TRIGGER IF EXISTS retention_policies_updated_at_trigger ON retention_policies;
CREATE TRIGGER retention_policies_updated_at_trigger
    BEFORE UPDATE ON retention_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_fix_plans_updated_at();

-- ============================================================================
-- PHASE 9: Default Retention Policies
-- ============================================================================

-- Insert default retention policy (can be overridden per-org)
INSERT INTO retention_policies (org, retention_days, archive_after_days, delete_after_days, notes)
VALUES ('*', 365, 90, 730, 'Default retention policy for all orgs')
ON CONFLICT (org) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE fix_plans IS 'Tracks implemented fixes from cohort analysis with verification metrics';
COMMENT ON TABLE retention_policies IS 'Per-org data retention policies for reflections';
COMMENT ON COLUMN reflections.session_context IS 'Auto-captured session context (files, tools, errors)';
COMMENT ON COLUMN reflections.duration_source IS 'How duration was determined: auto_captured, user_provided, estimated';
COMMENT ON COLUMN reflections.roi_confidence IS 'Confidence level of ROI estimate: high, medium, low, estimated';
COMMENT ON COLUMN reflections.verifies_fix_id IS 'Links to a fix_plan this reflection verifies';
COMMENT ON COLUMN reflections.verification_result IS 'Result of fix verification: fixed, partially_fixed, not_fixed, regressed';
COMMENT ON COLUMN reflections.archived_at IS 'When this reflection was archived (NULL if active)';

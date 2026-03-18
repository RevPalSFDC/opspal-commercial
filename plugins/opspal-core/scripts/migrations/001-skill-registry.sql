-- ============================================================================
-- ACE Framework: Skill Registry Schema
-- Version: 1.0.0
-- Created: 2025-12-06
--
-- This migration creates the skill registry tables for the ACE (Agentic Context
-- Engineering) implementation. Enables skill tracking, success metrics, and
-- cross-agent skill transfer.
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. SKILLS TABLE
-- Central registry of all learned skills/strategies
-- ============================================================================

CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,

  -- Classification
  category TEXT NOT NULL,  -- 'assessment', 'deployment', 'validation', 'query', 'automation'
  subcategory TEXT,        -- More specific classification
  tags TEXT[] DEFAULT '{}', -- Searchable tags

  -- Source tracking
  source_agent TEXT NOT NULL,
  source_file TEXT,        -- Original playbook/template path
  source_type TEXT DEFAULT 'playbook', -- 'playbook', 'context', 'shared', 'learned'

  -- Skill content
  content JSONB NOT NULL,  -- The actual skill instructions/patterns
  -- content structure:
  -- {
  --   "instructions": "step-by-step guide",
  --   "patterns": ["pattern1", "pattern2"],
  --   "prerequisites": ["skill_id_1"],
  --   "examples": [{"input": "...", "output": "..."}],
  --   "anti_patterns": ["what to avoid"]
  -- }

  -- Usage metrics
  usage_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,

  -- Computed success rate (STORED for indexing)
  success_rate REAL GENERATED ALWAYS AS (
    CASE WHEN usage_count > 0
    THEN success_count::REAL / usage_count
    ELSE 0.5 END  -- Default 50% for new skills
  ) STORED,

  -- Performance metrics
  avg_duration_ms INTEGER,
  total_duration_ms BIGINT DEFAULT 0,

  -- Confidence score (0.0 to 1.0)
  -- Starts at 0.5, increases with success, decreases with failure
  confidence REAL DEFAULT 0.5,

  -- Status management
  status TEXT DEFAULT 'active' CHECK (status IN (
    'active',           -- Available for use
    'needs_refinement', -- Below confidence threshold
    'deprecated',       -- No longer recommended
    'draft',            -- Not yet validated
    'transferred'       -- Transferred to another agent
  )),

  -- Lifecycle timestamps
  last_used_at TIMESTAMPTZ,
  last_refined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Version tracking for skill evolution
  version INTEGER DEFAULT 1,
  previous_version_id UUID REFERENCES skills(id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_subcategory ON skills(subcategory);
CREATE INDEX IF NOT EXISTS idx_skills_source_agent ON skills(source_agent);
CREATE INDEX IF NOT EXISTS idx_skills_success_rate ON skills(success_rate DESC);
CREATE INDEX IF NOT EXISTS idx_skills_confidence ON skills(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(status);
CREATE INDEX IF NOT EXISTS idx_skills_usage_count ON skills(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_skills_tags ON skills USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_skills_created_at ON skills(created_at DESC);

-- Full-text search on skill content
CREATE INDEX IF NOT EXISTS idx_skills_content_search ON skills USING GIN(
  to_tsvector('english',
    COALESCE(name, '') || ' ' ||
    COALESCE(description, '') || ' ' ||
    COALESCE(content->>'instructions', '')
  )
);

-- ============================================================================
-- 2. SKILL EXECUTIONS TABLE
-- Tracks every use of a skill for learning
-- ============================================================================

CREATE TABLE IF NOT EXISTS skill_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_id TEXT NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,

  -- Execution context
  agent TEXT NOT NULL,
  session_id TEXT,
  task_description TEXT,
  org_alias TEXT,  -- Salesforce org or HubSpot portal

  -- Outcome tracking
  success BOOLEAN NOT NULL,
  error_type TEXT,  -- Taxonomy for failure analysis
  error_message TEXT,

  -- Performance metrics
  duration_ms INTEGER,
  token_count INTEGER,  -- Token usage for cost tracking

  -- Context snapshot (for learning)
  context JSONB DEFAULT '{}',
  -- context structure:
  -- {
  --   "task_type": "deployment",
  --   "complexity": 0.72,
  --   "related_skills": ["skill_id_1", "skill_id_2"],
  --   "user_feedback": "helpful" | "not_helpful" | null
  -- }

  -- User attribution
  user_email TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for execution analysis
CREATE INDEX IF NOT EXISTS idx_skill_executions_skill_id ON skill_executions(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_executions_agent ON skill_executions(agent);
CREATE INDEX IF NOT EXISTS idx_skill_executions_success ON skill_executions(success);
CREATE INDEX IF NOT EXISTS idx_skill_executions_created_at ON skill_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_executions_session ON skill_executions(session_id);
CREATE INDEX IF NOT EXISTS idx_skill_executions_error_type ON skill_executions(error_type) WHERE error_type IS NOT NULL;

-- Composite index for recent execution analysis
CREATE INDEX IF NOT EXISTS idx_skill_executions_skill_recent ON skill_executions(skill_id, created_at DESC);

-- ============================================================================
-- 3. SKILL TRANSFERS TABLE
-- Tracks cross-agent skill transfers with validation
-- ============================================================================

CREATE TABLE IF NOT EXISTS skill_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_id TEXT NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,

  -- Transfer participants
  source_agent TEXT NOT NULL,
  target_agent TEXT NOT NULL,

  -- Transfer status
  status TEXT DEFAULT 'validating' CHECK (status IN (
    'validating',  -- Being tested in target agent
    'accepted',    -- Passed validation, permanent transfer
    'rejected',    -- Failed validation, not transferred
    'rolled_back'  -- Was accepted but later reverted
  )),

  -- Validation metrics
  validation_uses INTEGER DEFAULT 0,
  validation_successes INTEGER DEFAULT 0,
  validation_threshold INTEGER DEFAULT 20,  -- Uses before decision

  -- Computed validation success rate
  validation_success_rate REAL GENERATED ALWAYS AS (
    CASE WHEN validation_uses > 0
    THEN validation_successes::REAL / validation_uses
    ELSE 0 END
  ) STORED,

  -- Decision criteria
  acceptance_threshold REAL DEFAULT 0.80,  -- 80% success rate to accept
  rejection_threshold REAL DEFAULT 0.60,   -- 60% success rate to reject

  -- Lifecycle
  transferred_at TIMESTAMPTZ DEFAULT NOW(),
  validated_at TIMESTAMPTZ,

  -- Rollback info (if applicable)
  rollback_reason TEXT,
  rolled_back_at TIMESTAMPTZ,

  -- Attribution
  initiated_by TEXT  -- 'auto' or user email
);

-- Create indexes for transfer management
CREATE INDEX IF NOT EXISTS idx_skill_transfers_skill_id ON skill_transfers(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_transfers_source ON skill_transfers(source_agent);
CREATE INDEX IF NOT EXISTS idx_skill_transfers_target ON skill_transfers(target_agent);
CREATE INDEX IF NOT EXISTS idx_skill_transfers_status ON skill_transfers(status);
CREATE INDEX IF NOT EXISTS idx_skill_transfers_transferred_at ON skill_transfers(transferred_at DESC);

-- Unique constraint: one active transfer per skill/target pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_transfers_unique_active
  ON skill_transfers(skill_id, target_agent)
  WHERE status IN ('validating', 'accepted');

-- ============================================================================
-- 4. AGENT SKILL ASSIGNMENTS TABLE
-- Maps which skills are available to which agents
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_skill_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent TEXT NOT NULL,
  skill_id TEXT NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,

  -- Assignment type
  assignment_type TEXT DEFAULT 'native' CHECK (assignment_type IN (
    'native',      -- Original skill for this agent
    'transferred', -- Transferred from another agent
    'shared'       -- Explicitly shared skill
  )),

  -- Assignment metadata
  transfer_id UUID REFERENCES skill_transfers(id),
  priority INTEGER DEFAULT 50,  -- Higher = preferred (for conflicts)

  -- Status
  active BOOLEAN DEFAULT TRUE,

  -- Lifecycle
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,

  UNIQUE(agent, skill_id)  -- One assignment per agent/skill pair
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_agent_skill_assignments_agent ON agent_skill_assignments(agent);
CREATE INDEX IF NOT EXISTS idx_agent_skill_assignments_skill ON agent_skill_assignments(skill_id);
CREATE INDEX IF NOT EXISTS idx_agent_skill_assignments_active ON agent_skill_assignments(active);

-- ============================================================================
-- 5. SKILL REFINEMENTS TABLE
-- Tracks skill improvements over time
-- ============================================================================

CREATE TABLE IF NOT EXISTS skill_refinements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_id TEXT NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,

  -- Version info
  from_version INTEGER NOT NULL,
  to_version INTEGER NOT NULL,

  -- Change tracking
  change_type TEXT NOT NULL CHECK (change_type IN (
    'instructions_updated',
    'patterns_added',
    'patterns_removed',
    'anti_patterns_added',
    'examples_added',
    'prerequisites_changed',
    'major_rewrite'
  )),

  change_reason TEXT NOT NULL,
  change_description TEXT,

  -- Impact tracking
  pre_refinement_success_rate REAL,
  post_refinement_success_rate REAL,

  -- Refinement source
  refinement_source TEXT NOT NULL CHECK (refinement_source IN (
    'auto_decay',    -- Triggered by confidence decay
    'user_feedback', -- Based on user corrections
    'cohort_analysis', -- From reflection cohort analysis
    'manual'         -- Manual update
  )),

  -- Related entities
  reflection_ids TEXT[],  -- Related reflection IDs
  asana_task_id TEXT,     -- Related Asana task

  -- Attribution
  refined_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_skill_refinements_skill_id ON skill_refinements(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_refinements_created_at ON skill_refinements(created_at DESC);

-- ============================================================================
-- 6. VIEWS FOR ANALYTICS
-- ============================================================================

-- View: Top performing skills
CREATE OR REPLACE VIEW skill_leaders AS
SELECT
  skill_id,
  name,
  category,
  source_agent,
  usage_count,
  success_count,
  failure_count,
  success_rate,
  confidence,
  status,
  last_used_at
FROM skills
WHERE status = 'active' AND usage_count >= 10
ORDER BY success_rate DESC, usage_count DESC
LIMIT 50;

-- View: Skills needing attention
CREATE OR REPLACE VIEW skills_needing_refinement AS
SELECT
  s.skill_id,
  s.name,
  s.category,
  s.source_agent,
  s.usage_count,
  s.success_rate,
  s.confidence,
  s.last_refined_at,
  s.updated_at,
  COUNT(se.id) FILTER (WHERE se.success = FALSE AND se.created_at > NOW() - INTERVAL '30 days') as recent_failures
FROM skills s
LEFT JOIN skill_executions se ON s.skill_id = se.skill_id
WHERE s.status = 'needs_refinement'
   OR s.confidence < 0.6
   OR (s.usage_count >= 20 AND s.success_rate < 0.7)
GROUP BY s.skill_id, s.name, s.category, s.source_agent, s.usage_count, s.success_rate, s.confidence, s.last_refined_at, s.updated_at
ORDER BY s.confidence ASC, recent_failures DESC;

-- View: Transfer candidates (high performers that could benefit other agents)
CREATE OR REPLACE VIEW transfer_candidates AS
SELECT
  s.skill_id,
  s.name,
  s.category,
  s.source_agent,
  s.usage_count,
  s.success_rate,
  s.confidence,
  s.tags
FROM skills s
WHERE s.status = 'active'
  AND s.usage_count >= 50
  AND s.success_rate >= 0.90
  AND s.confidence >= 0.85
  AND NOT EXISTS (
    SELECT 1 FROM skill_transfers st
    WHERE st.skill_id = s.skill_id
      AND st.status IN ('validating', 'accepted')
  )
ORDER BY s.success_rate DESC, s.usage_count DESC;

-- View: Agent skill portfolios
CREATE OR REPLACE VIEW agent_skill_portfolios AS
SELECT
  asa.agent,
  COUNT(*) FILTER (WHERE asa.active) as total_skills,
  COUNT(*) FILTER (WHERE asa.assignment_type = 'native') as native_skills,
  COUNT(*) FILTER (WHERE asa.assignment_type = 'transferred') as transferred_skills,
  AVG(s.success_rate) FILTER (WHERE asa.active) as avg_success_rate,
  AVG(s.confidence) FILTER (WHERE asa.active) as avg_confidence
FROM agent_skill_assignments asa
JOIN skills s ON asa.skill_id = s.skill_id
GROUP BY asa.agent
ORDER BY avg_success_rate DESC;

-- ============================================================================
-- 7. FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function: Update skill metrics after execution
CREATE OR REPLACE FUNCTION update_skill_metrics()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE skills
  SET
    usage_count = usage_count + 1,
    success_count = success_count + CASE WHEN NEW.success THEN 1 ELSE 0 END,
    failure_count = failure_count + CASE WHEN NEW.success THEN 0 ELSE 1 END,
    total_duration_ms = total_duration_ms + COALESCE(NEW.duration_ms, 0),
    avg_duration_ms = CASE
      WHEN usage_count = 0 THEN NEW.duration_ms
      ELSE (total_duration_ms + COALESCE(NEW.duration_ms, 0)) / (usage_count + 1)
    END,
    last_used_at = NEW.created_at,
    updated_at = NOW()
  WHERE skill_id = NEW.skill_id;

  -- Update confidence based on recent performance
  WITH recent_stats AS (
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE success) as successes
    FROM skill_executions
    WHERE skill_id = NEW.skill_id
      AND created_at > NOW() - INTERVAL '30 days'
  )
  UPDATE skills
  SET
    confidence = CASE
      WHEN rs.total >= 5 THEN
        -- Weighted average: 70% recent, 30% historical
        (0.7 * (rs.successes::REAL / rs.total)) + (0.3 * skills.confidence)
      ELSE
        skills.confidence
    END,
    status = CASE
      WHEN skills.confidence < 0.5 AND skills.usage_count >= 10 THEN 'needs_refinement'
      ELSE skills.status
    END
  FROM recent_stats rs
  WHERE skills.skill_id = NEW.skill_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: After execution insert
DROP TRIGGER IF EXISTS trigger_update_skill_metrics ON skill_executions;
CREATE TRIGGER trigger_update_skill_metrics
AFTER INSERT ON skill_executions
FOR EACH ROW
EXECUTE FUNCTION update_skill_metrics();

-- Function: Update transfer validation metrics
CREATE OR REPLACE FUNCTION update_transfer_validation()
RETURNS TRIGGER AS $$
DECLARE
  transfer_rec RECORD;
BEGIN
  -- Find active transfer for this skill/agent combination
  SELECT * INTO transfer_rec
  FROM skill_transfers
  WHERE skill_id = NEW.skill_id
    AND target_agent = NEW.agent
    AND status = 'validating';

  IF FOUND THEN
    UPDATE skill_transfers
    SET
      validation_uses = validation_uses + 1,
      validation_successes = validation_successes + CASE WHEN NEW.success THEN 1 ELSE 0 END
    WHERE id = transfer_rec.id;

    -- Check if validation threshold reached
    IF transfer_rec.validation_uses + 1 >= transfer_rec.validation_threshold THEN
      -- Calculate final success rate
      IF (transfer_rec.validation_successes + CASE WHEN NEW.success THEN 1 ELSE 0 END)::REAL /
         (transfer_rec.validation_uses + 1) >= transfer_rec.acceptance_threshold THEN
        -- Accept transfer
        UPDATE skill_transfers
        SET status = 'accepted', validated_at = NOW()
        WHERE id = transfer_rec.id;
      ELSIF (transfer_rec.validation_successes + CASE WHEN NEW.success THEN 1 ELSE 0 END)::REAL /
            (transfer_rec.validation_uses + 1) < transfer_rec.rejection_threshold THEN
        -- Reject transfer
        UPDATE skill_transfers
        SET
          status = 'rejected',
          validated_at = NOW(),
          rollback_reason = 'Below rejection threshold after ' || (transfer_rec.validation_uses + 1) || ' uses'
        WHERE id = transfer_rec.id;

        -- Deactivate assignment
        UPDATE agent_skill_assignments
        SET active = FALSE, deactivated_at = NOW()
        WHERE skill_id = NEW.skill_id AND agent = NEW.agent;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Update transfer validation
DROP TRIGGER IF EXISTS trigger_update_transfer_validation ON skill_executions;
CREATE TRIGGER trigger_update_transfer_validation
AFTER INSERT ON skill_executions
FOR EACH ROW
EXECUTE FUNCTION update_transfer_validation();

-- Function: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update skills.updated_at
DROP TRIGGER IF EXISTS trigger_skills_updated_at ON skills;
CREATE TRIGGER trigger_skills_updated_at
BEFORE UPDATE ON skills
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 8. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_skill_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_refinements ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anonymous reads (for skill loading)
CREATE POLICY "Allow anonymous read skills" ON skills
  FOR SELECT USING (true);

CREATE POLICY "Allow anonymous read skill_executions" ON skill_executions
  FOR SELECT USING (true);

CREATE POLICY "Allow anonymous read skill_transfers" ON skill_transfers
  FOR SELECT USING (true);

CREATE POLICY "Allow anonymous read agent_skill_assignments" ON agent_skill_assignments
  FOR SELECT USING (true);

CREATE POLICY "Allow anonymous read skill_refinements" ON skill_refinements
  FOR SELECT USING (true);

-- Policy: Allow authenticated inserts
CREATE POLICY "Allow authenticated insert skills" ON skills
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated insert skill_executions" ON skill_executions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated insert skill_transfers" ON skill_transfers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated insert agent_skill_assignments" ON agent_skill_assignments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated insert skill_refinements" ON skill_refinements
  FOR INSERT WITH CHECK (true);

-- Policy: Allow authenticated updates
CREATE POLICY "Allow authenticated update skills" ON skills
  FOR UPDATE USING (true);

CREATE POLICY "Allow authenticated update skill_transfers" ON skill_transfers
  FOR UPDATE USING (true);

CREATE POLICY "Allow authenticated update agent_skill_assignments" ON agent_skill_assignments
  FOR UPDATE USING (true);

-- ============================================================================
-- 9. COMMENTS
-- ============================================================================

COMMENT ON TABLE skills IS 'Central registry of learned skills/strategies for the ACE framework';
COMMENT ON TABLE skill_executions IS 'Tracks every use of a skill for learning and metrics';
COMMENT ON TABLE skill_transfers IS 'Manages cross-agent skill transfers with validation';
COMMENT ON TABLE agent_skill_assignments IS 'Maps which skills are available to which agents';
COMMENT ON TABLE skill_refinements IS 'Tracks skill improvements and version history';

COMMENT ON COLUMN skills.confidence IS 'Confidence score (0.0-1.0) based on recent performance. Used for skill selection.';
COMMENT ON COLUMN skills.content IS 'JSONB containing skill instructions, patterns, examples, and anti-patterns';
COMMENT ON COLUMN skill_transfers.validation_threshold IS 'Number of uses required before transfer decision';
COMMENT ON COLUMN skill_transfers.acceptance_threshold IS 'Success rate required to accept transfer (default 80%)';

-- ============================================================================
-- End of Migration
-- ============================================================================

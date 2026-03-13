-- ============================================================================
-- ACE Framework: Extend Reflections with Skills Tracking
-- Version: 1.0.0
-- Created: 2025-12-06
--
-- Adds skills_used and skill_feedback columns to the reflections table
-- to close the feedback loop between reflections and skill confidence.
-- ============================================================================

-- Add skills_used column (array of skill IDs used during session)
ALTER TABLE reflections
ADD COLUMN IF NOT EXISTS skills_used JSONB DEFAULT '[]';

-- Add skill_feedback column (per-skill success/failure feedback)
ALTER TABLE reflections
ADD COLUMN IF NOT EXISTS skill_feedback JSONB DEFAULT '{}';
-- Structure:
-- {
--   "skill_id_1": {"success": true, "notes": "worked well"},
--   "skill_id_2": {"success": false, "error_type": "validation", "notes": "needs refinement"}
-- }

-- Add index for querying reflections by skill
CREATE INDEX IF NOT EXISTS idx_reflections_skills_used
  ON reflections USING GIN(skills_used);

-- Add index for skill feedback queries
CREATE INDEX IF NOT EXISTS idx_reflections_skill_feedback
  ON reflections USING GIN(skill_feedback);

-- ============================================================================
-- View: Skill performance from reflections
-- ============================================================================

CREATE OR REPLACE VIEW reflection_skill_performance AS
SELECT
  j.value::TEXT as skill_id,
  COUNT(*) as total_uses,
  COUNT(*) FILTER (WHERE (r.skill_feedback->>(j.value::TEXT))::JSONB->>'success' = 'true') as successes,
  COUNT(*) FILTER (WHERE (r.skill_feedback->>(j.value::TEXT))::JSONB->>'success' = 'false') as failures,
  ROUND(
    (COUNT(*) FILTER (WHERE (r.skill_feedback->>(j.value::TEXT))::JSONB->>'success' = 'true')::NUMERIC /
     NULLIF(COUNT(*), 0)) * 100, 1
  ) as success_rate_pct
FROM reflections r,
     jsonb_array_elements(r.skills_used) j
WHERE r.skills_used IS NOT NULL
  AND jsonb_array_length(r.skills_used) > 0
GROUP BY j.value::TEXT
ORDER BY total_uses DESC;

-- ============================================================================
-- Function: Update skill confidence from reflection feedback
-- ============================================================================

CREATE OR REPLACE FUNCTION process_reflection_skill_feedback()
RETURNS TRIGGER AS $$
DECLARE
  skill_rec RECORD;
  feedback JSONB;
  skill_id_val TEXT;
BEGIN
  -- Only process if skills_used is populated
  IF NEW.skills_used IS NULL OR jsonb_array_length(NEW.skills_used) = 0 THEN
    RETURN NEW;
  END IF;

  -- Process each skill used
  FOR skill_rec IN SELECT jsonb_array_elements_text(NEW.skills_used) as skill_id
  LOOP
    skill_id_val := skill_rec.skill_id;

    -- Get feedback for this skill if provided
    feedback := NEW.skill_feedback->skill_id_val;

    -- If no explicit feedback, infer from reflection outcome
    IF feedback IS NULL THEN
      -- Use reflection outcome to infer skill success
      IF NEW.data->>'outcome' = 'success' THEN
        feedback := '{"success": true, "inferred": true}'::JSONB;
      ELSIF NEW.data->>'outcome' = 'failure' OR jsonb_array_length(COALESCE(NEW.data->'errors', '[]'::JSONB)) > 0 THEN
        feedback := '{"success": false, "inferred": true}'::JSONB;
      ELSE
        -- Skip if cannot determine outcome
        CONTINUE;
      END IF;
    END IF;

    -- Record execution in skill_executions table
    INSERT INTO skill_executions (
      skill_id,
      agent,
      session_id,
      success,
      error_type,
      context,
      user_email,
      created_at
    ) VALUES (
      skill_id_val,
      COALESCE(NEW.data->>'agent', 'unknown'),
      NEW.id::TEXT,  -- Use reflection ID as session
      (feedback->>'success')::BOOLEAN,
      feedback->>'error_type',
      jsonb_build_object(
        'reflection_id', NEW.id,
        'org', NEW.org,
        'focus_area', NEW.focus_area,
        'inferred', COALESCE((feedback->>'inferred')::BOOLEAN, FALSE)
      ),
      NEW.user_email,
      NEW.created_at
    )
    ON CONFLICT DO NOTHING;  -- Ignore if already processed

  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Trigger: Process skill feedback on reflection insert/update
-- ============================================================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_process_reflection_skill_feedback ON reflections;

-- Create trigger
CREATE TRIGGER trigger_process_reflection_skill_feedback
AFTER INSERT OR UPDATE OF skills_used, skill_feedback ON reflections
FOR EACH ROW
EXECUTE FUNCTION process_reflection_skill_feedback();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON COLUMN reflections.skills_used IS
  'Array of skill IDs used during the session that generated this reflection';

COMMENT ON COLUMN reflections.skill_feedback IS
  'Per-skill feedback object: {"skill_id": {"success": bool, "error_type": str, "notes": str}}';

COMMENT ON VIEW reflection_skill_performance IS
  'Aggregated skill performance metrics derived from reflection feedback';

-- ============================================================================
-- End of Migration
-- ============================================================================

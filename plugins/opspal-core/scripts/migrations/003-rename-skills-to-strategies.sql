-- ============================================================================
-- ACE Framework: Rename Skills to Strategies
-- Version: 1.0.0
-- Created: 2025-12-06
--
-- This migration renames all skill-related tables and columns to use
-- "strategy" terminology to avoid confusion with Claude Code's native
-- Skills feature (.claude/skills/).
--
-- Background: The ACE Framework originally used "skills" for database-backed
-- strategy tracking. Claude Code later introduced native "Skills" as a
-- different concept (model-invoked capabilities via SKILL.md files).
-- This rename prevents naming collisions and confusion.
--
-- Migration is SAFE and REVERSIBLE via DOWN migration.
-- ============================================================================

-- ============================================================================
-- UP MIGRATION
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Rename main skills table to strategies
-- ----------------------------------------------------------------------------

-- Rename table
ALTER TABLE IF EXISTS skills RENAME TO strategies;

-- Rename columns containing 'skill'
ALTER TABLE IF EXISTS strategies RENAME COLUMN skill_id TO strategy_id;

-- Rename indexes
ALTER INDEX IF EXISTS idx_skills_skill_id RENAME TO idx_strategies_strategy_id;
ALTER INDEX IF EXISTS idx_skills_source_agent RENAME TO idx_strategies_source_agent;
ALTER INDEX IF EXISTS idx_skills_category RENAME TO idx_strategies_category;
ALTER INDEX IF EXISTS idx_skills_status RENAME TO idx_strategies_status;
ALTER INDEX IF EXISTS idx_skills_success_rate RENAME TO idx_strategies_success_rate;
ALTER INDEX IF EXISTS idx_skills_confidence RENAME TO idx_strategies_confidence;
ALTER INDEX IF EXISTS idx_skills_tags RENAME TO idx_strategies_tags;
ALTER INDEX IF EXISTS idx_skills_last_used RENAME TO idx_strategies_last_used;

-- ----------------------------------------------------------------------------
-- 2. Rename skill_executions table to strategy_executions
-- ----------------------------------------------------------------------------

ALTER TABLE IF EXISTS skill_executions RENAME TO strategy_executions;
ALTER TABLE IF EXISTS strategy_executions RENAME COLUMN skill_id TO strategy_id;

-- Rename indexes
ALTER INDEX IF EXISTS idx_skill_executions_skill_id RENAME TO idx_strategy_executions_strategy_id;
ALTER INDEX IF EXISTS idx_skill_executions_agent RENAME TO idx_strategy_executions_agent;
ALTER INDEX IF EXISTS idx_skill_executions_session RENAME TO idx_strategy_executions_session;
ALTER INDEX IF EXISTS idx_skill_executions_executed_at RENAME TO idx_strategy_executions_executed_at;

-- Update foreign key constraint
ALTER TABLE IF EXISTS strategy_executions
  DROP CONSTRAINT IF EXISTS skill_executions_skill_id_fkey,
  ADD CONSTRAINT strategy_executions_strategy_id_fkey
    FOREIGN KEY (strategy_id) REFERENCES strategies(strategy_id)
    ON DELETE CASCADE;

-- ----------------------------------------------------------------------------
-- 3. Rename skill_transfers table to strategy_transfers
-- ----------------------------------------------------------------------------

ALTER TABLE IF EXISTS skill_transfers RENAME TO strategy_transfers;
ALTER TABLE IF EXISTS strategy_transfers RENAME COLUMN skill_id TO strategy_id;

-- Rename indexes
ALTER INDEX IF EXISTS idx_skill_transfers_skill_id RENAME TO idx_strategy_transfers_strategy_id;
ALTER INDEX IF EXISTS idx_skill_transfers_source_agent RENAME TO idx_strategy_transfers_source_agent;
ALTER INDEX IF EXISTS idx_skill_transfers_target_agent RENAME TO idx_strategy_transfers_target_agent;
ALTER INDEX IF EXISTS idx_skill_transfers_status RENAME TO idx_strategy_transfers_status;

-- Update foreign key constraint
ALTER TABLE IF EXISTS strategy_transfers
  DROP CONSTRAINT IF EXISTS skill_transfers_skill_id_fkey,
  ADD CONSTRAINT strategy_transfers_strategy_id_fkey
    FOREIGN KEY (strategy_id) REFERENCES strategies(strategy_id)
    ON DELETE CASCADE;

-- ----------------------------------------------------------------------------
-- 4. Rename skill_refinements table to strategy_refinements
-- ----------------------------------------------------------------------------

ALTER TABLE IF EXISTS skill_refinements RENAME TO strategy_refinements;
ALTER TABLE IF EXISTS strategy_refinements RENAME COLUMN skill_id TO strategy_id;

-- Rename indexes
ALTER INDEX IF EXISTS idx_skill_refinements_skill_id RENAME TO idx_strategy_refinements_strategy_id;
ALTER INDEX IF EXISTS idx_skill_refinements_refined_at RENAME TO idx_strategy_refinements_refined_at;

-- Update foreign key constraint
ALTER TABLE IF EXISTS strategy_refinements
  DROP CONSTRAINT IF EXISTS skill_refinements_skill_id_fkey,
  ADD CONSTRAINT strategy_refinements_strategy_id_fkey
    FOREIGN KEY (strategy_id) REFERENCES strategies(strategy_id)
    ON DELETE CASCADE;

-- ----------------------------------------------------------------------------
-- 5. Update reflections table column
-- ----------------------------------------------------------------------------

-- Rename skills_used column to strategies_used
ALTER TABLE IF EXISTS reflections
  RENAME COLUMN skills_used TO strategies_used;

-- Update comment
COMMENT ON COLUMN reflections.strategies_used IS
  'Array of strategy IDs used in this session (renamed from skills_used in v3)';

-- ----------------------------------------------------------------------------
-- 6. Update function names (if any exist)
-- ----------------------------------------------------------------------------

-- Note: If there are stored procedures or functions using 'skill' naming,
-- they should be updated here. For now, the registry uses JavaScript
-- functions which have been renamed in the code.

-- ----------------------------------------------------------------------------
-- 7. Add migration tracking
-- ----------------------------------------------------------------------------

INSERT INTO schema_migrations (version, description, executed_at)
VALUES ('003', 'Rename skills to strategies for ACE Framework', NOW())
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- DOWN MIGRATION (for rollback)
-- ============================================================================

-- To rollback this migration, run these commands in reverse order:

-- ALTER TABLE strategies RENAME TO skills;
-- ALTER TABLE strategies RENAME COLUMN strategy_id TO skill_id;
-- ALTER TABLE strategy_executions RENAME TO skill_executions;
-- ALTER TABLE strategy_executions RENAME COLUMN strategy_id TO skill_id;
-- ALTER TABLE strategy_transfers RENAME TO skill_transfers;
-- ALTER TABLE strategy_transfers RENAME COLUMN strategy_id TO skill_id;
-- ALTER TABLE strategy_refinements RENAME TO skill_refinements;
-- ALTER TABLE strategy_refinements RENAME COLUMN strategy_id TO skill_id;
-- ALTER TABLE reflections RENAME COLUMN strategies_used TO skills_used;
-- (Also rename all indexes back)

-- DELETE FROM schema_migrations WHERE version = '003';

-- Migration: Add diagnostic context to reflections table
-- Purpose: Enable plugin-doctor to store infrastructure diagnostic data with reflections
-- Author: plugin-doctor system
-- Date: 2025-11-14
-- Version: 1.0.0

-- Add diagnostic_context column to store full diagnostic data
ALTER TABLE reflections
ADD COLUMN IF NOT EXISTS diagnostic_context JSONB;

-- Add infrastructure_issue flag to identify plugin/system issues vs user issues
ALTER TABLE reflections
ADD COLUMN IF NOT EXISTS infrastructure_issue BOOLEAN DEFAULT FALSE;

-- Create index on infrastructure_issue for efficient filtering
CREATE INDEX IF NOT EXISTS idx_reflections_infrastructure_issue
ON reflections(infrastructure_issue)
WHERE infrastructure_issue = TRUE;

-- Create GIN index on diagnostic_context for JSON querying
CREATE INDEX IF NOT EXISTS idx_reflections_diagnostic_context
ON reflections USING GIN (diagnostic_context);

-- Add comment to document columns
COMMENT ON COLUMN reflections.diagnostic_context IS
'JSONB object containing full diagnostic data from plugin-doctor including: plugin_health, mcp_status, recent_errors, hook_failures, agent_discovery, dependencies';

COMMENT ON COLUMN reflections.infrastructure_issue IS
'Boolean flag indicating whether the reflection is related to infrastructure/plugin issues (true) vs user code issues (false)';

-- Sample diagnostic_context structure (for reference):
-- {
--   "plugin_health": {
--     "salesforce-plugin": { "status": "OK", "agents_loaded": 51 },
--     "hubspot-plugin": { "status": "OK", "agents_loaded": 35 }
--   },
--   "mcp_status": {
--     "supabase": { "status": "OK", "latency_ms": 300 },
--     "asana": { "status": "OK", "latency_ms": 150 }
--   },
--   "recent_errors": [
--     {
--       "error_type": "hook_execution_failure",
--       "message": "jq: command not found",
--       "occurrences": 3,
--       "last_seen": "2025-11-14T11:45:00Z"
--     }
--   ],
--   "hook_failures": [
--     { "hook": "pre-reflect.sh", "error": "jq not found", "count": 3 }
--   ],
--   "agent_discovery": {
--     "total": 146,
--     "loaded": 140,
--     "failed": 6
--   },
--   "dependencies": {
--     "node": { "installed": true, "version": "20.10.0" },
--     "jq": { "installed": false, "required": true }
--   },
--   "infrastructure_issue": true,
--   "severity": "high",
--   "timestamp": "2025-11-14T12:00:00Z"
-- }

-- Verify migration
DO $$
BEGIN
    -- Check if columns exist
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'reflections'
        AND column_name = 'diagnostic_context'
    ) AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'reflections'
        AND column_name = 'infrastructure_issue'
    ) THEN
        RAISE NOTICE '✓ Migration successful: diagnostic_context and infrastructure_issue columns added';
    ELSE
        RAISE EXCEPTION '✗ Migration failed: columns not created';
    END IF;
END $$;

-- Example queries enabled by this migration:

-- 1. Get all infrastructure issues
-- SELECT id, created_at, org, focus_area, diagnostic_context->>'severity' as severity
-- FROM reflections
-- WHERE infrastructure_issue = TRUE
-- ORDER BY created_at DESC;

-- 2. Find reflections with specific error types
-- SELECT id, created_at, org,
--        jsonb_array_length(diagnostic_context->'recent_errors') as error_count
-- FROM reflections
-- WHERE diagnostic_context->'recent_errors' @> '[{"error_type": "hook_execution_failure"}]';

-- 3. Get MCP connectivity issues
-- SELECT id, created_at, org,
--        diagnostic_context->'mcp_status' as mcp_status
-- FROM reflections
-- WHERE infrastructure_issue = TRUE
--   AND diagnostic_context->'mcp_status' IS NOT NULL;

-- 4. Find missing dependencies across all reflections
-- SELECT
--   jsonb_object_keys(diagnostic_context->'dependencies') as dependency,
--   COUNT(*) as occurrences
-- FROM reflections
-- WHERE infrastructure_issue = TRUE
--   AND diagnostic_context->'dependencies' IS NOT NULL
-- GROUP BY dependency
-- ORDER BY occurrences DESC;

-- 5. Infrastructure issue trends over time
-- SELECT
--   DATE(created_at) as date,
--   COUNT(*) as infrastructure_issues,
--   COUNT(*) FILTER (WHERE diagnostic_context->>'severity' = 'high') as high_severity
-- FROM reflections
-- WHERE infrastructure_issue = TRUE
-- GROUP BY DATE(created_at)
-- ORDER BY date DESC
-- LIMIT 30;

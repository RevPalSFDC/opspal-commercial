-- ============================================
-- Project Connect - Rollback Migration
-- ============================================
--
-- Rollback for: 001_project_connect_tables
-- Created: 2025-10-31
-- Description: Safely removes customer_project_directory and revpal_access_log tables
--
-- WARNING: This will delete all customer project data and access logs!
--          Make a backup before running this rollback.
--
-- Backup command:
--   pg_dump -t customer_project_directory -t revpal_access_log > backup_project_connect.sql
--

-- Start transaction
BEGIN;

-- Drop RLS policies
DROP POLICY IF EXISTS "Allow authenticated read" ON customer_project_directory;
DROP POLICY IF EXISTS "Allow service role all" ON revpal_access_log;

-- Drop indexes (will be automatically dropped with tables, but explicit for clarity)
DROP INDEX IF EXISTS idx_customer_name;
DROP INDEX IF EXISTS idx_customer_aliases;
DROP INDEX IF EXISTS idx_github_repo;
DROP INDEX IF EXISTS idx_drive_folder;
DROP INDEX IF EXISTS idx_last_accessed;

DROP INDEX IF EXISTS idx_customer_access;
DROP INDEX IF EXISTS idx_system_access;
DROP INDEX IF EXISTS idx_action_type;
DROP INDEX IF EXISTS idx_user_access;
DROP INDEX IF EXISTS idx_date_access;

-- Drop tables (CASCADE to handle foreign key references)
DROP TABLE IF EXISTS revpal_access_log CASCADE;
DROP TABLE IF EXISTS customer_project_directory CASCADE;

-- Commit transaction
COMMIT;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Rollback 001_project_connect_tables completed successfully';
  RAISE NOTICE 'Dropped tables: revpal_access_log, customer_project_directory';
  RAISE NOTICE 'Dropped all associated indexes and policies';
  RAISE WARNING 'All customer project data and access logs have been deleted';
END $$;

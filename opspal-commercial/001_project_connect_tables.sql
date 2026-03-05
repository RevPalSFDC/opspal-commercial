-- ============================================
-- Project Connect - Customer Project Directory
-- ============================================
--
-- Migration: 001_project_connect_tables
-- Created: 2025-10-31
-- Description: Creates customer_project_directory and revpal_access_log tables
--              for tracking customer onboarding across GitHub, Google Drive, and Asana
--
-- Tables:
--   - customer_project_directory: Central directory of customer projects
--   - revpal_access_log: Audit log of all system access operations
--

-- Customer Project Directory Table
-- Stores central mapping of customers to their GitHub repos, Drive folders, and Asana projects
CREATE TABLE IF NOT EXISTS customer_project_directory (
  customer_id TEXT PRIMARY KEY,
  customer TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}',

  -- GitHub
  github_repo TEXT,
  github_repo_url TEXT,

  -- Google Drive
  drive_folder_id TEXT,
  drive_folder_url TEXT,

  -- Asana
  asana_project_ids TEXT[] DEFAULT '{}',
  asana_project_urls TEXT[] DEFAULT '{}',

  -- Audit fields
  created_by TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_by TEXT,
  last_accessed_date TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  schema_version TEXT DEFAULT '1.0.0',

  -- Constraints
  CONSTRAINT customer_name_not_empty CHECK (LENGTH(TRIM(customer)) > 0),
  CONSTRAINT customer_id_pattern CHECK (customer_id ~ '^RP-[A-Z]{3}[0-9]{6}$')
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_customer_name
  ON customer_project_directory(customer);

CREATE INDEX IF NOT EXISTS idx_customer_aliases
  ON customer_project_directory USING GIN(aliases);

CREATE INDEX IF NOT EXISTS idx_github_repo
  ON customer_project_directory(github_repo);

CREATE INDEX IF NOT EXISTS idx_drive_folder
  ON customer_project_directory(drive_folder_id);

CREATE INDEX IF NOT EXISTS idx_last_accessed
  ON customer_project_directory(last_accessed_date DESC NULLS LAST);

-- RevPal Access Log Table
-- Logs all operations across GitHub, Drive, Asana, and Supabase
CREATE TABLE IF NOT EXISTS revpal_access_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id TEXT REFERENCES customer_project_directory(customer_id) ON DELETE CASCADE,

  -- System information
  system TEXT NOT NULL CHECK (system IN ('github', 'drive', 'asana', 'supabase')),
  system_id TEXT,
  object TEXT,
  action TEXT NOT NULL CHECK (action IN ('read', 'create', 'connect', 'update', 'delete', 'confirm')),

  -- Request metadata (keys only, no sensitive values)
  headers JSONB DEFAULT '{}',

  -- Performance tracking
  dataset_size INTEGER,
  duration_ms INTEGER,

  -- Script context
  running_script TEXT,

  -- Audit fields
  date TIMESTAMPTZ DEFAULT NOW(),
  user_email TEXT NOT NULL,

  -- Additional metadata
  metadata JSONB DEFAULT '{}',

  -- Result tracking
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,

  -- Constraints
  CONSTRAINT user_email_format CHECK (user_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

-- Indexes for access log queries
CREATE INDEX IF NOT EXISTS idx_customer_access
  ON revpal_access_log(customer_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_system_access
  ON revpal_access_log(system, date DESC);

CREATE INDEX IF NOT EXISTS idx_action_type
  ON revpal_access_log(action, date DESC);

CREATE INDEX IF NOT EXISTS idx_user_access
  ON revpal_access_log(user_email, date DESC);

CREATE INDEX IF NOT EXISTS idx_date_access
  ON revpal_access_log(date DESC);

-- Comments for documentation
COMMENT ON TABLE customer_project_directory IS
  'Central directory mapping customers to GitHub repositories, Google Drive folders, and Asana projects';

COMMENT ON TABLE revpal_access_log IS
  'Audit log of all system access operations for compliance and debugging';

COMMENT ON COLUMN customer_project_directory.customer_id IS
  'Format: RP-{FIRST_3_LETTERS}{RANDOM_6_DIGITS} (e.g., RP-ACM123456)';

COMMENT ON COLUMN customer_project_directory.aliases IS
  'Alternative names/abbreviations for the customer used in lookups';

COMMENT ON COLUMN revpal_access_log.headers IS
  'Request headers with keys only (no sensitive values) for debugging';

COMMENT ON COLUMN revpal_access_log.dataset_size IS
  'Number of records read/written (null for non-bulk operations)';

-- Grant permissions (adjust based on your RLS policies)
-- These are examples - customize based on your security requirements
ALTER TABLE customer_project_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE revpal_access_log ENABLE ROW LEVEL SECURITY;

-- Example RLS policy for customer_project_directory (read-only for authenticated users)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'customer_project_directory'
    AND policyname = 'Allow authenticated read'
  ) THEN
    CREATE POLICY "Allow authenticated read"
      ON customer_project_directory
      FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Example RLS policy for revpal_access_log (service role only for writes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'revpal_access_log'
    AND policyname = 'Allow service role all'
  ) THEN
    CREATE POLICY "Allow service role all"
      ON revpal_access_log
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Migration 001_project_connect_tables completed successfully';
  RAISE NOTICE 'Created tables: customer_project_directory, revpal_access_log';
  RAISE NOTICE 'Created indexes for optimized lookups';
  RAISE NOTICE 'Enabled RLS with example policies';
END $$;

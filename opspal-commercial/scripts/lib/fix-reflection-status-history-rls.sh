#!/usr/bin/env bash
set -euo pipefail

# Dev-tool remediation for Supabase linter rule:
# rls_disabled_in_public on public.reflection_status_history
#
# Usage:
#   bash scripts/lib/fix-reflection-status-history-rls.sh [--skip-lint]

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

SKIP_LINT=false
for arg in "$@"; do
  case "$arg" in
    --skip-lint) SKIP_LINT=true ;;
  esac
done

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env >/dev/null 2>&1 || true
  set +a
fi

PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
if [[ -z "$PROJECT_REF" && -f supabase/.temp/project-ref ]]; then
  PROJECT_REF="$(cat supabase/.temp/project-ref)"
fi

if [[ -z "$PROJECT_REF" ]]; then
  echo "Error: SUPABASE_PROJECT_REF missing and supabase/.temp/project-ref not found."
  exit 1
fi

if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "Error: SUPABASE_DB_PASSWORD is required in .env."
  exit 1
fi

DB_HOST="${SUPABASE_DB_HOST:-aws-1-us-east-1.pooler.supabase.com}"
DB_PORT="${SUPABASE_DB_PORT:-5432}"
DB_NAME="${SUPABASE_DB_NAME:-postgres}"
DB_USER="postgres.${PROJECT_REF}"

echo "Applying RLS remediation to public.reflection_status_history in project ${PROJECT_REF}..."

PGPASSWORD="$SUPABASE_DB_PASSWORD" psql \
  "host=${DB_HOST} port=${DB_PORT} user=${DB_USER} dbname=${DB_NAME} sslmode=require" \
  -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE IF EXISTS public.reflection_status_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.reflection_status_history') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'reflection_status_history'
        AND policyname = 'reflection_status_history_service_role_all'
    ) THEN
      EXECUTE '
        CREATE POLICY reflection_status_history_service_role_all
        ON public.reflection_status_history
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true)
      ';
    END IF;
  END IF;
END;
$$;
SQL

echo "Verifying table RLS + policies..."

PGPASSWORD="$SUPABASE_DB_PASSWORD" psql \
  "host=${DB_HOST} port=${DB_PORT} user=${DB_USER} dbname=${DB_NAME} sslmode=require" \
  -v ON_ERROR_STOP=1 \
  -Atc "
    SELECT 'rls_flags=' || c.relrowsecurity || '|' || c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='reflection_status_history';

    SELECT 'policy=' || policyname || ' roles=' || roles::text || ' cmd=' || cmd
    FROM pg_policies
    WHERE schemaname='public' AND tablename='reflection_status_history'
    ORDER BY policyname;
  "

if [[ "$SKIP_LINT" == "false" ]]; then
  echo "Running supabase db lint --linked..."
  supabase db lint --linked
fi

echo "Done."

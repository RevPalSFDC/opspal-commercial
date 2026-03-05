#!/usr/bin/env bash
# env.sh — Centralized environment defaults for ClaudeSFDC (Salesforce only)
# Scope: This file is project-local and not shared with ClaudeHubSpot.

# Safe bash settings for sourced script
set -uo pipefail

# Resolve XDG-style directories
: "${XDG_STATE_HOME:=${HOME}/.local/state}"
: "${XDG_CACHE_HOME:=${HOME}/.cache}"
: "${XDG_RUNTIME_DIR:=${HOME}/.local/run}"

# App-scoped dirs
: "${CLAUDESFDC_STATE_DIR:=${XDG_STATE_HOME}/claudesfdc}"
: "${CLAUDESFDC_LOG_DIR:=${CLAUDESFDC_STATE_DIR}/logs}"
: "${CLAUDESFDC_TMP_DIR:=${TMPDIR:-/tmp}/claudesfdc-${USER}}"
: "${CLAUDESFDC_RUN_DIR:=${XDG_RUNTIME_DIR}/claudesfdc}"

# Allow callers to override via LOG_DIR/TMP_DIR/RUNTIME_DIR but default to above
: "${LOG_DIR:=${CLAUDESFDC_LOG_DIR}}"
: "${TMP_DIR:=${CLAUDESFDC_TMP_DIR}}"
: "${RUNTIME_DIR:=${CLAUDESFDC_RUN_DIR}}"

# Ensure directories exist (best-effort)
mkdir -p "${LOG_DIR}" "${TMP_DIR}" "${RUNTIME_DIR}" 2>/dev/null || true

# Export for child processes
export LOG_DIR TMP_DIR RUNTIME_DIR


#!/usr/bin/env node

/**
 * Hook Health Reflection Generator
 *
 * Converts hook-health-checker JSON output into self-improvement reflections
 * and submits them to Supabase via submit-reflection.js.
 *
 * Features:
 * - Skips HEALTHY status (no reflection needed)
 * - Filters out environment-constrained checks
 * - SHA-256 fingerprint deduplication (24h window)
 * - Maps CheckResult fields to reflection issue schema
 * - Runs submit-reflection.js as child process
 * - Always exits 0 (non-fatal to caller)
 *
 * Usage:
 *   echo '<json>' | node hook-health-reflection-generator.js --stdin
 *   node hook-health-reflection-generator.js summary.json
 *   node hook-health-reflection-generator.js --stdin --dry-run
 *
 * @module hook-health-reflection-generator
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

// =============================================================================
// Configuration
// =============================================================================

const STATE_FILE = path.join(__dirname, '../../data/hook-health-state.json');
const REFLECTION_DIR = path.join(process.cwd(), '.claude');
const SUBMIT_SCRIPT = path.join(__dirname, 'submit-reflection.js');
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// =============================================================================
// State Management (follows debug-log-analyzer.js pattern)
// =============================================================================

function ensureDataDir() {
  const dataDir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch {
    // State file corrupted or missing — start fresh
  }
  return {
    last_fingerprint: null,
    last_submission_time: null,
    total_submissions: 0,
    version: '1.0.0'
  };
}

function saveState(state) {
  ensureDataDir();
  state.last_updated = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// =============================================================================
// Fingerprinting
// =============================================================================

function computeFingerprint(issues) {
  const tuples = issues
    .map(r => `${r.stage}|${r.name}|${r.message}`)
    .sort();
  return crypto.createHash('sha256').update(tuples.join('\n')).digest('hex');
}

// =============================================================================
// Issue Mapping
// =============================================================================

function mapSeverityToBlastRadius(severity) {
  switch (severity) {
    case 'CRITICAL':
    case 'HIGH':
      return 'HIGH';
    case 'MEDIUM':
      return 'MEDIUM';
    default:
      return 'LOW';
  }
}

function mapSeverityToPriority(severity) {
  switch (severity) {
    case 'CRITICAL': return 'P0';
    case 'HIGH': return 'P1';
    case 'MEDIUM': return 'P2';
    default: return 'P3';
  }
}

function mapStageTaxonomy(stage) {
  // Stages 2-4 (file/syntax/dep) are config/env issues
  if (stage >= 2 && stage <= 4) return 'config-env';
  // Everything else is hook-health
  return 'hook-health';
}

function agnosticFixForTaxonomy(taxonomy) {
  if (taxonomy === 'config-env') {
    return 'Ensure hook scripts exist, have correct syntax, and declare dependencies';
  }
  return 'Redirect all stdout to stderr in side-effect hooks; validate JSON output schema';
}

function mapResultToIssue(result) {
  const msgHash = crypto.createHash('sha256').update(result.message || '').digest('hex').slice(0, 8);
  const taxonomy = mapStageTaxonomy(result.stage);

  return {
    id: `hook-health-S${result.stage}-${msgHash}`,
    taxonomy,
    reproducible_trigger: `Run /hooks-health — Stage ${result.stage}: ${result.name}`,
    root_cause: result.message,
    minimal_patch: result.fix || (result.details && result.details.recommendation) || null,
    agnostic_fix: agnosticFixForTaxonomy(taxonomy),
    blast_radius: mapSeverityToBlastRadius(result.severity),
    priority: mapSeverityToPriority(result.severity)
  };
}

// =============================================================================
// Reflection Builder
// =============================================================================

function buildReflection(summary, nonHealthyResults, fingerprint) {
  const issueCount = nonHealthyResults.length;
  const outcome = summary.status === 'UNHEALTHY' ? 'failure' : 'partial';

  return {
    summary: `Hook health: ${summary.status} (score ${summary.score}/100) — ${issueCount} issue${issueCount !== 1 ? 's' : ''}`,
    focus_area: 'hook-health',
    outcome,
    session_metadata: {
      org: process.env.ORG_SLUG || null,
      duration_minutes: null
    },
    issues_identified: nonHealthyResults.map(mapResultToIssue),
    _meta: {
      source: 'hook-health-checker',
      health_score: summary.score,
      health_status: summary.status,
      checker_timestamp: summary.timestamp,
      fingerprint: `sha256-${fingerprint}`,
      auto_generated: true
    }
  };
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const useStdin = args.includes('--stdin');
  const dryRun = args.includes('--dry-run');
  const filePath = args.find(a => !a.startsWith('--'));

  // Read input
  let rawInput;
  if (useStdin) {
    rawInput = await new Promise((resolve, reject) => {
      const chunks = [];
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => chunks.push(chunk));
      process.stdin.on('end', () => resolve(chunks.join('')));
      process.stdin.on('error', reject);
      // Timeout after 30s
      setTimeout(() => resolve(chunks.join('')), 30000);
    });
  } else if (filePath) {
    rawInput = fs.readFileSync(filePath, 'utf8');
  } else {
    console.error('Usage: node hook-health-reflection-generator.js [--stdin | <file>] [--dry-run]');
    process.exit(0);
  }

  // Parse
  let summary;
  try {
    summary = JSON.parse(rawInput.trim());
  } catch (e) {
    console.error('Failed to parse health summary JSON:', e.message);
    process.exit(0);
  }

  // Exit immediately if healthy
  if (summary.status === 'HEALTHY') {
    process.exit(0);
  }

  // Filter to non-HEALTHY, non-environment-constrained results
  const results = (summary.results || []);
  const nonHealthy = results.filter(r => {
    if (!r || r.status === 'HEALTHY') return false;
    if (r.details && r.details.isEnvironmentConstraint) return false;
    return true;
  });

  if (nonHealthy.length === 0) {
    process.exit(0);
  }

  // Compute fingerprint for deduplication
  const fingerprint = computeFingerprint(nonHealthy);

  // Check dedup state
  const state = loadState();
  if (state.last_fingerprint === fingerprint && state.last_submission_time) {
    const elapsed = Date.now() - new Date(state.last_submission_time).getTime();
    if (elapsed < DEDUP_WINDOW_MS) {
      if (dryRun) {
        console.log('Deduplicated — same fingerprint within 24h');
      }
      process.exit(0);
    }
  }

  // Build reflection
  const reflection = buildReflection(summary, nonHealthy, fingerprint);

  // Dry run — print and exit
  if (dryRun) {
    console.log(JSON.stringify(reflection, null, 2));
    process.exit(0);
  }

  // Write reflection file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15);
  const reflectionFileName = `HOOK_HEALTH_REFLECTION_${timestamp}.json`;
  const reflectionPath = path.join(REFLECTION_DIR, reflectionFileName);

  if (!fs.existsSync(REFLECTION_DIR)) {
    fs.mkdirSync(REFLECTION_DIR, { recursive: true });
  }
  fs.writeFileSync(reflectionPath, JSON.stringify(reflection, null, 2), 'utf8');

  // Submit via submit-reflection.js
  try {
    if (fs.existsSync(SUBMIT_SCRIPT)) {
      execFileSync('node', [SUBMIT_SCRIPT, reflectionPath], {
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    }
  } catch {
    // Non-fatal — submit-reflection.js handles retry queue internally
  }

  // Update state
  state.last_fingerprint = fingerprint;
  state.last_submission_time = new Date().toISOString();
  state.total_submissions = (state.total_submissions || 0) + 1;
  saveState(state);

  // Clean up reflection file after successful submission
  try {
    if (fs.existsSync(reflectionPath)) {
      fs.unlinkSync(reflectionPath);
    }
  } catch {
    // Non-fatal
  }

  process.exit(0);
}

main().catch(() => process.exit(0));

#!/usr/bin/env node

/**
 * Runbook Candidate Extractor
 *
 * Transforms raw observations and reflection outputs into structured
 * ObservationCandidate records — the intermediate format between raw telemetry
 * and runbook material.
 *
 * Candidates represent durable knowledge such as:
 * - Environment quirks
 * - Workflow nuances
 * - Known exceptions
 * - Business rules
 * - Troubleshooting patterns
 * - Repeated remediations
 * - Checklist-worthy lessons
 *
 * Usage (programmatic):
 *   const { extractCandidatesFromObservation, filterDurable } = require('./runbook-candidate-extractor');
 *   const candidates = extractCandidatesFromObservation(observation);
 *   const durable = filterDurable(candidates, 0.4);
 *
 * Usage (CLI):
 *   node runbook-candidate-extractor.js --org <alias> --source <observation-file>
 *   node runbook-candidate-extractor.js --org <alias> --reflection <reflection-file>
 *
 * Storage: instances/{org}/runbooks/candidates/{candidateId}.json
 *
 * @module runbook-candidate-extractor
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ── Secrets patterns (never promote) ──────────────────────────────────────

const SECRET_PATTERNS = [
  /(?:api[_-]?key|token|password|secret|auth|credential)[^\s]*\s*[:=]\s*\S{8,}/i,
  /sk-[A-Za-z0-9]{20,}/,
  /ey[A-Za-z0-9._-]{30,}/,
  /xox[bpas]-[A-Za-z0-9-]+/,
  /ghp_[A-Za-z0-9]{20,}/,
  /AKIA[A-Z0-9]{16}/
];

// ── Speculation patterns ───────────────────────────────────────────────────

const SPECULATION_TERMS = ['might', 'could', 'maybe', 'perhaps', 'possibly', 'probably', 'not sure', 'unclear if'];

// ── Generic operations that don't produce candidates on their own ──────────

const GENERIC_OPERATIONS = ['unknown', 'ping', 'health-check', 'test', 'status'];

// ── Valid categories ───────────────────────────────────────────────────────

const VALID_CATEGORIES = [
  'environment-quirk', 'workflow-nuance', 'known-exception',
  'business-rule', 'troubleshooting-pattern', 'remediation-recipe',
  'checklist-lesson', 'integration-note'
];

// ── Internal helpers ───────────────────────────────────────────────────────

function _containsSecrets(text) {
  if (!text) return false;
  return SECRET_PATTERNS.some(pattern => pattern.test(text));
}

function _isConversationalFiller(text) {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length < 15) return true;
  const words = trimmed.split(/\s+/);
  if (words.length < 4) return true;
  // Check if it's just acknowledgment/filler
  const fillerPatterns = /^(ok|okay|done|yes|no|sure|thanks|good|fine|got it|understood|noted)\b/i;
  if (fillerPatterns.test(trimmed) && words.length < 6) return true;
  return false;
}

function _isSpeculative(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return SPECULATION_TERMS.some(term => lower.includes(term));
}

function _shouldIgnoreObservation(observation) {
  const hasNotes = observation.notes && observation.notes.trim().length > 0;
  const hasObjects = observation.context && observation.context.objects && observation.context.objects.length > 0;
  const hasWorkflows = observation.context && observation.context.workflows && observation.context.workflows.length > 0;
  const hasFields = observation.context && observation.context.fields && observation.context.fields.length > 0;
  const isGeneric = GENERIC_OPERATIONS.includes((observation.operation || '').toLowerCase());

  // Ignore if: no notes, no context objects, no workflows, and generic operation
  if (!hasNotes && !hasObjects && !hasWorkflows && !hasFields && isGeneric) {
    return true;
  }

  return false;
}

/**
 * Generate a deterministic candidate ID.
 */
function _generateCandidateId(sourceType, sourceRef, summary) {
  const hash = crypto
    .createHash('sha256')
    .update((sourceRef || '') + '|' + (summary || '').toLowerCase().trim())
    .digest('hex')
    .slice(0, 12);
  return `${sourceType}-${hash}`;
}

/**
 * Generate a dedup hash for summary-based deduplication.
 */
function _summaryHash(summary) {
  return crypto
    .createHash('sha256')
    .update((summary || '').toLowerCase().trim())
    .digest('hex');
}

/**
 * Classify the category of knowledge from an observation.
 */
function _classifyCategory(observation) {
  const notes = (observation.notes || '').toLowerCase();
  const operation = (observation.operation || '').toLowerCase();
  const outcome = (observation.outcome || '').toLowerCase();

  if (outcome === 'failure' && notes.length > 0) {
    if (/workaround|fix|solut|remediat|resolv/i.test(notes)) return 'remediation-recipe';
    if (/exception|error|fail|bug|issue/i.test(notes)) return 'known-exception';
    return 'troubleshooting-pattern';
  }

  if (/environment|config|setting|variable|env\b/i.test(notes)) return 'environment-quirk';
  if (/workflow|process|flow|route|routing/i.test(notes)) return 'workflow-nuance';
  if (/rule|policy|require|must|always|never/i.test(notes)) return 'business-rule';
  if (/integrat|sync|connect|api|webhook/i.test(notes)) return 'integration-note';
  if (/checklist|step|procedure|before|after/i.test(notes)) return 'checklist-lesson';

  // Fallback based on operation type
  if (/deploy|migration/i.test(operation)) return 'troubleshooting-pattern';
  if (/workflow|flow/i.test(operation)) return 'workflow-nuance';

  return 'troubleshooting-pattern';
}

/**
 * Infer proposed scopes from an observation.
 */
function _inferProposedScopes(observation) {
  const scopes = [];

  if (observation.context && observation.context.workflows && observation.context.workflows.length > 0) {
    observation.context.workflows.forEach(w => {
      scopes.push({ scopeType: 'workflow', scopeKey: w });
    });
  }

  if (observation.agent && observation.agent !== 'unknown') {
    scopes.push({ scopeType: 'sub-agent', scopeKey: observation.agent });
  }

  // Infer platform scope if we have platform info
  if (observation.platform) {
    scopes.push({ scopeType: 'platform', scopeKey: observation.platform });
  }

  // Always include org as last resort
  if (observation.org) {
    scopes.push({ scopeType: 'org', scopeKey: observation.org });
  }

  return scopes;
}

/**
 * Build a summary string from an observation.
 */
function _buildSummary(observation) {
  if (observation.notes && observation.notes.trim().length >= 10) {
    // Truncate long notes to 300 chars
    const trimmed = observation.notes.trim();
    return trimmed.length > 300 ? trimmed.slice(0, 297) + '...' : trimmed;
  }

  // Build a synthetic summary from context
  const parts = [];
  if (observation.operation) parts.push(`${observation.operation} operation`);
  if (observation.outcome && observation.outcome !== 'success') parts.push(`resulted in ${observation.outcome}`);
  if (observation.context && observation.context.objects && observation.context.objects.length > 0) {
    parts.push(`on ${observation.context.objects.join(', ')}`);
  }

  const summary = parts.join(' ');
  return summary.length >= 10 ? summary : null;
}

// ── Exported scoring functions ─────────────────────────────────────────────

/**
 * Score the durability of a candidate (how likely it is reusable across sessions).
 *
 * @param {Object} candidate - ObservationCandidate
 * @returns {number} Score from 0.0 to 1.0
 */
function scoreDurability(candidate) {
  let score = 0.3; // baseline

  // Positive signals
  if ((candidate.recurrenceCount || 1) > 1) score += 0.3;
  if (/workaround|fix|solut|remediat|resolv/i.test(candidate.evidence || '')) score += 0.2;
  if (['environment-quirk', 'integration-note'].includes(candidate.category)) score += 0.2;
  if (candidate.category === 'business-rule') score += 0.2;
  if (candidate.category === 'known-exception' && candidate.evidence) score += 0.15;
  if ((candidate.relatedObjects || []).length > 0) score += 0.1;

  // Negative signals
  if (_isConversationalFiller(candidate.summary)) score -= 0.3;
  if (_isSpeculative(candidate.summary + ' ' + (candidate.evidence || ''))) score -= 0.2;

  return Math.max(0, Math.min(1, score));
}

/**
 * Score the confidence of a candidate.
 *
 * @param {Object} candidate - ObservationCandidate
 * @returns {number} Score from 0.0 to 1.0
 */
function scoreConfidence(candidate) {
  let score = 0.4; // baseline

  // Source type credibility
  if (candidate.sourceType === 'exception-pattern') score += 0.2;
  if (candidate.sourceType === 'remediation') score += 0.15;
  if (candidate.sourceType === 'reflection') score += 0.1;

  // Evidence quality
  if (candidate.evidence && candidate.evidence.length > 50) score += 0.15;
  if (candidate.evidence && candidate.evidence.length > 20) score += 0.05;

  // Recurrence
  if ((candidate.recurrenceCount || 1) > 2) score += 0.15;
  if ((candidate.recurrenceCount || 1) > 1) score += 0.1;

  // Specificity
  if ((candidate.relatedObjects || []).length > 0) score += 0.05;
  if (candidate.relatedWorkflow) score += 0.05;

  // Penalty for speculation
  if (_isSpeculative(candidate.summary)) score -= 0.15;

  return Math.max(0, Math.min(1, score));
}

// ── Core extraction ───────────────────────────────────────────────────────

/**
 * Extract candidate records from a single observation.
 *
 * @param {Object} observation - Observation record from runbook-observer.js
 * @returns {Object[]} Array of ObservationCandidate records
 */
function extractCandidatesFromObservation(observation) {
  if (!observation || !observation.org) return [];
  if (_shouldIgnoreObservation(observation)) return [];

  const notes = (observation.notes || '').trim();

  // Filter out secrets
  if (_containsSecrets(notes)) return [];

  // Build summary
  const summary = _buildSummary(observation);
  if (!summary) return [];

  // Filter conversational filler when there's no other context
  const hasContext = (observation.context && (
    (observation.context.objects && observation.context.objects.length > 0) ||
    (observation.context.workflows && observation.context.workflows.length > 0) ||
    (observation.context.fields && observation.context.fields.length > 0)
  ));
  if (!hasContext && _isConversationalFiller(notes)) return [];

  const sourceRef = observation._filePath || `observations/${observation.operation}-${observation.timestamp}`;
  const category = _classifyCategory(observation);
  const proposedScopes = _inferProposedScopes(observation);

  const candidate = {
    candidateId: _generateCandidateId('observation', sourceRef, summary),
    orgAlias: observation.org,
    platform: observation.platform || null,
    sourceType: 'observation',
    sourceRef,
    sourceAgent: observation.agent || null,
    operationType: observation.operation || null,
    relatedObjects: (observation.context && observation.context.objects) || [],
    relatedWorkflow: (observation.context && observation.context.workflows && observation.context.workflows[0]) || null,
    relatedProject: null,
    category,
    summary,
    evidence: notes.length > 0 ? notes : null,
    confidence: 0, // scored below
    durabilityScore: 0, // scored below
    recurrenceCount: 1,
    proposedScopes,
    extractedAt: new Date().toISOString(),
    validationStatus: 'pending'
  };

  candidate.durabilityScore = scoreDurability(candidate);
  candidate.confidence = scoreConfidence(candidate);

  return [candidate];
}

/**
 * Extract candidate records from reflection bridge output.
 *
 * @param {Object} reflectionData - Output from runbook-reflection-bridge.js
 * @returns {Object[]} Array of ObservationCandidate records
 */
function extractCandidatesFromReflection(reflectionData) {
  if (!reflectionData || !reflectionData.org) return [];

  const candidates = [];
  const org = reflectionData.org;

  // Known exceptions → exception-pattern / known-exception
  if (reflectionData.known_exceptions && Array.isArray(reflectionData.known_exceptions)) {
    for (const exc of reflectionData.known_exceptions) {
      if (!exc.name || exc.name.length < 5) continue;
      const summary = `${exc.name}: ${exc.context || exc.recommendation || ''}`.trim();
      if (summary.length < 10) continue;
      if (_containsSecrets(summary)) continue;

      const candidate = {
        candidateId: _generateCandidateId('exception-pattern', `reflection-exception-${exc.name}`, summary),
        orgAlias: org,
        platform: null,
        sourceType: 'exception-pattern',
        sourceRef: `reflection-exception-${exc.name}`,
        sourceAgent: null,
        operationType: null,
        relatedObjects: [],
        relatedWorkflow: null,
        relatedProject: null,
        category: 'known-exception',
        summary,
        evidence: exc.recommendation || null,
        confidence: 0,
        durabilityScore: 0,
        recurrenceCount: exc.frequency || 1,
        proposedScopes: [{ scopeType: 'org', scopeKey: org }],
        extractedAt: new Date().toISOString(),
        validationStatus: 'pending'
      };
      candidate.durabilityScore = scoreDurability(candidate);
      candidate.confidence = scoreConfidence(candidate);
      candidates.push(candidate);
    }
  }

  // Common errors → reflection / troubleshooting-pattern
  if (reflectionData.patterns && reflectionData.patterns.common_errors && Array.isArray(reflectionData.patterns.common_errors)) {
    for (const err of reflectionData.patterns.common_errors) {
      if (!err.taxonomy) continue;
      const examples = (err.examples || []).map(e => e.description || '').filter(Boolean).join('; ');
      const summary = `Recurring ${err.taxonomy} error (${err.count || 1}x): ${examples}`.trim();
      if (summary.length < 10) continue;
      if (_containsSecrets(summary)) continue;

      const candidate = {
        candidateId: _generateCandidateId('reflection', `reflection-error-${err.taxonomy}`, summary),
        orgAlias: org,
        platform: null,
        sourceType: 'reflection',
        sourceRef: `reflection-error-${err.taxonomy}`,
        sourceAgent: null,
        operationType: null,
        relatedObjects: [],
        relatedWorkflow: null,
        relatedProject: null,
        category: 'troubleshooting-pattern',
        summary,
        evidence: examples || null,
        confidence: 0,
        durabilityScore: 0,
        recurrenceCount: err.count || 1,
        proposedScopes: [{ scopeType: 'org', scopeKey: org }],
        extractedAt: new Date().toISOString(),
        validationStatus: 'pending'
      };
      candidate.durabilityScore = scoreDurability(candidate);
      candidate.confidence = scoreConfidence(candidate);
      candidates.push(candidate);
    }
  }

  // Manual workarounds → remediation / remediation-recipe
  if (reflectionData.patterns && reflectionData.patterns.manual_workarounds && Array.isArray(reflectionData.patterns.manual_workarounds)) {
    for (const wa of reflectionData.patterns.manual_workarounds) {
      const steps = (wa.steps || []).join('; ');
      const summary = `Workaround: ${wa.playbook || wa.trigger || 'manual'} — ${steps}`.trim();
      if (summary.length < 10) continue;
      if (_containsSecrets(summary)) continue;

      const candidate = {
        candidateId: _generateCandidateId('remediation', `reflection-workaround-${wa.playbook || 'manual'}`, summary),
        orgAlias: org,
        platform: null,
        sourceType: 'remediation',
        sourceRef: `reflection-workaround-${wa.playbook || 'manual'}`,
        sourceAgent: null,
        operationType: null,
        relatedObjects: [],
        relatedWorkflow: null,
        relatedProject: null,
        category: 'remediation-recipe',
        summary,
        evidence: steps || null,
        confidence: 0,
        durabilityScore: 0,
        recurrenceCount: 1,
        proposedScopes: [{ scopeType: 'org', scopeKey: org }],
        extractedAt: new Date().toISOString(),
        validationStatus: 'pending'
      };
      candidate.durabilityScore = scoreDurability(candidate);
      candidate.confidence = scoreConfidence(candidate);
      candidates.push(candidate);
    }
  }

  // User interventions → reflection / checklist-lesson
  if (reflectionData.patterns && reflectionData.patterns.user_interventions && Array.isArray(reflectionData.patterns.user_interventions)) {
    for (const ui of reflectionData.patterns.user_interventions) {
      const summary = `User intervention: ${ui.comment || ui.proposed_action || ''}`.trim();
      if (summary.length < 10) continue;
      if (_containsSecrets(summary)) continue;

      const candidate = {
        candidateId: _generateCandidateId('reflection', `reflection-intervention-${_summaryHash(summary).slice(0, 8)}`, summary),
        orgAlias: org,
        platform: null,
        sourceType: 'reflection',
        sourceRef: `reflection-intervention`,
        sourceAgent: null,
        operationType: null,
        relatedObjects: [],
        relatedWorkflow: null,
        relatedProject: null,
        category: 'checklist-lesson',
        summary,
        evidence: ui.proposed_action || null,
        confidence: 0,
        durabilityScore: 0,
        recurrenceCount: 1,
        proposedScopes: [{ scopeType: 'org', scopeKey: org }],
        extractedAt: new Date().toISOString(),
        validationStatus: 'pending'
      };
      candidate.durabilityScore = scoreDurability(candidate);
      candidate.confidence = scoreConfidence(candidate);
      candidates.push(candidate);
    }
  }

  // Recommendations → agent-summary / business-rule
  if (reflectionData.recommendations && Array.isArray(reflectionData.recommendations)) {
    for (const rec of reflectionData.recommendations) {
      if (!rec || typeof rec !== 'string' || rec.length < 10) continue;
      if (_containsSecrets(rec)) continue;

      const candidate = {
        candidateId: _generateCandidateId('agent-summary', `reflection-recommendation-${_summaryHash(rec).slice(0, 8)}`, rec),
        orgAlias: org,
        platform: null,
        sourceType: 'agent-summary',
        sourceRef: 'reflection-recommendation',
        sourceAgent: null,
        operationType: null,
        relatedObjects: [],
        relatedWorkflow: null,
        relatedProject: null,
        category: 'business-rule',
        summary: rec.length > 300 ? rec.slice(0, 297) + '...' : rec,
        evidence: null,
        confidence: 0,
        durabilityScore: 0,
        recurrenceCount: 1,
        proposedScopes: [{ scopeType: 'org', scopeKey: org }],
        extractedAt: new Date().toISOString(),
        validationStatus: 'pending'
      };
      candidate.durabilityScore = scoreDurability(candidate);
      candidate.confidence = scoreConfidence(candidate);
      candidates.push(candidate);
    }
  }

  return candidates;
}

/**
 * Extract candidates from a batch of observations with deduplication.
 *
 * @param {Object[]} observations - Array of observation records
 * @returns {Object[]} Deduplicated ObservationCandidate array
 */
function extractCandidatesFromBatch(observations) {
  if (!Array.isArray(observations)) return [];
  const all = [];
  for (const obs of observations) {
    all.push(...extractCandidatesFromObservation(obs));
  }
  return deduplicateCandidates(all);
}

// ── Post-processing ───────────────────────────────────────────────────────

/**
 * Filter candidates by durability threshold.
 *
 * @param {Object[]} candidates
 * @param {number} [threshold=0.4]
 * @returns {Object[]} Candidates with durabilityScore >= threshold
 */
function filterDurable(candidates, threshold = 0.4) {
  return candidates.filter(c => c.durabilityScore >= threshold);
}

/**
 * Deduplicate candidates by summary hash.
 * Merged candidate keeps the first's data, increments recurrenceCount,
 * picks higher scores, and unions proposedScopes.
 *
 * @param {Object[]} candidates
 * @returns {Object[]} Deduplicated array
 */
function deduplicateCandidates(candidates) {
  const seen = new Map(); // summaryHash → candidate

  for (const c of candidates) {
    const hash = _summaryHash(c.summary);
    if (seen.has(hash)) {
      const existing = seen.get(hash);
      existing.recurrenceCount = (existing.recurrenceCount || 1) + (c.recurrenceCount || 1);
      existing.durabilityScore = Math.max(existing.durabilityScore, c.durabilityScore);
      existing.confidence = Math.max(existing.confidence, c.confidence);
      // Union proposedScopes
      const existingScopeKeys = new Set(
        existing.proposedScopes.map(s => `${s.scopeType}:${s.scopeKey}`)
      );
      for (const scope of (c.proposedScopes || [])) {
        const key = `${scope.scopeType}:${scope.scopeKey}`;
        if (!existingScopeKeys.has(key)) {
          existing.proposedScopes.push(scope);
          existingScopeKeys.add(key);
        }
      }
      // Re-score after recurrence bump
      existing.durabilityScore = scoreDurability(existing);
      existing.confidence = scoreConfidence(existing);
    } else {
      seen.set(hash, { ...c });
    }
  }

  return Array.from(seen.values());
}

// ── Persistence ───────────────────────────────────────────────────────────

function _detectPluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '../..');
}

function _getCandidatesDir(org, pluginRoot) {
  const base = pluginRoot || _detectPluginRoot();
  return path.join(base, 'instances', org, 'runbooks', 'candidates');
}

/**
 * Save candidates to disk.
 *
 * @param {string} org
 * @param {Object[]} candidates
 * @param {string} [pluginRoot]
 * @returns {{ saved: string[], skipped: string[] }}
 */
function saveCandidates(org, candidates, pluginRoot) {
  const dir = _getCandidatesDir(org, pluginRoot);
  fs.mkdirSync(dir, { recursive: true });

  const saved = [];
  const skipped = [];

  for (const c of candidates) {
    const filePath = path.join(dir, `${c.candidateId}.json`);
    // Skip if already exists (cross-session dedup)
    if (fs.existsSync(filePath)) {
      skipped.push(c.candidateId);
      continue;
    }
    fs.writeFileSync(filePath, JSON.stringify(c, null, 2), 'utf-8');
    saved.push(c.candidateId);
  }

  return { saved, skipped };
}

/**
 * Load a single candidate from disk.
 *
 * @param {string} org
 * @param {string} candidateId
 * @param {string} [pluginRoot]
 * @returns {Object|null} ObservationCandidate or null
 */
function loadCandidate(org, candidateId, pluginRoot) {
  const dir = _getCandidatesDir(org, pluginRoot);
  const filePath = path.join(dir, `${candidateId}.json`);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    console.warn(`⚠️  Could not load candidate ${candidateId}: ${err.message}`);
  }
  return null;
}

/**
 * List candidates for an org with optional filtering.
 *
 * @param {string} org
 * @param {string} [pluginRoot]
 * @param {Object} [filter] - { validationStatus?, sourceType?, category?, minDurability? }
 * @returns {Object[]} Array of ObservationCandidate
 */
function listCandidates(org, pluginRoot, filter) {
  const dir = _getCandidatesDir(org, pluginRoot);

  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  let candidates = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
      candidates.push(JSON.parse(raw));
    } catch (err) {
      // Skip corrupt files
    }
  }

  if (filter) {
    if (filter.validationStatus) {
      candidates = candidates.filter(c => c.validationStatus === filter.validationStatus);
    }
    if (filter.sourceType) {
      candidates = candidates.filter(c => c.sourceType === filter.sourceType);
    }
    if (filter.category) {
      candidates = candidates.filter(c => c.category === filter.category);
    }
    if (filter.minDurability !== undefined) {
      candidates = candidates.filter(c => c.durabilityScore >= filter.minDurability);
    }
  }

  return candidates;
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  let org = null;
  let source = null;
  let reflection = null;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--org': org = args[++i]; break;
      case '--source': source = args[++i]; break;
      case '--reflection': reflection = args[++i]; break;
      case '--help':
        console.log('Usage: runbook-candidate-extractor.js --org <alias> [--source <obs-file>] [--reflection <ref-file>]');
        process.exit(0);
    }
  }

  if (!org) {
    console.error('❌ --org is required');
    process.exit(1);
  }

  let candidates = [];

  if (source) {
    const obs = JSON.parse(fs.readFileSync(source, 'utf-8'));
    candidates = extractCandidatesFromObservation(obs);
  } else if (reflection) {
    const ref = JSON.parse(fs.readFileSync(reflection, 'utf-8'));
    candidates = extractCandidatesFromReflection(ref);
  } else {
    // Extract from all observations in the org
    const obsDir = path.join(_detectPluginRoot(), 'instances', org, 'observations');
    if (fs.existsSync(obsDir)) {
      const files = fs.readdirSync(obsDir).filter(f => f.endsWith('.json'));
      const observations = files.map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(obsDir, f), 'utf-8'));
        data._filePath = path.join('observations', f);
        return data;
      });
      candidates = extractCandidatesFromBatch(observations);
    }
  }

  const durable = filterDurable(candidates);
  console.log(JSON.stringify({
    total: candidates.length,
    durable: durable.length,
    candidates: durable
  }, null, 2));
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  extractCandidatesFromObservation,
  extractCandidatesFromReflection,
  extractCandidatesFromBatch,
  scoreDurability,
  scoreConfidence,
  filterDurable,
  deduplicateCandidates,
  saveCandidates,
  loadCandidate,
  listCandidates,

  // Constants for external use
  VALID_CATEGORIES,

  // Exposed for testing
  _containsSecrets,
  _isConversationalFiller,
  _isSpeculative,
  _generateCandidateId,
  _summaryHash
};

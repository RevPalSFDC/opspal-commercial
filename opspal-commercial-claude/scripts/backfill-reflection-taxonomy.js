#!/usr/bin/env node

/**
 * Backfill reflection issue taxonomy using the taxonomy classifier.
 *
 * Usage:
 *   node scripts/backfill-reflection-taxonomy.js [--days=14] [--status=new,under_review] [--min-confidence=0.55] [--limit=100] [--apply]
 *
 * Defaults:
 *   --days=14
 *   --status=new,under_review,accepted,pending_review
 *   --min-confidence=0.55
 *   --apply=false (dry-run)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const taxonomyClassifierPath = path.resolve(
  __dirname,
  '..',
  '.claude-plugins',
  'cross-platform-plugin',
  'scripts',
  'lib',
  'taxonomy-classifier.js'
);

let TaxonomyClassifier;
try {
  ({ TaxonomyClassifier } = require(taxonomyClassifierPath));
} catch (err) {
  console.error('❌ Taxonomy classifier not found:', taxonomyClassifierPath);
  process.exit(1);
}

const TAXONOMY_NORMALIZATION = new Map([
  ['tool-contract mismatch', 'tool-contract'],
  ['tool-contract-mismatch', 'tool-contract'],
  ['prompt/llm mismatch', 'prompt-mismatch'],
  ['prompt/llm-mismatch', 'prompt-mismatch'],
  ['prompt/llm', 'prompt-mismatch'],
  ['schema-parse', 'schema/parse'],
  ['data quality', 'data-quality'],
  ['idempotency-state', 'idempotency/state'],
  ['external-api drift', 'external-api']
]);

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const [key, ...valueParts] = trimmed.split('=');
      if (!key || valueParts.length === 0) return;
      process.env[key] = valueParts.join('=');
    });
}

function getArgValue(args, name, fallback) {
  const prefix = `--${name}=`;
  const match = args.find(arg => arg.startsWith(prefix));
  if (!match) return fallback;
  return match.slice(prefix.length);
}

function normalizeTaxonomy(taxonomy) {
  if (!taxonomy || typeof taxonomy !== 'string') return null;
  const trimmed = taxonomy.trim();
  if (!trimmed) return null;
  const normalized = TAXONOMY_NORMALIZATION.get(trimmed.toLowerCase());
  return normalized || trimmed;
}

function buildTaxonomyText(issue, summary) {
  const parts = [
    issue.title,
    issue.description,
    issue.root_cause,
    issue.agnostic_fix,
    issue.minimal_patch,
    issue.reproducible_trigger,
    summary
  ].filter(Boolean);
  return parts.join(' ');
}

function cloneDeep(value) {
  return JSON.parse(JSON.stringify(value));
}

async function fetchReflections(client, filters) {
  const pageSize = 500;
  let page = 0;
  let results = [];

  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    let query = client
      .from('reflections')
      .select('id, created_at, reflection_status, data')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.statuses.length > 0) {
      query = query.in('reflection_status', filters.statuses);
    }

    if (filters.cutoffIso) {
      query = query.gte('created_at', filters.cutoffIso);
    }

    if (filters.limit && results.length >= filters.limit) {
      break;
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Supabase query failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    results = results.concat(data);

    if (data.length < pageSize) {
      break;
    }

    if (filters.limit && results.length >= filters.limit) {
      results = results.slice(0, filters.limit);
      break;
    }

    page += 1;
  }

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const wantsHelp = args.includes('--help') || args.includes('-h');
  if (wantsHelp) {
    console.log(`
Backfill reflection taxonomy using classifier

Usage:
  node scripts/backfill-reflection-taxonomy.js [options]

Options:
  --days=N               Days to look back (default: 14)
  --status=a,b,c         Reflection statuses to include
  --min-confidence=N     Minimum classifier confidence (default: 0.55)
  --limit=N              Max reflections to scan
  --apply                Apply updates (default: dry-run)
`);
    process.exit(0);
  }

  loadEnv();

  const days = parseInt(getArgValue(args, 'days', '14'), 10);
  const statusArg = getArgValue(
    args,
    'status',
    'new,under_review,accepted,pending_review'
  );
  const minConfidence = parseFloat(getArgValue(args, 'min-confidence', '0.55'));
  const limit = parseInt(getArgValue(args, 'limit', '0'), 10);
  const apply = args.includes('--apply');

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (Number.isFinite(days) ? days : 14));
  const cutoffIso = cutoff.toISOString();

  const statuses = statusArg
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    console.error('❌ Missing SUPABASE_URL');
    process.exit(1);
  }

  if (apply) {
    if (!serviceRoleKey) {
      console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY (required for updates)');
      process.exit(1);
    }
    if (serviceRoleKey.startsWith('sb_publishable_')) {
      console.error('❌ SUPABASE_SERVICE_ROLE_KEY must be a service role key (sb_secret_...)');
      process.exit(1);
    }
  }

  if (!apply && !anonKey && !serviceRoleKey) {
    console.error('❌ Missing SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY for read access');
    process.exit(1);
  }

  const client = createClient(
    supabaseUrl,
    apply ? serviceRoleKey : (anonKey || serviceRoleKey),
    { auth: { persistSession: false } }
  );

  console.log('🔍 Scanning reflections...');
  console.log(`   Cutoff: ${cutoffIso}`);
  console.log(`   Statuses: ${statuses.join(', ') || 'all'}`);
  console.log(`   Min confidence: ${minConfidence}`);
  console.log(`   Mode: ${apply ? 'apply' : 'dry-run'}`);

  const reflections = await fetchReflections(client, {
    statuses,
    cutoffIso,
    limit: Number.isFinite(limit) && limit > 0 ? limit : null
  });

  const classifier = new TaxonomyClassifier();
  const updates = [];

  let totalIssues = 0;
  let normalizedCount = 0;
  let classifiedCount = 0;
  let copiedIssues = 0;

  for (const reflection of reflections) {
    const data = reflection.data || {};
    const summary = data.summary || '';

    let issuesKey = null;
    if (Array.isArray(data.issues_identified)) {
      issuesKey = 'issues_identified';
    } else if (Array.isArray(data.issues)) {
      issuesKey = 'issues';
    }

    if (!issuesKey) {
      continue;
    }

    const originalIssues = data[issuesKey] || [];
    if (originalIssues.length === 0) {
      continue;
    }

    totalIssues += originalIssues.length;

    const updatedIssues = originalIssues.map(issue => ({ ...issue }));
    const issueChanges = [];
    let updated = false;
    let copied = false;

    for (let index = 0; index < updatedIssues.length; index += 1) {
      const issue = updatedIssues[index];
      if (!issue || typeof issue !== 'object') continue;

      const before = issue.taxonomy || null;
      const normalized = normalizeTaxonomy(before);

      if (normalized && normalized !== before) {
        issue.taxonomy = normalized;
        normalizedCount += 1;
        updated = true;
        issueChanges.push({
          index,
          from: before,
          to: normalized,
          reason: 'normalized'
        });
      }

      const currentTaxonomy = issue.taxonomy || normalized || before;
      if ((!currentTaxonomy || currentTaxonomy === 'unknown') && classifier) {
        const text = buildTaxonomyText(issue, summary);
        if (!text) continue;

        const suggestion = classifier.suggestCategory(text);
        const top = suggestion.topSuggestion;

        if (top && top.category && top.category !== 'unknown' && top.confidence >= minConfidence) {
          issue.taxonomy = top.category;
          classifiedCount += 1;
          updated = true;
          issueChanges.push({
            index,
            from: currentTaxonomy,
            to: top.category,
            reason: 'classified',
            confidence: top.confidence
          });
        }
      }
    }

    if (issuesKey === 'issues' && !Array.isArray(data.issues_identified)) {
      data.issues_identified = cloneDeep(updatedIssues);
      copiedIssues += 1;
      copied = true;
      updated = true;
    }

    if (updated) {
      data[issuesKey] = updatedIssues;
      updates.push({
        id: reflection.id,
        created_at: reflection.created_at,
        reflection_status: reflection.reflection_status,
        issue_changes: issueChanges,
        copied_issues_identified: copied
      });

      if (apply) {
        const { error } = await client
          .from('reflections')
          .update({ data })
          .eq('id', reflection.id);

        if (error) {
          console.error(`❌ Update failed for ${reflection.id}: ${error.message}`);
        }
      }
    }
  }

  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const outputPath = path.join(reportsDir, `reflection-taxonomy-backfill-${stamp}.json`);

  const report = {
    cutoff_iso: cutoffIso,
    statuses,
    min_confidence: minConfidence,
    mode: apply ? 'apply' : 'dry-run',
    reflections_scanned: reflections.length,
    total_issues: totalIssues,
    normalized_count: normalizedCount,
    classified_count: classifiedCount,
    reflections_updated: updates.length,
    copied_issues_identified: copiedIssues,
    updates
  };

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log('\n✅ Backfill complete');
  console.log(`   Reflections scanned: ${reflections.length}`);
  console.log(`   Total issues: ${totalIssues}`);
  console.log(`   Taxonomies normalized: ${normalizedCount}`);
  console.log(`   Taxonomies classified: ${classifiedCount}`);
  console.log(`   Reflections updated: ${updates.length}`);
  console.log(`   Issues copied to issues_identified: ${copiedIssues}`);

  if (updates.length > 0) {
    console.log('\nPreview (first 5 updates):');
    updates.slice(0, 5).forEach((update, index) => {
      console.log(` ${index + 1}. ${update.id} (${update.reflection_status})`);
      if (update.copied_issues_identified) {
        console.log('    - copied issues → issues_identified');
      }
      update.issue_changes.slice(0, 5).forEach(change => {
        const confidence = change.confidence ? `, confidence ${change.confidence.toFixed(2)}` : '';
        console.log(`    - issue[${change.index}] ${change.from || 'null'} → ${change.to} (${change.reason}${confidence})`);
      });
    });
  } else {
    console.log('\nNo updates required.');
  }

  console.log(`\nReport saved: ${outputPath}`);
}

main().catch(err => {
  console.error('❌ Backfill failed:', err.message);
  process.exit(1);
});

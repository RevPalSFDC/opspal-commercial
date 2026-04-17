#!/usr/bin/env node

/**
 * Batch Supabase Status Update — 5-Track Triage 2026-04-17
 *
 * Updates 22 stalled reflections (deferred 2026-03-17, overdue since 2026-03-24)
 * into four triage buckets: implemented | accepted | deferred(duplicate) | deferred(stale)
 *
 * Usage:
 *   node batch-5track-triage-update-2026-04-17.js           # dry-run (prints intended updates)
 *   node batch-5track-triage-update-2026-04-17.js --live    # write to Supabase
 *   node batch-5track-triage-update-2026-04-17.js --verify  # re-query and confirm current status
 */

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kjgsodyuzjgbebfnbruz.supabase.co';
// Writes require the service role key (anon key is read-only via RLS).
// Pass SUPABASE_ANON_KEY=<service-role-key> or set SUPABASE_SERVICE_ROLE_KEY in env.
const SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_-_VJIjhOxqZCEMN1xyWPdg_TioDXc0a';

const LIVE = process.argv.includes('--live');
const VERIFY = process.argv.includes('--verify');
const TRIAGE_DATE = '2026-04-17';

// ─── Classification ────────────────────────────────────────────────────────────

const UPDATES = [
  // ── resolved-by-phase-1 (status: implemented) ───────────────────────────────
  {
    id: 'e685157c-5939-4def-81b5-e13715cce249',
    short: 'e685157c',
    bucket: 'resolved-by-phase-1',
    new_status: 'implemented',
    implementation_notes: 'Closed by reflection-remediation-2026-04-17 commit 55c9300 + 23e0449: routing advisory-only migration + MANDATORY→SUGGESTED rename. ENABLE_COMPLEXITY_HARD_BLOCKING false-positive addressed by advisory enforcement; env-var inheritance gap noted in follow-up audit.'
  },
  {
    id: 'd3d8f764-e84f-4d9f-95d6-9ba6380a49a6',
    short: 'd3d8f764',
    bucket: 'resolved-by-phase-1',
    new_status: 'implemented',
    implementation_notes: 'Closed by reflection-remediation-2026-04-17 commits 55c9300/23e0449 (routing advisory-only, no more mandatory bypass blocks) + 93e763f/434df1b (workspace-rooted output path for observe hook). FlowDefinition.ActiveVersionNumber gap noted as stale Salesforce-API knowledge; no code change required.'
  },
  {
    id: '64f2ff47-b299-4565-835e-758da156ca44',
    short: '64f2ff47',
    bucket: 'resolved-by-phase-1',
    new_status: 'implemented',
    implementation_notes: 'Closed by reflection-remediation-2026-04-17 commit 55c9300: routing is now advisory-only. The primary root cause (agent executed all phases directly instead of delegating to sub-agents) was a routing enforcement gap now converted to a suggestion, not a hard block.'
  },
  {
    id: 'e84c385a-fd81-4beb-a6e4-303853075927',
    short: 'e84c385a',
    bucket: 'resolved-by-phase-1',
    new_status: 'implemented',
    implementation_notes: 'Closed by reflection-remediation-2026-04-17 commit 55c9300: routing advisory-only migration. Primary cause was agent running Python directly instead of delegating; routing now surfaces advisory warnings without blocking. Pipe-buffer truncation note is stale operational context.'
  },

  // ── needs-feature-plan (status: accepted) ───────────────────────────────────
  {
    id: 'e2b86f4b-9844-4e7e-84f7-76288bf0c4b6',
    short: 'e2b86f4b',
    bucket: 'needs-feature-plan',
    new_status: 'accepted',
    implementation_notes: 'Accepted into follow-up plan: reports/plans/2026-04-17-salesforce-api-schema-gaps.md. Root causes span Analytics REST API chart-config absence, Tooling API soft-delete access, MATRIX sort rejection, and FLS auto-grant gap — all requiring SF API knowledge enrichment in salesforce-metadata-standards skill.'
  },
  {
    id: '4972466d-dcfd-41ae-8225-bc699d98c540',
    short: '4972466d',
    bucket: 'needs-feature-plan',
    new_status: 'accepted',
    implementation_notes: 'Accepted into follow-up plan: reports/plans/2026-04-17-content-redaction-tooling.md. No standardized redaction pipeline exists for converting client deliverables into anonymized showcase artifacts; regex name-replacement misses API-name references. New capability needed in opspal-core.'
  },
  {
    id: 'cf4f30c1-8bd8-4794-a4d7-c431e41e33cc',
    short: 'cf4f30c1',
    bucket: 'needs-feature-plan',
    new_status: 'accepted',
    implementation_notes: 'Accepted into follow-up plan: reports/plans/2026-04-17-hubspot-api-operator-enrichment.md. Sub-agents lack internalized HubSpot v3 API operator vocabulary (IS_ANY_OF vs IS_EQUAL_TO, SET_NOT_ANY, IN_LIST) across Lists/Emails/Workflows endpoints. Needs skill enrichment in opspal-hubspot.'
  },
  {
    id: 'bc233c54-d650-44a3-9fbd-4c6cb17ceb9f',
    short: 'bc233c54',
    bucket: 'needs-feature-plan',
    new_status: 'accepted',
    implementation_notes: 'Accepted into follow-up plan: reports/plans/2026-04-17-mcp-tool-availability-enforcement.md. Asana MCP tools listed in agent definition but unavailable in spawned context — sub-agents fall back to Node.js scripts silently. Needs tool-contract enforcement (opspal-core:tool-contract-engineering).'
  },
  {
    id: 'b3ce86e8-bf51-4392-8ea4-75296b15bfdd',
    short: 'b3ce86e8',
    bucket: 'needs-feature-plan',
    new_status: 'accepted',
    implementation_notes: 'Accepted into follow-up plan: reports/plans/2026-04-17-cross-platform-dedup-methodology.md. Dedup methodology was too conservative (blocking all cross-ID matches even with domain evidence). Requires algorithmic update to opspal-data-hygiene confidence scoring. Also surfaces FLS auto-grant + scraping garbage issues.'
  },
  {
    id: '867ce333-2b39-4add-a880-e1f432891258',
    short: '867ce333',
    bucket: 'needs-feature-plan',
    new_status: 'accepted',
    implementation_notes: 'Accepted into follow-up plan: reports/plans/2026-04-17-cross-platform-dedup-methodology.md. Web scraping enrichment produced bot-detection garbage names; overlaps with dedup methodology gap. FLS auto-grant gap also noted in e2b86f4b salesforce-api-schema-gaps plan.'
  },
  {
    id: '011c05a4-a5cf-473f-b13b-62508bde610a',
    short: '011c05a4',
    bucket: 'needs-feature-plan',
    new_status: 'accepted',
    implementation_notes: 'Accepted into follow-up plan: reports/plans/2026-04-17-cross-platform-dedup-methodology.md. WSL2 file locking (Excel-held files), multi-word city parsing failures (3 cleaning passes), expired/hijacked domain garbage, and free-email-as-company-domain patterns all require structured data hygiene enrichment.'
  },
  {
    id: '4194b290-ab9e-47eb-b70d-9b67d34fbc9b',
    short: '4194b290',
    bucket: 'needs-feature-plan',
    new_status: 'accepted',
    implementation_notes: 'Accepted into follow-up plan: reports/plans/2026-04-17-cross-platform-dedup-methodology.md. Puppeteer page.waitForTimeout removal + single-process crash isolation + address parsing brittleness + garbage from repurposed domains all require a robust scraping architecture plan for opspal-data-hygiene.'
  },

  // ── duplicate (status: deferred with Duplicate reason) ──────────────────────
  {
    id: '15175270-9c09-41a2-a3cc-bc82714eb049',
    short: '15175270',
    bucket: 'duplicate',
    new_status: 'deferred',
    deferred_reason: 'Duplicate of 8304aba1-deb2-49a9-a825-349341a4e324; root causes (SF Bulk API INSERT default, formula-field DML block, blank-cell upsert, name-collision matching) overlap with primary. Closed in 5-track triage 2026-04-17.'
  },
  {
    id: '53e4c274-e8ac-4ee7-b578-58a04055751a',
    short: '53e4c274',
    bucket: 'duplicate',
    new_status: 'deferred',
    deferred_reason: 'Duplicate of 8304aba1-deb2-49a9-a825-349341a4e324; CSV upload execution gap and name-matched duplicate SF IDs are the same root cause cluster. Closed in 5-track triage 2026-04-17.'
  },
  {
    id: 'e29b5d80-3be5-48bd-b0ed-3bd737144f3f',
    short: 'e29b5d80',
    bucket: 'duplicate',
    new_status: 'deferred',
    deferred_reason: 'Duplicate of 3ced6263-c01a-45fc-8602-c0ad6f1ed6a3; Flow activation without field validation and VR referencing missing fields are the same deployment/UAT root causes. Closed in 5-track triage 2026-04-17.'
  },
  {
    id: '8ed1c818-3c5d-430e-af8a-78f2d72fac98',
    short: '8ed1c818',
    bucket: 'duplicate',
    new_status: 'deferred',
    deferred_reason: 'Duplicate of 33c1d941-02ad-4767-b8be-0d507aeb4640; empty root_cause fields indicate this reflection was not fully populated; flow execution order issues overlap with 33c1d941 Salesforce implementation cluster. Closed in 5-track triage 2026-04-17.'
  },

  // ── stale (status: deferred with Stale reason) ───────────────────────────────
  {
    id: '4e7a734e-aabb-49e6-aa91-c21cccee66d3',
    short: '4e7a734e',
    bucket: 'stale',
    new_status: 'deferred',
    deferred_reason: 'Stale; no systemic fix needed. Closed in 5-track triage 2026-04-17. Org-specific Python scorecard script and shell hardcoding; one-time remediation applied inline. No general plugin fix warranted.'
  },
  {
    id: '8304aba1-deb2-49a9-a825-349341a4e324',
    short: '8304aba1',
    bucket: 'stale',
    new_status: 'deferred',
    deferred_reason: 'Stale; no systemic fix needed. Closed in 5-track triage 2026-04-17. Org-specific bulk import active-user constraint and name-collision matching patterns; addressed by data-hygiene plugin guidance. Primary for duplicates 15175270 and 53e4c274.'
  },
  {
    id: 'be6bcc34-5700-430d-8b2d-fd606901a04c',
    short: 'be6bcc34',
    bucket: 'stale',
    new_status: 'deferred',
    deferred_reason: 'Stale; no systemic fix needed. Closed in 5-track triage 2026-04-17. Single-issue reflection: FlexiPage App Default requirement is well-documented Salesforce behavior, fixed inline during session.'
  },
  {
    id: '9d642c3c-d9ab-4628-bed9-93db7c5c4ddb',
    short: '9d642c3c',
    bucket: 'stale',
    new_status: 'deferred',
    deferred_reason: 'Stale; no systemic fix needed. Closed in 5-track triage 2026-04-17. Tooling API PATCH full-Metadata requirement + shell single-quote escaping + FLS visibility gaps are now documented in salesforce-metadata-standards and salesforce-query-safety-framework skills. Org-specific source tracking cache gap was one-time.'
  },
  {
    id: '3ced6263-c01a-45fc-8602-c0ad6f1ed6a3',
    short: '3ced6263',
    bucket: 'stale',
    new_status: 'deferred',
    deferred_reason: 'Stale; no systemic fix needed. Closed in 5-track triage 2026-04-17. Deployment batch ordering and flow XML variable concatenation bugs were fixed inline; flow-xml-lifecycle-framework skill captures the systemic pattern.'
  },
  {
    id: '33c1d941-02ad-4767-b8be-0d507aeb4640',
    short: '33c1d941',
    bucket: 'stale',
    new_status: 'deferred',
    deferred_reason: 'Stale; no systemic fix needed. Closed in 5-track triage 2026-04-17. Flow XML element grouping, Layout XML naming, and Forecast category mapping quirks are now covered by xml-roundtrip-fidelity-framework and salesforce-metadata-standards skills. Org-specific deployment session.'
  }
];

// ─── Supabase helpers ──────────────────────────────────────────────────────────

function supabaseRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    const options = {
      method,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data || '[]')); }
          catch (e) { resolve(data); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function buildPayload(u) {
  const base = {
    reflection_status: u.new_status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: 'engineering@gorevpal.com'
  };
  if (u.new_status === 'implemented') {
    base.implementation_notes = u.implementation_notes;
  } else if (u.new_status === 'accepted') {
    base.implementation_notes = u.implementation_notes;
  } else if (u.new_status === 'deferred') {
    base.deferred_reason = u.deferred_reason || u.implementation_notes;
    base.deferred_until = null; // clear the stale 2026-03-24 date
  }
  return base;
}

// ─── Verify mode ──────────────────────────────────────────────────────────────

async function verify() {
  console.log('\n=== VERIFY: Checking current status of 22 reflections ===\n');
  const ids = UPDATES.map(u => u.id);
  const inClause = ids.map(id => `"${id}"`).join(',');

  const rows = await supabaseRequest('GET', `reflections?id=in.(${ids.join(',')})&select=id,reflection_status,deferred_reason,implementation_notes,reviewed_at`);

  const byId = Object.fromEntries((rows || []).map(r => [r.id, r]));
  let allMatch = true;

  for (const u of UPDATES) {
    const row = byId[u.id];
    if (!row) {
      console.log(`  MISSING  ${u.short} — not found in Supabase`);
      allMatch = false;
      continue;
    }
    const statusOk = row.reflection_status === u.new_status;
    const icon = statusOk ? 'OK    ' : 'MISMATCH';
    if (!statusOk) allMatch = false;
    console.log(`  ${icon}  ${u.short}  expected=${u.new_status}  actual=${row.reflection_status}`);
  }

  console.log(allMatch ? '\nAll 22 verified.' : '\nSome mismatches found — re-run with --live to fix.');
  return rows;
}

// ─── Dry-run ──────────────────────────────────────────────────────────────────

function dryRun() {
  console.log('\n=== DRY RUN — intended updates (no Supabase writes) ===\n');
  for (const u of UPDATES) {
    const payload = buildPayload(u);
    console.log(`[${u.bucket.padEnd(20)}] ${u.short}  →  status=${u.new_status}`);
    if (payload.implementation_notes) {
      console.log(`    notes: ${payload.implementation_notes.slice(0, 120)}...`);
    }
    if (payload.deferred_reason) {
      console.log(`    reason: ${payload.deferred_reason.slice(0, 120)}...`);
    }
    console.log('');
  }
  console.log(`Total: ${UPDATES.length} reflections`);
  console.log('\nRe-run with --live to write to Supabase.');
}

// ─── Live update ──────────────────────────────────────────────────────────────

async function liveUpdate() {
  console.log('\n=== LIVE UPDATE — writing to Supabase ===\n');
  const results = { success: [], failed: [] };

  for (const u of UPDATES) {
    const payload = buildPayload(u);
    try {
      await supabaseRequest('PATCH', `reflections?id=eq.${u.id}`, payload);
      console.log(`  OK  [${u.bucket.padEnd(20)}] ${u.short}  →  ${u.new_status}`);
      results.success.push(u.id);
    } catch (err) {
      console.error(`  FAIL  ${u.short}: ${err.message}`);
      results.failed.push({ id: u.id, error: err.message });
    }
  }

  console.log(`\nDone. ${results.success.length} succeeded, ${results.failed.length} failed.`);
  if (results.failed.length > 0) {
    console.error('\nFailed:', JSON.stringify(results.failed, null, 2));
    process.exit(1);
  }
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (VERIFY) {
    await verify();
  } else if (LIVE) {
    await liveUpdate();
  } else {
    dryRun();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}

module.exports = { UPDATES, buildPayload };

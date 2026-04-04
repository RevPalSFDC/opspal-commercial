#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const options = {
    from: null,
    to: null,
    outDir: null,
    dryRun: false,
    skipLlm: false,
    verbose: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--from' && argv[i + 1]) {
      options.from = argv[i + 1];
      i += 1;
    } else if (arg === '--to' && argv[i + 1]) {
      options.to = argv[i + 1];
      i += 1;
    } else if (arg === '--out-dir' && argv[i + 1]) {
      options.outDir = argv[i + 1];
      i += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--skip-llm') {
      options.skipLlm = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    }
  }

  // Default to current week (Monday through today)
  if (!options.from || !options.to) {
    const now = new Date();
    const day = now.getUTCDay(); // 0=Sun, 1=Mon
    const diffToMon = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - diffToMon);

    options.from = options.from || formatDate(monday);
    options.to = options.to || formatDate(now);
  }

  return options;
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Git log parsing
// Note: execSync is used here with hardcoded git commands only (no user input),
// so shell injection is not a concern.
// ---------------------------------------------------------------------------
const RECORD_SEP = '---RECORD---';

function getCommits(from, to) {
  // Use --after/--before with one extra day on each side to capture full range
  const afterDate = new Date(from);
  afterDate.setUTCDate(afterDate.getUTCDate() - 1);
  const beforeDate = new Date(to);
  beforeDate.setUTCDate(beforeDate.getUTCDate() + 1);

  const format = `%H||%s||%b||%ad${RECORD_SEP}`;
  const cmd = `git log --format="${format}" --date=short ` +
    `--after="${formatDate(afterDate)}" --before="${formatDate(beforeDate)}"`;

  let output;
  try {
    output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  } catch {
    return [];
  }

  return output
    .split(RECORD_SEP)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((record) => {
      const parts = record.split('||');
      return {
        hash: (parts[0] || '').trim(),
        subject: (parts[1] || '').trim(),
        body: (parts[2] || '').trim(),
        date: (parts[3] || '').trim()
      };
    });
}

// ---------------------------------------------------------------------------
// Commit classification (ported from send-main-push-release-notification.js)
// ---------------------------------------------------------------------------
function classifyCommit(subject, body) {
  const fullText = `${subject}\n${body || ''}`;

  if (/^[a-z]+![:(]/i.test(subject) || /BREAKING CHANGE|BREAKING:/i.test(fullText)) {
    return 'breaking';
  }
  if (/^feat(\([^)]*\))?:/i.test(subject)) {
    return 'new';
  }
  if (/^fix(\([^)]*\))?:/i.test(subject)) {
    return 'fixed';
  }
  if (/^perf(\([^)]*\))?:/i.test(subject)) {
    return 'improved';
  }
  if (/^security(\([^)]*\))?:/i.test(subject) || /^fix(\([^)]*\))?:.*security/i.test(subject)) {
    return 'security';
  }

  return 'other';
}

function stripConventionalPrefix(subject) {
  return subject.replace(/^[a-z]+!?(\([^)]*\))?:\s*/i, '').trim();
}

function extractScope(subject) {
  const match = subject.match(/^[a-z]+!?\(([^)]+)\):/i);
  return match ? match[1].trim() : null;
}

function extractBodyDetails(body) {
  if (!body) return [];
  const details = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^co-authored-by:/i.test(trimmed)) continue;
    if (/^note:/i.test(trimmed)) continue;
    if (/^[-*]\s+/.test(trimmed)) {
      details.push(trimmed.replace(/^[-*]\s+/, '').trim());
    } else if (/^[0-9]+\.\s+/.test(trimmed)) {
      details.push(trimmed.replace(/^[0-9]+\.\s+/, '').trim());
    }
    if (details.length >= 3) break;
  }
  return details;
}

// ---------------------------------------------------------------------------
// Plugin label mapping
// ---------------------------------------------------------------------------
const PLUGIN_LABELS = {
  'opspal-salesforce': 'Salesforce',
  'salesforce': 'Salesforce',
  'opspal-hubspot': 'HubSpot',
  'hubspot': 'HubSpot',
  'opspal-marketo': 'Marketo',
  'marketo': 'Marketo',
  'opspal-core': 'Core Platform',
  'core': 'Core Platform',
  'opspal-gtm-planning': 'GTM Planning',
  'gtm-planning': 'GTM Planning',
  'gtm': 'GTM Planning',
  'opspal-okrs': 'OKRs',
  'okrs': 'OKRs',
  'opspal-monday': 'Monday.com',
  'monday': 'Monday.com',
  'opspal-ai-consult': 'AI Consult',
  'ai-consult': 'AI Consult',
  'opspal-mcp-client': 'MCP Client',
  'mcp-client': 'MCP Client',
  'bootstrap': 'Getting Started',
  'onboarding': 'Getting Started',
  'release-notes': 'Core Platform',
  'encryption': 'Core Platform',
  'security': 'Core Platform',
  'catalog': 'Core Platform',
  'ci': 'Core Platform'
};

function pluginLabel(scope) {
  if (!scope) return 'General';
  // Handle comma-separated multi-scopes: "core,salesforce" or "opspal-salesforce,opspal-core"
  if (scope.includes(',')) {
    const parts = scope.split(',').map((s) => s.trim().toLowerCase());
    for (const part of parts) {
      if (PLUGIN_LABELS[part]) return PLUGIN_LABELS[part];
    }
  }
  const lower = scope.toLowerCase();
  return PLUGIN_LABELS[lower] || capitalizeFirst(lower);
}

// ---------------------------------------------------------------------------
// Filtering and entry building
// ---------------------------------------------------------------------------
const INTERNAL_PREFIXES = /^(chore|test|ci|docs|build|style|revert)(\([^)]*\))?:/i;

// Scopes that are internal infrastructure, not customer-visible
const INTERNAL_SCOPES = new Set([
  'hooks', 'routing', 'ci', 'test', 'tests', 'runtime',
  'commercial', 'opspal-commercial', 'agents', 'encryption'
]);

function isCustomerVisible(commit) {
  const { subject, body } = commit;

  // Always show breaking changes
  if (/^[a-z]+![:(]/i.test(subject) || /BREAKING CHANGE/i.test(body || '')) {
    return true;
  }

  // Filter internal commit types
  if (INTERNAL_PREFIXES.test(subject)) {
    return false;
  }

  // Filter version bumps even if tagged as feat/fix
  if (/bump.*version|regenerate catalog|catalog docs/i.test(subject)) {
    return false;
  }

  // Filter internal infrastructure scopes
  const scope = extractScope(subject);
  if (scope && INTERNAL_SCOPES.has(scope.toLowerCase())) {
    return false;
  }

  // Filter generic internal patterns
  if (/harden|remediate|align.*runtime|stabilize|deadlock|smoke/i.test(subject)) {
    return false;
  }

  return true;
}

function cleanHeadline(headline) {
  return headline
    // Strip internal references: "from reflection abc123", "ref abc123", etc.
    .replace(/\s+from\s+reflection\s+[a-f0-9]+/gi, '')
    .replace(/\s+ref\s+[a-f0-9]{6,}/gi, '')
    // Strip trailing commit hashes in parens: "(abc1234)"
    .replace(/\s*\([a-f0-9]{7,}\)\s*$/gi, '')
    // Strip internal ticket references: "OPSPAL-123", "INT-456"
    .replace(/\s*\b(OPSPAL|INT|INTERNAL)-\d+\b/gi, '')
    .trim();
}

function buildEntries(commits) {
  const visible = commits.filter(isCustomerVisible);
  const entries = [];
  const seen = new Set();

  for (const commit of visible) {
    const category = classifyCommit(commit.subject, commit.body);
    if (category === 'other') continue;

    const scope = extractScope(commit.subject);
    const plugin = pluginLabel(scope);
    const headline = capitalizeFirst(cleanHeadline(stripConventionalPrefix(commit.subject)));
    const details = extractBodyDetails(commit.body);

    // Deduplicate near-identical headlines within the same plugin+category
    const dedupeKey = `${category}:${plugin}:${headline.toLowerCase().slice(0, 60)}`;
    if (seen.has(dedupeKey)) {
      const existing = entries.find(
        (e) => e.category === category && e.plugin === plugin &&
          e.headline.toLowerCase().slice(0, 60) === headline.toLowerCase().slice(0, 60)
      );
      if (existing) {
        existing.commits.push(commit.hash.slice(0, 7));
      }
      continue;
    }
    seen.add(dedupeKey);

    entries.push({
      category,
      plugin,
      headline,
      details: details.length > 0 ? details : null,
      commits: [commit.hash.slice(0, 7)]
    });
  }

  return entries;
}

function capitalizeFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ---------------------------------------------------------------------------
// Week slug and title
// ---------------------------------------------------------------------------
function weekSlug(fromDate) {
  const d = new Date(fromDate);
  const year = d.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dayOfYear = Math.floor((d - jan1) / 86400000) + 1;
  const weekNum = Math.ceil((dayOfYear + jan1.getUTCDay()) / 7);
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function weekTitle(fromDate) {
  const d = new Date(fromDate);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `Week of ${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// ---------------------------------------------------------------------------
// Index management
// ---------------------------------------------------------------------------
function updateIndex(indexPath, entry) {
  let index = [];
  if (fs.existsSync(indexPath)) {
    try {
      index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    } catch {
      index = [];
    }
  }

  // Remove existing entry with same slug
  index = index.filter((e) => e.slug !== entry.slug);

  // Add new entry at the front
  index.unshift({
    slug: entry.slug,
    title: entry.title,
    published_at: entry.published_at,
    week_start: entry.week_start,
    week_end: entry.week_end,
    has_breaking: entry.has_breaking,
    entry_count: entry.entries.length
  });

  // Keep max 52 weeks (1 year)
  if (index.length > 52) {
    index = index.slice(0, 52);
  }

  return index;
}

// ---------------------------------------------------------------------------
// LLM rewriting — translates engineering headlines into customer language
// ---------------------------------------------------------------------------
const LLM_SYSTEM_PROMPT = `You are a product marketing writer for OpsPal, a RevOps automation platform used by revenue operations managers and business analysts — NOT engineers.

Your job is to rewrite technical release note entries into plain, benefit-oriented language that non-technical users understand.

Rules:
- Write in active voice, present tense
- Focus on what the user can now DO or what WORKS BETTER, not how it was implemented
- Never use programming terms (null, guard, sanitizer, manifests, hooks, validators, XML, JSON, CLI, API, etc.)
- Never reference internal systems (reflection system, encryption engine, routing engine, hook contracts, etc.)
- Keep headlines under 15 words
- If an entry is purely internal infrastructure with no user-facing benefit, return category "skip"
- Write a 2-3 sentence weekly summary paragraph highlighting the most impactful changes

Respond with valid JSON only, no markdown fences.`;

function buildLlmPrompt(entries, weekTitle) {
  const input = entries.map((e, i) => ({
    index: i,
    category: e.category,
    plugin: e.plugin,
    raw_headline: e.headline,
    raw_details: e.details
  }));

  return `Rewrite these release note entries for non-technical RevOps users.

Week: ${weekTitle}

Entries:
${JSON.stringify(input, null, 2)}

Return JSON in this exact format:
{
  "summary": "A 2-3 sentence paragraph summarizing the week's most impactful changes for RevOps teams.",
  "entries": [
    {
      "index": 0,
      "category": "new|improved|fixed|breaking|security|skip",
      "headline": "Rewritten headline in plain language",
      "details": ["Optional plain-language detail"] or null
    }
  ]
}

Mark purely internal/infrastructure entries as category "skip". They will be removed from the published notes.`;
}

function callClaudeApi(systemPrompt, userPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  const body = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(data);
              const text = parsed.content && parsed.content[0] && parsed.content[0].text;
              resolve(text || null);
            } catch {
              reject(new Error(`Failed to parse Claude response: ${data.slice(0, 200)}`));
            }
          } else {
            reject(new Error(`Claude API error (${res.statusCode}): ${data.slice(0, 300)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function rewriteWithLlm(entries, title) {
  console.log('Rewriting entries with Claude API...');

  const prompt = buildLlmPrompt(entries, title);
  let responseText;

  try {
    responseText = await callClaudeApi(LLM_SYSTEM_PROMPT, prompt);
  } catch (err) {
    console.warn(`LLM rewrite failed: ${err.message}. Using raw entries.`);
    return { summary: null, entries };
  }

  if (!responseText) {
    console.warn('No ANTHROPIC_API_KEY set. Skipping LLM rewrite.');
    return { summary: null, entries };
  }

  let rewritten;
  try {
    // Strip markdown fences if present
    const cleaned = responseText.replace(/^```json?\s*/m, '').replace(/```\s*$/m, '').trim();
    rewritten = JSON.parse(cleaned);
  } catch {
    console.warn('Failed to parse LLM response. Using raw entries.');
    return { summary: null, entries };
  }

  // Apply rewrites
  const result = [];
  for (const rw of rewritten.entries || []) {
    if (rw.category === 'skip') continue;

    const original = entries[rw.index];
    if (!original) continue;

    result.push({
      category: rw.category || original.category,
      plugin: original.plugin,
      headline: capitalizeFirst(rw.headline || original.headline),
      details: rw.details || null,
      commits: original.commits
    });
  }

  console.log(`LLM kept ${result.length} of ${entries.length} entries (${entries.length - result.length} marked as skip)`);

  return {
    summary: rewritten.summary || null,
    entries: result
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log(`Generating release notes for ${options.from} to ${options.to}`);

  const commits = getCommits(options.from, options.to);
  console.log(`Found ${commits.length} total commits in range`);

  let entries = buildEntries(commits);
  console.log(`Customer-visible entries (pre-LLM): ${entries.length}`);

  // LLM rewriting step
  let summary = null;
  const title = weekTitle(options.from);

  if (!options.skipLlm && entries.length > 0) {
    const rewritten = await rewriteWithLlm(entries, title);
    summary = rewritten.summary;
    entries = rewritten.entries;
    console.log(`Customer-visible entries (post-LLM): ${entries.length}`);
  }

  const hasBreaking = entries.some((e) => e.category === 'breaking');

  const slug = weekSlug(options.from);
  const releaseNote = {
    slug,
    title,
    summary,
    published_at: new Date().toISOString(),
    week_start: options.from,
    week_end: options.to,
    has_breaking: hasBreaking,
    total_commits: commits.length,
    entries
  };

  // Category summary
  const cats = {};
  for (const e of entries) {
    cats[e.category] = (cats[e.category] || 0) + 1;
  }
  for (const [cat, count] of Object.entries(cats)) {
    console.log(`  ${cat}: ${count}`);
  }

  if (options.verbose) {
    console.log(JSON.stringify(releaseNote, null, 2));
  }

  if (options.dryRun) {
    console.log('\n--- DRY RUN ---');
    console.log(JSON.stringify(releaseNote, null, 2));
    return;
  }

  if (entries.length === 0) {
    console.log('No customer-visible changes this period. Skipping file output.');
    return;
  }

  // Determine output directory
  const outDir = options.outDir || path.join(process.cwd(), 'release-notes');

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Write the individual release note
  const notePath = path.join(outDir, `${slug}.json`);
  fs.writeFileSync(notePath, JSON.stringify(releaseNote, null, 2) + '\n');
  console.log(`Wrote ${notePath}`);

  // Update the index
  const indexPath = path.join(outDir, 'index.json');
  const index = updateIndex(indexPath, releaseNote);
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
  console.log(`Updated ${indexPath} (${index.length} entries)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

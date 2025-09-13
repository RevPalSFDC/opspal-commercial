/**
 * soql-guard.js
 *
 * Centralized SOQL analyzer for:
 * - Detecting Tooling API objects and required CLI flags
 * - Validating risky/unsupported patterns
 * - Optionally delegating to the ClaudeSFDC rewriter for guidance
 */

const path = require('path');

// Known Tooling API sObjects that require --use-tooling-api when queried via CLI
const TOOLING_OBJECTS = [
  'Flow',
  'FlowDefinition',
  'FlowDefinitionView',
  'ValidationRule',
  'FlexiPage',
  'Layout',
  'FieldDefinition',
  'EntityDefinition',
  'ApexClass',
  'ApexTrigger',
  'ApexTestQueueItem',
  'ApexCodeCoverage',
  'ApexCodeCoverageAggregate'
];

function normalizeWhitespace(str) {
  return str.replace(/\s+/g, ' ').trim();
}

function extractFromObjects(query) {
  // Simple heuristic to extract top-level FROM object names
  const q = query.replace(/\(.*?\)/gs, ''); // remove subselects for simplicity
  const m = q.match(/\bFROM\s+([\w\.]+)/i);
  if (!m) return [];
  return m[1].split(',').map(s => s.trim());
}

function detectToolingUsage(query) {
  const froms = extractFromObjects(query);
  return froms.some(obj => TOOLING_OBJECTS.includes(obj));
}

function findIssues(query) {
  const issues = [];
  const q = query.trim();
  const qUpper = q.toUpperCase();

  if (!qUpper.startsWith('SELECT')) {
    issues.push({ id: 'NOT_SELECT', level: 'error', message: 'Query must start with SELECT.' });
  }

  if (/COUNT\s*\(\s*DISTINCT\s+/i.test(q)) {
    issues.push({ id: 'COUNT_DISTINCT', level: 'error', message: 'COUNT(DISTINCT ...) is not supported in SOQL. Use GROUP BY and count rows.' });
  }

  if (/COUNT\s*\(\s*CASE\s+WHEN/i.test(q)) {
    issues.push({ id: 'CASE_IN_COUNT', level: 'error', message: 'CASE inside COUNT is not supported. Use formula field with SUM, or split into separate WHERE queries.' });
  }

  if (/(DATEADD|DATEDIFF|DATE_ADD|DATE_SUB)\s*\(/i.test(q)) {
    issues.push({ id: 'DATE_ARITHMETIC', level: 'warn', message: 'Date arithmetic functions not supported. Prefer SOQL date literals (e.g., LAST_N_DAYS:30).' });
  }

  // Warn on NOT LIKE usage (allowed but error-prone without parentheses)
  if (/NOT\s+LIKE/i.test(q)) {
    issues.push({ id: 'NOT_LIKE', level: 'warn', message: 'NOT LIKE can be tricky. Ensure proper parentheses or consider explicit exclusions.' });
  }

  // Warn when GROUP BY exists and obvious non-aggregate fields likely missing in GROUP BY
  if (/\bGROUP\s+BY\b/i.test(q)) {
    const selectPart = q.split(/\bFROM\b/i)[0];
    const groupByPart = (q.split(/\bGROUP\s+BY\b/i)[1] || '').split(/\bORDER\s+BY\b|\bLIMIT\b/i)[0] || '';
    const groupFields = groupByPart.split(',').map(s => normalizeWhitespace(s)).filter(Boolean);
    const selectFields = selectPart
      .replace(/SELECT/i, '')
      .split(',')
      .map(s => normalizeWhitespace(s))
      .filter(Boolean);
    const nonAgg = selectFields.filter(f => !/(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(f));
    const missing = nonAgg.filter(f => !groupFields.some(g => g === f || f.endsWith(' ' + g)));
    if (missing.length > 0) {
      issues.push({ id: 'GROUP_BY_MISSING', level: 'error', message: `Fields not in GROUP BY: ${missing.join(', ')}` });
    }
    // Warn if aggregates missing aliases
    const noAliasAgg = selectFields.filter(f => /(COUNT|SUM|AVG|MIN|MAX)\s*\([^\)]*\)\s*$/i.test(f));
    if (noAliasAgg.length > 0) {
      issues.push({ id: 'AGG_NO_ALIAS', level: 'warn', message: `Provide aliases for aggregates: ${noAliasAgg.join(', ')}` });
    }
  }

  // Duplicate relationship Name columns (heuristic)
  const nameMatches = (q.match(/\b[\w]+\.[\w]+\.?Name\b/gi) || []);
  const unique = new Set(nameMatches.map(s => s.toLowerCase()));
  if (nameMatches.length > 1 && unique.size > 1) {
    issues.push({ id: 'DUPLICATE_ALIAS_NAME', level: 'warn', message: 'Multiple relationship Name fields selected. Consider unique aliases (e.g., CreatedBy.Name CreatedByName).' });
  }

  return issues;
}

function maybeRewrite(query, options = {}) {
  const { allowRewrite = false } = options;
  const result = { rewritten: query, modified: false, warnings: [], suggestions: [] };

  // Optionally use the ClaudeSFDC rewriter if present
  try {
    const rewriterPath = path.resolve(process.cwd(), 'ClaudeSFDC', 'scripts', 'soql-query-rewriter.js');
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const SOQLRewriter = require(rewriterPath);
    const rw = new SOQLRewriter();
    const out = rw.rewriteQuery(query);
    // rewriteQuery may be sync or async depending on implementation
    const apply = (res) => {
      result.rewritten = res.rewritten;
      result.modified = res.modified;
      result.warnings = res.warnings || [];
      result.suggestions = res.suggestions || [];
    };
    if (out && typeof out.then === 'function') {
      // Caller must await in this case; keep original for sync consumers
      // We won’t await here; consumers of maybeRewrite should handle async if needed.
    } else if (out) {
      apply(out);
    }
  } catch (e) {
    // Rewriter not available; ignore
  }

  if (!allowRewrite) {
    // Do not apply modifications automatically
    result.rewritten = query;
    result.modified = false;
  }

  return result;
}

function prepareQuery(query, options = {}) {
  const issues = findIssues(query);
  const useToolingApi = detectToolingUsage(query);
  const flags = [];
  if (useToolingApi) flags.push('--use-tooling-api');

  const rewrite = maybeRewrite(query, options);

  return {
    original: query,
    query: rewrite.modified ? rewrite.rewritten : query,
    flags,
    useToolingApi,
    issues,
    warnings: rewrite.warnings,
    suggestions: rewrite.suggestions
  };
}

module.exports = {
  prepareQuery,
  findIssues,
  detectToolingUsage,
  TOOLING_OBJECTS
};


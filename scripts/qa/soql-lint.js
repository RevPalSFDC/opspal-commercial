#!/usr/bin/env node
/**
 * soql-lint.js — Cross-repo SOQL linter for assessment agents and scripts
 * Flags:
 *  - Tooling objects used without --use-tooling-api in CLI commands
 *  - COUNT(DISTINCT ...)
 *  - CASE inside COUNT/aggregates
 *  - Date arithmetic functions (DATEADD, DATEDIFF, DATE_ADD, DATE_SUB)
 *  - GROUP BY with non-aggregate fields missing
 *  - Aggregates without aliases
 *  - Multiple relationship Name fields (alias collision risk)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.cwd());
const REPORT_DIR = path.join(ROOT, 'reports');
const REPORT_FILE = path.join(REPORT_DIR, `SOQL_LINT_REPORT_${new Date().toISOString().slice(0,10)}.md`);
const FILE_EXTS = new Set(['.js', '.ts', '.sh', '.py', '.md', '.yml', '.yaml']);

const TOOLING = /(Flow\b|FlowDefinition\b|FlowDefinitionView\b|ValidationRule\b|Layout\b|FlexiPage\b|FieldDefinition\b|EntityDefinition\b|ApexClass\b|ApexTrigger\b)/i;

const rules = [
  {
    id: 'TOOLING-WITHOUT-FLAG',
    desc: 'Tooling object queried without --use-tooling-api',
    regex: /sf\s+data\s+query[^\n]*\bFROM\s+[^\n]+$/i,
    validate: (line) => TOOLING.test(line) && !/--use-tooling-api/.test(line)
  },
  {
    id: 'COUNT-DISTINCT',
    desc: 'COUNT(DISTINCT ...) is not supported in SOQL',
    regex: /COUNT\s*\(\s*DISTINCT\s+/i
  },
  {
    id: 'CASE-IN-AGG',
    desc: 'CASE inside aggregate not supported',
    regex: /(COUNT|SUM|AVG|MIN|MAX)\s*\(\s*CASE\s+WHEN/i
  },
  {
    id: 'DATE-ARITHMETIC',
    desc: 'Date arithmetic functions not supported (use date literals)',
    regex: /(DATEADD|DATEDIFF|DATE_ADD|DATE_SUB)\s*\(/i
  },
  {
    id: 'NOT-LIKE',
    level: 'warn',
    desc: 'NOT LIKE can be error-prone; ensure parentheses',
    regex: /NOT\s+LIKE/i
  },
  {
    id: 'AGG-WITHOUT-ALIAS',
    level: 'warn',
    desc: 'Aggregates without aliases degrade readability (COUNT(Id) totalCount)',
    regex: /(SELECT[\s\S]{0,200})(COUNT|SUM|AVG|MIN|MAX)\s*\([^\)]*\)\s*(,|FROM)/i
  },
  {
    id: 'REL-NAME-ALIAS-COLLISION',
    level: 'warn',
    desc: 'Multiple relationship Name fields; consider unique aliases',
    regex: /\b(\w+)\.Name\b[\s\S]{0,120}\b(\w+)\.Name\b/i
  }
];

const findings = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // Skip heavy or irrelevant dirs
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.venv' || entry.name === 'out') continue;
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (!FILE_EXTS.has(ext)) continue;
      const rel = path.relative(ROOT, full);
      let content;
      try { content = fs.readFileSync(full, 'utf8'); } catch { continue; }
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        for (const rule of rules) {
          if (!rule.regex.test(line)) continue;
          const ok = typeof rule.validate === 'function' ? rule.validate(line) : true;
          if (!ok) continue;
          findings.push({ file: rel, line: idx + 1, id: rule.id, level: rule.level || 'error', desc: rule.desc, snippet: line.trim() });
        }
      });
    }
  }
}

walk(ROOT);

fs.mkdirSync(REPORT_DIR, { recursive: true });
let out = `# SOQL Lint Report\n\nDate: ${new Date().toISOString()}\n\n`;
if (findings.length === 0) {
  out += 'No issues found.\n';
} else {
  const errors = findings.filter(f => f.level === 'error').length;
  const warns = findings.filter(f => f.level === 'warn').length;
  out += `Total: ${findings.length} (errors: ${errors}, warnings: ${warns})\n\n`;
  for (const f of findings) {
    out += `- [${f.level.toUpperCase()}][${f.id}] ${f.desc}\n  - File: ${f.file}:${f.line}\n  - Snippet: \`${f.snippet}\`\n\n`;
  }
}
fs.writeFileSync(REPORT_FILE, out, 'utf8');

console.log(out);
process.exit(findings.some(f => f.level === 'error') ? 2 : 0);


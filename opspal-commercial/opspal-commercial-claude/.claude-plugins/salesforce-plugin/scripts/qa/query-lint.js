#!/usr/bin/env node
/**
 * query-lint.js — Flags unsafe/invalid SOQL usage patterns in repo
 * Scope: ClaudeSFDC only (Salesforce)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const REPORT_DIR = path.join(ROOT, 'docs');
const REPORT_FILE = path.join(REPORT_DIR, `QUERY_LINT_REPORT_${new Date().toISOString().slice(0,10)}.md`);

const FILE_EXTS = new Set(['.js', '.ts', '.sh', '.py', '.md', '.yml', '.yaml']);

const patterns = [
  {
    id: 'FLOW-APINAME',
    desc: "ApiName used against Flow (versions)",
    regex: /ApiName[\s\S]{0,120}\bFROM\s+Flow\b/i,
    fix: "Use Definition.DeveloperName on Flow or switch to FlowDefinition/FlowDefinitionView."
  },
  {
    id: 'FLOW-ISACTIVE',
    desc: "IsActive used against Flow (versions)",
    regex: /IsActive[\s\S]{0,120}\bFROM\s+Flow\b/i,
    fix: "Use Status on Flow, or use IsActive on FlowDefinition/FlowDefinitionView."
  },
  {
    id: 'FDV-TRIGGERTYPE',
    desc: "TriggerType used against FlowDefinition/FlowDefinitionView",
    regex: /TriggerType[\s\S]{0,120}\bFROM\s+FlowDefinition(View)?\b/i,
    fix: "TriggerType is not available on FlowDefinition/FlowDefinitionView; query Flow instead."
  },
  {
    id: 'FLOW-DEVELOPERNAME-BARE',
    desc: "DeveloperName used on Flow without Definition.",
    regex: /DeveloperName[\s\S]{0,120}\bFROM\s+Flow\b/i,
    validate: (snippet) => !/Definition\.DeveloperName/.test(snippet),
    fix: "Use Definition.DeveloperName on Flow."
  },
  {
    id: 'FIELDDEF-NAME',
    desc: "Name selected from FieldDefinition",
    regex: /SELECT[\s\S]{0,80}\bName\b[\s\S]{0,200}\bFROM\s+FieldDefinition\b/i,
    fix: "FieldDefinition does not expose Name; use QualifiedApiName and Label."
  },
  {
    id: 'MISSING-TOOLING',
    desc: "Tooling object queried without --use-tooling-api",
    // Heuristic: find a single-line command with sf data query and Tooling object without flag
    regex: /sf\s+data\s+query[^\n]*\bFROM\s+(Flow\b|FlowDefinition\b|FlowDefinitionView\b|ValidationRule\b|Layout\b|FlexiPage\b|FieldDefinition\b)[^\n]*$/i,
    validate: (line) => !/--use-tooling-api/.test(line),
    fix: "Add --use-tooling-api for Tooling entities."
  },
  {
    id: 'FVV-APINAME',
    desc: "ApiName used against FlowVersionView (field doesn't exist)",
    regex: /ApiName[\s\S]{0,120}\bFROM\s+FlowVersionView\b/i,
    fix: "FlowVersionView doesn't have ApiName field. Use FlowDefinitionView.ApiName or FlowVersionView.DeveloperName instead."
  },
  {
    id: 'MIXED-OPS-OR',
    desc: "Mixing = and LIKE operators in OR conditions",
    regex: /\b(WHERE|AND)\b[\s\S]{1,300}\b(=\s*'[^']*'|LIKE\s*'[^']*')[\s\S]{1,200}\bOR\b[\s\S]{1,200}\b(=\s*'[^']*'|LIKE\s*'[^']*')/i,
    validate: (snippet) => {
      // Check if both = and LIKE operators are present in OR chain
      const hasEquals = /\s=\s*'/.test(snippet);
      const hasLike = /\sLIKE\s+'/i.test(snippet);
      const hasOr = /\bOR\b/i.test(snippet);
      return hasEquals && hasLike && hasOr; // Flag only if all three present
    },
    fix: "Use consistent operators in OR conditions: all LIKE or all =. Or use nested conditions: (Type = 'X' OR Type = 'Y') OR (Type LIKE '%Z%'). Or use IN: Type IN ('X', 'Y') OR Type LIKE '%Z%'."
  },
  {
    id: 'DEPLOYMENT-NO-VALIDATION',
    desc: "Deployment command without source path validation",
    regex: /sf\s+project\s+deploy\s+start\s+--source-dir\s+\$\{[^}]+\}|sf\s+project\s+deploy\s+start\s+--source-dir\s+[^-\s]+(?!\s*&&\s*test|\s*#\s*validated)/i,
    validate: (snippet) => {
      // Only flag if using dynamic path variables without validation
      const hasDynamicPath = /\$\{[^}]+\}|\$[A-Z_]+/.test(snippet);
      const hasValidation = /validateSource|fs\.existsSync|test\s+-[de]|if\s*\[/.test(snippet);
      return hasDynamicPath && !hasValidation;
    },
    fix: "Validate source directory exists before deployment: validateSourceDir(sourcePath) or use deployment-source-validator.js"
  }
];

const findings = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules
      if (entry.name === 'node_modules') continue;
      walk(full);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (!FILE_EXTS.has(ext)) continue;
      const rel = path.relative(ROOT, full);
      if (/docs\/QUERY_LINT_REPORT_/.test(rel)) return; // skip generated reports
      let content;
      try { content = fs.readFileSync(full, 'utf8'); } catch { continue; }
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        for (const rule of patterns) {
          if (rule.regex.test(line)) {
            let ok = true;
            if (typeof rule.validate === 'function') ok = rule.validate(line);
            if (!ok) continue;
            findings.push({ file: rel, line: idx + 1, rule: rule.id, desc: rule.desc, snippet: line.trim(), fix: rule.fix });
          }
        }
      });
    }
  }
}

walk(ROOT);

// Write report
fs.mkdirSync(REPORT_DIR, { recursive: true });
let out = `# Query Lint Report\n\nDate: ${new Date().toISOString()}\n\n`;
if (findings.length === 0) {
  out += 'No violations found.\n';
} else {
  out += `Found ${findings.length} potential violations.\n\n`;
  for (const f of findings) {
    out += `- [${f.rule}] ${f.desc}\n  - File: ${f.file}:${f.line}\n  - Snippet: \`${f.snippet}\`\n  - Suggested fix: ${f.fix}\n\n`;
  }
}
fs.writeFileSync(REPORT_FILE, out, 'utf8');

console.log(out);
process.exit(findings.length > 0 ? 2 : 0);

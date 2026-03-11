#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const EXECUTABLE_FENCE_LANGS = new Set([
  '',
  'bash',
  'sh',
  'shell',
  'zsh',
  'json'
]);

const DIRECT_RUNTIME_PATH_PATTERN = /(^|[^A-Za-z0-9_])(?:\.\/)?(?:\.claude-plugins|plugins)\/(opspal-[a-z0-9-]+)\/(scripts|hooks|templates|commands|agents|skills|docs|config|scheduler)\b/;
const HOME_PLUGIN_RUNTIME_PATH_PATTERN = /(^|[^A-Za-z0-9_])(?:\$HOME|~)\/\.claude\/plugins\/(?:cache\/[^/\s]+\/)?(opspal-[a-z0-9-]+)(?:@[^\s/"']+|\/[^\s/"']+)?\/(scripts|hooks|templates|commands|agents|skills|docs|config|scheduler)\b/;
const CLAUDE_PLUGIN_ROOT_MISUSE_PATTERN = /\$\{CLAUDE_PLUGIN_ROOT[^}]*\}\/(?:\.claude-plugins|plugins)\//;

function walkDirectory(dirPath, collector) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'coverage') {
        continue;
      }
      walkDirectory(fullPath, collector);
      continue;
    }

    collector(fullPath);
  }
}

function getDefaultScanFiles(rootDir) {
  const files = [];
  const pushFile = (targetPath) => {
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
      files.push(targetPath);
    }
  };

  pushFile(path.join(rootDir, 'INSTALLATION.md'));
  pushFile(path.join(rootDir, 'CLAUDE.md'));
  pushFile(path.join(rootDir, 'docs', 'HOOK_ARCHITECTURE.md'));
  pushFile(path.join(rootDir, 'docs', 'PLUGIN_DEVELOPMENT_GUIDE.md'));
  pushFile(path.join(rootDir, 'docs', 'PLUGIN_DEVELOPMENT_STANDARDS.md'));

  walkDirectory(path.join(rootDir, 'plugins'), (filePath) => {
    const normalized = filePath.split(path.sep).join('/');
    if (!normalized.endsWith('.md') && !normalized.endsWith('.json') && !normalized.endsWith('.yaml') && !normalized.endsWith('.yml')) {
      return;
    }

    const include = [
      '/commands/',
      '/agents/',
      '/skills/',
      '/templates/',
      '/hooks/'
    ].some(segment => normalized.includes(segment));

    if (!include) {
      return;
    }

    if (normalized.includes('/hooks/') && !normalized.endsWith('/README.md')) {
      return;
    }

    files.push(filePath);
  });

  return [...new Set(files)].sort();
}

function parseMarkdownViolations(filePath, content) {
  const violations = [];
  const lines = content.split('\n');
  let inFence = false;
  let fenceLang = '';

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (!inFence) {
        inFence = true;
        fenceLang = trimmed.slice(3).trim().toLowerCase();
      } else {
        inFence = false;
        fenceLang = '';
      }
      continue;
    }

    if (!inFence || !EXECUTABLE_FENCE_LANGS.has(fenceLang)) {
      continue;
    }

    if (!trimmed) {
      continue;
    }

    if (/^(#|\/\/|\/\*|\*|\-\s)/.test(trimmed) && !trimmed.includes('"command"')) {
      continue;
    }

    const violation = classifyViolation(line);
    if (violation) {
      violations.push({
        ...violation,
        filePath,
        line: index + 1
      });
    }
  }

  return violations;
}

function parseStructuredFileViolations(filePath, content) {
  const violations = [];
  const lines = content.split('\n');

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const violation = classifyViolation(line);
    if (violation) {
      violations.push({
        ...violation,
        filePath,
        line: index + 1
      });
    }
  }

  return violations;
}

function classifyViolation(line) {
  if (CLAUDE_PLUGIN_ROOT_MISUSE_PATTERN.test(line)) {
    return {
      rule: 'claude-plugin-root-misuse',
      message: 'Do not append /.claude-plugins or /plugins onto CLAUDE_PLUGIN_ROOT.'
    };
  }

  if (DIRECT_RUNTIME_PATH_PATTERN.test(line)) {
    return {
      rule: 'hardcoded-runtime-plugin-path',
      message: 'Use CLAUDE_PLUGIN_ROOT or the shared resolver instead of workspace-relative plugin paths.'
    };
  }

  if (HOME_PLUGIN_RUNTIME_PATH_PATTERN.test(line)) {
    return {
      rule: 'hardcoded-home-plugin-path',
      message: 'Do not hardcode ~/.claude plugin install paths in executable content.'
    };
  }

  return null;
}

function validateRuntimePathReferences(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const files = options.files || getDefaultScanFiles(rootDir);
  const violations = [];

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, 'utf8');

    if (ext === '.md') {
      violations.push(...parseMarkdownViolations(filePath, content));
      continue;
    }

    if (ext === '.json' || ext === '.yaml' || ext === '.yml') {
      violations.push(...parseStructuredFileViolations(filePath, content));
    }
  }

  return {
    rootDir,
    filesScanned: files.length,
    violationCount: violations.length,
    violations
  };
}

function printTextReport(result) {
  if (result.violations.length === 0) {
    console.log(`runtime-path-reference-validator: OK (${result.filesScanned} files scanned)`);
    return;
  }

  console.log(`runtime-path-reference-validator: ${result.violationCount} violation(s) across ${result.filesScanned} files`);
  for (const violation of result.violations) {
    const relativePath = path.relative(result.rootDir, violation.filePath) || violation.filePath;
    console.log(`- ${relativePath}:${violation.line} [${violation.rule}] ${violation.message}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const rootArg = args.find(arg => arg.startsWith('--root='));
  const rootDir = rootArg ? rootArg.split('=').slice(1).join('=') : process.cwd();

  const result = validateRuntimePathReferences({ rootDir });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printTextReport(result);
  }

  process.exit(result.violationCount > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = {
  validateRuntimePathReferences,
  getDefaultScanFiles
};

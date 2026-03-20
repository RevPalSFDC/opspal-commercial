#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const pluginsRoot = path.join(repoRoot, 'plugins');
const MAX_DESCRIPTION_CHARS = 180;
const MAX_TOTAL_DESCRIPTION_WORDS = 3500;
const MAX_TOTAL_DESCRIPTION_CHARS = 25000;
const FORBIDDEN_MARKERS = /\b(?:CAPABILITIES|TRIGGER KEYWORDS|BLOCKED OPERATIONS|TEMPLATES HANDLED|MODES)\s*:/i;

function listAgentFiles(dirPath) {
  let results = [];

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(listAgentFiles(fullPath));
      continue;
    }

    if (/\/agents\/shared\//.test(fullPath)) {
      continue;
    }

    if (/\/agents\/.*\.md$/.test(fullPath)) {
      results.push(fullPath);
    }
  }

  return results;
}

function extractDescription(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return '';
  }

  const lines = match[1].split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith('description:')) {
      continue;
    }

    const suffix = line.slice('description:'.length).trim();
    if (suffix === '|' || suffix === '>') {
      const values = [];
      for (let inner = index + 1; inner < lines.length; inner += 1) {
        const nextLine = lines[inner];
        if (/^\S/.test(nextLine)) {
          break;
        }
        values.push(nextLine.replace(/^\s{2}/, ''));
      }
      return values.join(' ').replace(/\s+/g, ' ').trim();
    }

    return suffix.replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
  }

  return '';
}

function main() {
  const violations = [];
  let totalWords = 0;
  let totalChars = 0;

  for (const filePath of listAgentFiles(pluginsRoot)) {
    const relativePath = path.relative(repoRoot, filePath);
    const description = extractDescription(fs.readFileSync(filePath, 'utf8'));
    const wordCount = description ? description.split(/\s+/).length : 0;

    totalWords += wordCount;
    totalChars += description.length;

    if (!description) {
      violations.push(`${relativePath}: missing description`);
      continue;
    }

    if (description.length > MAX_DESCRIPTION_CHARS) {
      violations.push(`${relativePath}: description is ${description.length} chars (max ${MAX_DESCRIPTION_CHARS})`);
    }

    if (FORBIDDEN_MARKERS.test(description)) {
      violations.push(`${relativePath}: description still contains capability/keyword markers`);
    }
  }

  if (totalWords > MAX_TOTAL_DESCRIPTION_WORDS) {
    violations.push(`cumulative agent description words ${totalWords} exceed budget ${MAX_TOTAL_DESCRIPTION_WORDS}`);
  }

  if (totalChars > MAX_TOTAL_DESCRIPTION_CHARS) {
    violations.push(`cumulative agent description chars ${totalChars} exceed budget ${MAX_TOTAL_DESCRIPTION_CHARS}`);
  }

  if (violations.length > 0) {
    console.error('Agent description budget violations detected:');
    violations.forEach((violation) => console.error(`- ${violation}`));
    process.exit(1);
  }

  console.log(`✅ Agent description budget checks passed (${totalWords} words, ${totalChars} chars)`);
}

main();

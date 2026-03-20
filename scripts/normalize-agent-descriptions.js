#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const pluginsRoot = path.join(repoRoot, 'plugins');
const DESCRIPTION_MARKERS = /\b(?:CAPABILITIES|TRIGGER KEYWORDS|BLOCKED OPERATIONS|TEMPLATES HANDLED|MODES)\s*:/i;
const MAX_DESCRIPTION_CHARS = 180;

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

function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return null;
  }

  return {
    fullMatch: match[0],
    content: match[1]
  };
}

function normalizeDescription(description) {
  let normalized = String(description || '').replace(/\s+/g, ' ').trim();
  normalized = normalized.split(DESCRIPTION_MARKERS)[0].trim();

  const firstSentenceMatch = normalized.match(/^(.+?[.!?])(?:\s|$)/);
  if (firstSentenceMatch) {
    normalized = firstSentenceMatch[1].trim();
  }

  if (normalized.length > MAX_DESCRIPTION_CHARS) {
    normalized = `${normalized.slice(0, MAX_DESCRIPTION_CHARS - 3).trimEnd()}...`;
  }

  return normalized;
}

function parseDescription(lines, startIndex) {
  const line = lines[startIndex];
  const suffix = line.slice('description:'.length).trim();

  if (suffix === '|' || suffix === '>') {
    const values = [];
    let endIndex = startIndex;

    for (let index = startIndex + 1; index < lines.length; index += 1) {
      const nextLine = lines[index];
      if (/^\S/.test(nextLine)) {
        break;
      }
      values.push(nextLine.replace(/^\s{2}/, ''));
      endIndex = index;
    }

    return {
      text: values.join(' ').replace(/\s+/g, ' ').trim(),
      endIndex
    };
  }

  return {
    text: suffix,
    endIndex: startIndex
  };
}

function quoteYamlString(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function rewriteDescription(content) {
  const frontmatter = extractFrontmatter(content);
  if (!frontmatter) {
    return null;
  }

  const lines = frontmatter.content.split('\n');
  const rewritten = [];
  let changed = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith('description:')) {
      rewritten.push(line);
      continue;
    }

    const { text, endIndex } = parseDescription(lines, index);
    const normalized = normalizeDescription(text);

    if (normalized && normalized !== text.trim()) {
      changed = true;
    }

    rewritten.push(`description: ${quoteYamlString(normalized)}`);
    index = endIndex;
  }

  if (!changed) {
    return null;
  }

  const newFrontmatter = `---\n${rewritten.join('\n')}\n---\n`;
  return content.replace(frontmatter.fullMatch, newFrontmatter);
}

function main() {
  const agentFiles = listAgentFiles(pluginsRoot);
  let changedCount = 0;

  for (const filePath of agentFiles) {
    const original = fs.readFileSync(filePath, 'utf8');
    const rewritten = rewriteDescription(original);
    if (!rewritten || rewritten === original) {
      continue;
    }

    fs.writeFileSync(filePath, rewritten, 'utf8');
    changedCount += 1;
  }

  console.log(`Normalized agent descriptions in ${changedCount} file(s).`);
}

main();

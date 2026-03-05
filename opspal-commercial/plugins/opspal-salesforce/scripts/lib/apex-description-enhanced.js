#!/usr/bin/env node

/**
 * Enhanced Apex Description Extractor (v3.28.2)
 *
 * Robust description extraction with multiple fallbacks:
 * 1. Class/trigger JavaDoc comments
 * 2. First method JavaDoc
 * 3. Inline comments near class declaration
 * 4. Smart name parsing (camelCase to Title Case)
 * 5. Sharing tag annotation
 *
 * Includes confidence scoring: high, medium, low, very-low
 *
 * @version 1.0.0
 * @date 2025-10-22
 */

function toTitleFromClassName(name) {
  // Strip common prefixes, split camelCase/underscores, tidy
  const cleaned = name.replace(/^(SBQQ|NPSP|CPQ|ABG|PKB|NS)\_?/i, '');
  const parts = cleaned
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .trim()
    .split(/\s+/);
  return parts.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function firstMeaningful(lines) {
  return lines
    .map(s => s.trim())
    .filter(s => s && !/^@(?:param|return|author|group|deprecated|see)/i.test(s))
    .filter(s => !/^[\*\-\=\#\{\}\[\]\(\)\.\,\/\:\;]+$/.test(s))
    [0] || '';
}

function extractBlockJavadoc(body) {
  // Find /** ... */ immediately before class or first non-import token
  const m = body.match(/\/\*\*([\s\S]*?)\*\/\s*(?:public|global|private|protected)?\s*(?:with|without)?\s*sharing?\s*class\s+\w+/i);
  if (!m) return '';
  const content = m[1]
    .split('\n')
    .map(l => l.replace(/^\s*\*\s?/, ''));
  return firstMeaningful(content);
}

function extractFirstMethodJavadoc(body) {
  const m = body.match(/\/\*\*([\s\S]*?)\*\/\s*(?:public|global|private|protected)?\s+(?:static\s+)?[\w\<\>\[\]]+\s+\w+\s*\(/i);
  if (!m) return '';
  const content = m[1].split('\n').map(l => l.replace(/^\s*\*\s?/, ''));
  return firstMeaningful(content);
}

function extractInlineCommentNearClass(body) {
  // Single-line comment just above class
  const m = body.match(/(?:\r?\n|\r)(\/\/[^\n\r]+)\s*(?:\r?\n|\r)\s*(?:public|global|private|protected)?\s*(?:with|without)?\s*sharing?\s*class\s+\w+/i);
  return m ? m[1].replace(/^\/\/\s?/, '').trim() : '';
}

function extractSharingTag(body) {
  const m = body.match(/\b(without|with)\s+sharing\b/i);
  return m ? m[0].toLowerCase() : '';
}

function extractClassDescription({ body, className, minLen = 5 }) {
  const candidates = [];
  const fromJavadoc = extractBlockJavadoc(body);
  if (fromJavadoc) candidates.push({ text: fromJavadoc, source: 'class-javadoc' });

  const methodJavadoc = extractFirstMethodJavadoc(body);
  if (methodJavadoc) candidates.push({ text: methodJavadoc, source: 'method-javadoc' });

  const inline = extractInlineCommentNearClass(body);
  if (inline) candidates.push({ text: inline, source: 'inline-comment' });

  // Smart name fallback
  candidates.push({ text: toTitleFromClassName(className), source: 'name-fallback' });

  // Select best
  let best = candidates.find(c => c.text.length >= minLen) || candidates[0];
  const sharing = extractSharingTag(body);
  const confidence =
    best.source === 'class-javadoc' ? 'high' :
    best.source === 'method-javadoc' ? 'medium' :
    best.source === 'inline-comment' ? 'low' : 'very-low';

  const annotated = sharing ? `${best.text} (${sharing})` : best.text;
  return { description: annotated, source: best.source, confidence };
}

/**
 * Extract description from trigger with fallbacks
 * @param {string} body - Trigger source code
 * @param {string} triggerName - Trigger name
 * @param {number} minLen - Minimum description length
 * @returns {Object} {description, source, confidence}
 */
function extractTriggerDescription({ body, triggerName, minLen = 5 }) {
  const candidates = [];

  // Try JavaDoc comment before trigger declaration
  const javadocMatch = body.match(/\/\*\*([\s\S]*?)\*\/\s*trigger\s+\w+/i);
  if (javadocMatch) {
    const content = javadocMatch[1].split('\n').map(l => l.replace(/^\s*\*\s?/, ''));
    const desc = firstMeaningful(content);
    if (desc) candidates.push({ text: desc, source: 'trigger-javadoc' });
  }

  // Try inline comment above trigger
  const inlineMatch = body.match(/(?:\r?\n|\r)(\/\/[^\n\r]+)\s*(?:\r?\n|\r)\s*trigger\s+\w+/i);
  if (inlineMatch) {
    const desc = inlineMatch[1].replace(/^\/\/\s?/, '').trim();
    if (desc) candidates.push({ text: desc, source: 'inline-comment' });
  }

  // Name fallback
  candidates.push({ text: toTitleFromClassName(triggerName), source: 'name-fallback' });

  const best = candidates.find(c => c.text.length >= minLen) || candidates[0];
  const confidence =
    best.source === 'trigger-javadoc' ? 'high' :
    best.source === 'inline-comment' ? 'medium' : 'very-low';

  return { description: best.text, source: best.source, confidence };
}

module.exports = {
  extractClassDescription,
  extractTriggerDescription,
  toTitleFromClassName
};

// CLI testing
if (require.main === module) {
  const fs = require('fs');
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node apex-description-enhanced.js <apex-file>');
    console.log('');
    console.log('Example:');
    console.log('  node apex-description-enhanced.js MyClass.cls');
    console.log('  node apex-description-enhanced.js MyTrigger.trigger');
    process.exit(1);
  }

  const file = args[0];
  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  const body = fs.readFileSync(file, 'utf8');
  const name = file.split('/').pop().replace(/\.(cls|trigger)$/, '');
  const isTrigger = file.endsWith('.trigger');

  const result = isTrigger
    ? extractTriggerDescription({ body, triggerName: name })
    : extractClassDescription({ body, className: name });

  console.log('\n=== Enhanced Description Extraction ===\n');
  console.log(`Name: ${name}`);
  console.log(`Type: ${isTrigger ? 'Trigger' : 'Class'}`);
  console.log(`Description: ${result.description}`);
  console.log(`Source: ${result.source}`);
  console.log(`Confidence: ${result.confidence}`);
  console.log('');
}

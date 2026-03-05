#!/usr/bin/env node

/**
 * Lightweight XML Metadata Validator
 * Fast, offline validation for Salesforce metadata XML files.
 * Designed for PostToolUse hook — must complete in <200ms.
 *
 * Exit codes:
 *   0 = valid (or not an XML file)
 *   1 = errors found
 *   2 = warnings only
 */

const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];

if (!filePath) {
  process.stderr.write('Usage: xml-metadata-validator.js <file.xml>\n');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  // File doesn't exist yet (pre-write) — skip silently
  process.exit(0);
}

const errors = [];
const warnings = [];

let content;
try {
  content = fs.readFileSync(filePath, 'utf8');
} catch (err) {
  process.stderr.write(`Cannot read file: ${err.message}\n`);
  process.exit(1);
}

// Skip empty files
if (!content.trim()) {
  process.exit(0);
}

// --- Check 1: Well-formedness (basic XML structure) ---
// Check for matching root tag
const rootOpenMatch = content.match(/<([a-zA-Z][\w.-]*)[^>]*>/);
if (!rootOpenMatch) {
  errors.push('Malformed XML: no opening tag found');
} else {
  const rootTag = rootOpenMatch[1];
  // Check for unclosed tags (simple heuristic — count open vs self-close vs close)
  const openTags = (content.match(new RegExp(`<${rootTag}[\\s>]`, 'g')) || []).length;
  const closeTags = (content.match(new RegExp(`</${rootTag}>`, 'g')) || []).length;
  if (openTags > 0 && closeTags === 0) {
    // Could be self-closing
    const selfClose = (content.match(new RegExp(`<${rootTag}[^>]*/>`)) || []).length;
    if (selfClose === 0) {
      errors.push(`Malformed XML: root tag <${rootTag}> has no closing tag`);
    }
  }
}

// Check for mismatched angle brackets (common typo)
const openBrackets = (content.match(/</g) || []).length;
const closeBrackets = (content.match(/>/g) || []).length;
if (openBrackets !== closeBrackets) {
  errors.push(`Malformed XML: mismatched angle brackets (${openBrackets} '<' vs ${closeBrackets} '>')`);
}

// Check for XML declaration issues
if (content.startsWith('<?xml')) {
  const declEnd = content.indexOf('?>');
  if (declEnd === -1) {
    errors.push('Malformed XML: unclosed XML declaration (<?xml without ?>)');
  }
}

// --- Check 2: API Version ---
const apiVersionMatch = content.match(/<apiVersion>([\d.]+)<\/apiVersion>/);
if (apiVersionMatch) {
  const version = parseFloat(apiVersionMatch[1]);
  if (version < 55.0) {
    warnings.push(`API version ${apiVersionMatch[1]} is below minimum recommended (55.0). Consider upgrading.`);
  }
  if (version < 40.0) {
    errors.push(`API version ${apiVersionMatch[1]} is critically outdated (minimum: 40.0)`);
  }
}

// --- Check 3: Field History Tracking count ---
// Only relevant for CustomObject metadata
const basename = path.basename(filePath);
if (basename.endsWith('.object-meta.xml') || basename.endsWith('.object')) {
  const trackHistoryMatches = content.match(/<trackHistory>true<\/trackHistory>/g);
  if (trackHistoryMatches && trackHistoryMatches.length > 20) {
    errors.push(`Field History Tracking limit exceeded: ${trackHistoryMatches.length} fields tracked (max 20 per object)`);
  } else if (trackHistoryMatches && trackHistoryMatches.length > 17) {
    warnings.push(`Field History Tracking near limit: ${trackHistoryMatches.length}/20 fields tracked`);
  }
}

// --- Check 4: Required fields for common metadata types ---
// Check for fullName in types that require it
const metadataTypes = [
  'CustomObject', 'CustomField', 'Flow', 'ValidationRule',
  'PermissionSet', 'Profile', 'Layout', 'FlexiPage'
];
for (const type of metadataTypes) {
  if (content.includes(`<${type}`) || content.includes(`xmlns="${type}"`)) {
    if (!content.includes('<fullName>') && !content.includes('<DeveloperName>')) {
      warnings.push(`Metadata type ${type} typically requires <fullName> element`);
    }
    break;
  }
}

// Check for label in types that require it
const labelTypes = ['CustomObject', 'CustomField', 'CustomTab', 'CustomApplication'];
for (const type of labelTypes) {
  if (content.includes(`<${type}`) && !content.includes('<label>')) {
    warnings.push(`Metadata type ${type} typically requires <label> element`);
    break;
  }
}

// --- Check 5: Common formula errors in validation rules ---
if (content.includes('<ValidationRule') || content.includes('<validationRules>')) {
  // Check for ISBLANK/ISNULL on picklist fields (common error)
  const formulaMatch = content.match(/<formula>([\s\S]*?)<\/formula>/);
  if (formulaMatch) {
    const formula = formulaMatch[1];
    // Look for ISBLANK(SomePicklist) patterns — heuristic: field names ending in __c
    // that are also referenced with TEXT() elsewhere suggest picklist usage
    if (/ISBLANK\(\s*\w+__c\s*\)/.test(formula) || /ISNULL\(\s*\w+__c\s*\)/.test(formula)) {
      warnings.push('Possible ISBLANK/ISNULL on picklist field. Use TEXT(field) = "" instead for picklists.');
    }
  }
}

// --- Output results ---
const fileName = path.basename(filePath);

if (errors.length > 0) {
  process.stderr.write(`\n[XML Validator] ${fileName} - ${errors.length} error(s):\n`);
  errors.forEach(e => process.stderr.write(`  ERROR: ${e}\n`));
  if (warnings.length > 0) {
    warnings.forEach(w => process.stderr.write(`  WARN: ${w}\n`));
  }
  process.exit(1);
}

if (warnings.length > 0) {
  process.stderr.write(`\n[XML Validator] ${fileName} - ${warnings.length} warning(s):\n`);
  warnings.forEach(w => process.stderr.write(`  WARN: ${w}\n`));
  process.exit(2);
}

// Valid — no output needed
process.exit(0);

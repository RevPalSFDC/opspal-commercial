#!/usr/bin/env node

/**
 * Apex Signals Extractor (v3.28.2)
 *
 * Extracts rich signals from Apex code for enhanced audit insights:
 * - Entry points (@InvocableMethod, @AuraEnabled, @RestResource, etc.)
 * - Async patterns (Future, Queueable, Batchable, Schedulable)
 * - Security posture (with/without sharing, CRUD/FLS checks)
 * - Data operations (SOQL, DML, callouts, emails, platform events)
 * - Governor limit risks (SOQL-in-loop, DML-in-loop)
 * - Dependencies (class references)
 * - sObject footprint (FROM clauses)
 *
 * Uses fast regex patterns (good enough for v1); can upgrade to AST later
 *
 * @version 1.0.0
 * @date 2025-10-22
 */

function countRegex(body, re) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  return (body.match(g) || []).length;
}

function uniq(arr) { return [...new Set(arr)].filter(Boolean); }

/**
 * Extract sObject names from SOQL queries
 * @param {string} body - Apex source code
 * @returns {Array<string>} Unique sObject API names
 */
function extractSoqlSObjects(body) {
  const s = [];
  // Bracket notation: [SELECT ... FROM Account ...]
  const bracketRe = /\[\s*select[\s\S]*?from\s+([A-Za-z_][\w]*)\b/ig;
  let m;
  while ((m = bracketRe.exec(body))) s.push(m[1]);

  // Dynamic Database.query('SELECT ... FROM Obj ...')
  const dynRe = /Database\.query\s*\(\s*['"`][\s\S]*?from\s+([A-Za-z_][\w]*)\b/ig;
  while ((m = dynRe.exec(body))) s.push(m[1]);

  return uniq(s);
}

function has(body, re) { return re.test(body); }

/**
 * Extract comprehensive signals from ApexClass body
 * @param {string} body - Apex class source code
 * @returns {Object} Signals object with entry points, async, security, data ops, risks, dependencies
 */
function extractClassSignals(body) {
  const signals = {
    entryPoints: {
      invocable: /@InvocableMethod\b/i.test(body),
      aura: /@AuraEnabled\b/i.test(body),
      rest: /@RestResource\b/i.test(body) || /extends\s+RestResource\b/i.test(body),
      webservice: /\bwebservice\b/i.test(body)
    },
    async: {
      future: /@future\b/i.test(body),
      queueable: /implements\s+Queueable\b/i.test(body),
      batchable: /implements\s+Database\.Batchable\b/i.test(body),
      schedulable: /implements\s+Schedulable\b/i.test(body)
    },
    security: {
      withSharing: /\bwith\s+sharing\b/i.test(body),
      withoutSharing: /\bwithout\s+sharing\b/i.test(body),
      stripInaccessible: /Security\.stripInaccessible\b/.test(body),
      crudFlsChecks: /Schema\.sObjectType\.[A-Za-z_]\w*\.(isAccessible|isUpdateable|isCreateable|isDeletable)\b/.test(body)
    },
    dataOps: {
      soqlStatic: countRegex(body, /\[[\s\S]*?select[\s\S]*?from\s+[A-Za-z_]\w*/i),
      soqlDynamic: countRegex(body, /Database\.query\s*\(/i),
      dml: {
        insert: countRegex(body, /\binsert\b(?!\s+test)/i),
        update: countRegex(body, /\bupdate\b(?!\s+test)/i),
        upsert: countRegex(body, /\bupsert\b/i),
        delete: countRegex(body, /\bdelete\b(?!\s+from)/i),
        undelete: countRegex(body, /\bund[eE]lete\b/i),
        merge: countRegex(body, /\bmerge\b/i)
      },
      callouts: countRegex(body, /\bnew\s+Http\b|\bHttpRequest\b|WebServiceCallout\b|Continuation\b/i),
      emails: countRegex(body, /Messaging\.SingleEmailMessage\b/i),
      platformEvents: countRegex(body, /EventBus\.publish\b/i)
    },
    risks: {
      soqlInLoop: /for\s*\([\s\S]*?\)\s*\{[\s\S]*?\[[\s\S]*?select/i.test(body),
      dmlInLoop: /for\s*\([\s\S]*?\)\s*\{[\s\S]*?\b(insert|update|delete|upsert|merge)\b/i.test(body)
    },
    sObjects: extractSoqlSObjects(body),
    dependencies: uniq([
      // Naive class references: Foo.Bar( or new Foo(
      ...(body.match(/\bnew\s+([A-Za-z_]\w*)\s*\(/g) || []).map(s => s.replace(/\bnew\s+|\s*\(/g,'')),
      ...(body.match(/\b([A-Za-z_]\w*)\s*\./g) || []).map(s => s.replace(/\W/g,''))
    ])
  };
  return signals;
}

/**
 * Extract signals from ApexTrigger body
 * @param {string} body - Apex trigger source code
 * @returns {Object} Trigger signals with object, events, risks, handlers
 */
function extractTriggerSignals(body) {
  const header = body.match(/trigger\s+([A-Za-z_]\w*)\s+on\s+([A-Za-z_]\w*)\s*\(([\s\w,]+)\)/i);
  const events = header ? header[3].toLowerCase().split(',').map(s => s.trim()) : [];
  const obj = header ? header[2] : 'Unknown';

  const risks = {
    soqlInLoop: /for\s*\(\s*(?:[A-Za-z_]\w+)\s*:\s*Trigger\.new\b[\s\S]*?\)\s*\{[\s\S]*?\[[\s\S]*?select/i.test(body),
    dmlInLoop: /for\s*\(\s*(?:[A-Za-z_]\w+)\s*:\s*Trigger\.new\b[\s\S]*?\)\s*\{[\s\S]*?\b(insert|update|delete|upsert|merge)\b/i.test(body)
  };

  // Detect handler class calls
  const handlers = uniq((body.match(/\b([A-Za-z_]\w+)\.(?:on|handle|process|run|execute)[A-Z]\w*\s*\(/g) || [])
    .map(s => s.replace(/\..*/,''))
  );

  return { object: obj, events, risks, handlers };
}

/**
 * Format entry points for CSV display
 * @param {Object} entryPoints - Entry points object from extractClassSignals
 * @returns {string} Comma-separated list (e.g., "Invocable, Aura")
 */
function formatEntryPoints(entryPoints) {
  const points = [];
  if (entryPoints.invocable) points.push('Invocable');
  if (entryPoints.aura) points.push('Aura');
  if (entryPoints.rest) points.push('REST');
  if (entryPoints.webservice) points.push('Webservice');
  return points.length > 0 ? points.join(', ') : 'N/A';
}

/**
 * Format async patterns for CSV display
 * @param {Object} async - Async object from extractClassSignals
 * @returns {string} Comma-separated list (e.g., "Future, Queueable")
 */
function formatAsyncPatterns(async) {
  const patterns = [];
  if (async.future) patterns.push('Future');
  if (async.queueable) patterns.push('Queueable');
  if (async.batchable) patterns.push('Batchable');
  if (async.schedulable) patterns.push('Schedulable');
  return patterns.length > 0 ? patterns.join(', ') : 'N/A';
}

/**
 * Format security posture for CSV display
 * @param {Object} security - Security object from extractClassSignals
 * @returns {string} Security description
 */
function formatSecurity(security) {
  const parts = [];
  if (security.withSharing) parts.push('with sharing');
  if (security.withoutSharing) parts.push('without sharing');
  if (security.stripInaccessible) parts.push('stripInaccessible');
  if (security.crudFlsChecks) parts.push('CRUD/FLS checks');
  return parts.length > 0 ? parts.join(', ') : 'N/A';
}

/**
 * Format data operations for CSV display
 * @param {Object} dataOps - Data ops object from extractClassSignals
 * @returns {string} Compact data ops summary
 */
function formatDataOps(dataOps) {
  const parts = [];

  // SOQL
  const totalSoql = dataOps.soqlStatic + dataOps.soqlDynamic;
  if (totalSoql > 0) {
    const dynNote = dataOps.soqlDynamic > 0 ? ` (${dataOps.soqlDynamic} dyn)` : '';
    parts.push(`SOQL=${totalSoql}${dynNote}`);
  }

  // DML
  const dmlOps = [];
  if (dataOps.dml.insert > 0) dmlOps.push(`ins=${dataOps.dml.insert}`);
  if (dataOps.dml.update > 0) dmlOps.push(`upd=${dataOps.dml.update}`);
  if (dataOps.dml.upsert > 0) dmlOps.push(`ups=${dataOps.dml.upsert}`);
  if (dataOps.dml.delete > 0) dmlOps.push(`del=${dataOps.dml.delete}`);
  if (dataOps.dml.merge > 0) dmlOps.push(`mrg=${dataOps.dml.merge}`);
  if (dataOps.dml.undelete > 0) dmlOps.push(`und=${dataOps.dml.undelete}`);
  if (dmlOps.length > 0) {
    parts.push(`DML: ${dmlOps.join(' ')}`);
  }

  // Other
  if (dataOps.callouts > 0) parts.push(`Callouts=${dataOps.callouts}`);
  if (dataOps.emails > 0) parts.push(`Emails=${dataOps.emails}`);
  if (dataOps.platformEvents > 0) parts.push(`Events=${dataOps.platformEvents}`);

  return parts.length > 0 ? parts.join(' | ') : 'N/A';
}

/**
 * Format risks for CSV display
 * @param {Object} risks - Risks object from extractClassSignals or extractTriggerSignals
 * @returns {string} Comma-separated risk flags
 */
function formatRisks(risks) {
  const flags = [];
  if (risks.soqlInLoop) flags.push('SOQL-in-loop');
  if (risks.dmlInLoop) flags.push('DML-in-loop');
  return flags.length > 0 ? flags.join(', ') : 'None';
}

module.exports = {
  extractClassSignals,
  extractTriggerSignals,
  extractSoqlSObjects,
  formatEntryPoints,
  formatAsyncPatterns,
  formatSecurity,
  formatDataOps,
  formatRisks
};

// CLI testing
if (require.main === module) {
  const fs = require('fs');
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node apex-signals.js <apex-file>');
    console.log('');
    console.log('Example:');
    console.log('  node apex-signals.js MyClass.cls');
    console.log('  node apex-signals.js MyTrigger.trigger');
    process.exit(1);
  }

  const file = args[0];
  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  const body = fs.readFileSync(file, 'utf8');
  const isTrigger = file.endsWith('.trigger');

  console.log('\n=== Apex Signals Extraction ===\n');

  if (isTrigger) {
    const signals = extractTriggerSignals(body);
    console.log('Type: Trigger');
    console.log(`Object: ${signals.object}`);
    console.log(`Events: ${signals.events.join(', ')}`);
    console.log(`Handlers: ${signals.handlers.join(', ') || 'None'}`);
    console.log(`Risks: ${formatRisks(signals.risks)}`);
  } else {
    const signals = extractClassSignals(body);
    console.log('Type: Class');
    console.log(`Entry Points: ${formatEntryPoints(signals.entryPoints)}`);
    console.log(`Async Patterns: ${formatAsyncPatterns(signals.async)}`);
    console.log(`Security: ${formatSecurity(signals.security)}`);
    console.log(`Data Ops: ${formatDataOps(signals.dataOps)}`);
    console.log(`Risks: ${formatRisks(signals.risks)}`);
    console.log(`sObjects: ${signals.sObjects.join(', ') || 'None'}`);
    console.log(`Dependencies: ${signals.dependencies.slice(0, 10).join(', ')}${signals.dependencies.length > 10 ? ` (${signals.dependencies.length} total)` : ''}`);
  }

  console.log('');
}

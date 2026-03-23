#!/usr/bin/env node

/**
 * Revenue Context Detector
 *
 * Detects an org's revenue field (Amount vs custom) and active sales processes
 * before running pipeline assessments. Follows the cpq-detector.js class pattern:
 * live-first queries, cache fallback, structured output.
 *
 * Usage:
 *   const { RevenueContextDetector } = require('./revenue-context-detector');
 *   const detector = new RevenueContextDetector('my-org');
 *   const result = await detector.detect();
 *   // result: { revenueField: 'ARR__c', salesProcessMode: 'single', ... }
 *
 * CLI:
 *   node revenue-context-detector.js <org-alias> [--interactive] [--json] [--force]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { getInstancePath } = require('./path-conventions');
const {
  resolveMetricFields,
  loadDefinitions,
  loadMapping,
  saveMapping
} = require('./metric-field-resolver');

const LIVE_FIRST = process.env.GLOBAL_LIVE_FIRST !== 'false' &&
                   process.env.REVENUE_CONTEXT_LIVE_FIRST !== 'false';

const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SALES_PROCESS_CONFIG_FILENAME = 'sales-process-config.json';

class RevenueContextDetector {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.liveFirst = options.liveFirst !== undefined ? options.liveFirst : LIVE_FIRST;
    this.interactive = options.interactive || false;
    this.force = options.force || false;
    this.verbose = options.verbose || false;
    this.workspaceRoot = options.workspaceRoot || process.env.WORKSPACE_DIR || process.cwd();
    this.cache = null;
    this.cacheTimestamp = null;
  }

  /**
   * Top-level orchestrator — detects revenue field and sales processes
   */
  async detect() {
    const revenueResult = await this.detectRevenueField();
    const processResult = await this.detectSalesProcesses();

    return {
      revenueField: revenueResult.field,
      revenueFieldConfidence: revenueResult.confidence,
      revenueFieldSource: revenueResult.source,
      revenueFieldCandidates: revenueResult.candidates,
      salesProcesses: processResult.processes,
      salesProcessMode: processResult.mode,
      detectedAt: new Date().toISOString()
    };
  }

  /**
   * Phase 1: Detect which field the org uses for pipeline value
   */
  async detectRevenueField() {
    // Check for existing confirmed mapping
    if (!this.force) {
      const existing = this._loadExistingFieldMapping();
      if (existing) return existing;
    }

    // Query Opportunity field metadata for currency/number fields
    const fields = await this._queryRevenueFieldCandidates();
    if (!fields || fields.length === 0) {
      this._log('warn', 'Could not query field metadata, defaulting to Amount');
      return { field: 'Amount', confidence: 1, source: 'default', candidates: [] };
    }

    // Check population rates for top candidates
    const fieldsWithPopulation = await this._enrichWithPopulationRates(fields);

    // Check report usage data if available
    const fieldsWithUsage = this._enrichWithReportUsage(fieldsWithPopulation);

    // Use metric-field-resolver for scored ranking
    const definitions = loadDefinitions();
    const result = await resolveMetricFields({
      metricId: 'pipeline.arr',
      definitions,
      mapping: {},
      baseObject: 'Opportunity',
      fields: fieldsWithUsage,
      preferStandard: false,
      interactive: this.interactive
    });

    const amountRole = result.resolved.amount;
    if (!amountRole || !amountRole.field) {
      this._log('warn', 'Field resolution failed, defaulting to Amount');
      return { field: 'Amount', confidence: 1, source: 'default', candidates: [] };
    }

    const candidates = (result.candidatesByRole.amount || []).slice(0, 10);
    const source = amountRole.requiresConfirmation ? 'inferred' : 'confirmed';

    // Emit warning if auto-selected with low confidence
    if (amountRole.requiresConfirmation && !this.interactive) {
      this._log('warn',
        `Auto-selected revenue field "${amountRole.field}" with confidence ${amountRole.confidence.toFixed(2)}. ` +
        `Run with --interactive to confirm. Candidates: ${candidates.map(c => c.field).join(', ')}`
      );
    }

    // Persist the mapping
    this._persistFieldMapping(amountRole.field, amountRole.confidence, source);

    return {
      field: amountRole.field,
      confidence: amountRole.confidence,
      source,
      candidates
    };
  }

  /**
   * Phase 2: Detect active sales processes and record type mappings
   */
  async detectSalesProcesses() {
    // Check for existing config
    if (!this.force) {
      const existing = this._loadExistingSalesProcessConfig();
      if (existing) return existing;
    }

    let processes = [];

    try {
      // Query active BusinessProcess records for Opportunity
      const bpResult = this.executeQuery(
        "SELECT Id, Name FROM BusinessProcess WHERE TableEnumOrId = 'Opportunity' AND IsActive = true ORDER BY Name"
      );

      if (!bpResult || !bpResult.records || bpResult.records.length === 0) {
        // No BusinessProcess records — single default process
        this._persistSalesProcessConfig([], 'single');
        return { processes: [], mode: 'single' };
      }

      // Query active RecordType records mapped to those processes
      const rtResult = this.executeQuery(
        "SELECT Id, Name, DeveloperName, BusinessProcessId FROM RecordType WHERE SObjectType = 'Opportunity' AND IsActive = true ORDER BY Name"
      );

      const recordTypes = (rtResult && rtResult.records) ? rtResult.records : [];

      // Build process -> record type map
      processes = bpResult.records.map(bp => {
        const rts = recordTypes.filter(rt => rt.BusinessProcessId === bp.Id);
        return {
          id: bp.Id,
          name: bp.Name,
          recordTypeIds: rts.map(rt => rt.Id),
          recordTypeNames: rts.map(rt => rt.Name)
        };
      });
    } catch (error) {
      this._log('warn', `Sales process detection failed: ${error.message}`);
      this._persistSalesProcessConfig([], 'single');
      return { processes: [], mode: 'single' };
    }

    if (processes.length <= 1) {
      this._persistSalesProcessConfig(processes, 'single');
      return { processes, mode: 'single' };
    }

    // Multiple processes detected
    this._log('info', `Detected ${processes.length} sales processes: ${processes.map(p => p.name).join(', ')}`);

    let mode = null;

    if (this.interactive) {
      mode = await this._promptSalesProcessChoice(processes);
    }

    this._persistSalesProcessConfig(processes, mode);
    return { processes, mode };
  }

  // --- Private: Field Detection Helpers ---

  _loadExistingFieldMapping() {
    try {
      const mapping = loadMapping(this.orgAlias, { workspaceRoot: this.workspaceRoot });
      const amountEntry = mapping.metrics?.['pipeline.arr']?.resolved?.amount;
      if (!amountEntry || !amountEntry.field) return null;

      // Check freshness
      const lastUpdated = mapping.lastUpdated ? new Date(mapping.lastUpdated).getTime() : 0;
      if (Date.now() - lastUpdated > CACHE_MAX_AGE_MS) return null;

      this._log('info', `Using cached revenue field: ${amountEntry.field} (source: ${amountEntry.source || 'unknown'})`);
      return {
        field: amountEntry.field,
        confidence: amountEntry.confidence || 1,
        source: amountEntry.source || 'cached',
        candidates: []
      };
    } catch {
      return null;
    }
  }

  async _queryRevenueFieldCandidates() {
    // Primary: FieldDefinition via Tooling API (most complete, but not available on all editions)
    try {
      const query = [
        'SELECT QualifiedApiName, Label, DataType',
        'FROM FieldDefinition',
        "WHERE EntityDefinition.QualifiedApiName = 'Opportunity'",
        "AND DataType IN ('Currency', 'Double', 'Int')",
        'ORDER BY QualifiedApiName'
      ].join(' ');

      const result = this.executeQuery(query, true);
      if (result && result.records && result.records.length > 0) {
        return result.records.map(r => ({
          name: r.QualifiedApiName,
          label: r.Label,
          type: r.DataType,
          custom: (r.QualifiedApiName || '').endsWith('__c')
        }));
      }
    } catch (error) {
      this._log('warn', `FieldDefinition query failed (expected on some org editions): ${error.message}`);
    }

    // Fallback: sf sobject describe (works on all editions)
    return this._queryFieldsViaDescribe();
  }

  /**
   * Fallback field discovery using `sf sobject describe`.
   * Works on all Salesforce editions where FieldDefinition Tooling API may not.
   */
  _queryFieldsViaDescribe() {
    try {
      const cmd = `sf sobject describe --sobject Opportunity --target-org ${this.orgAlias} --json`;
      const output = execSync(cmd, {
        encoding: 'utf8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const parsed = JSON.parse(output);
      const fields = (parsed.result && parsed.result.fields) || [];
      const numericTypes = ['currency', 'double', 'int', 'percent'];

      return fields
        .filter(f => numericTypes.includes((f.type || '').toLowerCase()))
        .map(f => ({
          name: f.name,
          label: f.label,
          type: f.type,
          custom: f.custom === true || (f.name || '').endsWith('__c')
        }));
    } catch (error) {
      this._log('warn', `Describe fallback also failed: ${error.message}`);
      return null;
    }
  }

  async _enrichWithPopulationRates(fields) {
    // Score the top candidates from metric-definitions to determine which to check
    const definitions = loadDefinitions();
    const metric = definitions.metrics['pipeline.arr'];
    const preferredNames = (metric.fieldRoles.amount.preferredFields || []).map(f => f.toLowerCase());

    // Check population for preferred fields that exist in the org
    const toCheck = fields.filter(f =>
      preferredNames.includes(f.name.toLowerCase()) || f.name === 'Amount'
    ).slice(0, 10);

    for (const field of toCheck) {
      try {
        const countResult = this.executeQuery(
          `SELECT COUNT() FROM Opportunity WHERE ${field.name} != null AND IsClosed = false`
        );
        field.populationCount = countResult ? countResult.totalSize : 0;
      } catch {
        field.populationCount = 0;
      }
    }

    // Mark populated fields for downstream scoring
    return fields.map(f => {
      if (f.populationCount && f.populationCount > 0) {
        f._populated = true;
        f._populationCount = f.populationCount;
      }
      return f;
    });
  }

  _enrichWithReportUsage(fields) {
    try {
      const instanceDir = getInstancePath('salesforce', this.orgAlias, null, this.workspaceRoot);
      const usagePath = path.join(instanceDir, 'reports', 'field-usage.json');

      if (!fs.existsSync(usagePath)) return fields;

      const usageData = JSON.parse(fs.readFileSync(usagePath, 'utf8'));
      const fieldUsage = usageData.fields || usageData;

      return fields.map(f => {
        const usage = fieldUsage[f.name];
        if (usage && typeof usage === 'object' && usage.usageCount >= 3) {
          // Boost: append usage info to label for resolver's labelHint scoring
          f.label = `${f.label} (used in ${usage.usageCount} reports)`;
          f._reportUsageCount = usage.usageCount;
        }
        return f;
      });
    } catch {
      return fields;
    }
  }

  _persistFieldMapping(field, confidence, source) {
    try {
      const mapping = loadMapping(this.orgAlias, { workspaceRoot: this.workspaceRoot });

      if (!mapping.metrics['pipeline.arr']) {
        mapping.metrics['pipeline.arr'] = { resolved: {} };
      }
      mapping.metrics['pipeline.arr'].resolved.amount = {
        field,
        confidence,
        source,
        detectedAt: new Date().toISOString()
      };

      saveMapping(this.orgAlias, mapping, { workspaceRoot: this.workspaceRoot });
      this._log('info', `Persisted revenue field mapping: ${field} (${source})`);
    } catch (error) {
      this._log('warn', `Failed to persist field mapping: ${error.message}`);
    }
  }

  // --- Private: Sales Process Helpers ---

  _loadExistingSalesProcessConfig() {
    try {
      const configPath = this._getSalesProcessConfigPath();
      if (!fs.existsSync(configPath)) return null;

      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const lastUpdated = config.lastUpdated ? new Date(config.lastUpdated).getTime() : 0;
      if (Date.now() - lastUpdated > CACHE_MAX_AGE_MS) return null;

      this._log('info', `Using cached sales process config: mode=${config.selectedMode}`);
      return {
        processes: config.detectedProcesses || [],
        mode: config.selectedMode || 'single'
      };
    } catch {
      return null;
    }
  }

  _getSalesProcessConfigPath() {
    const instanceDir = getInstancePath('salesforce', this.orgAlias, null, this.workspaceRoot);
    const cacheDir = path.join(instanceDir, '.metadata-cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    return path.join(cacheDir, SALES_PROCESS_CONFIG_FILENAME);
  }

  _persistSalesProcessConfig(processes, mode) {
    try {
      const configPath = this._getSalesProcessConfigPath();
      const config = {
        schemaVersion: '1.0',
        org: this.orgAlias,
        lastUpdated: new Date().toISOString(),
        detectedProcesses: processes,
        selectedMode: mode,
        recordTypeFiltersByProcess: {}
      };

      for (const proc of processes) {
        config.recordTypeFiltersByProcess[proc.name] = proc.recordTypeIds;
      }

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      this._log('info', `Persisted sales process config: ${processes.length} processes, mode=${mode}`);
    } catch (error) {
      this._log('warn', `Failed to persist sales process config: ${error.message}`);
    }
  }

  async _promptSalesProcessChoice(processes) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const prompt = [
      '\nMultiple sales processes detected:',
      ...processes.map((p, i) => `  ${i + 1}. ${p.name} (${p.recordTypeNames.join(', ')})`),
      '',
      'How should pipeline analysis handle these?',
      '  a) Per-process analysis (recommended) - separate health scores per process',
      '  b) Single combined analysis - blend all processes together',
      '  c) Analyze specific process only',
      ''
    ].join('\n');

    const answer = await new Promise(resolve => {
      rl.question(`${prompt}Choice [a/b/c]: `, resolve);
    });

    const choice = (answer || '').trim().toLowerCase();

    if (choice === 'c') {
      const processPrompt = processes.map((p, i) => `  ${i + 1}. ${p.name}`).join('\n');
      const processAnswer = await new Promise(resolve => {
        rl.question(`\nWhich process?\n${processPrompt}\nChoice: `, resolve);
      });
      rl.close();

      const idx = parseInt(processAnswer, 10) - 1;
      if (idx >= 0 && idx < processes.length) {
        return `specific:${processes[idx].name}`;
      }
      return 'per-process';
    }

    rl.close();

    if (choice === 'b') return 'combined';
    return 'per-process'; // default to per-process
  }

  // --- Shared Utilities ---

  /**
   * Execute SOQL query using sf CLI
   * Note: Uses execSync consistent with cpq-detector.js pattern.
   * Query strings are constructed internally, not from user input.
   */
  executeQuery(query, useToolingApi = false) {
    const toolingFlag = useToolingApi ? ' --use-tooling-api' : '';
    const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias}${toolingFlag} --json`;

    try {
      const output = execSync(cmd, {
        encoding: 'utf8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const result = JSON.parse(output);
      if (result.status === 0) {
        return result.result;
      }
      return null;
    } catch (error) {
      if (this.verbose) {
        this._log('warn', `Query failed: ${error.message}`);
      }
      return null;
    }
  }

  _log(level, message) {
    const prefix = '[RevenueContextDetector]';
    if (level === 'warn') {
      console.warn(`${prefix} ${message}`);
    } else if (level === 'error') {
      console.error(`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }
}

// --- CLI ---

async function main() {
  const args = process.argv.slice(2);
  const orgAlias = args.find(a => !a.startsWith('-'));
  const interactive = args.includes('--interactive');
  const json = args.includes('--json');
  const force = args.includes('--force');
  const verbose = args.includes('--verbose');

  if (!orgAlias) {
    console.error('Usage: revenue-context-detector.js <org-alias> [--interactive] [--json] [--force] [--verbose]');
    process.exit(1);
  }

  const detector = new RevenueContextDetector(orgAlias, {
    interactive,
    force,
    verbose
  });

  const result = await detector.detect();

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\nRevenue Field: ${result.revenueField} (confidence: ${result.revenueFieldConfidence.toFixed(2)}, source: ${result.revenueFieldSource})`);
    if (result.salesProcesses.length > 0) {
      console.log(`Sales Processes (${result.salesProcesses.length}):`);
      for (const proc of result.salesProcesses) {
        console.log(`  - ${proc.name} (${proc.recordTypeNames.join(', ')})`);
      }
      console.log(`Analysis Mode: ${result.salesProcessMode || 'pending user choice'}`);
    } else {
      console.log('Sales Processes: Single (default)');
    }
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(`[RevenueContextDetector] Fatal: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { RevenueContextDetector };

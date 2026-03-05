#!/usr/bin/env node
/**
 * Project Intake Data Gatherer
 *
 * Autonomously gathers contextual data from connected systems to enrich
 * intake form data:
 * - Asana: Project context, similar past projects, task history
 * - Salesforce: Org metadata, object info, record counts
 * - Runbooks: Existing runbooks for similar project types
 *
 * Usage:
 *   node intake-data-gatherer.js ./intake-data.json --output ./enriched.json
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class IntakeDataGatherer {
  constructor(options = {}) {
    this.options = {
      verbose: options.verbose || false,
      asanaToken: options.asanaToken || process.env.ASANA_ACCESS_TOKEN,
      ...options
    };
    this.context = {
      sources: [],
      gatheredAt: new Date().toISOString(),
      errors: []
    };
  }

  /**
   * Gather all available context for intake data
   * @param {Object} formData - Intake form data
   * @returns {Object} Enriched context
   */
  async gatherContext(formData) {
    this.log('Starting context gathering...');

    // 1. Salesforce org context (if provided)
    if (formData.technicalRequirements?.salesforceOrg?.orgAlias) {
      await this.gatherSalesforceContext(formData.technicalRequirements.salesforceOrg.orgAlias);
    } else if (formData.technicalRequirements?.platforms?.includes('salesforce')) {
      this.context.salesforceNote = 'Salesforce platform selected but no org alias provided';
    }

    // 2. Asana context (if token available)
    if (this.options.asanaToken) {
      await this.gatherAsanaContext(formData);
    } else {
      this.context.asanaNote = 'Asana token not available - skipping Asana context';
    }

    // 3. Existing runbooks
    await this.findRelatedRunbooks(formData);

    // 4. Similar past projects
    await this.findSimilarProjects(formData);

    // 5. Validate assumptions against gathered context
    this.validateAssumptionsWithContext(formData);

    return this.context;
  }

  /**
   * Gather Salesforce org context
   */
  async gatherSalesforceContext(orgAlias) {
    this.log(`Gathering Salesforce context for org: ${orgAlias}`);

    try {
      // Get org info
      const orgInfo = this.execSFCommand(`sf org display --target-org ${orgAlias} --json`);

      if (orgInfo && orgInfo.result) {
        this.context.salesforce = {
          orgId: orgInfo.result.id,
          instanceUrl: orgInfo.result.instanceUrl,
          username: orgInfo.result.username,
          apiVersion: orgInfo.result.apiVersion,
          orgType: this.determineOrgType(orgInfo.result),
          objectCounts: {}
        };

        // Get key object counts
        const keyObjects = ['Account', 'Contact', 'Opportunity', 'Lead', 'Case'];

        for (const obj of keyObjects) {
          try {
            const countResult = this.execSFCommand(
              `sf data query --query "SELECT COUNT() FROM ${obj}" --target-org ${orgAlias} --json`
            );
            if (countResult && countResult.result) {
              this.context.salesforce.objectCounts[obj] = countResult.result.totalSize;
            }
          } catch (e) {
            this.context.salesforce.objectCounts[obj] = 'N/A';
          }
        }

        // Check for CPQ
        try {
          const cpqCheck = this.execSFCommand(
            `sf data query --query "SELECT Id FROM SBQQ__Quote__c LIMIT 1" --target-org ${orgAlias} --json`
          );
          this.context.salesforce.hasCPQ = true;
        } catch (e) {
          this.context.salesforce.hasCPQ = false;
        }

        // Check for Experience Cloud
        try {
          const expCheck = this.execSFCommand(
            `sf data query --query "SELECT Id FROM Network LIMIT 1" --target-org ${orgAlias} --use-tooling-api --json`
          );
          this.context.salesforce.hasExperience = true;
        } catch (e) {
          this.context.salesforce.hasExperience = false;
        }

        this.context.sources.push('salesforce');
        this.log('Salesforce context gathered successfully');
      }
    } catch (error) {
      this.context.errors.push({
        source: 'salesforce',
        message: `Failed to gather Salesforce context: ${error.message}`,
        suggestion: 'Ensure you are authenticated to the org: sf org login web --alias ' + orgAlias
      });
      this.log(`Salesforce error: ${error.message}`, 'warn');
    }
  }

  /**
   * Gather Asana project context
   */
  async gatherAsanaContext(formData) {
    this.log('Gathering Asana context...');

    try {
      // Try to load asana-task-reader if available
      let AsanaTaskReader;
      try {
        AsanaTaskReader = require('../asana-task-reader');
      } catch (e) {
        // Fallback to direct API calls
        this.log('AsanaTaskReader not available, using direct API', 'info');
      }

      // Look for linked Asana project
      const linkedProjectId = formData.metadata?.linkedAsanaProject;

      if (linkedProjectId && AsanaTaskReader) {
        const reader = new AsanaTaskReader(this.options.asanaToken);
        const projectContext = await reader.parseTask(linkedProjectId, {
          includeProject: true,
          includeComments: true
        });

        this.context.asana = {
          linkedProject: projectContext,
          projectName: projectContext.project?.name
        };
        this.context.sources.push('asana-linked');
      }

      // Search for similar projects by name
      if (formData.projectIdentity?.projectName) {
        const similarProjects = await this.searchAsanaProjects(formData.projectIdentity.projectName);
        if (similarProjects.length > 0) {
          this.context.asana = this.context.asana || {};
          this.context.asana.similarProjects = similarProjects.slice(0, 5);
          if (!this.context.sources.includes('asana-linked')) {
            this.context.sources.push('asana-search');
          }
        }
      }

      this.log('Asana context gathered successfully');
    } catch (error) {
      this.context.errors.push({
        source: 'asana',
        message: `Failed to gather Asana context: ${error.message}`,
        suggestion: 'Check ASANA_ACCESS_TOKEN environment variable'
      });
      this.log(`Asana error: ${error.message}`, 'warn');
    }
  }

  /**
   * Search Asana for similar projects
   */
  async searchAsanaProjects(projectName) {
    if (!this.options.asanaToken) return [];

    try {
      // This would use the Asana MCP tools in the agent context
      // For CLI usage, we'll check for a local project cache
      const cacheFile = path.join(process.cwd(), '.asana-projects-cache.json');

      if (fs.existsSync(cacheFile)) {
        const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        const keywords = projectName.toLowerCase().split(/\s+/);

        return cache.projects
          .filter(p => {
            const name = p.name.toLowerCase();
            return keywords.some(kw => name.includes(kw));
          })
          .map(p => ({
            gid: p.gid,
            name: p.name,
            status: p.current_status?.title || 'Unknown'
          }));
      }
    } catch (e) {
      // Ignore cache errors
    }

    return [];
  }

  /**
   * Find related runbooks in the instances directory
   */
  async findRelatedRunbooks(formData) {
    this.log('Searching for related runbooks...');

    const runbooksDir = path.resolve(__dirname, '../../../instances');
    const projectType = formData.projectIdentity?.projectType || '';
    const platforms = formData.technicalRequirements?.platforms || [];

    const relatedRunbooks = [];

    // Patterns to search for
    const patterns = [
      projectType,
      ...platforms,
      formData.projectIdentity?.projectName
    ].filter(Boolean).map(p => p.toLowerCase());

    try {
      // Check instances directory
      if (fs.existsSync(runbooksDir)) {
        const dirs = fs.readdirSync(runbooksDir);

        for (const dir of dirs) {
          const runbookPath = path.join(runbooksDir, dir, 'RUNBOOK.md');
          const orgQuirksPath = path.join(runbooksDir, dir, 'ORG_QUIRKS.json');

          if (fs.existsSync(runbookPath)) {
            const content = fs.readFileSync(runbookPath, 'utf-8').toLowerCase();

            // Check if runbook mentions relevant patterns
            const relevance = patterns.filter(p => content.includes(p)).length;

            if (relevance > 0) {
              relatedRunbooks.push({
                org: dir,
                path: runbookPath,
                relevance,
                matchedPatterns: patterns.filter(p => content.includes(p)),
                hasOrgQuirks: fs.existsSync(orgQuirksPath)
              });
            }
          }
        }
      }

      const sfInstanceCandidates = [
        path.resolve(__dirname, '../../../../..', 'domains', 'salesforce', 'instances'),
        path.resolve(__dirname, '../../../../salesforce-plugin/instances'),
        path.resolve(process.cwd(), '.claude-plugins', 'salesforce-plugin', 'instances')
      ];

      for (const sfPluginInstances of sfInstanceCandidates) {
        if (!fs.existsSync(sfPluginInstances)) continue;

        const sfDirs = fs.readdirSync(sfPluginInstances);

        for (const dir of sfDirs) {
          const runbookPath = path.join(sfPluginInstances, dir, 'RUNBOOK.md');

          if (fs.existsSync(runbookPath)) {
            const content = fs.readFileSync(runbookPath, 'utf-8').toLowerCase();
            const relevance = patterns.filter(p => content.includes(p)).length;

            if (relevance > 0) {
              relatedRunbooks.push({
                org: dir,
                path: runbookPath,
                relevance,
                matchedPatterns: patterns.filter(p => content.includes(p)),
                source: 'salesforce-plugin'
              });
            }
          }
        }
      }

      // Sort by relevance
      relatedRunbooks.sort((a, b) => b.relevance - a.relevance);

      if (relatedRunbooks.length > 0) {
        this.context.existingRunbooks = relatedRunbooks.slice(0, 5);
        this.context.sources.push('runbooks');
        this.log(`Found ${relatedRunbooks.length} related runbooks`);
      }
    } catch (error) {
      this.log(`Error searching runbooks: ${error.message}`, 'warn');
    }
  }

  /**
   * Find similar past projects
   */
  async findSimilarProjects(formData) {
    this.log('Searching for similar past projects...');

    const projectType = formData.projectIdentity?.projectType || '';

    // Check for completed projects in assessment directories
    const assessmentDirs = [
      path.resolve(__dirname, '../../../instances'),
      path.resolve(__dirname, '../../../../..', 'domains', 'salesforce', 'instances'),
      path.resolve(__dirname, '../../../../salesforce-plugin/instances')
    ];

    const similarProjects = [];

    for (const baseDir of assessmentDirs) {
      if (!fs.existsSync(baseDir)) continue;

      try {
        const orgDirs = fs.readdirSync(baseDir);

        for (const org of orgDirs) {
          const orgPath = path.join(baseDir, org);
          if (!fs.statSync(orgPath).isDirectory()) continue;

          // Look for assessment directories
          const assessmentDirs = fs.readdirSync(orgPath)
            .filter(d => d.includes('assessment') || d.includes('audit') || d.includes('implementation'));

          for (const assessDir of assessmentDirs) {
            const assessPath = path.join(orgPath, assessDir);

            // Check for spec or summary files
            const specFile = fs.readdirSync(assessPath)
              .find(f => f.includes('spec') || f.includes('summary') || f.includes('runbook'));

            if (specFile) {
              similarProjects.push({
                org,
                project: assessDir,
                path: path.join(assessPath, specFile),
                type: assessDir.includes(projectType.split('-')[0]) ? 'same-type' : 'related'
              });
            }
          }
        }
      } catch (e) {
        // Ignore directory errors
      }
    }

    if (similarProjects.length > 0) {
      this.context.similarProjects = similarProjects.slice(0, 10);
      this.context.sources.push('history');
      this.log(`Found ${similarProjects.length} similar past projects`);
    }
  }

  /**
   * Validate assumptions against gathered context
   */
  validateAssumptionsWithContext(formData) {
    if (!formData.scope?.assumptions) return;

    const validatedAssumptions = [];

    for (const assumption of formData.scope.assumptions) {
      if (!assumption || !assumption.assumption) continue;

      const text = assumption.assumption.toLowerCase();
      const validation = { ...assumption, autoValidated: false };

      // Check against Salesforce context
      if (this.context.salesforce) {
        // Check CPQ assumptions
        if (text.includes('cpq') || text.includes('quote')) {
          if (this.context.salesforce.hasCPQ) {
            validation.autoValidated = true;
            validation.autoValidationNote = 'Confirmed: CPQ is installed in the org';
          } else {
            validation.autoValidated = true;
            validation.autoValidationNote = 'WARNING: CPQ does NOT appear to be installed in the org';
            validation.validationFailed = true;
          }
        }

        // Check Experience Cloud assumptions
        if (text.includes('experience') || text.includes('community') || text.includes('portal')) {
          if (this.context.salesforce.hasExperience) {
            validation.autoValidated = true;
            validation.autoValidationNote = 'Confirmed: Experience Cloud is enabled';
          } else {
            validation.autoValidated = true;
            validation.autoValidationNote = 'WARNING: Experience Cloud does NOT appear to be enabled';
            validation.validationFailed = true;
          }
        }

        // Check data volume assumptions
        const volumeMatch = text.match(/(\d+)\s*(k|thousand|million|m|records)/i);
        if (volumeMatch) {
          const mentioned = parseInt(volumeMatch[1]);
          const unit = volumeMatch[2].toLowerCase();
          const multiplier = (unit === 'k' || unit === 'thousand') ? 1000 : (unit === 'm' || unit === 'million') ? 1000000 : 1;
          const expectedVolume = mentioned * multiplier;

          const totalRecords = Object.values(this.context.salesforce.objectCounts)
            .filter(v => typeof v === 'number')
            .reduce((sum, v) => sum + v, 0);

          if (totalRecords > 0) {
            validation.autoValidated = true;
            validation.autoValidationNote = `Org has ~${totalRecords.toLocaleString()} records in key objects`;
          }
        }
      }

      validatedAssumptions.push(validation);
    }

    if (validatedAssumptions.some(a => a.autoValidated)) {
      this.context.assumptionValidations = validatedAssumptions.filter(a => a.autoValidated);
      this.log(`Auto-validated ${this.context.assumptionValidations.length} assumptions`);
    }
  }

  /**
   * Execute Salesforce CLI command
   */
  execSFCommand(command) {
    try {
      const result = execSync(command, {
        encoding: 'utf-8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return JSON.parse(result);
    } catch (error) {
      if (error.stdout) {
        try {
          return JSON.parse(error.stdout);
        } catch (e) {
          throw new Error(error.stderr || error.message);
        }
      }
      throw error;
    }
  }

  /**
   * Determine org type from org info
   */
  determineOrgType(orgInfo) {
    if (orgInfo.isSandbox) return 'sandbox';
    if (orgInfo.isScratchOrg) return 'scratch';
    if (orgInfo.instanceUrl?.includes('develop')) return 'developer';
    return 'production';
  }

  /**
   * Log helper
   */
  log(message, level = 'info') {
    if (this.options.verbose || level === 'warn' || level === 'error') {
      const prefix = level === 'warn' ? '⚠️' : level === 'error' ? '❌' : 'ℹ️';
      console.log(`${prefix} [DataGatherer] ${message}`);
    }
  }
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Project Intake Data Gatherer

Gathers contextual data from Asana, Salesforce, and existing runbooks
to enrich project intake data.

Usage:
  node intake-data-gatherer.js <input-file.json> [options]

Options:
  --output, -o       Output file path (default: stdout)
  --verbose, -v      Show detailed output
  --help, -h         Show this help

Environment Variables:
  ASANA_ACCESS_TOKEN   Asana API token for project context

Examples:
  node intake-data-gatherer.js ./intake-data.json
  node intake-data-gatherer.js ./intake-data.json --output ./enriched-context.json
  node intake-data-gatherer.js ./intake-data.json --verbose
`);
    process.exit(0);
  }

  const inputPath = args[0];
  let outputPath = null;
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v')
  };

  // Parse output path
  const outputIndex = args.findIndex(a => a === '--output' || a === '-o');
  if (outputIndex !== -1 && args[outputIndex + 1]) {
    outputPath = args[outputIndex + 1];
  }

  // Load input file
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    process.exit(1);
  }

  let formData;
  try {
    const content = fs.readFileSync(inputPath, 'utf-8');
    formData = JSON.parse(content);
  } catch (e) {
    console.error(`Error: Invalid JSON in ${inputPath}: ${e.message}`);
    process.exit(1);
  }

  // Gather context
  const gatherer = new IntakeDataGatherer(options);
  const context = await gatherer.gatherContext(formData);

  // Output results
  const output = JSON.stringify(context, null, 2);

  if (outputPath) {
    fs.writeFileSync(outputPath, output, 'utf-8');
    console.log(`Context saved to: ${outputPath}`);
    console.log(`Sources: ${context.sources.join(', ') || 'none'}`);
    if (context.errors.length > 0) {
      console.log(`Errors: ${context.errors.length}`);
    }
  } else {
    console.log(output);
  }
}

// Export for use as module
module.exports = { IntakeDataGatherer };

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

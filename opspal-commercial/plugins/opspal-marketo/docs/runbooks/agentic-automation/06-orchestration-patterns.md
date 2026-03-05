# 06 - Orchestration Patterns

## Overview

Orchestration patterns enable agents to execute complex, multi-step Marketo workflows autonomously. This document covers patterns for combining API operations, managing state, handling errors, and coordinating across multiple capability areas.

## Pattern 1: Campaign Launch Orchestration

### Full Campaign Setup from Template
```javascript
async function orchestrateCampaignLaunch(config) {
  const {
    templateProgramId,
    campaignName,
    targetFolderId,
    tokens,
    launchDate
  } = config;

  const results = { steps: [], success: false };

  try {
    // Step 1: Clone program from template
    results.steps.push({ step: 'clone', status: 'started' });
    const program = await mcp__marketo__program_clone({
      programId: templateProgramId,
      name: campaignName,
      folder: { id: targetFolderId, type: 'Folder' }
    });
    const programId = program.result[0].id;
    results.steps[0].status = 'completed';
    results.steps[0].programId = programId;

    // Step 2: Update program tokens
    results.steps.push({ step: 'tokens', status: 'started' });
    await mcp__marketo__program_tokens_update({
      folderId: programId,
      folderType: 'Program',
      tokens: tokens
    });
    results.steps[1].status = 'completed';

    // Step 3: Get program assets
    results.steps.push({ step: 'assets', status: 'started' });
    const programDetails = await mcp__marketo__program_get({ programId });
    results.steps[2].status = 'completed';
    results.steps[2].assets = programDetails.result[0];

    // Step 4: Approve assets in dependency order
    results.steps.push({ step: 'approve', status: 'started' });

    // Forms first (no dependencies)
    for (const form of programDetails.result[0].forms || []) {
      await mcp__marketo__form_approve({ formId: form.id });
      await rateLimitPause();
    }

    // Emails second (may depend on forms via landing pages)
    for (const email of programDetails.result[0].emails || []) {
      await mcp__marketo__email_approve({ emailId: email.id });
      await rateLimitPause();
    }

    // Landing pages third (depend on forms)
    for (const lp of programDetails.result[0].landingPages || []) {
      await mcp__marketo__landing_page_approve({ landingPageId: lp.id });
      await rateLimitPause();
    }
    results.steps[3].status = 'completed';

    // Step 5: Schedule or activate campaigns
    results.steps.push({ step: 'activate', status: 'started' });
    for (const campaign of programDetails.result[0].smartCampaigns || []) {
      if (campaign.type === 'trigger') {
        await mcp__marketo__campaign_activate({ campaignId: campaign.id });
      } else if (campaign.type === 'batch' && launchDate) {
        await mcp__marketo__campaign_schedule({
          campaignId: campaign.id,
          runAt: launchDate
        });
      }
      await rateLimitPause();
    }
    results.steps[4].status = 'completed';

    results.success = true;
    return results;

  } catch (error) {
    results.error = error.message;
    results.success = false;
    return results;
  }
}

// Rate limit helper
async function rateLimitPause(ms = 200) {
  await new Promise(resolve => setTimeout(resolve, ms));
}
```

## Pattern 2: Bulk Data Sync Orchestration

### Daily Data Export Pipeline
```javascript
async function orchestrateDailySync() {
  const results = { exports: [], imports: [], errors: [] };
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const now = new Date();

  // Step 1: Create lead export job
  const leadExportJob = await mcp__marketo__bulk_lead_export_create({
    fields: ['id', 'email', 'firstName', 'lastName', 'score', 'leadStatus', 'updatedAt'],
    filter: {
      updatedAt: {
        startAt: yesterday.toISOString(),
        endAt: now.toISOString()
      }
    },
    format: 'CSV'
  });
  results.exports.push({ type: 'leads', exportId: leadExportJob.result[0].exportId });

  // Step 2: Create activity export job
  const activityExportJob = await mcp__marketo__bulk_activity_export_create({
    activityTypeIds: [1, 2, 6, 7, 10, 11, 12, 13, 22, 23, 24],
    filter: {
      createdAt: {
        startAt: yesterday.toISOString(),
        endAt: now.toISOString()
      }
    },
    format: 'CSV'
  });
  results.exports.push({ type: 'activities', exportId: activityExportJob.result[0].exportId });

  // Step 3: Enqueue both jobs
  await mcp__marketo__bulk_lead_export_enqueue({
    exportId: leadExportJob.result[0].exportId
  });
  await mcp__marketo__bulk_activity_export_enqueue({
    exportId: activityExportJob.result[0].exportId
  });

  // Step 4: Poll for completion with parallel monitoring
  const completedExports = await pollExportsToCompletion(results.exports);

  // Step 5: Download completed files
  for (const export of completedExports) {
    if (export.status === 'Completed') {
      if (export.type === 'leads') {
        export.file = await mcp__marketo__bulk_lead_export_file({ exportId: export.exportId });
      } else {
        export.file = await mcp__marketo__bulk_activity_export_file({ exportId: export.exportId });
      }
    } else {
      results.errors.push({ type: export.type, error: export.status });
    }
  }

  return results;
}

async function pollExportsToCompletion(exports, maxWaitMinutes = 30) {
  const startTime = Date.now();
  const maxWaitMs = maxWaitMinutes * 60 * 1000;

  while (Date.now() - startTime < maxWaitMs) {
    let allComplete = true;

    for (const exp of exports) {
      if (exp.status === 'Completed' || exp.status === 'Failed') continue;

      const statusFn = exp.type === 'leads'
        ? mcp__marketo__bulk_lead_export_status
        : mcp__marketo__bulk_activity_export_status;

      const status = await statusFn({ exportId: exp.exportId });
      exp.status = status.result[0].status;

      if (exp.status !== 'Completed' && exp.status !== 'Failed') {
        allComplete = false;
      }

      await rateLimitPause(100);
    }

    if (allComplete) break;
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s
  }

  return exports;
}
```

## Pattern 3: Lead Deduplication Orchestration

### Systematic Deduplication Flow
```javascript
async function orchestrateDeduplication(criteria) {
  const {
    searchField = 'email',
    winnerCriteria = 'score',  // 'score', 'createdAt', 'completeness'
    dryRun = true
  } = criteria;

  const results = {
    duplicatesFound: 0,
    mergesPerformed: 0,
    errors: [],
    duplicateGroups: []
  };

  // Step 1: Export all leads for analysis
  const exportJob = await mcp__marketo__bulk_lead_export_create({
    fields: ['id', 'email', 'firstName', 'lastName', 'score', 'createdAt', 'company'],
    filter: {
      createdAt: {
        startAt: '2020-01-01T00:00:00Z',
        endAt: new Date().toISOString()
      }
    }
  });

  await mcp__marketo__bulk_lead_export_enqueue({ exportId: exportJob.result[0].exportId });

  // Wait for export...
  const exportStatus = await waitForExportCompletion(exportJob.result[0].exportId);
  if (exportStatus !== 'Completed') {
    results.errors.push('Export failed');
    return results;
  }

  const csvData = await mcp__marketo__bulk_lead_export_file({
    exportId: exportJob.result[0].exportId
  });

  // Step 2: Parse and group duplicates
  const leads = parseCSV(csvData);
  const groups = groupByField(leads, searchField);

  // Step 3: Process duplicate groups
  for (const [key, groupLeads] of Object.entries(groups)) {
    if (groupLeads.length <= 1) continue;

    results.duplicatesFound += groupLeads.length - 1;

    // Determine winner based on criteria
    const sorted = sortByCriteria(groupLeads, winnerCriteria);
    const winner = sorted[0];
    const losers = sorted.slice(1);

    results.duplicateGroups.push({
      key,
      winnerId: winner.id,
      loserIds: losers.map(l => l.id),
      winnerScore: winner.score
    });

    // Step 4: Execute merges if not dry run
    if (!dryRun) {
      // Merge in batches of 3
      for (let i = 0; i < losers.length; i += 3) {
        const batch = losers.slice(i, i + 3).map(l => l.id);

        try {
          await mcp__marketo__lead_merge({
            winnerId: winner.id,
            loserIds: batch,
            mergeInCRM: true
          });
          results.mergesPerformed += batch.length;
        } catch (error) {
          results.errors.push({
            winnerId: winner.id,
            loserIds: batch,
            error: error.message
          });
        }

        await rateLimitPause(300);
      }
    }
  }

  return results;
}

function sortByCriteria(leads, criteria) {
  switch (criteria) {
    case 'score':
      return leads.sort((a, b) => (b.score || 0) - (a.score || 0));
    case 'createdAt':
      return leads.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    case 'completeness':
      return leads.sort((a, b) =>
        Object.values(b).filter(v => v).length -
        Object.values(a).filter(v => v).length
      );
    default:
      return leads;
  }
}
```

## Pattern 4: Multi-Program Deployment

### Batch Campaign Deployment
```javascript
async function orchestrateBatchDeployment(campaigns) {
  const deploymentResults = [];
  const templateId = campaigns[0].templateId;

  // Pre-flight: Verify template exists
  const template = await mcp__marketo__program_get({ programId: templateId });
  if (!template.success) {
    throw new Error(`Template ${templateId} not found`);
  }

  // Deploy each campaign sequentially (avoiding rate limits)
  for (const campaign of campaigns) {
    const result = {
      name: campaign.name,
      steps: [],
      success: false
    };

    try {
      // Clone
      const program = await mcp__marketo__program_clone({
        programId: templateId,
        name: campaign.name,
        folder: { id: campaign.folderId, type: 'Folder' }
      });
      result.programId = program.result[0].id;
      result.steps.push({ step: 'clone', status: 'success' });

      // Update tokens
      await mcp__marketo__program_tokens_update({
        folderId: program.result[0].id,
        folderType: 'Program',
        tokens: campaign.tokens
      });
      result.steps.push({ step: 'tokens', status: 'success' });

      // Approve emails (tokens must be set first)
      const programDetails = await mcp__marketo__program_get({
        programId: program.result[0].id
      });

      for (const email of programDetails.result[0].emails || []) {
        await mcp__marketo__email_approve({ emailId: email.id });
        await rateLimitPause(200);
      }
      result.steps.push({ step: 'approve', status: 'success' });

      result.success = true;

    } catch (error) {
      result.error = error.message;
      result.steps.push({ step: 'error', message: error.message });
    }

    deploymentResults.push(result);

    // Longer pause between programs
    await rateLimitPause(1000);
  }

  return deploymentResults;
}
```

## Pattern 5: Error Recovery Orchestration

### Retry with Exponential Backoff
```javascript
async function withRetry(operation, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    retryableErrors = [606, 607, 615, 1029]
  } = options;

  let lastError;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      const errorCode = extractErrorCode(error);
      if (!retryableErrors.includes(errorCode)) {
        throw error;  // Non-retryable, fail immediately
      }

      // Log retry attempt
      console.log(`Attempt ${attempt} failed with ${errorCode}, retrying in ${delay}ms`);

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));

      // Exponential backoff
      delay = Math.min(delay * 2, maxDelay);
    }
  }

  throw lastError;
}

function extractErrorCode(error) {
  const match = error.message.match(/\[(\d+)\]/);
  return match ? parseInt(match[1]) : 0;
}

// Usage example
async function resilientCampaignActivation(campaignId) {
  return await withRetry(
    () => mcp__marketo__campaign_activate({ campaignId }),
    {
      maxRetries: 5,
      initialDelay: 2000,
      retryableErrors: [606, 615, 1029]
    }
  );
}
```

## Pattern 6: State Management

### Checkpoint-Based Orchestration
```javascript
class OrchestrationState {
  constructor(orchestrationId) {
    this.id = orchestrationId;
    this.checkpoints = [];
    this.currentStep = null;
    this.data = {};
  }

  checkpoint(stepName, data = {}) {
    this.checkpoints.push({
      step: stepName,
      timestamp: new Date().toISOString(),
      data
    });
    this.currentStep = stepName;
  }

  getLastCheckpoint() {
    return this.checkpoints[this.checkpoints.length - 1];
  }

  canResume(stepName) {
    return this.checkpoints.some(cp => cp.step === stepName);
  }

  serialize() {
    return JSON.stringify({
      id: this.id,
      checkpoints: this.checkpoints,
      currentStep: this.currentStep,
      data: this.data
    });
  }

  static deserialize(json) {
    const obj = JSON.parse(json);
    const state = new OrchestrationState(obj.id);
    state.checkpoints = obj.checkpoints;
    state.currentStep = obj.currentStep;
    state.data = obj.data;
    return state;
  }
}

async function resumableOrchestration(config, existingState = null) {
  const state = existingState || new OrchestrationState(Date.now().toString());

  // Step 1: Clone (skip if already done)
  if (!state.canResume('clone')) {
    const program = await mcp__marketo__program_clone({
      programId: config.templateId,
      name: config.name,
      folder: { id: config.folderId, type: 'Folder' }
    });
    state.data.programId = program.result[0].id;
    state.checkpoint('clone', { programId: state.data.programId });
  }

  // Step 2: Tokens (skip if already done)
  if (!state.canResume('tokens')) {
    await mcp__marketo__program_tokens_update({
      folderId: state.data.programId,
      folderType: 'Program',
      tokens: config.tokens
    });
    state.checkpoint('tokens');
  }

  // Step 3: Approve (skip if already done)
  if (!state.canResume('approve')) {
    const details = await mcp__marketo__program_get({
      programId: state.data.programId
    });

    for (const email of details.result[0].emails || []) {
      await mcp__marketo__email_approve({ emailId: email.id });
      await rateLimitPause(200);
    }
    state.checkpoint('approve');
  }

  state.checkpoint('complete');
  return state;
}
```

## Agent Routing for Orchestration

| Orchestration Type | Agent |
|-------------------|-------|
| Campaign launch | `marketo-automation-orchestrator` |
| Bulk data operations | `marketo-data-operations` |
| Lead deduplication | `marketo-lead-manager` |
| Multi-program deployment | `marketo-automation-orchestrator` |
| Error recovery | `marketo-automation-orchestrator` |

## Best Practices

### Rate Limit Awareness
- Add 200ms pause between individual API calls
- Add 1-2s pause between major operations
- Monitor for 606 (rate limit) errors
- Implement exponential backoff

### Error Handling
- Catch and classify errors by code
- Retry transient errors (606, 607, 615, 1029)
- Fail fast on permanent errors (702, 709)
- Log all operations for debugging

### State Management
- Checkpoint after each significant step
- Enable resume from failure points
- Store orchestration state externally
- Include timestamps for auditing

### Dependency Order
- Approve Forms before Landing Pages
- Set Tokens before approving Emails
- Create Programs before adding members
- Activate Triggers before scheduling Batch


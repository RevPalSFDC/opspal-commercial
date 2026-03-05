# Phase 5: Bulk Merge Execution - Design Document

**Status**: Design Complete
**Version**: 1.0
**Date**: 2025-10-16
**Dependencies**: Phase 3 Complete (Data Quality & Asymmetry Guardrails)

## Overview

Phase 5 implements automated bulk merge execution with comprehensive safety controls, real-time monitoring, and rollback capabilities. This phase transforms the dedup safety engine from analysis-only to fully automated execution while maintaining strict safety standards.

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    /dedupe Command Interface                 │
│  Actions: prepare | analyze | execute | rollback | monitor  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ├─────────────────────────────────────┐
                      ▼                                     ▼
        ┌─────────────────────────┐         ┌──────────────────────┐
        │  Dedup Safety Engine    │         │  Sub-Agent Router    │
        │  (Analysis & Decisions) │◄────────┤  (Agent Integration) │
        └─────────┬───────────────┘         └──────────────────────┘
                  │                                   │
                  │                                   │
                  ▼                                   ▼
        ┌─────────────────────────┐         ┌──────────────────────┐
        │ Bulk Merge Executor     │         │ Agent Context Loader │
        │ (SF Composite API)      │         │ (Auto-wire Safety)   │
        └─────────┬───────────────┘         └──────────────────────┘
                  │
                  ├──────────────┬──────────────┐
                  ▼              ▼              ▼
        ┌─────────────┐  ┌─────────────┐  ┌──────────────┐
        │  Workflow   │  │  Rollback   │  │  Monitor     │
        │  State Mgr  │  │  System     │  │  Dashboard   │
        └─────────────┘  └─────────────┘  └──────────────┘
```

### Workflow State Machine

```
                    ┌──────────┐
                    │  IDLE    │
                    └────┬─────┘
                         │ /dedupe execute
                         ▼
                    ┌──────────┐
                    │ VALIDATING│◄──────┐
                    └────┬─────┘        │
                         │              │ Validation Failed
                         │ Valid        │
                         ▼              │
                    ┌──────────┐        │
              ┌─────┤ EXECUTING │───────┘
              │     └────┬─────┘
              │          │
              │          │ Error
              │          ▼
              │     ┌──────────┐
              │     │ PAUSED   │
              │     └────┬─────┘
              │          │ Resume
              │          ├──────┐
              │          │      │ Rollback
              │          │      ▼
              │          │ ┌──────────┐
              │          │ │ROLLING   │
              │          │ │  BACK    │
              │          │ └────┬─────┘
              │          │      │
              │          ▼      ▼
              │     ┌──────────┐
              └────►│ COMPLETED│
                    └──────────┘
```

### Data Flow

```
1. PREPARE PHASE
   /dedupe prepare → Load duplicate pairs → Store in decisions.json

2. ANALYSIS PHASE
   /dedupe analyze → Safety Engine Analysis → guardrails_triggered[]
                                            → recommended actions

3. EXECUTION PHASE (NEW)
   /dedupe execute → Pre-flight Validation
                  → Batch Processing (10 pairs/batch)
                  → SF Composite API Merge
                  → Record Execution State
                  → Real-time Progress Updates

4. MONITORING PHASE (NEW)
   /dedupe monitor → Read Execution State
                  → Display Progress
                  → Show Success/Error Rates

5. ROLLBACK PHASE (NEW)
   /dedupe rollback → Load Execution Log
                   → Reverse Merge Operations
                   → Restore Master Record State
```

## Component Details

### 1. Bulk Merge Executor (`bulk-merge-executor.js`)

**Purpose**: Execute merge operations in batches using Salesforce Composite API

**Key Features**:
- Batch processing (configurable size, default: 10 pairs)
- Dry-run mode (validation without execution)
- Real-time progress tracking
- Automatic retry on transient errors (3 attempts)
- Emergency stop capability
- Execution logging for rollback

**API**:
```javascript
class BulkMergeExecutor {
  constructor(orgAlias, config) {
    this.orgAlias = orgAlias;
    this.batchSize = config.batchSize || 10;
    this.dryRun = config.dryRun || false;
    this.maxRetries = config.maxRetries || 3;
    this.state = 'IDLE';
    this.executionLog = [];
  }

  async execute(decisions, options = {}) {
    // Main execution method
    // Returns: { success: number, failed: number, skipped: number, log: [] }
  }

  async executeBatch(batch) {
    // Execute a single batch via Composite API
    // Returns: { results: [], errors: [] }
  }

  async validatePreExecution(decisions) {
    // Pre-flight validation
    // Checks: org connection, permissions, data integrity
    // Returns: { valid: boolean, errors: [] }
  }

  async pause() {
    // Pause execution (current batch completes)
  }

  async resume() {
    // Resume from paused state
  }

  async emergencyStop() {
    // Immediate stop (may leave partial state)
  }

  getProgress() {
    // Returns: { total, processed, success, failed, percentage }
  }
}
```

**Salesforce Composite API Integration**:
```javascript
// Use composite API for atomic batch operations
POST /services/data/v62.0/composite

{
  "allOrNone": false,
  "compositeRequest": [
    {
      "method": "POST",
      "url": "/services/data/v62.0/sobjects/Account/001xxx/merge",
      "referenceId": "merge_pair_1",
      "body": {
        "masterRecord": { "Id": "001xxx" },
        "recordToMergeIds": ["001yyy"]
      }
    }
  ]
}
```

### 2. Rollback System (`dedup-rollback-system.js`)

**Purpose**: Undo merge operations and restore previous state

**Key Features**:
- Execution log tracking (before/after snapshots)
- Selective rollback (by pair, by batch, or full)
- Master record state restoration
- Related record re-parenting
- Rollback validation

**API**:
```javascript
class RollbackSystem {
  constructor(orgAlias) {
    this.orgAlias = orgAlias;
    this.executionLog = null;
  }

  async loadExecutionLog(logPath) {
    // Load execution log from file
  }

  async rollback(options = {}) {
    // Full rollback of entire execution
    // Returns: { restored: number, failed: number, errors: [] }
  }

  async rollbackBatch(batchId) {
    // Rollback specific batch
  }

  async rollbackPair(pairId) {
    // Rollback specific pair
  }

  async validateRollback() {
    // Pre-rollback validation
    // Checks: deleted records exist, master records unchanged
  }

  async restoreMasterRecord(beforeSnapshot, afterSnapshot) {
    // Restore master record to pre-merge state
  }

  async undeleteRecord(recordId) {
    // Undelete merged record
  }

  async reparentRelatedRecords(fromMasterId, toDeletedId, relatedRecords) {
    // Move related records back to restored record
  }
}
```

**Execution Log Format**:
```json
{
  "execution_id": "exec_2025-10-16_001",
  "org": "bluerabbit2021-revpal",
  "timestamp_start": "2025-10-16T20:00:00Z",
  "timestamp_end": "2025-10-16T20:15:00Z",
  "config": {
    "batchSize": 10,
    "dryRun": false
  },
  "batches": [
    {
      "batch_id": "batch_1",
      "pair_ids": ["001xxx_001yyy", "001zzz_001aaa"],
      "results": [
        {
          "pair_id": "001xxx_001yyy",
          "status": "SUCCESS",
          "master_id": "001xxx",
          "deleted_id": "001yyy",
          "before": {
            "master": { "Id": "001xxx", "Name": "Acme Corp", ... },
            "deleted": { "Id": "001yyy", "Name": "Acme Corporation", ... }
          },
          "after": {
            "master": { "Id": "001xxx", "Name": "Acme Corp", ... }
          },
          "related_records": {
            "Contacts": [{ "Id": "003xxx", "AccountId": "001xxx" }],
            "Opportunities": []
          }
        }
      ]
    }
  ],
  "summary": {
    "total": 50,
    "success": 48,
    "failed": 2,
    "skipped": 0
  }
}
```

### 3. Monitoring Dashboard (`dedup-execution-monitor.js`)

**Purpose**: Real-time visibility into execution progress and status

**Key Features**:
- Live progress updates
- Success/failure rates
- Error tracking
- Performance metrics
- Alert notifications

**Display Format**:
```
🔄 DEDUP EXECUTION MONITOR
════════════════════════════════════════════════════════════════

Execution ID: exec_2025-10-16_001
Org: bluerabbit2021-revpal
Status: EXECUTING
Started: 2025-10-16 20:00:00

PROGRESS
────────────────────────────────────────────────────────────────
[████████████████░░░░░░░░] 65% (32/50 pairs)

Current Batch: 4/5
Batch Progress: [████████░░] 80% (8/10 pairs)

SUCCESS RATE
────────────────────────────────────────────────────────────────
✅ Success:  30 (94%)
❌ Failed:    2 (6%)
⏸ Skipped:   0

PERFORMANCE
────────────────────────────────────────────────────────────────
Avg Time/Pair: 1.2s
Elapsed: 38s
Est. Remaining: 22s

RECENT ERRORS
────────────────────────────────────────────────────────────────
❌ Pair 001aaa_001bbb: INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY
   Retry 1/3 in 5s...

COMMANDS
────────────────────────────────────────────────────────────────
P - Pause  |  S - Stop  |  R - Refresh  |  Q - Quit Monitor
```

**API**:
```javascript
class ExecutionMonitor {
  async startMonitoring(executionId) {
    // Start live monitoring
  }

  async getStatus() {
    // Get current execution status
  }

  async displayDashboard() {
    // Render real-time dashboard
  }

  async watchProgress(callback) {
    // Stream progress updates
  }
}
```

### 4. Sub-Agent Integration

**Purpose**: Allow sub-agents to use dedup safety engine seamlessly

**Implementation Strategy**:

#### A. Agent Context Loader (Pre-Execution Hook)

Create `.claude-plugins/salesforce-plugin/hooks/pre-agent-dedup.sh`:
```bash
#!/bin/bash
# Auto-loads dedup configuration when agents invoke dedup operations

AGENT_NAME=$1
ACTION=$2

# Export dedup engine path for agent scripts
export DEDUP_ENGINE_PATH=".claude-plugins/salesforce-plugin/scripts/lib/dedup-safety-engine.js"
export DEDUP_CONFIG_PATH=".claude-plugins/salesforce-plugin/config/dedup-config.json"

# Load org-specific dedup decisions if available
ORG_ALIAS=$(sf config get target-org --json | jq -r '.result[0].value')
DECISIONS_PATH="instances/$ORG_ALIAS/dedup-decisions.json"

if [ -f "$DECISIONS_PATH" ]; then
  export DEDUP_DECISIONS_PATH="$DECISIONS_PATH"
fi

# Validate agent has dedup permissions
if [[ "$AGENT_NAME" == "sfdc-merge-orchestrator" ]] || \
   [[ "$AGENT_NAME" == "sfdc-conflict-resolver" ]] || \
   [[ "$AGENT_NAME" == "sfdc-dedup-safety-copilot" ]]; then
  export DEDUP_AGENT_AUTHORIZED=true
else
  export DEDUP_AGENT_AUTHORIZED=false
  echo "⚠️  Agent '$AGENT_NAME' not authorized for dedup execution"
fi
```

#### B. Agent Helper Library

Create `.claude-plugins/salesforce-plugin/scripts/lib/agent-dedup-helper.js`:
```javascript
/**
 * Helper library for sub-agents to interact with dedup safety engine
 * Provides simplified API for common dedup operations
 */

const DedupSafetyEngine = require('./dedup-safety-engine');
const BulkMergeExecutor = require('./bulk-merge-executor');

class AgentDedupHelper {
  constructor(agentName, orgAlias) {
    this.agentName = agentName;
    this.orgAlias = orgAlias;
    this.isAuthorized = this.checkAuthorization();

    if (!this.isAuthorized) {
      throw new Error(`Agent '${agentName}' not authorized for dedup operations`);
    }

    this.engine = new DedupSafetyEngine(orgAlias);
    this.executor = null; // Lazy load
  }

  /**
   * Analyze duplicate pairs with safety guardrails
   */
  async analyzePairs(duplicatePairs, options = {}) {
    const results = await this.engine.analyzeBatch(duplicatePairs);

    return {
      approved: results.filter(d => d.decision === 'APPROVE'),
      review: results.filter(d => d.decision === 'REVIEW'),
      blocked: results.filter(d => d.decision === 'BLOCK'),
      summary: {
        total: results.length,
        safeToMerge: results.filter(d => d.decision === 'APPROVE').length,
        needsReview: results.filter(d => d.decision === 'REVIEW').length,
        blocked: results.filter(d => d.decision === 'BLOCK').length
      }
    };
  }

  /**
   * Execute approved merges (requires explicit approval)
   */
  async executeMerges(approvedDecisions, options = {}) {
    if (!this.executor) {
      this.executor = new BulkMergeExecutor(this.orgAlias, options);
    }

    // Double-check all decisions are APPROVE
    const hasNonApproved = approvedDecisions.some(d => d.decision !== 'APPROVE');
    if (hasNonApproved) {
      throw new Error('Cannot execute: All decisions must be APPROVE status');
    }

    const results = await this.executor.execute(approvedDecisions, {
      agentName: this.agentName,
      ...options
    });

    return results;
  }

  /**
   * Get dedup recommendations for agent decision-making
   */
  async getRecommendations(duplicatePairs) {
    const analysis = await this.analyzePairs(duplicatePairs);

    return {
      safe_to_auto_merge: analysis.approved,
      requires_human_review: analysis.review,
      do_not_merge: analysis.blocked,
      recommendation: this.generateAgentRecommendation(analysis)
    };
  }

  generateAgentRecommendation(analysis) {
    const { summary } = analysis;

    if (summary.blocked > 0) {
      return `BLOCKED: ${summary.blocked} pairs have critical conflicts. Do not proceed.`;
    }

    if (summary.needsReview > summary.total * 0.5) {
      return `REVIEW REQUIRED: ${summary.needsReview}/${summary.total} pairs need manual review. Auto-merge only ${summary.safeToMerge} approved pairs.`;
    }

    if (summary.safeToMerge === summary.total) {
      return `SAFE TO PROCEED: All ${summary.safeToMerge} pairs passed safety checks.`;
    }

    return `PARTIAL APPROVAL: ${summary.safeToMerge}/${summary.total} pairs safe to merge. Review ${summary.needsReview} flagged pairs.`;
  }

  checkAuthorization() {
    const authorizedAgents = [
      'sfdc-merge-orchestrator',
      'sfdc-conflict-resolver',
      'sfdc-dedup-safety-copilot',
      'sfdc-data-quality-analyzer'
    ];
    return authorizedAgents.includes(this.agentName);
  }
}

module.exports = AgentDedupHelper;
```

#### C. Update `/dedupe` Command

Modify `.claude-plugins/salesforce-plugin/commands/dedupe.md` to add `execute` action:

```markdown
## Usage

/dedupe <action> [options]

### Actions

1. **prepare** - Load duplicate pairs and prepare for analysis
   Example: /dedupe prepare --org bluerabbit --file duplicate-pairs.csv

2. **analyze** - Run safety analysis on prepared pairs
   Example: /dedupe analyze --decisions ./decisions.json

3. **execute** - Execute approved merges (NEW)
   Example: /dedupe execute --batch-size 10 --dry-run
   Options:
   - --batch-size: Pairs per batch (default: 10)
   - --dry-run: Validate without executing
   - --auto-approve: Execute APPROVE decisions without confirmation
   - --resume: Resume from paused execution

4. **monitor** - Monitor execution progress (NEW)
   Example: /dedupe monitor --execution-id exec_2025-10-16_001

5. **rollback** - Rollback executed merges (NEW)
   Example: /dedupe rollback --execution-id exec_2025-10-16_001
   Options:
   - --batch: Rollback specific batch
   - --pair: Rollback specific pair
   - --validate: Validate rollback without executing

6. **recover** - Recover from blocked merges
   Example: /dedupe recover --pair-id 001xxx_001yyy

7. **help** - Show this help message
```

#### D. Update Agent with Phase 3 Features

Update `.claude-plugins/salesforce-plugin/agents/sfdc-dedup-safety-copilot.md` to v3.0.0:

```markdown
---
name: sfdc-dedup-safety-copilot
version: 3.0.0
description: Salesforce deduplication safety copilot with Phase 3 guardrails and Phase 5 execution
tools:
  - Bash
  - Read
  - Write
  - Edit
---

# SFDC Dedup Safety Copilot

## Capabilities (v3.0.0)

### Phase 3 Enhancements (NEW)
- Data asymmetry detection
- Name similarity validation (80% threshold)
- Minimum data quality enforcement
- Enhanced confidence scoring with asymmetry penalties
- Validation data bonuses (domain/phone/name match)

### Phase 5 Enhancements (NEW)
- Bulk merge execution via Composite API
- Real-time execution monitoring
- Rollback capabilities with state restoration
- Dry-run validation mode
- Emergency stop controls

### Agent Integration (NEW)
- Seamless integration with merge-orchestrator
- Context-aware safety recommendations
- Auto-wire to sub-agents via helper library

## Usage

### For Interactive Dedup Operations
Use /dedupe command for guided workflow

### For Sub-Agent Integration
```javascript
const AgentDedupHelper = require('./agent-dedup-helper');
const helper = new AgentDedupHelper('sfdc-merge-orchestrator', 'bluerabbit');

const recommendations = await helper.getRecommendations(duplicatePairs);
// Returns: safe_to_auto_merge, requires_human_review, do_not_merge
```
```

## Configuration

### Execution Config (`config/dedup-execution-config.json`)

```json
{
  "batch_size": 10,
  "max_retries": 3,
  "retry_delay_ms": 5000,
  "max_concurrent_batches": 1,
  "dry_run_default": false,
  "auto_approve_threshold": {
    "min_confidence": 75,
    "max_guardrails": 0,
    "min_validation_data": true
  },
  "monitoring": {
    "refresh_interval_ms": 2000,
    "alert_on_error_rate": 0.1,
    "slack_webhook": "${SLACK_WEBHOOK_URL}"
  },
  "rollback": {
    "snapshot_before_merge": true,
    "snapshot_related_records": true,
    "max_rollback_age_hours": 72
  }
}
```

## Safety Controls

### Pre-Execution Validation

Before any execution:
1. ✅ Org connection verified
2. ✅ User has delete/edit permissions on Account
3. ✅ All decisions have passed guardrails
4. ✅ No BLOCK decisions in batch
5. ✅ Backup/snapshot capability confirmed
6. ✅ Rollback log initialized

### During Execution

1. **Batch Atomicity**: Each batch commits independently
2. **Error Isolation**: Failed pairs don't block batch
3. **Retry Logic**: Transient errors retry 3x with backoff
4. **Progress Logging**: Every pair logged for rollback
5. **Emergency Stop**: Graceful shutdown on demand

### Post-Execution

1. **Execution Summary**: Success/failure rates
2. **Rollback Readiness**: Log validated and accessible
3. **Alert Notifications**: High error rates trigger alerts
4. **Audit Trail**: Full execution history preserved

## Testing Strategy

### Phase 5 Test Plan

#### Test 1: Dry-Run Validation
```bash
node bulk-merge-executor.js \
  --org bluerabbit \
  --decisions test-decisions-approved.json \
  --dry-run \
  --batch-size 5
```

**Expected**: All validations pass, no actual merges executed

#### Test 2: Small Batch Execution
```bash
node bulk-merge-executor.js \
  --org bluerabbit \
  --decisions test-decisions-approved.json \
  --batch-size 5 \
  --max-pairs 10
```

**Expected**: 10 pairs merged in 2 batches, execution log created

#### Test 3: Rollback Verification
```bash
node dedup-rollback-system.js \
  --org bluerabbit \
  --execution-log ./execution-logs/exec_2025-10-16_001.json \
  --rollback-batch batch_1
```

**Expected**: Batch 1 pairs restored to pre-merge state

#### Test 4: Error Handling
```bash
# Simulate permission error by removing delete permission
node bulk-merge-executor.js \
  --org bluerabbit \
  --decisions test-decisions-approved.json
```

**Expected**: Pre-flight validation fails with clear error message

#### Test 5: Sub-Agent Integration
```bash
# Via sfdc-merge-orchestrator agent
# Invoke merge operation that uses AgentDedupHelper
```

**Expected**: Agent gets safety recommendations, executes only APPROVE decisions

## Success Criteria

Phase 5 is complete when:

- [ ] Bulk merge executor handles 50+ pairs in batches
- [ ] Composite API integration working with <2s/pair avg
- [ ] Dry-run mode validates without executing
- [ ] Rollback system restores all test merges successfully
- [ ] Real-time monitoring displays accurate progress
- [ ] Sub-agents can invoke dedup via helper library
- [ ] `/dedupe execute` command works end-to-end
- [ ] Emergency stop leaves no partial state
- [ ] All test scenarios pass (dry-run, small batch, rollback, errors, sub-agent)
- [ ] Documentation complete and accurate

## Rollout Plan

### Phase 5.1: Core Execution (Week 1)
- Implement bulk-merge-executor.js
- Salesforce Composite API integration
- Basic execution logging
- Dry-run mode

### Phase 5.2: Rollback System (Week 1)
- Execution log format
- Rollback system implementation
- State restoration logic
- Rollback validation

### Phase 5.3: Monitoring (Week 2)
- Real-time dashboard
- Progress tracking
- Error alerting
- Performance metrics

### Phase 5.4: Sub-Agent Integration (Week 2)
- Agent helper library
- Pre-execution hook
- Update sfdc-dedup-safety-copilot
- Update /dedupe command

### Phase 5.5: Testing & Documentation (Week 3)
- Execute all test scenarios
- Performance tuning
- Documentation updates
- Release notes

## Dependencies

**Salesforce APIs**:
- Composite API (v62.0+)
- Merge API (Account object)
- Query API (state snapshots)
- Undelete API (rollback)

**Node Packages**:
- @salesforce/cli (org connection)
- jsforce (optional, for advanced queries)

**Environment**:
- Salesforce CLI authenticated
- Node.js 18+
- Write permissions to execution-logs directory

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss from bad merge | HIGH | Pre-execution snapshots, 72hr rollback window |
| Partial batch failure | MEDIUM | Batch atomicity, error isolation, retry logic |
| Salesforce API limits | MEDIUM | Batch size tuning, rate limiting, exponential backoff |
| Permission errors | LOW | Pre-flight validation, clear error messages |
| Rollback complexity | MEDIUM | Comprehensive logging, rollback validation, test coverage |

## Next Steps After Phase 5

Once Phase 5 is complete and validated:

1. **Phase 6: ML Integration** (Future - skipped for now)
   - Pattern recognition
   - Confidence boosting
   - Anomaly detection

2. **Production Hardening**
   - Load testing (1000+ pairs)
   - Multi-org testing
   - Edge case coverage
   - Performance optimization

3. **User Feedback Integration**
   - Collect execution metrics
   - Analyze rollback patterns
   - Refine guardrail thresholds
   - Improve error messages

---

**Design Review**: Ready for implementation
**Next Action**: Begin Phase 5.1 - Core Execution Implementation

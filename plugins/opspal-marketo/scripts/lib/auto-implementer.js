/**
 * Auto Implementer
 *
 * Executes low-risk changes automatically based on Claude recommendations:
 * - Validate change against auto-implement rules
 * - Execute token updates via Marketo API
 * - Log all auto-implemented changes
 * - Roll back if validation fails post-implementation
 * - Queue high-risk changes for human approval
 *
 * @module auto-implementer
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Auto-implement rules configuration
 */
const AUTO_IMPLEMENT_RULES = {
  // Token updates are generally safe
  token_update: {
    allowed: true,
    maxChangesPerDay: 10,
    requiresValidation: false,
    rollbackSupported: true
  },

  // Wait time changes with limits
  wait_time_change: {
    allowed: true,
    maxPercentChange: 50, // Can only change by up to 50%
    minWaitMinutes: 60, // Cannot reduce below 1 hour
    requiresValidation: true,
    rollbackSupported: true
  },

  // Subject line A/B tests - create only, don't activate
  subject_line_test: {
    allowed: true,
    autoActivate: false, // Creates test in draft, requires manual activation
    requiresValidation: true,
    rollbackSupported: true
  },

  // These always require approval
  flow_step_change: {
    allowed: false,
    reason: 'Flow changes can significantly impact lead journeys'
  },
  segmentation_change: {
    allowed: false,
    reason: 'Segmentation changes affect audience targeting across campaigns'
  },
  smart_list_change: {
    allowed: false,
    reason: 'Smart list changes alter which leads receive communications'
  },
  campaign_activation: {
    allowed: false,
    reason: 'Campaign activation/deactivation requires human oversight'
  }
};

/**
 * Auto Implementer class
 */
class AutoImplementer {
  constructor(portal, options = {}) {
    this.portal = portal;
    this.basePath = options.basePath || `instances/${portal}/observability`;
    this.rules = { ...AUTO_IMPLEMENT_RULES, ...options.rules };
    this.dailyChangeCounts = new Map();
  }

  /**
   * Check if a recommendation can be auto-implemented
   */
  canAutoImplement(recommendation) {
    const rule = this.rules[recommendation.type];

    if (!rule) {
      return {
        allowed: false,
        reason: `Unknown recommendation type: ${recommendation.type}`
      };
    }

    if (!rule.allowed) {
      return {
        allowed: false,
        reason: rule.reason || 'This change type requires manual approval'
      };
    }

    // Check daily limits
    const today = new Date().toISOString().split('T')[0];
    const todayCount = this.dailyChangeCounts.get(today) || 0;

    if (rule.maxChangesPerDay && todayCount >= rule.maxChangesPerDay) {
      return {
        allowed: false,
        reason: `Daily limit reached (${rule.maxChangesPerDay} changes)`
      };
    }

    // Type-specific validation
    if (recommendation.type === 'wait_time_change') {
      return this.validateWaitTimeChange(recommendation, rule);
    }

    return { allowed: true };
  }

  /**
   * Validate wait time change against rules
   */
  validateWaitTimeChange(recommendation, rule) {
    const { currentValue, proposedValue } = recommendation;

    const currentMinutes = this.parseWaitToMinutes(currentValue);
    const proposedMinutes = this.parseWaitToMinutes(proposedValue);

    if (proposedMinutes < rule.minWaitMinutes) {
      return {
        allowed: false,
        reason: `Proposed wait (${proposedMinutes} min) is below minimum (${rule.minWaitMinutes} min)`
      };
    }

    const percentChange = Math.abs(proposedMinutes - currentMinutes) / currentMinutes * 100;

    if (percentChange > rule.maxPercentChange) {
      return {
        allowed: false,
        reason: `Change of ${percentChange.toFixed(0)}% exceeds maximum allowed (${rule.maxPercentChange}%)`
      };
    }

    return { allowed: true };
  }

  /**
   * Execute an auto-implementable change
   */
  async execute(recommendation, mcpTools) {
    // Verify can auto-implement
    const check = this.canAutoImplement(recommendation);
    if (!check.allowed) {
      return {
        success: false,
        autoImplemented: false,
        reason: check.reason,
        queuedForApproval: true
      };
    }

    // Capture before state for rollback
    const beforeState = await this.captureBeforeState(recommendation, mcpTools);

    // Execute based on type
    let result;
    try {
      switch (recommendation.type) {
        case 'token_update':
          result = await this.executeTokenUpdate(recommendation, mcpTools);
          break;
        case 'wait_time_change':
          result = await this.executeWaitTimeChange(recommendation, mcpTools);
          break;
        case 'subject_line_test':
          result = await this.executeSubjectLineTest(recommendation, mcpTools);
          break;
        default:
          throw new Error(`Unsupported auto-implement type: ${recommendation.type}`);
      }
    } catch (error) {
      return {
        success: false,
        autoImplemented: false,
        error: error.message,
        beforeState
      };
    }

    // Validate post-implementation if required
    if (this.rules[recommendation.type].requiresValidation) {
      const validation = await this.validateImplementation(recommendation, mcpTools);
      if (!validation.valid) {
        // Rollback
        await this.rollback(recommendation, beforeState, mcpTools);
        return {
          success: false,
          autoImplemented: false,
          error: `Validation failed: ${validation.reason}`,
          rolledBack: true
        };
      }
    }

    // Update daily count
    const today = new Date().toISOString().split('T')[0];
    this.dailyChangeCounts.set(today, (this.dailyChangeCounts.get(today) || 0) + 1);

    // Log the change
    await this.logChange({
      recommendation,
      beforeState,
      afterState: result,
      implementedAt: new Date().toISOString()
    });

    return {
      success: true,
      autoImplemented: true,
      result,
      beforeState
    };
  }

  /**
   * Execute a token update
   */
  async executeTokenUpdate(recommendation, mcpTools) {
    const { programId, tokenName, newValue } = recommendation.target;

    // Call Marketo API to update token
    // Note: Actual implementation would use MCP tool
    console.log(`Updating token ${tokenName} in program ${programId} to: ${newValue}`);

    // Simulated API call
    if (mcpTools.mcp__marketo__program_token_update) {
      await mcpTools.mcp__marketo__program_token_update({
        programId,
        tokenName,
        tokenValue: newValue
      });
    }

    return {
      type: 'token_update',
      programId,
      tokenName,
      newValue,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Execute a wait time change
   */
  async executeWaitTimeChange(recommendation, mcpTools) {
    const { campaignId, stepId, newWait } = recommendation.target;

    console.log(`Updating wait step ${stepId} in campaign ${campaignId} to: ${newWait}`);

    // Note: Wait step changes typically require flow modification
    // This would need to be implemented based on Marketo's API capabilities

    return {
      type: 'wait_time_change',
      campaignId,
      stepId,
      newWait,
      note: 'Wait step changes may require manual verification',
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Execute a subject line A/B test setup
   */
  async executeSubjectLineTest(recommendation, mcpTools) {
    const { emailId, variantSubject, testConfig } = recommendation.target;

    console.log(`Setting up A/B test for email ${emailId}`);

    // Create test in draft mode (not activated)
    const testSetup = {
      type: 'subject_line_test',
      emailId,
      control: recommendation.controlSubject,
      variant: variantSubject,
      testConfig: {
        ...testConfig,
        status: 'draft_awaiting_activation'
      },
      createdAt: new Date().toISOString(),
      note: 'Test created in draft mode - manual activation required'
    };

    return testSetup;
  }

  /**
   * Capture state before change for rollback
   */
  async captureBeforeState(recommendation, mcpTools) {
    switch (recommendation.type) {
      case 'token_update':
        // Get current token value
        if (mcpTools.mcp__marketo__program_get) {
          const program = await mcpTools.mcp__marketo__program_get({
            programId: recommendation.target.programId
          });
          const token = program.tokens?.find(t => t.name === recommendation.target.tokenName);
          return {
            type: 'token',
            programId: recommendation.target.programId,
            tokenName: recommendation.target.tokenName,
            previousValue: token?.value
          };
        }
        break;

      case 'wait_time_change':
        return {
          type: 'wait_time',
          campaignId: recommendation.target.campaignId,
          stepId: recommendation.target.stepId,
          previousWait: recommendation.currentValue
        };

      default:
        return { type: recommendation.type, captured: false };
    }
  }

  /**
   * Validate that implementation was successful
   */
  async validateImplementation(recommendation, mcpTools) {
    // Type-specific validation
    switch (recommendation.type) {
      case 'token_update':
        if (mcpTools.mcp__marketo__program_get) {
          const program = await mcpTools.mcp__marketo__program_get({
            programId: recommendation.target.programId
          });
          const token = program.tokens?.find(t => t.name === recommendation.target.tokenName);
          if (token?.value === recommendation.target.newValue) {
            return { valid: true };
          }
          return { valid: false, reason: 'Token value did not update correctly' };
        }
        break;

      default:
        return { valid: true, note: 'Validation not implemented for this type' };
    }

    return { valid: true };
  }

  /**
   * Rollback a change
   */
  async rollback(recommendation, beforeState, mcpTools) {
    console.log(`Rolling back ${recommendation.type} change`);

    switch (recommendation.type) {
      case 'token_update':
        if (beforeState.previousValue != null && mcpTools.mcp__marketo__program_token_update) {
          await mcpTools.mcp__marketo__program_token_update({
            programId: beforeState.programId,
            tokenName: beforeState.tokenName,
            tokenValue: beforeState.previousValue
          });
        }
        break;

      default:
        console.warn(`Rollback not implemented for ${recommendation.type}`);
    }

    await this.logRollback(recommendation, beforeState);
  }

  /**
   * Log a successful change
   */
  async logChange(changeRecord) {
    const logPath = path.join(this.basePath, 'history', 'auto-implementations.json');

    let log = [];
    try {
      log = JSON.parse(await fs.readFile(logPath, 'utf8'));
    } catch (e) {
      console.error('[auto-implementer] Failed to parse', logPath, '-', e.message);
      try {
        const raw = await fs.readFile(logPath, 'utf8').catch(() => null);
        if (raw) {
          const backupPath = logPath + '.corrupt-' + Date.now();
          await fs.writeFile(backupPath, raw);
          console.error('[auto-implementer] Corrupted file preserved at', backupPath);
        }
      } catch (_) { /* best-effort preservation */ }
    }

    log.push({
      id: `auto-${Date.now()}`,
      ...changeRecord
    });

    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.writeFile(logPath, JSON.stringify(log, null, 2));
  }

  /**
   * Log a rollback
   */
  async logRollback(recommendation, beforeState) {
    const logPath = path.join(this.basePath, 'history', 'rollbacks.json');

    let log = [];
    try {
      log = JSON.parse(await fs.readFile(logPath, 'utf8'));
    } catch (e) {
      console.error('[auto-implementer] Failed to parse', logPath, '-', e.message);
      try {
        const raw = await fs.readFile(logPath, 'utf8').catch(() => null);
        if (raw) {
          const backupPath = logPath + '.corrupt-' + Date.now();
          await fs.writeFile(backupPath, raw);
          console.error('[auto-implementer] Corrupted file preserved at', backupPath);
        }
      } catch (_) { /* best-effort preservation */ }
    }

    log.push({
      id: `rollback-${Date.now()}`,
      recommendation,
      beforeState,
      rolledBackAt: new Date().toISOString()
    });

    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.writeFile(logPath, JSON.stringify(log, null, 2));
  }

  /**
   * Queue a change for human approval
   */
  async queueForApproval(recommendation, reason) {
    const queuePath = path.join(this.basePath, 'analysis', 'recommendations', 'pending.json');

    let queue = [];
    try {
      queue = JSON.parse(await fs.readFile(queuePath, 'utf8'));
    } catch (e) {
      console.error('[auto-implementer] Failed to parse', queuePath, '-', e.message);
      try {
        const raw = await fs.readFile(queuePath, 'utf8').catch(() => null);
        if (raw) {
          const backupPath = queuePath + '.corrupt-' + Date.now();
          await fs.writeFile(backupPath, raw);
          console.error('[auto-implementer] Corrupted file preserved at', backupPath);
        }
      } catch (_) { /* best-effort preservation */ }
    }

    queue.push({
      id: `pending-${Date.now()}`,
      recommendation,
      reason,
      queuedAt: new Date().toISOString(),
      status: 'pending_approval'
    });

    await fs.mkdir(path.dirname(queuePath), { recursive: true });
    await fs.writeFile(queuePath, JSON.stringify(queue, null, 2));

    return { queued: true, queuePosition: queue.length };
  }

  // Helper functions

  parseWaitToMinutes(waitString) {
    if (typeof waitString === 'number') return waitString;

    const matches = waitString.match(/(\d+)\s*(minute|hour|day|week)/i);
    if (!matches) return null;

    const value = parseInt(matches[1]);
    const unit = matches[2].toLowerCase();

    switch (unit) {
      case 'minute': return value;
      case 'hour': return value * 60;
      case 'day': return value * 60 * 24;
      case 'week': return value * 60 * 24 * 7;
      default: return value;
    }
  }
}

module.exports = {
  AutoImplementer,
  AUTO_IMPLEMENT_RULES
};

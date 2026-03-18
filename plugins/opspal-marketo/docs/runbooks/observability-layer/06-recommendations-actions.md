# Recommendations & Actions

## Overview

This runbook covers translating Claude's analysis into concrete actions in Marketo. It defines the automation levels, approval workflows, and implementation patterns for different recommendation types.

## Recommendation Categories

### Category 1: Token Updates (Auto-Implementable)

Program tokens control dynamic content in emails and landing pages.

**Risk Level**: Low
**Automation**: Auto-implement
**Rollback**: Easy (revert token value)

**Example Recommendations**:
- "Update {{my.Offer}} token from 'Free Trial' to 'Extended Free Trial' for Segment A"
- "Change {{my.CTA_Text}} from 'Learn More' to 'Get Started Now'"
- "Update {{my.Deadline}} to reflect new campaign end date"

**Implementation via API**:

```javascript
async function updateProgramToken(programId, tokenName, newValue) {
  // Get current token value for rollback tracking
  const currentTokens = await mcp__marketo__program_get({ programId });
  const currentValue = currentTokens.tokens?.find(t => t.name === tokenName)?.value;

  // Log the change
  const changeRecord = {
    timestamp: new Date().toISOString(),
    type: 'token_update',
    programId,
    tokenName,
    previousValue: currentValue,
    newValue,
    autoImplemented: true
  };

  // Execute update
  await mcp__marketo__program_token_update({
    programId,
    tokenName,
    tokenValue: newValue
  });

  // Verify change
  const updatedTokens = await mcp__marketo__program_get({ programId });
  const verified = updatedTokens.tokens?.find(t => t.name === tokenName)?.value === newValue;

  return {
    success: verified,
    changeRecord,
    rollbackValue: currentValue
  };
}
```

### Category 2: Wait Step Timing (Conditional Auto-Implement)

Adjustments to wait steps in flows.

**Risk Level**: Low-Medium
**Automation**: Auto-implement if change ≤50%
**Rollback**: Moderate (requires flow edit)

**Constraints**:
- Only adjust wait steps, not other flow steps
- Maximum 50% increase or decrease
- Cannot reduce to less than 1 hour
- Requires flow to be in draft mode

**Example Recommendations**:
- "Increase wait between Email 1 and Email 2 from 3 days to 4 days"
- "Reduce follow-up timing from 7 days to 5 days based on engagement data"

**Implementation Check**:

```javascript
function canAutoImplementWaitChange(currentWait, proposedWait) {
  const currentMinutes = parseWaitToMinutes(currentWait);
  const proposedMinutes = parseWaitToMinutes(proposedWait);

  const changePercent = Math.abs(proposedMinutes - currentMinutes) / currentMinutes * 100;

  return {
    allowed: changePercent <= 50 && proposedMinutes >= 60,
    changePercent,
    reason: changePercent > 50
      ? `Change of ${changePercent.toFixed(0)}% exceeds 50% threshold`
      : proposedMinutes < 60
      ? 'Proposed wait is less than 1 hour minimum'
      : 'Within auto-implement parameters'
  };
}
```

### Category 3: Email Subject Line A/B Tests (Semi-Auto)

Testing alternative subject lines.

**Risk Level**: Low
**Automation**: Auto-create test, requires manual activation
**Rollback**: End test and use control

**Example Recommendations**:
- "Test subject line 'Your exclusive offer awaits' vs current 'Special offer inside'"
- "A/B test adding urgency: 'Last chance: {Offer}' vs '{Offer}'"

**Implementation Pattern**:

```javascript
async function setupSubjectLineTest(emailId, variantSubject) {
  // Get current email
  const email = await mcp__marketo__email_get({ emailId });
  const controlSubject = email.subject;

  // Create A/B test configuration (requires manual activation)
  const testConfig = {
    emailId,
    testType: 'subject',
    control: {
      subject: controlSubject,
      percentage: 50
    },
    variant: {
      subject: variantSubject,
      percentage: 50
    },
    winnerCriteria: 'openRate',
    testDuration: '4 hours',
    status: 'draft_awaiting_approval'
  };

  return {
    autoImplemented: false,
    requiresApproval: true,
    testConfig,
    approvalMessage: `A/B test ready for review:\nControl: "${controlSubject}"\nVariant: "${variantSubject}"`
  };
}
```

### Category 4: Segmentation Changes (Requires Approval)

Modifications to smart lists or segmentation rules.

**Risk Level**: Medium-High
**Automation**: None - requires human approval
**Rollback**: Complex (may affect multiple campaigns)

**Example Recommendations**:
- "Create a new segment for leads with score >80 who haven't engaged in 30 days"
- "Split Segment A by industry for more targeted messaging"
- "Exclude leads with emailInvalid=true from email programs"

**Approval Workflow**:

```javascript
async function queueSegmentationChange(recommendation) {
  const changeRequest = {
    id: generateUUID(),
    type: 'segmentation_change',
    description: recommendation.action,
    createdAt: new Date().toISOString(),
    status: 'pending_approval',
    impact: await assessSegmentationImpact(recommendation),
    approvalRequired: true,
    approvers: ['marketing_ops', 'campaign_manager']
  };

  // Add to approval queue
  await addToApprovalQueue(changeRequest);

  // Notify approvers
  await notifyApprovers(changeRequest);

  return {
    autoImplemented: false,
    changeRequestId: changeRequest.id,
    message: 'Segmentation change queued for approval'
  };
}
```

### Category 5: Flow Step Changes (Requires Approval)

Adding, removing, or modifying flow steps.

**Risk Level**: High
**Automation**: None - requires human approval
**Rollback**: Complex (requires flow versioning)

**Example Recommendations**:
- "Add a re-engagement email step for leads who don't open Email 2"
- "Remove the webinar invite step for leads who already registered"
- "Insert a score adjustment after form fill"

### Category 6: Campaign Activation/Deactivation (Requires Approval)

Turning campaigns on or off.

**Risk Level**: High
**Automation**: None - requires human approval
**Rollback**: Straightforward but impactful

**Example Recommendations**:
- "Deactivate underperforming Campaign X (2% engagement rate)"
- "Activate re-engagement campaign for dormant leads"

## Approval Workflow

### Approval Queue Structure

```json
{
  "queue": [
    {
      "id": "req-001",
      "type": "segmentation_change",
      "description": "Create segment for high-score dormant leads",
      "recommendation": {
        "source": "engagement_analysis",
        "analysisDate": "2025-01-15",
        "confidence": "high"
      },
      "impact": {
        "affectedLeads": 5000,
        "affectedCampaigns": 3,
        "riskLevel": "medium"
      },
      "status": "pending_approval",
      "createdAt": "2025-01-15T10:00:00Z",
      "requiredApprovals": 1,
      "approvals": []
    }
  ]
}
```

### Approval Actions

```javascript
async function processApproval(requestId, action, approver) {
  const request = await getApprovalRequest(requestId);

  if (action === 'approve') {
    request.approvals.push({
      approver,
      action: 'approved',
      timestamp: new Date().toISOString()
    });

    if (request.approvals.length >= request.requiredApprovals) {
      request.status = 'approved';
      await executeApprovedChange(request);
    }
  } else if (action === 'reject') {
    request.status = 'rejected';
    request.rejectedBy = approver;
    request.rejectedAt = new Date().toISOString();
  } else if (action === 'defer') {
    request.status = 'deferred';
    request.deferredUntil = calculateDeferDate();
  }

  await updateApprovalRequest(request);
  return request;
}
```

## Implementation Tracking

### Change Log

All changes (auto and manual) are logged for audit and impact analysis:

```json
{
  "changes": [
    {
      "id": "chg-001",
      "timestamp": "2025-01-15T10:30:00Z",
      "type": "token_update",
      "autoImplemented": true,
      "source": {
        "analysisId": "ana-001",
        "recommendation": "Update {{my.Offer}} token..."
      },
      "target": {
        "programId": 1044,
        "tokenName": "my.Offer"
      },
      "values": {
        "before": "Free Trial",
        "after": "Extended Free Trial"
      },
      "verified": true,
      "rollbackAvailable": true
    }
  ]
}
```

### Impact Measurement

Track outcomes of implemented changes:

```javascript
async function measureChangeImpact(changeId, measureAfterDays = 7) {
  const change = await getChange(changeId);
  const implementedAt = new Date(change.timestamp);
  const measureAt = new Date(implementedAt.getTime() + measureAfterDays * 24 * 60 * 60 * 1000);

  // Get metrics before change
  const beforeMetrics = await getMetricsForPeriod(
    new Date(implementedAt.getTime() - measureAfterDays * 24 * 60 * 60 * 1000),
    implementedAt
  );

  // Get metrics after change
  const afterMetrics = await getMetricsForPeriod(implementedAt, measureAt);

  // Calculate impact
  const impact = {
    changeId,
    measurementPeriod: `${measureAfterDays} days`,
    metrics: {
      openRate: {
        before: beforeMetrics.openRate,
        after: afterMetrics.openRate,
        change: afterMetrics.openRate - beforeMetrics.openRate,
        percentChange: ((afterMetrics.openRate - beforeMetrics.openRate) / beforeMetrics.openRate * 100).toFixed(1)
      },
      clickRate: {
        before: beforeMetrics.clickRate,
        after: afterMetrics.clickRate,
        change: afterMetrics.clickRate - beforeMetrics.clickRate,
        percentChange: ((afterMetrics.clickRate - beforeMetrics.clickRate) / beforeMetrics.clickRate * 100).toFixed(1)
      }
    },
    assessment: assessImpact(beforeMetrics, afterMetrics)
  };

  // Store for learning
  await storeImpactMeasurement(impact);

  return impact;
}
```

## Rollback Procedures

### Token Rollback

```javascript
async function rollbackTokenChange(changeId) {
  const change = await getChange(changeId);

  if (change.type !== 'token_update') {
    throw new Error('Rollback only supported for token changes');
  }

  await updateProgramToken(
    change.target.programId,
    change.target.tokenName,
    change.values.before
  );

  // Log rollback
  await logRollback(changeId, {
    rolledBackAt: new Date().toISOString(),
    reason: 'manual_rollback'
  });

  return { success: true, restoredValue: change.values.before };
}
```

### Automatic Rollback on Negative Impact

```javascript
async function checkForAutoRollback(changeId) {
  const impact = await measureChangeImpact(changeId, 2); // Quick 2-day check

  // Rollback if significant negative impact
  const openRateDecline = parseFloat(impact.metrics.openRate.percentChange);
  const clickRateDecline = parseFloat(impact.metrics.clickRate.percentChange);

  if (openRateDecline < -20 || clickRateDecline < -30) {
    console.warn(`Auto-rollback triggered for ${changeId}: significant negative impact`);

    await rollbackTokenChange(changeId);

    return {
      rolledBack: true,
      reason: `Open rate: ${openRateDecline}%, Click rate: ${clickRateDecline}%`
    };
  }

  return { rolledBack: false };
}
```

## Notification System

### Notify on Important Events

```javascript
const NOTIFICATION_EVENTS = {
  'change_implemented': {
    template: 'Auto-implemented: {description} on {target}',
    channels: ['log']
  },
  'approval_required': {
    template: 'Approval needed: {description}\nRisk: {riskLevel}',
    channels: ['log', 'dashboard']
  },
  'negative_impact_detected': {
    template: 'Warning: {changeDescription} showing negative impact ({metric}: {value}%)',
    channels: ['log', 'dashboard', 'alert']
  },
  'rollback_executed': {
    template: 'Rollback: {changeDescription} reverted due to {reason}',
    channels: ['log', 'dashboard', 'alert']
  }
};

async function notify(event, data) {
  const config = NOTIFICATION_EVENTS[event];
  const message = interpolate(config.template, data);

  for (const channel of config.channels) {
    await sendToChannel(channel, { event, message, data });
  }
}
```

## Related

- [05-claude-analysis-patterns.md](./05-claude-analysis-patterns.md) - How recommendations are generated
- [07-storage-retention.md](./07-storage-retention.md) - Where changes are stored
- [08-continuous-intelligence.md](./08-continuous-intelligence.md) - Feedback loop

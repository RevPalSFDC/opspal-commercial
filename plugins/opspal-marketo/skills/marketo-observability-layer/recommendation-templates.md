# Recommendation Templates

Structured templates for generating and implementing marketing recommendations.

## Token Update Templates

### Subject Line Personalization
```json
{
  "type": "token_update",
  "riskLevel": "low",
  "autoImplement": true,
  "recommendation": {
    "target": {
      "programId": "{{programId}}",
      "tokenName": "my.Subject_Line"
    },
    "currentValue": "{{currentValue}}",
    "proposedValue": "{{lead.firstName}}, {{proposedContent}}",
    "rationale": "Personalized subject lines increase open rates by 10-20%",
    "expectedImpact": {
      "metric": "openRate",
      "change": "+3-5%",
      "confidence": "high"
    },
    "rollbackValue": "{{currentValue}}"
  }
}
```

### CTA Button Text
```json
{
  "type": "token_update",
  "riskLevel": "low",
  "autoImplement": true,
  "recommendation": {
    "target": {
      "programId": "{{programId}}",
      "tokenName": "my.CTA_Text"
    },
    "currentValue": "Learn More",
    "proposedValue": "Get Your Free Demo",
    "rationale": "Action-oriented CTAs with value proposition perform better",
    "expectedImpact": {
      "metric": "clickRate",
      "change": "+1-2%",
      "confidence": "medium"
    }
  }
}
```

### Sender Name
```json
{
  "type": "token_update",
  "riskLevel": "low",
  "autoImplement": true,
  "recommendation": {
    "target": {
      "programId": "{{programId}}",
      "tokenName": "my.Sender_Name"
    },
    "currentValue": "Marketing Team",
    "proposedValue": "Sarah from {{company}}",
    "rationale": "Personal sender names increase trust and open rates",
    "expectedImpact": {
      "metric": "openRate",
      "change": "+2-4%",
      "confidence": "medium"
    }
  }
}
```

## Wait Step Templates

### Reduce Wait Time
```json
{
  "type": "wait_adjustment",
  "riskLevel": "low",
  "autoImplement": true,
  "maxAdjustment": "50%",
  "recommendation": {
    "target": {
      "campaignId": "{{campaignId}}",
      "stepNumber": "{{stepNumber}}"
    },
    "currentWait": "5 days",
    "proposedWait": "3 days",
    "changePercent": -40,
    "rationale": "Data shows optimal engagement window is 2-4 days",
    "expectedImpact": {
      "metric": "progressionRate",
      "change": "+2%",
      "confidence": "medium"
    },
    "validation": {
      "minWait": "1 day",
      "maxChange": "50%"
    }
  }
}
```

### Increase Wait Time
```json
{
  "type": "wait_adjustment",
  "riskLevel": "low",
  "autoImplement": true,
  "recommendation": {
    "target": {
      "campaignId": "{{campaignId}}",
      "stepNumber": "{{stepNumber}}"
    },
    "currentWait": "1 day",
    "proposedWait": "2 days",
    "changePercent": 100,
    "rationale": "Too frequent emails causing unsubscribes",
    "expectedImpact": {
      "metric": "unsubscribeRate",
      "change": "-0.2%",
      "confidence": "high"
    }
  }
}
```

## A/B Test Templates

### Subject Line Test (Draft Only)
```json
{
  "type": "ab_test",
  "riskLevel": "low",
  "autoImplement": true,
  "createAsDraft": true,
  "recommendation": {
    "target": {
      "emailId": "{{emailId}}",
      "emailName": "{{emailName}}"
    },
    "testType": "subject_line",
    "variantA": "{{currentSubject}}",
    "variantB": "{{proposedSubject}}",
    "splitRatio": "50/50",
    "duration": "7 days",
    "winnerCriteria": "openRate",
    "minimumSampleSize": 1000,
    "rationale": "Test personalization vs curiosity approach",
    "expectedInsight": "Determine best subject line style for audience"
  }
}
```

## Segmentation Templates (Requires Approval)

### Engagement-Based Segmentation
```json
{
  "type": "segmentation_change",
  "riskLevel": "high",
  "autoImplement": false,
  "requiresApproval": true,
  "recommendation": {
    "segmentName": "{{segmentName}}",
    "action": "split",
    "currentCriteria": "{{currentCriteria}}",
    "proposedCriteria": [
      {
        "name": "{{segmentName}} - Highly Engaged",
        "criteria": "Last Activity < 30 days AND Email Opens >= 3"
      },
      {
        "name": "{{segmentName}} - Moderately Engaged",
        "criteria": "Last Activity 30-60 days OR Email Opens 1-2"
      },
      {
        "name": "{{segmentName}} - Re-engagement",
        "criteria": "Last Activity > 60 days"
      }
    ],
    "rationale": "Enables targeted messaging based on engagement recency",
    "expectedImpact": {
      "metric": "overallEngagement",
      "change": "+5-8%",
      "confidence": "medium"
    },
    "affectedAssets": [
      "Campaign 2001",
      "Campaign 2002",
      "Smart List XYZ"
    ],
    "implementationSteps": [
      "Create new smart lists with criteria",
      "Update campaign triggers",
      "Migrate existing members",
      "Activate new campaigns"
    ]
  }
}
```

## Flow Step Templates (Requires Approval)

### Add Wait Step
```json
{
  "type": "flow_modification",
  "riskLevel": "high",
  "autoImplement": false,
  "requiresApproval": true,
  "recommendation": {
    "target": {
      "campaignId": "{{campaignId}}",
      "campaignName": "{{campaignName}}"
    },
    "action": "add_step",
    "stepType": "Wait",
    "position": "after step {{stepNumber}}",
    "configuration": {
      "duration": "3 days"
    },
    "rationale": "Add buffer between communications to prevent fatigue",
    "expectedImpact": {
      "metric": "unsubscribeRate",
      "change": "-0.3%",
      "confidence": "medium"
    },
    "risks": [
      "Extends overall campaign duration",
      "May delay time-sensitive communications"
    ]
  }
}
```

### Add Choice Step
```json
{
  "type": "flow_modification",
  "riskLevel": "high",
  "autoImplement": false,
  "requiresApproval": true,
  "recommendation": {
    "target": {
      "campaignId": "{{campaignId}}"
    },
    "action": "add_choice",
    "stepType": "Send Email",
    "choices": [
      {
        "condition": "Industry is Healthcare",
        "action": "Send Healthcare-specific email"
      },
      {
        "condition": "Industry is Finance",
        "action": "Send Finance-specific email"
      }
    ],
    "defaultAction": "Send General email",
    "rationale": "Industry-specific messaging improves relevance",
    "expectedImpact": {
      "metric": "clickRate",
      "change": "+2-3%",
      "confidence": "medium"
    }
  }
}
```

## Campaign Activation Templates (Requires Approval)

### Activate Campaign
```json
{
  "type": "campaign_activation",
  "riskLevel": "high",
  "autoImplement": false,
  "requiresApproval": true,
  "recommendation": {
    "target": {
      "campaignId": "{{campaignId}}",
      "campaignName": "{{campaignName}}"
    },
    "action": "activate",
    "currentStatus": "draft",
    "proposedStatus": "active",
    "triggerType": "{{triggerType}}",
    "estimatedLeadsAffected": "{{estimatedCount}}",
    "rationale": "Campaign ready for deployment after testing",
    "preActivationChecklist": [
      "Email content reviewed",
      "Smart list verified",
      "Token values confirmed",
      "Test leads processed successfully"
    ]
  }
}
```

### Deactivate Campaign
```json
{
  "type": "campaign_deactivation",
  "riskLevel": "high",
  "autoImplement": false,
  "requiresApproval": true,
  "recommendation": {
    "target": {
      "campaignId": "{{campaignId}}",
      "campaignName": "{{campaignName}}"
    },
    "action": "deactivate",
    "currentStatus": "active",
    "proposedStatus": "inactive",
    "rationale": "Performance below threshold for 30+ days",
    "performanceData": {
      "openRate": "{{openRate}}%",
      "baseline": "25%",
      "deviation": "{{deviation}}"
    },
    "alternativeAction": "Consider updating content before deactivating"
  }
}
```

## Implementation Response Template

### Successful Implementation
```json
{
  "status": "implemented",
  "timestamp": "{{timestamp}}",
  "recommendation": {
    "id": "{{recId}}",
    "type": "{{type}}"
  },
  "result": {
    "success": true,
    "target": "{{target}}",
    "oldValue": "{{oldValue}}",
    "newValue": "{{newValue}}"
  },
  "impactMeasurement": {
    "scheduledAt": ["{{timestamp+2days}}", "{{timestamp+7days}}"],
    "metrics": ["openRate", "clickRate"],
    "rollbackCriteria": "Metric drops >20% from baseline"
  }
}
```

### Implementation Queued
```json
{
  "status": "queued_for_approval",
  "timestamp": "{{timestamp}}",
  "recommendation": {
    "id": "{{recId}}",
    "type": "{{type}}",
    "riskLevel": "high"
  },
  "approvalRequired": {
    "reason": "{{reason}}",
    "estimatedImpact": "{{impact}}",
    "affectedAssets": ["{{assets}}"]
  },
  "expiresAt": "{{timestamp+7days}}"
}
```

## Approval Workflow

### Approval Request
```json
{
  "approvalId": "{{uuid}}",
  "requestedAt": "{{timestamp}}",
  "recommendation": "{{recommendation}}",
  "riskAssessment": {
    "level": "high",
    "factors": [
      "Affects multiple campaigns",
      "Changes smart list criteria",
      "Impacts 10,000+ leads"
    ]
  },
  "approver": "{{approverEmail}}",
  "expiresAt": "{{timestamp+7days}}",
  "actions": ["approve", "reject", "modify"]
}
```

### Approval Response
```json
{
  "approvalId": "{{uuid}}",
  "decision": "approved|rejected|modified",
  "decidedAt": "{{timestamp}}",
  "decidedBy": "{{approverEmail}}",
  "modifications": "{{ifModified}}",
  "comments": "{{comments}}",
  "implementationScheduled": "{{scheduleTime}}"
}
```

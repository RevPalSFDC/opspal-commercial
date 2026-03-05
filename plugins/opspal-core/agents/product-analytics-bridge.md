---
name: product-analytics-bridge
description: Bridges product analytics platforms (Pendo, Amplitude, Mixpanel, Heap) with Salesforce and HubSpot. Syncs usage data for PLG funnels, feature adoption tracking, trial-to-paid conversion signals, and power user identification.
color: indigo
model: sonnet
version: 1.0.0
tools:
  - Read
  - Write
  - Grep
  - Glob
  - Bash
  - Task
  - TodoWrite
  - WebFetch
  - mcp_salesforce_data_query
  - mcp_salesforce_data_create
  - mcp_salesforce_data_update
  - mcp_hubspot_*
triggerKeywords:
  - product analytics
  - pendo
  - amplitude
  - mixpanel
  - heap
  - usage data
  - feature adoption
  - plg funnel
  - trial conversion
  - power user
---

# Product Analytics Bridge Agent

## Purpose

Bridge product analytics platforms (Pendo, Amplitude, Mixpanel, Heap) with CRM systems (Salesforce, HubSpot). Enables PLG (Product-Led Growth) motion by syncing usage data, feature adoption, trial conversion signals, and power user identification to inform sales, marketing, and customer success workflows.

## Core Principles

### 1. PLG-First Design
- Product usage drives sales prioritization
- Trial-to-paid conversion signals
- PQL (Product Qualified Lead) scoring
- Expansion opportunity identification

### 2. Feature Adoption Tracking
- Track adoption across feature categories
- Identify sticky features vs underutilized
- Correlate adoption with retention
- Surface expansion opportunities

### 3. Account-Level Aggregation
- Roll up individual usage to accounts
- Identify power users and champions
- Track team adoption patterns
- License utilization analysis

## Supported Platforms

| Platform | Strengths | Best For |
|----------|-----------|----------|
| **Pendo** | In-app guides, feedback, NPS | Onboarding optimization |
| **Amplitude** | Behavioral cohorts, funnels | Product analytics deep-dive |
| **Mixpanel** | Event tracking, A/B testing | Growth experimentation |
| **Heap** | Auto-capture, retroactive analysis | Comprehensive tracking |

## Integration Architecture

### Authentication

```json
{
  "productAnalytics": {
    "pendo": {
      "authType": "APIKey",
      "baseUrl": "https://app.pendo.io/api/v1",
      "envVars": {
        "apiKey": "PENDO_API_KEY",
        "appId": "PENDO_APP_ID"
      }
    },
    "amplitude": {
      "authType": "APIKey",
      "baseUrl": "https://amplitude.com/api/2",
      "envVars": {
        "apiKey": "AMPLITUDE_API_KEY",
        "secretKey": "AMPLITUDE_SECRET_KEY"
      }
    },
    "mixpanel": {
      "authType": "ServiceAccount",
      "baseUrl": "https://mixpanel.com/api/2.0",
      "envVars": {
        "serviceAccount": "MIXPANEL_SERVICE_ACCOUNT",
        "projectId": "MIXPANEL_PROJECT_ID"
      }
    },
    "heap": {
      "authType": "APIKey",
      "baseUrl": "https://heapanalytics.com/api",
      "envVars": {
        "apiKey": "HEAP_API_KEY",
        "appId": "HEAP_APP_ID"
      }
    }
  }
}
```

## Usage Data Model

### Core Metrics

| Metric | Definition | PLG Signal |
|--------|------------|------------|
| **DAU** | Daily Active Users | Engagement level |
| **WAU** | Weekly Active Users | Habitual usage |
| **MAU** | Monthly Active Users | Retention indicator |
| **DAU/MAU** | Stickiness ratio | Product value |
| **Sessions** | Usage frequency | Engagement depth |
| **Time in App** | Duration per session | Value realization |
| **Feature Usage** | Specific feature events | Adoption depth |
| **Activation Rate** | Users completing key action | Onboarding success |

### Feature Adoption Categories

```json
{
  "featureCategories": {
    "core": {
      "description": "Essential features for basic value",
      "features": ["dashboard_view", "report_create", "data_import"],
      "adoptionTarget": 80,
      "churnImpact": "high"
    },
    "growth": {
      "description": "Features that drive expansion",
      "features": ["team_invite", "integration_connect", "automation_create"],
      "adoptionTarget": 50,
      "expansionSignal": true
    },
    "advanced": {
      "description": "Power user features",
      "features": ["api_usage", "custom_reports", "bulk_operations"],
      "adoptionTarget": 20,
      "powerUserIndicator": true
    },
    "premium": {
      "description": "Features requiring upgrade",
      "features": ["sso_config", "audit_log", "advanced_permissions"],
      "adoptionTarget": 10,
      "upsellTrigger": true
    }
  }
}
```

## Data Sync Mappings

### User Usage → Salesforce Contact

| Analytics Field | Salesforce Field | Sync Frequency |
|-----------------|------------------|----------------|
| `last_active` | Last_Product_Activity__c | Daily |
| `sessions_30d` | Sessions_Last_30_Days__c | Daily |
| `total_time_30d` | Time_In_App_30_Days__c | Daily |
| `features_used` | Features_Adopted__c | Daily |
| `activation_complete` | Product_Activated__c | Real-time |
| `nps_score` | Product_NPS__c | Real-time |
| `power_user_score` | Power_User_Score__c | Daily |

### Account Usage → Salesforce Account

| Aggregation | Salesforce Field | Description |
|-------------|------------------|-------------|
| `total_users` | Total_Product_Users__c | Licensed users |
| `active_users_30d` | Active_Users_30_Days__c | MAU |
| `dau_mau_ratio` | DAU_MAU_Ratio__c | Stickiness |
| `feature_adoption_score` | Feature_Adoption_Score__c | % features used |
| `license_utilization` | License_Utilization__c | Active/Licensed |
| `power_users` | Power_User_Count__c | Heavy users |
| `expansion_signals` | Expansion_Signals__c | Growth indicators |
| `churn_risk_usage` | Usage_Churn_Risk__c | Decline signals |

### Usage → HubSpot Contact Properties

```javascript
// Sync usage to HubSpot contact
const usageProperties = {
  product_last_seen: formatDate(usage.lastActive),
  product_sessions_30d: usage.sessions30d,
  product_activation_date: formatDate(usage.activationDate),
  product_features_adopted: usage.featuresAdopted.join(';'),
  product_nps_score: usage.npsScore,
  product_health_score: calculateHealthScore(usage),
  pql_score: calculatePQLScore(usage),
  product_tier: determineTier(usage)
};
```

## PLG Funnel Tracking

### Trial-to-Paid Funnel

```
Signup → Activation → Engagement → Conversion → Expansion

Stage Definitions:
1. Signup: Account created
2. Activation: Completed key action (e.g., first report, first import)
3. Engagement: Consistent usage (3+ sessions/week)
4. Conversion: Upgraded to paid plan
5. Expansion: Added seats or upgraded tier
```

### Funnel Metrics

```json
{
  "funnelMetrics": {
    "signupToActivation": {
      "conversionTarget": 60,
      "maxDays": 7,
      "salesforceField": "Activation_Rate__c"
    },
    "activationToEngagement": {
      "conversionTarget": 50,
      "maxDays": 14,
      "salesforceField": "Engagement_Rate__c"
    },
    "engagementToConversion": {
      "conversionTarget": 25,
      "maxDays": 30,
      "salesforceField": "Trial_Conversion_Rate__c"
    },
    "conversionToExpansion": {
      "conversionTarget": 30,
      "maxDays": 90,
      "salesforceField": "Expansion_Rate__c"
    }
  }
}
```

## PQL (Product Qualified Lead) Scoring

### PQL Score Components

| Component | Weight | Signals |
|-----------|--------|---------|
| **Activation** | 25% | Completed setup, first value action |
| **Engagement** | 30% | DAU/MAU ratio, session frequency |
| **Feature Depth** | 25% | Core + growth feature adoption |
| **Team Signal** | 20% | Invites sent, multi-user activity |

### PQL Score Calculation

```javascript
function calculatePQLScore(usage, account) {
  const scores = {
    activation: {
      weight: 0.25,
      score: calculateActivationScore(usage)
    },
    engagement: {
      weight: 0.30,
      score: calculateEngagementScore(usage)
    },
    featureDepth: {
      weight: 0.25,
      score: calculateFeatureDepthScore(usage)
    },
    teamSignal: {
      weight: 0.20,
      score: calculateTeamSignalScore(account)
    }
  };

  const pqlScore = Object.values(scores).reduce(
    (total, { weight, score }) => total + (weight * score), 0
  );

  return {
    score: Math.round(pqlScore),
    tier: pqlScore >= 80 ? 'Hot' : pqlScore >= 60 ? 'Warm' : pqlScore >= 40 ? 'Nurture' : 'Cold',
    components: scores,
    salesReady: pqlScore >= 70
  };
}

function calculateActivationScore(usage) {
  let score = 0;
  if (usage.accountCreated) score += 20;
  if (usage.firstValueAction) score += 40;
  if (usage.setupComplete) score += 40;
  return score;
}

function calculateEngagementScore(usage) {
  const dauMau = usage.dauMauRatio || 0;
  if (dauMau >= 0.4) return 100;
  if (dauMau >= 0.3) return 80;
  if (dauMau >= 0.2) return 60;
  if (dauMau >= 0.1) return 40;
  return 20;
}

function calculateFeatureDepthScore(usage) {
  const coreAdoption = usage.coreFeatures.length / 3 * 50;
  const growthAdoption = usage.growthFeatures.length / 3 * 30;
  const advancedAdoption = usage.advancedFeatures.length / 3 * 20;
  return Math.min(coreAdoption + growthAdoption + advancedAdoption, 100);
}

function calculateTeamSignalScore(account) {
  let score = 0;
  if (account.invitesSent > 0) score += 30;
  if (account.activeUsers > 1) score += 40;
  if (account.activeUsers >= 3) score += 30;
  return score;
}
```

### PQL Thresholds

| Tier | Score Range | Action |
|------|-------------|--------|
| **Hot PQL** | 80-100 | Immediate sales outreach |
| **Warm PQL** | 60-79 | Priority sales follow-up |
| **Nurture** | 40-59 | Marketing nurture + product tips |
| **Cold** | 0-39 | Onboarding assistance |

## Power User Identification

### Power User Criteria

```json
{
  "powerUserDefinition": {
    "minimumCriteria": {
      "sessions30d": 20,
      "dauRatio": 0.5,
      "featuresUsed": 8
    },
    "bonusSignals": {
      "advancedFeatures": 3,
      "apiUsage": true,
      "invitesSent": 2,
      "npsPromoter": true
    },
    "scoring": {
      "sessionFrequency": 30,
      "featureAdoption": 30,
      "advancedUsage": 20,
      "teamInfluence": 20
    }
  }
}
```

### Power User Output

```json
{
  "powerUsers": [
    {
      "userId": "user_123",
      "email": "jane.smith@acme.com",
      "accountId": "001xxx",
      "powerUserScore": 92,
      "signals": {
        "sessions30d": 28,
        "dauRatio": 0.65,
        "featuresUsed": 12,
        "advancedFeatures": ["api_usage", "custom_reports", "automations"],
        "invitesSent": 5,
        "npsScore": 9
      },
      "championPotential": "HIGH",
      "recommendation": "Engage as champion for expansion opportunity"
    }
  ]
}
```

## Sync Workflows

### 1. Daily Usage Sync

```bash
# Sync usage data from Pendo to Salesforce
node scripts/lib/product-analytics-sync.js \
  --source pendo \
  --target salesforce \
  --org production \
  --mode daily-sync
```

### 2. Real-time Activation Events

```
User Completes Activation
    ↓
Event fires to integration endpoint
    ↓
Update Contact.Product_Activated__c = true
    ↓
Calculate PQL score
    ↓
If PQL >= 70, trigger sales alert
```

### 3. Account-Level Aggregation

```bash
# Aggregate user usage to account level
node scripts/lib/product-analytics-sync.js \
  --source amplitude \
  --target salesforce \
  --org production \
  --mode account-rollup
```

### 4. Expansion Signal Detection

```bash
# Identify accounts with expansion signals
node scripts/lib/product-analytics-sync.js \
  --source mixpanel \
  --mode expansion-signals \
  --output ./reports/expansion-opportunities.csv
```

## Configuration

### Integration Config (config/integration-mappings.json)

```json
{
  "productAnalytics": {
    "enabled": true,
    "source": "pendo",
    "syncSchedule": "0 6 * * *",
    "targets": {
      "salesforce": {
        "enabled": true,
        "orgAlias": "production",
        "contactSync": true,
        "accountSync": true,
        "pqlScoring": true,
        "expansionSignals": true
      },
      "hubspot": {
        "enabled": true,
        "portalId": "${HUBSPOT_PORTAL_ID}",
        "contactSync": true,
        "lifecycleUpdates": true
      }
    },
    "pqlConfig": {
      "enabled": true,
      "salesReadyThreshold": 70,
      "alertChannel": "#pql-alerts"
    },
    "usageMetrics": {
      "dauWindow": 1,
      "wauWindow": 7,
      "mauWindow": 30,
      "sessionTimeout": 30
    },
    "featureTracking": {
      "coreFeatures": ["dashboard_view", "report_create", "data_import"],
      "growthFeatures": ["team_invite", "integration_connect", "automation_create"],
      "advancedFeatures": ["api_usage", "custom_reports", "bulk_operations"],
      "premiumFeatures": ["sso_config", "audit_log", "advanced_permissions"]
    }
  }
}
```

### Environment Variables

```bash
# Pendo
PENDO_API_KEY=your_api_key
PENDO_APP_ID=your_app_id

# Amplitude
AMPLITUDE_API_KEY=your_api_key
AMPLITUDE_SECRET_KEY=your_secret_key

# Mixpanel
MIXPANEL_SERVICE_ACCOUNT=your_service_account
MIXPANEL_PROJECT_ID=your_project_id

# Heap
HEAP_API_KEY=your_api_key
HEAP_APP_ID=your_app_id
```

## Output Format

### Usage Sync Report

```json
{
  "syncId": "usage-sync-2026-01-18-001",
  "source": "pendo",
  "targets": ["salesforce", "hubspot"],
  "syncTime": "2026-01-18T06:00:00Z",
  "status": "completed",
  "summary": {
    "usersProcessed": 2450,
    "usersUpdated": 2380,
    "usersFailed": 70,
    "accountsAggregated": 485,
    "pqlsIdentified": 124,
    "hotPqls": 28,
    "powerUsersIdentified": 156,
    "expansionSignals": 42
  },
  "errors": [
    {
      "type": "contact_not_found",
      "userId": "user_456",
      "email": "unknown@external.com",
      "count": 45
    }
  ],
  "highlights": {
    "newActivations": 32,
    "newPowerUsers": 8,
    "expansionOpportunities": [
      {
        "accountId": "001xxx",
        "accountName": "Acme Corp",
        "signal": "License utilization at 95%",
        "recommendation": "Upsell additional seats"
      }
    ]
  }
}
```

### Account Usage Record

```json
{
  "accountId": "001xxx",
  "accountName": "Acme Corp",
  "usageMetrics": {
    "totalUsers": 25,
    "activeUsers30d": 22,
    "licenseUtilization": 0.88,
    "dauMauRatio": 0.42,
    "avgSessionsPerUser": 18,
    "avgTimeInApp": 45
  },
  "featureAdoption": {
    "coreAdoption": 0.95,
    "growthAdoption": 0.65,
    "advancedAdoption": 0.28,
    "overallScore": 78
  },
  "pqlMetrics": {
    "accountPqlScore": 82,
    "tier": "Hot",
    "salesReady": true,
    "topPqlUsers": ["jane.smith@acme.com", "john.doe@acme.com"]
  },
  "powerUsers": {
    "count": 4,
    "users": ["jane.smith@acme.com", "john.doe@acme.com", "alice.wong@acme.com", "bob.jones@acme.com"]
  },
  "expansionSignals": {
    "licenseLimit": true,
    "advancedFeatureUsage": true,
    "teamGrowth": true,
    "premiumFeatureAttempts": ["sso_config", "audit_log"]
  },
  "healthIndicators": {
    "trend": "improving",
    "usageGrowth30d": 0.15,
    "churnRisk": "low"
  }
}
```

## Expansion Signal Detection

### Signal Types

| Signal | Detection | Opportunity |
|--------|-----------|-------------|
| **License Limit** | Utilization > 90% | Upsell seats |
| **Feature Limit** | Premium feature attempts | Upgrade tier |
| **Team Growth** | New user invites | Add seats |
| **Power User Cluster** | 3+ power users | Enterprise upgrade |
| **API Usage Spike** | High API volume | Developer tier |
| **Multi-Team** | Users across departments | Enterprise features |

### Signal Output

```json
{
  "expansionSignals": [
    {
      "accountId": "001xxx",
      "signalType": "license_limit",
      "strength": "HIGH",
      "details": "22 of 25 licenses active (88%), 3 pending invites",
      "recommendation": "Upsell 10-seat expansion",
      "estimatedValue": 12000
    },
    {
      "accountId": "001xxx",
      "signalType": "premium_feature_attempts",
      "strength": "MEDIUM",
      "details": "5 users attempted SSO config, 3 attempted audit log",
      "recommendation": "Pitch Enterprise tier",
      "estimatedValue": 25000
    }
  ]
}
```

## Churn Risk from Usage

### Usage Decline Signals

| Signal | Threshold | Risk Level |
|--------|-----------|------------|
| DAU drop | > 40% vs prior 30 days | CRITICAL |
| Login frequency | Weekly → Monthly | HIGH |
| Feature abandonment | Core feature unused 14 days | HIGH |
| Power user churn | Power user inactive 7 days | MEDIUM |
| Session duration | > 50% decline | MEDIUM |

### Churn Risk Integration

```javascript
// Feed usage-based churn signals to revops-churn-risk-scorer
const usageChurnSignals = {
  dauDrop: {
    value: calculateDAUDrop(usage),
    threshold: 0.4,
    risk: dauDrop > 0.4 ? 20 : dauDrop > 0.2 ? 10 : 0
  },
  loginFrequency: {
    value: usage.loginFrequency,
    risk: usage.loginFrequency === 'monthly' ? 20 : usage.loginFrequency === 'weekly' ? 5 : 0
  },
  featureAbandonment: {
    value: getAbandonedFeatures(usage),
    risk: abandonedFeatures.length > 0 ? 15 : 0
  },
  powerUserActivity: {
    value: powerUserActivity,
    risk: powerUserInactive ? 10 : 0
  }
};
```

## Related Agents

- `outreach-integration-agent` - Sales engagement data
- `gong-integration-agent` - Conversation intelligence
- `revops-customer-health-scorer` - Uses usage data for health scoring
- `revops-churn-risk-scorer` - Uses usage decline for churn prediction
- `revops-lead-scorer` - Uses engagement data for lead scoring

## Scripts

- `scripts/lib/product-analytics-sync.js` - Core sync engine
- `scripts/lib/pql-calculator.js` - PQL scoring
- `scripts/lib/power-user-identifier.js` - Power user detection
- `scripts/lib/expansion-signal-detector.js` - Expansion opportunity identification
- `scripts/lib/usage-churn-analyzer.js` - Churn risk from usage

## Best Practices

### Do's
- Focus on actionable signals, not vanity metrics
- Aggregate to account level for sales/CS utility
- Define clear PQL thresholds with sales alignment
- Track feature adoption by category
- Integrate usage into existing health/churn scoring

### Don'ts
- Don't sync every event - focus on meaningful signals
- Don't treat all users equally - weight by account value
- Don't ignore data quality - validate user-to-account mapping
- Don't set static thresholds - calibrate based on outcomes
- Don't skip account rollup - individual data isn't actionable

## Disclaimer

> This integration requires proper API credentials from your product analytics platform. Ensure data privacy compliance when syncing user behavior data. User identification should follow your privacy policy and consent requirements. Test thoroughly in sandbox environments before production deployment.

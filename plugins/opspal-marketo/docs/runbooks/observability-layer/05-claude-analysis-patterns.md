# Claude Analysis Patterns

## Overview

This runbook covers strategies for using Claude to analyze normalized Marketo data, interpret patterns, and generate actionable insights. The goal is to transform raw metrics into natural language recommendations.

## Analysis Types

### 1. Campaign Performance Analysis

Evaluate email and program effectiveness.

**Input Data Required**:
- Activity summary (sends, opens, clicks)
- Program member data (status distribution, success rates)
- Historical comparison data

**Prompt Pattern**:

```markdown
## Campaign Performance Analysis Request

**Campaign**: {campaignName}
**Date Range**: {startDate} to {endDate}

### Email Metrics
- Sends: {sendCount}
- Opens: {openCount} ({openRate}% open rate)
- Clicks: {clickCount} ({clickRate}% click rate)
- Bounces: {bounceCount} ({bounceRate}% bounce rate)
- Unsubscribes: {unsubCount}

### Program Membership
- Total Members: {memberCount}
- By Status: {statusBreakdown}
- Success Rate: {successRate}%

### Historical Comparison
- Previous Period Open Rate: {prevOpenRate}%
- Previous Period Click Rate: {prevClickRate}%
- Previous Period Success Rate: {prevSuccessRate}%

### Analysis Request
1. Evaluate overall campaign health
2. Identify performance anomalies
3. Compare to historical baseline
4. Provide 3 specific improvement recommendations
```

**Expected Output Structure**:

```markdown
## Campaign Analysis: {campaignName}

### Performance Summary
[2-3 sentence overview of campaign health]

### Key Findings
1. **Open Rate**: {assessment} - {openRate}% vs {industry_avg}% industry average
2. **Click Rate**: {assessment} - {clickRate}% indicates {interpretation}
3. **Conversion**: {successRate}% of members reached success

### Anomalies Detected
- [List any metrics outside normal ranges]

### Recommendations
1. **[Category]**: [Specific action] - Expected impact: [X]%
2. **[Category]**: [Specific action] - Expected impact: [X]%
3. **[Category]**: [Specific action] - Expected impact: [X]%

### Risk Assessment
[LOW/MEDIUM/HIGH] - [Reasoning]
```

### 2. Engagement Trend Analysis

Identify patterns in lead engagement over time.

**Input Data Required**:
- Activity logs with timestamps
- Lead score changes
- Engagement by hour/day

**Prompt Pattern**:

```markdown
## Engagement Trend Analysis

**Period**: {dateRange}
**Lead Count**: {leadCount}

### Activity Distribution by Hour (UTC)
{hourlyBreakdown}

### Activity Distribution by Day
{dailyBreakdown}

### Top Activity Types
{activityTypeRanking}

### Score Change Summary
- Leads with increased scores: {increasedCount} ({increasedPct}%)
- Leads with decreased scores: {decreasedCount} ({decreasedPct}%)
- Average score change: {avgChange}

### Analysis Request
1. Identify optimal send times
2. Detect engagement pattern shifts
3. Segment leads by engagement level
4. Recommend timing optimizations
```

### 3. Funnel Analysis

Track lead progression through marketing stages.

**Input Data Required**:
- Program membership across stages
- Status transitions (from activity logs)
- Conversion rates between stages

**Prompt Pattern**:

```markdown
## Marketing Funnel Analysis

**Funnel Definition**:
Stage 1: {stage1Name} → Stage 2: {stage2Name} → ... → Success

### Stage Populations
| Stage | Count | Conversion to Next |
|-------|-------|-------------------|
{stageData}

### Bottleneck Identification
- Largest drop-off: {stage} to {nextStage} ({dropOffPct}% lost)
- Time in stage (avg): {avgDays} days

### Lead Velocity
- Avg time to success: {daysToSuccess} days
- Fastest cohort: {fastCohort} ({fastDays} days)
- Slowest cohort: {slowCohort} ({slowDays} days)

### Analysis Request
1. Identify the primary conversion bottleneck
2. Estimate impact of improving each stage by 10%
3. Recommend specific interventions for worst-performing stage
4. Suggest re-engagement strategies for stalled leads
```

### 4. Anomaly Detection Analysis

Identify unusual patterns that require attention.

**Input Data Required**:
- Current metrics vs historical averages
- Recent activities
- Error indicators (bounces, unsubscribes)

**Prompt Pattern**:

```markdown
## Anomaly Detection Report

**Date**: {analysisDate}

### Detected Anomalies
{anomalyList}

### Context Data
- Normal open rate range: {minOpen}% - {maxOpen}%
- Current open rate: {currentOpen}%
- Standard deviation: {stdDev}

### Recent Changes
{recentChanges}

### Analysis Request
1. Assess severity of each anomaly (Critical/Warning/Info)
2. Determine likely root cause
3. Provide immediate mitigation steps
4. Suggest preventive measures
```

## Prompting Best Practices

### 1. Provide Sufficient Context

**Bad** (insufficient context):
```
Analyze this campaign data:
Opens: 12500
Clicks: 3000
```

**Good** (full context):
```
Analyze this B2B SaaS campaign targeting enterprise decision-makers:
- Audience: IT Directors at companies 500+ employees
- Campaign type: Product launch announcement
- Sends: 50,000
- Opens: 12,500 (25% open rate)
- Clicks: 3,000 (6% click rate)
- Industry benchmark: 22% open, 4% click for B2B tech
- Previous campaign: 20% open, 3% click
```

### 2. Request Structured Output

**Bad** (unstructured request):
```
What do you think about this campaign performance?
```

**Good** (structured request):
```
Analyze this campaign and provide:
1. A 1-paragraph executive summary
2. 3 key metrics to watch
3. 2-3 specific optimization recommendations
4. Risk level (Low/Medium/High) with reasoning
```

### 3. Include Action Constraints

Tell Claude what actions are possible:

```markdown
### Available Actions
When making recommendations, limit suggestions to these available actions:
- Token updates (can be auto-implemented)
- Email subject line changes (requires A/B test)
- Wait step timing adjustments (up to 50% change allowed)
- Segmentation suggestions (requires manual review)

Flow step changes, smart list modifications, and campaign activation changes
require manual approval and should be flagged as "Requires Review".
```

### 4. Provide Historical Baselines

```markdown
### Performance Baselines
Use these historical averages for comparison:
- Email open rate: 23% (±5% normal variance)
- Click rate: 4.5% (±2% normal variance)
- Form completion: 15% (±3% normal variance)
- Program success rate: 35% (±10% normal variance)

Flag any metric >2 standard deviations from baseline as anomaly.
```

## Analysis Workflow

### Step 1: Gather Data

```javascript
async function gatherAnalysisData(portal, dateRange) {
  const basePath = `instances/${portal}/observability`;

  // Load normalized data
  const leads = await loadJSON(`${basePath}/exports/leads/leads-current.json`);
  const activities = await loadJSON(`${basePath}/exports/activities/activities-7day.json`);
  const programs = await loadProgramData(basePath);

  // Load historical baselines
  const baselines = await loadJSON(`${basePath}/metrics/baselines.json`);

  return {
    leads: leads.summary,
    activities: activities.summary,
    programs: programs.map(p => p.summary),
    baselines,
    dateRange
  };
}
```

### Step 2: Build Prompt

```javascript
function buildAnalysisPrompt(data, analysisType) {
  const templates = {
    performance: CAMPAIGN_PERFORMANCE_TEMPLATE,
    engagement: ENGAGEMENT_TREND_TEMPLATE,
    funnel: FUNNEL_ANALYSIS_TEMPLATE,
    anomaly: ANOMALY_DETECTION_TEMPLATE
  };

  const template = templates[analysisType];
  return interpolateTemplate(template, data);
}
```

### Step 3: Request Analysis

```javascript
async function requestClaudeAnalysis(prompt, options = {}) {
  const {
    maxTokens = 2000,
    temperature = 0.3, // Lower for more consistent analysis
    format = 'markdown'
  } = options;

  // The analysis is performed by the marketo-intelligence-analyst agent
  // which has access to the normalized data and prompting patterns

  return {
    prompt,
    expectedFormat: format,
    constraints: {
      maxTokens,
      temperature
    }
  };
}
```

### Step 4: Parse and Store Results

```javascript
async function processAnalysisResult(result, portal) {
  const timestamp = new Date().toISOString();
  const reportPath = `instances/${portal}/observability/analysis/reports`;

  // Store full analysis
  const reportFile = `${reportPath}/${timestamp.split('T')[0]}-analysis.md`;
  await writeFile(reportFile, result.analysis);

  // Extract and store recommendations
  const recommendations = extractRecommendations(result.analysis);
  await updateRecommendationQueue(portal, recommendations);

  // Update metrics with analysis metadata
  await updateAnalysisMetrics(portal, {
    lastAnalysis: timestamp,
    recommendationCount: recommendations.length,
    anomalyCount: result.anomalies?.length || 0
  });

  return { reportFile, recommendations };
}
```

## Recommendation Extraction

### Parsing Structured Recommendations

```javascript
function extractRecommendations(analysisText) {
  const recommendations = [];
  const recPattern = /### Recommendations\n([\s\S]*?)(?=###|$)/;
  const match = analysisText.match(recPattern);

  if (match) {
    const recSection = match[1];
    const items = recSection.match(/\d+\.\s+\*\*([^*]+)\*\*:\s+([^\n]+)/g);

    for (const item of items || []) {
      const parsed = item.match(/\d+\.\s+\*\*([^*]+)\*\*:\s+(.+)/);
      if (parsed) {
        recommendations.push({
          category: parsed[1].trim(),
          action: parsed[2].trim(),
          autoImplement: isAutoImplementable(parsed[1]),
          createdAt: new Date().toISOString(),
          status: 'pending'
        });
      }
    }
  }

  return recommendations;
}

function isAutoImplementable(category) {
  const autoCategories = ['token', 'subject line', 'wait time', 'timing'];
  return autoCategories.some(c => category.toLowerCase().includes(c));
}
```

## Quality Control

### Validating Analysis Output

```javascript
function validateAnalysis(analysis) {
  const checks = [];

  // Check for required sections
  const requiredSections = ['Summary', 'Findings', 'Recommendations'];
  for (const section of requiredSections) {
    if (!analysis.includes(`### ${section}`) && !analysis.includes(`## ${section}`)) {
      checks.push({ passed: false, check: `Missing ${section} section` });
    } else {
      checks.push({ passed: true, check: `Has ${section} section` });
    }
  }

  // Check for actionable recommendations
  const recCount = (analysis.match(/\d+\.\s+\*\*/g) || []).length;
  if (recCount < 2) {
    checks.push({ passed: false, check: 'Insufficient recommendations (need 2+)' });
  } else {
    checks.push({ passed: true, check: `Has ${recCount} recommendations` });
  }

  // Check for data citations
  const hasNumbers = /\d+%|\d+\.\d+%/.test(analysis);
  checks.push({
    passed: hasNumbers,
    check: hasNumbers ? 'Contains metric citations' : 'Missing metric citations'
  });

  return {
    valid: checks.every(c => c.passed),
    checks
  };
}
```

### Re-prompting on Poor Quality

```javascript
async function ensureQualityAnalysis(data, analysisType, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt = buildAnalysisPrompt(data, analysisType);
    const result = await requestClaudeAnalysis(prompt);

    const validation = validateAnalysis(result.analysis);

    if (validation.valid) {
      return result;
    }

    console.warn(`Analysis attempt ${attempt} failed validation:`, validation.checks);

    if (attempt < maxAttempts) {
      // Add validation feedback to next prompt
      data._validationFeedback = validation.checks
        .filter(c => !c.passed)
        .map(c => c.check);
    }
  }

  throw new Error('Failed to generate valid analysis after max attempts');
}
```

## Related

- [04-data-normalization.md](./04-data-normalization.md) - Preparing data for analysis
- [06-recommendations-actions.md](./06-recommendations-actions.md) - Acting on recommendations

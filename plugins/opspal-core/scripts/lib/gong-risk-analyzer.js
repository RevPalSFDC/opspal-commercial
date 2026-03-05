#!/usr/bin/env node

/**
 * Gong Deal Risk Analyzer
 *
 * Pure functions for calculating conversation-based deal risk signals.
 * No I/O - all data passed in as arguments for testability.
 *
 * @module gong-risk-analyzer
 * @version 1.0.0
 */

const DEFAULT_THRESHOLDS = {
  daysSinceCall: { warning: 14, critical: 21 },
  talkRatio: { min: 30, max: 60 },
  minStakeholders: 2,
  highValueAmount: 50000,
  competitorRiskImpact: 20,
  budgetRiskImpact: 15,
  singleThreadImpact: 15,
  lowEngagementImpact: 10
};

/**
 * Calculate conversation risk score for a deal.
 * @param {Array} calls - Gong call objects with parties, trackers, duration
 * @param {Object} opportunity - Salesforce opportunity { Id, Name, Amount, StageName, CloseDate }
 * @param {Object} [thresholds] - Override thresholds
 * @returns {Object} { riskScore, riskLevel, riskFactors[], recommendations[] }
 */
function calculateConversationRisk(calls, opportunity, thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  let riskScore = 0;
  const riskFactors = [];
  const recommendations = [];

  if (!calls || calls.length === 0) {
    return {
      riskScore: 75,
      riskLevel: 'HIGH',
      riskFactors: [{ factor: 'No Calls', value: 'Zero recorded calls', impact: 75 }],
      recommendations: ['Schedule discovery or qualification call immediately'],
      callCount: 0
    };
  }

  // Sort calls by date (most recent first)
  const sorted = [...calls].sort((a, b) =>
    new Date(b.started || b.scheduled || 0) - new Date(a.started || a.scheduled || 0)
  );
  const lastCallDate = new Date(sorted[0].started || sorted[0].scheduled);
  const daysSinceCall = Math.floor((Date.now() - lastCallDate) / (1000 * 60 * 60 * 24));

  // --- Days since last call ---
  if (daysSinceCall > t.daysSinceCall.critical) {
    const impact = 25;
    riskScore += impact;
    riskFactors.push({ factor: 'Going Dark', value: `${daysSinceCall} days since last call`, impact });
    recommendations.push(`Schedule follow-up call immediately - ${daysSinceCall} days with no engagement`);
  } else if (daysSinceCall > t.daysSinceCall.warning) {
    const impact = 15;
    riskScore += impact;
    riskFactors.push({ factor: 'Engagement Gap', value: `${daysSinceCall} days since last call`, impact });
    recommendations.push(`Follow up soon - ${daysSinceCall} days since last conversation`);
  }

  // --- Competitor mentions ---
  const competitorCalls = calls.filter(c =>
    (c.trackers || []).some(tr =>
      typeof tr === 'string'
        ? tr.toLowerCase().includes('competitor')
        : (tr.name || '').toLowerCase().includes('competitor')
    )
  );
  if (competitorCalls.length > 0) {
    riskScore += t.competitorRiskImpact;
    riskFactors.push({
      factor: 'Competitor Mentioned',
      value: `${competitorCalls.length} call(s)`,
      impact: t.competitorRiskImpact
    });
    recommendations.push('Prepare competitive positioning and differentiation messaging');
  }

  // --- Budget/pricing concerns ---
  const budgetCalls = calls.filter(c =>
    (c.trackers || []).some(tr => {
      const name = typeof tr === 'string' ? tr : (tr.name || '');
      return /budget|pricing|expensive|cost/i.test(name);
    })
  );
  if (budgetCalls.length > 0) {
    riskScore += t.budgetRiskImpact;
    riskFactors.push({
      factor: 'Budget Concerns',
      value: `${budgetCalls.length} call(s)`,
      impact: t.budgetRiskImpact
    });
    recommendations.push('Address pricing objections with value-based selling approach');
  }

  // --- Stakeholder diversity (single-threaded) ---
  const uniqueStakeholders = new Set();
  calls.forEach(call => {
    (call.parties || [])
      .filter(p => p.affiliation === 'External')
      .forEach(p => {
        if (p.emailAddress) uniqueStakeholders.add(p.emailAddress.toLowerCase());
      });
  });

  const amount = opportunity.Amount || opportunity.amount || 0;
  if (uniqueStakeholders.size < t.minStakeholders && amount > t.highValueAmount) {
    riskScore += t.singleThreadImpact;
    riskFactors.push({
      factor: 'Single-threaded',
      value: `Only ${uniqueStakeholders.size} external stakeholder(s) on $${amount.toLocaleString()} deal`,
      impact: t.singleThreadImpact
    });
    recommendations.push('Expand contacts - identify and engage additional stakeholders');
  }

  // --- Talk ratio analysis ---
  const metrics = aggregateCallMetrics(calls);
  if (metrics.avgTalkRatio > 0) {
    if (metrics.avgTalkRatio > t.talkRatio.max) {
      riskScore += t.lowEngagementImpact;
      riskFactors.push({
        factor: 'Rep Dominated Calls',
        value: `${metrics.avgTalkRatio}% avg talk ratio (target: ${t.talkRatio.min}-${t.talkRatio.max}%)`,
        impact: t.lowEngagementImpact
      });
      recommendations.push('Ask more open-ended questions to increase prospect engagement');
    } else if (metrics.avgTalkRatio < t.talkRatio.min) {
      riskScore += Math.floor(t.lowEngagementImpact / 2);
      riskFactors.push({
        factor: 'Low Rep Participation',
        value: `${metrics.avgTalkRatio}% avg talk ratio`,
        impact: Math.floor(t.lowEngagementImpact / 2)
      });
    }
  }

  const finalScore = Math.min(riskScore, 100);
  return {
    riskScore: finalScore,
    riskLevel: finalScore >= 50 ? 'HIGH' : finalScore >= 25 ? 'MEDIUM' : 'LOW',
    riskFactors,
    recommendations,
    callCount: calls.length,
    daysSinceLastCall: daysSinceCall,
    stakeholderCount: uniqueStakeholders.size,
    metrics
  };
}

/**
 * Analyze stakeholder engagement across a deal's calls.
 * @param {Array} calls - Gong call objects
 * @param {Object} opportunity - Opportunity record
 * @returns {Object} Stakeholder engagement analysis
 */
function analyzeStakeholderEngagement(calls, opportunity) {
  const stakeholders = new Map();

  (calls || []).forEach(call => {
    (call.parties || [])
      .filter(p => p.affiliation === 'External')
      .forEach(participant => {
        const email = (participant.emailAddress || '').toLowerCase();
        if (!email) return;

        if (!stakeholders.has(email)) {
          stakeholders.set(email, {
            email,
            name: participant.name || 'Unknown',
            title: participant.title || '',
            callCount: 0,
            totalDuration: 0,
            lastCall: null,
            talkTime: 0
          });
        }

        const s = stakeholders.get(email);
        s.callCount++;
        s.totalDuration += call.duration || 0;
        const callDate = call.started || call.scheduled;
        if (!s.lastCall || new Date(callDate) > new Date(s.lastCall)) {
          s.lastCall = callDate;
        }
        s.talkTime += participant.talkTime || 0;
      });
  });

  const stakeholderList = Array.from(stakeholders.values());
  const byRole = categorizeByRole(stakeholderList);
  const engagementScore = _calculateEngagementScore(stakeholderList);
  const recommendations = _generateEngagementRecommendations(stakeholderList, opportunity);

  return {
    totalStakeholders: stakeholders.size,
    stakeholders: stakeholderList.sort((a, b) => b.callCount - a.callCount),
    byRole,
    engagementScore,
    recommendations,
    mostEngaged: stakeholderList.length > 0
      ? stakeholderList.reduce((a, b) => a.callCount > b.callCount ? a : b)
      : null,
    leastEngaged: stakeholderList.length > 0
      ? stakeholderList.reduce((a, b) => a.callCount < b.callCount ? a : b)
      : null
  };
}

/**
 * Categorize stakeholders by inferred role from title.
 */
function categorizeByRole(stakeholders) {
  const roles = { economic_buyer: 0, champion: 0, end_user: 0, technical: 0, unknown: 0 };

  stakeholders.forEach(s => {
    const title = (s.title || '').toLowerCase();
    if (/\b(ceo|cfo|coo|cro|svp|vp|president|director|head of)\b/.test(title)) {
      roles.economic_buyer++;
    } else if (/\b(manager|lead|sr\.|senior)\b/.test(title)) {
      roles.champion++;
    } else if (/\b(engineer|developer|architect|tech|it)\b/.test(title)) {
      roles.technical++;
    } else if (title) {
      roles.end_user++;
    } else {
      roles.unknown++;
    }
  });

  return roles;
}

function _calculateEngagementScore(stakeholders) {
  if (stakeholders.length === 0) return 0;

  let score = 0;
  // Diversity bonus
  score += Math.min(stakeholders.length * 15, 45);

  // Recency bonus
  const now = Date.now();
  const recentlyEngaged = stakeholders.filter(s =>
    s.lastCall && (now - new Date(s.lastCall)) < (14 * 24 * 60 * 60 * 1000)
  );
  score += Math.min(recentlyEngaged.length * 10, 30);

  // Frequency bonus
  const avgCalls = stakeholders.reduce((sum, s) => sum + s.callCount, 0) / stakeholders.length;
  score += Math.min(avgCalls * 5, 25);

  return Math.min(Math.round(score), 100);
}

function _generateEngagementRecommendations(stakeholders, opportunity) {
  const recommendations = [];
  const now = Date.now();
  const twoWeeks = 14 * 24 * 60 * 60 * 1000;

  // Disengaged stakeholders
  stakeholders.forEach(s => {
    if (s.lastCall && (now - new Date(s.lastCall)) > twoWeeks) {
      recommendations.push(`Re-engage ${s.name} (${s.email}) - last call ${Math.floor((now - new Date(s.lastCall)) / (1000 * 60 * 60 * 24))} days ago`);
    }
  });

  // Missing roles
  const roles = categorizeByRole(stakeholders);
  if (roles.economic_buyer === 0) {
    recommendations.push('Consider engaging an executive/economic buyer');
  }
  if (roles.technical === 0 && (opportunity.Amount || opportunity.amount || 0) > 25000) {
    recommendations.push('Consider engaging technical stakeholders for evaluation');
  }

  if (stakeholders.length < 2) {
    recommendations.push('Expand contacts - single-threaded deals are high risk');
  }

  return recommendations;
}

/**
 * Detect and categorize tracker signals.
 * @param {Array} calls - Calls with tracker data
 * @param {Object} trackerMappings - Mapping config { competitor: [...], risk: [...], positive: [...] }
 * @returns {Object} Categorized tracker signals
 */
function detectTrackerSignals(calls, trackerMappings = {}) {
  const results = { competitor: [], risk: [], positive: [], other: [] };
  const competitorPatterns = (trackerMappings.competitor || []).map(p => p.toLowerCase());
  const riskPatterns = (trackerMappings.risk || []).map(p => p.toLowerCase());
  const positivePatterns = (trackerMappings.positive || []).map(p => p.toLowerCase());

  (calls || []).forEach(call => {
    (call.trackers || []).forEach(tracker => {
      const name = (typeof tracker === 'string' ? tracker : tracker.name || '').toLowerCase();
      const entry = {
        callId: call.id || call.callId,
        callTitle: call.title,
        callDate: call.started || call.scheduled,
        trackerName: typeof tracker === 'string' ? tracker : tracker.name,
        count: typeof tracker === 'object' ? tracker.count || 1 : 1
      };

      if (competitorPatterns.some(p => name.includes(p))) {
        results.competitor.push(entry);
      } else if (riskPatterns.some(p => name.includes(p))) {
        results.risk.push(entry);
      } else if (positivePatterns.some(p => name.includes(p))) {
        results.positive.push(entry);
      } else {
        results.other.push(entry);
      }
    });
  });

  return {
    ...results,
    summary: {
      competitorMentions: results.competitor.length,
      riskSignals: results.risk.length,
      positiveSignals: results.positive.length,
      otherTrackers: results.other.length
    }
  };
}

/**
 * Aggregate call metrics across multiple calls.
 * @param {Array} calls - Gong call objects
 * @returns {Object} Aggregated metrics
 */
function aggregateCallMetrics(calls) {
  if (!calls || calls.length === 0) {
    return {
      callCount: 0,
      totalDuration: 0,
      avgDuration: 0,
      avgTalkRatio: 0,
      lastCallDate: null,
      firstCallDate: null
    };
  }

  let totalDuration = 0;
  let talkRatioSum = 0;
  let talkRatioCount = 0;
  let earliest = null;
  let latest = null;

  calls.forEach(call => {
    totalDuration += call.duration || 0;

    // Talk ratio from interaction stats
    const stats = call.interaction || call.interactionStats;
    if (stats && stats.talkRatio !== undefined) {
      talkRatioSum += stats.talkRatio;
      talkRatioCount++;
    }

    const date = call.started || call.scheduled;
    if (date) {
      const d = new Date(date);
      if (!earliest || d < new Date(earliest)) earliest = date;
      if (!latest || d > new Date(latest)) latest = date;
    }
  });

  return {
    callCount: calls.length,
    totalDuration,
    avgDuration: Math.round(totalDuration / calls.length),
    avgTalkRatio: talkRatioCount > 0 ? Math.round(talkRatioSum / talkRatioCount) : 0,
    lastCallDate: latest,
    firstCallDate: earliest,
    daysSinceLastCall: latest ? Math.floor((Date.now() - new Date(latest)) / (1000 * 60 * 60 * 24)) : null
  };
}

module.exports = {
  calculateConversationRisk,
  analyzeStakeholderEngagement,
  detectTrackerSignals,
  aggregateCallMetrics,
  categorizeByRole,
  DEFAULT_THRESHOLDS
};

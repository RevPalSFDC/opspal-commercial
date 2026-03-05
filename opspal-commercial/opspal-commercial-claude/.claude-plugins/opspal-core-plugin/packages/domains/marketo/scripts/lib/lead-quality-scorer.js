/**
 * Lead Quality Scorer for Marketo
 *
 * Calculates comprehensive lead quality scores based on:
 * - Data completeness (required fields populated)
 * - Data freshness (recent activity/updates)
 * - Data accuracy (valid formats, standardized values)
 * - Engagement indicators (activity history)
 * - Scoring model alignment (lead score populated/valid)
 *
 * @module lead-quality-scorer
 * @version 1.0.0
 */

'use strict';

// Default scoring configuration
const DEFAULT_CONFIG = {
  // Field completeness weights
  completeness: {
    weight: 30, // 30% of total score
    requiredFields: ['email', 'firstName', 'lastName'],
    importantFields: ['company', 'phone', 'title', 'industry'],
    optionalFields: ['website', 'address', 'city', 'state', 'country', 'postalCode'],
  },
  // Data freshness weights
  freshness: {
    weight: 25, // 25% of total score
    thresholds: {
      recent: 30,     // Days - full points
      moderate: 90,   // Days - partial points
      stale: 180,     // Days - minimal points
      // Beyond stale = 0 points
    },
  },
  // Data accuracy weights
  accuracy: {
    weight: 20, // 20% of total score
    emailValidation: true,
    phoneValidation: true,
    standardizedValues: ['industry', 'country', 'state'],
  },
  // Engagement weights
  engagement: {
    weight: 15, // 15% of total score
    activityTypes: ['email_open', 'email_click', 'form_fill', 'web_visit'],
    recentActivityDays: 90,
  },
  // Scoring alignment weights
  scoringAlignment: {
    weight: 10, // 10% of total score
    hasLeadScore: true,
    scoreRange: { min: 0, max: 100 },
  },
};

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Phone validation regex (basic - at least 7 digits)
const PHONE_REGEX = /\d{7,}/;

// Known invalid/test email domains
const INVALID_EMAIL_DOMAINS = [
  'test.com', 'example.com', 'sample.com', 'fake.com',
  'mailinator.com', 'tempmail.com', 'throwaway.com',
];

/**
 * Calculate data completeness score
 * @param {Object} lead - Lead record
 * @param {Object} config - Completeness configuration
 * @returns {Object} Score details
 */
function calculateCompletenessScore(lead, config = DEFAULT_CONFIG.completeness) {
  const results = {
    required: { total: 0, filled: 0, missing: [] },
    important: { total: 0, filled: 0, missing: [] },
    optional: { total: 0, filled: 0, missing: [] },
  };

  // Check required fields
  for (const field of config.requiredFields) {
    results.required.total++;
    if (lead[field] && String(lead[field]).trim()) {
      results.required.filled++;
    } else {
      results.required.missing.push(field);
    }
  }

  // Check important fields
  for (const field of config.importantFields) {
    results.important.total++;
    if (lead[field] && String(lead[field]).trim()) {
      results.important.filled++;
    } else {
      results.important.missing.push(field);
    }
  }

  // Check optional fields
  for (const field of config.optionalFields) {
    results.optional.total++;
    if (lead[field] && String(lead[field]).trim()) {
      results.optional.filled++;
    } else {
      results.optional.missing.push(field);
    }
  }

  // Calculate weighted score
  // Required: 60%, Important: 30%, Optional: 10%
  const requiredScore = results.required.total > 0
    ? (results.required.filled / results.required.total) * 60
    : 60;
  const importantScore = results.important.total > 0
    ? (results.important.filled / results.important.total) * 30
    : 30;
  const optionalScore = results.optional.total > 0
    ? (results.optional.filled / results.optional.total) * 10
    : 10;

  const score = Math.round(requiredScore + importantScore + optionalScore);

  return {
    score,
    details: results,
    allRequiredFilled: results.required.missing.length === 0,
  };
}

/**
 * Calculate data freshness score
 * @param {Object} lead - Lead record
 * @param {Object} config - Freshness configuration
 * @returns {Object} Score details
 */
function calculateFreshnessScore(lead, config = DEFAULT_CONFIG.freshness) {
  const now = new Date();
  let lastActivityDate = null;
  let lastUpdateDate = null;

  // Try to get last activity date
  if (lead.lastActivityDate) {
    lastActivityDate = new Date(lead.lastActivityDate);
  }

  // Try to get last update date
  if (lead.updatedAt) {
    lastUpdateDate = new Date(lead.updatedAt);
  } else if (lead.modifiedAt) {
    lastUpdateDate = new Date(lead.modifiedAt);
  }

  // Use the most recent date
  const lastInteraction = lastActivityDate && lastUpdateDate
    ? new Date(Math.max(lastActivityDate, lastUpdateDate))
    : lastActivityDate || lastUpdateDate;

  if (!lastInteraction) {
    return {
      score: 0,
      daysSinceInteraction: null,
      status: 'unknown',
    };
  }

  const daysSince = Math.floor((now - lastInteraction) / (1000 * 60 * 60 * 24));

  let score = 0;
  let status = 'inactive';

  if (daysSince <= config.thresholds.recent) {
    score = 100;
    status = 'recent';
  } else if (daysSince <= config.thresholds.moderate) {
    score = 70;
    status = 'moderate';
  } else if (daysSince <= config.thresholds.stale) {
    score = 30;
    status = 'stale';
  } else {
    score = 0;
    status = 'inactive';
  }

  return {
    score,
    daysSinceInteraction: daysSince,
    lastInteraction: lastInteraction.toISOString(),
    status,
  };
}

/**
 * Calculate data accuracy score
 * @param {Object} lead - Lead record
 * @param {Object} config - Accuracy configuration
 * @returns {Object} Score details
 */
function calculateAccuracyScore(lead, config = DEFAULT_CONFIG.accuracy) {
  const issues = [];
  let checks = 0;
  let passed = 0;

  // Email validation
  if (config.emailValidation && lead.email) {
    checks++;
    const email = lead.email.toLowerCase();

    // Check format
    if (!EMAIL_REGEX.test(email)) {
      issues.push({ field: 'email', issue: 'Invalid format' });
    } else {
      // Check for invalid domains
      const domain = email.split('@')[1];
      if (INVALID_EMAIL_DOMAINS.includes(domain)) {
        issues.push({ field: 'email', issue: 'Test/disposable domain' });
      } else {
        passed++;
      }
    }
  }

  // Phone validation
  if (config.phoneValidation && lead.phone) {
    checks++;
    const phone = lead.phone.replace(/\D/g, '');

    if (!PHONE_REGEX.test(phone)) {
      issues.push({ field: 'phone', issue: 'Invalid format (too short)' });
    } else if (phone.length > 15) {
      issues.push({ field: 'phone', issue: 'Invalid format (too long)' });
    } else {
      passed++;
    }
  }

  // Standardized value checks
  for (const field of config.standardizedValues) {
    if (lead[field]) {
      checks++;
      const value = String(lead[field]).trim();

      // Check for obviously invalid values
      if (value.length < 2) {
        issues.push({ field, issue: 'Value too short' });
      } else if (/^[0-9]+$/.test(value)) {
        issues.push({ field, issue: 'Numeric value in text field' });
      } else if (value === 'N/A' || value === 'NA' || value === 'none' || value === 'test') {
        issues.push({ field, issue: 'Placeholder value' });
      } else {
        passed++;
      }
    }
  }

  const score = checks > 0 ? Math.round((passed / checks) * 100) : 100;

  return {
    score,
    checks,
    passed,
    issues,
  };
}

/**
 * Calculate engagement score
 * @param {Object} lead - Lead record
 * @param {Array} activities - Lead activities (if available)
 * @param {Object} config - Engagement configuration
 * @returns {Object} Score details
 */
function calculateEngagementScore(lead, activities = [], config = DEFAULT_CONFIG.engagement) {
  const now = new Date();
  const cutoffDate = new Date(now - (config.recentActivityDays * 24 * 60 * 60 * 1000));

  const activityCounts = {};
  let recentActivities = 0;

  for (const activity of activities) {
    const activityType = activity.activityType || activity.type;
    const activityDate = activity.activityDate ? new Date(activity.activityDate) : null;

    // Count by type
    activityCounts[activityType] = (activityCounts[activityType] || 0) + 1;

    // Count recent activities
    if (activityDate && activityDate >= cutoffDate) {
      recentActivities++;
    }
  }

  // Calculate score based on activity volume and recency
  let score = 0;

  // Has any activities
  if (activities.length > 0) {
    score += 20;
  }

  // Recent activity bonus
  if (recentActivities > 0) {
    score += 30;
    // Additional points for more activities (up to 10)
    score += Math.min(recentActivities, 10) * 3;
  }

  // High-value activity types
  const highValueTypes = ['email_click', 'form_fill', 'web_visit'];
  for (const type of highValueTypes) {
    if (activityCounts[type]) {
      score += 10;
    }
  }

  // Cap at 100
  score = Math.min(score, 100);

  return {
    score,
    totalActivities: activities.length,
    recentActivities,
    activityCounts,
  };
}

/**
 * Calculate scoring alignment score
 * @param {Object} lead - Lead record
 * @param {Object} config - Scoring configuration
 * @returns {Object} Score details
 */
function calculateScoringAlignmentScore(lead, config = DEFAULT_CONFIG.scoringAlignment) {
  let score = 0;
  const details = {};

  // Check if lead score exists
  const leadScore = lead.leadScore || lead.score;

  if (leadScore !== undefined && leadScore !== null) {
    score += 50;
    details.hasScore = true;
    details.leadScore = leadScore;

    // Check if score is within expected range
    if (leadScore >= config.scoreRange.min && leadScore <= config.scoreRange.max) {
      score += 30;
      details.validRange = true;
    } else {
      details.validRange = false;
      details.rangeIssue = `Score ${leadScore} outside expected range [${config.scoreRange.min}-${config.scoreRange.max}]`;
    }

    // Bonus for non-zero score
    if (leadScore > 0) {
      score += 20;
      details.engaged = true;
    }
  } else {
    details.hasScore = false;
    details.issue = 'Lead score not populated';
  }

  return {
    score,
    details,
  };
}

/**
 * Calculate comprehensive lead quality score
 * @param {Object} lead - Lead record
 * @param {Array} activities - Lead activities (optional)
 * @param {Object} config - Full scoring configuration
 * @returns {Object} Complete quality assessment
 */
function calculateLeadQuality(lead, activities = [], config = DEFAULT_CONFIG) {
  const completeness = calculateCompletenessScore(lead, config.completeness);
  const freshness = calculateFreshnessScore(lead, config.freshness);
  const accuracy = calculateAccuracyScore(lead, config.accuracy);
  const engagement = calculateEngagementScore(lead, activities, config.engagement);
  const scoringAlignment = calculateScoringAlignmentScore(lead, config.scoringAlignment);

  // Calculate weighted overall score
  const overallScore = Math.round(
    (completeness.score * config.completeness.weight / 100) +
    (freshness.score * config.freshness.weight / 100) +
    (accuracy.score * config.accuracy.weight / 100) +
    (engagement.score * config.engagement.weight / 100) +
    (scoringAlignment.score * config.scoringAlignment.weight / 100)
  );

  // Determine quality tier
  let qualityTier;
  if (overallScore >= 80) {
    qualityTier = 'Excellent';
  } else if (overallScore >= 60) {
    qualityTier = 'Good';
  } else if (overallScore >= 40) {
    qualityTier = 'Fair';
  } else {
    qualityTier = 'Poor';
  }

  // Generate improvement recommendations
  const recommendations = [];

  if (completeness.score < 70) {
    recommendations.push({
      area: 'completeness',
      priority: 'high',
      message: `Fill missing fields: ${completeness.details.required.missing.join(', ') || completeness.details.important.missing.join(', ')}`,
    });
  }

  if (freshness.status === 'stale' || freshness.status === 'inactive') {
    recommendations.push({
      area: 'freshness',
      priority: freshness.status === 'inactive' ? 'high' : 'medium',
      message: `Lead has been inactive for ${freshness.daysSinceInteraction || 'unknown'} days. Consider re-engagement campaign.`,
    });
  }

  if (accuracy.issues.length > 0) {
    recommendations.push({
      area: 'accuracy',
      priority: 'medium',
      message: `Fix data quality issues: ${accuracy.issues.map(i => `${i.field}: ${i.issue}`).join('; ')}`,
    });
  }

  if (engagement.score < 50) {
    recommendations.push({
      area: 'engagement',
      priority: 'medium',
      message: 'Low engagement. Consider nurture campaign or lead qualification review.',
    });
  }

  if (!scoringAlignment.details.hasScore) {
    recommendations.push({
      area: 'scoring',
      priority: 'low',
      message: 'Lead score not populated. Verify scoring model is active.',
    });
  }

  return {
    leadId: lead.id,
    email: lead.email,
    overallScore,
    qualityTier,
    breakdown: {
      completeness: { score: completeness.score, weight: config.completeness.weight, ...completeness },
      freshness: { score: freshness.score, weight: config.freshness.weight, ...freshness },
      accuracy: { score: accuracy.score, weight: config.accuracy.weight, ...accuracy },
      engagement: { score: engagement.score, weight: config.engagement.weight, ...engagement },
      scoringAlignment: { score: scoringAlignment.score, weight: config.scoringAlignment.weight, ...scoringAlignment },
    },
    recommendations,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Analyze a batch of leads and generate summary statistics
 * @param {Array} leads - Array of leads to analyze
 * @param {Array} activitiesByLead - Map of lead ID to activities (optional)
 * @param {Object} config - Scoring configuration
 * @returns {Object} Batch analysis results
 */
function analyzeBatch(leads, activitiesByLead = {}, config = DEFAULT_CONFIG) {
  const results = [];
  const tierCounts = { Excellent: 0, Good: 0, Fair: 0, Poor: 0 };
  let totalScore = 0;

  for (const lead of leads) {
    const activities = activitiesByLead[lead.id] || [];
    const quality = calculateLeadQuality(lead, activities, config);
    results.push(quality);
    tierCounts[quality.qualityTier]++;
    totalScore += quality.overallScore;
  }

  const averageScore = leads.length > 0 ? Math.round(totalScore / leads.length) : 0;

  return {
    totalLeads: leads.length,
    averageScore,
    tierDistribution: tierCounts,
    tierPercentages: {
      Excellent: leads.length > 0 ? Math.round((tierCounts.Excellent / leads.length) * 100) : 0,
      Good: leads.length > 0 ? Math.round((tierCounts.Good / leads.length) * 100) : 0,
      Fair: leads.length > 0 ? Math.round((tierCounts.Fair / leads.length) * 100) : 0,
      Poor: leads.length > 0 ? Math.round((tierCounts.Poor / leads.length) * 100) : 0,
    },
    results,
    analyzedAt: new Date().toISOString(),
  };
}

module.exports = {
  DEFAULT_CONFIG,
  calculateCompletenessScore,
  calculateFreshnessScore,
  calculateAccuracyScore,
  calculateEngagementScore,
  calculateScoringAlignmentScore,
  calculateLeadQuality,
  analyzeBatch,
};

/**
 * Governance Audit Runner for Marketo
 *
 * Builds a governance report from instance inventory and manual evidence:
 * - Naming convention compliance
 * - Tag coverage on programs
 * - Trigger campaign health
 * - Manual evidence completeness
 *
 * @module governance-audit-runner
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
};

const DEFAULT_THRESHOLDS = {
  namingCompliance: 0.85,
  tagCoverage: 0.9,
  staleTriggerDays: 180,
  activeTriggerWarning: 200,
  activeTriggerCritical: 500,
};

const DEFAULT_NAMING_RULES = {
  program: {
    patterns: [
      '^\\d{4}-Q[1-4] .+ - .+',
      '^Evergreen .+ - .+',
      '^Ops - .+',
    ],
    allowPrefixes: [],
  },
  campaign: {
    patterns: [
      '^\\d{4}-Q[1-4] .+ - .+',
      '^Evergreen .+ - .+',
      '^Ops - .+',
    ],
    allowPrefixes: [],
  },
};

const REQUIRED_MANUAL_EVIDENCE = [
  { key: 'auditTrailExported', label: 'Audit Trail export' },
  { key: 'campaignInspectorReviewed', label: 'Campaign Inspector review' },
  { key: 'notificationsReviewed', label: 'Notifications reviewed' },
  { key: 'communicationLimitsVerified', label: 'Communication limits verified' },
  { key: 'approvalsVerified', label: 'Approval process verified' },
  { key: 'workspaceAccessReviewed', label: 'Workspace access review' },
];

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(dateA, dateB) {
  if (!dateA || !dateB) return null;
  const diffMs = dateB.getTime() - dateA.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function compilePatterns(patterns) {
  return ensureArray(patterns).map(pattern => new RegExp(pattern));
}

function matchesNaming(name, compiled, allowPrefixes) {
  if (!name) return false;
  const trimmed = String(name).trim();
  if (!trimmed) return false;

  const normalized = trimmed.toLowerCase();
  for (const prefix of ensureArray(allowPrefixes)) {
    if (normalized.startsWith(String(prefix).toLowerCase())) {
      return true;
    }
  }

  for (const regex of compiled) {
    if (regex.test(trimmed)) {
      return true;
    }
  }

  return false;
}

function evaluateNaming(items, rules) {
  const compiled = compilePatterns(rules.patterns || []);
  const allowPrefixes = ensureArray(rules.allowPrefixes);

  if (compiled.length === 0 && allowPrefixes.length === 0) {
    return {
      total: items.length,
      compliant: items.length,
      complianceRate: 1,
      noncompliant: [],
    };
  }

  let compliant = 0;
  const noncompliant = [];

  for (const item of ensureArray(items)) {
    const name = item?.name || '';
    if (matchesNaming(name, compiled, allowPrefixes)) {
      compliant += 1;
    } else {
      noncompliant.push({ id: item?.id || null, name });
    }
  }

  const total = items.length;
  const complianceRate = total > 0 ? compliant / total : 1;

  return {
    total,
    compliant,
    complianceRate,
    noncompliant,
  };
}

function normalizeTags(program) {
  const rawTags = program?.tags || program?.tag || program?.programTags || [];
  const tagMap = {};

  if (Array.isArray(rawTags)) {
    for (const tag of rawTags) {
      if (!tag) continue;
      const type = tag.tagType || tag.type || tag.name;
      if (!type) continue;
      tagMap[type] = tag.tagValue || tag.value || tag.displayValue || null;
    }
  } else if (rawTags && typeof rawTags === 'object') {
    for (const [type, value] of Object.entries(rawTags)) {
      tagMap[type] = value;
    }
  }

  return tagMap;
}

function evaluateTagCoverage(programs, requiredTags) {
  const required = ensureArray(requiredTags).filter(Boolean);
  if (required.length === 0) {
    return {
      total: programs.length,
      coverageRate: null,
      missingPrograms: [],
    };
  }

  const missingPrograms = [];

  for (const program of ensureArray(programs)) {
    const tagMap = normalizeTags(program);
    const missing = required.filter(tagType => !tagMap[tagType]);
    if (missing.length > 0) {
      missingPrograms.push({
        id: program?.id || null,
        name: program?.name || '',
        missingTagTypes: missing,
      });
    }
  }

  const total = programs.length;
  const covered = total - missingPrograms.length;
  const coverageRate = total > 0 ? covered / total : 1;

  return {
    total,
    coverageRate,
    missingPrograms,
  };
}

function isTriggerCampaign(campaign) {
  if (!campaign) return false;
  if (campaign.isTriggerable === true) return true;
  if (campaign.triggerable === true) return true;
  if (campaign.triggered === true) return true;
  const type = String(campaign.type || '').toLowerCase();
  return type === 'trigger' || type === 'triggered';
}

function isActiveCampaign(campaign) {
  const status = String(campaign?.status || campaign?.state || '').toLowerCase();
  return status === 'active' || status === 'activated' || status === 'on';
}

function getLastUpdated(campaign) {
  return (
    toDate(campaign?.updatedAt) ||
    toDate(campaign?.updated_at) ||
    toDate(campaign?.lastUpdatedAt) ||
    toDate(campaign?.lastUpdated) ||
    toDate(campaign?.createdAt)
  );
}

function evaluateTriggerHealth(campaigns, thresholds) {
  const triggerCampaigns = ensureArray(campaigns).filter(isTriggerCampaign);
  const activeTriggers = triggerCampaigns.filter(isActiveCampaign);
  const now = new Date();

  const staleActiveTriggers = activeTriggers.filter((campaign) => {
    const lastUpdated = getLastUpdated(campaign);
    const days = daysBetween(lastUpdated, now);
    return days !== null && days >= thresholds.staleTriggerDays;
  });

  return {
    totalCampaigns: campaigns.length,
    triggerCampaigns: triggerCampaigns.length,
    activeTriggers: activeTriggers.length,
    staleActiveTriggers: staleActiveTriggers.map((campaign) => ({
      id: campaign?.id || null,
      name: campaign?.name || '',
      updatedAt: campaign?.updatedAt || campaign?.lastUpdatedAt || null,
    })),
  };
}

function evaluateManualEvidence(manualEvidence = {}) {
  const missing = [];
  const complete = [];

  for (const item of REQUIRED_MANUAL_EVIDENCE) {
    if (manualEvidence[item.key] === true) {
      complete.push(item.label);
    } else {
      missing.push(item.label);
    }
  }

  return { missing, complete };
}

function buildGovernanceReport(instanceData, options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
  const namingRules = {
    program: { ...DEFAULT_NAMING_RULES.program, ...(options.naming?.program || {}) },
    campaign: { ...DEFAULT_NAMING_RULES.campaign, ...(options.naming?.campaign || {}) },
  };
  const requiredTags = ensureArray(options.requiredTags || []);

  const programs = ensureArray(instanceData.programs || []);
  const campaigns = ensureArray(instanceData.campaigns || []);

  const namingPrograms = evaluateNaming(programs, namingRules.program);
  const namingCampaigns = evaluateNaming(campaigns, namingRules.campaign);
  const tagCoverage = evaluateTagCoverage(programs, requiredTags);
  const triggerHealth = evaluateTriggerHealth(campaigns, thresholds);
  const manualEvidence = evaluateManualEvidence(instanceData.manualEvidence || {});
  const manualEvidenceSource = instanceData.manualEvidenceSource || null;

  const issues = [];
  const recommendations = [];

  if (namingPrograms.complianceRate < thresholds.namingCompliance) {
    issues.push({
      id: 'naming-programs',
      severity: SEVERITY.WARNING,
      message: 'Program naming compliance below target',
      details: {
        complianceRate: namingPrograms.complianceRate,
        noncompliantCount: namingPrograms.noncompliant.length,
      },
    });
    recommendations.push('Enforce program naming convention for new and updated programs.');
  }

  if (namingCampaigns.complianceRate < thresholds.namingCompliance) {
    issues.push({
      id: 'naming-campaigns',
      severity: SEVERITY.WARNING,
      message: 'Campaign naming compliance below target',
      details: {
        complianceRate: namingCampaigns.complianceRate,
        noncompliantCount: namingCampaigns.noncompliant.length,
      },
    });
    recommendations.push('Standardize smart campaign naming to match governance convention.');
  }

  if (tagCoverage.coverageRate !== null && tagCoverage.coverageRate < thresholds.tagCoverage) {
    issues.push({
      id: 'tag-coverage',
      severity: SEVERITY.WARNING,
      message: 'Program tag coverage below target',
      details: {
        coverageRate: tagCoverage.coverageRate,
        missingPrograms: tagCoverage.missingPrograms.length,
      },
    });
    recommendations.push('Require program tags and backfill missing tag values.');
  }

  if (triggerHealth.activeTriggers >= thresholds.activeTriggerCritical) {
    issues.push({
      id: 'active-triggers-critical',
      severity: SEVERITY.CRITICAL,
      message: 'Active trigger campaigns exceed critical threshold',
      details: { activeTriggers: triggerHealth.activeTriggers },
    });
    recommendations.push('Reduce active trigger count by consolidating or converting to batch.');
  } else if (triggerHealth.activeTriggers >= thresholds.activeTriggerWarning) {
    issues.push({
      id: 'active-triggers-warning',
      severity: SEVERITY.WARNING,
      message: 'Active trigger campaigns exceed warning threshold',
      details: { activeTriggers: triggerHealth.activeTriggers },
    });
    recommendations.push('Review trigger campaigns for consolidation opportunities.');
  }

  if (triggerHealth.staleActiveTriggers.length > 0) {
    issues.push({
      id: 'stale-triggers',
      severity: SEVERITY.WARNING,
      message: 'Active trigger campaigns appear stale',
      details: { staleTriggers: triggerHealth.staleActiveTriggers.length },
    });
    recommendations.push('Deactivate or review stale trigger campaigns with no recent updates.');
  }

  if (manualEvidence.missing.length > 0) {
    issues.push({
      id: 'manual-evidence',
      severity: SEVERITY.WARNING,
      message: 'Manual evidence incomplete',
      details: { missing: manualEvidence.missing },
    });
    recommendations.push('Complete manual evidence checks for UI-only governance controls.');
  }

  const hasCritical = issues.some(issue => issue.severity === SEVERITY.CRITICAL);
  const hasWarning = issues.some(issue => issue.severity === SEVERITY.WARNING);
  const overallStatus = hasCritical ? 'critical' : (hasWarning ? 'warning' : 'healthy');

  return {
    instanceId: instanceData.instanceId || null,
    instanceName: instanceData.instanceName || null,
    generatedAt: new Date().toISOString(),
    version: '1.0.0',
    overallStatus,
    summary: {
      programCount: programs.length,
      campaignCount: campaigns.length,
      triggerCampaignCount: triggerHealth.triggerCampaigns,
      activeTriggerCount: triggerHealth.activeTriggers,
      namingCompliancePrograms: namingPrograms.complianceRate,
      namingComplianceCampaigns: namingCampaigns.complianceRate,
      tagCoverageRate: tagCoverage.coverageRate,
      manualEvidenceComplete: manualEvidence.missing.length === 0,
    },
    naming: {
      programs: namingPrograms,
      campaigns: namingCampaigns,
    },
    tagCoverage,
    triggerHealth,
    manualEvidence: {
      ...manualEvidence,
      source: manualEvidenceSource,
    },
    issues,
    recommendations: Array.from(new Set(recommendations)),
  };
}

function formatPercent(value) {
  if (value === null || value === undefined) return 'N/A';
  return `${Math.round(value * 100)}%`;
}

function generateGovernanceMarkdown(report) {
  const lines = [
    '# Marketo Governance Audit Report',
    '',
    `**Instance**: ${report.instanceName || report.instanceId || 'Unknown'}`,
    `**Generated**: ${report.generatedAt}`,
    `**Overall Status**: ${report.overallStatus.toUpperCase()}`,
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Programs | ${report.summary.programCount} |`,
    `| Campaigns | ${report.summary.campaignCount} |`,
    `| Trigger Campaigns | ${report.summary.triggerCampaignCount} |`,
    `| Active Triggers | ${report.summary.activeTriggerCount} |`,
    `| Program Naming Compliance | ${formatPercent(report.summary.namingCompliancePrograms)} |`,
    `| Campaign Naming Compliance | ${formatPercent(report.summary.namingComplianceCampaigns)} |`,
    `| Program Tag Coverage | ${formatPercent(report.summary.tagCoverageRate)} |`,
    `| Manual Evidence Complete | ${report.summary.manualEvidenceComplete ? 'Yes' : 'No'} |`,
    '',
  ];

  if (report.issues.length > 0) {
    lines.push('## Issues');
    lines.push('');
    for (const issue of report.issues) {
      lines.push(`- [${issue.severity.toUpperCase()}] ${issue.message}`);
    }
    lines.push('');
  }

  if (report.recommendations.length > 0) {
    lines.push('## Recommendations');
    lines.push('');
    for (const rec of report.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push('');
  }

  if (report.manualEvidence.missing.length > 0) {
    lines.push('## Manual Evidence Gaps');
    lines.push('');
    for (const missing of report.manualEvidence.missing) {
      lines.push(`- ${missing}`);
    }
    lines.push('');
  }

  if (report.manualEvidence?.source) {
    lines.push('## Evidence Source');
    lines.push('');
    lines.push(`Manual evidence: ${report.manualEvidence.source}`);
    lines.push('');
  }

  return lines.join('\n');
}

function saveGovernanceReport(report, baseDir = 'portals') {
  if (!report.instanceId) {
    throw new Error('instanceId is required to save governance report');
  }

  const auditsDir = path.join(baseDir, report.instanceId, 'governance', 'audits');
  if (!fs.existsSync(auditsDir)) {
    fs.mkdirSync(auditsDir, { recursive: true });
  }

  const timestamp = report.generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(auditsDir, `governance-audit-${timestamp}.json`);
  const mdPath = path.join(auditsDir, `governance-audit-${timestamp}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, generateGovernanceMarkdown(report));

  return { jsonPath, mdPath };
}

module.exports = {
  DEFAULT_THRESHOLDS,
  DEFAULT_NAMING_RULES,
  REQUIRED_MANUAL_EVIDENCE,
  buildGovernanceReport,
  generateGovernanceMarkdown,
  saveGovernanceReport,
};

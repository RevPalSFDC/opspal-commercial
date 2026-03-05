/**
 * BLUF+4 Data Extractor
 *
 * Extracts structured BLUF+4 data from audit/assessment output files.
 * Supports JSON and Markdown formats from various auditor agents.
 *
 * Purpose:
 * - Parse audit output files (JSON, Markdown)
 * - Map findings to BLUF+4 sections
 * - Calculate health scores
 * - Identify top risks and recommendations
 *
 * Supported Audit Formats:
 * - sfdc-cpq-assessor output
 * - sfdc-revops-auditor output
 * - sfdc-automation-auditor output
 * - hubspot-workflow-auditor output
 * - Generic audit JSON format
 *
 * @version 1.0.0
 * @date 2025-11-25
 */

const fs = require('fs');
const path = require('path');

// Field mappings for different audit formats
const FIELD_MAPPINGS = {
  // Bottom Line extraction
  bottomLine: {
    fields: [
      'executive_summary',
      'executiveSummary',
      'summary',
      'overall_status',
      'overallStatus',
      'conclusion',
      'headline',
      'bluf'
    ]
  },
  // Health score extraction
  healthScore: {
    fields: [
      'health_score',
      'healthScore',
      'score',
      'overall_score',
      'overallScore',
      'quality_score',
      'qualityScore',
      'rating'
    ]
  },
  // Key findings extraction
  keyFindings: {
    fields: [
      'findings',
      'key_findings',
      'keyFindings',
      'issues',
      'problems',
      'observations',
      'highlights',
      'critical_issues',
      'criticalIssues'
    ]
  },
  // Recommendations extraction
  recommendations: {
    fields: [
      'recommendations',
      'suggested_actions',
      'suggestedActions',
      'next_steps',
      'nextSteps',
      'action_items',
      'actionItems',
      'remediation',
      'improvements'
    ]
  },
  // Risks extraction
  risks: {
    fields: [
      'risks',
      'blockers',
      'obstacles',
      'concerns',
      'threats',
      'impact_if_ignored',
      'impactIfIgnored',
      'critical_risks'
    ]
  },
  // ROI/Impact extraction
  roi: {
    fields: [
      'roi',
      'roi_estimate',
      'roiEstimate',
      'annual_value',
      'annualValue',
      'projected_impact',
      'projectedImpact',
      'business_impact',
      'savings'
    ]
  },
  // Metadata extraction
  metadata: {
    fields: [
      'metadata',
      'report_info',
      'reportInfo',
      'audit_info',
      'auditInfo',
      'context'
    ]
  }
};

// Severity mapping from various formats
const SEVERITY_MAPPINGS = {
  critical: 'CRITICAL',
  high: 'ACTION REQUIRED',
  medium: 'ATTENTION',
  low: 'OPPORTUNITY',
  good: 'ON TRACK',
  excellent: 'ON TRACK',
  poor: 'CRITICAL',
  'at risk': 'ACTION REQUIRED',
  moderate: 'ATTENTION'
};

// Icon mappings for findings
const FINDING_ICONS = {
  critical: '🔴',
  high: '🔴',
  error: '🔴',
  warning: '🟡',
  medium: '🟡',
  caution: '🟡',
  info: '🟢',
  low: '🟢',
  good: '🟢',
  success: '✅',
  default: '•'
};

class BLUFDataExtractor {

  constructor(options = {}) {
    this.verbose = options.verbose || false;
  }

  /**
   * Extract BLUF+4 data from file
   *
   * @param {string} filePath - Path to audit output file
   * @returns {Object} Extracted BLUF+4 data
   */
  async extractFromFile(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, 'utf8');

    if (ext === '.json') {
      const data = JSON.parse(content);
      return this.extractFromJSON(data, filePath);
    } else if (ext === '.md') {
      return this.extractFromMarkdown(content, filePath);
    } else {
      // Try JSON first, fall back to text analysis
      try {
        const data = JSON.parse(content);
        return this.extractFromJSON(data, filePath);
      } catch {
        return this.extractFromMarkdown(content, filePath);
      }
    }
  }

  /**
   * Extract BLUF+4 data from JSON object
   *
   * @param {Object} data - Parsed JSON data
   * @param {string} sourcePath - Source file path for metadata
   * @returns {Object} Extracted BLUF+4 data
   */
  extractFromJSON(data, sourcePath = null) {
    const result = {
      headline: null,
      severity: null,
      recommendation: null,
      roi: null,
      healthScore: null,
      keyFindings: [],
      nextSteps: [],
      risks: [],
      decisions: [],
      approvals: [],
      resources: [],
      metadata: {},
      _extractionSource: 'json',
      _sourcePath: sourcePath
    };

    // Extract bottom line / headline
    const bottomLineData = this._findField(data, FIELD_MAPPINGS.bottomLine.fields);
    if (bottomLineData) {
      if (typeof bottomLineData === 'string') {
        result.headline = this._truncate(bottomLineData, 150);
      } else if (bottomLineData.headline || bottomLineData.summary) {
        result.headline = this._truncate(bottomLineData.headline || bottomLineData.summary, 150);
      }
    }

    // Extract health score
    const healthScoreData = this._findField(data, FIELD_MAPPINGS.healthScore.fields);
    if (healthScoreData !== null) {
      result.healthScore = this._normalizeScore(healthScoreData);
      result.severity = this._scoreToSeverity(result.healthScore);
    }

    // Extract key findings
    const findingsData = this._findField(data, FIELD_MAPPINGS.keyFindings.fields);
    if (findingsData) {
      result.keyFindings = this._extractFindings(findingsData).slice(0, 5);
    }

    // Extract recommendations / next steps
    const recsData = this._findField(data, FIELD_MAPPINGS.recommendations.fields);
    if (recsData) {
      result.nextSteps = this._extractNextSteps(recsData).slice(0, 5);
      // First recommendation becomes the primary recommendation
      if (result.nextSteps.length > 0 && !result.recommendation) {
        result.recommendation = result.nextSteps[0].action;
      }
    }

    // Extract risks
    const risksData = this._findField(data, FIELD_MAPPINGS.risks.fields);
    if (risksData) {
      result.risks = this._extractRisks(risksData).slice(0, 4);
    }

    // Extract ROI
    const roiData = this._findField(data, FIELD_MAPPINGS.roi.fields);
    if (roiData) {
      result.roi = this._formatROI(roiData);
    }

    // Extract metadata
    const metadataData = this._findField(data, FIELD_MAPPINGS.metadata.fields);
    if (metadataData) {
      result.metadata = {
        reportType: metadataData.report_type || metadataData.reportType || metadataData.type,
        org: metadataData.org || metadataData.orgAlias || metadataData.organization,
        date: metadataData.date || metadataData.generated_at || new Date().toISOString().split('T')[0]
      };
    }

    // Fallback headline from severity + first finding
    if (!result.headline && result.keyFindings.length > 0) {
      result.headline = result.keyFindings[0].text;
    }

    return result;
  }

  /**
   * Extract BLUF+4 data from Markdown content
   *
   * @param {string} content - Markdown content
   * @param {string} sourcePath - Source file path for metadata
   * @returns {Object} Extracted BLUF+4 data
   */
  extractFromMarkdown(content, sourcePath = null) {
    const result = {
      headline: null,
      severity: null,
      recommendation: null,
      roi: null,
      healthScore: null,
      keyFindings: [],
      nextSteps: [],
      risks: [],
      decisions: [],
      approvals: [],
      resources: [],
      metadata: {},
      _extractionSource: 'markdown',
      _sourcePath: sourcePath
    };

    // Extract title/headline from first H1 or executive summary section
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) {
      result.headline = this._truncate(h1Match[1], 150);
    }

    // Look for executive summary section
    const execSummaryMatch = content.match(/##\s*Executive\s+Summary[\s\S]*?\n([\s\S]*?)(?=##|$)/i);
    if (execSummaryMatch) {
      const summaryText = execSummaryMatch[1].trim().split('\n')[0];
      if (summaryText && summaryText.length > 10) {
        result.headline = this._truncate(summaryText.replace(/^\*\*|\*\*$/g, ''), 150);
      }
    }

    // Extract health score
    const scoreMatch = content.match(/(?:Health|Quality|Overall)\s*Score[:\s]*(\d+)(?:\/100)?/i);
    if (scoreMatch) {
      result.healthScore = parseInt(scoreMatch[1], 10);
      result.severity = this._scoreToSeverity(result.healthScore);
    }

    // Extract bullet points as findings
    const bulletMatches = content.matchAll(/^[-*]\s+(.+)$/gm);
    const bullets = [...bulletMatches].map(m => m[1]).slice(0, 10);

    // Categorize bullets
    for (const bullet of bullets) {
      const lowerBullet = bullet.toLowerCase();

      if (lowerBullet.includes('recommend') || lowerBullet.includes('should') || lowerBullet.includes('action')) {
        result.nextSteps.push(this._bulletToNextStep(bullet));
      } else if (lowerBullet.includes('risk') || lowerBullet.includes('block') || lowerBullet.includes('concern')) {
        result.risks.push(this._bulletToRisk(bullet));
      } else {
        result.keyFindings.push(this._bulletToFinding(bullet));
      }
    }

    // Limit arrays
    result.keyFindings = result.keyFindings.slice(0, 5);
    result.nextSteps = result.nextSteps.slice(0, 5);
    result.risks = result.risks.slice(0, 4);

    // Extract filename-based metadata
    if (sourcePath) {
      const filename = path.basename(sourcePath, path.extname(sourcePath));
      result.metadata = {
        reportType: this._inferReportType(filename),
        date: new Date().toISOString().split('T')[0]
      };
    }

    return result;
  }

  /**
   * Find most recent audit file in directory
   *
   * @param {string} directory - Directory to search
   * @param {Object} options - Search options
   * @returns {string|null} Path to most recent audit file
   */
  findLatestAuditFile(directory, options = {}) {
    const patterns = options.patterns || [
      '*audit*.json',
      '*assessment*.json',
      '*report*.json',
      '*audit*.md',
      '*assessment*.md'
    ];

    let latestFile = null;
    let latestTime = 0;

    for (const pattern of patterns) {
      const glob = require('glob');
      const files = glob.sync(path.join(directory, '**', pattern));

      for (const file of files) {
        const stat = fs.statSync(file);
        if (stat.mtimeMs > latestTime) {
          latestTime = stat.mtimeMs;
          latestFile = file;
        }
      }
    }

    return latestFile;
  }

  // Private helper methods

  _findField(obj, fieldNames, depth = 3) {
    if (!obj || typeof obj !== 'object' || depth <= 0) return null;

    // Direct field lookup
    for (const field of fieldNames) {
      if (obj[field] !== undefined) {
        return obj[field];
      }
    }

    // Recursive search
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const found = this._findField(obj[key], fieldNames, depth - 1);
        if (found !== null) return found;
      }
    }

    return null;
  }

  _truncate(text, maxLength) {
    if (!text) return '';
    const str = String(text).trim();
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }

  _normalizeScore(score) {
    if (typeof score === 'number') {
      return Math.min(100, Math.max(0, Math.round(score)));
    }
    if (typeof score === 'string') {
      const num = parseFloat(score);
      if (!isNaN(num)) {
        // Handle percentage strings
        if (score.includes('%')) {
          return Math.min(100, Math.max(0, Math.round(num)));
        }
        // Handle 0-1 scale
        if (num <= 1) {
          return Math.round(num * 100);
        }
        return Math.min(100, Math.max(0, Math.round(num)));
      }
    }
    return null;
  }

  _scoreToSeverity(score) {
    if (score === null) return null;
    if (score >= 90) return 'ON TRACK';
    if (score >= 70) return 'OPPORTUNITY';
    if (score >= 50) return 'ATTENTION';
    if (score >= 30) return 'ACTION REQUIRED';
    return 'CRITICAL';
  }

  _extractFindings(data) {
    if (!data) return [];

    const findings = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        findings.push(this._itemToFinding(item));
      }
    } else if (typeof data === 'object') {
      // Handle object with severity keys
      for (const [severity, items] of Object.entries(data)) {
        if (Array.isArray(items)) {
          for (const item of items) {
            findings.push(this._itemToFinding(item, severity));
          }
        }
      }
    }

    return findings;
  }

  _itemToFinding(item, defaultSeverity = 'info') {
    if (typeof item === 'string') {
      return {
        icon: this._getIcon(defaultSeverity),
        text: this._truncate(item, 100),
        metric: null
      };
    }

    const severity = item.severity || item.level || item.type || defaultSeverity;
    const text = item.text || item.message || item.description || item.finding || String(item);
    const metric = item.metric || item.count || item.value;

    return {
      icon: this._getIcon(severity),
      text: this._truncate(text, 100),
      metric: metric ? String(metric) : null
    };
  }

  _bulletToFinding(bullet) {
    // Detect severity from content
    const lowerBullet = bullet.toLowerCase();
    let severity = 'info';

    if (lowerBullet.includes('critical') || lowerBullet.includes('error')) severity = 'critical';
    else if (lowerBullet.includes('warning') || lowerBullet.includes('high')) severity = 'warning';
    else if (lowerBullet.includes('good') || lowerBullet.includes('success')) severity = 'good';

    // Extract metric if present (numbers in parentheses)
    const metricMatch = bullet.match(/\(([^)]+)\)$/);
    const metric = metricMatch ? metricMatch[1] : null;
    const text = metricMatch ? bullet.replace(metricMatch[0], '').trim() : bullet;

    return {
      icon: this._getIcon(severity),
      text: this._truncate(text, 100),
      metric
    };
  }

  _extractNextSteps(data) {
    if (!data) return [];

    const steps = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        steps.push(this._itemToNextStep(item));
      }
    }

    return steps;
  }

  _itemToNextStep(item) {
    if (typeof item === 'string') {
      return {
        action: this._truncate(item, 80),
        owner: null,
        timeline: null
      };
    }

    return {
      action: this._truncate(item.action || item.recommendation || item.text || item.description || String(item), 80),
      owner: item.owner || item.assignee || item.responsible || null,
      timeline: item.timeline || item.due || item.deadline || item.timeframe || null
    };
  }

  _bulletToNextStep(bullet) {
    // Try to extract owner from @mentions
    const ownerMatch = bullet.match(/@(\w+)/);
    const owner = ownerMatch ? ownerMatch[1] : null;

    // Try to extract timeline
    const timelineMatch = bullet.match(/(?:by|within|before|in)\s+([^,.\n]+)/i);
    const timeline = timelineMatch ? timelineMatch[1].trim() : null;

    // Clean action text
    let action = bullet
      .replace(/@\w+/g, '')
      .replace(/(?:by|within|before|in)\s+[^,.\n]+/i, '')
      .trim();

    return {
      action: this._truncate(action, 80),
      owner,
      timeline
    };
  }

  _extractRisks(data) {
    if (!data) return [];

    const risks = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        risks.push(this._itemToRisk(item));
      }
    }

    return risks;
  }

  _itemToRisk(item) {
    if (typeof item === 'string') {
      return {
        icon: '⚠️',
        type: 'MEDIUM',
        description: this._truncate(item, 100),
        mitigation: null
      };
    }

    const severity = (item.severity || item.level || item.type || 'medium').toUpperCase();
    const normalizedType = severity === 'HIGH' || severity === 'CRITICAL' ? severity : 'MEDIUM';

    return {
      icon: this._getRiskIcon(normalizedType),
      type: normalizedType,
      description: this._truncate(item.description || item.risk || item.text || String(item), 100),
      mitigation: item.mitigation ? this._truncate(item.mitigation, 80) : null
    };
  }

  _bulletToRisk(bullet) {
    const lowerBullet = bullet.toLowerCase();
    let type = 'MEDIUM';

    if (lowerBullet.includes('critical') || lowerBullet.includes('blocker')) type = 'CRITICAL';
    else if (lowerBullet.includes('high') || lowerBullet.includes('major')) type = 'HIGH';
    else if (lowerBullet.includes('low') || lowerBullet.includes('minor')) type = 'LOW';

    return {
      icon: this._getRiskIcon(type),
      type,
      description: this._truncate(bullet, 100),
      mitigation: null
    };
  }

  _formatROI(data) {
    if (typeof data === 'string') {
      return this._truncate(data, 100);
    }

    if (typeof data === 'number') {
      return `$${data.toLocaleString()} estimated value`;
    }

    if (typeof data === 'object') {
      const parts = [];
      if (data.value || data.amount) {
        parts.push(`$${(data.value || data.amount).toLocaleString()}`);
      }
      if (data.timeframe) {
        parts.push(data.timeframe);
      }
      if (data.description) {
        parts.push(data.description);
      }
      return this._truncate(parts.join(' '), 100);
    }

    return null;
  }

  _getIcon(severity) {
    const lower = String(severity).toLowerCase();
    return FINDING_ICONS[lower] || FINDING_ICONS.default;
  }

  _getRiskIcon(type) {
    switch (type) {
      case 'CRITICAL': return '🔴';
      case 'HIGH': return '🟡';
      case 'MEDIUM': return '⚠️';
      case 'LOW': return '🟢';
      default: return '⚠️';
    }
  }

  _inferReportType(filename) {
    const lower = filename.toLowerCase();

    if (lower.includes('cpq')) return 'CPQ Assessment';
    if (lower.includes('revops')) return 'RevOps Audit';
    if (lower.includes('automation')) return 'Automation Audit';
    if (lower.includes('workflow')) return 'Workflow Audit';
    if (lower.includes('permission')) return 'Permission Assessment';
    if (lower.includes('architecture')) return 'Architecture Audit';
    if (lower.includes('quality')) return 'Quality Audit';
    if (lower.includes('report')) return 'Reports Audit';

    return 'Assessment';
  }
}

// Static convenience methods
BLUFDataExtractor.extractFromFile = async function(filePath, options = {}) {
  const extractor = new BLUFDataExtractor(options);
  return extractor.extractFromFile(filePath);
};

BLUFDataExtractor.extractFromJSON = function(data, sourcePath = null, options = {}) {
  const extractor = new BLUFDataExtractor(options);
  return extractor.extractFromJSON(data, sourcePath);
};

module.exports = BLUFDataExtractor;

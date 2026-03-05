/**
 * Data Normalizer
 *
 * Transforms raw Marketo bulk export CSV data into normalized JSON structures
 * suitable for Claude analysis.
 *
 * Features:
 * - CSV parsing with header mapping
 * - Activity attribute JSON extraction
 * - Activity type ID to name mapping
 * - Lead/program member schema normalization
 * - Metric aggregation
 *
 * @module data-normalizer
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Activity type mapping (from Marketo API)
 * Extended list of common activity types
 */
const ACTIVITY_TYPES = {
  1: 'Visit Webpage',
  2: 'Fill Out Form',
  3: 'Click Link',
  6: 'Send Email',
  7: 'Delivered Email',
  8: 'Bounced Email',
  9: 'Unsubscribe Email',
  10: 'Open Email',
  11: 'Click Email',
  12: 'New Lead',
  13: 'Change Data Value',
  19: 'Sync Lead to SFDC',
  21: 'Change Score',
  22: 'Change Owner',
  23: 'Remove from List',
  24: 'Add to List',
  25: 'Request Campaign',
  26: 'Sales Email Sent',
  27: 'Received Sales Email',
  34: 'Add to SFDC Campaign',
  37: 'Merge Leads',
  46: 'Interesting Moment',
  100: 'Change Lead Partition',
  101: 'Change Revenue Stage',
  104: 'Change Status in Progression',
  106: 'Enrich with Data.com',
  108: 'Change Segment',
  110: 'Call Webhook',
  111: 'Sent Forward to Friend Email',
  114: 'Add to Nurture',
  115: 'Change Nurture Track',
  116: 'Change Nurture Cadence',
  400: 'Share Content'
};

/**
 * Parse CSV content into array of objects
 */
function parseCSV(csvContent) {
  const lines = csvContent.split('\n');
  if (lines.length < 2) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]);

  // Parse data rows
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const row = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j].trim();
      let value = values[j];

      // Type conversion
      if (value === '' || value === undefined) {
        value = null;
      } else if (value === 'true') {
        value = true;
      } else if (value === 'false') {
        value = false;
      } else if (/^\d+$/.test(value)) {
        value = parseInt(value, 10);
      } else if (/^\d+\.\d+$/.test(value)) {
        value = parseFloat(value);
      }

      row[header] = value;
    }

    data.push(row);
  }

  return data;
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

/**
 * Normalize lead export data
 */
function normalizeLeads(csvContent, metadata = {}) {
  const leads = parseCSV(csvContent);

  // Add derived fields
  const normalizedLeads = leads.map(lead => ({
    ...lead,
    _normalized: {
      fullName: [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim() || null,
      domain: extractDomain(lead.email),
      scoreCategory: categorizeScore(lead.leadScore)
    }
  }));

  // Calculate summary statistics
  const summary = {
    totalLeads: normalizedLeads.length,
    avgScore: calculateAverage(normalizedLeads.map(l => l.leadScore)),
    scoreDistribution: countByCategory(normalizedLeads, l => l._normalized.scoreCategory),
    topDomains: getTopItems(normalizedLeads, l => l._normalized.domain, 10),
    fieldsPresent: Object.keys(leads[0] || {}),
    nullCounts: countNullFields(leads)
  };

  return {
    exportId: metadata.exportId,
    exportDate: metadata.exportDate || new Date().toISOString(),
    recordCount: normalizedLeads.length,
    leads: normalizedLeads,
    summary
  };
}

/**
 * Normalize activity export data
 */
function normalizeActivities(csvContent, metadata = {}) {
  const activities = parseCSV(csvContent);

  // Parse JSON attributes and map activity types
  const normalizedActivities = activities.map(activity => {
    let attributes = {};

    if (activity.attributes) {
      try {
        // Handle both JSON string and already-parsed object
        attributes = typeof activity.attributes === 'string'
          ? JSON.parse(activity.attributes)
          : activity.attributes;
      } catch (e) {
        // Keep as string if parsing fails
        attributes = { raw: activity.attributes };
      }
    }

    return {
      guid: activity.marketoGUID,
      activityDate: activity.activityDate,
      activityType: {
        id: activity.activityTypeId,
        name: ACTIVITY_TYPES[activity.activityTypeId] || `Unknown (${activity.activityTypeId})`
      },
      leadId: activity.leadId,
      primaryAttribute: activity.primaryAttributeValue,
      attributes
    };
  });

  // Calculate summary statistics
  const summary = calculateActivitySummary(normalizedActivities);

  return {
    exportId: metadata.exportId,
    exportDate: metadata.exportDate || new Date().toISOString(),
    dateRange: metadata.dateRange,
    recordCount: normalizedActivities.length,
    activities: normalizedActivities,
    summary
  };
}

/**
 * Calculate activity summary statistics
 */
function calculateActivitySummary(activities) {
  // Count by type
  const byType = {};
  for (const act of activities) {
    const typeName = act.activityType.name;
    byType[typeName] = (byType[typeName] || 0) + 1;
  }

  // Count by hour
  const byHour = {};
  for (const act of activities) {
    if (act.activityDate) {
      const hour = new Date(act.activityDate).getUTCHours().toString().padStart(2, '0');
      byHour[hour] = (byHour[hour] || 0) + 1;
    }
  }

  // Count by day of week
  const byDayOfWeek = {};
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  for (const act of activities) {
    if (act.activityDate) {
      const day = dayNames[new Date(act.activityDate).getUTCDay()];
      byDayOfWeek[day] = (byDayOfWeek[day] || 0) + 1;
    }
  }

  // Calculate engagement rates
  const sends = byType['Send Email'] || 0;
  const delivered = byType['Delivered Email'] || 0;
  const opens = byType['Open Email'] || 0;
  const clicks = byType['Click Email'] || 0;
  const bounces = byType['Bounced Email'] || 0;
  const unsubscribes = byType['Unsubscribe Email'] || 0;

  const baseForRates = delivered > 0 ? delivered : sends;

  return {
    totalActivities: activities.length,
    byType,
    byHour,
    byDayOfWeek,
    engagementRate: {
      deliveryRate: sends > 0 ? ((delivered / sends) * 100).toFixed(1) : '0.0',
      openRate: baseForRates > 0 ? ((opens / baseForRates) * 100).toFixed(1) : '0.0',
      clickRate: baseForRates > 0 ? ((clicks / baseForRates) * 100).toFixed(1) : '0.0',
      clickToOpenRate: opens > 0 ? ((clicks / opens) * 100).toFixed(1) : '0.0',
      bounceRate: sends > 0 ? ((bounces / sends) * 100).toFixed(1) : '0.0',
      unsubscribeRate: baseForRates > 0 ? ((unsubscribes / baseForRates) * 100).toFixed(1) : '0.0'
    },
    uniqueLeads: new Set(activities.map(a => a.leadId)).size
  };
}

/**
 * Normalize program member export data
 */
function normalizeProgramMembers(csvContent, metadata = {}) {
  const members = parseCSV(csvContent);

  const normalizedMembers = members.map(member => ({
    leadId: member.leadId,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    membershipDate: member.membershipDate,
    status: {
      name: member.statusName,
      isSuccess: member.reachedSuccess === true || member.reachedSuccess === 'true'
    },
    progressionStatus: member.progressionStatus,
    acquiredBy: member.acquiredBy,
    nurtureCadence: member.nurtureCadence
  }));

  // Calculate summary
  const byStatus = countByCategory(normalizedMembers, m => m.status.name);
  const successCount = normalizedMembers.filter(m => m.status.isSuccess).length;

  const summary = {
    totalMembers: normalizedMembers.length,
    byStatus,
    successCount,
    successRate: normalizedMembers.length > 0
      ? ((successCount / normalizedMembers.length) * 100).toFixed(1)
      : '0.0',
    uniqueDomains: new Set(normalizedMembers.map(m => extractDomain(m.email)).filter(Boolean)).size
  };

  return {
    exportId: metadata.exportId,
    exportDate: metadata.exportDate || new Date().toISOString(),
    programId: metadata.programId,
    programName: metadata.programName,
    recordCount: normalizedMembers.length,
    members: normalizedMembers,
    summary
  };
}

// Helper functions

function extractDomain(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return null;
  return email.split('@')[1].toLowerCase();
}

function categorizeScore(score) {
  if (score == null || isNaN(score)) return 'unknown';
  if (score < 30) return 'cold';
  if (score < 70) return 'warm';
  return 'hot';
}

function calculateAverage(values) {
  const valid = values.filter(v => v != null && !isNaN(v));
  if (valid.length === 0) return null;
  return (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1);
}

function countByCategory(items, categoryFn) {
  const counts = {};
  for (const item of items) {
    const category = categoryFn(item);
    if (category != null) {
      counts[category] = (counts[category] || 0) + 1;
    }
  }
  return counts;
}

function getTopItems(items, valueFn, limit) {
  const counts = {};
  for (const item of items) {
    const value = valueFn(item);
    if (value) {
      counts[value] = (counts[value] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function countNullFields(items) {
  if (items.length === 0) return {};

  const nullCounts = {};
  const fields = Object.keys(items[0]);

  for (const field of fields) {
    nullCounts[field] = items.filter(item => item[field] == null).length;
  }

  return nullCounts;
}

/**
 * Load and normalize a CSV file
 */
async function normalizeFile(filePath, type, metadata = {}) {
  const content = await fs.readFile(filePath, 'utf8');

  switch (type) {
    case 'leads':
      return normalizeLeads(content, metadata);
    case 'activities':
      return normalizeActivities(content, metadata);
    case 'programMembers':
      return normalizeProgramMembers(content, metadata);
    default:
      throw new Error(`Unknown export type: ${type}`);
  }
}

/**
 * Save normalized data to JSON
 */
async function saveNormalized(data, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
  return { path: outputPath, size: JSON.stringify(data).length };
}

module.exports = {
  parseCSV,
  normalizeLeads,
  normalizeActivities,
  normalizeProgramMembers,
  calculateActivitySummary,
  normalizeFile,
  saveNormalized,
  ACTIVITY_TYPES,
  // Export helpers for testing
  extractDomain,
  categorizeScore,
  calculateAverage
};

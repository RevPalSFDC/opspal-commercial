#!/usr/bin/env node

/**
 * HubSpot History Date Filter
 *
 * Filters property history data by date range. Since HubSpot's API doesn't
 * support server-side date filtering for property history, this module
 * provides client-side filtering after extraction.
 *
 * @module hubspot-history-date-filter
 * @version 1.0.0
 * @created 2026-01-26
 * @reflection 85e4af9e - acme-corp P2 data-quality issue
 */

/**
 * Filter property history entries by date range
 *
 * @param {Object} propertiesWithHistory - Property history object from HubSpot API
 * @param {string|Date} startDate - Start of date range (inclusive)
 * @param {string|Date} endDate - End of date range (inclusive)
 * @returns {Object} Filtered property history
 *
 * @example
 * const filtered = filterHistoryByDateRange(contact.propertiesWithHistory, '2025-09-01', '2026-01-26');
 */
function filterHistoryByDateRange(propertiesWithHistory, startDate, endDate) {
  if (!propertiesWithHistory || typeof propertiesWithHistory !== 'object') {
    return {};
  }

  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();

  if (isNaN(startMs) || isNaN(endMs)) {
    throw new Error('Invalid date format. Use ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)');
  }

  // Set end date to end of day if only date provided
  const adjustedEndMs = endDate.toString().includes('T') ? endMs : endMs + 86400000 - 1;

  const filtered = {};

  for (const [property, history] of Object.entries(propertiesWithHistory)) {
    if (!Array.isArray(history)) {
      continue;
    }

    filtered[property] = history.filter(change => {
      if (!change.timestamp) {
        return false;
      }
      const changeTs = new Date(change.timestamp).getTime();
      return changeTs >= startMs && changeTs <= adjustedEndMs;
    });
  }

  return filtered;
}

/**
 * Extract history from contacts/records within a date range
 *
 * @param {Array} records - Array of HubSpot records with propertiesWithHistory
 * @param {Array<string>} properties - Properties to extract history for
 * @param {Object} dateRange - Date range filter
 * @param {string|Date} dateRange.start - Start date
 * @param {string|Date} dateRange.end - End date
 * @returns {Array} Filtered records with only history in range
 *
 * @example
 * const filtered = extractHistoryInRange(contacts, ['lifecyclestage'], {
 *   start: '2025-09-01',
 *   end: '2026-01-26'
 * });
 */
function extractHistoryInRange(records, properties, dateRange) {
  if (!Array.isArray(records)) {
    throw new Error('records must be an array');
  }

  if (!dateRange || !dateRange.start || !dateRange.end) {
    throw new Error('dateRange must include start and end dates');
  }

  return records.map(record => {
    const filteredHistory = filterHistoryByDateRange(
      record.propertiesWithHistory,
      dateRange.start,
      dateRange.end
    );

    // Only include requested properties
    const requestedHistory = {};
    for (const prop of properties) {
      if (filteredHistory[prop]) {
        requestedHistory[prop] = filteredHistory[prop];
      }
    }

    return {
      id: record.id,
      email: record.properties?.email,
      firstname: record.properties?.firstname,
      lastname: record.properties?.lastname,
      propertiesWithHistory: requestedHistory,
      _meta: {
        originalHistoryCount: countHistoryEntries(record.propertiesWithHistory),
        filteredHistoryCount: countHistoryEntries(requestedHistory),
        dateRange
      }
    };
  }).filter(record => {
    // Only include records that have history entries in the range
    return Object.values(record.propertiesWithHistory).some(h => h.length > 0);
  });
}

/**
 * Count total history entries across all properties
 * @private
 */
function countHistoryEntries(propertiesWithHistory) {
  if (!propertiesWithHistory) return 0;
  return Object.values(propertiesWithHistory)
    .reduce((sum, history) => sum + (Array.isArray(history) ? history.length : 0), 0);
}

/**
 * Get date range statistics from property history
 *
 * @param {Object} propertiesWithHistory - Property history object
 * @returns {Object} Statistics including earliest/latest dates
 */
function getHistoryDateStats(propertiesWithHistory) {
  if (!propertiesWithHistory || typeof propertiesWithHistory !== 'object') {
    return { earliest: null, latest: null, count: 0 };
  }

  let earliest = null;
  let latest = null;
  let count = 0;

  for (const history of Object.values(propertiesWithHistory)) {
    if (!Array.isArray(history)) continue;

    for (const change of history) {
      if (!change.timestamp) continue;

      const ts = new Date(change.timestamp);
      count++;

      if (!earliest || ts < earliest) {
        earliest = ts;
      }
      if (!latest || ts > latest) {
        latest = ts;
      }
    }
  }

  return {
    earliest: earliest ? earliest.toISOString() : null,
    latest: latest ? latest.toISOString() : null,
    count,
    rangeInDays: earliest && latest
      ? Math.ceil((latest - earliest) / (1000 * 60 * 60 * 24))
      : 0
  };
}

/**
 * Group history entries by time period (day, week, month)
 *
 * @param {Array} historyEntries - Array of history changes
 * @param {string} period - Grouping period: 'day', 'week', 'month', 'quarter', 'year'
 * @returns {Object} Grouped history by period key
 */
function groupHistoryByPeriod(historyEntries, period = 'month') {
  if (!Array.isArray(historyEntries)) {
    return {};
  }

  const grouped = {};

  for (const change of historyEntries) {
    if (!change.timestamp) continue;

    const date = new Date(change.timestamp);
    let key;

    switch (period) {
      case 'day':
        key = date.toISOString().split('T')[0];
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = `${weekStart.toISOString().split('T')[0]}_week`;
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      case 'quarter':
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        key = `${date.getFullYear()}-Q${quarter}`;
        break;
      case 'year':
        key = String(date.getFullYear());
        break;
      default:
        key = date.toISOString().split('T')[0];
    }

    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(change);
  }

  return grouped;
}

/**
 * Summarize lifecycle stage transitions within a date range
 *
 * @param {Array} records - Records with lifecyclestage history
 * @param {Object} dateRange - Date range filter
 * @returns {Object} Transition summary with counts
 */
function summarizeLifecycleTransitions(records, dateRange) {
  const filtered = extractHistoryInRange(records, ['lifecyclestage'], dateRange);

  const transitions = {};
  let totalTransitions = 0;

  for (const record of filtered) {
    const history = record.propertiesWithHistory?.lifecyclestage || [];

    // Sort by timestamp
    const sorted = [...history].sort((a, b) =>
      new Date(a.timestamp) - new Date(b.timestamp)
    );

    for (let i = 1; i < sorted.length; i++) {
      const from = sorted[i - 1].value || 'unknown';
      const to = sorted[i].value || 'unknown';
      const key = `${from} → ${to}`;

      if (!transitions[key]) {
        transitions[key] = {
          from,
          to,
          count: 0,
          records: []
        };
      }
      transitions[key].count++;
      transitions[key].records.push(record.id);
      totalTransitions++;
    }
  }

  // Sort by count descending
  const sortedTransitions = Object.values(transitions)
    .sort((a, b) => b.count - a.count);

  return {
    dateRange,
    totalRecords: filtered.length,
    totalTransitions,
    transitions: sortedTransitions,
    topTransitions: sortedTransitions.slice(0, 10)
  };
}

/**
 * Create a pre-configured filter for a specific date range
 *
 * @param {string|Date} startDate - Start date
 * @param {string|Date} endDate - End date
 * @returns {Object} Filter object with bound methods
 */
function createDateRangeFilter(startDate, endDate) {
  const range = { start: startDate, end: endDate };

  return {
    range,
    filterHistory: (history) => filterHistoryByDateRange(history, startDate, endDate),
    extractFromRecords: (records, properties) =>
      extractHistoryInRange(records, properties, range),
    summarizeLifecycle: (records) =>
      summarizeLifecycleTransitions(records, range)
  };
}

// Export all functions
module.exports = {
  filterHistoryByDateRange,
  extractHistoryInRange,
  getHistoryDateStats,
  groupHistoryByPeriod,
  summarizeLifecycleTransitions,
  createDateRangeFilter
};

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node hubspot-history-date-filter.js <input-file> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --start <date>      Start date (YYYY-MM-DD)');
    console.log('  --end <date>        End date (YYYY-MM-DD)');
    console.log('  --properties <list> Comma-separated property names');
    console.log('  --output <file>     Output file path');
    console.log('  --stats             Show date range statistics only');
    console.log('  --summary           Show lifecycle transition summary');
    console.log('');
    console.log('Examples:');
    console.log('  node hubspot-history-date-filter.js contacts.json --start 2025-09-01 --end 2026-01-26');
    console.log('  node hubspot-history-date-filter.js contacts.json --stats');
    console.log('  node hubspot-history-date-filter.js contacts.json --summary --start 2025-09-01 --end 2026-01-26');
    process.exit(1);
  }

  const fs = require('fs');
  const inputFile = args[0];
  const startIndex = args.indexOf('--start');
  const endIndex = args.indexOf('--end');
  const propsIndex = args.indexOf('--properties');
  const outputIndex = args.indexOf('--output');
  const showStats = args.includes('--stats');
  const showSummary = args.includes('--summary');

  const startDate = startIndex >= 0 ? args[startIndex + 1] : null;
  const endDate = endIndex >= 0 ? args[endIndex + 1] : null;
  const properties = propsIndex >= 0
    ? args[propsIndex + 1].split(',').map(p => p.trim())
    : ['lifecyclestage'];
  const outputFile = outputIndex >= 0 ? args[outputIndex + 1] : null;

  try {
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    const records = Array.isArray(data) ? data : (data.results || data.contacts || [data]);

    if (showStats) {
      console.log('=== Date Range Statistics ===\n');
      for (const record of records.slice(0, 5)) {
        const stats = getHistoryDateStats(record.propertiesWithHistory);
        console.log(`Record ${record.id}:`);
        console.log(`  Earliest: ${stats.earliest}`);
        console.log(`  Latest: ${stats.latest}`);
        console.log(`  Total changes: ${stats.count}`);
        console.log(`  Range: ${stats.rangeInDays} days`);
        console.log('');
      }

      // Aggregate stats
      const allHistory = {};
      for (const record of records) {
        if (record.propertiesWithHistory) {
          for (const [prop, history] of Object.entries(record.propertiesWithHistory)) {
            if (!allHistory[prop]) allHistory[prop] = [];
            allHistory[prop].push(...(history || []));
          }
        }
      }
      const totalStats = getHistoryDateStats(allHistory);
      console.log('=== Aggregate Statistics ===');
      console.log(`Total records: ${records.length}`);
      console.log(`Date range: ${totalStats.earliest} to ${totalStats.latest}`);
      console.log(`Total history entries: ${totalStats.count}`);
      console.log(`Range: ${totalStats.rangeInDays} days`);
      process.exit(0);
    }

    if (!startDate || !endDate) {
      console.error('Error: --start and --end dates are required for filtering');
      process.exit(1);
    }

    if (showSummary) {
      const summary = summarizeLifecycleTransitions(records, { start: startDate, end: endDate });
      console.log('=== Lifecycle Transition Summary ===\n');
      console.log(`Date Range: ${startDate} to ${endDate}`);
      console.log(`Records with transitions: ${summary.totalRecords}`);
      console.log(`Total transitions: ${summary.totalTransitions}`);
      console.log('\nTop Transitions:');
      for (const t of summary.topTransitions) {
        console.log(`  ${t.from} → ${t.to}: ${t.count}`);
      }
      process.exit(0);
    }

    const filtered = extractHistoryInRange(records, properties, {
      start: startDate,
      end: endDate
    });

    console.log(`Filtered ${records.length} records to ${filtered.length} with history in range`);
    console.log(`Date range: ${startDate} to ${endDate}`);
    console.log(`Properties: ${properties.join(', ')}`);

    if (outputFile) {
      fs.writeFileSync(outputFile, JSON.stringify(filtered, null, 2));
      console.log(`Output written to: ${outputFile}`);
    } else {
      console.log('\nSample output (first 3 records):');
      console.log(JSON.stringify(filtered.slice(0, 3), null, 2));
    }

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

#!/usr/bin/env node

/**
 * Date Filter Consistency Validator
 *
 * Validates that reports on the same dashboard use consistent date filter types.
 * Reports configured with different date range filters (e.g., THIS_FISCAL_YEAR vs
 * LAST_AND_THIS_FISCAL_QUARTER) are non-comparable when placed on the same dashboard.
 *
 * Filter Families:
 * - fiscal: THIS_FISCAL_YEAR, LAST_FISCAL_YEAR, THIS_FISCAL_QUARTER, etc.
 * - calendar: THIS_YEAR, LAST_YEAR, THIS_QUARTER, LAST_QUARTER, etc.
 * - relative: LAST_N_DAYS, NEXT_N_DAYS, LAST_90_DAYS, etc.
 * - custom: Custom date ranges
 *
 * @module date-filter-consistency-validator
 * @version 1.0.0
 */

/**
 * Filter family classifications
 */
const FILTER_FAMILIES = {
  fiscal: [
    'THIS_FISCAL_YEAR',
    'LAST_FISCAL_YEAR',
    'NEXT_FISCAL_YEAR',
    'THIS_FISCAL_QUARTER',
    'LAST_FISCAL_QUARTER',
    'NEXT_FISCAL_QUARTER',
    'LAST_AND_THIS_FISCAL_QUARTER',
    'LAST_AND_THIS_FISCAL_YEAR',
    'FISCAL_YEAR',
    'FISCAL_QUARTER'
  ],
  calendar: [
    'THIS_YEAR',
    'LAST_YEAR',
    'NEXT_YEAR',
    'THIS_QUARTER',
    'LAST_QUARTER',
    'NEXT_QUARTER',
    'THIS_MONTH',
    'LAST_MONTH',
    'NEXT_MONTH',
    'THIS_WEEK',
    'LAST_WEEK',
    'NEXT_WEEK',
    'TODAY',
    'YESTERDAY',
    'TOMORROW'
  ],
  relative: [
    'LAST_N_DAYS',
    'NEXT_N_DAYS',
    'LAST_90_DAYS',
    'NEXT_90_DAYS',
    'LAST_30_DAYS',
    'LAST_7_DAYS',
    'LAST_60_DAYS',
    'LAST_120_DAYS',
    'N_DAYS_AGO',
    'N_WEEKS_AGO',
    'N_MONTHS_AGO',
    'N_QUARTERS_AGO',
    'N_YEARS_AGO'
  ],
  custom: [
    'CUSTOM'
  ]
};

/**
 * Human-readable descriptions for each filter family
 */
const FAMILY_DESCRIPTIONS = {
  fiscal: 'Fiscal period filters (aligned with fiscal calendar)',
  calendar: 'Calendar period filters (aligned with standard calendar)',
  relative: 'Relative date filters (rolling windows like last 90 days)',
  custom: 'Custom date ranges (specific start/end dates)'
};

/**
 * Compatibility rules between filter families
 * Some families can be used together on a dashboard, others cannot
 */
const FAMILY_COMPATIBILITY = {
  fiscal: {
    fiscal: true,
    calendar: false,  // Fiscal and calendar are incompatible
    relative: true,   // Fiscal and relative can work together
    custom: true
  },
  calendar: {
    fiscal: false,    // Calendar and fiscal are incompatible
    calendar: true,
    relative: true,   // Calendar and relative can work together
    custom: true
  },
  relative: {
    fiscal: true,
    calendar: true,
    relative: true,
    custom: true
  },
  custom: {
    fiscal: true,
    calendar: true,
    relative: true,
    custom: true
  }
};

/**
 * Date Filter Consistency Validator class
 */
class DateFilterConsistencyValidator {
  /**
   * Classify a filter value into a filter family
   *
   * @param {string} filterValue - The date filter value (e.g., "THIS_FISCAL_YEAR")
   * @returns {Object} Classification result with family and normalized value
   */
  static classifyFilter(filterValue) {
    if (!filterValue) {
      return { family: 'unknown', value: filterValue, normalized: null };
    }

    // Normalize the filter value
    let normalized = filterValue.toUpperCase().trim();

    // Handle parameterized filters like LAST_N_DAYS:30
    const paramMatch = normalized.match(/^(LAST_N_DAYS|NEXT_N_DAYS|N_DAYS_AGO|N_WEEKS_AGO|N_MONTHS_AGO|N_QUARTERS_AGO|N_YEARS_AGO)[:\s]*(\d+)?$/);
    if (paramMatch) {
      normalized = paramMatch[1];
    }

    // Find the family
    for (const [family, filters] of Object.entries(FILTER_FAMILIES)) {
      if (filters.includes(normalized)) {
        return {
          family,
          value: filterValue,
          normalized,
          description: FAMILY_DESCRIPTIONS[family]
        };
      }
    }

    // Check for partial matches (for filters we might have missed)
    if (normalized.includes('FISCAL')) {
      return {
        family: 'fiscal',
        value: filterValue,
        normalized,
        description: FAMILY_DESCRIPTIONS.fiscal,
        inferred: true
      };
    }

    if (normalized.includes('_N_') || normalized.match(/LAST_\d+|NEXT_\d+/)) {
      return {
        family: 'relative',
        value: filterValue,
        normalized,
        description: FAMILY_DESCRIPTIONS.relative,
        inferred: true
      };
    }

    // Default to unknown
    return {
      family: 'unknown',
      value: filterValue,
      normalized,
      description: 'Unknown filter type'
    };
  }

  /**
   * Extract date filters from a report specification
   *
   * @param {Object} report - Report specification or metadata
   * @returns {Object[]} Array of date filter objects with classifications
   */
  static extractDateFilters(report) {
    const filters = [];

    // Check various filter locations in report metadata
    const filterSources = [
      report.reportFilters,
      report.filters,
      report.dateFilter ? [report.dateFilter] : null,
      report.standardDateFilter ? [{ value: report.standardDateFilter }] : null
    ];

    for (const source of filterSources) {
      if (!Array.isArray(source)) continue;

      for (const filter of source) {
        // Check if this is a date filter
        const isDateFilter =
          filter.type === 'date' ||
          filter.filterType === 'date' ||
          filter.column?.toLowerCase().includes('date') ||
          filter.field?.toLowerCase().includes('date') ||
          filter.value?.includes('THIS_') ||
          filter.value?.includes('LAST_') ||
          filter.value?.includes('NEXT_') ||
          filter.value?.includes('FISCAL');

        if (isDateFilter && filter.value) {
          const classification = this.classifyFilter(filter.value);
          filters.push({
            ...classification,
            field: filter.column || filter.field,
            original: filter
          });
        }
      }
    }

    // Also check for standard date filter on the report
    if (report.standardDateFilter) {
      const classification = this.classifyFilter(report.standardDateFilter);
      filters.push({
        ...classification,
        field: 'StandardDateFilter',
        original: { value: report.standardDateFilter }
      });
    }

    return filters;
  }

  /**
   * Check for filter mixing issues within a single report
   *
   * @param {Object} report - Report specification
   * @returns {Object} Check result with any issues found
   */
  static checkFilterMixing(report) {
    const filters = this.extractDateFilters(report);

    if (filters.length === 0) {
      return {
        status: 'passed',
        message: 'No date filters found',
        filters: [],
        issues: []
      };
    }

    // Count families
    const familyCounts = {};
    filters.forEach(f => {
      familyCounts[f.family] = (familyCounts[f.family] || 0) + 1;
    });

    const families = Object.keys(familyCounts).filter(f => f !== 'unknown');
    const issues = [];

    // Check for fiscal/calendar mixing
    if (familyCounts.fiscal && familyCounts.calendar) {
      issues.push({
        type: 'family_mixing',
        severity: 'warning',
        message: 'Report mixes fiscal and calendar date filters, which may cause comparison issues',
        fiscalFilters: filters.filter(f => f.family === 'fiscal').map(f => f.value),
        calendarFilters: filters.filter(f => f.family === 'calendar').map(f => f.value),
        recommendation: 'Use either all fiscal or all calendar filters within a single report'
      });
    }

    return {
      status: issues.length > 0 ? 'warning' : 'passed',
      message: issues.length > 0
        ? `Found ${issues.length} filter mixing issue(s)`
        : 'Date filter usage is consistent',
      filters,
      families,
      familyCounts,
      issues
    };
  }

  /**
   * Validate date filter consistency across reports on a dashboard
   *
   * @param {Object} dashboardSpec - Dashboard specification with component reports
   * @param {Object[]} reports - Array of report specifications/metadata
   * @returns {Object} Validation result
   */
  static validateDashboardConsistency(dashboardSpec, reports) {
    const result = {
      status: 'passed',
      message: '',
      blocking_errors: 0,
      warnings: 0,
      details: {
        filterFamilies: {},
        incompatiblePairs: [],
        recommendations: [],
        reportAnalysis: []
      }
    };

    if (!reports || reports.length === 0) {
      result.message = 'No reports to validate';
      return result;
    }

    // Analyze each report
    const reportAnalyses = reports.map(report => {
      const reportName = report.name || report.title || report.developerName || 'Unnamed Report';
      const filters = this.extractDateFilters(report);
      const families = [...new Set(filters.map(f => f.family).filter(f => f !== 'unknown'))];

      return {
        reportName,
        filters,
        families,
        primaryFamily: families[0] || 'none'
      };
    });

    result.details.reportAnalysis = reportAnalyses;

    // Build family map
    const familyMap = {};
    reportAnalyses.forEach(analysis => {
      analysis.families.forEach(family => {
        if (!familyMap[family]) {
          familyMap[family] = [];
        }
        familyMap[family].push(analysis.reportName);
      });
    });
    result.details.filterFamilies = familyMap;

    // Find incompatible pairs
    const incompatiblePairs = [];
    const families = Object.keys(familyMap);

    for (let i = 0; i < families.length; i++) {
      for (let j = i + 1; j < families.length; j++) {
        const family1 = families[i];
        const family2 = families[j];

        if (!FAMILY_COMPATIBILITY[family1]?.[family2]) {
          incompatiblePairs.push({
            family1,
            family2,
            reports1: familyMap[family1],
            reports2: familyMap[family2],
            message: `${family1} filters (${familyMap[family1].join(', ')}) are incompatible with ${family2} filters (${familyMap[family2].join(', ')})`
          });
        }
      }
    }

    result.details.incompatiblePairs = incompatiblePairs;

    // Generate recommendations
    if (incompatiblePairs.length > 0) {
      result.status = 'blocked';
      result.blocking_errors = incompatiblePairs.length;
      result.message = `Dashboard has ${incompatiblePairs.length} incompatible date filter combination(s)`;

      // Recommend standardization
      const dominantFamily = Object.entries(familyMap)
        .sort((a, b) => b[1].length - a[1].length)[0];

      if (dominantFamily) {
        result.details.recommendations.push({
          type: 'standardize',
          message: `Standardize all reports to use ${dominantFamily[0]} date filters`,
          targetFamily: dominantFamily[0],
          currentDistribution: familyMap
        });

        // List reports that need updating
        incompatiblePairs.forEach(pair => {
          const reportsToUpdate = pair.family1 === dominantFamily[0]
            ? pair.reports2
            : pair.reports1;
          const targetFamily = dominantFamily[0];

          result.details.recommendations.push({
            type: 'update_reports',
            message: `Update these reports to use ${targetFamily} filters: ${reportsToUpdate.join(', ')}`,
            reports: reportsToUpdate,
            currentFamily: pair.family1 === dominantFamily[0] ? pair.family2 : pair.family1,
            targetFamily
          });
        });
      }
    } else if (families.length > 1) {
      // Compatible but different families - warn
      result.status = 'warning';
      result.warnings = 1;
      result.message = `Dashboard uses multiple filter families (${families.join(', ')}) - consider standardizing for consistency`;

      result.details.recommendations.push({
        type: 'consider_standardize',
        message: 'While these filter families are compatible, standardizing would improve user experience',
        currentFamilies: families
      });
    } else {
      result.message = 'All dashboard reports use consistent date filter families';
    }

    return result;
  }

  /**
   * Suggest standardization approach for a set of reports
   *
   * @param {Object[]} reports - Array of report specifications
   * @returns {Object} Standardization suggestions
   */
  static suggestStandardization(reports) {
    const analyses = reports.map(report => {
      const reportName = report.name || report.title || 'Unnamed';
      const filters = this.extractDateFilters(report);
      return { reportName, filters };
    });

    // Count filter families across all reports
    const familyCounts = {};
    analyses.forEach(a => {
      a.filters.forEach(f => {
        familyCounts[f.family] = (familyCounts[f.family] || 0) + 1;
      });
    });

    // Determine recommended family
    const sortedFamilies = Object.entries(familyCounts)
      .filter(([family]) => family !== 'unknown')
      .sort((a, b) => b[1] - a[1]);

    const recommendedFamily = sortedFamilies[0]?.[0] || 'fiscal';

    // Map each filter to a recommended replacement
    const filterMappings = {
      // Calendar to Fiscal
      'THIS_YEAR': 'THIS_FISCAL_YEAR',
      'LAST_YEAR': 'LAST_FISCAL_YEAR',
      'THIS_QUARTER': 'THIS_FISCAL_QUARTER',
      'LAST_QUARTER': 'LAST_FISCAL_QUARTER',
      // Fiscal to Calendar
      'THIS_FISCAL_YEAR': 'THIS_YEAR',
      'LAST_FISCAL_YEAR': 'LAST_YEAR',
      'THIS_FISCAL_QUARTER': 'THIS_QUARTER',
      'LAST_FISCAL_QUARTER': 'LAST_QUARTER'
    };

    const suggestions = [];
    analyses.forEach(analysis => {
      analysis.filters.forEach(filter => {
        if (filter.family !== recommendedFamily && filter.family !== 'unknown') {
          const mapping = recommendedFamily === 'fiscal'
            ? filterMappings[filter.normalized]
            : filterMappings[filter.normalized];

          suggestions.push({
            report: analysis.reportName,
            currentFilter: filter.value,
            currentFamily: filter.family,
            suggestedFilter: mapping || `[Convert to ${recommendedFamily}]`,
            targetFamily: recommendedFamily
          });
        }
      });
    });

    return {
      recommendedFamily,
      familyDescription: FAMILY_DESCRIPTIONS[recommendedFamily],
      currentDistribution: familyCounts,
      suggestions,
      effort: suggestions.length === 0 ? 'none' : suggestions.length <= 3 ? 'low' : 'medium'
    };
  }
}

// Export filter families for use by other modules
DateFilterConsistencyValidator.FILTER_FAMILIES = FILTER_FAMILIES;
DateFilterConsistencyValidator.FAMILY_DESCRIPTIONS = FAMILY_DESCRIPTIONS;
DateFilterConsistencyValidator.FAMILY_COMPATIBILITY = FAMILY_COMPATIBILITY;

/**
 * CLI handler
 */
function runCli() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
Date Filter Consistency Validator

Validates date filter consistency across Salesforce reports and dashboards.
Reports using incompatible filter families (e.g., fiscal vs calendar) should
not be placed on the same dashboard.

USAGE:
  node date-filter-consistency-validator.js <command> [options]

COMMANDS:
  classify <filter>
    Classify a single date filter value

  check-report <report-json>
    Check date filter consistency within a single report

  validate-dashboard --reports <reports-json>
    Validate dashboard report consistency

  suggest --reports <reports-json>
    Suggest standardization approach

  families
    List all filter families and their members

EXAMPLES:
  # Classify a filter
  node date-filter-consistency-validator.js classify THIS_FISCAL_YEAR

  # Check a report
  node date-filter-consistency-validator.js check-report '{"filters":[{"value":"THIS_FISCAL_QUARTER","field":"CloseDate"}]}'

  # Validate dashboard reports
  node date-filter-consistency-validator.js validate-dashboard --reports '[{"name":"Report1","filters":[{"value":"THIS_FISCAL_YEAR"}]},{"name":"Report2","filters":[{"value":"LAST_QUARTER"}]}]'

  # List families
  node date-filter-consistency-validator.js families
`);
    return;
  }

  switch (command) {
    case 'classify': {
      const filterValue = args[1];
      if (!filterValue) {
        console.error('Error: Filter value required');
        process.exit(1);
      }
      const result = DateFilterConsistencyValidator.classifyFilter(filterValue);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'check-report': {
      const reportJson = args[1];
      if (!reportJson) {
        console.error('Error: Report JSON required');
        process.exit(1);
      }
      try {
        const report = JSON.parse(reportJson);
        const result = DateFilterConsistencyValidator.checkFilterMixing(report);
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.status === 'passed' ? 0 : 1);
      } catch (e) {
        console.error(`Error parsing JSON: ${e.message}`);
        process.exit(1);
      }
      break;
    }

    case 'validate-dashboard': {
      const reportsIndex = args.indexOf('--reports');
      if (reportsIndex === -1 || !args[reportsIndex + 1]) {
        console.error('Error: --reports <json> required');
        process.exit(1);
      }
      try {
        const reports = JSON.parse(args[reportsIndex + 1]);
        const result = DateFilterConsistencyValidator.validateDashboardConsistency({}, reports);
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.status === 'blocked' ? 1 : 0);
      } catch (e) {
        console.error(`Error parsing JSON: ${e.message}`);
        process.exit(1);
      }
      break;
    }

    case 'suggest': {
      const reportsIndex = args.indexOf('--reports');
      if (reportsIndex === -1 || !args[reportsIndex + 1]) {
        console.error('Error: --reports <json> required');
        process.exit(1);
      }
      try {
        const reports = JSON.parse(args[reportsIndex + 1]);
        const result = DateFilterConsistencyValidator.suggestStandardization(reports);
        console.log(JSON.stringify(result, null, 2));
      } catch (e) {
        console.error(`Error parsing JSON: ${e.message}`);
        process.exit(1);
      }
      break;
    }

    case 'families': {
      console.log('Date Filter Families:\n');
      for (const [family, filters] of Object.entries(FILTER_FAMILIES)) {
        console.log(`${family.toUpperCase()}: ${FAMILY_DESCRIPTIONS[family]}`);
        console.log(`  Filters: ${filters.join(', ')}`);
        console.log();
      }

      console.log('Compatibility Matrix:');
      console.log('  fiscal + calendar = INCOMPATIBLE');
      console.log('  fiscal + relative = compatible');
      console.log('  calendar + relative = compatible');
      console.log('  All others = compatible');
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run with --help for usage');
      process.exit(1);
  }
}

// Run CLI if executed directly
if (require.main === module) {
  runCli();
}

module.exports = {
  DateFilterConsistencyValidator,
  FILTER_FAMILIES,
  FAMILY_DESCRIPTIONS,
  FAMILY_COMPATIBILITY
};

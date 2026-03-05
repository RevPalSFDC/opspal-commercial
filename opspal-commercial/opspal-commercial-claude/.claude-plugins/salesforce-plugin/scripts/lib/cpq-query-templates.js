#!/usr/bin/env node
/**
 * CPQ Query Templates
 *
 * Standardized query builder library with validated SOQL patterns.
 * Prevents common errors like missing aliases, inconsistent jq paths,
 * and invalid aggregate syntax.
 *
 * Addresses error E004: "Aggregate Query Pattern Inconsistency"
 *
 * @module cpq-query-templates
 * @version 1.0.0
 * @created 2025-10-03
 */

/**
 * Count records in an object
 *
 * @param {string} objectName - Salesforce object API name
 * @param {Object} options - Query options
 * @returns {Object} Query and jq path
 */
function countRecords(objectName, options = {}) {
  const {
    alias = 'total_count',
    where = null,
    useToolingApi = false
  } = options;

  const whereClause = where ? ` WHERE ${where}` : '';

  return {
    soql: `SELECT COUNT(Id) ${alias} FROM ${objectName}${whereClause}`,
    jqPath: `.result.records[0].${alias}`,
    useToolingApi,
    description: `Count all ${objectName} records${where ? ' matching filter' : ''}`
  };
}

/**
 * Get recent activity for an object
 *
 * @param {string} objectName - Salesforce object API name
 * @param {number} months - Number of months to look back
 * @param {Object} options - Additional options
 * @returns {Object} Query and jq path
 */
function recentActivity(objectName, months = 6, options = {}) {
  const {
    alias = 'recent_count',
    dateField = 'CreatedDate',
    additionalWhere = null,
    useToolingApi = false
  } = options;

  let where = `${dateField} = LAST_N_MONTHS:${months}`;
  if (additionalWhere) {
    where += ` AND ${additionalWhere}`;
  }

  return {
    soql: `SELECT COUNT(Id) ${alias} FROM ${objectName} WHERE ${where}`,
    jqPath: `.result.records[0].${alias}`,
    useToolingApi,
    description: `Count ${objectName} records from last ${months} months`
  };
}

/**
 * Get time series data grouped by period
 *
 * @param {string} objectName - Salesforce object API name
 * @param {string} groupBy - Period to group by (month, quarter, year)
 * @param {Object} options - Additional options
 * @returns {Object} Query and jq path
 */
function timeSeries(objectName, groupBy = 'month', options = {}) {
  const {
    months = 12,
    dateField = 'CreatedDate',
    countAlias = 'cnt',
    additionalWhere = null,
    useToolingApi = false
  } = options;

  let selectClause;
  let groupClause;

  switch (groupBy.toLowerCase()) {
    case 'month':
      selectClause = `CALENDAR_YEAR(${dateField}) year, CALENDAR_MONTH(${dateField}) month, COUNT(Id) ${countAlias}`;
      groupClause = `CALENDAR_YEAR(${dateField}), CALENDAR_MONTH(${dateField})`;
      break;
    case 'quarter':
      selectClause = `CALENDAR_YEAR(${dateField}) year, CALENDAR_QUARTER(${dateField}) quarter, COUNT(Id) ${countAlias}`;
      groupClause = `CALENDAR_YEAR(${dateField}), CALENDAR_QUARTER(${dateField})`;
      break;
    case 'year':
      selectClause = `CALENDAR_YEAR(${dateField}) year, COUNT(Id) ${countAlias}`;
      groupClause = `CALENDAR_YEAR(${dateField})`;
      break;
    default:
      throw new Error(`Invalid groupBy: ${groupBy}. Use: month, quarter, or year`);
  }

  let where = `${dateField} = LAST_N_MONTHS:${months}`;
  if (additionalWhere) {
    where += ` AND ${additionalWhere}`;
  }

  return {
    soql: `SELECT ${selectClause} FROM ${objectName} WHERE ${where} GROUP BY ${groupClause} ORDER BY ${groupClause}`,
    jqPath: '.result.records[]',
    useToolingApi,
    description: `Time series of ${objectName} records by ${groupBy} for last ${months} months`
  };
}

/**
 * Check relationship linkage between parent and child
 *
 * @param {string} childObject - Child object name
 * @param {string} linkField - Relationship field on child
 * @param {Object} options - Additional options
 * @returns {Object} Queries for linked and unlinked counts
 */
function relationshipCheck(childObject, linkField, options = {}) {
  const {
    linkedAlias = 'linked_count',
    unlinkedAlias = 'unlinked_count',
    additionalWhere = null,
    useToolingApi = false
  } = options;

  const baseWhere = additionalWhere ? ` AND ${additionalWhere}` : '';

  return {
    linked: {
      soql: `SELECT COUNT(Id) ${linkedAlias} FROM ${childObject} WHERE ${linkField} != null${baseWhere}`,
      jqPath: `.result.records[0].${linkedAlias}`,
      useToolingApi,
      description: `Count ${childObject} records WITH ${linkField} link`
    },
    unlinked: {
      soql: `SELECT COUNT(Id) ${unlinkedAlias} FROM ${childObject} WHERE ${linkField} = null${baseWhere}`,
      jqPath: `.result.records[0].${unlinkedAlias}`,
      useToolingApi,
      description: `Count ${childObject} records WITHOUT ${linkField} link`
    }
  };
}

/**
 * Get latest records
 *
 * @param {string} objectName - Salesforce object API name
 * @param {Array} fields - Fields to retrieve
 * @param {Object} options - Additional options
 * @returns {Object} Query and jq path
 */
function latestRecords(objectName, fields, options = {}) {
  const {
    limit = 10,
    orderBy = 'CreatedDate',
    direction = 'DESC',
    where = null,
    useToolingApi = false
  } = options;

  const fieldList = Array.isArray(fields) ? fields.join(', ') : fields;
  const whereClause = where ? ` WHERE ${where}` : '';

  return {
    soql: `SELECT ${fieldList} FROM ${objectName}${whereClause} ORDER BY ${orderBy} ${direction} LIMIT ${limit}`,
    jqPath: '.result.records[]',
    useToolingApi,
    description: `Get latest ${limit} ${objectName} records`
  };
}

/**
 * Get status distribution
 *
 * @param {string} objectName - Salesforce object API name
 * @param {string} statusField - Status field name
 * @param {Object} options - Additional options
 * @returns {Object} Query and jq path
 */
function statusDistribution(objectName, statusField, options = {}) {
  const {
    countAlias = 'cnt',
    where = null,
    useToolingApi = false
  } = options;

  const whereClause = where ? ` WHERE ${where}` : '';

  return {
    soql: `SELECT ${statusField} status, COUNT(Id) ${countAlias} FROM ${objectName}${whereClause} GROUP BY ${statusField} ORDER BY COUNT(Id) DESC`,
    jqPath: '.result.records[]',
    useToolingApi,
    description: `Get status distribution for ${objectName}.${statusField}`
  };
}

/**
 * CPQ-specific: Quote metrics
 */
const cpqQuotes = {
  total: () => countRecords('SBQQ__Quote__c', { alias: 'total_quotes' }),

  recent: (months = 6) => recentActivity('SBQQ__Quote__c', months, { alias: 'recent_quotes' }),

  byMonth: (months = 12) => timeSeries('SBQQ__Quote__c', 'month', { months, countAlias: 'quote_count' }),

  latest: (limit = 10) => latestRecords(
    'SBQQ__Quote__c',
    ['Id', 'Name', 'CreatedDate', 'SBQQ__Status__c', 'SBQQ__Primary__c'],
    { limit }
  ),

  statusDistribution: (months = null) => {
    const options = { countAlias: 'quote_count' };
    if (months) {
      options.where = `CreatedDate = LAST_N_MONTHS:${months}`;
    }
    return statusDistribution('SBQQ__Quote__c', 'SBQQ__Status__c', options);
  },

  contractLinkage: () => relationshipCheck('SBQQ__Quote__c', 'SBQQ__Contracted__c', {
    linkedAlias: 'contracted_quotes',
    unlinkedAlias: 'not_contracted_quotes'
  })
};

/**
 * CPQ-specific: Subscription metrics
 */
const cpqSubscriptions = {
  total: () => countRecords('SBQQ__Subscription__c', { alias: 'total_subscriptions' }),

  contractLinkage: () => relationshipCheck('SBQQ__Subscription__c', 'SBQQ__Contract__c', {
    linkedAlias: 'subscriptions_with_contract',
    unlinkedAlias: 'subscriptions_without_contract'
  }),

  byProduct: (limit = 10) => ({
    soql: `SELECT SBQQ__Product__r.Name product_name, COUNT(Id) subscription_count FROM SBQQ__Subscription__c GROUP BY SBQQ__Product__r.Name ORDER BY COUNT(Id) DESC LIMIT ${limit}`,
    jqPath: '.result.records[]',
    useToolingApi: false,
    description: `Top ${limit} subscription products`
  })
};

/**
 * CPQ-specific: Product configuration
 */
const cpqProducts = {
  total: () => countRecords('Product2', { alias: 'total_products' }),

  subscriptionEnabled: () => countRecords('Product2', {
    alias: 'subscription_products',
    where: 'SBQQ__SubscriptionPricing__c != null'
  }),

  bundles: () => countRecords('SBQQ__ProductOption__c', { alias: 'product_bundles' })
};

/**
 * CPQ-specific: Pricing automation
 */
const cpqPricing = {
  priceRules: {
    total: () => countRecords('SBQQ__PriceRule__c', { alias: 'total_price_rules' }),
    active: () => countRecords('SBQQ__PriceRule__c', {
      alias: 'active_price_rules',
      where: 'SBQQ__Active__c = true'
    })
  },

  productRules: {
    active: () => countRecords('SBQQ__ProductRule__c', {
      alias: 'active_product_rules',
      where: 'SBQQ__Active__c = true'
    })
  },

  discountSchedules: () => countRecords('SBQQ__DiscountSchedule__c', { alias: 'discount_schedules' })
};

/**
 * Native quoting metrics (for comparison)
 */
const nativeQuotes = {
  total: () => countRecords('Quote', { alias: 'total_native_quotes' }),

  recent: (months = 6) => recentActivity('Quote', months, { alias: 'recent_native_quotes' }),

  byMonth: (months = 12) => timeSeries('Quote', 'month', { months, countAlias: 'native_quote_count' }),

  latest: (limit = 10) => latestRecords(
    'Quote',
    ['Id', 'Name', 'CreatedDate', 'Status'],
    { limit }
  ),

  statusDistribution: (months = null) => {
    const options = { countAlias: 'native_quote_count' };
    if (months) {
      options.where = `CreatedDate = LAST_N_MONTHS:${months}`;
    }
    return statusDistribution('Quote', 'Status', options);
  }
};

/**
 * Contract metrics
 */
const contracts = {
  total: () => countRecords('Contract', { alias: 'total_contracts' }),

  cpqLinkage: () => relationshipCheck('Contract', 'SBQQ__Quote__c', {
    linkedAlias: 'contracts_from_cpq',
    unlinkedAlias: 'contracts_without_cpq'
  }),

  statusDistribution: () => statusDistribution('Contract', 'Status', { countAlias: 'contract_count' }),

  recent: (months = 6) => recentActivity('Contract', months, { alias: 'recent_contracts' })
};

/**
 * Execute query and return result
 *
 * @param {Object} queryTemplate - Template from this library
 * @param {string} orgAlias - Salesforce org alias
 * @returns {Promise<Object>} Query result
 */
async function executeQuery(queryTemplate, orgAlias) {
  const { execSync } = require('child_process');

  const toolingFlag = queryTemplate.useToolingApi ? '--use-tooling-api' : '';
  const command = `sf data query --query "${queryTemplate.soql}" -o ${orgAlias} ${toolingFlag} --json`;

  try {
    const result = execSync(command, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    const parsed = JSON.parse(result);

    return {
      success: parsed.status === 0,
      data: parsed.result,
      query: queryTemplate.soql,
      jqPath: queryTemplate.jqPath,
      description: queryTemplate.description
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      query: queryTemplate.soql,
      description: queryTemplate.description
    };
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'list-templates') {
    console.log('Available CPQ Query Templates:\n');
    console.log('CPQ Quotes:');
    console.log('  cpqQuotes.total()');
    console.log('  cpqQuotes.recent(months)');
    console.log('  cpqQuotes.byMonth(months)');
    console.log('  cpqQuotes.latest(limit)');
    console.log('  cpqQuotes.statusDistribution(months)');
    console.log('  cpqQuotes.contractLinkage()');
    console.log('\nCPQ Subscriptions:');
    console.log('  cpqSubscriptions.total()');
    console.log('  cpqSubscriptions.contractLinkage()');
    console.log('  cpqSubscriptions.byProduct(limit)');
    console.log('\nCPQ Products:');
    console.log('  cpqProducts.total()');
    console.log('  cpqProducts.subscriptionEnabled()');
    console.log('  cpqProducts.bundles()');
    console.log('\nCPQ Pricing:');
    console.log('  cpqPricing.priceRules.total/active()');
    console.log('  cpqPricing.productRules.active()');
    console.log('  cpqPricing.discountSchedules()');
    console.log('\nNative Quotes (comparison):');
    console.log('  nativeQuotes.total/recent/byMonth/latest/statusDistribution()');
    console.log('\nContracts:');
    console.log('  contracts.total/cpqLinkage/statusDistribution/recent()');
    process.exit(0);
  }

  console.error('Usage:');
  console.error('  cpq-query-templates.js list-templates');
  process.exit(1);
}

module.exports = {
  // Generic templates
  countRecords,
  recentActivity,
  timeSeries,
  relationshipCheck,
  latestRecords,
  statusDistribution,

  // CPQ-specific
  cpqQuotes,
  cpqSubscriptions,
  cpqProducts,
  cpqPricing,

  // Comparison
  nativeQuotes,
  contracts,

  // Execution
  executeQuery
};

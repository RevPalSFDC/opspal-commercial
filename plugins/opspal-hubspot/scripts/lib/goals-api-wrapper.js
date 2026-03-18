#!/usr/bin/env node
/**
 * HubSpot Goals API Wrapper (V3)
 *
 * Purpose: Goal Targets V3 API wrapper for sales goals and quotas
 * Enables quota tracking, goal progress monitoring, and attainment reporting
 *
 * API Endpoints:
 * - GET /crm/v3/objects/goal_targets - List all goals
 * - GET /crm/v3/objects/goal_targets/{goalTargetId} - Get specific goal
 * - POST /crm/v3/objects/goal_targets/search - Search goals with filters
 *
 * Key Properties:
 * - hs_goal_name: Goal display name
 * - hs_target_amount: Quota/target value
 * - hs_start_datetime: Goal period start
 * - hs_end_datetime: Goal period end
 * - hs_created_by_user_id: Goal owner/assignee
 *
 * @version 1.0.0
 * @phase CRM API Gap Closure (Phase 1)
 */

const HUBSPOT_API_BASE = 'https://api.hubapi.com';
const DEFAULT_PROPERTIES = [
  'hs_goal_name',
  'hs_target_amount',
  'hs_start_datetime',
  'hs_end_datetime',
  'hs_created_by_user_id'
];
const MAX_PAGE_SIZE = 100;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY = 1000;

/**
 * HubSpot Goals Manager
 *
 * Usage:
 * const manager = new HubSpotGoalsManager(accessToken);
 * const goals = await manager.listGoals();
 * const userGoals = await manager.getUserGoals(userId);
 */
class HubSpotGoalsManager {
  constructor(accessToken, options = {}) {
    if (!accessToken) {
      throw new Error('HubSpotGoalsManager requires accessToken');
    }

    this.accessToken = accessToken;
    this.retryAttempts = options.retryAttempts || DEFAULT_RETRY_ATTEMPTS;
    this.retryDelay = options.retryDelay || DEFAULT_RETRY_DELAY;
    this.verbose = options.verbose || false;
  }

  /**
   * List all goals with pagination
   * @param {Object} options - List options
   * @param {number} options.limit - Results per page (max 100)
   * @param {string} options.after - Pagination cursor
   * @param {string[]} options.properties - Properties to include
   * @returns {Promise<Object>} Paginated goals response
   */
  async listGoals(options = {}) {
    const { limit = MAX_PAGE_SIZE, after, properties = DEFAULT_PROPERTIES } = options;

    const params = new URLSearchParams();
    params.append('limit', Math.min(limit, MAX_PAGE_SIZE));
    if (after) params.append('after', after);
    if (properties.length > 0) params.append('properties', properties.join(','));

    const url = `${HUBSPOT_API_BASE}/crm/v3/objects/goal_targets?${params}`;

    if (this.verbose) {
      console.log(`Listing goals: limit=${limit}, after=${after || 'start'}`);
    }

    return this.makeRequest(url, null, 'GET');
  }

  /**
   * Get all goals (handles pagination automatically)
   * @param {string[]} properties - Properties to include
   * @returns {Promise<Object[]>} All goals
   */
  async getAllGoals(properties = DEFAULT_PROPERTIES) {
    const allGoals = [];
    let after = null;

    do {
      const response = await this.listGoals({ after, properties });
      allGoals.push(...(response.results || []));
      after = response.paging?.next?.after || null;

      if (this.verbose && after) {
        console.log(`Fetched ${allGoals.length} goals, continuing...`);
      }
    } while (after);

    if (this.verbose) {
      console.log(`Total goals fetched: ${allGoals.length}`);
    }

    return allGoals;
  }

  /**
   * Get specific goal by ID
   * @param {string} goalId - Goal target ID
   * @param {string[]} properties - Properties to include
   * @returns {Promise<Object>} Goal object
   */
  async getGoal(goalId, properties = DEFAULT_PROPERTIES) {
    if (!goalId) {
      throw new Error('goalId is required');
    }

    const params = properties.length > 0
      ? `?properties=${properties.join(',')}`
      : '';

    const url = `${HUBSPOT_API_BASE}/crm/v3/objects/goal_targets/${goalId}${params}`;

    if (this.verbose) {
      console.log(`Getting goal: ${goalId}`);
    }

    return this.makeRequest(url, null, 'GET');
  }

  /**
   * Search goals with filters
   * @param {Object[]} filters - Array of filter objects
   * @param {string[]} properties - Properties to include
   * @param {Object} options - Search options (limit, after)
   * @returns {Promise<Object>} Search results
   */
  async searchGoals(filters = [], properties = DEFAULT_PROPERTIES, options = {}) {
    const { limit = MAX_PAGE_SIZE, after } = options;

    const payload = {
      filterGroups: filters.length > 0 ? [{ filters }] : [],
      properties,
      limit: Math.min(limit, MAX_PAGE_SIZE)
    };

    if (after) {
      payload.after = after;
    }

    const url = `${HUBSPOT_API_BASE}/crm/v3/objects/goal_targets/search`;

    if (this.verbose) {
      console.log(`Searching goals with ${filters.length} filters`);
    }

    return this.makeRequest(url, payload, 'POST');
  }

  /**
   * Get goals for a specific user
   * @param {string} userId - HubSpot user ID
   * @param {string[]} properties - Additional properties to include
   * @returns {Promise<Object[]>} User's goals
   */
  async getUserGoals(userId, properties = DEFAULT_PROPERTIES) {
    if (!userId) {
      throw new Error('userId is required');
    }

    const filters = [{
      propertyName: 'hs_created_by_user_id',
      operator: 'EQ',
      value: String(userId)
    }];

    const results = [];
    let after = null;

    do {
      const response = await this.searchGoals(filters, properties, { after });
      results.push(...(response.results || []));
      after = response.paging?.next?.after || null;
    } while (after);

    if (this.verbose) {
      console.log(`Found ${results.length} goals for user ${userId}`);
    }

    return results;
  }

  /**
   * Get active goals (current period)
   * @param {string[]} properties - Properties to include
   * @returns {Promise<Object[]>} Active goals
   */
  async getActiveGoals(properties = DEFAULT_PROPERTIES) {
    const now = new Date().toISOString();

    const filters = [
      {
        propertyName: 'hs_start_datetime',
        operator: 'LTE',
        value: now
      },
      {
        propertyName: 'hs_end_datetime',
        operator: 'GTE',
        value: now
      }
    ];

    const results = [];
    let after = null;

    do {
      const response = await this.searchGoals(filters, properties, { after });
      results.push(...(response.results || []));
      after = response.paging?.next?.after || null;
    } while (after);

    if (this.verbose) {
      console.log(`Found ${results.length} active goals`);
    }

    return results;
  }

  /**
   * Get goals for a time period
   * @param {string} startDate - Period start (ISO 8601)
   * @param {string} endDate - Period end (ISO 8601)
   * @param {string[]} properties - Properties to include
   * @returns {Promise<Object[]>} Goals in period
   */
  async getGoalsByPeriod(startDate, endDate, properties = DEFAULT_PROPERTIES) {
    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required');
    }

    const filters = [
      {
        propertyName: 'hs_start_datetime',
        operator: 'GTE',
        value: startDate
      },
      {
        propertyName: 'hs_end_datetime',
        operator: 'LTE',
        value: endDate
      }
    ];

    const results = [];
    let after = null;

    do {
      const response = await this.searchGoals(filters, properties, { after });
      results.push(...(response.results || []));
      after = response.paging?.next?.after || null;
    } while (after);

    if (this.verbose) {
      console.log(`Found ${results.length} goals for period ${startDate} to ${endDate}`);
    }

    return results;
  }

  /**
   * Calculate goal progress (requires actual revenue data)
   * @param {string} goalId - Goal ID
   * @param {number} actualAmount - Actual achieved amount
   * @returns {Promise<Object>} Progress details
   */
  async calculateGoalProgress(goalId, actualAmount) {
    const goal = await this.getGoal(goalId);
    const targetAmount = parseFloat(goal.properties?.hs_target_amount || 0);

    const attainmentPercent = targetAmount > 0
      ? (actualAmount / targetAmount * 100)
      : 0;

    const remaining = Math.max(0, targetAmount - actualAmount);
    const overAchievement = Math.max(0, actualAmount - targetAmount);

    // Calculate days remaining in goal period
    const endDate = goal.properties?.hs_end_datetime
      ? new Date(goal.properties.hs_end_datetime)
      : null;
    const now = new Date();
    const daysRemaining = endDate
      ? Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)))
      : null;

    // Calculate required daily pace
    const requiredDailyPace = daysRemaining && daysRemaining > 0
      ? remaining / daysRemaining
      : null;

    return {
      goalId,
      goalName: goal.properties?.hs_goal_name || 'Unknown',
      target: targetAmount,
      actual: actualAmount,
      remaining,
      overAchievement,
      attainmentPercent: parseFloat(attainmentPercent.toFixed(2)),
      daysRemaining,
      requiredDailyPace: requiredDailyPace ? parseFloat(requiredDailyPace.toFixed(2)) : null,
      status: this.getGoalStatus(attainmentPercent, daysRemaining)
    };
  }

  /**
   * Get goal status based on attainment and time remaining
   * @private
   */
  getGoalStatus(attainmentPercent, daysRemaining) {
    if (attainmentPercent >= 100) return 'ACHIEVED';
    if (daysRemaining === null) return 'UNKNOWN';
    if (daysRemaining <= 0) return 'MISSED';

    // Calculate expected pace (linear)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Assume 30-day period for simplicity
    const totalDays = daysRemaining + 30;
    const elapsedDays = totalDays - daysRemaining;
    const expectedPace = (elapsedDays / totalDays) * 100;

    if (attainmentPercent >= expectedPace * 0.9) return 'ON_TRACK';
    if (attainmentPercent >= expectedPace * 0.7) return 'AT_RISK';
    return 'BEHIND';
  }

  /**
   * Generate goals summary report
   * @param {Object[]} goals - Array of goal objects
   * @param {Map<string, number>} actualAmounts - Map of goalId to actual amount
   * @returns {Object} Summary report
   */
  generateGoalsSummary(goals, actualAmounts = new Map()) {
    const summary = {
      totalGoals: goals.length,
      activeGoals: 0,
      completedGoals: 0,
      totalTargetAmount: 0,
      totalActualAmount: 0,
      overallAttainment: 0,
      statusBreakdown: {
        ACHIEVED: 0,
        ON_TRACK: 0,
        AT_RISK: 0,
        BEHIND: 0,
        MISSED: 0,
        UNKNOWN: 0
      },
      goals: []
    };

    const now = new Date();

    for (const goal of goals) {
      const targetAmount = parseFloat(goal.properties?.hs_target_amount || 0);
      const actualAmount = actualAmounts.get(goal.id) || 0;
      const endDate = goal.properties?.hs_end_datetime
        ? new Date(goal.properties.hs_end_datetime)
        : null;

      const isActive = endDate && endDate > now;
      if (isActive) summary.activeGoals++;

      const isCompleted = endDate && endDate <= now;
      if (isCompleted) summary.completedGoals++;

      summary.totalTargetAmount += targetAmount;
      summary.totalActualAmount += actualAmount;

      const attainmentPercent = targetAmount > 0
        ? (actualAmount / targetAmount * 100)
        : 0;

      const daysRemaining = endDate
        ? Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)))
        : null;

      const status = this.getGoalStatus(attainmentPercent, daysRemaining);
      summary.statusBreakdown[status]++;

      summary.goals.push({
        id: goal.id,
        name: goal.properties?.hs_goal_name || 'Unknown',
        target: targetAmount,
        actual: actualAmount,
        attainment: parseFloat(attainmentPercent.toFixed(2)),
        status,
        endDate: goal.properties?.hs_end_datetime
      });
    }

    summary.overallAttainment = summary.totalTargetAmount > 0
      ? parseFloat((summary.totalActualAmount / summary.totalTargetAmount * 100).toFixed(2))
      : 0;

    return summary;
  }

  /**
   * Make HTTP request with retry logic
   * @private
   */
  async makeRequest(url, payload, method) {
    let lastError;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const options = {
          method,
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        };

        if (payload) {
          options.body = JSON.stringify(payload);
        }

        const response = await fetch(url, options);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        return response.json();

      } catch (error) {
        lastError = error;

        if (attempt < this.retryAttempts) {
          if (this.verbose) {
            console.log(`Request failed (attempt ${attempt}/${this.retryAttempts}): ${error.message}`);
          }
          await this.delay(this.retryDelay * attempt);
        }
      }
    }

    throw new Error(`Request failed after ${this.retryAttempts} attempts: ${lastError.message}`);
  }

  /**
   * Utility: Delay for retry backoff
   * @private
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { HubSpotGoalsManager };

// CLI usage
if (require.main === module) {
  console.log('HubSpotGoalsManager - HubSpot Goal Targets V3 API');
  console.log('Provides sales goals, quotas, and attainment tracking');
  console.log('');
  console.log('Usage:');
  console.log('  const { HubSpotGoalsManager } = require("./goals-api-wrapper");');
  console.log('  const manager = new HubSpotGoalsManager(accessToken);');
  console.log('');
  console.log('Methods:');
  console.log('  listGoals(options)           - List goals with pagination');
  console.log('  getAllGoals(properties)      - Get all goals (auto-paginate)');
  console.log('  getGoal(goalId, properties)  - Get specific goal by ID');
  console.log('  searchGoals(filters, props)  - Search with filters');
  console.log('  getUserGoals(userId, props)  - Get goals for specific user');
  console.log('  getActiveGoals(properties)   - Get currently active goals');
  console.log('  getGoalsByPeriod(start, end) - Get goals in date range');
  console.log('  calculateGoalProgress(id, actual) - Calculate progress');
  console.log('  generateGoalsSummary(goals, actuals) - Generate report');
  console.log('');
  console.log('Goal Properties:');
  console.log('  - hs_goal_name: Goal display name');
  console.log('  - hs_target_amount: Quota/target value');
  console.log('  - hs_start_datetime: Period start');
  console.log('  - hs_end_datetime: Period end');
  console.log('  - hs_created_by_user_id: Goal owner');
}

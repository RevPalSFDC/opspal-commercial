/**
 * Commission Formula Engine
 *
 * Core calculation engine for sales compensation.
 * Handles tiered commissions, accelerators, SPIFs, clawbacks, caps, and splits.
 *
 * @module compensation/commission-formula-engine
 * @version 1.0.0
 */

const path = require('path');
const fs = require('fs');

class CommissionFormulaEngine {
  /**
   * Create a commission formula engine
   * @param {Object} plan - Compensation plan configuration
   */
  constructor(plan) {
    this.plan = plan;
    this.validatePlan(plan);

    // Pre-sort tiers by minAttainment for efficient lookup
    this.sortedTiers = [...(plan.tiers || [])].sort((a, b) => a.minAttainment - b.minAttainment);

    // Index SPIFs by ID for quick lookup
    this.spifIndex = new Map();
    (plan.spifs || []).forEach(spif => {
      this.spifIndex.set(spif.id || spif.name, spif);
    });

    // Index roles by ID
    this.roleIndex = new Map();
    (plan.roles || []).forEach(role => {
      this.roleIndex.set(role.roleId, role);
    });
  }

  /**
   * Validate plan has required structure
   * @param {Object} plan
   */
  validatePlan(plan) {
    if (!plan) throw new Error('Compensation plan is required');
    if (!plan.tiers || plan.tiers.length === 0) {
      throw new Error('Compensation plan must have at least one tier');
    }
    if (!plan.roles || plan.roles.length === 0) {
      throw new Error('Compensation plan must have at least one role');
    }
  }

  /**
   * Calculate commission for a single deal
   * @param {Object} deal - Deal information
   * @param {number} deal.amount - Deal amount/value
   * @param {string} [deal.type] - Deal type (New Business, Expansion, Renewal)
   * @param {string} [deal.product] - Product name/ID
   * @param {Date|string} [deal.closeDate] - Close date
   * @param {number} [deal.contractTermYears] - Contract term in years
   * @param {Object} rep - Rep information
   * @param {string} rep.roleId - Rep's role ID
   * @param {number} rep.ytdBookings - Year-to-date bookings before this deal
   * @param {number} [rep.quota] - Rep's quota (overrides role default)
   * @param {Object} [period] - Period information
   * @param {Date|string} [period.startDate] - Period start
   * @param {Date|string} [period.endDate] - Period end
   * @returns {Object} Commission calculation result
   */
  calculateCommission(deal, rep, period = {}) {
    // Get role configuration
    const role = this.roleIndex.get(rep.roleId);
    if (!role) {
      throw new Error(`Unknown role: ${rep.roleId}`);
    }

    // Determine quota
    const quota = rep.quota || role.quotaAmount;
    if (!quota || quota <= 0) {
      throw new Error(`Invalid quota for role ${rep.roleId}`);
    }

    // Calculate attainment before and after this deal
    const ytdBookings = rep.ytdBookings || 0;
    const priorAttainment = ytdBookings / quota;
    const newYtdBookings = ytdBookings + deal.amount;
    const newAttainment = newYtdBookings / quota;

    // Calculate base commission using tier structure
    const tierResult = this._calculateTieredCommission(deal.amount, priorAttainment, newAttainment, quota);

    // Apply SPIF bonuses
    const spifResult = this._calculateSPIFs(deal, rep, period);

    // Calculate gross commission (before cap)
    let grossCommission = tierResult.baseCommission + spifResult.totalSpifBonus;

    // Apply commission cap if enabled
    const capResult = this._applyCap(grossCommission, role, rep);

    // Calculate potential clawback risk
    const clawbackRisk = this._assessClawbackRisk(deal, rep);

    // Build result
    return {
      // Primary outputs
      grossCommission: capResult.cappedCommission,
      netCommission: capResult.cappedCommission, // Same as gross unless holdback
      effectiveRate: deal.amount > 0 ? capResult.cappedCommission / deal.amount : 0,

      // Deal context
      dealAmount: deal.amount,
      dealType: deal.type || 'Unknown',
      product: deal.product || 'Unknown',
      closeDate: deal.closeDate,

      // Tier information
      tierApplied: tierResult.tierApplied,
      tierRate: tierResult.rate,
      acceleratorMultiplier: tierResult.multiplier,

      // Attainment
      priorAttainment,
      newAttainment,
      attainmentDelta: newAttainment - priorAttainment,

      // Quota progress
      quota,
      ytdBookings,
      newYtdBookings,
      remainingToQuota: Math.max(0, quota - newYtdBookings),

      // Commission breakdown
      breakdown: {
        baseCommission: tierResult.baseCommission,
        tierCommissions: tierResult.tierBreakdown,
        spifBonus: spifResult.totalSpifBonus,
        spifDetails: spifResult.spifDetails,
        acceleratorBonus: tierResult.acceleratorBonus,
        cappedAmount: capResult.cappedAmount,
        preCap: tierResult.baseCommission + spifResult.totalSpifBonus
      },

      // Cap information
      capApplied: capResult.capApplied,
      capLimit: capResult.capLimit,

      // Clawback risk
      clawbackRisk,
      clawbackAmount: clawbackRisk.potentialClawback,

      // Next tier preview
      nextTier: this._getNextTierInfo(newAttainment),

      // Calculated at
      calculatedAt: new Date().toISOString()
    };
  }

  /**
   * Calculate tiered commission for a deal
   * @private
   */
  _calculateTieredCommission(dealAmount, priorAttainment, newAttainment, quota) {
    let totalCommission = 0;
    let appliedTier = null;
    let appliedRate = 0;
    let appliedMultiplier = 1;
    const tierBreakdown = [];
    let acceleratorBonus = 0;

    // For simple calculation, use the tier at new attainment level
    // For more accurate calculation, we'd split the deal across tier boundaries

    // Find the tier for the new attainment level
    for (const tier of this.sortedTiers) {
      if (newAttainment >= tier.minAttainment && newAttainment < tier.maxAttainment) {
        appliedTier = tier.name;
        appliedRate = tier.rate;
        appliedMultiplier = tier.multiplier || 1;
        break;
      }
    }

    // If attainment exceeds all tiers, use the highest tier
    if (!appliedTier && this.sortedTiers.length > 0) {
      const highestTier = this.sortedTiers[this.sortedTiers.length - 1];
      appliedTier = highestTier.name;
      appliedRate = highestTier.rate;
      appliedMultiplier = highestTier.multiplier || 1;
    }

    // Calculate commission at the applied rate
    totalCommission = dealAmount * appliedRate;

    // Track tier breakdown
    tierBreakdown.push({
      tier: appliedTier,
      amount: dealAmount,
      rate: appliedRate,
      commission: totalCommission
    });

    // Calculate accelerator bonus if applicable
    if (this.plan.accelerators && newAttainment >= 1.0) {
      for (const accel of this.plan.accelerators) {
        if (newAttainment >= accel.threshold) {
          // Calculate incremental amount above threshold
          const thresholdAmount = accel.threshold * quota;
          const baseAmount = priorAttainment >= accel.threshold
            ? dealAmount
            : Math.max(0, newAttainment * quota - thresholdAmount);

          if (accel.appliesTo === 'incremental' && baseAmount > 0) {
            const bonusRate = appliedRate * (accel.multiplier - 1);
            acceleratorBonus = Math.max(acceleratorBonus, baseAmount * bonusRate);
          }
        }
      }
    }

    totalCommission += acceleratorBonus;

    return {
      baseCommission: totalCommission,
      tierApplied: appliedTier,
      rate: appliedRate,
      multiplier: appliedMultiplier,
      tierBreakdown,
      acceleratorBonus
    };
  }

  /**
   * Calculate SPIF bonuses for a deal
   * @private
   */
  _calculateSPIFs(deal, rep, period) {
    const spifDetails = [];
    let totalSpifBonus = 0;

    if (!this.plan.spifs || this.plan.spifs.length === 0) {
      return { totalSpifBonus, spifDetails };
    }

    const dealDate = deal.closeDate ? new Date(deal.closeDate) : new Date();

    for (const spif of this.plan.spifs) {
      // Check date eligibility
      const spifStart = new Date(spif.startDate);
      const spifEnd = new Date(spif.endDate);

      if (dealDate < spifStart || dealDate > spifEnd) {
        continue;
      }

      // Check eligibility criteria
      const eligible = this._checkSpifEligibility(spif, deal, rep);
      if (!eligible.isEligible) {
        continue;
      }

      // Calculate bonus
      let bonus = 0;
      switch (spif.bonusType) {
        case 'flat':
          bonus = spif.bonusAmount || 0;
          break;
        case 'percentage':
          bonus = deal.amount * (spif.bonusAmount || 0);
          break;
        case 'per-unit':
          bonus = (deal.units || 1) * (spif.bonusAmount || 0);
          break;
        case 'tiered':
          bonus = this._calculateTieredSpif(spif, deal);
          break;
      }

      // Apply max payout if configured
      if (spif.maxPayout && bonus > spif.maxPayout) {
        bonus = spif.maxPayout;
      }

      if (bonus > 0) {
        spifDetails.push({
          spifId: spif.id || spif.name,
          spifName: spif.name,
          bonus,
          bonusType: spif.bonusType,
          eligibilityReason: eligible.reason
        });
        totalSpifBonus += bonus;
      }
    }

    return { totalSpifBonus, spifDetails };
  }

  /**
   * Check if deal is eligible for SPIF
   * @private
   */
  _checkSpifEligibility(spif, deal, rep) {
    const criteria = spif.eligibilityCriteria || {};

    // Check product eligibility
    if (criteria.products && criteria.products.length > 0) {
      if (!deal.product || !criteria.products.includes(deal.product)) {
        return { isEligible: false, reason: 'Product not eligible' };
      }
    }

    // Check deal type eligibility
    if (criteria.dealTypes && criteria.dealTypes.length > 0) {
      if (!deal.type || !criteria.dealTypes.includes(deal.type)) {
        return { isEligible: false, reason: 'Deal type not eligible' };
      }
    }

    // Check minimum deal size
    if (criteria.minDealSize && deal.amount < criteria.minDealSize) {
      return { isEligible: false, reason: 'Below minimum deal size' };
    }

    // Check role eligibility
    if (criteria.roles && criteria.roles.length > 0) {
      if (!rep.roleId || !criteria.roles.includes(rep.roleId)) {
        return { isEligible: false, reason: 'Role not eligible' };
      }
    }

    // Check custom formula if present
    if (criteria.customFormula) {
      try {
        const result = this._evaluateCustomFormula(criteria.customFormula, deal, rep);
        if (!result) {
          return { isEligible: false, reason: 'Custom criteria not met' };
        }
      } catch (e) {
        return { isEligible: false, reason: `Formula error: ${e.message}` };
      }
    }

    return { isEligible: true, reason: 'All criteria met' };
  }

  /**
   * Evaluate custom formula for eligibility
   * @private
   */
  _evaluateCustomFormula(formula, deal, rep) {
    // Simple formula evaluation - supports basic comparisons
    // Format: "field_name operator value" or "field_name operator value"

    const context = {
      amount: deal.amount,
      deal_amount: deal.amount,
      contract_term_years: deal.contractTermYears || 1,
      product: deal.product,
      type: deal.type,
      role_id: rep.roleId,
      ytd_bookings: rep.ytdBookings || 0
    };

    // Replace field names with values
    let evalFormula = formula;
    for (const [key, value] of Object.entries(context)) {
      const regex = new RegExp(`\\b${key}\\b`, 'gi');
      if (typeof value === 'string') {
        evalFormula = evalFormula.replace(regex, `"${value}"`);
      } else {
        evalFormula = evalFormula.replace(regex, String(value));
      }
    }

    // Evaluate simple expressions
    // Support: >=, <=, >, <, ==, !=
    try {
      // Security: Only allow simple comparisons, not arbitrary code
      const safePattern = /^[\d\w\s"'.>=<!&|()-]+$/;
      if (!safePattern.test(evalFormula)) {
        throw new Error('Invalid formula characters');
      }

      // Use Function constructor for isolated evaluation
      // This is safer than eval but still allows basic expressions
      const fn = new Function(`return (${evalFormula});`);
      return fn();
    } catch (e) {
      console.warn(`Formula evaluation failed: ${formula}`, e.message);
      return false;
    }
  }

  /**
   * Calculate tiered SPIF bonus
   * @private
   */
  _calculateTieredSpif(spif, deal) {
    if (!spif.bonusTiers || spif.bonusTiers.length === 0) {
      return 0;
    }

    // Find applicable tier
    const sortedTiers = [...spif.bonusTiers].sort((a, b) => b.threshold - a.threshold);
    for (const tier of sortedTiers) {
      if (deal.amount >= tier.threshold) {
        return tier.bonus;
      }
    }
    return 0;
  }

  /**
   * Apply commission cap
   * @private
   */
  _applyCap(grossCommission, role, rep) {
    const cap = this.plan.cap;

    if (!cap || !cap.enabled) {
      return {
        cappedCommission: grossCommission,
        capApplied: false,
        cappedAmount: 0,
        capLimit: null
      };
    }

    // Calculate cap limit
    let capLimit = Infinity;

    if (cap.maxMultiplierOfOTE && role.ote) {
      capLimit = role.ote * cap.maxMultiplierOfOTE;
    }

    if (cap.absoluteMax) {
      capLimit = Math.min(capLimit, cap.absoluteMax);
    }

    // Get YTD commission (would need to track this in production)
    const ytdCommission = rep.ytdCommission || 0;
    const remainingCap = Math.max(0, capLimit - ytdCommission);

    // Apply cap
    if (grossCommission > remainingCap) {
      const cappedAmount = grossCommission - remainingCap;

      // Soft cap: Apply reduced rate above cap
      if (cap.capType === 'soft' && cap.softCapRate) {
        const overCapCommission = cappedAmount * cap.softCapRate;
        return {
          cappedCommission: remainingCap + overCapCommission,
          capApplied: true,
          cappedAmount: cappedAmount - overCapCommission,
          capLimit
        };
      }

      // Hard cap: No commission above limit
      return {
        cappedCommission: remainingCap,
        capApplied: true,
        cappedAmount,
        capLimit
      };
    }

    return {
      cappedCommission: grossCommission,
      capApplied: false,
      cappedAmount: 0,
      capLimit
    };
  }

  /**
   * Assess clawback risk for a deal
   * @private
   */
  _assessClawbackRisk(deal, rep) {
    if (!this.plan.clawbacks || this.plan.clawbacks.length === 0) {
      return {
        hasRisk: false,
        potentialClawback: 0,
        riskFactors: []
      };
    }

    const riskFactors = [];
    let maxClawbackPercent = 0;

    for (const clawback of this.plan.clawbacks) {
      // All deals have some clawback risk within the clawback period
      riskFactors.push({
        rule: clawback.name,
        condition: clawback.triggerCondition,
        periodDays: clawback.clawbackPeriodDays,
        clawbackPercent: clawback.clawbackPercent,
        prorated: clawback.prorated || false
      });

      if (clawback.clawbackPercent > maxClawbackPercent) {
        maxClawbackPercent = clawback.clawbackPercent;
      }
    }

    // Calculate potential clawback (worst case)
    const potentialClawback = deal.amount * maxClawbackPercent * (this.sortedTiers[0]?.rate || 0.1);

    return {
      hasRisk: riskFactors.length > 0,
      potentialClawback,
      riskFactors,
      maxClawbackPercent
    };
  }

  /**
   * Get information about the next tier
   * @private
   */
  _getNextTierInfo(currentAttainment) {
    // Find next tier above current attainment
    for (const tier of this.sortedTiers) {
      if (tier.minAttainment > currentAttainment) {
        return {
          name: tier.name,
          threshold: tier.minAttainment,
          rate: tier.rate,
          multiplier: tier.multiplier || 1,
          attainmentNeeded: tier.minAttainment - currentAttainment,
          description: tier.description
        };
      }
    }

    // Already at highest tier
    return {
      name: 'Maximum Tier',
      threshold: null,
      rate: null,
      attainmentNeeded: 0,
      description: 'You are at the highest commission tier'
    };
  }

  /**
   * Calculate commission for multiple deals (batch)
   * @param {Array} deals - Array of deal objects
   * @param {Object} rep - Rep information
   * @param {Object} [period] - Period information
   * @returns {Object} Aggregated commission results
   */
  calculateBatch(deals, rep, period = {}) {
    const results = [];
    let runningYtd = rep.ytdBookings || 0;

    // Sort deals by close date
    const sortedDeals = [...deals].sort((a, b) => {
      const dateA = new Date(a.closeDate || 0);
      const dateB = new Date(b.closeDate || 0);
      return dateA - dateB;
    });

    for (const deal of sortedDeals) {
      const repState = { ...rep, ytdBookings: runningYtd };
      const result = this.calculateCommission(deal, repState, period);
      results.push(result);
      runningYtd = result.newYtdBookings;
    }

    // Aggregate results
    const totalCommission = results.reduce((sum, r) => sum + r.grossCommission, 0);
    const totalSpif = results.reduce((sum, r) => sum + r.breakdown.spifBonus, 0);
    const totalDeals = results.length;
    const avgCommissionRate = totalDeals > 0
      ? results.reduce((sum, r) => sum + r.effectiveRate, 0) / totalDeals
      : 0;

    return {
      deals: results,
      summary: {
        totalCommission,
        totalSpifBonus: totalSpif,
        totalDeals,
        totalDealValue: deals.reduce((sum, d) => sum + d.amount, 0),
        avgCommissionRate,
        avgDealSize: totalDeals > 0
          ? deals.reduce((sum, d) => sum + d.amount, 0) / totalDeals
          : 0,
        finalAttainment: results.length > 0
          ? results[results.length - 1].newAttainment
          : rep.ytdBookings / (rep.quota || this.roleIndex.get(rep.roleId)?.quotaAmount || 1),
        finalYtdBookings: runningYtd
      },
      calculatedAt: new Date().toISOString()
    };
  }

  /**
   * Simulate what-if scenario with hypothetical deals
   * @param {Object} rep - Current rep state
   * @param {Array} hypotheticalDeals - Deals to simulate
   * @param {Object} [period] - Period information
   * @returns {Object} Simulation results
   */
  simulateWhatIf(rep, hypotheticalDeals, period = {}) {
    // Calculate current state
    const currentState = {
      ytdBookings: rep.ytdBookings || 0,
      quota: rep.quota || this.roleIndex.get(rep.roleId)?.quotaAmount || 0,
      currentAttainment: 0,
      currentCommission: rep.ytdCommission || 0
    };
    currentState.currentAttainment = currentState.quota > 0
      ? currentState.ytdBookings / currentState.quota
      : 0;

    // Calculate with hypothetical deals
    const simulated = this.calculateBatch(hypotheticalDeals, rep, period);

    // Calculate deltas
    const newTotalBookings = currentState.ytdBookings + simulated.summary.totalDealValue;
    const newAttainment = currentState.quota > 0
      ? newTotalBookings / currentState.quota
      : 0;

    return {
      currentState,
      simulatedDeals: simulated.deals,
      projected: {
        newYtdBookings: newTotalBookings,
        newAttainment,
        attainmentDelta: newAttainment - currentState.currentAttainment,
        additionalCommission: simulated.summary.totalCommission,
        newTotalCommission: currentState.currentCommission + simulated.summary.totalCommission,
        tierChange: this._getTierChange(currentState.currentAttainment, newAttainment)
      },
      summary: simulated.summary,
      calculatedAt: new Date().toISOString()
    };
  }

  /**
   * Determine tier change between two attainment levels
   * @private
   */
  _getTierChange(fromAttainment, toAttainment) {
    let fromTier = null;
    let toTier = null;

    for (const tier of this.sortedTiers) {
      if (fromAttainment >= tier.minAttainment && fromAttainment < tier.maxAttainment) {
        fromTier = tier;
      }
      if (toAttainment >= tier.minAttainment && toAttainment < tier.maxAttainment) {
        toTier = tier;
      }
    }

    // Handle attainment above all tiers
    if (!toTier && this.sortedTiers.length > 0) {
      toTier = this.sortedTiers[this.sortedTiers.length - 1];
    }

    if (!fromTier || !toTier) {
      return { changed: false };
    }

    return {
      changed: fromTier.name !== toTier.name,
      fromTier: fromTier.name,
      toTier: toTier.name,
      rateChange: toTier.rate - fromTier.rate,
      multiplierChange: (toTier.multiplier || 1) - (fromTier.multiplier || 1)
    };
  }

  /**
   * Get tier for a given attainment level
   * @param {number} attainment - Quota attainment (decimal)
   * @returns {Object} Tier information
   */
  getTierForAttainment(attainment) {
    for (const tier of this.sortedTiers) {
      if (attainment >= tier.minAttainment && attainment < tier.maxAttainment) {
        return { ...tier };
      }
    }

    // Return highest tier if above all
    if (this.sortedTiers.length > 0) {
      return { ...this.sortedTiers[this.sortedTiers.length - 1] };
    }

    return null;
  }

  /**
   * Get all tiers with current rep position
   * @param {number} currentAttainment - Current quota attainment
   * @returns {Array} Tiers with position indicator
   */
  getTiersWithPosition(currentAttainment) {
    return this.sortedTiers.map(tier => ({
      ...tier,
      isCurrent: currentAttainment >= tier.minAttainment && currentAttainment < tier.maxAttainment,
      isPast: currentAttainment >= tier.maxAttainment,
      isFuture: currentAttainment < tier.minAttainment,
      progressPercent: tier.isCurrent
        ? ((currentAttainment - tier.minAttainment) / (tier.maxAttainment - tier.minAttainment)) * 100
        : (currentAttainment >= tier.maxAttainment ? 100 : 0)
    }));
  }

  /**
   * Calculate effective commission rate at a given attainment
   * @param {number} attainment - Quota attainment (decimal)
   * @returns {number} Effective rate
   */
  getEffectiveRate(attainment) {
    const tier = this.getTierForAttainment(attainment);
    return tier ? tier.rate : 0;
  }

  /**
   * Get plan summary
   * @returns {Object} Plan summary
   */
  getPlanSummary() {
    return {
      id: this.plan.id,
      name: this.plan.name,
      version: this.plan.version,
      status: this.plan.status,
      effectivePeriod: this.plan.effectivePeriod,
      roleCount: this.plan.roles?.length || 0,
      tierCount: this.sortedTiers.length,
      spifCount: this.plan.spifs?.length || 0,
      clawbackCount: this.plan.clawbacks?.length || 0,
      capEnabled: this.plan.cap?.enabled || false,
      drawEnabled: this.plan.draws?.enabled || false,
      splitsEnabled: this.plan.splits?.enabled || false
    };
  }
}

/**
 * Load a compensation plan from file
 * @param {string} planPath - Path to plan JSON file
 * @returns {CommissionFormulaEngine}
 */
function loadPlanFromFile(planPath) {
  const fullPath = path.resolve(planPath);
  const planJson = fs.readFileSync(fullPath, 'utf8');
  const plan = JSON.parse(planJson);
  return new CommissionFormulaEngine(plan);
}

/**
 * Load the default compensation plan
 * @returns {CommissionFormulaEngine}
 */
function loadDefaultPlan() {
  const defaultPlanPath = path.join(__dirname, '../../../config/default-comp-plan.json');
  return loadPlanFromFile(defaultPlanPath);
}

module.exports = {
  CommissionFormulaEngine,
  loadPlanFromFile,
  loadDefaultPlan
};

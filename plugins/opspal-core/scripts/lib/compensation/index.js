/**
 * Compensation Module
 *
 * Core compensation planning and commission calculation functionality.
 *
 * @module compensation
 * @version 1.0.0
 */

const { CommissionFormulaEngine, loadPlanFromFile, loadDefaultPlan } = require('./commission-formula-engine');
const { CompPlanRepository } = require('./comp-plan-repository');

module.exports = {
  // Core engine
  CommissionFormulaEngine,

  // Plan management
  CompPlanRepository,

  // Utility functions
  loadPlanFromFile,
  loadDefaultPlan,

  /**
   * Quick calculate commission for a deal
   * @param {Object} deal - Deal details
   * @param {Object} rep - Rep details
   * @param {Object} [plan] - Plan to use (uses default if not provided)
   * @returns {Object} Commission calculation result
   */
  quickCalculate(deal, rep, plan = null) {
    const engine = plan
      ? new CommissionFormulaEngine(plan)
      : loadDefaultPlan();
    return engine.calculateCommission(deal, rep);
  },

  /**
   * Create a new repository instance
   * @param {Object} [options] - Repository options
   * @returns {CompPlanRepository}
   */
  createRepository(options = {}) {
    return new CompPlanRepository(options);
  }
};

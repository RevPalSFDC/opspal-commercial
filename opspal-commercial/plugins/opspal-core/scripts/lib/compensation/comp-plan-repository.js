/**
 * Compensation Plan Repository
 *
 * Manages storage, retrieval, and versioning of compensation plans.
 * Supports JSON file storage with optional validation.
 *
 * @module compensation/comp-plan-repository
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { CommissionFormulaEngine } = require('./commission-formula-engine');

class CompPlanRepository {
  /**
   * Create a compensation plan repository
   * @param {Object} options - Repository options
   * @param {string} [options.storageDir] - Directory for plan storage
   * @param {boolean} [options.validateOnLoad] - Validate plans when loading
   * @param {boolean} [options.validateOnSave] - Validate plans when saving
   */
  constructor(options = {}) {
    this.storageDir = options.storageDir || path.join(__dirname, '../../config/comp-plans');
    this.validateOnLoad = options.validateOnLoad !== false;
    this.validateOnSave = options.validateOnSave !== false;

    // Schema for validation
    this.schemaPath = path.join(__dirname, '../../config/comp-plan-schema.json');

    // In-memory cache of loaded plans
    this.cache = new Map();

    // Ensure storage directory exists
    this._ensureStorageDir();
  }

  /**
   * Ensure storage directory exists
   * @private
   */
  _ensureStorageDir() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * Get path for a plan ID
   * @private
   */
  _getPlanPath(planId) {
    return path.join(this.storageDir, `${planId}.json`);
  }

  /**
   * Validate a plan against the schema
   * @param {Object} plan - Plan to validate
   * @returns {Object} Validation result
   */
  validatePlan(plan) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!plan.id) errors.push('Missing required field: id');
    if (!plan.name) errors.push('Missing required field: name');
    if (!plan.version) errors.push('Missing required field: version');
    if (!plan.effectivePeriod) errors.push('Missing required field: effectivePeriod');
    if (!plan.roles || plan.roles.length === 0) errors.push('At least one role is required');
    if (!plan.tiers || plan.tiers.length === 0) errors.push('At least one tier is required');

    // Validate tiers
    if (plan.tiers) {
      const sortedTiers = [...plan.tiers].sort((a, b) => a.minAttainment - b.minAttainment);

      for (let i = 0; i < sortedTiers.length; i++) {
        const tier = sortedTiers[i];

        if (tier.minAttainment === undefined) {
          errors.push(`Tier "${tier.name}": missing minAttainment`);
        }
        if (tier.maxAttainment === undefined) {
          errors.push(`Tier "${tier.name}": missing maxAttainment`);
        }
        if (tier.rate === undefined) {
          errors.push(`Tier "${tier.name}": missing rate`);
        }

        // Check for gaps between tiers
        if (i > 0) {
          const prevTier = sortedTiers[i - 1];
          if (tier.minAttainment > prevTier.maxAttainment) {
            warnings.push(`Gap between tiers "${prevTier.name}" and "${tier.name}": ${prevTier.maxAttainment} to ${tier.minAttainment}`);
          } else if (tier.minAttainment < prevTier.maxAttainment) {
            warnings.push(`Overlap between tiers "${prevTier.name}" and "${tier.name}"`);
          }
        }

        // Validate rate is reasonable
        if (tier.rate < 0 || tier.rate > 1) {
          warnings.push(`Tier "${tier.name}": rate ${tier.rate} is outside typical range (0-1)`);
        }
      }
    }

    // Validate roles
    if (plan.roles) {
      for (const role of plan.roles) {
        if (!role.roleId) errors.push('Role missing roleId');
        if (!role.ote || role.ote <= 0) errors.push(`Role "${role.roleId}": invalid OTE`);
        if (!role.quotaAmount || role.quotaAmount <= 0) {
          errors.push(`Role "${role.roleId}": invalid quotaAmount`);
        }

        // Check pay mix adds up to 1
        if (role.payMix) {
          const total = (role.payMix.base || 0) + (role.payMix.variable || 0);
          if (Math.abs(total - 1) > 0.01) {
            warnings.push(`Role "${role.roleId}": pay mix doesn't add up to 100% (${total * 100}%)`);
          }
        }

        // Check base + target commission = OTE
        if (role.baseSalary && role.targetCommission && role.ote) {
          const sum = role.baseSalary + role.targetCommission;
          if (Math.abs(sum - role.ote) > 1) {
            warnings.push(`Role "${role.roleId}": baseSalary + targetCommission (${sum}) doesn't equal OTE (${role.ote})`);
          }
        }
      }
    }

    // Validate SPIFs
    if (plan.spifs) {
      for (const spif of plan.spifs) {
        if (!spif.name) errors.push('SPIF missing name');
        if (!spif.startDate) errors.push(`SPIF "${spif.name}": missing startDate`);
        if (!spif.endDate) errors.push(`SPIF "${spif.name}": missing endDate`);

        // Check dates
        if (spif.startDate && spif.endDate) {
          const start = new Date(spif.startDate);
          const end = new Date(spif.endDate);
          if (start > end) {
            errors.push(`SPIF "${spif.name}": startDate is after endDate`);
          }
        }
      }
    }

    // Validate clawbacks
    if (plan.clawbacks) {
      for (const clawback of plan.clawbacks) {
        if (!clawback.name) errors.push('Clawback missing name');
        if (clawback.clawbackPercent < 0 || clawback.clawbackPercent > 1) {
          errors.push(`Clawback "${clawback.name}": clawbackPercent must be between 0 and 1`);
        }
      }
    }

    // Validate cap
    if (plan.cap && plan.cap.enabled) {
      if (!plan.cap.maxMultiplierOfOTE && !plan.cap.absoluteMax) {
        warnings.push('Cap is enabled but no limit is set');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Save a compensation plan
   * @param {Object} plan - Plan to save
   * @param {Object} [options] - Save options
   * @param {boolean} [options.overwrite] - Overwrite existing plan
   * @returns {Object} Save result
   */
  save(plan, options = {}) {
    // Validate if enabled
    if (this.validateOnSave) {
      const validation = this.validatePlan(plan);
      if (!validation.valid) {
        return {
          success: false,
          error: 'Validation failed',
          validationErrors: validation.errors,
          validationWarnings: validation.warnings
        };
      }
    }

    // Check for existing plan
    const planPath = this._getPlanPath(plan.id);
    if (fs.existsSync(planPath) && !options.overwrite) {
      return {
        success: false,
        error: `Plan "${plan.id}" already exists. Use overwrite: true to replace.`
      };
    }

    // Update metadata
    const now = new Date().toISOString();
    plan.metadata = plan.metadata || {};
    if (!plan.metadata.createdAt) {
      plan.metadata.createdAt = now;
    }
    plan.metadata.updatedAt = now;

    // Save to file
    try {
      fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8');

      // Update cache
      this.cache.set(plan.id, plan);

      return {
        success: true,
        planId: plan.id,
        path: planPath,
        version: plan.version
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to save plan: ${error.message}`
      };
    }
  }

  /**
   * Load a compensation plan by ID
   * @param {string} planId - Plan ID to load
   * @param {Object} [options] - Load options
   * @param {boolean} [options.useCache] - Use cached version if available
   * @returns {Object|null} Plan or null if not found
   */
  load(planId, options = {}) {
    // Check cache first
    if (options.useCache !== false && this.cache.has(planId)) {
      return this.cache.get(planId);
    }

    const planPath = this._getPlanPath(planId);

    if (!fs.existsSync(planPath)) {
      return null;
    }

    try {
      const planJson = fs.readFileSync(planPath, 'utf8');
      const plan = JSON.parse(planJson);

      // Validate if enabled
      if (this.validateOnLoad) {
        const validation = this.validatePlan(plan);
        if (!validation.valid) {
          console.warn(`Plan "${planId}" has validation errors:`, validation.errors);
        }
      }

      // Update cache
      this.cache.set(planId, plan);

      return plan;
    } catch (error) {
      console.error(`Failed to load plan "${planId}":`, error.message);
      return null;
    }
  }

  /**
   * Load default plan
   * @returns {Object|null}
   */
  loadDefault() {
    const defaultPath = path.join(__dirname, '../../config/default-comp-plan.json');
    if (!fs.existsSync(defaultPath)) {
      return null;
    }

    try {
      const planJson = fs.readFileSync(defaultPath, 'utf8');
      return JSON.parse(planJson);
    } catch (error) {
      console.error('Failed to load default plan:', error.message);
      return null;
    }
  }

  /**
   * Delete a compensation plan
   * @param {string} planId - Plan ID to delete
   * @returns {Object} Delete result
   */
  delete(planId) {
    const planPath = this._getPlanPath(planId);

    if (!fs.existsSync(planPath)) {
      return {
        success: false,
        error: `Plan "${planId}" not found`
      };
    }

    try {
      fs.unlinkSync(planPath);
      this.cache.delete(planId);

      return {
        success: true,
        planId
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete plan: ${error.message}`
      };
    }
  }

  /**
   * List all available plans
   * @param {Object} [options] - List options
   * @param {string} [options.status] - Filter by status
   * @param {string} [options.fiscalYear] - Filter by fiscal year
   * @returns {Array} List of plan summaries
   */
  list(options = {}) {
    const plans = [];

    if (!fs.existsSync(this.storageDir)) {
      return plans;
    }

    const files = fs.readdirSync(this.storageDir);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const planId = file.replace('.json', '');
      const plan = this.load(planId, { useCache: true });

      if (!plan) continue;

      // Apply filters
      if (options.status && plan.status !== options.status) continue;
      if (options.fiscalYear && plan.effectivePeriod?.fiscalYear !== options.fiscalYear) continue;

      plans.push({
        id: plan.id,
        name: plan.name,
        version: plan.version,
        status: plan.status,
        fiscalYear: plan.effectivePeriod?.fiscalYear,
        startDate: plan.effectivePeriod?.startDate,
        endDate: plan.effectivePeriod?.endDate,
        roleCount: plan.roles?.length || 0,
        tierCount: plan.tiers?.length || 0,
        updatedAt: plan.metadata?.updatedAt
      });
    }

    // Sort by updated date (most recent first)
    plans.sort((a, b) => {
      const dateA = new Date(a.updatedAt || 0);
      const dateB = new Date(b.updatedAt || 0);
      return dateB - dateA;
    });

    return plans;
  }

  /**
   * Create a new version of an existing plan
   * @param {string} planId - Source plan ID
   * @param {string} newVersion - New version string
   * @param {Object} [changes] - Changes to apply
   * @returns {Object} New plan or error
   */
  createVersion(planId, newVersion, changes = {}) {
    const sourcePlan = this.load(planId);

    if (!sourcePlan) {
      return {
        success: false,
        error: `Source plan "${planId}" not found`
      };
    }

    // Create new plan with version
    const newPlan = {
      ...sourcePlan,
      ...changes,
      id: `${planId}-v${newVersion.replace(/\./g, '-')}`,
      version: newVersion,
      metadata: {
        ...sourcePlan.metadata,
        createdAt: new Date().toISOString(),
        previousVersion: sourcePlan.version,
        previousPlanId: planId
      }
    };

    return this.save(newPlan);
  }

  /**
   * Clone a plan with a new ID
   * @param {string} sourcePlanId - Source plan ID
   * @param {string} newPlanId - New plan ID
   * @param {Object} [modifications] - Modifications to apply
   * @returns {Object} Clone result
   */
  clone(sourcePlanId, newPlanId, modifications = {}) {
    const sourcePlan = this.load(sourcePlanId);

    if (!sourcePlan) {
      return {
        success: false,
        error: `Source plan "${sourcePlanId}" not found`
      };
    }

    const newPlan = {
      ...sourcePlan,
      ...modifications,
      id: newPlanId,
      name: modifications.name || `${sourcePlan.name} (Copy)`,
      status: 'draft',
      metadata: {
        createdAt: new Date().toISOString(),
        clonedFrom: sourcePlanId
      }
    };

    return this.save(newPlan);
  }

  /**
   * Get a commission engine for a plan
   * @param {string} planId - Plan ID
   * @returns {CommissionFormulaEngine|null}
   */
  getEngine(planId) {
    const plan = this.load(planId);
    if (!plan) return null;

    return new CommissionFormulaEngine(plan);
  }

  /**
   * Compare two plans
   * @param {string} planId1 - First plan ID
   * @param {string} planId2 - Second plan ID
   * @returns {Object} Comparison result
   */
  compare(planId1, planId2) {
    const plan1 = this.load(planId1);
    const plan2 = this.load(planId2);

    if (!plan1 || !plan2) {
      return {
        success: false,
        error: `One or both plans not found`
      };
    }

    const differences = [];

    // Compare roles
    const roles1 = new Map((plan1.roles || []).map(r => [r.roleId, r]));
    const roles2 = new Map((plan2.roles || []).map(r => [r.roleId, r]));

    for (const [roleId, role1] of roles1) {
      const role2 = roles2.get(roleId);
      if (!role2) {
        differences.push({ type: 'role_removed', roleId, plan: planId2 });
      } else {
        if (role1.ote !== role2.ote) {
          differences.push({
            type: 'role_changed',
            roleId,
            field: 'ote',
            from: role1.ote,
            to: role2.ote
          });
        }
        if (role1.quotaAmount !== role2.quotaAmount) {
          differences.push({
            type: 'role_changed',
            roleId,
            field: 'quotaAmount',
            from: role1.quotaAmount,
            to: role2.quotaAmount
          });
        }
      }
    }

    for (const [roleId] of roles2) {
      if (!roles1.has(roleId)) {
        differences.push({ type: 'role_added', roleId, plan: planId2 });
      }
    }

    // Compare tiers
    const maxTiers = Math.max(plan1.tiers?.length || 0, plan2.tiers?.length || 0);
    for (let i = 0; i < maxTiers; i++) {
      const tier1 = plan1.tiers?.[i];
      const tier2 = plan2.tiers?.[i];

      if (!tier1) {
        differences.push({ type: 'tier_added', index: i, tier: tier2, plan: planId2 });
      } else if (!tier2) {
        differences.push({ type: 'tier_removed', index: i, tier: tier1, plan: planId2 });
      } else if (tier1.rate !== tier2.rate || tier1.minAttainment !== tier2.minAttainment) {
        differences.push({
          type: 'tier_changed',
          name: tier1.name,
          from: { rate: tier1.rate, min: tier1.minAttainment },
          to: { rate: tier2.rate, min: tier2.minAttainment }
        });
      }
    }

    return {
      success: true,
      plan1: { id: planId1, name: plan1.name, version: plan1.version },
      plan2: { id: planId2, name: plan2.name, version: plan2.version },
      differences,
      hasDifferences: differences.length > 0
    };
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get storage statistics
   * @returns {Object}
   */
  getStats() {
    const plans = this.list();
    const byStatus = {};
    const byFiscalYear = {};

    for (const plan of plans) {
      byStatus[plan.status] = (byStatus[plan.status] || 0) + 1;
      if (plan.fiscalYear) {
        byFiscalYear[plan.fiscalYear] = (byFiscalYear[plan.fiscalYear] || 0) + 1;
      }
    }

    return {
      totalPlans: plans.length,
      cachedPlans: this.cache.size,
      byStatus,
      byFiscalYear,
      storageDir: this.storageDir
    };
  }
}

module.exports = { CompPlanRepository };

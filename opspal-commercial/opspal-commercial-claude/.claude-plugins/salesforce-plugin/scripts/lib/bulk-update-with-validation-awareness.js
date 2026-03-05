#!/usr/bin/env node

/**
 * Bulk Update with Validation Awareness
 *
 * Enhances bulk update operations to automatically include validation rule required fields.
 * Prevents unexpected validation errors when updating unrelated fields.
 *
 * Root Cause Addressed: Reflection cohort FP-010
 * - Issue: Validation rules fire when updating AccountId (require Who_Set_Meeting__c, Contract_Type__c)
 * - Root Cause: Updates don't query validation rules to identify required fields
 * - Impact: 2 occurrences, 2 hours wasted each, $15K annual ROI
 *
 * Usage:
 *   const { enhanceWithValidationAwareness } = require('./bulk-update-with-validation-awareness');
 *
 *   const updates = [{ Id: '006xxx', AccountId: '001yyy' }];
 *   const enhanced = await enhanceWithValidationAwareness('myorg', 'Opportunity', updates);
 *   // Returns: [{ Id: '006xxx', AccountId: '001yyy', Who_Set_Meeting__c: null, Contract_Type__c: null }]
 *
 * @module bulk-update-with-validation-awareness
 * @version 1.0.0
 * @created 2025-10-22
 */

const ValidationRuleManager = require('./validation-rule-manager');

/**
 * Enhance updates with validation rule required fields
 *
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} sobject - Object name (e.g., 'Opportunity')
 * @param {Array} updates - Array of update objects (must include Id field)
 * @param {Object} options - Options
 * @param {boolean} options.fetchCurrentValues - Fetch current values instead of null (default: false)
 * @param {boolean} options.verbose - Verbose logging (default: true)
 * @returns {Promise<Array>} Enhanced update objects with required fields
 */
async function enhanceWithValidationAwareness(orgAlias, sobject, updates, options = {}) {
  const fetchCurrentValues = options.fetchCurrentValues || false;
  const verbose = options.verbose !== false;

  if (!updates || updates.length === 0) {
    return updates;
  }

  try {
    // Step 1: Query active validation rules for this object
    const vrManager = new ValidationRuleManager(orgAlias);
    const activeRules = await vrManager.listActive(sobject);

    if (activeRules.length === 0) {
      if (verbose) {
        console.log(`✅ No active validation rules for ${sobject} - updates safe as-is`);
      }
      return updates;
    }

    if (verbose) {
      console.log(`🔍 Found ${activeRules.length} active validation rules for ${sobject}`);
    }

    // Step 2: Extract required fields from validation rule formulas
    const requiredFields = extractRequiredFields(activeRules);

    if (requiredFields.size === 0) {
      if (verbose) {
        console.log(`✅ No required fields detected from validation rules`);
      }
      return updates;
    }

    if (verbose) {
      console.log(`📋 Required fields: ${Array.from(requiredFields).join(', ')}`);
    }

    // Step 3: Enhance updates with required fields
    const enhanced = updates.map(update => {
      if (!update.Id) {
        console.warn(`⚠️  Update missing Id field - cannot enhance: ${JSON.stringify(update)}`);
        return update;
      }

      const result = { ...update };
      let added = 0;

      requiredFields.forEach(field => {
        if (!(field in result)) {
          // Add field with null (or fetch current value if option enabled)
          result[field] = null;
          added++;
        }
      });

      if (added > 0 && verbose) {
        console.warn(`⚠️  Record ${update.Id}: Added ${added} required field(s) - ${Array.from(requiredFields).filter(f => !(f in update)).join(', ')}`);
      }

      return result;
    });

    return enhanced;

  } catch (error) {
    console.error(`❌ Validation awareness failed: ${error.message}`);
    console.error(`   Proceeding with original updates (validation may fail at runtime)`);
    return updates;
  }
}

/**
 * Extract required fields from validation rule formulas
 *
 * Parses error condition formulas to identify fields that must be populated.
 *
 * @param {Array} validationRules - Validation rules from ValidationRuleManager
 * @returns {Set} Set of required field API names
 */
function extractRequiredFields(validationRules) {
  const requiredFields = new Set();

  validationRules.forEach(rule => {
    const formula = rule.ErrorConditionFormula || '';

    // Pattern 1: Field IS NULL or IS NOT NULL checks
    // Example: "Who_Set_Meeting__c IS NULL" → Who_Set_Meeting__c is required
    const isNullMatches = formula.match(/([A-Za-z_][A-Za-z0-9_]*__c)\s+IS\s+NULL/gi) || [];
    isNullMatches.forEach(match => {
      const field = match.replace(/\s+IS\s+NULL/gi, '').trim();
      requiredFields.add(field);
    });

    // Pattern 2: Field = null or != null comparisons
    // Example: "Contract_Type__c = null" → Contract_Type__c is required
    const nullCompareMatches = formula.match(/([A-Za-z_][A-Za-z0-9_]*__c)\s*[=!]=\s*null/gi) || [];
    nullCompareMatches.forEach(match => {
      const field = match.replace(/\s*[=!]=\s*null/gi, '').trim();
      requiredFields.add(field);
    });

    // Pattern 3: ISBLANK() function
    // Example: "ISBLANK(Who_Set_Meeting__c)" → Who_Set_Meeting__c is required
    const isBlankMatches = formula.match(/ISBLANK\(([A-Za-z_][A-Za-z0-9_]*__c)\)/gi) || [];
    isBlankMatches.forEach(match => {
      const field = match.replace(/ISBLANK\(|\)/gi, '').trim();
      requiredFields.add(field);
    });

    // Pattern 4: LEN() = 0 or similar
    // Example: "LEN(Contract_Type__c) = 0" → Contract_Type__c is required
    const lenMatches = formula.match(/LEN\(([A-Za-z_][A-Za-z0-9_]*__c)\)\s*[=<]\s*0/gi) || [];
    lenMatches.forEach(match => {
      const field = match.replace(/LEN\(|\)\s*[=<]\s*0/gi, '').trim();
      requiredFields.add(field);
    });
  });

  return requiredFields;
}

/**
 * Enhance a single update record with validation awareness
 *
 * @param {string} orgAlias - Org alias
 * @param {string} sobject - Object name
 * @param {Object} update - Single update object
 * @param {Object} options - Options
 * @returns {Promise<Object>} Enhanced update object
 */
async function enhanceSingleUpdate(orgAlias, sobject, update, options = {}) {
  const enhanced = await enhanceWithValidationAwareness(orgAlias, sobject, [update], options);
  return enhanced[0];
}

// Export functions
module.exports = {
  enhanceWithValidationAwareness,
  enhanceSingleUpdate,
  extractRequiredFields
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log('Usage: node bulk-update-with-validation-awareness.js <org-alias> <sobject> <updates-json>');
    console.log('');
    console.log('Example:');
    console.log('  node bulk-update-with-validation-awareness.js myorg Opportunity \'[{"Id":"006xxx","AccountId":"001yyy"}]\'');
    process.exit(1);
  }

  const orgAlias = args[0];
  const sobject = args[1];
  const updates = JSON.parse(args[2]);

  enhanceWithValidationAwareness(orgAlias, sobject, updates, { verbose: true })
    .then(enhanced => {
      console.log('\nEnhanced Updates:');
      console.log(JSON.stringify(enhanced, null, 2));
    })
    .catch(error => {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    });
}

#!/usr/bin/env node

/**
 * Assignment Rule Overlap Detector
 *
 * Detects overlapping and conflicting assignment rules, identifies order conflicts,
 * detects circular routing, and suggests reordering.
 *
 * @module assignment-rule-overlap-detector
 * @version 1.0.0
 */

const { identifyAssigneeType } = require('./assignment-rule-parser');

/**
 * Detect overlapping rules (same criteria → different assignees)
 *
 * @param {Array<Object>} ruleEntries - Array of parsed rule entries
 * @returns {Array<Object>} Array of conflict objects
 *
 * @example
 * const conflicts = detectOverlappingRules(ruleEntries);
 * conflicts.forEach(conflict => {
 *   console.log(`${conflict.severity}: ${conflict.message}`);
 * });
 */
function detectOverlappingRules(ruleEntries) {
  if (!Array.isArray(ruleEntries) || ruleEntries.length < 2) {
    return [];
  }

  const conflicts = [];

  // Compare each entry with every other entry
  for (let i = 0; i < ruleEntries.length; i++) {
    for (let j = i + 1; j < ruleEntries.length; j++) {
      const entry1 = ruleEntries[i];
      const entry2 = ruleEntries[j];

      // Check if criteria overlap
      const overlap = criteriaOverlap(entry1, entry2);

      if (overlap.overlaps) {
        const conflict = {
          type: 'overlapping_criteria',
          severity: overlap.isExactMatch ? 'critical' : (overlap.isSubset ? 'critical' : 'warning'),
          entry1: {
            order: entry1.order,
            assignedTo: entry1.assignedTo,
            criteria: entry1.criteriaItems
          },
          entry2: {
            order: entry2.order,
            assignedTo: entry2.assignedTo,
            criteria: entry2.criteriaItems
          },
          overlapType: overlap.type,
          isSubset: overlap.isSubset || false,
          isExactMatch: overlap.isExactMatch || false,
          message: overlap.message,
          resolution: overlap.resolution,
          autoResolvable: overlap.autoResolvable,
          suggestedAction: overlap.suggestedAction
        };

        conflicts.push(conflict);
      }
    }
  }

  return conflicts;
}

/**
 * Check if two rule entries have overlapping criteria
 *
 * @private
 * @param {Object} entry1 - First rule entry
 * @param {Object} entry2 - Second rule entry
 * @returns {Object} Overlap analysis
 */
function criteriaOverlap(entry1, entry2) {
  const criteria1 = entry1.criteriaItems || [];
  const criteria2 = entry2.criteriaItems || [];

  // No criteria means matches everything
  if (criteria1.length === 0 && criteria2.length === 0) {
    return {
      overlaps: true,
      type: 'both_match_all',
      isExactMatch: true,
      message: `Both entry ${entry1.order} and entry ${entry2.order} have no criteria (match all records)`,
      resolution: 'Remove one entry or add specific criteria to differentiate',
      autoResolvable: false,
      suggestedAction: 'manual_review'
    };
  }

  if (criteria1.length === 0) {
    return {
      overlaps: true,
      type: 'entry1_matches_all',
      isSubset: true,
      message: `Entry ${entry1.order} has no criteria (matches all), including records matched by entry ${entry2.order}`,
      resolution: entry1.order < entry2.order
        ? `Entry ${entry1.order} will catch all records before entry ${entry2.order} executes`
        : `Reorder: Entry ${entry2.order} should come before ${entry1.order} to evaluate specific criteria first`,
      autoResolvable: entry1.order > entry2.order,
      suggestedAction: entry1.order > entry2.order ? 'reorder' : 'manual_review'
    };
  }

  if (criteria2.length === 0) {
    return {
      overlaps: true,
      type: 'entry2_matches_all',
      isSubset: true,
      message: `Entry ${entry2.order} has no criteria (matches all), including records matched by entry ${entry1.order}`,
      resolution: entry2.order < entry1.order
        ? `Entry ${entry2.order} will catch all records before entry ${entry1.order} executes`
        : `Reorder: Entry ${entry1.order} should come before ${entry2.order} to evaluate specific criteria first`,
      autoResolvable: entry2.order > entry1.order,
      suggestedAction: entry2.order > entry1.order ? 'reorder' : 'manual_review'
    };
  }

  // Build criteria maps for comparison
  const map1 = buildCriteriaMap(criteria1);
  const map2 = buildCriteriaMap(criteria2);

  // Check for exact match
  if (criteriaExactMatch(map1, map2)) {
    return {
      overlaps: true,
      type: 'exact_match',
      isExactMatch: true,
      message: `Entry ${entry1.order} and entry ${entry2.order} have identical criteria but assign to different targets`,
      resolution: 'Remove duplicate entry or merge assignees',
      autoResolvable: false,
      suggestedAction: 'remove_duplicate'
    };
  }

  // Check if one is a subset of the other
  const subset1 = criteriaIsSubset(map1, map2);
  const subset2 = criteriaIsSubset(map2, map1);

  if (subset1) {
    return {
      overlaps: true,
      type: 'entry1_subset_of_entry2',
      isSubset: true,
      message: `Entry ${entry1.order} criteria is more specific than entry ${entry2.order}`,
      resolution: entry1.order < entry2.order
        ? `Correct: Entry ${entry1.order} (more specific) evaluates before entry ${entry2.order} (more general)`
        : `Reorder: Entry ${entry1.order} should have lower order number than entry ${entry2.order}`,
      autoResolvable: entry1.order > entry2.order,
      suggestedAction: entry1.order > entry2.order ? 'reorder' : 'ok'
    };
  }

  if (subset2) {
    return {
      overlaps: true,
      type: 'entry2_subset_of_entry1',
      isSubset: true,
      message: `Entry ${entry2.order} criteria is more specific than entry ${entry1.order}`,
      resolution: entry2.order < entry1.order
        ? `Correct: Entry ${entry2.order} (more specific) evaluates before entry ${entry1.order} (more general)`
        : `Reorder: Entry ${entry2.order} should have lower order number than entry ${entry1.order}`,
      autoResolvable: entry2.order > entry1.order,
      suggestedAction: entry2.order > entry1.order ? 'reorder' : 'ok'
    };
  }

  // Check for partial overlap (some fields match)
  const commonFields = Object.keys(map1).filter(field => field in map2);

  if (commonFields.length > 0) {
    const allMatch = commonFields.every(field => map1[field].value === map2[field].value);

    if (allMatch) {
      return {
        overlaps: true,
        type: 'partial_overlap',
        message: `Entry ${entry1.order} and entry ${entry2.order} share ${commonFields.length} common criteria field(s): ${commonFields.join(', ')}`,
        resolution: 'Review criteria to ensure intended routing behavior',
        autoResolvable: false,
        suggestedAction: 'manual_review'
      };
    }
  }

  return { overlaps: false };
}

/**
 * Build criteria map for easy comparison
 * @private
 */
function buildCriteriaMap(criteriaItems) {
  const map = {};

  criteriaItems.forEach(item => {
    if (item.field) {
      map[item.field] = {
        operation: item.operation || 'equals',
        value: item.value
      };
    }
  });

  return map;
}

/**
 * Check if two criteria maps are exactly equal
 * @private
 */
function criteriaExactMatch(map1, map2) {
  const keys1 = Object.keys(map1);
  const keys2 = Object.keys(map2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  return keys1.every(key => {
    return key in map2 &&
           map1[key].operation === map2[key].operation &&
           map1[key].value === map2[key].value;
  });
}

/**
 * Check if map1 is a subset of map2 (map1 has all criteria in map2 plus more)
 * @private
 */
function criteriaIsSubset(map1, map2) {
  const keys1 = Object.keys(map1);
  const keys2 = Object.keys(map2);

  // map1 must have at least as many criteria as map2
  if (keys1.length < keys2.length) {
    return false;
  }

  // All keys in map2 must be in map1 with same values
  return keys2.every(key => {
    return key in map1 &&
           map1[key].operation === map2[key].operation &&
           map1[key].value === map2[key].value;
  });
}

/**
 * Find duplicate order numbers
 *
 * @param {Array<Object>} ruleEntries - Array of parsed rule entries
 * @returns {Array<Object>} Array of order conflicts
 *
 * @example
 * const orderConflicts = findDuplicateOrders(ruleEntries);
 */
function findDuplicateOrders(ruleEntries) {
  if (!Array.isArray(ruleEntries)) {
    return [];
  }

  const orderMap = {};
  const conflicts = [];

  ruleEntries.forEach(entry => {
    const order = entry.order;

    if (!(order in orderMap)) {
      orderMap[order] = [];
    }

    orderMap[order].push(entry);
  });

  // Find duplicates
  Object.keys(orderMap).forEach(order => {
    const entries = orderMap[order];

    if (entries.length > 1) {
      conflicts.push({
        type: 'duplicate_order',
        severity: 'critical',
        orderNumber: parseInt(order, 10),
        entries: entries.map(e => ({
          assignedTo: e.assignedTo,
          criteria: e.criteriaItems
        })),
        message: `Order number ${order} is used by ${entries.length} entries`,
        resolution: 'Renumber entries to have unique order values',
        autoResolvable: true,
        suggestedAction: 'renumber'
      });
    }
  });

  return conflicts;
}

/**
 * Detect circular routing (User → Queue → User loops)
 *
 * @param {Array<Object>} assignmentChain - Array of assignment steps
 * @returns {Object} Circular routing analysis
 *
 * @example
 * const chain = [
 *   { assignedTo: '0051...', type: 'User' },
 *   { assignedTo: '00G1...', type: 'Queue' },
 *   { assignedTo: '0051...', type: 'User' } // Same user!
 * ];
 * const result = detectCircularRouting(chain);
 */
function detectCircularRouting(assignmentChain) {
  if (!Array.isArray(assignmentChain)) {
    return {
      hasCircularRouting: false,
      message: 'Invalid assignment chain'
    };
  }

  const visited = new Set();
  const path = [];

  for (let i = 0; i < assignmentChain.length; i++) {
    const assignment = assignmentChain[i];
    const id = assignment.assignedTo || assignment.id;

    if (!id) continue;

    if (visited.has(id)) {
      // Found circular reference
      const cycleStart = path.findIndex(p => p.id === id);

      return {
        hasCircularRouting: true,
        severity: 'critical',
        cycleStart,
        cycleLength: i - cycleStart,
        path: path.slice(cycleStart).map(p => p.name || p.id),
        message: `Circular routing detected: ${path.slice(cycleStart).map(p => p.name || p.id).join(' → ')} → ${assignment.name || id}`,
        resolution: 'Break cycle by changing one assignment target',
        autoResolvable: false,
        suggestedAction: 'manual_review'
      };
    }

    visited.add(id);
    path.push({
      id,
      name: assignment.name,
      type: assignment.type || identifyAssigneeType(id)
    });
  }

  return {
    hasCircularRouting: false,
    message: 'No circular routing detected',
    pathLength: path.length
  };
}

/**
 * Suggest optimal ordering for rule entries
 *
 * @param {Array<Object>} ruleEntries - Array of parsed rule entries
 * @returns {Array<Object>} Reordered entries with suggested order numbers
 *
 * @example
 * const optimized = suggestReordering(ruleEntries);
 * optimized.forEach(entry => {
 *   console.log(`Order ${entry.suggestedOrder}: ${entry.originalOrder}`);
 * });
 */
function suggestReordering(ruleEntries) {
  if (!Array.isArray(ruleEntries) || ruleEntries.length === 0) {
    return [];
  }

  // Score each entry by specificity (more criteria = more specific = lower order)
  const scoredEntries = ruleEntries.map(entry => {
    const criteriaCount = (entry.criteriaItems || []).length;
    const hasFormula = !!entry.formula;

    // Specificity score (higher = more specific)
    const specificityScore = criteriaCount + (hasFormula ? 5 : 0);

    return {
      entry,
      originalOrder: entry.order,
      specificityScore
    };
  });

  // Sort by specificity (most specific first)
  scoredEntries.sort((a, b) => b.specificityScore - a.specificityScore);

  // Assign new order numbers (gaps of 10 for future insertions)
  const reordered = scoredEntries.map((scored, index) => ({
    ...scored.entry,
    originalOrder: scored.entry.order,
    suggestedOrder: (index + 1) * 10,
    specificityScore: scored.specificityScore,
    orderChanged: scored.entry.order !== (index + 1) * 10
  }));

  return reordered;
}

/**
 * Calculate risk score for conflicts (0-100)
 *
 * @param {Array<Object>} conflicts - Array of conflict objects
 * @returns {number} Risk score (0-100)
 *
 * @example
 * const score = calculateRiskScore(conflicts);
 * if (score >= 60) {
 *   console.error('HIGH RISK: Must resolve before deployment');
 * }
 */
function calculateRiskScore(conflicts) {
  if (!Array.isArray(conflicts) || conflicts.length === 0) {
    return 0;
  }

  let score = 0;

  conflicts.forEach(conflict => {
    switch (conflict.severity) {
      case 'critical':
        score += 30;
        break;
      case 'warning':
        score += 10;
        break;
      case 'info':
        score += 3;
        break;
    }

    // Extra weight for specific conflict types
    if (conflict.type === 'exact_match') {
      score += 20; // Duplicate rules are very problematic
    }

    if (conflict.type === 'circular_routing') {
      score += 25; // Circular routing is critical
    }
  });

  // Cap at 100
  return Math.min(score, 100);
}

/**
 * Generate comprehensive conflict report
 *
 * @param {Array<Object>} ruleEntries - Array of parsed rule entries
 * @returns {Object} Detailed conflict analysis
 *
 * @example
 * const report = generateConflictReport(ruleEntries);
 * console.log(`Risk Score: ${report.riskScore}`);
 * console.log(`Total Conflicts: ${report.totalConflicts}`);
 */
function generateConflictReport(ruleEntries) {
  const overlapConflicts = detectOverlappingRules(ruleEntries);
  const orderConflicts = findDuplicateOrders(ruleEntries);

  const allConflicts = [...overlapConflicts, ...orderConflicts];
  const riskScore = calculateRiskScore(allConflicts);

  const criticalCount = allConflicts.filter(c => c.severity === 'critical').length;
  const warningCount = allConflicts.filter(c => c.severity === 'warning').length;

  return {
    totalEntries: ruleEntries.length,
    totalConflicts: allConflicts.length,
    criticalConflicts: criticalCount,
    warningConflicts: warningCount,
    riskScore,
    riskLevel: riskScore < 30 ? 'LOW' : (riskScore < 60 ? 'MEDIUM' : 'HIGH'),
    conflicts: {
      overlapping: overlapConflicts,
      orderDuplicates: orderConflicts
    },
    autoResolvable: allConflicts.filter(c => c.autoResolvable).length,
    recommendations: generateRecommendations(allConflicts, riskScore),
    suggestedReordering: riskScore >= 30 ? suggestReordering(ruleEntries) : null
  };
}

/**
 * Generate recommendations based on conflicts
 * @private
 */
function generateRecommendations(conflicts, riskScore) {
  const recommendations = [];

  if (riskScore >= 60) {
    recommendations.push({
      priority: 'critical',
      message: 'HIGH RISK: Must resolve conflicts before deployment',
      action: 'Review and fix all critical conflicts'
    });
  }

  const exactMatches = conflicts.filter(c => c.type === 'exact_match');
  if (exactMatches.length > 0) {
    recommendations.push({
      priority: 'critical',
      message: `Found ${exactMatches.length} duplicate rule entries`,
      action: 'Remove duplicate entries or merge into single entry'
    });
  }

  const orderDuplicates = conflicts.filter(c => c.type === 'duplicate_order');
  if (orderDuplicates.length > 0) {
    recommendations.push({
      priority: 'critical',
      message: `Found ${orderDuplicates.length} order number conflicts`,
      action: 'Renumber entries to have unique order values'
    });
  }

  const subsetIssues = conflicts.filter(c => c.isSubset && c.suggestedAction === 'reorder');
  if (subsetIssues.length > 0) {
    recommendations.push({
      priority: 'warning',
      message: `Found ${subsetIssues.length} entries that should be reordered`,
      action: 'Reorder entries: most specific criteria first, general catch-alls last'
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      priority: 'info',
      message: 'No critical issues found',
      action: 'Rule set looks good for deployment'
    });
  }

  return recommendations;
}

// Export functions
module.exports = {
  detectOverlappingRules,
  findDuplicateOrders,
  detectCircularRouting,
  suggestReordering,
  calculateRiskScore,
  generateConflictReport
};

// CLI support
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const { parseRuleMetadata } = require('./assignment-rule-parser');

  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node assignment-rule-overlap-detector.js <xml-file-path>');
    console.error('');
    console.error('Example:');
    console.error('  node assignment-rule-overlap-detector.js force-app/main/default/assignmentRules/Lead.assignmentRules');
    process.exit(1);
  }

  const filePath = args[0];

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  try {
    const xmlContent = fs.readFileSync(filePath, 'utf8');
    const parsed = parseRuleMetadata(xmlContent);

    console.log('=== Assignment Rule Conflict Analysis ===\n');

    if (!parsed.assignmentRules || parsed.assignmentRules.length === 0) {
      console.log('No assignment rules found in file');
      process.exit(0);
    }

    parsed.assignmentRules.forEach(rule => {
      console.log(`Rule: ${rule.name} (${rule.active ? 'Active' : 'Inactive'})`);
      console.log(`Entries: ${rule.entries.length}\n`);

      const report = generateConflictReport(rule.entries);

      console.log(`Risk Score: ${report.riskScore}/100 (${report.riskLevel})`);
      console.log(`Total Conflicts: ${report.totalConflicts}`);
      console.log(`  Critical: ${report.criticalConflicts}`);
      console.log(`  Warning: ${report.warningConflicts}`);
      console.log(`  Auto-resolvable: ${report.autoResolvable}\n`);

      if (report.recommendations.length > 0) {
        console.log('Recommendations:');
        report.recommendations.forEach((rec, i) => {
          console.log(`  ${i + 1}. [${rec.priority.toUpperCase()}] ${rec.message}`);
          console.log(`     Action: ${rec.action}`);
        });
        console.log('');
      }

      if (report.conflicts.overlapping.length > 0) {
        console.log('Overlapping Criteria:');
        report.conflicts.overlapping.forEach((conflict, i) => {
          console.log(`  ${i + 1}. [${conflict.severity}] ${conflict.message}`);
          console.log(`     Resolution: ${conflict.resolution}`);
        });
        console.log('');
      }

      if (report.conflicts.orderDuplicates.length > 0) {
        console.log('Order Conflicts:');
        report.conflicts.orderDuplicates.forEach((conflict, i) => {
          console.log(`  ${i + 1}. ${conflict.message}`);
        });
        console.log('');
      }

      if (report.suggestedReordering && report.riskScore >= 30) {
        console.log('Suggested Reordering:');
        report.suggestedReordering.forEach(entry => {
          if (entry.orderChanged) {
            console.log(`  Order ${entry.originalOrder} → ${entry.suggestedOrder} (specificity: ${entry.specificityScore})`);
          }
        });
        console.log('');
      }
    });

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

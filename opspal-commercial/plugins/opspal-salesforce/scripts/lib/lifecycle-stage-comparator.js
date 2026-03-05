#!/usr/bin/env node

/**
 * Lifecycle Stage Comparator
 *
 * Compares lifecycle stages across records to determine which is "most advanced."
 * Used for deduplication, data aggregation, and "winning record" selection.
 *
 * Problem Solved (Reflection Cohort: Data Quality & Aggregation):
 *   Agents needed consistent logic to determine which record/stage is "most
 *   advanced" when merging duplicates or aggregating data across systems.
 *
 * Features:
 *   - Pre-defined stage hierarchies for common objects (Lead, Opportunity, Account)
 *   - Custom hierarchy support via configuration
 *   - Tie-breaker logic (most recent, most complete, etc.)
 *   - Batch comparison for multiple records
 *
 * Usage:
 *   const comparator = require('./lifecycle-stage-comparator');
 *
 *   // Compare two stages
 *   const result = comparator.compare('Opportunity', 'Prospecting', 'Qualification');
 *   // result: { winner: 'Qualification', winnerIndex: 1, reason: 'Higher stage position' }
 *
 *   // Find most advanced from array
 *   const best = comparator.findMostAdvanced('Lead', ['New', 'Working', 'Converted', 'Working']);
 *   // best: { stage: 'Converted', indices: [2], count: 1 }
 *
 * @module lifecycle-stage-comparator
 * @version 1.0.0
 * @created 2025-11-27
 * @source Reflection Cohort - Data Quality & Aggregation (Asana: 1212204315832256)
 */

// =============================================================================
// Default Stage Hierarchies (0 = earliest, higher = more advanced)
// =============================================================================

const DEFAULT_HIERARCHIES = {
    // Lead stages (standard Salesforce)
    Lead: {
        'Open - Not Contacted': 0,
        'New': 1,
        'Working - Contacted': 2,
        'Working': 2,
        'Contacted': 2,
        'Nurturing': 3,
        'Qualified': 4,
        'Unqualified': -1,  // Terminal negative
        'Converted': 5      // Terminal positive (highest)
    },

    // Opportunity stages (standard Salesforce)
    Opportunity: {
        'Prospecting': 0,
        'Qualification': 1,
        'Needs Analysis': 2,
        'Value Proposition': 3,
        'Id. Decision Makers': 4,
        'Perception Analysis': 5,
        'Proposal/Price Quote': 6,
        'Negotiation/Review': 7,
        'Closed Won': 8,     // Terminal positive (highest)
        'Closed Lost': -1    // Terminal negative
    },

    // Account lifecycle stages (custom but common)
    Account: {
        'Prospect': 0,
        'Lead': 1,
        'Opportunity': 2,
        'Customer': 3,
        'Active Customer': 4,
        'At Risk': 3,        // Same as Customer but flagged
        'Churned': -1,       // Terminal negative
        'Former Customer': -1
    },

    // Contact engagement stages
    Contact: {
        'Unknown': 0,
        'Cold': 1,
        'Warm': 2,
        'Hot': 3,
        'Engaged': 4,
        'Champion': 5,
        'Inactive': -1       // Terminal negative
    },

    // Case stages
    Case: {
        'New': 0,
        'Working': 1,
        'In Progress': 1,
        'Escalated': 2,
        'On Hold': 1,
        'Waiting on Customer': 1,
        'Resolved': 3,
        'Closed': 4          // Terminal
    }
};

// =============================================================================
// Configuration
// =============================================================================

let customHierarchies = {};

/**
 * Register a custom stage hierarchy for an object
 *
 * @param {string} objectName - Salesforce object name
 * @param {Object} hierarchy - Map of stage name to position (0-based, higher = more advanced)
 */
function registerHierarchy(objectName, hierarchy) {
    customHierarchies[objectName] = hierarchy;
}

/**
 * Get the hierarchy for an object (custom takes precedence)
 *
 * @param {string} objectName - Salesforce object name
 * @returns {Object|null} Stage hierarchy or null if not found
 */
function getHierarchy(objectName) {
    return customHierarchies[objectName] || DEFAULT_HIERARCHIES[objectName] || null;
}

/**
 * List all available hierarchies
 *
 * @returns {string[]} List of object names with registered hierarchies
 */
function listHierarchies() {
    return [...new Set([
        ...Object.keys(DEFAULT_HIERARCHIES),
        ...Object.keys(customHierarchies)
    ])];
}

// =============================================================================
// Core Comparison Functions
// =============================================================================

/**
 * Get the position of a stage in the hierarchy
 *
 * @param {string} objectName - Salesforce object name
 * @param {string} stage - Stage value
 * @returns {number|null} Position (higher = more advanced), null if not found
 */
function getStagePosition(objectName, stage) {
    const hierarchy = getHierarchy(objectName);
    if (!hierarchy) return null;

    // Try exact match first
    if (hierarchy[stage] !== undefined) {
        return hierarchy[stage];
    }

    // Try case-insensitive match
    const lowerStage = stage.toLowerCase();
    for (const [key, value] of Object.entries(hierarchy)) {
        if (key.toLowerCase() === lowerStage) {
            return value;
        }
    }

    return null;
}

/**
 * Compare two stages to determine which is more advanced
 *
 * @param {string} objectName - Salesforce object name
 * @param {string} stage1 - First stage value
 * @param {string} stage2 - Second stage value
 * @param {Object} options - Comparison options
 * @param {boolean} options.treatUnknownAsLowest - Treat unknown stages as position -999
 * @returns {Object} Comparison result
 */
function compare(objectName, stage1, stage2, options = {}) {
    const { treatUnknownAsLowest = true } = options;

    const pos1 = getStagePosition(objectName, stage1);
    const pos2 = getStagePosition(objectName, stage2);

    const result = {
        stage1: { value: stage1, position: pos1 },
        stage2: { value: stage2, position: pos2 },
        winner: null,
        winnerIndex: -1,
        reason: null
    };

    // Handle unknown stages
    const effectivePos1 = pos1 !== null ? pos1 : (treatUnknownAsLowest ? -999 : null);
    const effectivePos2 = pos2 !== null ? pos2 : (treatUnknownAsLowest ? -999 : null);

    if (effectivePos1 === null || effectivePos2 === null) {
        result.reason = 'Unknown stage(s) and treatUnknownAsLowest is false';
        return result;
    }

    if (effectivePos1 > effectivePos2) {
        result.winner = stage1;
        result.winnerIndex = 0;
        result.reason = pos1 !== null ? 'Higher stage position' : 'Other stage is unknown';
    } else if (effectivePos2 > effectivePos1) {
        result.winner = stage2;
        result.winnerIndex = 1;
        result.reason = pos2 !== null ? 'Higher stage position' : 'Other stage is unknown';
    } else {
        // Tie - both are equal
        result.winner = stage1; // Arbitrary choice for ties
        result.winnerIndex = 0;
        result.reason = 'Equal positions (tie)';
    }

    return result;
}

/**
 * Find the most advanced stage from an array
 *
 * @param {string} objectName - Salesforce object name
 * @param {string[]} stages - Array of stage values
 * @param {Object} options - Options
 * @returns {Object} Most advanced stage info
 */
function findMostAdvanced(objectName, stages, options = {}) {
    if (!stages || stages.length === 0) {
        return { stage: null, indices: [], count: 0, reason: 'Empty input' };
    }

    let maxPosition = -Infinity;
    let maxStage = null;
    let maxIndices = [];

    stages.forEach((stage, index) => {
        const pos = getStagePosition(objectName, stage);
        const effectivePos = pos !== null ? pos : -999;

        if (effectivePos > maxPosition) {
            maxPosition = effectivePos;
            maxStage = stage;
            maxIndices = [index];
        } else if (effectivePos === maxPosition) {
            maxIndices.push(index);
        }
    });

    return {
        stage: maxStage,
        position: maxPosition === -Infinity ? null : maxPosition,
        indices: maxIndices,
        count: maxIndices.length,
        isTerminalPositive: maxPosition >= 0 && isTerminalPositive(objectName, maxStage),
        isTerminalNegative: isTerminalNegative(objectName, maxStage)
    };
}

/**
 * Check if a stage is a terminal positive state (e.g., Closed Won, Converted)
 *
 * @param {string} objectName - Salesforce object name
 * @param {string} stage - Stage value
 * @returns {boolean} True if terminal positive
 */
function isTerminalPositive(objectName, stage) {
    const hierarchy = getHierarchy(objectName);
    if (!hierarchy) return false;

    const pos = getStagePosition(objectName, stage);
    if (pos === null) return false;

    // Find max positive position
    const maxPos = Math.max(...Object.values(hierarchy).filter(v => v >= 0));
    return pos === maxPos;
}

/**
 * Check if a stage is a terminal negative state (e.g., Closed Lost, Unqualified)
 *
 * @param {string} objectName - Salesforce object name
 * @param {string} stage - Stage value
 * @returns {boolean} True if terminal negative
 */
function isTerminalNegative(objectName, stage) {
    const pos = getStagePosition(objectName, stage);
    return pos !== null && pos < 0;
}

/**
 * Select winning record from duplicates based on stage and tie-breakers
 *
 * @param {string} objectName - Salesforce object name
 * @param {Object[]} records - Array of records with stage field
 * @param {Object} options - Selection options
 * @param {string} options.stageField - Field name containing stage (default: 'Status' for Lead, 'StageName' for Opportunity)
 * @param {string} options.tieBreaker - How to break ties: 'mostRecent', 'mostComplete', 'first'
 * @param {string} options.dateField - Date field for 'mostRecent' tie-breaker
 * @returns {Object} Winning record and selection metadata
 */
function selectWinningRecord(objectName, records, options = {}) {
    const defaultStageFields = {
        Lead: 'Status',
        Opportunity: 'StageName',
        Account: 'Type',
        Case: 'Status'
    };

    const {
        stageField = defaultStageFields[objectName] || 'Status',
        tieBreaker = 'first',
        dateField = 'LastModifiedDate'
    } = options;

    if (!records || records.length === 0) {
        return { winner: null, reason: 'No records provided' };
    }

    if (records.length === 1) {
        return { winner: records[0], winnerIndex: 0, reason: 'Only one record' };
    }

    // Extract stages and find most advanced
    const stages = records.map(r => r[stageField] || '');
    const mostAdvanced = findMostAdvanced(objectName, stages);

    // If only one record at max stage, return it
    if (mostAdvanced.indices.length === 1) {
        return {
            winner: records[mostAdvanced.indices[0]],
            winnerIndex: mostAdvanced.indices[0],
            reason: 'Highest stage position',
            stageInfo: mostAdvanced
        };
    }

    // Tie-breaker needed
    const candidates = mostAdvanced.indices.map(i => records[i]);
    let winnerIndex = 0;
    let reason = 'Tie-breaker: ';

    switch (tieBreaker) {
        case 'mostRecent':
            // Sort by date field descending
            const dated = candidates.map((r, i) => ({
                record: r,
                originalIndex: mostAdvanced.indices[i],
                date: new Date(r[dateField] || 0)
            }));
            dated.sort((a, b) => b.date - a.date);
            winnerIndex = dated[0].originalIndex;
            reason += 'most recently modified';
            break;

        case 'mostComplete':
            // Count non-null fields
            const scored = candidates.map((r, i) => ({
                record: r,
                originalIndex: mostAdvanced.indices[i],
                score: Object.values(r).filter(v => v != null && v !== '').length
            }));
            scored.sort((a, b) => b.score - a.score);
            winnerIndex = scored[0].originalIndex;
            reason += 'most complete data';
            break;

        case 'first':
        default:
            winnerIndex = mostAdvanced.indices[0];
            reason += 'first occurrence';
            break;
    }

    return {
        winner: records[winnerIndex],
        winnerIndex,
        reason,
        stageInfo: mostAdvanced,
        tiedRecordCount: mostAdvanced.indices.length
    };
}

// =============================================================================
// CLI Interface
// =============================================================================

if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
Lifecycle Stage Comparator

Determines which stage is "most advanced" for data quality and deduplication.

Usage:
  node lifecycle-stage-comparator.js compare <object> <stage1> <stage2>
  node lifecycle-stage-comparator.js best <object> <stage1> <stage2> [stage3...]
  node lifecycle-stage-comparator.js list
  node lifecycle-stage-comparator.js show <object>

Commands:
  compare   Compare two stages and determine winner
  best      Find most advanced from multiple stages
  list      List all objects with stage hierarchies
  show      Show stage hierarchy for an object

Examples:
  # Compare two Opportunity stages
  node lifecycle-stage-comparator.js compare Opportunity Prospecting Qualification

  # Find most advanced Lead stage
  node lifecycle-stage-comparator.js best Lead New Working Converted

  # List available objects
  node lifecycle-stage-comparator.js list

  # Show Lead stage hierarchy
  node lifecycle-stage-comparator.js show Lead
        `);
        process.exit(0);
    }

    const command = args[0];

    switch (command) {
        case 'compare':
            if (args.length < 4) {
                console.error('Usage: compare <object> <stage1> <stage2>');
                process.exit(1);
            }
            const compResult = compare(args[1], args[2], args[3]);
            console.log(JSON.stringify(compResult, null, 2));
            break;

        case 'best':
            if (args.length < 3) {
                console.error('Usage: best <object> <stage1> <stage2> [stage3...]');
                process.exit(1);
            }
            const stages = args.slice(2);
            const bestResult = findMostAdvanced(args[1], stages);
            console.log(JSON.stringify(bestResult, null, 2));
            break;

        case 'list':
            console.log('Available stage hierarchies:');
            listHierarchies().forEach(obj => console.log(`  - ${obj}`));
            break;

        case 'show':
            if (args.length < 2) {
                console.error('Usage: show <object>');
                process.exit(1);
            }
            const hierarchy = getHierarchy(args[1]);
            if (hierarchy) {
                console.log(`Stage hierarchy for ${args[1]}:`);
                const sorted = Object.entries(hierarchy).sort((a, b) => a[1] - b[1]);
                sorted.forEach(([stage, pos]) => {
                    const marker = pos < 0 ? '❌' : (isTerminalPositive(args[1], stage) ? '✅' : '  ');
                    console.log(`  ${marker} ${pos.toString().padStart(2)}: ${stage}`);
                });
            } else {
                console.error(`No hierarchy defined for: ${args[1]}`);
                process.exit(1);
            }
            break;

        default:
            console.error(`Unknown command: ${command}`);
            process.exit(1);
    }
}

module.exports = {
    compare,
    findMostAdvanced,
    selectWinningRecord,
    getStagePosition,
    isTerminalPositive,
    isTerminalNegative,
    registerHierarchy,
    getHierarchy,
    listHierarchies,
    DEFAULT_HIERARCHIES
};

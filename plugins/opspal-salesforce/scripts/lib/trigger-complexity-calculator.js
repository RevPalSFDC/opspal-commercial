#!/usr/bin/env node

/**
 * Trigger Complexity Calculator
 *
 * Calculate complexity scores for Apex triggers and handler classes (0-100 scale).
 * Detect bulkification anti-patterns and provide segmentation recommendations.
 *
 * Complexity Formula:
 *   Score = (lines × 0.3) + (methods × 15) + (soqlQueries × 10)
 *         + (dmlStatements × 8) + (nestingDepth × 5) + (callouts × 20)
 *
 * Score Categories:
 * - Simple (0-30): Single handler method, minimal logic
 * - Medium (31-70): Handler class with 2-3 methods
 * - Complex (71-100): Requires segmentation into multiple methods
 *
 * Anti-Pattern Detection:
 * - CRITICAL: SOQL in loops, DML in loops, callouts without @future
 * - ERROR: Hardcoded IDs, large collections without LIMIT
 * - WARNING: No null checks, deep nesting >4 levels
 *
 * Usage:
 *   const calculator = require('./trigger-complexity-calculator');
 *
 *   // From Apex code
 *   const result = calculator.calculateFromCode(apexCode);
 *
 *   // From characteristics
 *   const result = calculator.calculateFromCharacteristics({
 *     lines: 150,
 *     methods: 4,
 *     soqlQueries: 12,
 *     dmlStatements: 8,
 *     nestingDepth: 3,
 *     callouts: 1
 *   });
 *
 * CLI Usage:
 *   node trigger-complexity-calculator.js assess --file AccountTriggerHandler.cls
 *   node trigger-complexity-calculator.js assess --code "public class..."
 *   node trigger-complexity-calculator.js detect-anti-patterns --file TriggerHandler.cls
 *
 * @version 1.0.0
 * @see agents/trigger-orchestrator.md
 * @see agents/trigger-segmentation-specialist.md
 * @see docs/runbooks/trigger-management/
 */

const fs = require('fs');
const path = require('path');

/**
 * Complexity calculation weights
 */
const COMPLEXITY_WEIGHTS = {
    linesWeight: 0.3,           // Per line of code
    methodsWeight: 15,          // Per method
    soqlWeight: 10,             // Per SOQL query
    dmlWeight: 8,               // Per DML statement
    nestingWeight: 5,           // Per nesting level
    calloutWeight: 20,          // Per callout
    futureWeight: -10,          // Callout with @future (reduces complexity)
    bulkPatternWeight: -15,     // Uses collection-based pattern (good)
    mapLookupWeight: -5         // Uses map for lookups (good)
};

/**
 * Complexity categories
 */
const COMPLEXITY_CATEGORIES = {
    SIMPLE: { min: 0, max: 30, label: 'Simple', recommendation: 'Direct trigger or single handler method' },
    MEDIUM: { min: 31, max: 70, label: 'Medium', recommendation: 'Handler class with 2-3 methods' },
    COMPLEX: { min: 71, max: 100, label: 'Complex', recommendation: 'Requires segmentation - Use trigger-segmentation-specialist' }
};

/**
 * Anti-pattern definitions
 */
const ANTI_PATTERNS = {
    SOQL_IN_LOOP: {
        pattern: /for\s*\([^)]+\)\s*\{[^}]*\[[^\]]+SELECT/gi,
        severity: 'CRITICAL',
        description: 'SOQL query inside for loop - will hit governor limits with bulk operations',
        fix: 'Move SOQL query outside loop. Query all records at once using IN clause with collected IDs.',
        example: 'Collect IDs in Set, query once: [SELECT Id FROM Object WHERE Id IN :idSet]'
    },
    DML_IN_LOOP: {
        pattern: /for\s*\([^)]+\)\s*\{[^}]*(insert|update|delete|upsert)\s+[^;]+;/gi,
        severity: 'CRITICAL',
        description: 'DML operation inside for loop - will hit governor limits with bulk operations',
        fix: 'Collect records to modify in List, perform single DML operation after loop.',
        example: 'List<SObject> toUpdate = new List<SObject>(); ... update toUpdate;'
    },
    CALLOUT_WITHOUT_FUTURE: {
        pattern: /(?<!@future\([^)]*\)[\s\S]{0,200})\b(Http|HttpRequest|HttpResponse)\b(?![\s\S]{0,200}@future)/gi,
        severity: 'CRITICAL',
        description: 'Callout without @future annotation - triggers cannot make synchronous callouts',
        fix: 'Wrap callout logic in @future(callout=true) method or use Queueable.',
        example: '@future(callout=true) static void callExternalSystem(List<Id> ids) { ... }'
    },
    HARDCODED_ID: {
        pattern: /['"]([0-9]{15}|[0-9]{18})['"]/g,
        severity: 'ERROR',
        description: 'Hardcoded Salesforce ID - will break in different orgs',
        fix: 'Use Custom Metadata, Custom Settings, or query to get IDs dynamically.',
        example: 'Query record by Name or DeveloperName instead of hardcoding ID'
    },
    LARGE_COLLECTION_NO_LIMIT: {
        pattern: /\[\s*SELECT[^[\]]*FROM[^[\]]*\](?![^[\]]*LIMIT)/gi,
        severity: 'ERROR',
        description: 'SOQL query without LIMIT - could return 50,000+ records and hit heap limit',
        fix: 'Add LIMIT clause or use batch Apex for large datasets.',
        example: 'SELECT Id FROM Account WHERE ... LIMIT 10000'
    },
    NO_NULL_CHECK_RELATIONSHIP: {
        pattern: /\w+\.\w+\.\w+(?!\s*!=\s*null|\s*==\s*null)/g,
        severity: 'WARNING',
        description: 'Accessing relationship field without null check - may cause null pointer exception',
        fix: 'Check parent relationship for null before accessing fields.',
        example: 'if (record.Parent__r != null) { String name = record.Parent__r.Name; }'
    },
    DEEP_NESTING: {
        pattern: null, // Calculated programmatically
        severity: 'WARNING',
        description: 'Nesting depth >4 levels - reduces readability and maintainability',
        fix: 'Extract nested logic into separate methods or use guard clauses (early returns).',
        example: 'if (!condition) return; // Early return instead of nesting'
    },
    TRIGGER_OLD_NOT_CHECKED: {
        pattern: /Trigger\.old(?!Map|\s*!=\s*null|\s*==\s*null)/g,
        severity: 'WARNING',
        description: 'Accessing Trigger.old without null check - will be null for insert operations',
        fix: 'Check Trigger.isUpdate before accessing Trigger.old or Trigger.oldMap.',
        example: 'if (Trigger.isUpdate) { SObject oldRecord = Trigger.oldMap.get(record.Id); }'
    }
};

/**
 * Calculate trigger complexity from Apex code
 *
 * @param {String} apexCode - Apex trigger or handler class code
 * @returns {Object} Complexity analysis with score, category, characteristics, anti-patterns
 */
function calculateFromCode(apexCode) {
    // Extract characteristics from code
    const characteristics = extractCharacteristics(apexCode);

    // Calculate base complexity
    const complexity = calculateFromCharacteristics(characteristics);

    // Detect anti-patterns
    const antiPatterns = detectAntiPatterns(apexCode);

    // Add anti-pattern severity to complexity
    const antiPatternPenalty = antiPatterns.reduce((sum, ap) => {
        if (ap.severity === 'CRITICAL') return sum + 20;
        if (ap.severity === 'ERROR') return sum + 10;
        if (ap.severity === 'WARNING') return sum + 5;
        return sum;
    }, 0);

    complexity.score = Math.min(100, complexity.score + antiPatternPenalty);
    complexity.antiPatternPenalty = antiPatternPenalty;

    return {
        ...complexity,
        antiPatterns,
        characteristics,
        code: apexCode
    };
}

/**
 * Calculate complexity from characteristics
 *
 * @param {Object} characteristics - Code characteristics
 * @returns {Object} Complexity score and category
 */
function calculateFromCharacteristics(characteristics) {
    const {
        lines = 0,
        methods = 0,
        soqlQueries = 0,
        dmlStatements = 0,
        nestingDepth = 0,
        callouts = 0,
        futureCallouts = 0,
        bulkPatterns = 0,
        mapLookups = 0
    } = characteristics;

    // Calculate weighted score
    let score = 0;

    // Base complexity
    score += lines * COMPLEXITY_WEIGHTS.linesWeight;
    score += methods * COMPLEXITY_WEIGHTS.methodsWeight;
    score += soqlQueries * COMPLEXITY_WEIGHTS.soqlWeight;
    score += dmlStatements * COMPLEXITY_WEIGHTS.dmlWeight;
    score += nestingDepth * COMPLEXITY_WEIGHTS.nestingWeight;
    score += callouts * COMPLEXITY_WEIGHTS.calloutWeight;

    // Complexity reductions (good patterns)
    score += futureCallouts * COMPLEXITY_WEIGHTS.futureWeight;
    score += bulkPatterns * COMPLEXITY_WEIGHTS.bulkPatternWeight;
    score += mapLookups * COMPLEXITY_WEIGHTS.mapLookupWeight;

    // Ensure score is between 0-100
    score = Math.max(0, Math.min(100, Math.round(score)));

    // Determine category
    let category = null;
    for (const [key, cat] of Object.entries(COMPLEXITY_CATEGORIES)) {
        if (score >= cat.min && score <= cat.max) {
            category = cat;
            break;
        }
    }

    return {
        score,
        category: category.label,
        recommendation: category.recommendation,
        breakdown: {
            lines: lines * COMPLEXITY_WEIGHTS.linesWeight,
            methods: methods * COMPLEXITY_WEIGHTS.methodsWeight,
            soqlQueries: soqlQueries * COMPLEXITY_WEIGHTS.soqlWeight,
            dmlStatements: dmlStatements * COMPLEXITY_WEIGHTS.dmlWeight,
            nestingDepth: nestingDepth * COMPLEXITY_WEIGHTS.nestingWeight,
            callouts: callouts * COMPLEXITY_WEIGHTS.calloutWeight,
            futureCallouts: futureCallouts * COMPLEXITY_WEIGHTS.futureWeight,
            bulkPatterns: bulkPatterns * COMPLEXITY_WEIGHTS.bulkPatternWeight,
            mapLookups: mapLookups * COMPLEXITY_WEIGHTS.mapLookupWeight
        }
    };
}

/**
 * Extract code characteristics from Apex code
 *
 * @param {String} apexCode - Apex code
 * @returns {Object} Code characteristics
 */
function extractCharacteristics(apexCode) {
    // Remove comments (both single-line and multi-line)
    const codeWithoutComments = apexCode
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');

    // Count lines (non-empty, non-comment)
    const lines = codeWithoutComments
        .split('\n')
        .filter(line => line.trim().length > 0)
        .length;

    // Count methods (public/private/global static/non-static)
    const methodPattern = /(public|private|global)\s+(static\s+)?(\w+\s+)?(\w+)\s*\([^)]*\)\s*\{/g;
    const methods = (codeWithoutComments.match(methodPattern) || []).length;

    // Count SOQL queries
    const soqlPattern = /\[\s*SELECT/gi;
    const soqlQueries = (codeWithoutComments.match(soqlPattern) || []).length;

    // Count DML statements
    const dmlPattern = /\b(insert|update|delete|upsert|undelete)\s+/gi;
    const dmlStatements = (codeWithoutComments.match(dmlPattern) || []).length;

    // Calculate nesting depth
    const nestingDepth = calculateMaxNestingDepth(codeWithoutComments);

    // Count callouts
    const calloutPattern = /\b(Http|HttpRequest|HttpResponse|Messaging\.send|Messaging\.sendEmail)\b/gi;
    const callouts = (codeWithoutComments.match(calloutPattern) || []).length;

    // Count @future callouts (good pattern)
    const futurePattern = /@future\s*\(\s*callout\s*=\s*true\s*\)/gi;
    const futureCallouts = (codeWithoutComments.match(futurePattern) || []).length;

    // Detect bulk patterns (collection-based SOQL/DML)
    const bulkSoqlPattern = /\[\s*SELECT[^[\]]*WHERE[^[\]]+IN\s*:/gi;
    const bulkDmlPattern = /(insert|update|delete)\s+\w+ToInsert|\w+ToUpdate|\w+ToDelete/gi;
    const bulkPatterns = (codeWithoutComments.match(bulkSoqlPattern) || []).length +
                         (codeWithoutComments.match(bulkDmlPattern) || []).length;

    // Detect map lookups (good pattern)
    const mapLookupPattern = /Map<[^>]+>\s+\w+\s*=\s*new\s+Map<[^>]+>/gi;
    const mapLookups = (codeWithoutComments.match(mapLookupPattern) || []).length;

    return {
        lines,
        methods,
        soqlQueries,
        dmlStatements,
        nestingDepth,
        callouts,
        futureCallouts,
        bulkPatterns,
        mapLookups
    };
}

/**
 * Calculate maximum nesting depth in code
 *
 * @param {String} code - Apex code
 * @returns {Number} Maximum nesting depth
 */
function calculateMaxNestingDepth(code) {
    let maxDepth = 0;
    let currentDepth = 0;

    for (let i = 0; i < code.length; i++) {
        if (code[i] === '{') {
            currentDepth++;
            maxDepth = Math.max(maxDepth, currentDepth);
        } else if (code[i] === '}') {
            currentDepth--;
        }
    }

    return maxDepth;
}

/**
 * Detect anti-patterns in Apex code
 *
 * @param {String} apexCode - Apex code
 * @returns {Array} Array of detected anti-patterns
 */
function detectAntiPatterns(apexCode) {
    const detected = [];

    // Remove comments
    const codeWithoutComments = apexCode
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');

    // Check each anti-pattern
    for (const [key, antiPattern] of Object.entries(ANTI_PATTERNS)) {
        if (key === 'DEEP_NESTING') {
            // Special handling for nesting depth
            const nestingDepth = calculateMaxNestingDepth(codeWithoutComments);
            if (nestingDepth > 4) {
                detected.push({
                    pattern: 'Deep Nesting',
                    severity: antiPattern.severity,
                    description: antiPattern.description,
                    fix: antiPattern.fix,
                    example: antiPattern.example,
                    occurrences: 1,
                    details: `Maximum nesting depth: ${nestingDepth} levels`
                });
            }
        } else if (antiPattern.pattern) {
            const matches = codeWithoutComments.match(antiPattern.pattern);
            if (matches && matches.length > 0) {
                detected.push({
                    pattern: key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
                    severity: antiPattern.severity,
                    description: antiPattern.description,
                    fix: antiPattern.fix,
                    example: antiPattern.example,
                    occurrences: matches.length,
                    details: `Found ${matches.length} occurrence(s)`
                });
            }
        }
    }

    return detected.sort((a, b) => {
        const severityOrder = { CRITICAL: 0, ERROR: 1, WARNING: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
    });
}

/**
 * Generate segmentation recommendations
 *
 * @param {Object} complexityResult - Complexity calculation result
 * @returns {Object} Segmentation recommendations
 */
function generateSegmentationRecommendations(complexityResult) {
    if (complexityResult.score <= 70) {
        return {
            shouldSegment: false,
            reason: `Complexity score ${complexityResult.score} is within acceptable range`,
            recommendation: 'No segmentation needed'
        };
    }

    const recommendations = [];

    // Check if multiple distinct operations detected
    const { characteristics } = complexityResult;

    if (characteristics.soqlQueries > 10) {
        recommendations.push({
            method: 'Data Enrichment',
            reason: `High SOQL query count (${characteristics.soqlQueries})`,
            suggestedBudget: 'Move 5-10 SOQL queries to enrichRecordData() method'
        });
    }

    if (characteristics.dmlStatements > 5) {
        recommendations.push({
            method: 'Related Record Updates',
            reason: `High DML statement count (${characteristics.dmlStatements})`,
            suggestedBudget: 'Move DML operations to updateRelatedRecords() method'
        });
    }

    if (characteristics.callouts > 0) {
        recommendations.push({
            method: 'Integration/Callouts',
            reason: `Callouts detected (${characteristics.callouts})`,
            suggestedBudget: 'Isolate callouts in sendToExternalSystem() with @future'
        });
    }

    if (characteristics.lines > 150) {
        recommendations.push({
            method: 'Break into Multiple Methods',
            reason: `High line count (${characteristics.lines})`,
            suggestedBudget: 'Target 30-40 lines per method'
        });
    }

    return {
        shouldSegment: true,
        reason: `Complexity score ${complexityResult.score} requires segmentation`,
        recommendations,
        estimatedMethods: Math.ceil(characteristics.methods / 2) || 3,
        targetComplexityPerMethod: 30
    };
}

/**
 * Format complexity result for display
 *
 * @param {Object} result - Complexity calculation result
 * @param {Object} options - Formatting options
 * @returns {String} Formatted output
 */
function formatResult(result, options = {}) {
    const { verbose = false } = options;

    let output = [];

    output.push('='.repeat(80));
    output.push('TRIGGER COMPLEXITY ANALYSIS');
    output.push('='.repeat(80));
    output.push('');
    output.push(`Complexity Score: ${result.score}/100`);
    output.push(`Category: ${result.category}`);
    output.push(`Recommendation: ${result.recommendation}`);
    output.push('');

    if (verbose && result.characteristics) {
        output.push('Characteristics:');
        output.push(`  Lines of Code: ${result.characteristics.lines}`);
        output.push(`  Methods: ${result.characteristics.methods}`);
        output.push(`  SOQL Queries: ${result.characteristics.soqlQueries}`);
        output.push(`  DML Statements: ${result.characteristics.dmlStatements}`);
        output.push(`  Nesting Depth: ${result.characteristics.nestingDepth}`);
        output.push(`  Callouts: ${result.characteristics.callouts}`);
        if (result.characteristics.futureCallouts > 0) {
            output.push(`  @future Callouts: ${result.characteristics.futureCallouts} ✓`);
        }
        if (result.characteristics.bulkPatterns > 0) {
            output.push(`  Bulk Patterns: ${result.characteristics.bulkPatterns} ✓`);
        }
        if (result.characteristics.mapLookups > 0) {
            output.push(`  Map Lookups: ${result.characteristics.mapLookups} ✓`);
        }
        output.push('');

        output.push('Score Breakdown:');
        Object.entries(result.breakdown).forEach(([key, value]) => {
            if (value !== 0) {
                const sign = value > 0 ? '+' : '';
                output.push(`  ${key}: ${sign}${value.toFixed(1)}`);
            }
        });
        output.push('');
    }

    if (result.antiPatterns && result.antiPatterns.length > 0) {
        output.push(`Anti-Patterns Detected: ${result.antiPatterns.length}`);
        output.push('');

        result.antiPatterns.forEach((ap, idx) => {
            output.push(`${idx + 1}. [${ap.severity}] ${ap.pattern}`);
            output.push(`   ${ap.description}`);
            output.push(`   Fix: ${ap.fix}`);
            if (verbose && ap.example) {
                output.push(`   Example: ${ap.example}`);
            }
            output.push(`   Occurrences: ${ap.occurrences}`);
            output.push('');
        });
    } else {
        output.push('✓ No anti-patterns detected');
        output.push('');
    }

    if (result.score > 70) {
        const segmentation = generateSegmentationRecommendations(result);
        output.push('SEGMENTATION RECOMMENDED');
        output.push('-'.repeat(80));
        output.push(`Reason: ${segmentation.reason}`);
        output.push(`Estimated Methods: ${segmentation.estimatedMethods}`);
        output.push(`Target Complexity per Method: ${segmentation.targetComplexityPerMethod}`);
        output.push('');
        output.push('Recommended Methods:');
        segmentation.recommendations.forEach((rec, idx) => {
            output.push(`${idx + 1}. ${rec.method}`);
            output.push(`   Reason: ${rec.reason}`);
            output.push(`   Budget: ${rec.suggestedBudget}`);
            output.push('');
        });
    }

    return output.join('\n');
}

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === '--help' || command === '-h') {
        console.log(`
Trigger Complexity Calculator v1.0.0

Usage:
  node trigger-complexity-calculator.js <command> [options]

Commands:
  assess                Calculate complexity score from Apex code
  detect-anti-patterns  Detect bulkification anti-patterns
  recommend             Get segmentation recommendations
  help                  Show this help message

Options:
  --file <path>         Path to Apex trigger or handler class file
  --code <string>       Apex code as string
  --lines <number>      Lines of code
  --methods <number>    Number of methods
  --soql <number>       Number of SOQL queries
  --dml <number>        Number of DML statements
  --nesting <number>    Maximum nesting depth
  --callouts <number>   Number of callouts
  --verbose             Show detailed output
  --json                Output as JSON

Examples:
  # Assess from file
  node trigger-complexity-calculator.js assess --file AccountTriggerHandler.cls --verbose

  # Assess from code
  node trigger-complexity-calculator.js assess --code "public class..." --verbose

  # Assess from characteristics
  node trigger-complexity-calculator.js assess --lines 150 --methods 4 --soql 12 --dml 8

  # Detect anti-patterns
  node trigger-complexity-calculator.js detect-anti-patterns --file TriggerHandler.cls

  # Get segmentation recommendations
  node trigger-complexity-calculator.js recommend --file ComplexTriggerHandler.cls
`);
        process.exit(0);
    }

    // Parse options
    const options = {
        verbose: args.includes('--verbose'),
        json: args.includes('--json')
    };

    let apexCode = null;
    let characteristics = {};

    for (let i = 1; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--file' && i + 1 < args.length) {
            const filePath = args[++i];
            if (!fs.existsSync(filePath)) {
                console.error(`Error: File not found: ${filePath}`);
                process.exit(1);
            }
            apexCode = fs.readFileSync(filePath, 'utf-8');
        } else if (arg === '--code' && i + 1 < args.length) {
            apexCode = args[++i];
        } else if (arg === '--lines' && i + 1 < args.length) {
            characteristics.lines = parseInt(args[++i]);
        } else if (arg === '--methods' && i + 1 < args.length) {
            characteristics.methods = parseInt(args[++i]);
        } else if (arg === '--soql' && i + 1 < args.length) {
            characteristics.soqlQueries = parseInt(args[++i]);
        } else if (arg === '--dml' && i + 1 < args.length) {
            characteristics.dmlStatements = parseInt(args[++i]);
        } else if (arg === '--nesting' && i + 1 < args.length) {
            characteristics.nestingDepth = parseInt(args[++i]);
        } else if (arg === '--callouts' && i + 1 < args.length) {
            characteristics.callouts = parseInt(args[++i]);
        }
    }

    // Execute command
    try {
        let result;

        if (command === 'assess') {
            if (apexCode) {
                result = calculateFromCode(apexCode);
            } else if (Object.keys(characteristics).length > 0) {
                result = calculateFromCharacteristics(characteristics);
                result.characteristics = characteristics;
                result.antiPatterns = [];
            } else {
                console.error('Error: Must provide --file, --code, or characteristics (--lines, --methods, etc.)');
                process.exit(1);
            }

            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
            } else {
                console.log(formatResult(result, options));
            }
        } else if (command === 'detect-anti-patterns') {
            if (!apexCode) {
                console.error('Error: Must provide --file or --code for anti-pattern detection');
                process.exit(1);
            }

            const antiPatterns = detectAntiPatterns(apexCode);

            if (options.json) {
                console.log(JSON.stringify({ antiPatterns }, null, 2));
            } else {
                console.log('='.repeat(80));
                console.log('ANTI-PATTERN DETECTION');
                console.log('='.repeat(80));
                console.log('');

                if (antiPatterns.length === 0) {
                    console.log('✓ No anti-patterns detected');
                } else {
                    console.log(`Found ${antiPatterns.length} anti-pattern(s):`);
                    console.log('');

                    antiPatterns.forEach((ap, idx) => {
                        console.log(`${idx + 1}. [${ap.severity}] ${ap.pattern}`);
                        console.log(`   ${ap.description}`);
                        console.log(`   Fix: ${ap.fix}`);
                        console.log(`   Occurrences: ${ap.occurrences}`);
                        console.log('');
                    });
                }
            }
        } else if (command === 'recommend') {
            if (!apexCode) {
                console.error('Error: Must provide --file or --code for recommendations');
                process.exit(1);
            }

            result = calculateFromCode(apexCode);
            const recommendations = generateSegmentationRecommendations(result);

            if (options.json) {
                console.log(JSON.stringify(recommendations, null, 2));
            } else {
                console.log('='.repeat(80));
                console.log('SEGMENTATION RECOMMENDATIONS');
                console.log('='.repeat(80));
                console.log('');
                console.log(`Complexity Score: ${result.score}/100`);
                console.log(`Should Segment: ${recommendations.shouldSegment ? 'YES' : 'NO'}`);
                console.log(`Reason: ${recommendations.reason}`);
                console.log('');

                if (recommendations.shouldSegment) {
                    console.log(`Estimated Methods: ${recommendations.estimatedMethods}`);
                    console.log(`Target Complexity per Method: ${recommendations.targetComplexityPerMethod}`);
                    console.log('');
                    console.log('Recommended Methods:');
                    recommendations.recommendations.forEach((rec, idx) => {
                        console.log(`${idx + 1}. ${rec.method}`);
                        console.log(`   Reason: ${rec.reason}`);
                        console.log(`   Budget: ${rec.suggestedBudget}`);
                        console.log('');
                    });
                }
            }
        } else {
            console.error(`Error: Unknown command: ${command}`);
            console.error('Run with --help for usage information');
            process.exit(1);
        }

        process.exit(0);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        if (options.verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Export functions
module.exports = {
    calculateFromCode,
    calculateFromCharacteristics,
    extractCharacteristics,
    detectAntiPatterns,
    generateSegmentationRecommendations,
    formatResult,
    COMPLEXITY_WEIGHTS,
    COMPLEXITY_CATEGORIES,
    ANTI_PATTERNS
};

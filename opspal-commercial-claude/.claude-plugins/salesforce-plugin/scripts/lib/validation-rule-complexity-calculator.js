/**
 * Validation Rule Complexity Calculator
 *
 * Reusable complexity calculation logic for validation rule formulas
 * for use across multiple tools (SegmentManager, ValidationRuleOrchestrator, validation, etc.)
 *
 * @module validation-rule-complexity-calculator
 * @version 1.0.0
 * @since salesforce-plugin@3.51.0
 *
 * Key Capabilities:
 * - Calculate complexity from formula string
 * - Calculate complexity from formula characteristics
 * - Calculate complexity from natural language requirements
 * - Risk factor assessment
 * - Recommendation generation
 * - Support per-segment and whole-formula calculations
 *
 * Usage:
 *   const ValidationRuleComplexityCalculator = require('./validation-rule-complexity-calculator');
 *   const calculator = new ValidationRuleComplexityCalculator();
 *
 *   // From formula string
 *   const complexity = calculator.calculateFromFormula('AND(ISPICKVAL(...), Amount > 10000)');
 *
 *   // From characteristics
 *   const complexity = calculator.calculateFromCharacteristics({
 *     length: 250,
 *     nestingDepth: 3,
 *     fieldCount: 5,
 *     operatorCount: 8
 *   });
 *
 *   // From natural language requirement
 *   const complexity = calculator.calculateFromRequirement('Require Executive Sponsor when Amount >$100K');
 */

/**
 * Complexity calculation weights
 * Aligned with maintainability and readability metrics
 */
const COMPLEXITY_WEIGHTS = {
    // Base metrics
    lengthWeight: 0.15,              // Per character (max 400 chars for Medium)
    nestingWeight: 10,               // Per nesting level
    fieldWeight: 2,                  // Per field reference
    operatorWeight: 1,               // Per operator (AND, OR, =, >, <, etc.)

    // Advanced metrics
    crossObjectWeight: 15,           // Cross-object formula field
    negativeLogicWeight: 5,          // NOT() operator usage
    picklistCheckWeight: -5,         // TEXT() on picklist (good practice)
    parentNullCheckWeight: -3,       // Null check on parent (good practice)

    // Risk multipliers
    noSegmentationMultiplier: 1.5,   // No segmentation used
    excessiveLengthMultiplier: 2.0,  // >500 characters
    deepNestingMultiplier: 1.8       // >4 nesting levels
};

/**
 * Complexity categories (0-100 scale)
 */
const COMPLEXITY_CATEGORIES = {
    SIMPLE: { min: 0, max: 30, color: 'green', label: 'Simple', recommendation: 'Deploy directly' },
    MEDIUM: { min: 31, max: 60, color: 'yellow', label: 'Medium', recommendation: 'Review carefully, consider segmentation' },
    COMPLEX: { min: 61, max: 100, color: 'red', label: 'Complex', recommendation: 'REQUIRES segmentation' }
};

/**
 * Formula function patterns for analysis
 */
const FORMULA_PATTERNS = {
    // Logical operators
    AND: /\bAND\s*\(/gi,
    OR: /\bOR\s*\(/gi,
    NOT: /\bNOT\s*\(/gi,
    IF: /\bIF\s*\(/gi,

    // Field checks
    ISBLANK: /\bISBLANK\s*\(/gi,
    ISNULL: /\bISNULL\s*\(/gi,
    TEXT: /\bTEXT\s*\(/gi,
    ISPICKVAL: /\bISPICKVAL\s*\(/gi,

    // String operations
    CONTAINS: /\bCONTAINS\s*\(/gi,
    BEGINS: /\bBEGINS\s*\(/gi,
    INCLUDES: /\bINCLUDES\s*\(/gi,

    // Date operations
    TODAY: /\bTODAY\s*\(/gi,
    NOW: /\bNOW\s*\(/gi,

    // Math operations
    ABS: /\bABS\s*\(/gi,
    CEILING: /\bCEILING\s*\(/gi,
    FLOOR: /\bFLOOR\s*\(/gi,

    // Cross-object references (Account.Field, Parent.Field, etc.)
    CROSS_OBJECT: /\b[A-Z][a-zA-Z0-9_]*\.[A-Z][a-zA-Z0-9_]*__[cr]\b/g,

    // Field references (__c custom fields, standard fields)
    CUSTOM_FIELD: /\b[A-Z][a-zA-Z0-9_]*__c\b/g,
    STANDARD_FIELD: /\b[A-Z][a-zA-Z][a-zA-Z0-9_]*\b/g
};

/**
 * Anti-patterns to detect
 */
const ANTI_PATTERNS = {
    ISBLANK_ON_PICKLIST: {
        pattern: /ISBLANK\s*\(\s*[A-Z][a-zA-Z0-9_]*__c\s*\)/g,
        severity: 'CRITICAL',
        message: 'ISBLANK() used on potential picklist field - use TEXT(field) = "" instead',
        penalty: 20
    },
    ISNULL_ON_PICKLIST: {
        pattern: /ISNULL\s*\(\s*[A-Z][a-zA-Z0-9_]*__c\s*\)/g,
        severity: 'CRITICAL',
        message: 'ISNULL() used on potential picklist field - use TEXT(field) = "" instead',
        penalty: 20
    },
    EXCESSIVE_NOT: {
        threshold: 3,
        severity: 'ERROR',
        message: 'Excessive NOT() usage (>3) - rewrite with positive logic',
        penalty: 15
    },
    DEEP_NESTING: {
        threshold: 4,
        severity: 'ERROR',
        message: 'Deep nesting (>4 levels) - split into segments',
        penalty: 20
    },
    EXCESSIVE_LENGTH: {
        threshold: 500,
        severity: 'WARNING',
        message: 'Formula too long (>500 chars) - split into multiple rules',
        penalty: 25
    },
    MISSING_PARENT_NULL_CHECK: {
        pattern: /\b[A-Z][a-zA-Z0-9_]*\.[A-Z][a-zA-Z0-9_]*__[cr]\b/g,
        notFollowedBy: /NOT\s*\(\s*ISBLANK\s*\(/i,
        severity: 'WARNING',
        message: 'Cross-object reference without null check - add ISBLANK check',
        penalty: 10
    }
};

class ValidationRuleComplexityCalculator {
    /**
     * Create a new ValidationRuleComplexityCalculator
     * @param {Object} options - Configuration options
     * @param {Object} options.weights - Custom complexity weights (optional)
     * @param {Object} options.categories - Custom complexity categories (optional)
     */
    constructor(options = {}) {
        this.weights = {
            ...COMPLEXITY_WEIGHTS,
            ...(options.weights || {})
        };

        this.categories = {
            ...COMPLEXITY_CATEGORIES,
            ...(options.categories || {})
        };
    }

    /**
     * Calculate complexity from formula string
     * @param {string} formula - Validation rule formula
     * @param {Object} options - Calculation options
     * @param {string} options.objectName - Object name for field validation
     * @param {boolean} options.detectAntiPatterns - Enable anti-pattern detection
     * @returns {Object} Complexity result
     */
    calculateFromFormula(formula, options = {}) {
        const characteristics = this._analyzeFormula(formula);

        const result = this.calculateFromCharacteristics(characteristics, {
            ...options,
            formula // Pass formula for anti-pattern detection
        });

        // Add formula-specific details
        result.formula = formula;
        result.characteristics = characteristics;

        return result;
    }

    /**
     * Calculate complexity from formula characteristics
     * @param {Object} characteristics - Formula characteristics
     * @param {number} characteristics.length - Formula length in characters
     * @param {number} characteristics.nestingDepth - Max nesting depth
     * @param {number} characteristics.fieldCount - Number of field references
     * @param {number} characteristics.operatorCount - Number of operators
     * @param {number} characteristics.crossObjectCount - Number of cross-object references
     * @param {number} characteristics.notCount - Number of NOT() operators
     * @param {Object} options - Calculation options
     * @returns {Object} Complexity result
     */
    calculateFromCharacteristics(characteristics, options = {}) {
        const result = {
            baseScore: 0,
            riskMultiplier: 1.0,
            finalScore: 0,
            breakdown: {},
            riskFactors: [],
            antiPatterns: [],
            recommendations: [],
            category: null
        };

        // Calculate base score from characteristics
        const metrics = [
            { name: 'length', value: characteristics.length, weight: this.weights.lengthWeight },
            { name: 'nesting', value: characteristics.nestingDepth, weight: this.weights.nestingWeight },
            { name: 'fields', value: characteristics.fieldCount, weight: this.weights.fieldWeight },
            { name: 'operators', value: characteristics.operatorCount, weight: this.weights.operatorWeight },
            { name: 'crossObject', value: characteristics.crossObjectCount || 0, weight: this.weights.crossObjectWeight },
            { name: 'negativeLogic', value: characteristics.notCount || 0, weight: this.weights.negativeLogicWeight }
        ];

        for (const metric of metrics) {
            if (metric.value > 0) {
                const metricScore = metric.value * metric.weight;
                result.baseScore += metricScore;
                result.breakdown[metric.name] = {
                    value: metric.value,
                    weight: metric.weight,
                    score: metricScore
                };
            }
        }

        // Apply good practice bonuses (negative scores = reduction)
        if (characteristics.picklistTextUsage > 0) {
            const bonus = characteristics.picklistTextUsage * this.weights.picklistCheckWeight;
            result.baseScore += bonus;
            result.breakdown.picklistTextUsage = {
                value: characteristics.picklistTextUsage,
                weight: this.weights.picklistCheckWeight,
                score: bonus
            };
            result.riskFactors.push('✅ Good: TEXT() used on picklist fields');
        }

        if (characteristics.parentNullChecks > 0) {
            const bonus = characteristics.parentNullChecks * this.weights.parentNullCheckWeight;
            result.baseScore += bonus;
            result.breakdown.parentNullChecks = {
                value: characteristics.parentNullChecks,
                weight: this.weights.parentNullCheckWeight,
                score: bonus
            };
            result.riskFactors.push('✅ Good: Null checks on parent references');
        }

        // Apply risk multipliers
        if (characteristics.length > 500) {
            result.riskMultiplier *= this.weights.excessiveLengthMultiplier;
            result.riskFactors.push(`⚠️ Excessive length: ${characteristics.length} characters`);
        }

        if (characteristics.nestingDepth > 4) {
            result.riskMultiplier *= this.weights.deepNestingMultiplier;
            result.riskFactors.push(`⚠️ Deep nesting: ${characteristics.nestingDepth} levels`);
        }

        if (characteristics.crossObjectCount > 3) {
            result.riskMultiplier *= 1.3;
            result.riskFactors.push(`⚠️ Many cross-object references: ${characteristics.crossObjectCount}`);
        }

        if (characteristics.notCount > 3) {
            result.riskMultiplier *= 1.2;
            result.riskFactors.push(`⚠️ Excessive NOT() usage: ${characteristics.notCount}`);
        }

        // Calculate final score (max 100)
        result.finalScore = Math.min(100, Math.round(result.baseScore * result.riskMultiplier));

        // Determine category
        result.category = this.getCategory(result.finalScore);

        // Detect anti-patterns if formula provided
        if (options.formula && options.detectAntiPatterns !== false) {
            result.antiPatterns = this.detectAntiPatterns(options.formula, characteristics);
        }

        // Generate recommendations
        result.recommendations = this.generateRecommendations(result, characteristics);

        return result;
    }

    /**
     * Calculate complexity from natural language requirement
     * @param {string} requirement - Natural language requirement
     * @returns {Object} Complexity estimation
     */
    calculateFromRequirement(requirement) {
        const lowerRequirement = requirement.toLowerCase();

        // Estimate characteristics from requirement
        const characteristics = {
            length: 0,
            nestingDepth: 1,
            fieldCount: 0,
            operatorCount: 0,
            crossObjectCount: 0,
            notCount: 0
        };

        // Keyword-based estimation
        const estimationPatterns = [
            { pattern: /\bfield\b|\bvalue\b|\bdata\b/g, type: 'fieldCount', increment: 1 },
            { pattern: /\band\b|\bor\b|\balso\b/g, type: 'operatorCount', increment: 1 },
            { pattern: /\bparent\b|\baccount\b|\brelated\b/g, type: 'crossObjectCount', increment: 1 },
            { pattern: /\bnot\b|\bexclude\b|\bwithout\b/g, type: 'notCount', increment: 1 },
            { pattern: /\bif\b|\bwhen\b|\bunless\b/g, type: 'nestingDepth', increment: 1 }
        ];

        for (const { pattern, type, increment } of estimationPatterns) {
            const matches = requirement.match(pattern);
            if (matches) {
                characteristics[type] += matches.length * increment;
            }
        }

        // Estimate formula length based on complexity
        characteristics.length = (
            characteristics.fieldCount * 30 + // ~30 chars per field check
            characteristics.operatorCount * 10 + // ~10 chars per operator
            characteristics.crossObjectCount * 40 + // ~40 chars per cross-object
            characteristics.notCount * 15 // ~15 chars per NOT()
        );

        // Calculate complexity
        const complexity = this.calculateFromCharacteristics(characteristics);

        return {
            estimatedScore: complexity.finalScore,
            estimatedCategory: complexity.category,
            estimatedCharacteristics: characteristics,
            breakdown: complexity.breakdown,
            recommendations: complexity.recommendations,
            confidence: this._calculateEstimationConfidence(requirement)
        };
    }

    /**
     * Analyze formula string to extract characteristics
     * @param {string} formula - Formula string
     * @returns {Object} Formula characteristics
     * @private
     */
    _analyzeFormula(formula) {
        const characteristics = {
            length: formula.length,
            nestingDepth: this._calculateNestingDepth(formula),
            fieldCount: this._countFields(formula),
            operatorCount: this._countOperators(formula),
            crossObjectCount: this._countCrossObjectReferences(formula),
            notCount: this._countPattern(formula, FORMULA_PATTERNS.NOT),
            picklistTextUsage: this._countPattern(formula, FORMULA_PATTERNS.TEXT),
            parentNullChecks: this._countParentNullChecks(formula)
        };

        return characteristics;
    }

    /**
     * Calculate nesting depth of formula
     * @param {string} formula - Formula string
     * @returns {number} Max nesting depth
     * @private
     */
    _calculateNestingDepth(formula) {
        let maxDepth = 0;
        let currentDepth = 0;

        for (const char of formula) {
            if (char === '(') {
                currentDepth++;
                maxDepth = Math.max(maxDepth, currentDepth);
            } else if (char === ')') {
                currentDepth--;
            }
        }

        return maxDepth;
    }

    /**
     * Count field references in formula
     * @param {string} formula - Formula string
     * @returns {number} Field count
     * @private
     */
    _countFields(formula) {
        const customFields = formula.match(FORMULA_PATTERNS.CUSTOM_FIELD) || [];

        // Count standard fields (exclude function names)
        const standardFields = formula.match(FORMULA_PATTERNS.STANDARD_FIELD) || [];
        const functionNames = ['AND', 'OR', 'NOT', 'IF', 'ISBLANK', 'ISNULL', 'TEXT', 'ISPICKVAL',
                               'CONTAINS', 'BEGINS', 'INCLUDES', 'TODAY', 'NOW', 'ABS', 'CEILING', 'FLOOR'];
        const filteredStandardFields = standardFields.filter(f => !functionNames.includes(f));

        return customFields.length + filteredStandardFields.length;
    }

    /**
     * Count operators in formula
     * @param {string} formula - Formula string
     * @returns {number} Operator count
     * @private
     */
    _countOperators(formula) {
        let count = 0;

        // Logical operators
        count += this._countPattern(formula, FORMULA_PATTERNS.AND);
        count += this._countPattern(formula, FORMULA_PATTERNS.OR);

        // Comparison operators
        count += (formula.match(/=/g) || []).length;
        count += (formula.match(/!=/g) || []).length;
        count += (formula.match(/>/g) || []).length;
        count += (formula.match(/</g) || []).length;
        count += (formula.match(/>=/g) || []).length;
        count += (formula.match(/<=/g) || []).length;

        return count;
    }

    /**
     * Count cross-object references in formula
     * @param {string} formula - Formula string
     * @returns {number} Cross-object reference count
     * @private
     */
    _countCrossObjectReferences(formula) {
        const matches = formula.match(FORMULA_PATTERNS.CROSS_OBJECT) || [];
        return matches.length;
    }

    /**
     * Count parent null checks in formula
     * @param {string} formula - Formula string
     * @returns {number} Parent null check count
     * @private
     */
    _countParentNullChecks(formula) {
        // Look for patterns like: NOT(ISBLANK(Account.Id))
        const pattern = /NOT\s*\(\s*ISBLANK\s*\(\s*[A-Z][a-zA-Z0-9_]*\.[A-Z][a-zA-Z0-9_]*\s*\)\s*\)/g;
        const matches = formula.match(pattern) || [];
        return matches.length;
    }

    /**
     * Count pattern occurrences in formula
     * @param {string} formula - Formula string
     * @param {RegExp} pattern - Pattern to match
     * @returns {number} Pattern count
     * @private
     */
    _countPattern(formula, pattern) {
        const matches = formula.match(pattern) || [];
        return matches.length;
    }

    /**
     * Detect anti-patterns in formula
     * @param {string} formula - Formula string
     * @param {Object} characteristics - Formula characteristics
     * @returns {Array} Anti-patterns detected
     */
    detectAntiPatterns(formula, characteristics) {
        const detected = [];

        // Check ISBLANK on picklist
        if (ANTI_PATTERNS.ISBLANK_ON_PICKLIST.pattern.test(formula)) {
            detected.push({
                ...ANTI_PATTERNS.ISBLANK_ON_PICKLIST,
                found: true
            });
        }

        // Check ISNULL on picklist
        if (ANTI_PATTERNS.ISNULL_ON_PICKLIST.pattern.test(formula)) {
            detected.push({
                ...ANTI_PATTERNS.ISNULL_ON_PICKLIST,
                found: true
            });
        }

        // Check excessive NOT
        if (characteristics.notCount > ANTI_PATTERNS.EXCESSIVE_NOT.threshold) {
            detected.push({
                ...ANTI_PATTERNS.EXCESSIVE_NOT,
                found: true,
                count: characteristics.notCount
            });
        }

        // Check deep nesting
        if (characteristics.nestingDepth > ANTI_PATTERNS.DEEP_NESTING.threshold) {
            detected.push({
                ...ANTI_PATTERNS.DEEP_NESTING,
                found: true,
                depth: characteristics.nestingDepth
            });
        }

        // Check excessive length
        if (characteristics.length > ANTI_PATTERNS.EXCESSIVE_LENGTH.threshold) {
            detected.push({
                ...ANTI_PATTERNS.EXCESSIVE_LENGTH,
                found: true,
                length: characteristics.length
            });
        }

        // Check missing parent null checks
        if (characteristics.crossObjectCount > characteristics.parentNullChecks) {
            detected.push({
                ...ANTI_PATTERNS.MISSING_PARENT_NULL_CHECK,
                found: true,
                missing: characteristics.crossObjectCount - characteristics.parentNullChecks
            });
        }

        return detected;
    }

    /**
     * Get complexity category for a score
     * @param {number} score - Complexity score
     * @returns {Object} Category info
     */
    getCategory(score) {
        for (const [name, range] of Object.entries(this.categories)) {
            if (score >= range.min && score <= range.max) {
                return { name, ...range };
            }
        }
        return { ...this.categories.COMPLEX, name: 'COMPLEX' };
    }

    /**
     * Generate complexity-based recommendations
     * @param {Object} complexity - Complexity result
     * @param {Object} characteristics - Formula characteristics
     * @returns {Array} Recommendations
     */
    generateRecommendations(complexity, characteristics) {
        const recommendations = [];

        // Category-based recommendations
        if (complexity.category.name === 'SIMPLE') {
            recommendations.push('✅ Formula complexity is low - deploy directly');
        } else if (complexity.category.name === 'MEDIUM') {
            recommendations.push('⚠️ Formula complexity is medium - review carefully before deployment');
            recommendations.push('💡 Consider segmentation if adding more conditions');
        } else if (complexity.category.name === 'COMPLEX') {
            recommendations.push('🛑 Formula complexity is high - REQUIRES segmentation');
            recommendations.push('📋 Use validation-rule-segmentation-specialist agent');
            recommendations.push('🔧 Break formula into logical segments (trigger-context, data-validation, business-logic)');
        }

        // Characteristic-based recommendations
        if (characteristics.length > 400) {
            recommendations.push(`📏 Formula length (${characteristics.length} chars) - target <400 for maintainability`);
        }

        if (characteristics.nestingDepth > 3) {
            recommendations.push(`🌲 Nesting depth (${characteristics.nestingDepth}) - flatten logic or segment`);
        }

        if (characteristics.fieldCount > 8) {
            recommendations.push(`📊 Many fields (${characteristics.fieldCount}) - consider splitting into multiple rules`);
        }

        if (characteristics.crossObjectCount > 2) {
            recommendations.push(`🔗 Many cross-object refs (${characteristics.crossObjectCount}) - verify performance impact`);
        }

        if (characteristics.notCount > 2) {
            recommendations.push(`❌ Excessive NOT() (${characteristics.notCount}) - rewrite with positive logic`);
        }

        // Anti-pattern recommendations
        if (complexity.antiPatterns && complexity.antiPatterns.length > 0) {
            recommendations.push(`🚨 ${complexity.antiPatterns.length} anti-pattern(s) detected - fix before deployment`);
        }

        return recommendations;
    }

    /**
     * Calculate confidence for requirement-based estimation
     * @param {string} requirement - Natural language requirement
     * @returns {number} Confidence (0.0-1.0)
     * @private
     */
    _calculateEstimationConfidence(requirement) {
        let confidence = 0.5; // Base confidence

        // Increase confidence for detailed requirements
        if (requirement.length > 100) confidence += 0.1;
        if (/\bfield\b/gi.test(requirement)) confidence += 0.1;
        if (/\bif\b|\bwhen\b/gi.test(requirement)) confidence += 0.1;
        if (/\band\b|\bor\b/gi.test(requirement)) confidence += 0.1;

        // Decrease confidence for vague requirements
        if (requirement.length < 50) confidence -= 0.1;
        if (!/\bfield\b/gi.test(requirement)) confidence -= 0.1;

        return Math.max(0.2, Math.min(1.0, confidence));
    }

    /**
     * CLI Assessment Command
     * Provides command-line assessment for quick checks
     * @param {Object} args - Command arguments
     */
    static async assess(args) {
        const calculator = new ValidationRuleComplexityCalculator();

        if (args.formula) {
            // Assess from formula
            const result = calculator.calculateFromFormula(args.formula, {
                detectAntiPatterns: true
            });

            console.log('\n=== Validation Rule Complexity Assessment ===\n');
            console.log(`Formula: ${result.formula.substring(0, 80)}${result.formula.length > 80 ? '...' : ''}`);
            console.log(`\nComplexity Score: ${result.finalScore}/100 (${result.category.label})`);
            console.log(`Category: ${result.category.name}`);
            console.log(`Recommendation: ${result.category.recommendation}`);

            console.log('\n--- Characteristics ---');
            console.log(`Length: ${result.characteristics.length} characters`);
            console.log(`Nesting Depth: ${result.characteristics.nestingDepth}`);
            console.log(`Field Count: ${result.characteristics.fieldCount}`);
            console.log(`Operator Count: ${result.characteristics.operatorCount}`);
            console.log(`Cross-Object Refs: ${result.characteristics.crossObjectCount}`);

            if (result.antiPatterns.length > 0) {
                console.log('\n--- Anti-Patterns Detected ---');
                result.antiPatterns.forEach((ap, i) => {
                    console.log(`${i + 1}. [${ap.severity}] ${ap.message}`);
                });
            }

            if (result.recommendations.length > 0) {
                console.log('\n--- Recommendations ---');
                result.recommendations.forEach((rec, i) => {
                    console.log(`${i + 1}. ${rec}`);
                });
            }

        } else if (args['formula-length'] || args['nesting-depth'] || args['field-count'] || args['operator-count']) {
            // Assess from characteristics
            const result = calculator.calculateFromCharacteristics({
                length: parseInt(args['formula-length']) || 0,
                nestingDepth: parseInt(args['nesting-depth']) || 0,
                fieldCount: parseInt(args['field-count']) || 0,
                operatorCount: parseInt(args['operator-count']) || 0,
                crossObjectCount: parseInt(args['cross-object-count']) || 0,
                notCount: parseInt(args['not-count']) || 0
            });

            console.log('\n=== Validation Rule Complexity Assessment ===\n');
            console.log(`Complexity Score: ${result.finalScore}/100 (${result.category.label})`);
            console.log(`Category: ${result.category.name}`);
            console.log(`Recommendation: ${result.category.recommendation}`);

            console.log('\n--- Score Breakdown ---');
            Object.entries(result.breakdown).forEach(([metric, data]) => {
                console.log(`${metric}: ${data.value} × ${data.weight} = ${data.score}`);
            });

            if (result.recommendations.length > 0) {
                console.log('\n--- Recommendations ---');
                result.recommendations.forEach((rec, i) => {
                    console.log(`${i + 1}. ${rec}`);
                });
            }

        } else if (args.requirement) {
            // Assess from requirement
            const result = calculator.calculateFromRequirement(args.requirement);

            console.log('\n=== Validation Rule Complexity Estimation ===\n');
            console.log(`Requirement: ${args.requirement}`);
            console.log(`\nEstimated Score: ${result.estimatedScore}/100 (${result.estimatedCategory.label})`);
            console.log(`Confidence: ${(result.confidence * 100).toFixed(0)}%`);
            console.log(`Recommendation: ${result.estimatedCategory.recommendation}`);

            console.log('\n--- Estimated Characteristics ---');
            console.log(`Length: ~${result.estimatedCharacteristics.length} characters`);
            console.log(`Nesting Depth: ~${result.estimatedCharacteristics.nestingDepth}`);
            console.log(`Field Count: ~${result.estimatedCharacteristics.fieldCount}`);
            console.log(`Operator Count: ~${result.estimatedCharacteristics.operatorCount}`);

            if (result.recommendations.length > 0) {
                console.log('\n--- Recommendations ---');
                result.recommendations.forEach((rec, i) => {
                    console.log(`${i + 1}. ${rec}`);
                });
            }
        } else {
            console.error('\nError: Must provide --formula, --formula-length/--nesting-depth/etc., or --requirement');
            console.error('\nUsage:');
            console.error('  node validation-rule-complexity-calculator.js assess --formula "AND(...)"');
            console.error('  node validation-rule-complexity-calculator.js assess --formula-length 250 --nesting-depth 3 --field-count 5');
            console.error('  node validation-rule-complexity-calculator.js assess --requirement "Require Executive Sponsor when Amount >$100K"');
            process.exit(1);
        }
    }
}

// CLI Entry Point
if (require.main === module) {
    const args = {};
    for (let i = 2; i < process.argv.length; i++) {
        if (process.argv[i].startsWith('--')) {
            const key = process.argv[i].substring(2);
            const value = process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
                ? process.argv[i + 1]
                : true;
            args[key] = value;
            if (value !== true) i++;
        }
    }

    const command = args._command || process.argv[2];
    delete args._command;

    if (command === 'assess') {
        ValidationRuleComplexityCalculator.assess(args).catch(err => {
            console.error('Error:', err.message);
            process.exit(1);
        });
    } else {
        console.error('Unknown command:', command);
        console.error('\nAvailable commands:');
        console.error('  assess  - Assess validation rule complexity');
        process.exit(1);
    }
}

module.exports = ValidationRuleComplexityCalculator;

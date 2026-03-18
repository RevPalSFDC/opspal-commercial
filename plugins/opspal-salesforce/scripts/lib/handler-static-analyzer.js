#!/usr/bin/env node

/**
 * Handler Static Analyzer
 *
 * Purpose: Perform static analysis on Apex Handler classes to extract patterns,
 * risks, and migration considerations for automation inventory.
 *
 * Features:
 * - Detects async work (@future, Queueable, Batchable, Schedulable)
 * - Identifies callouts (HttpRequest, @future(callout=true), Continuation)
 * - Finds hard-coded IDs (15/18 character patterns)
 * - Checks bulk safety (DML/SOQL inside loops)
 * - Detects external configuration (CustomSetting, CustomMetadata)
 * - Identifies platform events (EventBus.publish, PlatformEvent)
 * - Extracts objects touched (DML) and queried (SOQL)
 * - Calculates migration impact (LOW/MEDIUM/HIGH)
 *
 * Usage:
 *   const analyzer = new HandlerStaticAnalyzer();
 *   const analysis = await analyzer.analyzeHandler(handlerBody, handlerName);
 *   const impact = analyzer.calculateMigrationImpact(analysis);
 *
 * @version 1.0.0
 * @date 2025-10-29
 */

class HandlerStaticAnalyzer {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
    }

    /**
     * Analyze handler class for patterns and risks
     * @param {string} classBody - Apex class source code
     * @param {string} className - Name of the handler class
     * @returns {Object} Analysis results
     */
    analyzeHandler(classBody, className) {
        if (!classBody || typeof classBody !== 'string') {
            return this.emptyAnalysis(className);
        }

        const analysis = {
            className: className,

            // Async patterns
            asyncWork: this.detectAsyncWork(classBody),
            doesCallout: this.detectCallouts(classBody),

            // Object interactions
            touchesObjects: this.extractDMLObjects(classBody),
            queriesObjects: this.extractSOQLObjects(classBody),

            // Platform events
            publishesEvents: this.detectPlatformEvents(classBody),

            // Configuration
            externalConfig: this.detectExternalConfig(classBody),

            // Code quality
            hardCodedIds: this.detectHardCodedIds(classBody),
            bulkSafetyFindings: this.checkBulkSafety(classBody),

            // Metadata
            hasTests: false, // Will be populated by test class detection
            testClasses: [], // Will be populated externally
            approxCoverage: 0, // Will be populated from coverage data
        };

        // Calculate migration impact based on findings
        analysis.migrationImpact = this.calculateMigrationImpact(analysis);

        return analysis;
    }

    /**
     * Detect async work patterns
     * @param {string} classBody - Apex class source code
     * @returns {Array<string>} Array of async patterns found
     */
    detectAsyncWork(classBody) {
        const asyncPatterns = [];

        // @future annotation
        if (/@future\b/i.test(classBody)) {
            asyncPatterns.push('Future');
        }

        // Queueable
        if (/implements\s+Queueable/i.test(classBody) || /System\.enqueueJob/i.test(classBody)) {
            asyncPatterns.push('Queueable');
        }

        // Batchable
        if (/implements\s+Database\.Batchable/i.test(classBody) || /Database\.executeBatch/i.test(classBody)) {
            asyncPatterns.push('Batchable');
        }

        // Schedulable
        if (/implements\s+Schedulable/i.test(classBody) || /System\.schedule/i.test(classBody)) {
            asyncPatterns.push('Schedulable');
        }

        return asyncPatterns;
    }

    /**
     * Detect callout patterns
     * @param {string} classBody - Apex class source code
     * @returns {boolean} True if callouts detected
     */
    detectCallouts(classBody) {
        // HttpRequest/HttpResponse
        if (/\b(HttpRequest|HttpResponse|Http\s+http)\b/i.test(classBody)) {
            return true;
        }

        // @future(callout=true)
        if (/@future\s*\(\s*callout\s*=\s*true\s*\)/i.test(classBody)) {
            return true;
        }

        // Continuation
        if (/\bContinuation\b/i.test(classBody)) {
            return true;
        }

        // callout: named credential
        if (/callout:/i.test(classBody)) {
            return true;
        }

        return false;
    }

    /**
     * Extract objects touched via DML operations
     * @param {string} classBody - Apex class source code
     * @returns {Array<string>} Array of object API names
     */
    extractDMLObjects(classBody) {
        const objects = new Set();

        // Pattern 1: insert/update/delete/upsert/undelete ObjectName
        const dmlPattern = /\b(insert|update|delete|upsert|undelete)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
        let match;

        while ((match = dmlPattern.exec(classBody)) !== null) {
            const varName = match[2];
            // Try to infer object type from variable name
            const objectType = this.inferObjectFromVariable(classBody, varName);
            if (objectType) {
                objects.add(objectType);
            }
        }

        // Pattern 2: Database.insert/update/delete/upsert/undelete(List<ObjectName>)
        const databasePattern = /Database\.(insert|update|delete|upsert|undelete)\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)/gi;

        while ((match = databasePattern.exec(classBody)) !== null) {
            const varName = match[2];
            const objectType = this.inferObjectFromVariable(classBody, varName);
            if (objectType) {
                objects.add(objectType);
            }
        }

        // Pattern 3: Type declarations (List<ObjectName>, Map<Id, ObjectName>)
        const typePattern = /\b(List|Map|Set)<\s*([A-Z][a-zA-Z0-9_]*)\s*[,>]/g;

        while ((match = typePattern.exec(classBody)) !== null) {
            const objectType = match[2];
            if (this.isLikelyObjectName(objectType)) {
                objects.add(objectType);
            }
        }

        return Array.from(objects);
    }

    /**
     * Extract objects queried via SOQL
     * @param {string} classBody - Apex class source code
     * @returns {Array<string>} Array of object API names
     */
    extractSOQLObjects(classBody) {
        const objects = new Set();

        // Pattern: SELECT ... FROM ObjectName
        const soqlPattern = /\[\s*SELECT\s+.+?\s+FROM\s+([A-Z][a-zA-Z0-9_]*)/gi;
        let match;

        while ((match = soqlPattern.exec(classBody)) !== null) {
            const objectName = match[1];
            objects.add(objectName);
        }

        // Pattern: Database.query with string
        const queryPattern = /Database\.query\s*\(\s*['"]SELECT\s+.+?\s+FROM\s+([A-Z][a-zA-Z0-9_]*)/gi;

        while ((match = queryPattern.exec(classBody)) !== null) {
            const objectName = match[1];
            objects.add(objectName);
        }

        return Array.from(objects);
    }

    /**
     * Detect platform event publishing
     * @param {string} classBody - Apex class source code
     * @returns {Array<string>} Array of event names
     */
    detectPlatformEvents(classBody) {
        const events = new Set();

        // Pattern 1: EventBus.publish
        const publishPattern = /EventBus\.publish\s*\(\s*new\s+([A-Z][a-zA-Z0-9_]*__e)/gi;
        let match;

        while ((match = publishPattern.exec(classBody)) !== null) {
            events.add(match[1]);
        }

        // Pattern 2: Platform event variable declarations
        const eventTypePattern = /\b([A-Z][a-zA-Z0-9_]*__e)\s+\w+\s*=/g;

        while ((match = eventTypePattern.exec(classBody)) !== null) {
            events.add(match[1]);
        }

        return Array.from(events);
    }

    /**
     * Detect external configuration usage
     * @param {string} classBody - Apex class source code
     * @returns {Array<string>} Array of configuration sources
     */
    detectExternalConfig(classBody) {
        const configs = [];

        // Custom Metadata
        const metadataPattern = /([A-Z][a-zA-Z0-9_]*__mdt)/g;
        const metadataMatches = [...new Set(classBody.match(metadataPattern) || [])];
        metadataMatches.forEach(mdt => configs.push(`CustomMetadata:${mdt}`));

        // Custom Settings
        const settingPattern = /([A-Z][a-zA-Z0-9_]*__c)\.getInstance/g;
        const settingMatches = [...new Set(classBody.match(settingPattern) || [])];
        settingMatches.forEach(cs => configs.push(`CustomSetting:${cs}`));

        return configs;
    }

    /**
     * Detect hard-coded IDs
     * @param {string} classBody - Apex class source code
     * @returns {Array<string>} Array of hard-coded IDs found
     */
    detectHardCodedIds(classBody) {
        const ids = new Set();

        // Pattern: 15 or 18 character Salesforce IDs
        const idPattern = /\b([a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?)\b/g;
        let match;

        while ((match = idPattern.exec(classBody)) !== null) {
            const potentialId = match[1];

            // Filter out common false positives
            if (this.isLikelySalesforceId(potentialId)) {
                ids.add(potentialId);
            }
        }

        return Array.from(ids);
    }

    /**
     * Check bulk safety patterns
     * @param {string} classBody - Apex class source code
     * @returns {Array<string>} Array of findings
     */
    checkBulkSafety(classBody) {
        const findings = [];

        // Check for DML in loops
        if (this.hasDMLInLoop(classBody)) {
            findings.push('RISK: DML inside loop detected');
        } else {
            findings.push('OK: No DML inside loops');
        }

        // Check for SOQL in loops
        if (this.hasSOQLInLoop(classBody)) {
            findings.push('RISK: SOQL inside loop detected');
        } else {
            findings.push('OK: No SOQL inside loops');
        }

        return findings;
    }

    /**
     * Check for DML inside loops
     * @private
     */
    hasDMLInLoop(classBody) {
        // Pattern: for/while loop followed by DML
        const loopDMLPattern = /(for\s*\([^)]+\)|while\s*\([^)]+\))\s*\{[^}]*(insert|update|delete|upsert|undelete|Database\.(insert|update|delete|upsert|undelete))/gi;
        return loopDMLPattern.test(classBody);
    }

    /**
     * Check for SOQL inside loops
     * @private
     */
    hasSOQLInLoop(classBody) {
        // Pattern: for/while loop followed by SOQL
        const loopSOQLPattern = /(for\s*\([^)]+\)|while\s*\([^)]+\))\s*\{[^}]*\[\s*SELECT/gi;
        return loopSOQLPattern.test(classBody);
    }

    /**
     * Calculate migration impact based on analysis
     * @param {Object} analysis - Handler analysis results
     * @returns {string} Migration impact (LOW/MEDIUM/HIGH)
     */
    calculateMigrationImpact(analysis) {
        let score = 0;

        // High-risk factors (3 points each)
        if (analysis.doesCallout) score += 3;
        if (analysis.hardCodedIds.length > 0) score += 3;
        if (analysis.bulkSafetyFindings.some(f => f.includes('RISK'))) score += 3;

        // Medium-risk factors (2 points each)
        if (analysis.asyncWork.length > 0) score += 2;
        if (analysis.publishesEvents.length > 0) score += 2;

        // Low-risk factors (1 point each)
        if (analysis.touchesObjects.length > 3) score += 1;
        if (analysis.queriesObjects.length > 3) score += 1;
        if (analysis.externalConfig.length > 0) score += 1;

        // Classification
        if (score >= 6) return 'HIGH';
        if (score >= 3) return 'MEDIUM';
        return 'LOW';
    }

    /**
     * Infer object type from variable name
     * @private
     */
    inferObjectFromVariable(classBody, varName) {
        // Look for type declaration
        const typePattern = new RegExp(`(List|Map|Set)<\\s*([A-Z][a-zA-Z0-9_]*)\\s*[,>]\\s+${varName}\\b`, 'i');
        const match = typePattern.exec(classBody);

        if (match) {
            return match[2];
        }

        // Try common naming conventions
        if (varName.endsWith('s') && varName[0] === varName[0].toLowerCase()) {
            // accounts -> Account
            return varName.charAt(0).toUpperCase() + varName.slice(1, -1);
        }

        return null;
    }

    /**
     * Check if likely an object name
     * @private
     */
    isLikelyObjectName(name) {
        // Exclude common types
        const nonObjects = [
            'Id', 'String', 'Integer', 'Decimal', 'Boolean', 'Date', 'DateTime',
            'Time', 'SObject', 'Object', 'Exception', 'Type'
        ];

        if (nonObjects.includes(name)) {
            return false;
        }

        // Standard objects (capital letter) or custom objects (__c)
        return /^[A-Z]/.test(name) && (name.length > 2);
    }

    /**
     * Check if likely a Salesforce ID
     * @private
     */
    isLikelySalesforceId(str) {
        // Must be 15 or 18 characters
        if (str.length !== 15 && str.length !== 18) {
            return false;
        }

        // Must start with a letter (Salesforce IDs always start with 3 letters)
        if (!/^[a-zA-Z]/.test(str)) {
            return false;
        }

        // Should have alphanumeric characters
        if (!/^[a-zA-Z0-9]+$/.test(str)) {
            return false;
        }

        // Exclude common patterns that look like IDs but aren't
        const falsePositives = [
            /^[0-9]{15}/, // All numbers
            /^[A-Z]{15}/, // All uppercase
            /^[a-z]{15}/, // All lowercase
        ];

        return !falsePositives.some(pattern => pattern.test(str));
    }

    /**
     * Return empty analysis structure
     * @private
     */
    emptyAnalysis(className) {
        return {
            className: className,
            asyncWork: [],
            doesCallout: false,
            touchesObjects: [],
            queriesObjects: [],
            publishesEvents: [],
            externalConfig: [],
            hardCodedIds: [],
            bulkSafetyFindings: ['UNKNOWN: No class body provided'],
            hasTests: false,
            testClasses: [],
            approxCoverage: 0,
            migrationImpact: 'UNKNOWN'
        };
    }
}

module.exports = HandlerStaticAnalyzer;

// CLI usage
if (require.main === module) {
    const fs = require('fs');

    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.error('Usage: node handler-static-analyzer.js <handler-class-file> [class-name]');
        process.exit(1);
    }

    const classFile = args[0];
    const className = args[1] || require('path').basename(classFile, '.cls');

    try {
        const classBody = fs.readFileSync(classFile, 'utf8');
        const analyzer = new HandlerStaticAnalyzer({ verbose: true });

        const analysis = analyzer.analyzeHandler(classBody, className);

        console.log('\n=== Handler Static Analysis Results ===\n');
        console.log(`Class: ${analysis.className}`);
        console.log(`Migration Impact: ${analysis.migrationImpact}`);
        console.log(`\nAsync Work: ${analysis.asyncWork.join(', ') || 'None'}`);
        console.log(`Callouts: ${analysis.doesCallout ? 'YES' : 'NO'}`);
        console.log(`\nObjects Touched (DML): ${analysis.touchesObjects.join(', ') || 'None'}`);
        console.log(`Objects Queried (SOQL): ${analysis.queriesObjects.join(', ') || 'None'}`);
        console.log(`\nPlatform Events: ${analysis.publishesEvents.join(', ') || 'None'}`);
        console.log(`External Config: ${analysis.externalConfig.join(', ') || 'None'}`);
        console.log(`\nHard-coded IDs: ${analysis.hardCodedIds.length > 0 ? analysis.hardCodedIds.join(', ') : 'None'}`);
        console.log(`\nBulk Safety Findings:`);
        analysis.bulkSafetyFindings.forEach(f => console.log(`  - ${f}`));
        console.log('\n');
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

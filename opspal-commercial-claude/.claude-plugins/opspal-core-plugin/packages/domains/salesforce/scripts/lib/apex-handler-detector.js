#!/usr/bin/env node

/**
 * Apex Handler Detector
 *
 * Purpose: Detect Apex Handler classes associated with triggers and parse
 * handler invocation patterns, event methods, and trigger-handler relationships.
 *
 * Features:
 * - Detects handler class references in trigger bodies (new ClassName, ClassName.method())
 * - Identifies trigger events (beforeInsert, afterUpdate, etc.)
 * - Maps triggers to their handler classes
 * - Extracts handler base classes (TriggerHandler, fflib_SObjectDomain, custom)
 * - Detects event methods in handler classes
 * - Returns structured handler-to-trigger associations
 *
 * Usage:
 *   const detector = new ApexHandlerDetector();
 *   const associations = detector.detectHandlerAssociations(triggerBody, triggerName);
 *   const events = detector.extractTriggerEvents(triggerBody);
 *
 * @version 1.0.0
 * @date 2025-10-29
 */

class ApexHandlerDetector {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
    }

    /**
     * Detect handler class associations from trigger body
     * @param {string} triggerBody - Apex trigger source code
     * @param {string} triggerName - Name of the trigger
     * @returns {Array<Object>} Array of handler associations
     */
    detectHandlerAssociations(triggerBody, triggerName) {
        if (!triggerBody || typeof triggerBody !== 'string') {
            return [];
        }

        const handlers = new Set();
        const associations = [];

        // Pattern 1: new HandlerClassName() instantiation
        // Example: new AccountTriggerHandler()
        const instantiationPattern = /new\s+([A-Z][A-Za-z0-9_]+)\s*\(/g;
        let match;

        while ((match = instantiationPattern.exec(triggerBody)) !== null) {
            const className = match[1];
            // Filter out common non-handler classes
            if (!this.isCommonNonHandler(className)) {
                handlers.add(className);
            }
        }

        // Pattern 2: ClassName.staticMethod() invocation
        // Example: AccountTriggerHandler.handleBeforeInsert(Trigger.new)
        const staticMethodPattern = /([A-Z][A-Za-z0-9_]+)\.([a-z][A-Za-z0-9_]*)\s*\(/g;

        while ((match = staticMethodPattern.exec(triggerBody)) !== null) {
            const className = match[1];
            const methodName = match[2];

            // Filter out Apex system classes and common utilities
            if (!this.isSystemClass(className) && this.likelyHandlerMethod(methodName)) {
                handlers.add(className);
            }
        }

        // Pattern 3: Variable assignment pattern
        // Example: AccountTriggerHandler handler = new AccountTriggerHandler();
        const assignmentPattern = /([A-Z][A-Za-z0-9_]+)\s+\w+\s*=\s*new\s+([A-Z][A-Za-z0-9_]+)/g;

        while ((match = assignmentPattern.exec(triggerBody)) !== null) {
            const className = match[2];
            if (!this.isCommonNonHandler(className)) {
                handlers.add(className);
            }
        }

        // Convert Set to Array of association objects
        handlers.forEach(handlerClass => {
            associations.push({
                triggerName: triggerName,
                handlerClass: handlerClass,
                detectionMethod: this.getDetectionMethod(triggerBody, handlerClass)
            });
        });

        return associations;
    }

    /**
     * Extract trigger events from trigger body
     * @param {string} triggerBody - Apex trigger source code
     * @returns {Array<string>} Array of trigger events (e.g., ['before insert', 'after update'])
     */
    extractTriggerEvents(triggerBody) {
        if (!triggerBody || typeof triggerBody !== 'string') {
            return [];
        }

        const events = [];
        const eventPatterns = [
            { pattern: /Trigger\.isInsert\s*&&\s*Trigger\.isBefore/gi, event: 'before insert' },
            { pattern: /Trigger\.isInsert\s*&&\s*Trigger\.isAfter/gi, event: 'after insert' },
            { pattern: /Trigger\.isUpdate\s*&&\s*Trigger\.isBefore/gi, event: 'before update' },
            { pattern: /Trigger\.isUpdate\s*&&\s*Trigger\.isAfter/gi, event: 'after update' },
            { pattern: /Trigger\.isDelete\s*&&\s*Trigger\.isBefore/gi, event: 'before delete' },
            { pattern: /Trigger\.isDelete\s*&&\s*Trigger\.isAfter/gi, event: 'after delete' },
            { pattern: /Trigger\.isUndelete/gi, event: 'after undelete' },
        ];

        // Check each pattern
        eventPatterns.forEach(({ pattern, event }) => {
            if (pattern.test(triggerBody)) {
                events.push(event);
            }
        });

        // Fallback: Check trigger declaration
        // Example: trigger AccountTrigger on Account (before insert, after update)
        const declarationPattern = /trigger\s+\w+\s+on\s+\w+\s*\(([^)]+)\)/i;
        const declMatch = declarationPattern.exec(triggerBody);

        if (declMatch && events.length === 0) {
            const declEvents = declMatch[1]
                .split(',')
                .map(e => e.trim().toLowerCase())
                .filter(e => e.includes('before') || e.includes('after'));

            events.push(...declEvents);
        }

        return [...new Set(events)]; // Remove duplicates
    }

    /**
     * Detect handler base class from handler class body
     * @param {string} classBody - Apex class source code
     * @returns {string|null} Base class name or null
     */
    detectBaseClass(classBody) {
        if (!classBody || typeof classBody !== 'string') {
            return null;
        }

        // Pattern 1: extends BaseClassName
        const extendsPattern = /extends\s+([A-Z][A-Za-z0-9_]+)/i;
        const match = extendsPattern.exec(classBody);

        if (match) {
            return match[1];
        }

        // Pattern 2: implements Interface
        const implementsPattern = /implements\s+([A-Z][A-Za-z0-9_]+)/i;
        const implMatch = implementsPattern.exec(classBody);

        if (implMatch) {
            return implMatch[1];
        }

        return null;
    }

    /**
     * Extract event methods from handler class body
     * @param {string} classBody - Apex class source code
     * @returns {Array<string>} Array of event method names
     */
    extractEventMethods(classBody) {
        if (!classBody || typeof classBody !== 'string') {
            return [];
        }

        const eventMethods = [];

        // Common event method patterns
        const methodPatterns = [
            'beforeInsert',
            'beforeUpdate',
            'beforeDelete',
            'afterInsert',
            'afterUpdate',
            'afterDelete',
            'afterUndelete',
            'onBeforeInsert',
            'onBeforeUpdate',
            'onBeforeDelete',
            'onAfterInsert',
            'onAfterUpdate',
            'onAfterDelete',
            'onAfterUndelete',
            'handleBeforeInsert',
            'handleBeforeUpdate',
            'handleBeforeDelete',
            'handleAfterInsert',
            'handleAfterUpdate',
            'handleAfterDelete',
            'handleAfterUndelete'
        ];

        // Check for each method pattern
        methodPatterns.forEach(method => {
            // Pattern: public/private/global void/override methodName(
            const methodRegex = new RegExp(
                `(public|private|global|protected)\\s+(override\\s+)?(void|static\\s+void)\\s+${method}\\s*\\(`,
                'gi'
            );

            if (methodRegex.test(classBody)) {
                eventMethods.push(method);
            }
        });

        return [...new Set(eventMethods)]; // Remove duplicates
    }

    /**
     * Detect recursion guard patterns in handler/trigger
     * @param {string} codeBody - Apex source code
     * @returns {boolean} True if recursion guard detected
     */
    detectRecursionGuard(codeBody) {
        if (!codeBody || typeof codeBody !== 'string') {
            return false;
        }

        // Pattern 1: static Boolean flag
        const staticBoolPattern = /static\s+Boolean\s+\w*(run|executed|processing|inprogress)/i;
        if (staticBoolPattern.test(codeBody)) {
            return true;
        }

        // Pattern 2: TriggerHandler base class (has built-in recursion guard)
        if (/extends\s+TriggerHandler/i.test(codeBody)) {
            return true;
        }

        // Pattern 3: fflib framework (has built-in recursion guard)
        if (/extends\s+fflib_SObjectDomain/i.test(codeBody)) {
            return true;
        }

        return false;
    }

    /**
     * Detect ordering mechanism in handler/trigger
     * @param {string} codeBody - Apex source code
     * @returns {string|null} Ordering mechanism description or null
     */
    detectOrderingMechanism(codeBody) {
        if (!codeBody || typeof codeBody !== 'string') {
            return null;
        }

        // Pattern 1: CustomMetadata for ordering
        if (/Trigger_Order__mdt|TriggerSettings__mdt|TriggerConfig__mdt/i.test(codeBody)) {
            return 'CustomMetadata (Trigger Order)';
        }

        // Pattern 2: Custom Setting for ordering
        if (/TriggerSettings__c|TriggerConfig__c/i.test(codeBody)) {
            return 'Custom Setting (Trigger Config)';
        }

        // Pattern 3: Static order variable
        if (/static\s+(Integer|Decimal)\s+\w*order/i.test(codeBody)) {
            return 'Static Order Variable';
        }

        // Pattern 4: Framework-based ordering
        if (/fflib_SObjectDomain/i.test(codeBody)) {
            return 'fflib Framework (Built-in)';
        }

        return null;
    }

    /**
     * Check if class name is a common non-handler class
     * @private
     */
    isCommonNonHandler(className) {
        const nonHandlers = [
            'List', 'Map', 'Set', 'String', 'Integer', 'Decimal', 'Boolean',
            'Date', 'DateTime', 'Time', 'SObject', 'Database', 'System',
            'Test', 'Schema', 'ApexPages', 'Blob', 'Exception'
        ];
        return nonHandlers.includes(className);
    }

    /**
     * Check if class name is a system class
     * @private
     */
    isSystemClass(className) {
        const systemClasses = [
            'System', 'Database', 'Test', 'Schema', 'Trigger', 'ApexPages',
            'PageReference', 'SelectOption', 'Messaging', 'Limits', 'Math',
            'String', 'JSON', 'Blob', 'Crypto', 'EncodingUtil', 'URL'
        ];
        return systemClasses.includes(className);
    }

    /**
     * Check if method name is likely a handler method
     * @private
     */
    likelyHandlerMethod(methodName) {
        const handlerMethodPatterns = [
            /^handle/i,
            /^on[A-Z]/,
            /^before/i,
            /^after/i,
            /^execute/i,
            /^process/i,
            /^run/i
        ];

        return handlerMethodPatterns.some(pattern => pattern.test(methodName));
    }

    /**
     * Get detection method used to find handler
     * @private
     */
    getDetectionMethod(triggerBody, handlerClass) {
        if (new RegExp(`new\\s+${handlerClass}\\s*\\(`).test(triggerBody)) {
            return 'instantiation';
        }
        if (new RegExp(`${handlerClass}\\.\\w+\\s*\\(`).test(triggerBody)) {
            return 'static_method';
        }
        if (new RegExp(`${handlerClass}\\s+\\w+\\s*=`).test(triggerBody)) {
            return 'variable_assignment';
        }
        return 'unknown';
    }
}

module.exports = ApexHandlerDetector;

// CLI usage
if (require.main === module) {
    const fs = require('fs');
    const path = require('path');

    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.error('Usage: node apex-handler-detector.js <trigger-body-file> [trigger-name]');
        process.exit(1);
    }

    const triggerBodyFile = args[0];
    const triggerName = args[1] || path.basename(triggerBodyFile, '.apex');

    try {
        const triggerBody = fs.readFileSync(triggerBodyFile, 'utf8');
        const detector = new ApexHandlerDetector({ verbose: true });

        const associations = detector.detectHandlerAssociations(triggerBody, triggerName);
        const events = detector.extractTriggerEvents(triggerBody);

        console.log('\n=== Apex Handler Detection Results ===\n');
        console.log(`Trigger: ${triggerName}`);
        console.log(`Events: ${events.join(', ')}`);
        console.log(`\nHandler Associations (${associations.length}):`);

        associations.forEach(assoc => {
            console.log(`  - ${assoc.handlerClass} (detected via ${assoc.detectionMethod})`);
        });

        console.log('\n');
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

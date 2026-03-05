#!/usr/bin/env node
/**
 * validate-field.js - Validates a field exists on a Salesforce object
 *
 * Usage: node validate-field.js <ObjectName> <FieldName> [--org <alias>]
 * Exit 0 = valid, Exit 1 = invalid, Exit 2 = usage error
 *
 * Features:
 * - Caches metadata for 24 hours to avoid repeated API calls
 * - Supports relationship field validation (e.g., Account.Name validates Account relationship)
 * - Case-insensitive field matching
 * - Provides suggestions for similar field names on failure
 *
 * Copyright (c) 2024-2026 RevPal Corp.
 * Licensed under Proprietary Software License
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse arguments
const args = process.argv.slice(2);
let objectName = null;
let fieldName = null;
let orgAlias = null;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--org' && args[i + 1]) {
        orgAlias = args[i + 1];
        i++;
    } else if (!objectName) {
        objectName = args[i];
    } else if (!fieldName) {
        fieldName = args[i];
    }
}

if (!objectName || !fieldName) {
    console.error('Usage: validate-field.js <ObjectName> <FieldName> [--org <alias>]');
    console.error('');
    console.error('Validates that a field exists on a Salesforce object.');
    console.error('');
    console.error('Options:');
    console.error('  --org <alias>   Salesforce org alias (defaults to SF_TARGET_ORG or default org)');
    console.error('');
    console.error('Exit codes:');
    console.error('  0 = Field exists');
    console.error('  1 = Field does not exist');
    console.error('  2 = Usage error or API error');
    process.exit(2);
}

// Get org alias from environment if not provided
if (!orgAlias) {
    orgAlias = process.env.SF_TARGET_ORG || '';
}

// Cache configuration
const CACHE_TTL_HOURS = 24;
const cacheDir = path.join(
    process.env.HOME || process.env.USERPROFILE,
    '.claude',
    'cache',
    'sf-metadata',
    orgAlias || 'default'
);
const cacheFile = path.join(cacheDir, `${objectName.toLowerCase()}-fields.json`);

/**
 * Get field list from cache or API
 */
function getFieldList() {
    // Check cache first
    if (fs.existsSync(cacheFile)) {
        try {
            const stats = fs.statSync(cacheFile);
            const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);

            if (ageHours < CACHE_TTL_HOURS) {
                const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
                return cached;
            }
        } catch (err) {
            // Cache read failed, fetch fresh
        }
    }

    // Fetch from Salesforce
    try {
        const orgFlag = orgAlias ? `-o ${orgAlias}` : '';
        const cmd = `sf sobject describe ${objectName} ${orgFlag} --json`;

        const result = execSync(cmd, {
            encoding: 'utf8',
            timeout: 30000,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        const data = JSON.parse(result);

        if (!data.result || !data.result.fields) {
            console.error(`No field metadata returned for object: ${objectName}`);
            process.exit(2);
        }

        // Extract field names and relationship names
        const fieldData = {
            fields: data.result.fields.map(f => f.name.toLowerCase()),
            relationships: {},
            fieldDetails: {}
        };

        // Build relationship map and field details
        data.result.fields.forEach(f => {
            const lowerName = f.name.toLowerCase();
            fieldData.fieldDetails[lowerName] = {
                name: f.name,
                type: f.type,
                label: f.label,
                relationshipName: f.relationshipName
            };

            if (f.relationshipName) {
                fieldData.relationships[f.relationshipName.toLowerCase()] = f.name;
            }
        });

        // Cache the result
        try {
            fs.mkdirSync(cacheDir, { recursive: true });
            fs.writeFileSync(cacheFile, JSON.stringify(fieldData, null, 2));
        } catch (cacheErr) {
            // Cache write failed, continue anyway
        }

        return fieldData;

    } catch (err) {
        // Handle describe errors
        const errMsg = err.stderr ? err.stderr.toString() : err.message;

        if (errMsg.includes('INVALID_TYPE') || errMsg.includes('sObject type') || errMsg.includes('not found')) {
            console.error(`Object '${objectName}' does not exist or is not accessible`);
            console.error('');
            console.error('Common objects:');
            console.error('  Account, Contact, Opportunity, Lead, Case, Task, Event');
            console.error('  SBQQ__Quote__c, SBQQ__QuoteLine__c (Salesforce CPQ)');
        } else if (errMsg.includes('INVALID_SESSION_ID') || errMsg.includes('expired')) {
            console.error('Salesforce session expired. Please re-authenticate.');
            console.error(`  sf org login web${orgAlias ? ' -a ' + orgAlias : ''}`);
        } else {
            console.error(`Failed to describe object '${objectName}': ${errMsg}`);
        }

        process.exit(2);
    }
}

/**
 * Find similar field names for suggestions
 */
function findSimilarFields(fieldName, allFields, maxSuggestions = 5) {
    const target = fieldName.toLowerCase();
    const suggestions = [];

    for (const field of allFields) {
        // Levenshtein distance approximation (simple substring matching)
        if (field.includes(target) || target.includes(field)) {
            suggestions.push(field);
        } else if (field.replace(/_/g, '').includes(target.replace(/_/g, ''))) {
            suggestions.push(field);
        } else if (target.replace(/__c$/i, '') === field.replace(/__c$/i, '')) {
            suggestions.push(field);
        }
    }

    // Sort by length similarity
    suggestions.sort((a, b) => Math.abs(a.length - target.length) - Math.abs(b.length - target.length));

    return suggestions.slice(0, maxSuggestions);
}

// Main validation logic
const fieldData = getFieldList();
const normalizedField = fieldName.toLowerCase();

// Check direct field match
if (fieldData.fields.includes(normalizedField)) {
    // Field exists
    process.exit(0);
}

// Check if it's a relationship name (for queries like Account.Name)
if (fieldData.relationships[normalizedField]) {
    // Valid relationship
    process.exit(0);
}

// Check for Id suffix convention (AccountId instead of Account__c)
const withId = normalizedField.replace(/__c$/, 'id');
if (fieldData.fields.includes(withId)) {
    console.error(`Field '${fieldName}' not found. Did you mean '${fieldData.fieldDetails[withId].name}'?`);
    console.error(`Standard lookups use 'Id' suffix: AccountId, OwnerId, ContactId, etc.`);
    process.exit(1);
}

// Field not found
console.error(`Field '${fieldName}' not found on ${objectName}`);

// Suggest similar fields
const suggestions = findSimilarFields(fieldName, fieldData.fields);
if (suggestions.length > 0) {
    console.error('');
    console.error('Did you mean one of these?');
    suggestions.forEach(s => {
        const details = fieldData.fieldDetails[s];
        console.error(`  - ${details.name} (${details.type}): ${details.label}`);
    });
}

// Show common mistake patterns
const commonMistakes = {
    'contact__c': 'Use ContactId for standard lookup or check relationship name',
    'account__c': 'Use AccountId for standard lookup or check relationship name',
    'owner__c': 'Use OwnerId for owner lookup (standard field)',
    'createdby__c': 'Use CreatedById for created by lookup',
    'lastmodifiedby__c': 'Use LastModifiedById for last modified by lookup'
};

if (commonMistakes[normalizedField]) {
    console.error('');
    console.error(`Hint: ${commonMistakes[normalizedField]}`);
}

console.error('');
console.error(`Run this to see all fields: sf sobject describe ${objectName}${orgAlias ? ' -o ' + orgAlias : ''} --json | jq '.result.fields[].name'`);

process.exit(1);

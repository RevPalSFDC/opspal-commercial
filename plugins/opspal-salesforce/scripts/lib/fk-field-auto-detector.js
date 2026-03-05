#!/usr/bin/env node

/**
 * FK Field Auto-Detector
 *
 * Automatically detects foreign key (lookup/master-detail) fields between two objects
 * BEFORE suggesting fuzzy matching. This prevents unnecessary complexity when a direct
 * relationship already exists.
 *
 * Problem Solved (Reflection Cohort: Flow Operations & Versioning):
 *   Agents were implementing fuzzy matching between objects when a direct FK relationship
 *   existed, causing unnecessary complexity and potential data quality issues.
 *
 * Usage:
 *   const { checkForFKFields, suggestMatchingApproach } = require('./fk-field-auto-detector');
 *
 *   // Before implementing fuzzy matching:
 *   const fkCheck = await checkForFKFields(orgAlias, 'Contact', 'Account');
 *   if (fkCheck.hasFK) {
 *     console.log(`Use FK field: ${fkCheck.fkFields[0].field}`);
 *   } else {
 *     console.log('FK not found - fuzzy matching may be appropriate');
 *   }
 *
 * @module fk-field-auto-detector
 * @version 1.0.0
 * @created 2025-11-27
 * @source Reflection Cohort - Flow Operations & Versioning (Asana: 1212161776554062)
 */

const { execSync } = require('child_process');
const relationshipResolver = require('./relationship-name-resolver');

/**
 * Check for FK (lookup/master-detail) fields between two objects
 *
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} sourceObject - Source object (where FK field would be defined)
 * @param {string} targetObject - Target object (parent being referenced)
 * @param {Object} options - Options
 * @param {boolean} options.useCache - Use cached metadata (default: true)
 * @returns {Promise<Object>} FK detection result
 */
async function checkForFKFields(orgAlias, sourceObject, targetObject, options = {}) {
    const { useCache = true } = options;

    const result = {
        hasFK: false,
        fkFields: [],
        sourceObject,
        targetObject,
        recommendation: null,
        checkedAt: new Date().toISOString()
    };

    try {
        // Get child relationships from target object to find fields pointing to it
        const relationships = await relationshipResolver.getAllChildRelationships(
            orgAlias,
            targetObject,
            useCache
        );

        // Find relationships where childSObject matches sourceObject
        const matchingRelationships = relationships.filter(rel =>
            rel.childSObject === sourceObject ||
            rel.childSObject.toLowerCase() === sourceObject.toLowerCase()
        );

        if (matchingRelationships.length > 0) {
            result.hasFK = true;
            result.fkFields = matchingRelationships.map(rel => ({
                field: rel.field,
                relationshipName: rel.relationshipName,
                cascadeDelete: rel.cascadeDelete || false,
                restrictedDelete: rel.restrictedDelete || false,
                type: rel.cascadeDelete ? 'Master-Detail' : 'Lookup'
            }));

            result.recommendation = `
✅ DIRECT FK RELATIONSHIP FOUND

   ${sourceObject}.${result.fkFields[0].field} → ${targetObject}

   Use this field instead of fuzzy matching:
   - More reliable (referential integrity)
   - Better performance (indexed)
   - No risk of incorrect matches

   Example SOQL:
   SELECT Id, ${result.fkFields[0].field}, ...
   FROM ${sourceObject}
   WHERE ${result.fkFields[0].field} = :targetRecordId
`.trim();
        } else {
            result.recommendation = `
ℹ️  NO DIRECT FK RELATIONSHIP FOUND

   ${sourceObject} → ${targetObject}

   Fuzzy matching may be appropriate if:
   - Objects need to be linked by name/email/external ID
   - No natural relationship exists in schema

   Consider:
   1. Creating a custom lookup field if linking is common
   2. Using External ID matching if available
   3. Implementing fuzzy match with caution (validate results)
`.trim();
        }

        return result;

    } catch (error) {
        result.error = error.message;
        result.recommendation = `Unable to check FK relationships: ${error.message}`;
        return result;
    }
}

/**
 * Suggest the best matching approach for linking records
 *
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} sourceObject - Source object
 * @param {string} targetObject - Target object
 * @param {Object} options - Options
 * @returns {Promise<Object>} Matching approach suggestion
 */
async function suggestMatchingApproach(orgAlias, sourceObject, targetObject, options = {}) {
    const fkCheck = await checkForFKFields(orgAlias, sourceObject, targetObject, options);

    const suggestion = {
        approach: null,
        confidence: 0,
        details: fkCheck,
        steps: []
    };

    if (fkCheck.hasFK) {
        suggestion.approach = 'FK_FIELD';
        suggestion.confidence = 1.0;
        suggestion.steps = [
            `Use existing FK field: ${fkCheck.fkFields[0].field}`,
            `Query: SELECT Id, ${fkCheck.fkFields[0].field} FROM ${sourceObject} WHERE ${fkCheck.fkFields[0].field} = :targetId`
        ];
    } else {
        // Check for potential External ID fields
        const externalIdFields = await checkForExternalIdFields(orgAlias, sourceObject, targetObject);

        if (externalIdFields.length > 0) {
            suggestion.approach = 'EXTERNAL_ID';
            suggestion.confidence = 0.9;
            suggestion.steps = [
                `Use External ID field: ${externalIdFields[0].field}`,
                'External IDs provide reliable matching without full fuzzy logic'
            ];
        } else {
            suggestion.approach = 'FUZZY_MATCH';
            suggestion.confidence = 0.5;
            suggestion.steps = [
                'No direct FK or External ID found',
                'Implement fuzzy matching with validation',
                'Suggest: Match on Name + Account/Parent + validate results'
            ];
        }
    }

    return suggestion;
}

/**
 * Check for potential External ID fields that could be used for matching
 *
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} sourceObject - Source object
 * @param {string} targetObject - Target object
 * @returns {Promise<Array>} External ID fields
 */
async function checkForExternalIdFields(orgAlias, sourceObject, targetObject) {
    try {
        // Query FieldDefinition for External ID fields
        const query = `
            SELECT QualifiedApiName, Label, IsIdLookup
            FROM FieldDefinition
            WHERE EntityDefinition.QualifiedApiName = '${sourceObject}'
              AND IsIdLookup = true
        `;

        const result = execSync(
            `sf data query --query "${query.replace(/\n/g, ' ')}" --target-org ${orgAlias} --use-tooling-api --json`,
            { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
        );

        const data = JSON.parse(result);

        if (data.status === 0 && data.result && data.result.records) {
            return data.result.records.map(rec => ({
                field: rec.QualifiedApiName,
                label: rec.Label,
                isExternalId: true
            }));
        }

        return [];
    } catch (error) {
        // Silently return empty array if query fails
        return [];
    }
}

// ============================================================================
// CLI Interface
// ============================================================================

if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 3 || args.includes('--help') || args.includes('-h')) {
        console.log(`
FK Field Auto-Detector

Detects foreign key fields between objects before suggesting fuzzy matching.

Usage:
  node fk-field-auto-detector.js <org-alias> <source-object> <target-object>
  node fk-field-auto-detector.js <org-alias> <source-object> <target-object> --suggest

Examples:
  # Check if Contact has a FK to Account
  node fk-field-auto-detector.js my-org Contact Account

  # Get matching approach suggestion
  node fk-field-auto-detector.js my-org Contact Account --suggest

  # Check OpportunityLineItem to PricebookEntry
  node fk-field-auto-detector.js my-org OpportunityLineItem PricebookEntry
        `);
        process.exit(0);
    }

    const [orgAlias, sourceObject, targetObject] = args;
    const wantSuggestion = args.includes('--suggest');

    (async () => {
        try {
            if (wantSuggestion) {
                const suggestion = await suggestMatchingApproach(orgAlias, sourceObject, targetObject);
                console.log(JSON.stringify(suggestion, null, 2));
            } else {
                const result = await checkForFKFields(orgAlias, sourceObject, targetObject);
                console.log(result.recommendation);
                console.log('\nRaw Result:', JSON.stringify(result, null, 2));
            }
            process.exit(0);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    })();
}

module.exports = {
    checkForFKFields,
    suggestMatchingApproach,
    checkForExternalIdFields
};

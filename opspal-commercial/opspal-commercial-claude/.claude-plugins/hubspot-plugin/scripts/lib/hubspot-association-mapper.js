#!/usr/bin/env node

/**
 * HubSpot Association Mapper
 *
 * Maps between object pairs and their association IDs.
 * CRITICAL: Association IDs are DIRECTIONAL
 * - Contact→Company (279) ≠ Company→Contact (280)
 *
 * Usage:
 *   const mapper = new HubSpotAssociationMapper();
 *   const id = mapper.getAssociationId('contacts', 'companies'); // 279
 *
 * @module hubspot-association-mapper
 * @version 1.0.0
 * @created 2025-10-24
 * @addresses Cohort #2 - HubSpot Lists API Issues ($10k ROI)
 */

const fs = require('fs');
const path = require('path');

class HubSpotAssociationMapper {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.configPath = options.configPath || path.join(__dirname, '../../config/hubspot-association-ids.json');
        this.config = this.loadConfig();
    }

    /**
     * Load association ID configuration
     */
    loadConfig() {
        try {
            const content = fs.readFileSync(this.configPath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error(`Failed to load association config: ${error.message}`);
            return { associations: {}, lookup: { by_objects: {} } };
        }
    }

    /**
     * Get association ID for object pair
     *
     * @param {string} fromObject - Source object (e.g., 'contacts')
     * @param {string} toObject - Target object (e.g., 'companies')
     * @returns {number|null} Association ID or null if not found
     */
    getAssociationId(fromObject, toObject) {
        // Normalize object names for lookup (keep plural form as used in config)
        const from = fromObject.toLowerCase();
        const to = toObject.toLowerCase();

        // Try lookup by combined key
        const key = `${from}_to_${to}`;
        const id = this.config.lookup.by_objects[key];

        if (id) {
            if (this.verbose) {
                console.log(`✅ Found association: ${fromObject} → ${toObject} = ${id}`);
            }
            return id;
        }

        if (this.verbose) {
            console.warn(`⚠️  No association found for: ${fromObject} → ${toObject}`);
        }

        return null;
    }

    /**
     * Get association details
     *
     * @param {number} associationId - Association ID to lookup
     * @returns {Object|null} Association details or null
     */
    getAssociationDetails(associationId) {
        for (const [key, assoc] of Object.entries(this.config.associations)) {
            if (assoc.id === associationId) {
                return assoc;
            }
        }
        return null;
    }

    /**
     * Suggest correct association ID if wrong one used
     *
     * @param {string} fromObject - Source object
     * @param {string} toObject - Target object
     * @param {number} usedId - ID that was used
     * @returns {Object} Suggestion with correct ID
     */
    suggestCorrection(fromObject, toObject, usedId) {
        const correctId = this.getAssociationId(fromObject, toObject);
        const reverseId = this.getAssociationId(toObject, fromObject);

        if (usedId === reverseId && correctId) {
            return {
                error: 'Wrong direction',
                message: `Used ${toObject}→${fromObject} (${usedId}) instead of ${fromObject}→${toObject} (${correctId})`,
                correctId: correctId,
                suggestion: `Association IDs are directional. Use ${correctId} for ${fromObject}→${toObject}`
            };
        }

        if (!correctId) {
            return {
                error: 'Invalid association',
                message: `No association exists between ${fromObject} and ${toObject}`,
                correctId: null,
                suggestion: 'Check object names and ensure association exists in HubSpot'
            };
        }

        return {
            error: 'ID mismatch',
            message: `Used ${usedId} but correct ID is ${correctId}`,
            correctId: correctId,
            suggestion: `Use ${correctId} for ${fromObject}→${toObject}`
        };
    }

    /**
     * Validate association ID for object pair
     *
     * @param {string} fromObject - Source object
     * @param {string} toObject - Target object
     * @param {number} providedId - ID to validate
     * @returns {Object} Validation result
     */
    validate(fromObject, toObject, providedId) {
        const correctId = this.getAssociationId(fromObject, toObject);

        if (!correctId) {
            return {
                valid: false,
                message: `No association exists between ${fromObject} and ${toObject}`,
                correctId: null
            };
        }

        if (providedId === correctId) {
            return {
                valid: true,
                message: `Correct association ID (${correctId})`,
                correctId: correctId
            };
        }

        const suggestion = this.suggestCorrection(fromObject, toObject, providedId);

        return {
            valid: false,
            message: suggestion.message,
            correctId: correctId,
            suggestion: suggestion.suggestion
        };
    }

    /**
     * List all associations for an object
     *
     * @param {string} objectName - Object to list associations for
     * @returns {Array} Array of associations
     */
    listAssociations(objectName) {
        const normalized = this.normalizeObjectName(objectName);
        const associations = [];

        for (const [key, assoc] of Object.entries(this.config.associations)) {
            const fromNorm = this.normalizeObjectName(assoc.fromObject);
            const toNorm = this.normalizeObjectName(assoc.toObject);

            if (fromNorm === normalized || toNorm === normalized) {
                associations.push({
                    id: assoc.id,
                    name: assoc.name,
                    from: assoc.fromObject,
                    to: assoc.toObject,
                    description: assoc.description
                });
            }
        }

        return associations;
    }

    /**
     * Normalize object name
     */
    normalizeObjectName(name) {
        // Remove plurals, lowercase
        return name.toLowerCase()
            .replace(/ies$/, 'y')  // companies → company
            .replace(/s$/, '');     // contacts → contact
    }

    /**
     * Get common mistakes for reference
     */
    getCommonMistakes() {
        return this.config.common_mistakes || [];
    }
}

// CLI usage
if (require.main === module) {
    const mapper = new HubSpotAssociationMapper({ verbose: true });

    const command = process.argv[2];

    if (command === 'get') {
        // Get association ID
        const from = process.argv[3];
        const to = process.argv[4];

        if (!from || !to) {
            console.error('Usage: node hubspot-association-mapper.js get <from> <to>');
            process.exit(1);
        }

        const id = mapper.getAssociationId(from, to);
        if (id) {
            console.log(`\n✅ Association ID: ${id}`);
            console.log(`   ${from} → ${to}`);
        } else {
            console.log(`\n❌ No association found for ${from} → ${to}`);
            process.exit(1);
        }

    } else if (command === 'validate') {
        // Validate association ID
        const from = process.argv[3];
        const to = process.argv[4];
        const providedId = parseInt(process.argv[5], 10);

        if (!from || !to || isNaN(providedId)) {
            console.error('Usage: node hubspot-association-mapper.js validate <from> <to> <id>');
            process.exit(1);
        }

        const result = mapper.validate(from, to, providedId);
        console.log(`\n${result.valid ? '✅' : '❌'} ${result.message}`);

        if (!result.valid && result.suggestion) {
            console.log(`\n💡 Suggestion: ${result.suggestion}`);
        }

        process.exit(result.valid ? 0 : 1);

    } else if (command === 'list') {
        // List associations for object
        const objectName = process.argv[3];

        if (!objectName) {
            console.error('Usage: node hubspot-association-mapper.js list <object>');
            process.exit(1);
        }

        const associations = mapper.listAssociations(objectName);
        console.log(`\n=== Associations for ${objectName} ===\n`);

        for (const assoc of associations) {
            console.log(`${assoc.id}: ${assoc.from} → ${assoc.to}`);
            console.log(`   ${assoc.description}`);
            console.log('');
        }

    } else {
        console.log('HubSpot Association Mapper');
        console.log('');
        console.log('Usage:');
        console.log('  node hubspot-association-mapper.js get <from> <to>');
        console.log('  node hubspot-association-mapper.js validate <from> <to> <id>');
        console.log('  node hubspot-association-mapper.js list <object>');
        console.log('');
        console.log('Examples:');
        console.log('  node hubspot-association-mapper.js get contacts companies');
        console.log('  node hubspot-association-mapper.js validate contacts companies 279');
        console.log('  node hubspot-association-mapper.js list contacts');
    }
}

module.exports = HubSpotAssociationMapper;

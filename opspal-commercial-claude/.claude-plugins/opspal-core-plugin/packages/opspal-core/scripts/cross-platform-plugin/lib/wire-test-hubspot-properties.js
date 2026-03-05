#!/usr/bin/env node
/**
 * Live Wire Sync Test - HubSpot Property Creation & Management
 *
 * Purpose: Create and validate HubSpot custom properties required for bidirectional
 * sync testing with Salesforce.
 *
 * Features:
 * - Create 12 custom properties on Company and Contact objects
 * - Validate existing properties
 * - Property definition templates
 * - Batch creation with error handling
 * - Idempotent operations (safe to re-run)
 *
 * Usage:
 *   const HubSpotProperties = require('./wire-test-hubspot-properties');
 *   const props = new HubSpotProperties(config);
 *
 *   // Validate existing properties
 *   const validation = await props.validateProperties('company');
 *
 *   // Create missing properties
 *   await props.createMissingProperties('company');
 *
 *   // Full setup (validate + create)
 *   await props.setupAllProperties(['company', 'contact']);
 */

const https = require('https');

class WireTestHubSpotProperties {
    constructor(config) {
        this.portalId = config.hubspot.portalId;
        this.accessToken = config.hubspot.accessToken;
        this.baseUrl = 'api.hubapi.com';
        this.config = config;
    }

    /**
     * Property definitions for wire test
     */
    getPropertyDefinitions(objectType) {
        const groupName = objectType === 'company' ? 'companyinformation' : 'contactinformation';

        return [
            {
                name: 'sync_anchor',
                label: 'Sync Anchor',
                description: 'Stable UUID identifier for bidirectional sync. Never regenerated, used as primary join key.',
                type: 'string',
                fieldType: 'text',
                groupName,
                hasUniqueValue: true,
                hidden: false,
                formField: true
            },
            {
                name: 'wire_test_1',
                label: 'Wire Test 1',
                description: 'Probe field for SF→HS sync testing. Toggled in Salesforce, polled in HubSpot.',
                type: 'bool',
                fieldType: 'booleancheckbox',
                groupName,
                hidden: false,
                formField: true
            },
            {
                name: 'wire_test_2',
                label: 'Wire Test 2',
                description: 'Probe field for HS→SF sync testing. Toggled in HubSpot, polled in Salesforce.',
                type: 'bool',
                fieldType: 'booleancheckbox',
                groupName,
                hidden: false,
                formField: true
            },
            {
                name: 'salesforce_id',
                label: 'Salesforce ID',
                description: 'Salesforce Account/Contact 18-character ID. Used as fallback join if Sync Anchor not available.',
                type: 'string',
                fieldType: 'text',
                groupName,
                hasUniqueValue: false, // SF maintains uniqueness
                hidden: false,
                formField: true
            },
            {
                name: 'last_sync_time',
                label: 'Last Sync Time',
                description: 'Timestamp of last successful sync operation between HubSpot and Salesforce.',
                type: 'datetime',
                fieldType: 'date',
                groupName,
                hidden: false,
                formField: false
            },
            {
                name: 'manual_sync',
                label: 'Manual Sync',
                description: 'Manual trigger for testing on-demand sync. Toggle to initiate immediate sync test.',
                type: 'bool',
                fieldType: 'booleancheckbox',
                groupName,
                hidden: false,
                formField: true
            },
            {
                name: 'former_sfdc_ids',
                label: 'Former SFDC IDs',
                description: 'Comma-separated list of former Salesforce IDs from merge operations. Append only.',
                type: 'string',
                fieldType: 'textarea',
                groupName,
                hidden: true,
                formField: false
            },
            {
                name: 'former_hubspot_ids',
                label: 'Former HubSpot IDs',
                description: 'Comma-separated list of former HubSpot IDs from merge operations. Append only.',
                type: 'string',
                fieldType: 'textarea',
                groupName,
                hidden: true,
                formField: false
            },
            {
                name: 'wire_test_run_id',
                label: 'Wire Test Run ID',
                description: 'UUID of current wire test run. Prevents reacting to own test toggles.',
                type: 'string',
                fieldType: 'text',
                groupName,
                hidden: true,
                formField: false
            },
            {
                name: 'wire_test_timestamp',
                label: 'Wire Test Timestamp',
                description: 'Timestamp when wire test probe was initiated. Used to calculate propagation lag.',
                type: 'datetime',
                fieldType: 'date',
                groupName,
                hidden: true,
                formField: false
            },
            {
                name: 'last_sync_direction',
                label: 'Last Sync Direction',
                description: 'Direction of last sync operation (HS→SF, SF→HS, Unknown).',
                type: 'enumeration',
                fieldType: 'select',
                groupName,
                options: [
                    { label: 'HS→SF', value: 'hs_to_sf', description: 'Last synced from HubSpot to Salesforce' },
                    { label: 'SF→HS', value: 'sf_to_hs', description: 'Last synced from Salesforce to HubSpot' },
                    { label: 'Unknown', value: 'unknown', description: 'Sync direction unknown or not recorded' }
                ],
                hidden: false,
                formField: false
            },
            {
                name: 'last_sync_error',
                label: 'Last Sync Error',
                description: 'Optional error message from last sync attempt. Cleared on successful sync.',
                type: 'string',
                fieldType: 'textarea',
                groupName,
                hidden: true,
                formField: false
            }
        ];
    }

    /**
     * Get existing properties for an object
     * @param {string} objectType - 'company' or 'contact'
     * @returns {Promise<Array>}
     */
    async getExistingProperties(objectType) {
        const path = `/properties/v2/${objectType === 'company' ? 'companies' : 'contacts'}/properties`;

        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.baseUrl,
                path: path,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(JSON.parse(data));
                    } else {
                        reject(new Error(`Failed to get properties: ${res.statusCode} - ${data}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.end();
        });
    }

    /**
     * Create a single property
     * @param {string} objectType - 'company' or 'contact'
     * @param {object} propertyDef - Property definition
     * @returns {Promise<object>}
     */
    async createProperty(objectType, propertyDef) {
        const path = `/properties/v2/${objectType === 'company' ? 'companies' : 'contacts'}/properties`;

        return new Promise((resolve, reject) => {
            const postData = JSON.stringify(propertyDef);

            const options = {
                hostname: this.baseUrl,
                path: path,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode === 200 || res.statusCode === 201) {
                        resolve(JSON.parse(data));
                    } else if (res.statusCode === 409) {
                        // Property already exists - not an error
                        resolve({ status: 'already_exists', name: propertyDef.name });
                    } else {
                        reject(new Error(`Failed to create property ${propertyDef.name}: ${res.statusCode} - ${data}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.write(postData);
            req.end();
        });
    }

    /**
     * Validate existing properties against spec
     * @param {string} objectType - 'company' or 'contact'
     * @returns {Promise<object>} Validation result with missing/mismatched properties
     */
    async validateProperties(objectType) {
        const requiredProps = this.getPropertyDefinitions(objectType);
        const existingProps = await this.getExistingProperties(objectType);

        const existingMap = new Map();
        existingProps.forEach(prop => {
            existingMap.set(prop.name, prop);
        });

        const validation = {
            objectType,
            totalRequired: requiredProps.length,
            existing: 0,
            missing: [],
            mismatched: []
        };

        requiredProps.forEach(required => {
            const existing = existingMap.get(required.name);

            if (!existing) {
                validation.missing.push(required.name);
            } else {
                validation.existing++;

                // Check for type mismatches
                if (existing.type !== required.type) {
                    validation.mismatched.push({
                        name: required.name,
                        expected: required.type,
                        actual: existing.type
                    });
                }
            }
        });

        return validation;
    }

    /**
     * Create missing properties for an object
     * @param {string} objectType - 'company' or 'contact'
     * @param {boolean} dryRun - If true, only log what would be created
     * @returns {Promise<object>} Creation results
     */
    async createMissingProperties(objectType, dryRun = false) {
        const validation = await this.validateProperties(objectType);

        if (validation.missing.length === 0) {
            return {
                objectType,
                message: 'All properties already exist',
                created: 0,
                errors: 0
            };
        }

        console.log(`\n🔧 Creating ${validation.missing.length} missing properties for ${objectType}...`);

        const requiredProps = this.getPropertyDefinitions(objectType);
        const missingProps = requiredProps.filter(p => validation.missing.includes(p.name));

        const results = {
            objectType,
            created: 0,
            already_existed: 0,
            errors: 0,
            details: []
        };

        for (const prop of missingProps) {
            try {
                if (dryRun) {
                    console.log(`  [DRY RUN] Would create: ${prop.name} (${prop.type})`);
                    results.details.push({ name: prop.name, status: 'dry_run' });
                } else {
                    console.log(`  Creating: ${prop.name} (${prop.type})...`);
                    const result = await this.createProperty(objectType, prop);

                    if (result.status === 'already_exists') {
                        results.already_existed++;
                        console.log(`    ℹ️  Already exists`);
                    } else {
                        results.created++;
                        console.log(`    ✅ Created`);
                    }

                    results.details.push({ name: prop.name, status: 'created', result });

                    // Rate limiting: wait 100ms between requests
                    await this._sleep(100);
                }
            } catch (error) {
                results.errors++;
                console.error(`    ❌ Error: ${error.message}`);
                results.details.push({ name: prop.name, status: 'error', error: error.message });
            }
        }

        return results;
    }

    /**
     * Setup all properties for multiple object types
     * @param {Array<string>} objectTypes - ['company', 'contact', ...]
     * @param {boolean} dryRun - If true, only validate and report
     * @returns {Promise<object>}
     */
    async setupAllProperties(objectTypes, dryRun = false) {
        console.log('\n📋 Live Wire Sync Test - HubSpot Property Setup');
        console.log('═'.repeat(60));

        const summary = {
            dryRun,
            objectTypes,
            validations: {},
            creations: {},
            totalCreated: 0,
            totalErrors: 0
        };

        for (const objectType of objectTypes) {
            console.log(`\n🔍 Validating ${objectType} properties...`);

            // Validate
            const validation = await this.validateProperties(objectType);
            summary.validations[objectType] = validation;

            console.log(`  Total required: ${validation.totalRequired}`);
            console.log(`  Existing: ${validation.existing}`);
            console.log(`  Missing: ${validation.missing.length}`);

            if (validation.mismatched.length > 0) {
                console.warn(`  ⚠️  Type mismatches: ${validation.mismatched.length}`);
                validation.mismatched.forEach(m => {
                    console.warn(`    - ${m.name}: expected ${m.expected}, got ${m.actual}`);
                });
            }

            // Create missing
            if (validation.missing.length > 0) {
                const creation = await this.createMissingProperties(objectType, dryRun);
                summary.creations[objectType] = creation;
                summary.totalCreated += creation.created;
                summary.totalErrors += creation.errors;
            } else {
                console.log(`  ✅ All properties already exist`);
            }
        }

        console.log('\n═'.repeat(60));
        console.log(`\n✅ Setup complete!`);
        console.log(`  Objects processed: ${objectTypes.length}`);
        console.log(`  Properties created: ${summary.totalCreated}`);
        console.log(`  Errors: ${summary.totalErrors}`);

        return summary;
    }

    /**
     * Sleep utility for rate limiting
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// CLI Usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === '--help') {
        console.log(`
Live Wire Sync Test - HubSpot Property Creation

Usage:
  node wire-test-hubspot-properties.js validate <object-type>
  node wire-test-hubspot-properties.js create <object-type> [--dry-run]
  node wire-test-hubspot-properties.js setup-all [--dry-run]
  node wire-test-hubspot-properties.js list-definitions <object-type>

Commands:
  validate          - Validate existing properties against spec
  create            - Create missing properties
  setup-all         - Validate and create for all objects (company, contact)
  list-definitions  - List all required property definitions

Object Types:
  company  - HubSpot Companies (maps to Salesforce Accounts)
  contact  - HubSpot Contacts (maps to Salesforce Contacts)

Environment Variables:
  HUBSPOT_PORTAL_ID            - HubSpot Portal ID
  HUBSPOT_PRIVATE_APP_TOKEN    - HubSpot Private App Access Token

Examples:
  node wire-test-hubspot-properties.js validate company
  node wire-test-hubspot-properties.js create company --dry-run
  node wire-test-hubspot-properties.js setup-all
        `);
        process.exit(0);
    }

    // Load configuration
    const ConfigLoader = require('./wire-test-config-loader');
    const config = ConfigLoader.loadOrDefault();

    if (!config.hubspot.portalId || !config.hubspot.accessToken) {
        console.error('❌ Error: HubSpot configuration missing');
        console.error('Set HUBSPOT_PORTAL_ID and HUBSPOT_PRIVATE_APP_TOKEN environment variables');
        process.exit(1);
    }

    const props = new WireTestHubSpotProperties(config);

    (async () => {
        try {
            switch (command) {
                case 'validate':
                    const objectType = args[1] || 'company';
                    const validation = await props.validateProperties(objectType);
                    console.log('\n📊 Validation Results');
                    console.log('═'.repeat(60));
                    console.log(`Object Type: ${validation.objectType}`);
                    console.log(`Total Required: ${validation.totalRequired}`);
                    console.log(`Existing: ${validation.existing}`);
                    console.log(`Missing: ${validation.missing.length}`);
                    if (validation.missing.length > 0) {
                        console.log('\nMissing Properties:');
                        validation.missing.forEach(name => console.log(`  - ${name}`));
                    }
                    if (validation.mismatched.length > 0) {
                        console.log('\nType Mismatches:');
                        validation.mismatched.forEach(m => {
                            console.log(`  - ${m.name}: expected ${m.expected}, got ${m.actual}`);
                        });
                    }
                    break;

                case 'create':
                    const createObjectType = args[1] || 'company';
                    const dryRun = args.includes('--dry-run');
                    const results = await props.createMissingProperties(createObjectType, dryRun);
                    console.log('\n📊 Creation Results');
                    console.log('═'.repeat(60));
                    console.log(`Object Type: ${results.objectType}`);
                    console.log(`Created: ${results.created}`);
                    console.log(`Already Existed: ${results.already_existed}`);
                    console.log(`Errors: ${results.errors}`);
                    break;

                case 'setup-all':
                    const setupDryRun = args.includes('--dry-run');
                    const summary = await props.setupAllProperties(['company', 'contact'], setupDryRun);
                    // Summary already printed by method
                    break;

                case 'list-definitions':
                    const listObjectType = args[1] || 'company';
                    const definitions = props.getPropertyDefinitions(listObjectType);
                    console.log(`\n📋 Property Definitions for ${listObjectType}`);
                    console.log('═'.repeat(60));
                    definitions.forEach((def, i) => {
                        console.log(`\n${i + 1}. ${def.name}`);
                        console.log(`   Label: ${def.label}`);
                        console.log(`   Type: ${def.type} (${def.fieldType})`);
                        console.log(`   Description: ${def.description}`);
                        if (def.options) {
                            console.log(`   Options: ${def.options.map(o => o.value).join(', ')}`);
                        }
                    });
                    break;

                default:
                    console.error(`Unknown command: ${command}`);
                    process.exit(1);
            }
        } catch (error) {
            console.error('\n❌ Error:', error.message);
            if (error.stack) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    })();
}

module.exports = WireTestHubSpotProperties;

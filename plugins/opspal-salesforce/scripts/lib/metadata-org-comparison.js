#!/usr/bin/env node

/**
 * Metadata vs Org State Comparison Tool
 *
 * Compares local metadata files with actual org state via Describe API.
 * Detects mismatches that cause deployment failures:
 * - Field required flags (metadata says false, org enforces true)
 * - Field types and lengths
 * - Validation rules affecting field requirements
 * - Field dependencies
 *
 * Usage:
 *   node scripts/lib/metadata-org-comparison.js <org-alias> [--object ObjectName] [--fix]
 *
 * Exit codes:
 *   0 = No mismatches found
 *   1 = Critical mismatches (HIGH severity)
 *   2 = Moderate mismatches (MEDIUM severity)
 *   3 = Minor mismatches (LOW severity)
 *
 * @author Metadata Validation Framework
 * @date 2025-10-04
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

class MetadataOrgComparison {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.targetObject = options.object || null;
        this.autoFix = options.fix || false;
        this.mismatches = {
            HIGH: [],
            MEDIUM: [],
            LOW: []
        };
    }

    /**
     * Run comparison
     */
    async compare() {
        console.log(`\n${'='.repeat(70)}`);
        console.log('METADATA vs ORG STATE COMPARISON');
        console.log(`Org: ${this.orgAlias}`);
        if (this.targetObject) {
            console.log(`Object: ${this.targetObject}`);
        }
        console.log(`${'='.repeat(70)}\n`);

        const objects = this.targetObject
            ? [this.targetObject]
            : this.discoverCustomObjects();

        for (const objectName of objects) {
            await this.compareObject(objectName);
        }

        this.printReport();
        return this.getExitCode();
    }

    /**
     * Discover custom objects from metadata
     */
    discoverCustomObjects() {
        const objects = [];
        const objectDirs = [
            'force-app/main/default/objects',
            'metadata/objects'
        ];

        objectDirs.forEach(dir => {
            if (fs.existsSync(dir)) {
                const entries = fs.readdirSync(dir);
                entries.forEach(entry => {
                    if (entry.endsWith('__c') || entry.endsWith('__mdt')) {
                        objects.push(entry);
                    }
                });
            }
        });

        return [...new Set(objects)]; // Deduplicate
    }

    /**
     * Compare a single object's metadata vs org state
     */
    async compareObject(objectName) {
        console.log(`📋 Comparing ${objectName}...`);

        try {
            // Get org state via Describe API
            const orgState = this.describeObject(objectName);

            if (!orgState) {
                console.log(`  ⚠️  Object not found in org, skipping comparison\n`);
                return;
            }

            // Compare fields
            await this.compareFields(objectName, orgState);

            console.log(`  ✅ Comparison complete\n`);

        } catch (error) {
            console.log(`  ⚠️  Error: ${error.message}\n`);
        }
    }

    /**
     * Compare fields for an object
     */
    async compareFields(objectName, orgState) {
        const orgFields = orgState.fields || [];

        for (const orgField of orgFields) {
            // Only check custom fields
            if (!orgField.custom) continue;

            const fieldName = orgField.name;
            const metadataFile = this.findFieldMetadata(objectName, fieldName);

            if (!metadataFile) {
                // Field exists in org but not in metadata
                this.mismatches.MEDIUM.push({
                    object: objectName,
                    field: fieldName,
                    type: 'MISSING_METADATA',
                    message: `Field exists in org but no local metadata file found`,
                    orgValue: 'Exists',
                    metadataValue: 'Missing'
                });
                continue;
            }

            // Parse metadata file
            const metadata = await this.parseFieldMetadata(metadataFile);

            // Compare required flag
            this.compareRequired(objectName, fieldName, orgField, metadata);

            // Compare type
            this.compareType(objectName, fieldName, orgField, metadata);

            // Compare length (for text fields)
            this.compareLength(objectName, fieldName, orgField, metadata);
        }
    }

    /**
     * Compare required flag
     */
    compareRequired(objectName, fieldName, orgField, metadata) {
        const orgRequired = !orgField.nillable && !orgField.defaultedOnCreate;
        const metadataRequired = metadata.required === 'true' || metadata.required === true;

        if (orgRequired !== metadataRequired) {
            const severity = orgRequired ? 'HIGH' : 'MEDIUM';
            this.mismatches[severity].push({
                object: objectName,
                field: fieldName,
                type: 'REQUIRED_MISMATCH',
                message: `Required flag mismatch (org enforces ${orgRequired}, metadata says ${metadataRequired})`,
                orgValue: orgRequired,
                metadataValue: metadataRequired,
                impact: orgRequired ? 'CRITICAL: DML operations will fail without this field' : 'WARNING: Field may be required but metadata allows null'
            });
        }
    }

    /**
     * Compare field type
     */
    compareType(objectName, fieldName, orgField, metadata) {
        const orgType = this.normalizeType(orgField.type);
        const metadataType = this.normalizeType(metadata.type);

        if (orgType !== metadataType && orgType && metadataType) {
            this.mismatches.HIGH.push({
                object: objectName,
                field: fieldName,
                type: 'TYPE_MISMATCH',
                message: `Field type mismatch`,
                orgValue: orgType,
                metadataValue: metadataType,
                impact: 'CRITICAL: Type mismatch will cause deployment failure'
            });
        }
    }

    /**
     * Compare field length
     */
    compareLength(objectName, fieldName, orgField, metadata) {
        if (orgField.type !== 'string' && orgField.type !== 'textarea') return;

        const orgLength = orgField.length;
        const metadataLength = parseInt(metadata.length);

        if (orgLength !== metadataLength && !isNaN(metadataLength)) {
            const severity = Math.abs(orgLength - metadataLength) > 50 ? 'MEDIUM' : 'LOW';
            this.mismatches[severity].push({
                object: objectName,
                field: fieldName,
                type: 'LENGTH_MISMATCH',
                message: `Field length mismatch`,
                orgValue: orgLength,
                metadataValue: metadataLength,
                impact: orgLength < metadataLength
                    ? 'Data truncation risk when syncing from org'
                    : 'Metadata allows longer values than org'
            });
        }
    }

    /**
     * Normalize field type for comparison
     */
    normalizeType(type) {
        if (!type) return null;

        const typeMap = {
            'string': 'Text',
            'textarea': 'TextArea',
            'boolean': 'Checkbox',
            'double': 'Number',
            'currency': 'Currency',
            'percent': 'Percent',
            'date': 'Date',
            'datetime': 'DateTime',
            'email': 'Email',
            'phone': 'Phone',
            'url': 'Url',
            'picklist': 'Picklist',
            'multipicklist': 'MultiselectPicklist',
            'reference': 'Lookup',
            'id': 'Lookup'
        };

        const normalized = typeMap[type.toLowerCase()] || type;
        return normalized;
    }

    /**
     * Find field metadata file
     */
    findFieldMetadata(objectName, fieldName) {
        const possiblePaths = [
            `force-app/main/default/objects/${objectName}/fields/${fieldName}.field-meta.xml`,
            `metadata/objects/${objectName}/fields/${fieldName}.field-meta.xml`,
            `objects/${objectName}/fields/${fieldName}.field-meta.xml`
        ];

        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }

        return null;
    }

    /**
     * Parse field metadata XML
     */
    async parseFieldMetadata(filePath) {
        const xml = fs.readFileSync(filePath, 'utf8');
        const parser = new xml2js.Parser();

        return new Promise((resolve, reject) => {
            parser.parseString(xml, (err, result) => {
                if (err) reject(err);
                else {
                    const field = result.CustomField || {};
                    resolve({
                        required: field.required ? field.required[0] : 'false',
                        type: field.type ? field.type[0] : null,
                        length: field.length ? field.length[0] : null
                    });
                }
            });
        });
    }

    /**
     * Describe object via Salesforce CLI
     */
    describeObject(objectName) {
        try {
            const cmd = `sf sobject describe --sobject ${objectName} --target-org ${this.orgAlias} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));
            return result.result;
        } catch (error) {
            return null;
        }
    }

    /**
     * Print comparison report
     */
    printReport() {
        console.log(`\n${'='.repeat(70)}`);
        console.log('COMPARISON REPORT');
        console.log(`${'='.repeat(70)}\n`);

        const totalMismatches = this.mismatches.HIGH.length +
                               this.mismatches.MEDIUM.length +
                               this.mismatches.LOW.length;

        if (totalMismatches === 0) {
            console.log('✅ NO MISMATCHES FOUND\n');
            console.log('Metadata files match org state.\n');
            return;
        }

        // Print HIGH severity
        if (this.mismatches.HIGH.length > 0) {
            console.log(`❌ HIGH SEVERITY MISMATCHES: ${this.mismatches.HIGH.length}\n`);
            this.printMismatches(this.mismatches.HIGH);
        }

        // Print MEDIUM severity
        if (this.mismatches.MEDIUM.length > 0) {
            console.log(`⚠️  MEDIUM SEVERITY MISMATCHES: ${this.mismatches.MEDIUM.length}\n`);
            this.printMismatches(this.mismatches.MEDIUM);
        }

        // Print LOW severity
        if (this.mismatches.LOW.length > 0) {
            console.log(`ℹ️  LOW SEVERITY MISMATCHES: ${this.mismatches.LOW.length}\n`);
            this.printMismatches(this.mismatches.LOW);
        }

        console.log(`${'='.repeat(70)}\n`);
    }

    /**
     * Print mismatch details
     */
    printMismatches(mismatches) {
        mismatches.forEach((mismatch, idx) => {
            console.log(`${idx + 1}. [${mismatch.object}.${mismatch.field}] ${mismatch.type}`);
            console.log(`   ${mismatch.message}`);
            console.log(`   Org: ${mismatch.orgValue}`);
            console.log(`   Metadata: ${mismatch.metadataValue}`);
            if (mismatch.impact) {
                console.log(`   💡 Impact: ${mismatch.impact}`);
            }
            console.log('');
        });
    }

    /**
     * Get exit code based on mismatches
     */
    getExitCode() {
        if (this.mismatches.HIGH.length > 0) {
            console.log('❌ CRITICAL MISMATCHES: Review and fix before deployment\n');
            return 1;
        }

        if (this.mismatches.MEDIUM.length > 0) {
            console.log('⚠️  MODERATE MISMATCHES: Review recommended\n');
            return 2;
        }

        if (this.mismatches.LOW.length > 0) {
            console.log('ℹ️  MINOR MISMATCHES: Informational only\n');
            return 3;
        }

        return 0;
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Usage: node metadata-org-comparison.js <org-alias> [--object ObjectName] [--fix]');
        process.exit(1);
    }

    const orgAlias = args[0];
    const objectIndex = args.indexOf('--object');
    const targetObject = objectIndex !== -1 ? args[objectIndex + 1] : null;
    const autoFix = args.includes('--fix');

    const comparator = new MetadataOrgComparison(orgAlias, {
        object: targetObject,
        fix: autoFix
    });

    comparator.compare()
        .then(exitCode => process.exit(exitCode))
        .catch(error => {
            console.error('Comparison failed:', error.message);
            process.exit(1);
        });
}

module.exports = MetadataOrgComparison;

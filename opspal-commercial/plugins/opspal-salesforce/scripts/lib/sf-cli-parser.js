#!/usr/bin/env node

/**
 * Salesforce CLI Output Parser Utility
 * 
 * Robust parsing for Salesforce CLI JSON output with fallback strategies
 * Handles complex nested structures and provides clean, consistent output
 * 
 * Created: 2025-09-02
 * Purpose: Address parsing issues discovered during Opportunity Record Types implementation
 */

const { execSync } = require('child_process');

function resolveEnvOrg() {
    return (
        process.env.SF_TARGET_ORG ||
        process.env.SFDC_INSTANCE ||
        process.env.SF_ORG_ALIAS ||
        process.env.ORG ||
        null
    );
}

class SfCliParser {
    constructor(options = {}) {
        this.debug = options.debug || false;
        this.org = options.org || resolveEnvOrg();
    }

    orgFlag() {
        return this.org ? ` --target-org ${this.org}` : '';
    }

    /**
     * Execute SF CLI command and parse output safely
     */
    executeSf(command, options = {}) {
        try {
            const fullCommand = `${command} --json 2>/dev/null`;
            if (this.debug) console.log('Executing:', fullCommand);
            
            const output = execSync(fullCommand, { 
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer
            });
            
            return this.parseJSON(output);
        } catch (error) {
            if (error.stdout) {
                const parsed = this.parseJSON(error.stdout);
                if (parsed && parsed.status === 1 && parsed.message) {
                    throw new Error(parsed.message);
                }
            }
            throw error;
        }
    }

    /**
     * Safely parse JSON with multiple fallback strategies
     */
    parseJSON(text) {
        if (!text) return null;
        
        // Strategy 1: Direct parse
        try {
            return JSON.parse(text);
        } catch (e) {
            if (this.debug) console.log('Direct parse failed, trying cleanup...');
        }
        
        // Strategy 2: Clean and parse
        try {
            const cleaned = text
                .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
                .replace(/^[^{[]+/, '') // Remove leading non-JSON
                .replace(/[^}\]]+$/, ''); // Remove trailing non-JSON
            return JSON.parse(cleaned);
        } catch (e) {
            if (this.debug) console.log('Cleaned parse failed, trying line-by-line...');
        }
        
        // Strategy 3: Line-by-line parsing for NDJSON
        try {
            const lines = text.split('\n').filter(l => l.trim());
            for (const line of lines) {
                if (line.startsWith('{') || line.startsWith('[')) {
                    return JSON.parse(line);
                }
            }
        } catch (e) {
            if (this.debug) console.log('Line parse failed');
        }
        
        return null;
    }

    /**
     * Parse Record Type information
     */
    parseRecordTypes(objectName) {
        const command = `sf sobject describe --sobject ${objectName}${this.orgFlag()}`;
        const result = this.executeSf(command);
        
        if (!result || !result.result) {
            throw new Error('Failed to retrieve record types');
        }
        
        const recordTypes = result.result.recordTypeInfos || [];
        return recordTypes.map(rt => ({
            id: rt.recordTypeId,
            name: rt.name,
            developerName: rt.developerName,
            active: rt.active,
            available: rt.available,
            master: rt.master,
            defaultMapping: rt.defaultRecordTypeMapping
        }));
    }

    /**
     * Parse Field descriptions with proper handling of custom fields
     */
    parseFields(objectName, options = {}) {
        const command = `sf sobject describe --sobject ${objectName}${this.orgFlag()}`;
        const result = this.executeSf(command);
        
        if (!result || !result.result || !result.result.fields) {
            throw new Error('Failed to retrieve fields');
        }
        
        let fields = result.result.fields;
        
        // Filter options
        if (options.customOnly) {
            fields = fields.filter(f => f.custom === true);
        }
        if (options.requiredOnly) {
            fields = fields.filter(f => !f.nillable && f.createable);
        }
        if (options.pattern) {
            const regex = new RegExp(options.pattern, 'i');
            fields = fields.filter(f => regex.test(f.name) || regex.test(f.label));
        }
        
        return fields.map(f => ({
            name: f.name,
            label: f.label,
            type: f.type,
            length: f.length,
            required: !f.nillable && f.createable,
            unique: f.unique,
            custom: f.custom,
            picklistValues: f.picklistValues,
            referenceTo: f.referenceTo,
            createable: f.createable,
            updateable: f.updateable
        }));
    }

    /**
     * Parse SOQL query results
     */
    parseQuery(query) {
        const command = `sf data query -q "${query}"${this.orgFlag()}`;
        const result = this.executeSf(command);
        
        if (!result || !result.result) {
            return { records: [], totalSize: 0 };
        }
        
        return {
            records: result.result.records || [],
            totalSize: result.result.totalSize || 0,
            done: result.result.done !== false
        };
    }

    /**
     * Parse deployment results
     */
    parseDeployment(deploymentId) {
        const command = `sf project deploy report --job-id ${deploymentId}${this.orgFlag()}`;
        const result = this.executeSf(command);
        
        if (!result || !result.result) {
            throw new Error('Failed to retrieve deployment status');
        }
        
        return {
            id: result.result.id,
            status: result.result.status,
            done: result.result.done,
            success: result.result.success,
            numberComponentsTotal: result.result.numberComponentsTotal,
            numberComponentsDeployed: result.result.numberComponentsDeployed,
            numberComponentErrors: result.result.numberComponentErrors,
            details: result.result.details || {}
        };
    }

    /**
     * Get required fields for an object/record type combination
     */
    getRequiredFields(objectName, recordTypeId = null) {
        const fields = this.parseFields(objectName, { requiredOnly: true });
        
        // If record type specified, could filter further based on page layout
        // This would require additional metadata API calls
        
        return fields;
    }

    /**
     * Check if a field exists and get its properties
     */
    getField(objectName, fieldName) {
        const fields = this.parseFields(objectName);
        return fields.find(f => 
            f.name.toLowerCase() === fieldName.toLowerCase() ||
            f.name.toLowerCase() === `${fieldName.toLowerCase()}__c`
        );
    }

    /**
     * Get picklist values for a field
     */
    getPicklistValues(objectName, fieldName) {
        const field = this.getField(objectName, fieldName);
        if (!field || !field.picklistValues) {
            return [];
        }
        
        return field.picklistValues
            .filter(pv => pv.active)
            .map(pv => ({
                label: pv.label,
                value: pv.value,
                isDefault: pv.defaultValue
            }));
    }
}

function parseCliOptions(argv) {
    const options = {
        org: null,
        debug: false,
        args: []
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--debug') {
            options.debug = true;
            continue;
        }

        if (arg === '--org' || arg === '--target-org' || arg === '--alias' || arg === '-o') {
            options.org = argv[i + 1];
            i += 1;
            continue;
        }

        if (arg.startsWith('--org=') || arg.startsWith('--target-org=') || arg.startsWith('--alias=')) {
            options.org = arg.split('=')[1];
            continue;
        }

        options.args.push(arg);
    }

    return options;
}

// CLI Usage
if (require.main === module) {
    const cli = parseCliOptions(process.argv.slice(2));
    const args = cli.args;
    const command = args[0];
    const parser = new SfCliParser({
        debug: cli.debug,
        org: cli.org || resolveEnvOrg()
    });
    
    try {
        switch(command) {
            case 'record-types':
                const rtObject = args[1] || 'Opportunity';
                const recordTypes = parser.parseRecordTypes(rtObject);
                console.log(JSON.stringify(recordTypes, null, 2));
                break;
                
            case 'fields':
                const fieldObject = args[1] || 'Opportunity';
                const fields = parser.parseFields(fieldObject, {
                    customOnly: args.includes('--custom'),
                    requiredOnly: args.includes('--required'),
                    pattern: args.find(a => a.startsWith('--pattern='))?.split('=')[1]
                });
                console.log(JSON.stringify(fields, null, 2));
                break;
                
            case 'required-fields':
                const reqObject = args[1] || 'Opportunity';
                const required = parser.getRequiredFields(reqObject);
                console.log(JSON.stringify(required, null, 2));
                break;
                
            case 'picklist':
                const plObject = args[1];
                const plField = args[2];
                if (!plObject || !plField) {
                    console.error('Usage: sf-cli-parser picklist <object> <field>');
                    process.exit(1);
                }
                const values = parser.getPicklistValues(plObject, plField);
                console.log(JSON.stringify(values, null, 2));
                break;
                
            case 'query':
                const query = args.slice(1).join(' ');
                if (!query) {
                    console.error('Usage: sf-cli-parser query <SOQL query>');
                    process.exit(1);
                }
                const queryResult = parser.parseQuery(query);
                console.log(JSON.stringify(queryResult, null, 2));
                break;
                
            default:
                console.log(`SF CLI Parser Utility
                
Usage:
  sf-cli-parser record-types [object]        Get record types for object
  sf-cli-parser fields [object] [options]    Get fields for object
    Options:
      --custom                            Custom fields only
      --required                          Required fields only
      --pattern=<regex>                   Filter by pattern
  sf-cli-parser required-fields [object]     Get required fields
  sf-cli-parser picklist <object> <field>    Get picklist values
  sf-cli-parser query <SOQL>                 Execute SOQL query
  
Options:
  --org, --target-org, --alias, -o       Salesforce org alias (or set SF_TARGET_ORG/SFDC_INSTANCE)
  --debug                                 Show debug output
  
Examples:
  node sf-cli-parser.js record-types Opportunity
  node sf-cli-parser.js fields Opportunity --custom --pattern=Renewal
  node sf-cli-parser.js picklist Opportunity Contract_Type__c
  node sf-cli-parser.js query "SELECT Id, Name FROM Account LIMIT 5"`);
        }
    } catch (error) {
        console.error('Error:', error.message);
        if (args.includes('--debug')) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

module.exports = SfCliParser;

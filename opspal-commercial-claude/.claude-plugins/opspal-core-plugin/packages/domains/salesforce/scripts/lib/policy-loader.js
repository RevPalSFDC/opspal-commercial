#!/usr/bin/env node

/**
 * Policy Loader Module
 * ====================
 * Loads and manages policy configurations for deployment gates
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv');

class PolicyLoader {
    constructor(config = {}) {
        this.config = {
            policyDir: config.policyDir || path.join(__dirname, '../../config/policies'),
            cacheEnabled: config.cacheEnabled !== false,
            cacheDuration: config.cacheDuration || 300000, // 5 minutes
            validateSchemas: config.validateSchemas !== false
        };
        
        this.policies = {};
        this.schemas = {};
        this.cache = {};
        this.lastLoad = {};
        this.ajv = new Ajv({ allErrors: true });
    }
    
    /**
     * Initialize the policy loader
     */
    async initialize() {
        console.log('📋 Initializing policy loader...');
        
        // Verify policy directory exists
        try {
            await fs.access(this.config.policyDir);
        } catch (error) {
            console.warn(`⚠️ Policy directory not found: ${this.config.policyDir}`);
            await fs.mkdir(this.config.policyDir, { recursive: true });
            console.log('✅ Created policy directory');
        }
        
        // Load all policies
        await this.loadAllPolicies();
        
        // Load schemas
        await this.loadSchemas();
        
        console.log('✅ Policy loader initialized');
    }
    
    /**
     * Load all policy files
     */
    async loadAllPolicies() {
        const policyFiles = await fs.readdir(this.config.policyDir);
        
        for (const file of policyFiles) {
            if (file.endsWith('.yaml') || file.endsWith('.yml') || file.endsWith('.json')) {
                await this.loadPolicy(file);
            }
        }
        
        console.log(`📚 Loaded ${Object.keys(this.policies).length} policies`);
    }
    
    /**
     * Load a single policy file
     */
    async loadPolicy(filename) {
        const filepath = path.join(this.config.policyDir, filename);
        const policyName = path.basename(filename, path.extname(filename));
        
        try {
            const content = await fs.readFile(filepath, 'utf8');
            let policy;
            
            if (filename.endsWith('.json')) {
                policy = JSON.parse(content);
            } else {
                policy = yaml.load(content);
            }
            
            this.policies[policyName] = policy;
            this.lastLoad[policyName] = Date.now();
            
            // Cache if enabled
            if (this.config.cacheEnabled) {
                this.cache[policyName] = policy;
            }
            
            console.log(`✅ Loaded policy: ${policyName}`);
            return policy;
            
        } catch (error) {
            console.error(`❌ Failed to load policy ${filename}: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Load validation schemas
     */
    async loadSchemas() {
        const schemaFiles = [
            'fallback-justification.schema.json'
        ];
        
        for (const file of schemaFiles) {
            const filepath = path.join(this.config.policyDir, file);
            const schemaName = path.basename(file, '.schema.json');
            
            try {
                const content = await fs.readFile(filepath, 'utf8');
                const schema = JSON.parse(content);
                
                this.schemas[schemaName] = schema;
                this.ajv.addSchema(schema, schemaName);
                
                console.log(`✅ Loaded schema: ${schemaName}`);
            } catch (error) {
                console.warn(`⚠️ Could not load schema ${file}: ${error.message}`);
            }
        }
    }
    
    /**
     * Get a policy by name
     */
    async getPolicy(name, forceReload = false) {
        // Check cache
        if (this.config.cacheEnabled && !forceReload) {
            const cached = this.getCachedPolicy(name);
            if (cached) return cached;
        }
        
        // Reload if forced or not loaded
        if (forceReload || !this.policies[name]) {
            const filename = await this.findPolicyFile(name);
            if (filename) {
                await this.loadPolicy(filename);
            }
        }
        
        return this.policies[name] || null;
    }
    
    /**
     * Get cached policy if still valid
     */
    getCachedPolicy(name) {
        if (!this.cache[name] || !this.lastLoad[name]) {
            return null;
        }
        
        const age = Date.now() - this.lastLoad[name];
        if (age > this.config.cacheDuration) {
            delete this.cache[name];
            return null;
        }
        
        return this.cache[name];
    }
    
    /**
     * Find policy file by name
     */
    async findPolicyFile(name) {
        const extensions = ['.yaml', '.yml', '.json'];
        
        for (const ext of extensions) {
            const filename = name + ext;
            const filepath = path.join(this.config.policyDir, filename);
            
            try {
                await fs.access(filepath);
                return filename;
            } catch (error) {
                // File doesn't exist, try next extension
            }
        }
        
        return null;
    }
    
    /**
     * Validate data against a schema
     */
    validateAgainstSchema(schemaName, data) {
        if (!this.schemas[schemaName]) {
            console.warn(`⚠️ Schema not loaded: ${schemaName}`);
            return { valid: true, errors: [] };
        }
        
        const validate = this.ajv.getSchema(schemaName);
        const valid = validate(data);
        
        return {
            valid,
            errors: validate.errors || []
        };
    }
    
    /**
     * Check if operation is allowed by policy
     */
    async checkOperationAllowed(operation, context) {
        const toolingPolicy = await this.getPolicy('allowed-tooling');
        if (!toolingPolicy) {
            return { allowed: true, reason: 'No tooling policy defined' };
        }
        
        // Check blocked operations
        const blockedOps = toolingPolicy.blocked_operations || {};
        
        // Check absolute blocks
        for (const block of blockedOps.absolute || []) {
            if (new RegExp(block.pattern).test(operation)) {
                return {
                    allowed: false,
                    reason: block.description,
                    severity: block.severity
                };
            }
        }
        
        // Check conditional blocks
        for (const block of blockedOps.conditional || []) {
            if (new RegExp(block.pattern).test(operation)) {
                // Evaluate condition
                const conditionMet = this.evaluateCondition(block.condition, context);
                if (conditionMet) {
                    return {
                        allowed: false,
                        reason: block.description,
                        severity: block.severity,
                        condition: block.condition
                    };
                }
            }
        }
        
        return { allowed: true };
    }
    
    /**
     * Evaluate a condition string
     */
    evaluateCondition(condition, context) {
        // Simple condition evaluation
        if (condition.startsWith('!')) {
            const key = condition.substring(1);
            return !context[key];
        }
        
        if (condition.includes('==')) {
            const [key, value] = condition.split('==').map(s => s.trim());
            return context[key] == value;
        }
        
        if (condition.includes('!=')) {
            const [key, value] = condition.split('!=').map(s => s.trim());
            return context[key] != value;
        }
        
        // Default: check if context property is truthy
        return !!context[condition];
    }
    
    /**
     * Get environment configuration
     */
    async getEnvironmentConfig(orgAlias) {
        const safeguards = await this.getPolicy('org-safeguards');
        if (!safeguards) return null;
        
        // Find matching environment
        for (const [envName, envConfig] of Object.entries(safeguards.environments || {})) {
            const aliases = envConfig.aliases || [];
            
            for (const alias of aliases) {
                if (alias === orgAlias) {
                    return { name: envName, ...envConfig };
                }
                
                // Handle wildcards
                if (alias.includes('*')) {
                    const pattern = new RegExp('^' + alias.replace('*', '.*') + '$');
                    if (pattern.test(orgAlias)) {
                        return { name: envName, ...envConfig };
                    }
                }
            }
        }
        
        // Default to sandbox if no match
        return safeguards.environments.sandbox || null;
    }
    
    /**
     * Get approval requirements for operation
     */
    async getApprovalRequirements(operationType, environment) {
        const approvalPolicy = await this.getPolicy('approvals');
        if (!approvalPolicy) return null;
        
        const config = approvalPolicy.approval_configuration;
        if (!config) return null;
        
        // Map operation and environment to approval type
        let approvalType;
        if (environment === 'production') {
            if (operationType === 'data_operation') {
                approvalType = 'production_data_operation';
            } else {
                approvalType = 'production_deployment';
            }
        } else if (environment === 'uat') {
            approvalType = 'uat_deployment';
        } else if (operationType === 'metadata_deletion') {
            approvalType = 'metadata_deletion';
        } else if (operationType === 'permission_change') {
            approvalType = 'permission_changes';
        }
        
        return config.approval_matrix[approvalType] || null;
    }
    
    /**
     * Get rollback strategy for metadata type
     */
    async getRollbackStrategy(metadataType) {
        const rollbackPolicy = await this.getPolicy('rollback');
        if (!rollbackPolicy) return null;
        
        const strategies = rollbackPolicy.strategies || {};
        
        // Check for specific metadata type strategy
        if (strategies.by_metadata_type && strategies.by_metadata_type[metadataType]) {
            return strategies.by_metadata_type[metadataType];
        }
        
        // Return default strategy
        return strategies.default || null;
    }
    
    /**
     * Check if MCP is required for operation
     */
    async isMcpRequired(operation, context) {
        const toolingPolicy = await this.getPolicy('allowed-tooling');
        if (!toolingPolicy) return false;
        
        const mcpConfig = toolingPolicy.mcp_tools || {};
        
        // Check if MCP is enabled and primary
        if (mcpConfig.primary && mcpConfig.primary.salesforce_dx) {
            const sfConfig = mcpConfig.primary.salesforce_dx;
            
            // Check if operation is in allowed operations
            if (sfConfig.allowed_operations && sfConfig.allowed_operations.includes(operation)) {
                // Check if fallback is allowed
                const fallbackConfig = toolingPolicy.fallback || {};
                
                if (!fallbackConfig.enabled) {
                    return true; // MCP required, no fallback
                }
                
                // Check if justification is required
                if (fallbackConfig.require_justification && !context.fallbackJustification) {
                    return true; // MCP required unless justified
                }
            }
        }
        
        return false;
    }
    
    /**
     * Validate fallback justification
     */
    validateFallbackJustification(justification) {
        return this.validateAgainstSchema('fallback-justification', justification);
    }
    
    /**
     * Get all loaded policies
     */
    getAllPolicies() {
        return { ...this.policies };
    }
    
    /**
     * Reload all policies
     */
    async reloadAll() {
        this.policies = {};
        this.cache = {};
        this.lastLoad = {};
        
        await this.loadAllPolicies();
        await this.loadSchemas();
        
        console.log('🔄 All policies reloaded');
    }
    
    /**
     * Save policy (for dynamic updates)
     */
    async savePolicy(name, policy) {
        const filename = `${name}.yaml`;
        const filepath = path.join(this.config.policyDir, filename);
        
        try {
            const content = yaml.dump(policy);
            await fs.writeFile(filepath, content, 'utf8');
            
            // Reload the policy
            await this.loadPolicy(filename);
            
            console.log(`💾 Saved policy: ${name}`);
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to save policy ${name}: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Get policy metrics
     */
    getMetrics() {
        return {
            totalPolicies: Object.keys(this.policies).length,
            totalSchemas: Object.keys(this.schemas).length,
            cacheSize: Object.keys(this.cache).length,
            policies: Object.keys(this.policies).map(name => ({
                name,
                lastLoaded: this.lastLoad[name] ? new Date(this.lastLoad[name]).toISOString() : null,
                cached: !!this.cache[name]
            }))
        };
    }
}

// Export the class
module.exports = PolicyLoader;

// CLI interface for testing
if (require.main === module) {
    const loader = new PolicyLoader();
    
    (async () => {
        try {
            await loader.initialize();
            
            const command = process.argv[2];
            
            switch (command) {
                case 'list':
                    console.log('\n📋 Loaded Policies:');
                    console.log(Object.keys(loader.getAllPolicies()).join('\n'));
                    break;
                    
                case 'get':
                    const policyName = process.argv[3];
                    const policy = await loader.getPolicy(policyName);
                    console.log(JSON.stringify(policy, null, 2));
                    break;
                    
                case 'check':
                    const operation = process.argv[3];
                    const result = await loader.checkOperationAllowed(operation, {});
                    console.log('Operation allowed:', result.allowed);
                    if (!result.allowed) {
                        console.log('Reason:', result.reason);
                    }
                    break;
                    
                case 'metrics':
                    console.log(JSON.stringify(loader.getMetrics(), null, 2));
                    break;
                    
                default:
                    console.log('Usage: policy-loader.js [list|get <name>|check <operation>|metrics]');
            }
            
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}
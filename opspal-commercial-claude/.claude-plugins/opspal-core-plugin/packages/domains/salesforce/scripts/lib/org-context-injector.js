#!/usr/bin/env node

/**
 * Org Context Auto-Injector
 *
 * Automatically detects Salesforce org context from:
 * 1. Project directory path (instances/{org-alias}/...)
 * 2. Environment variables (SF_TARGET_ORG)
 * 3. Salesforce CLI default org
 *
 * Eliminates hardcoded org aliases in scripts.
 *
 * Usage:
 *   const { getOrgContext } = require('./lib/org-context-injector');
 *   const org = await getOrgContext();
 *   // Use org.alias in SF CLI commands
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ensureSfAuth } = require('./sf-auth-sync');

class OrgContextInjector {
    constructor(options = {}) {
        this.options = {
            requireOrgContext: options.requireOrgContext !== false,
            cwd: options.cwd || process.cwd(),
            verbose: options.verbose || false,
            ...options
        };

        this.detectionMethods = [];
    }

    /**
     * Get org context with automatic detection
     * Returns: { alias, username, orgId, instanceUrl, source }
     */
    async getOrgContext() {
        this.detectionMethods = [];

        // Method 1: Detect from project directory path
        const fromPath = this.detectFromPath();
        if (fromPath) {
            this.detectionMethods.push({ method: 'path', alias: fromPath });
            if (this.options.verbose) {
                console.log(`🔍 Detected org from path: ${fromPath}`);
            }
            return await this.enrichOrgContext(fromPath, 'project-path');
        }

        // Method 2: Check environment variable
        const fromEnv = this.detectFromEnvironment();
        if (fromEnv) {
            this.detectionMethods.push({ method: 'environment', alias: fromEnv });
            if (this.options.verbose) {
                console.log(`🔍 Detected org from environment: ${fromEnv}`);
            }
            return await this.enrichOrgContext(fromEnv, 'environment');
        }

        // Method 3: Get default org from Salesforce CLI
        const fromCli = this.detectFromCli();
        if (fromCli) {
            this.detectionMethods.push({ method: 'cli-default', alias: fromCli });
            if (this.options.verbose) {
                console.log(`🔍 Detected org from CLI default: ${fromCli}`);
            }
            return await this.enrichOrgContext(fromCli, 'cli-default');
        }

        // No org context found
        if (this.options.requireOrgContext) {
            throw new Error(
                'No Salesforce org context detected. Please:\n' +
                '  1. Run from an instance project directory (instances/{org-alias}/...)\n' +
                '  2. Set SF_TARGET_ORG environment variable\n' +
                '  3. Set a default org with: sf config set target-org=<alias>'
            );
        }

        return null;
    }

    /**
     * Detect org from project directory path
     * Pattern: instances/{org-alias}/{project-name}/
     */
    detectFromPath() {
        const cwd = this.options.cwd;

        // Check if we're in an instances/{org-alias}/ directory
        const instancesMatch = cwd.match(/instances[\/\\]([^\/\\]+)/);
        if (instancesMatch) {
            return instancesMatch[1];
        }

        // Check if we're in a directory that has .sf-org-context file
        let currentDir = cwd;
        while (currentDir !== path.dirname(currentDir)) {
            const contextFile = path.join(currentDir, '.sf-org-context');
            if (fs.existsSync(contextFile)) {
                try {
                    const content = fs.readFileSync(contextFile, 'utf8').trim();
                    if (content) {
                        return content;
                    }
                } catch (error) {
                    // Ignore and continue
                }
            }
            currentDir = path.dirname(currentDir);
        }

        return null;
    }

    /**
     * Detect org from environment variables
     */
    detectFromEnvironment() {
        return process.env.SF_TARGET_ORG ||
               process.env.SF_TARGET_ORG ||
               process.env.SALESFORCE_ORG_ALIAS;
    }

    /**
     * Detect org from Salesforce CLI default
     */
    detectFromCli() {
        try {
            const result = execSync('sf config get target-org --json', {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            });
            const config = JSON.parse(result);

            if (config.result && config.result.length > 0) {
                return config.result[0].value;
            }
        } catch (error) {
            // CLI not available or no default org
        }

        return null;
    }

    /**
     * Enrich org alias with full org details
     */
    async enrichOrgContext(alias, source) {
        try {
            await ensureSfAuth({ orgAlias: alias, cwd: this.options.cwd, verbose: this.options.verbose, requireAuth: false });
            const result = execSync(`sf org display --target-org ${alias} --json`, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            });
            const orgInfo = JSON.parse(result);

            if (orgInfo.result) {
                return {
                    alias,
                    username: orgInfo.result.username,
                    orgId: orgInfo.result.id,
                    instanceUrl: orgInfo.result.instanceUrl,
                    apiVersion: orgInfo.result.apiVersion,
                    source,
                    detectionMethods: this.detectionMethods
                };
            }
        } catch (error) {
            // Org might be an alias that doesn't exist
            if (this.options.verbose) {
                console.warn(`⚠️  Could not retrieve details for org: ${alias}`);
            }
        }

        // Return minimal context
        return {
            alias,
            username: null,
            orgId: null,
            instanceUrl: null,
            apiVersion: null,
            source,
            detectionMethods: this.detectionMethods,
            warning: 'Could not retrieve full org details'
        };
    }

    /**
     * Set org context for current project
     * Creates .sf-org-context file in project root
     */
    static setProjectOrgContext(orgAlias, projectDir = process.cwd()) {
        const contextFile = path.join(projectDir, '.sf-org-context');
        fs.writeFileSync(contextFile, orgAlias, 'utf8');
        console.log(`✓ Set org context: ${orgAlias} for project: ${projectDir}`);
    }

    /**
     * Get CLI parameter string for org
     */
    static getOrgParam(orgContext) {
        return orgContext && orgContext.alias ? `--target-org ${orgContext.alias}` : '';
    }

    /**
     * Validate that org is accessible
     */
    static async validateOrg(orgAlias) {
        try {
            execSync(`sf org display --target-org ${orgAlias}`, {
                stdio: 'ignore'
            });
            return true;
        } catch (error) {
            return false;
        }
    }
}

/**
 * Convenience function for quick org context retrieval
 */
async function getOrgContext(options = {}) {
    const injector = new OrgContextInjector(options);
    return await injector.getOrgContext();
}

/**
 * Convenience function to get org param for CLI
 */
function getOrgParam(orgContext) {
    return OrgContextInjector.getOrgParam(orgContext);
}

/**
 * Require org context or throw error
 */
async function requireOrgContext(options = {}) {
    const injector = new OrgContextInjector({ requireOrgContext: true, ...options });
    return await injector.getOrgContext();
}

module.exports = {
    OrgContextInjector,
    getOrgContext,
    getOrgParam,
    requireOrgContext,
    setProjectOrgContext: OrgContextInjector.setProjectOrgContext,
    validateOrg: OrgContextInjector.validateOrg
};

// CLI usage
if (require.main === module) {
    (async () => {
        const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
        const setMode = process.argv.includes('--set');

        if (setMode) {
            const orgAlias = process.argv[process.argv.indexOf('--set') + 1];
            if (!orgAlias) {
                console.error('Usage: org-context-injector.js --set <org-alias>');
                process.exit(1);
            }
            OrgContextInjector.setProjectOrgContext(orgAlias);
            process.exit(0);
        }

        try {
            const context = await getOrgContext({ verbose });

            if (context) {
                console.log(JSON.stringify(context, null, 2));
                process.exit(0);
            } else {
                console.error('No org context detected');
                process.exit(1);
            }
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}

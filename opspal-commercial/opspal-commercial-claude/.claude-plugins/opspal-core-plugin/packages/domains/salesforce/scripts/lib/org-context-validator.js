#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class OrgContextValidator {
    constructor(options = {}) {
        this.requireExplicitTarget = options.requireExplicitTarget !== false;
        this.cachedOrgList = null;
        this.cachedOrgDisplays = new Map();
    }

    /**
     * Validate that the command is targeting the correct Salesforce org
     */
    async validate({ command, cwd = process.cwd(), explicitTargetOrg = null } = {}) {
        const issues = [];
        const warnings = [];

        const targetAlias = explicitTargetOrg || this.extractTargetOrg(command);
        if (!targetAlias) {
            if (this.requireExplicitTarget) {
                issues.push('Target org not specified. Use --target-org <alias> or -o <alias>.');
            }
            return { valid: issues.length === 0, issues, warnings, targetAlias: null };
        }

        const orgList = this.getOrgList();
        if (!orgList.aliases.has(targetAlias)) {
            issues.push(`Target org alias '${targetAlias}' not found in authenticated orgs.`);
        }

        const defaultOrg = this.getDefaultOrg();
        if (defaultOrg && defaultOrg !== targetAlias) {
            warnings.push(`Default org is '${defaultOrg}', but command targets '${targetAlias}'.`);
        }

        const orgDisplay = this.getOrgDisplay(targetAlias);
        if (orgDisplay.error) {
            issues.push(`Unable to display org '${targetAlias}': ${orgDisplay.error}`);
        }

        const instanceCheck = this.checkInstanceContext({ cwd, targetAlias, orgDisplay });
        issues.push(...instanceCheck.issues);
        warnings.push(...instanceCheck.warnings);

        return {
            valid: issues.length === 0,
            issues,
            warnings,
            targetAlias,
            orgId: orgDisplay.id || null,
            username: orgDisplay.username || null,
            instanceUrl: orgDisplay.instanceUrl || null,
            defaultOrg
        };
    }

    extractTargetOrg(command) {
        if (!command) return null;
        const longMatch = command.match(/--target-org\s+([^\s"']+)/);
        if (longMatch) return longMatch[1];
        const longQuoted = command.match(/--target-org\s+["']([^"']+)["']/);
        if (longQuoted) return longQuoted[1];
        const shortMatch = command.match(/\s-o\s+([^\s"']+)/);
        if (shortMatch) return shortMatch[1];
        const shortQuoted = command.match(/\s-o\s+["']([^"']+)["']/);
        if (shortQuoted) return shortQuoted[1];
        return null;
    }

    getOrgList() {
        if (this.cachedOrgList) {
            return this.cachedOrgList;
        }
        try {
            const output = execSync('sf org list --json', { encoding: 'utf8' });
            const parsed = JSON.parse(output);
            const aliases = new Set();
            const orgs = (parsed.result?.nonScratchOrgs || []).concat(parsed.result?.scratchOrgs || []);
            orgs.forEach(org => {
                if (org.alias) {
                    aliases.add(org.alias);
                }
            });
            this.cachedOrgList = { aliases, raw: parsed };
            return this.cachedOrgList;
        } catch (error) {
            return { aliases: new Set(), raw: null };
        }
    }

    getDefaultOrg() {
        try {
            const output = execSync('sf config get target-org --json', { encoding: 'utf8' });
            const parsed = JSON.parse(output);
            const value = parsed.result?.[0]?.value;
            return value || null;
        } catch (error) {
            return null;
        }
    }

    getOrgDisplay(alias) {
        if (!alias) return {};
        if (this.cachedOrgDisplays.has(alias)) {
            return this.cachedOrgDisplays.get(alias);
        }
        try {
            const output = execSync(`sf org display --target-org ${alias} --json`, { encoding: 'utf8' });
            const parsed = JSON.parse(output);
            if (parsed.status !== 0) {
                const info = { error: parsed.message || 'Unknown error' };
                this.cachedOrgDisplays.set(alias, info);
                return info;
            }
            const details = parsed.result || {};
            const info = {
                username: details.username || null,
                instanceUrl: details.instanceUrl || null,
                id: details.id || null,
                alias: details.alias || alias,
            };
            this.cachedOrgDisplays.set(alias, info);
            return info;
        } catch (error) {
            const info = { error: error.message };
            this.cachedOrgDisplays.set(alias, info);
            return info;
        }
    }

    checkInstanceContext({ cwd, targetAlias, orgDisplay }) {
        const issues = [];
        const warnings = [];
        const instanceEnv = this.findInstanceEnv(cwd);
        if (!instanceEnv) {
            return { issues, warnings };
        }

        if (instanceEnv.values.SF_TARGET_ORG && instanceEnv.values.SF_TARGET_ORG !== targetAlias) {
            issues.push(`Instance '${instanceEnv.values.SF_TARGET_ORG}' is active in this directory but command targets '${targetAlias}'.`);
        }

        if (instanceEnv.values.INSTANCE_URL && orgDisplay.instanceUrl && instanceEnv.values.INSTANCE_URL !== orgDisplay.instanceUrl) {
            issues.push(`Instance URL mismatch: expected ${instanceEnv.values.INSTANCE_URL}, got ${orgDisplay.instanceUrl}.`);
        }

        const expectedOrgId = this.getExpectedOrgId(instanceEnv.dir);
        if (expectedOrgId && orgDisplay.id && expectedOrgId !== orgDisplay.id) {
            issues.push(`Org ID mismatch: expected ${expectedOrgId}, got ${orgDisplay.id}.`);
        }

        return { issues, warnings };
    }

    findInstanceEnv(startDir) {
        let current = startDir;
        while (current && current !== path.dirname(current)) {
            const envPath = path.join(current, '.instance-env');
            if (fs.existsSync(envPath)) {
                return { dir: current, values: this.parseKeyValueFile(envPath) };
            }
            current = path.dirname(current);
        }
        return null;
    }

    parseKeyValueFile(filePath) {
        const values = {};
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            content.split(/\r?\n/).forEach(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) return;
                const idx = trimmed.indexOf('=');
                if (idx === -1) return;
                const key = trimmed.substring(0, idx).trim();
                let value = trimmed.substring(idx + 1).trim();
                value = value.replace(/^"|^'|"$|'$/g, '');
                values[key] = value;
            });
        } catch (error) {
            // Ignore parsing errors, return what we have
        }
        return values;
    }

    getExpectedOrgId(instanceDir) {
        const envCandidates = ['.env', '.env.local'];
        for (const candidate of envCandidates) {
            const candidatePath = path.join(instanceDir, candidate);
            if (fs.existsSync(candidatePath)) {
                const values = this.parseKeyValueFile(candidatePath);
                if (values.SALESFORCE_ORG_ID) {
                    return values.SALESFORCE_ORG_ID;
                }
            }
        }
        return null;
    }
}

module.exports = OrgContextValidator;

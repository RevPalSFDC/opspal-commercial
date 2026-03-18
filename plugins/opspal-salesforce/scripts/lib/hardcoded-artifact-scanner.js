#!/usr/bin/env node

/**
 * Hardcoded Artifact Scanner (v3.29.0)
 *
 * Purpose: Detect hardcoded Salesforce IDs and instance URLs in Apex code
 * and Flow formulas to identify migration blockers and environment-specific
 * dependencies.
 *
 * Features:
 * - Scans Apex classes/triggers for 15/18-character Salesforce IDs
 * - Detects hardcoded instance URLs (https://instancename.salesforce.com)
 * - Parses Flow XML for hardcoded IDs in formulas and assignments
 * - Whitelists Named Credentials and test class IDs
 * - Classifies artifact types (RecordType, User, Profile, etc.)
 * - Generates migration blocker report with file/line hints
 *
 * Whitelist Exceptions:
 * - Named Credentials (secure external endpoints)
 * - Test class IDs (@isTest annotation)
 * - Standard Salesforce IDs (System Administrator profile, etc.)
 * - Known patterns (UserInfo.getUserId(), UserInfo.getProfileId())
 *
 * Usage:
 *   const scanner = new HardcodedArtifactScanner();
 *   const apexArtifacts = scanner.scanApexCode(className, classBody);
 *   const flowArtifacts = scanner.scanFlowMetadata(flowName, flowXml);
 *
 * @version 1.0.0
 * @date 2025-10-22
 */

class HardcodedArtifactScanner {
    constructor() {
        // Salesforce ID patterns (15 or 18 characters)
        this.ID_PATTERN = /\b([a-zA-Z0-9]{15}|[a-zA-Z0-9]{18})\b/g;

        // Instance URL patterns
        this.URL_PATTERN = /https?:\/\/[a-z0-9\-]+\.(salesforce|force|visual\.force|lightning\.force|my\.salesforce)\.com[^\s]*/gi;

        // Whitelist patterns (safe to ignore)
        this.WHITELIST_PATTERNS = [
            /callout:Named_Credential/i,
            /UserInfo\.getUserId\(\)/i,
            /UserInfo\.getProfileId\(\)/i,
            /UserInfo\.getOrganizationId\(\)/i,
            /System\.runAs\([^)]+\)/i,
            /@isTest/i
        ];

        // Standard Salesforce IDs (profiles, standard objects, etc.)
        this.STANDARD_IDS = new Set([
            '00e000000000000',  // System Administrator Profile (15-char prefix)
            '00G',              // Profile prefix
            '005',              // User prefix (can't hardcode users anyway)
            '00D'               // Organization prefix
        ]);

        // Salesforce ID prefixes for artifact classification
        this.ID_PREFIXES = {
            '001': 'Account',
            '003': 'Contact',
            '006': 'Opportunity',
            '012': 'RecordType',
            '00G': 'Profile',
            '00E': 'PermissionSet',
            '005': 'User',
            '00D': 'Organization',
            '01I': 'Flow',
            '015': 'Queue',
            '00Q': 'Lead',
            '500': 'Case',
            '701': 'Campaign',
            '00e': 'Custom Setting',
            '01t': 'Apex Class',
            '01p': 'Apex Trigger'
        };
    }

    /**
     * Scan Apex code for hardcoded artifacts
     * @param {string} className - Apex class/trigger name
     * @param {string} classBody - Source code
     * @returns {Object} Artifacts found
     */
    scanApexCode(className, classBody) {
        if (!classBody) {
            return {
                className,
                hasArtifacts: false,
                ids: [],
                urls: [],
                riskLevel: 'NONE'
            };
        }

        const artifacts = {
            className,
            hasArtifacts: false,
            ids: [],
            urls: [],
            riskLevel: 'NONE'
        };

        // Check if this is a test class (whitelist all IDs)
        const isTestClass = /@isTest/i.test(classBody);

        // Scan for hardcoded IDs
        if (!isTestClass) {
            artifacts.ids = this.extractHardcodedIds(classBody, className);
        }

        // Scan for hardcoded URLs
        artifacts.urls = this.extractHardcodedUrls(classBody, className);

        // Determine risk level
        artifacts.hasArtifacts = artifacts.ids.length > 0 || artifacts.urls.length > 0;

        if (artifacts.ids.length > 0 || artifacts.urls.length > 0) {
            artifacts.riskLevel = this.calculateRiskLevel(artifacts.ids, artifacts.urls);
        }

        return artifacts;
    }

    /**
     * Extract hardcoded IDs from code
     * @param {string} code - Source code
     * @param {string} fileName - File name for context
     * @returns {Array} Hardcoded ID objects
     */
    extractHardcodedIds(code, fileName) {
        const hardcodedIds = [];
        const lines = code.split('\n');

        lines.forEach((line, lineNum) => {
            // Skip whitelisted patterns
            if (this.isWhitelisted(line)) {
                return;
            }

            const matches = line.matchAll(this.ID_PATTERN);

            for (const match of matches) {
                const id = match[1];
                const prefix = id.substring(0, 3);

                // Skip standard IDs
                if (this.isStandardId(prefix)) {
                    continue;
                }

                // Classify artifact type
                const artifactType = this.ID_PREFIXES[prefix] || 'Unknown';

                hardcodedIds.push({
                    id,
                    type: artifactType,
                    line: lineNum + 1,
                    context: line.trim(),
                    file: fileName,
                    severity: this.getIdSeverity(artifactType)
                });
            }
        });

        return hardcodedIds;
    }

    /**
     * Extract hardcoded URLs from code
     * @param {string} code - Source code
     * @param {string} fileName - File name for context
     * @returns {Array} Hardcoded URL objects
     */
    extractHardcodedUrls(code, fileName) {
        const hardcodedUrls = [];
        const lines = code.split('\n');

        lines.forEach((line, lineNum) => {
            // Skip whitelisted patterns (Named Credentials)
            if (this.isWhitelisted(line)) {
                return;
            }

            const matches = line.matchAll(this.URL_PATTERN);

            for (const match of matches) {
                const url = match[0];

                hardcodedUrls.push({
                    url,
                    type: 'Instance URL',
                    line: lineNum + 1,
                    context: line.trim(),
                    file: fileName,
                    severity: 'HIGH'
                });
            }
        });

        return hardcodedUrls;
    }

    /**
     * Scan Flow metadata for hardcoded artifacts
     * @param {string} flowName - Flow name
     * @param {Object|string} flowMetadata - Flow XML metadata
     * @returns {Object} Artifacts found
     */
    scanFlowMetadata(flowName, flowMetadata) {
        const artifacts = {
            flowName,
            hasArtifacts: false,
            ids: [],
            urls: [],
            riskLevel: 'NONE'
        };

        if (!flowMetadata) {
            return artifacts;
        }

        // Convert to string if object
        const metadataStr = typeof flowMetadata === 'string' ?
            flowMetadata : JSON.stringify(flowMetadata);

        // Scan assignments and formulas
        artifacts.ids = this.extractFlowIds(metadataStr, flowName);
        artifacts.urls = this.extractFlowUrls(metadataStr, flowName);

        artifacts.hasArtifacts = artifacts.ids.length > 0 || artifacts.urls.length > 0;

        if (artifacts.hasArtifacts) {
            artifacts.riskLevel = this.calculateRiskLevel(artifacts.ids, artifacts.urls);
        }

        return artifacts;
    }

    /**
     * Extract hardcoded IDs from Flow metadata
     * @param {string} metadataStr - Flow XML as string
     * @param {string} flowName - Flow name
     * @returns {Array} Hardcoded ID objects
     */
    extractFlowIds(metadataStr, flowName) {
        const hardcodedIds = [];
        const matches = metadataStr.matchAll(this.ID_PATTERN);

        for (const match of matches) {
            const id = match[1];
            const prefix = id.substring(0, 3);

            // Skip standard IDs
            if (this.isStandardId(prefix)) {
                continue;
            }

            const artifactType = this.ID_PREFIXES[prefix] || 'Unknown';

            hardcodedIds.push({
                id,
                type: artifactType,
                element: 'Flow Assignment/Formula',
                file: flowName,
                severity: this.getIdSeverity(artifactType)
            });
        }

        return hardcodedIds;
    }

    /**
     * Extract hardcoded URLs from Flow metadata
     * @param {string} metadataStr - Flow XML as string
     * @param {string} flowName - Flow name
     * @returns {Array} Hardcoded URL objects
     */
    extractFlowUrls(metadataStr, flowName) {
        const hardcodedUrls = [];
        const matches = metadataStr.matchAll(this.URL_PATTERN);

        for (const match of matches) {
            const url = match[0];

            hardcodedUrls.push({
                url,
                type: 'Instance URL',
                element: 'Flow Assignment/Formula',
                file: flowName,
                severity: 'HIGH'
            });
        }

        return hardcodedUrls;
    }

    /**
     * Check if line contains whitelisted pattern
     * @param {string} line - Code line
     * @returns {boolean} True if whitelisted
     */
    isWhitelisted(line) {
        return this.WHITELIST_PATTERNS.some(pattern => pattern.test(line));
    }

    /**
     * Check if ID prefix is standard/system
     * @param {string} prefix - 3-character prefix
     * @returns {boolean} True if standard
     */
    isStandardId(prefix) {
        return this.STANDARD_IDS.has(prefix);
    }

    /**
     * Get severity for ID type
     * @param {string} artifactType - Type of artifact
     * @returns {string} Severity level
     */
    getIdSeverity(artifactType) {
        const highRiskTypes = ['RecordType', 'Profile', 'PermissionSet', 'Queue'];

        if (highRiskTypes.includes(artifactType)) {
            return 'HIGH';
        }

        if (artifactType === 'User' || artifactType === 'Organization') {
            return 'CRITICAL';
        }

        return 'MEDIUM';
    }

    /**
     * Calculate overall risk level
     * @param {Array} ids - Hardcoded IDs
     * @param {Array} urls - Hardcoded URLs
     * @returns {string} Risk level
     */
    calculateRiskLevel(ids, urls) {
        const criticalIds = ids.filter(id => id.severity === 'CRITICAL');
        const highRiskIds = ids.filter(id => id.severity === 'HIGH');

        if (criticalIds.length > 0 || urls.length > 0) {
            return 'CRITICAL';
        }

        if (highRiskIds.length > 0) {
            return 'HIGH';
        }

        if (ids.length > 0) {
            return 'MEDIUM';
        }

        return 'LOW';
    }

    /**
     * Generate artifact summary
     * @param {Array} apexArtifacts - Apex scan results
     * @param {Array} flowArtifacts - Flow scan results
     * @returns {Object} Summary statistics
     */
    generateSummary(apexArtifacts, flowArtifacts) {
        const allArtifacts = [...apexArtifacts, ...flowArtifacts];

        const summary = {
            totalScanned: allArtifacts.length,
            withArtifacts: allArtifacts.filter(a => a.hasArtifacts).length,
            totalIds: 0,
            totalUrls: 0,
            riskBreakdown: {
                CRITICAL: 0,
                HIGH: 0,
                MEDIUM: 0,
                LOW: 0
            },
            artifactTypes: {}
        };

        allArtifacts.forEach(artifact => {
            if (artifact.hasArtifacts) {
                summary.totalIds += artifact.ids.length;
                summary.totalUrls += artifact.urls.length;
                summary.riskBreakdown[artifact.riskLevel]++;

                // Count artifact types
                artifact.ids.forEach(id => {
                    summary.artifactTypes[id.type] = (summary.artifactTypes[id.type] || 0) + 1;
                });
            }
        });

        return summary;
    }

    /**
     * Format artifacts for report
     * @param {Array} artifacts - All artifacts
     * @returns {string} Formatted report
     */
    formatReport(artifacts) {
        let report = '# Hardcoded Artifacts Report\n\n';
        report += '## ⚠️  Migration Blockers Detected\n\n';

        const withArtifacts = artifacts.filter(a => a.hasArtifacts);

        if (withArtifacts.length === 0) {
            report += '✅ No hardcoded artifacts detected.\n';
            return report;
        }

        // Group by severity
        const critical = withArtifacts.filter(a => a.riskLevel === 'CRITICAL');
        const high = withArtifacts.filter(a => a.riskLevel === 'HIGH');
        const medium = withArtifacts.filter(a => a.riskLevel === 'MEDIUM');

        if (critical.length > 0) {
            report += '### 🔴 CRITICAL Risk\n\n';
            critical.forEach(artifact => {
                report += this.formatArtifact(artifact);
            });
        }

        if (high.length > 0) {
            report += '### 🟠 HIGH Risk\n\n';
            high.forEach(artifact => {
                report += this.formatArtifact(artifact);
            });
        }

        if (medium.length > 0) {
            report += '### 🟡 MEDIUM Risk\n\n';
            medium.forEach(artifact => {
                report += this.formatArtifact(artifact);
            });
        }

        return report;
    }

    /**
     * Format single artifact for display
     * @param {Object} artifact - Artifact object
     * @returns {string} Formatted text
     */
    formatArtifact(artifact) {
        let output = `**${artifact.className || artifact.flowName}**\n\n`;

        if (artifact.ids.length > 0) {
            output += 'Hardcoded IDs:\n';
            artifact.ids.forEach(id => {
                output += `  - ${id.type}: \`${id.id}\``;
                if (id.line) output += ` (Line ${id.line})`;
                output += '\n';
            });
            output += '\n';
        }

        if (artifact.urls.length > 0) {
            output += 'Hardcoded URLs:\n';
            artifact.urls.forEach(url => {
                output += `  - \`${url.url}\``;
                if (url.line) output += ` (Line ${url.line})`;
                output += '\n';
            });
            output += '\n';
        }

        return output;
    }
}

module.exports = HardcodedArtifactScanner;

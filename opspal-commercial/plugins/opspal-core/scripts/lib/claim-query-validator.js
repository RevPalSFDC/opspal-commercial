#!/usr/bin/env node
/**
 * Claim-to-Query Validator
 *
 * Analyzes agent responses to detect org-state claims and validates
 * that corresponding live queries were executed.
 *
 * Usage:
 *   node claim-query-validator.js validate <response-text> [--platform <platform>]
 *   node claim-query-validator.js validate-file <file-path> [--platform <platform>]
 *   node claim-query-validator.js extract-claims <response-text>
 *
 * Environment:
 *   REQUIRE_ORG_VERIFICATION    - 1=strict, 0=warning (default: 1)
 *   ORG_CLAIM_SENSITIVITY       - low|medium|high (default: medium)
 *   QUERY_EVIDENCE_TTL_SECONDS  - Evidence validity window (default: 300)
 *
 * @version 1.0.0
 * @date 2026-01-09
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const SCRIPT_DIR = path.dirname(__filename);
const CONFIG_PATH = path.join(SCRIPT_DIR, '../../config/org-state-patterns.json');
const EVIDENCE_TRACKER = path.join(SCRIPT_DIR, 'query-evidence-tracker.js');

const STRICT_MODE = process.env.REQUIRE_ORG_VERIFICATION !== '0';
const SENSITIVITY = process.env.ORG_CLAIM_SENSITIVITY || 'medium';

/**
 * Load patterns configuration
 */
function loadPatterns() {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
        console.error(`Failed to load patterns: ${e.message}`);
        process.exit(1);
    }
}

/**
 * Extract claims from response text
 */
function extractClaims(text, platform = null) {
    const config = loadPatterns();
    const claims = [];
    const platforms = platform ? [platform] : Object.keys(config.platforms);

    // Normalize text
    const normalizedText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');

    // Check global exemptions first
    const isExempt = config.globalExemptPatterns.some(pattern => {
        try {
            return new RegExp(pattern, 'i').test(normalizedText);
        } catch (e) {
            return false;
        }
    });

    // Get sensitivity settings
    const sensitivityConfig = config.sensitivity[SENSITIVITY] || config.sensitivity.medium;

    platforms.forEach(plat => {
        const platformConfig = config.platforms[plat];
        if (!platformConfig) return;

        // Check platform-specific exemptions
        const isPlatformExempt = platformConfig.exemptPatterns?.some(pattern => {
            try {
                return new RegExp(pattern, 'i').test(normalizedText);
            } catch (e) {
                return false;
            }
        });

        // Extract object-based claims
        platformConfig.objectPatterns?.forEach(patternConfig => {
            try {
                const regex = new RegExp(patternConfig.pattern, 'gi');
                let match;

                while ((match = regex.exec(normalizedText)) !== null) {
                    // Skip if text around claim indicates exemption
                    const context = normalizedText.slice(
                        Math.max(0, match.index - 50),
                        Math.min(normalizedText.length, match.index + match[0].length + 50)
                    );

                    const contextExempt = config.globalExemptPatterns.some(exemptPattern => {
                        try {
                            return new RegExp(exemptPattern, 'i').test(context);
                        } catch (e) {
                            return false;
                        }
                    });

                    if (!contextExempt) {
                        claims.push({
                            platform: plat,
                            type: patternConfig.claimType,
                            match: match[0],
                            captures: match.slice(1),
                            requiredQuery: patternConfig.requiredQuery,
                            description: patternConfig.description,
                            position: match.index,
                            context: context.trim()
                        });
                    }
                }
            } catch (e) {
                // Skip invalid patterns
            }
        });

        // Extract value-based claims
        platformConfig.valuePatterns?.forEach(patternConfig => {
            try {
                const regex = new RegExp(patternConfig.pattern, 'gi');
                let match;

                while ((match = regex.exec(normalizedText)) !== null) {
                    const context = normalizedText.slice(
                        Math.max(0, match.index - 50),
                        Math.min(normalizedText.length, match.index + match[0].length + 50)
                    );

                    const contextExempt = config.globalExemptPatterns.some(exemptPattern => {
                        try {
                            return new RegExp(exemptPattern, 'i').test(context);
                        } catch (e) {
                            return false;
                        }
                    });

                    if (!contextExempt && patternConfig.requiresEvidence) {
                        claims.push({
                            platform: plat,
                            type: patternConfig.claimType,
                            match: match[0],
                            captures: match.slice(1),
                            requiresEvidence: true,
                            description: patternConfig.description,
                            position: match.index,
                            context: context.trim()
                        });
                    }
                }
            } catch (e) {
                // Skip invalid patterns
            }
        });
    });

    // Apply sensitivity filter
    if (sensitivityConfig.minPatternMatches > 1) {
        // Group claims by object/type and filter
        const claimGroups = {};
        claims.forEach(claim => {
            const key = `${claim.platform}:${claim.type}`;
            if (!claimGroups[key]) {
                claimGroups[key] = [];
            }
            claimGroups[key].push(claim);
        });

        const filteredClaims = [];
        Object.values(claimGroups).forEach(group => {
            if (group.length >= sensitivityConfig.minPatternMatches) {
                filteredClaims.push(...group);
            }
        });

        return filteredClaims;
    }

    return claims;
}

/**
 * Check evidence for a claim
 */
function checkClaimEvidence(claim) {
    try {
        // Extract object from claim or captures
        let target = null;

        if (claim.captures && claim.captures.length > 0) {
            // Try to find object name in captures
            for (const capture of claim.captures) {
                if (capture && /^[A-Za-z_][A-Za-z0-9_]*$/.test(capture)) {
                    target = capture;
                    break;
                }
            }
        }

        // Extract from requiredQuery if object-specific
        if (!target && claim.requiredQuery) {
            const queryParts = claim.requiredQuery.split(':');
            if (queryParts.length > 1) {
                target = queryParts[1];
            }
        }

        // Default to generic check
        if (!target) {
            target = claim.type;
        }

        // Check evidence tracker
        const result = execSync(
            `node "${EVIDENCE_TRACKER}" check ${claim.platform} "${target}"`,
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
        );

        const evidence = JSON.parse(result);
        return {
            ...claim,
            hasEvidence: evidence.hasEvidence,
            evidenceDetails: evidence
        };
    } catch (e) {
        // No evidence found (non-zero exit or error)
        return {
            ...claim,
            hasEvidence: false,
            evidenceDetails: { reason: 'No matching evidence found' }
        };
    }
}

/**
 * Validate response text for unsupported claims
 */
function validateResponse(text, platform = null) {
    const claims = extractClaims(text, platform);

    if (claims.length === 0) {
        return {
            valid: true,
            claimsFound: 0,
            claims: [],
            message: 'No org-state claims detected'
        };
    }

    // Check evidence for each claim
    const validatedClaims = claims.map(claim => checkClaimEvidence(claim));

    // Separate supported and unsupported claims
    const supportedClaims = validatedClaims.filter(c => c.hasEvidence);
    const unsupportedClaims = validatedClaims.filter(c => !c.hasEvidence);

    const isValid = unsupportedClaims.length === 0;

    const result = {
        valid: isValid,
        strictMode: STRICT_MODE,
        claimsFound: claims.length,
        supportedClaims: supportedClaims.length,
        unsupportedClaims: unsupportedClaims.length,
        claims: validatedClaims,
        unsupported: unsupportedClaims.map(c => ({
            type: c.type,
            platform: c.platform,
            claim: c.match,
            context: c.context,
            suggestion: getSuggestion(c)
        }))
    };

    if (!isValid) {
        result.message = STRICT_MODE
            ? `BLOCKED: ${unsupportedClaims.length} org-state claim(s) without query evidence`
            : `WARNING: ${unsupportedClaims.length} org-state claim(s) may not be verified`;

        result.requiredActions = unsupportedClaims.map(c => getSuggestion(c));
    } else {
        result.message = 'All org-state claims have query evidence';
    }

    return result;
}

/**
 * Get suggestion for unverified claim
 */
function getSuggestion(claim) {
    const suggestions = {
        salesforce: {
            'field_count': `Run: sf sobject describe <Object> --target-org <org>`,
            'flow_count': `Run: sf data query --query "SELECT ApiName FROM FlowDefinitionView WHERE IsActive=true AND ProcessType='Flow'" --use-tooling-api`,
            'validation_rule': `Run: sf data query --query "SELECT EntityDefinition.DeveloperName FROM ValidationRule WHERE Active=true" --use-tooling-api`,
            'metadata_config': `Run: sf sobject describe <Object> --target-org <org>`,
            'field_property': `Run: sf sobject describe <Object> --target-org <org>`,
            'permission': `Run: sf data query --query "SELECT Name FROM PermissionSet WHERE Name='<Name>'" --use-tooling-api`,
            'cpq_config': `Query SBQQ objects using sf data query`,
            'trigger': `Run: sf data query --query "SELECT Name FROM ApexTrigger WHERE TableEnumOrId='<Object>'" --use-tooling-api`,
            'current_value': `Query the org directly to verify current values`,
            'org_state': `Query the org directly to verify org state`
        },
        hubspot: {
            'property_count': `Use HubSpot Properties API: GET /crm/v3/properties/<object>`,
            'workflow_count': `Use HubSpot Automation API: GET /automation/v4/flows`,
            'property_config': `Use HubSpot Properties API to verify property settings`,
            'asset_config': `Use HubSpot CMS API to verify asset configuration`,
            'pipeline_config': `Use HubSpot Pipelines API: GET /crm/v3/pipelines/<object>`,
            'portal_state': `Query HubSpot portal directly to verify state`
        },
        marketo: {
            'field_count': `Use Marketo Describe API for Lead/Person object`,
            'program_count': `Use Marketo Programs API: GET /rest/asset/v1/programs.json`,
            'program_config': `Use Marketo Program API to verify configuration`,
            'scoring_config': `Use Marketo Activity API to verify scoring`,
            'instance_state': `Query Marketo instance directly to verify state`
        }
    };

    const platformSuggestions = suggestions[claim.platform] || {};
    return platformSuggestions[claim.type] || `Query the ${claim.platform} instance to verify this claim`;
}

/**
 * Format output for hook consumption
 */
function formatHookOutput(result) {
    if (result.valid) {
        return {
            decision: 'continue',
            message: result.message
        };
    }

    if (STRICT_MODE) {
        return {
            decision: 'block',
            message: result.message,
            reason: 'Org-state claims require query evidence',
            unsupportedClaims: result.unsupported,
            requiredActions: result.requiredActions,
            instruction: `
Before providing information about org configuration, you MUST:
1. Execute live queries against the target org
2. Include query results in your response

Unsupported claims detected:
${result.unsupported.map(c => `  - "${c.claim}" (${c.type})`).join('\n')}

Required queries:
${result.requiredActions.map(a => `  - ${a}`).join('\n')}

Please execute these queries and try again.
`
        };
    } else {
        return {
            decision: 'warn',
            message: result.message,
            warning: `
The following claims may not be verified against the live org:
${result.unsupported.map(c => `  - "${c.claim}"`).join('\n')}

Consider querying the org directly to confirm accuracy.
`
        };
    }
}

/**
 * Main CLI handler
 */
function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    // Handle --platform flag
    let platform = null;
    const platformIndex = args.indexOf('--platform');
    if (platformIndex !== -1 && args[platformIndex + 1]) {
        platform = args[platformIndex + 1];
    }

    // Handle --json flag
    const jsonOutput = args.includes('--json');

    switch (command) {
        case 'validate':
            if (args.length < 2) {
                console.error('Usage: validate <response-text> [--platform <platform>]');
                process.exit(1);
            }
            // Join all args that aren't flags as the text
            const textArgs = args.slice(1).filter((arg, i, arr) => {
                return !arg.startsWith('--') && arr[i-1] !== '--platform';
            });
            const text = textArgs.join(' ');
            const result = validateResponse(text, platform);
            const output = formatHookOutput(result);

            if (jsonOutput) {
                console.log(JSON.stringify({ ...result, hookOutput: output }, null, 2));
            } else {
                console.log(JSON.stringify(output, null, 2));
            }

            process.exit(result.valid || !STRICT_MODE ? 0 : 1);
            break;

        case 'validate-file':
            if (args.length < 2) {
                console.error('Usage: validate-file <file-path> [--platform <platform>]');
                process.exit(1);
            }
            const filePath = args[1];
            if (!fs.existsSync(filePath)) {
                console.error(`File not found: ${filePath}`);
                process.exit(1);
            }
            const fileText = fs.readFileSync(filePath, 'utf8');
            const fileResult = validateResponse(fileText, platform);
            const fileOutput = formatHookOutput(fileResult);

            if (jsonOutput) {
                console.log(JSON.stringify({ ...fileResult, hookOutput: fileOutput }, null, 2));
            } else {
                console.log(JSON.stringify(fileOutput, null, 2));
            }

            process.exit(fileResult.valid || !STRICT_MODE ? 0 : 1);
            break;

        case 'extract-claims':
            if (args.length < 2) {
                console.error('Usage: extract-claims <response-text> [--platform <platform>]');
                process.exit(1);
            }
            const extractArgs = args.slice(1).filter((arg, i, arr) => {
                return !arg.startsWith('--') && arr[i-1] !== '--platform';
            });
            const extractText = extractArgs.join(' ');
            const claims = extractClaims(extractText, platform);
            console.log(JSON.stringify({
                claimsFound: claims.length,
                claims: claims
            }, null, 2));
            break;

        case 'test-pattern':
            if (args.length < 3) {
                console.error('Usage: test-pattern <platform> <pattern-index> <test-text>');
                process.exit(1);
            }
            const testPlatform = args[1];
            const patternIndex = parseInt(args[2], 10);
            const testText = args.slice(3).join(' ');

            const config = loadPatterns();
            const patterns = config.platforms[testPlatform]?.objectPatterns || [];

            if (patternIndex >= patterns.length) {
                console.error(`Pattern index ${patternIndex} out of range (0-${patterns.length - 1})`);
                process.exit(1);
            }

            const testPattern = patterns[patternIndex];
            const testRegex = new RegExp(testPattern.pattern, 'gi');
            const testMatch = testRegex.exec(testText);

            console.log(JSON.stringify({
                pattern: testPattern.pattern,
                description: testPattern.description,
                testText: testText,
                matched: !!testMatch,
                match: testMatch ? testMatch[0] : null,
                captures: testMatch ? testMatch.slice(1) : null
            }, null, 2));
            break;

        default:
            console.error(`
Claim-to-Query Validator - Verify org-state claims have query evidence

Commands:
  validate <text>           Validate response text for unsupported claims
  validate-file <path>      Validate response from file
  extract-claims <text>     Extract claims without validation
  test-pattern <p> <i> <t>  Test a specific pattern

Options:
  --platform <name>   Filter to specific platform (salesforce|hubspot|marketo)
  --json              Include full validation result in output

Environment:
  REQUIRE_ORG_VERIFICATION    1=strict (block), 0=warn (current: ${STRICT_MODE ? 'strict' : 'warn'})
  ORG_CLAIM_SENSITIVITY       Pattern sensitivity (current: ${SENSITIVITY})

Examples:
  # Validate a response
  node claim-query-validator.js validate "Account has 150 fields and 3 active flows"

  # Validate with platform filter
  node claim-query-validator.js validate "The portal has 5 workflows" --platform hubspot

  # Extract claims only
  node claim-query-validator.js extract-claims "There are 10 validation rules on Lead"
`);
            process.exit(1);
    }
}

// Export for use as module
module.exports = {
    extractClaims,
    validateResponse,
    checkClaimEvidence,
    formatHookOutput
};

// Run CLI if executed directly
if (require.main === module) {
    main();
}

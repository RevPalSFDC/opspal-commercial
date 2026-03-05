#!/usr/bin/env node

/**
 * Layout Persona Detector for Salesforce
 *
 * Automatically detects the most appropriate persona template for a user
 * based on their Profile, Role, PermissionSets, and UserType.
 *
 * Detection Algorithm:
 * 1. Profile Name Analysis (40% weight): Keyword matching against persona patterns
 * 2. Role Hierarchy Position (30% weight): Manager, Director, VP, C-level vs IC
 * 3. Permission Sets (20% weight): Admin, Analytics, Service Cloud, Sales Cloud
 * 4. User Type (10% weight): Standard, Guest, Portal, etc.
 *
 * Confidence Scoring: 0.0-1.0
 *   0.9-1.0: Very High (strong match, use with confidence)
 *   0.75-0.89: High (good match, safe to use)
 *   0.6-0.74: Medium (reasonable match, verify with user)
 *   0.4-0.59: Low (weak match, ask user)
 *   0.0-0.39: Very Low (no clear match, require user selection)
 *
 * Usage:
 *   const detector = new LayoutPersonaDetector(orgAlias);
 *   const result = await detector.detectPersona(userId);
 *   console.log(`Detected: ${result.persona} (confidence: ${result.confidence})`);
 *
 * @version 1.0.0
 * @created 2025-10-18
 */

const { execSync } = require('child_process');

class LayoutPersonaDetector {
    /**
     * Initialize Persona Detector
     * @param {string} orgAlias - Salesforce org alias
     * @param {Object} options - Configuration options
     */
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;

        // Persona detection patterns
        this.patterns = {
            'sales-rep': {
                profile: [
                    /sales.*user/i,
                    /account.*executive/i,
                    /sales.*rep/i,
                    /\bae\b/i,
                    /\bbdr\b/i,
                    /\bsdr\b/i,
                    /inside.*sales/i
                ],
                role: [
                    /sales.*rep/i,
                    /account.*exec/i,
                    /business.*development/i
                ],
                permissionSets: [
                    /sales.*cloud.*user/i,
                    /opportunity.*access/i
                ],
                indicators: {
                    hasManagerRole: false,
                    typicalTitles: ['Sales Rep', 'Account Executive', 'BDR', 'SDR', 'Inside Sales']
                }
            },
            'sales-manager': {
                profile: [
                    /sales.*manager/i,
                    /sales.*director/i,
                    /sales.*lead/i,
                    /regional.*manager/i
                ],
                role: [
                    /manager/i,
                    /director/i,
                    /sales.*lead/i,
                    /regional/i
                ],
                permissionSets: [
                    /sales.*cloud.*manager/i,
                    /forecast.*manager/i,
                    /team.*dashboard/i
                ],
                indicators: {
                    hasManagerRole: true,
                    typicalTitles: ['Sales Manager', 'Sales Director', 'Team Lead', 'Regional Manager']
                }
            },
            'executive': {
                profile: [
                    /executive/i,
                    /\bceo\b/i,
                    /\bcfo\b/i,
                    /\bcro\b/i,
                    /\bcoo\b/i,
                    /\bvp\b/i,
                    /vice.*president/i,
                    /c-level/i
                ],
                role: [
                    /\bceo\b/i,
                    /\bcfo\b/i,
                    /\bvp\b/i,
                    /vice.*president/i,
                    /chief/i,
                    /executive/i
                ],
                permissionSets: [
                    /executive.*dashboard/i,
                    /view.*all/i,
                    /modify.*all/i
                ],
                indicators: {
                    hasManagerRole: true,
                    typicalTitles: ['CEO', 'CFO', 'CRO', 'VP Sales', 'VP Marketing', 'Chief']
                }
            },
            'support-agent': {
                profile: [
                    /support/i,
                    /service/i,
                    /\bcsr\b/i,
                    /customer.*service/i,
                    /case.*agent/i
                ],
                role: [
                    /support.*agent/i,
                    /service.*rep/i,
                    /customer.*service/i
                ],
                permissionSets: [
                    /service.*cloud.*user/i,
                    /case.*management/i,
                    /knowledge.*user/i
                ],
                indicators: {
                    hasManagerRole: false,
                    typicalTitles: ['Support Agent', 'CSR', 'Service Rep', 'Customer Service']
                }
            },
            'support-manager': {
                profile: [
                    /support.*manager/i,
                    /service.*manager/i,
                    /customer.*success.*manager/i,
                    /support.*lead/i
                ],
                role: [
                    /support.*manager/i,
                    /service.*manager/i,
                    /customer.*success/i,
                    /support.*director/i
                ],
                permissionSets: [
                    /service.*cloud.*manager/i,
                    /case.*supervisor/i,
                    /team.*metrics/i
                ],
                indicators: {
                    hasManagerRole: true,
                    typicalTitles: ['Support Manager', 'Service Manager', 'CSM', 'Support Director']
                }
            }
        };
    }

    /**
     * Detect persona for a user
     * @param {string} userId - Salesforce User ID (optional, defaults to current user)
     * @returns {Promise<Object>} Detection result with persona and confidence
     */
    async detectPersona(userId = null) {
        if (this.verbose) {
            console.log(`\n🔍 Detecting persona${userId ? ` for user ${userId}` : ' for current user'}...\n`);
        }

        // Get user information
        const userInfo = await this.getUserInfo(userId);

        // Score each persona
        const personaScores = {};

        for (const [personaName, patterns] of Object.entries(this.patterns)) {
            const score = this.calculatePersonaScore(userInfo, patterns);
            personaScores[personaName] = score;
        }

        // Find best match
        const sortedPersonas = Object.entries(personaScores)
            .sort(([, scoreA], [, scoreB]) => scoreB.total - scoreA.total);

        const [bestPersona, bestScore] = sortedPersonas[0];
        const [secondBestPersona, secondBestScore] = sortedPersonas[1] || [null, null];

        const confidence = this.calculateConfidence(bestScore.total, secondBestScore?.total);

        const result = {
            persona: bestPersona,
            confidence: confidence,
            confidenceLevel: this.getConfidenceLevel(confidence),
            score: bestScore.total,
            breakdown: bestScore.breakdown,
            alternativePersonas: sortedPersonas.slice(1, 3).map(([name, score]) => ({
                persona: name,
                score: score.total
            })),
            userInfo: {
                username: userInfo.username,
                profile: userInfo.profileName,
                role: userInfo.roleName,
                permissionSets: userInfo.permissionSets.slice(0, 5) // Top 5
            }
        };

        if (this.verbose) {
            console.log(`✓ Detected persona: ${result.persona}`);
            console.log(`   Confidence: ${(confidence * 100).toFixed(1)}% (${result.confidenceLevel})`);
            console.log(`   Score: ${result.score.toFixed(2)}/100`);
            if (result.alternativePersonas.length > 0) {
                console.log(`   Alternatives: ${result.alternativePersonas.map(a => `${a.persona} (${a.score.toFixed(2)})`).join(', ')}`);
            }
            console.log('');
        }

        return result;
    }

    /**
     * Calculate persona score based on user information
     * @private
     */
    calculatePersonaScore(userInfo, patterns) {
        const breakdown = {};
        let total = 0;

        // 1. Profile Name Analysis (40 points max)
        const profileScore = this.scoreProfileMatch(userInfo.profileName, patterns.profile);
        breakdown.profileMatch = profileScore;
        total += profileScore;

        // 2. Role Hierarchy Position (30 points max)
        const roleScore = this.scoreRoleMatch(userInfo.roleName, patterns.role, patterns.indicators);
        breakdown.roleMatch = roleScore;
        total += roleScore;

        // 3. Permission Sets (20 points max)
        const permissionScore = this.scorePermissionSets(userInfo.permissionSets, patterns.permissionSets);
        breakdown.permissionSets = permissionScore;
        total += permissionScore;

        // 4. User Type (10 points max)
        const userTypeScore = this.scoreUserType(userInfo.userType);
        breakdown.userType = userTypeScore;
        total += userTypeScore;

        return {
            total: total,
            breakdown: breakdown
        };
    }

    /**
     * Score profile name match
     * @private
     */
    scoreProfileMatch(profileName, profilePatterns) {
        if (!profileName) return 0;

        let maxScore = 0;

        for (const pattern of profilePatterns) {
            if (pattern.test(profileName)) {
                // Exact match = full points
                maxScore = Math.max(maxScore, 40);
            }
        }

        // Partial credit for keywords
        if (maxScore === 0) {
            const keywords = ['sales', 'support', 'service', 'manager', 'executive', 'rep', 'agent'];
            const matchedKeywords = keywords.filter(kw => profileName.toLowerCase().includes(kw));
            maxScore = Math.min(matchedKeywords.length * 8, 24); // Up to 24 points for partial matches
        }

        return maxScore;
    }

    /**
     * Score role match
     * @private
     */
    scoreRoleMatch(roleName, rolePatterns, indicators) {
        let score = 0;

        if (!roleName) return 0;

        // Pattern matching
        for (const pattern of rolePatterns) {
            if (pattern.test(roleName)) {
                score = Math.max(score, 25);
                break;
            }
        }

        // Check for manager role indicator
        const hasManagerKeyword = /manager|director|lead|vp|chief|head/i.test(roleName);

        if (indicators.hasManagerRole && hasManagerKeyword) {
            score += 5; // Bonus for manager role when expected
        } else if (!indicators.hasManagerRole && !hasManagerKeyword) {
            score += 5; // Bonus for IC role when expected
        }

        return Math.min(score, 30);
    }

    /**
     * Score permission sets match
     * @private
     */
    scorePermissionSets(userPermissionSets, permissionPatterns) {
        if (!userPermissionSets || userPermissionSets.length === 0) return 0;

        let score = 0;
        let matchCount = 0;

        for (const permissionSet of userPermissionSets) {
            for (const pattern of permissionPatterns) {
                if (pattern.test(permissionSet)) {
                    matchCount++;
                    break; // Count each permission set only once
                }
            }
        }

        // Award points based on match count
        if (matchCount >= 2) {
            score = 20; // Strong permission set alignment
        } else if (matchCount === 1) {
            score = 12; // Some alignment
        } else {
            score = 5; // Default baseline
        }

        return score;
    }

    /**
     * Score user type
     * @private
     */
    scoreUserType(userType) {
        // Standard users get full points
        if (userType === 'Standard') {
            return 10;
        }

        // Other user types get partial credit
        const typeScores = {
            'PowerPartner': 7,
            'PowerCustomerSuccess': 7,
            'CSPLitePortal': 5,
            'CustomerSuccess': 5,
            'Guest': 2
        };

        return typeScores[userType] || 3;
    }

    /**
     * Calculate confidence level from best and second-best scores
     * @private
     */
    calculateConfidence(bestScore, secondBestScore) {
        // Base confidence on best score
        let confidence = bestScore / 100;

        // Reduce confidence if second-best is close
        if (secondBestScore !== null && secondBestScore !== undefined) {
            const gap = bestScore - secondBestScore;

            if (gap < 10) {
                confidence *= 0.7; // Ambiguous - reduce confidence
            } else if (gap < 20) {
                confidence *= 0.85; // Moderate separation
            }
            // else: large gap, keep full confidence
        }

        return Math.min(confidence, 1.0);
    }

    /**
     * Get confidence level label
     * @private
     */
    getConfidenceLevel(confidence) {
        if (confidence >= 0.9) return 'VERY_HIGH';
        if (confidence >= 0.75) return 'HIGH';
        if (confidence >= 0.6) return 'MEDIUM';
        if (confidence >= 0.4) return 'LOW';
        return 'VERY_LOW';
    }

    /**
     * Get user information from Salesforce
     * @private
     */
    async getUserInfo(userId) {
        try {
            // Build SOQL query
            const userIdClause = userId ? `WHERE Id = '${userId}'` : `WHERE Id = '${await this.getCurrentUserId()}'`;

            const query = `SELECT Id, Username, Profile.Name, UserRole.Name, UserType
                          FROM User
                          ${userIdClause}`;

            const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

            if (result.status !== 0 || !result.result || !result.result.records || result.result.records.length === 0) {
                throw new Error('User not found');
            }

            const user = result.result.records[0];

            // Get permission sets for user
            const permissionSets = await this.getUserPermissionSets(user.Id);

            return {
                userId: user.Id,
                username: user.Username,
                profileName: user.Profile ? user.Profile.Name : null,
                roleName: user.UserRole ? user.UserRole.Name : null,
                userType: user.UserType,
                permissionSets: permissionSets
            };

        } catch (error) {
            throw new Error(`Failed to get user info: ${error.message}`);
        }
    }

    /**
     * Get current user ID
     * @private
     */
    async getCurrentUserId() {
        try {
            const cmd = `sf org display --target-org ${this.orgAlias} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

            if (result.status !== 0 || !result.result || !result.result.id) {
                throw new Error('Failed to get current user');
            }

            // This gets org ID, we need user ID - query for it
            const query = `SELECT Id FROM User WHERE Username = '${result.result.username}'`;
            const userCmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;
            const userResult = JSON.parse(execSync(userCmd, { encoding: 'utf8' }));

            return userResult.result.records[0].Id;

        } catch (error) {
            throw new Error(`Failed to get current user ID: ${error.message}`);
        }
    }

    /**
     * Get permission sets assigned to user
     * @private
     */
    async getUserPermissionSets(userId) {
        try {
            const query = `SELECT PermissionSet.Name
                          FROM PermissionSetAssignment
                          WHERE AssigneeId = '${userId}'`;

            const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

            if (result.status !== 0 || !result.result || !result.result.records) {
                return [];
            }

            return result.result.records.map(r => r.PermissionSet.Name);

        } catch (error) {
            // Permission sets are optional - don't fail if we can't get them
            if (this.verbose) {
                console.warn(`   Warning: Could not retrieve permission sets: ${error.message}`);
            }
            return [];
        }
    }

    /**
     * Detect persona for a profile name (without querying org)
     * @param {string} profileName - Profile name to analyze
     * @returns {Object} Detection result
     */
    detectPersonaByProfileName(profileName) {
        const userInfo = {
            profileName: profileName,
            roleName: null,
            userType: 'Standard',
            permissionSets: []
        };

        const personaScores = {};

        for (const [personaName, patterns] of Object.entries(this.patterns)) {
            const score = this.calculatePersonaScore(userInfo, patterns);
            personaScores[personaName] = score;
        }

        const sortedPersonas = Object.entries(personaScores)
            .sort(([, scoreA], [, scoreB]) => scoreB.total - scoreA.total);

        const [bestPersona, bestScore] = sortedPersonas[0];
        const confidence = bestScore.total / 100; // Simplified confidence

        return {
            persona: bestPersona,
            confidence: confidence,
            confidenceLevel: this.getConfidenceLevel(confidence),
            score: bestScore.total
        };
    }
}

module.exports = LayoutPersonaDetector;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log(`
Usage: node layout-persona-detector.js <org-alias> [user-id] [options]

Options:
  --verbose    Show detailed detection output

Examples:
  node layout-persona-detector.js my-org --verbose
  node layout-persona-detector.js production 0055w000001XyZ1AAK
  node layout-persona-detector.js sandbox --verbose
        `);
        process.exit(1);
    }

    const orgAlias = args[0];
    const userId = args[1] && !args[1].startsWith('--') ? args[1] : null;
    const verbose = args.includes('--verbose');

    (async () => {
        try {
            const detector = new LayoutPersonaDetector(orgAlias, { verbose });
            const result = await detector.detectPersona(userId);

            console.log('\n📊 Persona Detection Result:\n');
            console.log(JSON.stringify(result, null, 2));

            if (result.confidenceLevel === 'VERY_LOW' || result.confidenceLevel === 'LOW') {
                console.log(`\n⚠️  Warning: Low confidence (${(result.confidence * 100).toFixed(1)}%)`);
                console.log('   Recommend manual persona selection or profile review\n');
            } else {
                console.log(`\n✓ High confidence detection (${(result.confidence * 100).toFixed(1)}%)\n`);
            }

        } catch (error) {
            console.error('❌ Error:', error.message);
            process.exit(1);
        }
    })();
}

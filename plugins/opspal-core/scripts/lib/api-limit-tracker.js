#!/usr/bin/env node

/**
 * API Limit Tracker
 *
 * Tracks and learns API rate limits:
 * - Learn limits from 429 responses
 * - Store per-endpoint limits
 * - Pre-flight limit checks
 * - Header size validation
 * - Retry with exponential backoff
 *
 * @version 1.0.0
 * @date 2025-12-19
 *
 * Addresses: external-api cohort (rate limits, undocumented limits)
 */

const fs = require('fs');
const path = require('path');

class APILimitTracker {
    constructor(options = {}) {
        this.verbose = options.verbose || false;

        // Storage
        this.dataDir = options.dataDir || path.join(process.env.HOME || '/tmp', '.claude', 'api-limits');
        this.limitsFile = path.join(this.dataDir, 'learned-limits.json');
        this.usageFile = path.join(this.dataDir, 'usage-history.jsonl');

        // Default limits (conservative estimates)
        this.defaultLimits = {
            'salesforce': {
                requestsPerDay: 100000,
                requestsPerHour: 15000,
                requestsPerMinute: 500,
                concurrentRequests: 25,
                headerSizeBytes: 8192
            },
            'hubspot': {
                requestsPerSecond: 10,
                requestsPerDay: 500000,
                headerSizeBytes: 8192
            },
            'marketo': {
                requestsPerDay: 50000,
                requestsPerMinute: 100,
                headerSizeBytes: 8192
            },
            'default': {
                requestsPerMinute: 60,
                requestsPerHour: 1000,
                headerSizeBytes: 8192
            }
        };

        // Usage tracking (in-memory)
        this.usageCounters = new Map();
        this.windowStart = new Map();

        // Capability matrix - defines allowed operations at different capacity levels
        // Capacity levels: green (<70%), yellow (70-90%), red (>90%)
        this.capabilityMatrix = {
            salesforce: {
                green: {
                    operations: ['query', 'metadata', 'bulk', 'deploy', 'report', 'dashboard', 'apex'],
                    restrictions: [],
                    message: 'All operations allowed'
                },
                yellow: {
                    operations: ['query', 'metadata', 'report'],
                    restrictions: ['bulk', 'deploy', 'dashboard'],
                    message: '⚠️ At 70%+ capacity: Bulk operations, deployments, and dashboards restricted. Queue non-urgent bulk operations.'
                },
                red: {
                    operations: ['query'],
                    restrictions: ['metadata', 'bulk', 'deploy', 'report', 'dashboard', 'apex'],
                    message: '🚨 At 90%+ capacity: Only simple queries allowed. All other operations blocked until capacity recovers.'
                }
            },
            hubspot: {
                green: {
                    operations: ['read', 'write', 'bulk', 'workflow', 'import'],
                    restrictions: [],
                    message: 'All operations allowed'
                },
                yellow: {
                    operations: ['read', 'write', 'workflow'],
                    restrictions: ['bulk', 'import'],
                    message: '⚠️ At 70%+ capacity: Bulk operations and imports restricted. Use single-record operations.'
                },
                red: {
                    operations: ['read'],
                    restrictions: ['write', 'bulk', 'workflow', 'import'],
                    message: '🚨 At 90%+ capacity: Only read operations allowed. Queue writes for later.'
                }
            },
            marketo: {
                green: {
                    operations: ['lead', 'activity', 'campaign', 'bulk', 'export'],
                    restrictions: [],
                    message: 'All operations allowed'
                },
                yellow: {
                    operations: ['lead', 'activity', 'campaign'],
                    restrictions: ['bulk', 'export'],
                    message: '⚠️ At 70%+ capacity: Bulk operations and exports restricted.'
                },
                red: {
                    operations: ['lead'],
                    restrictions: ['activity', 'campaign', 'bulk', 'export'],
                    message: '🚨 At 90%+ capacity: Only lead queries allowed.'
                }
            },
            default: {
                green: {
                    operations: ['all'],
                    restrictions: [],
                    message: 'All operations allowed'
                },
                yellow: {
                    operations: ['read', 'single-write'],
                    restrictions: ['bulk'],
                    message: '⚠️ At 70%+ capacity: Bulk operations restricted.'
                },
                red: {
                    operations: ['read'],
                    restrictions: ['write', 'bulk'],
                    message: '🚨 At 90%+ capacity: Only read operations allowed.'
                }
            }
        };

        // Warning threshold (%)
        this.warningThreshold = options.warningThreshold || 80;

        // Learned limits (loaded from file)
        this.learnedLimits = this._loadLearnedLimits();

        // Ensure data directory exists
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    /**
     * Record an API request
     * @param {string} platform - Platform name (salesforce, hubspot, etc.)
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Request details
     * @returns {Object} Usage record
     */
    recordRequest(platform, endpoint, options = {}) {
        const key = `${platform}:${endpoint}`;
        const now = Date.now();

        // Initialize counter if needed
        if (!this.usageCounters.has(key)) {
            this.usageCounters.set(key, {
                minute: 0,
                hour: 0,
                day: 0
            });
            this.windowStart.set(key, {
                minute: now,
                hour: now,
                day: now
            });
        }

        const counters = this.usageCounters.get(key);
        const windows = this.windowStart.get(key);

        // Reset windows if needed
        const oneMinute = 60 * 1000;
        const oneHour = 60 * 60 * 1000;
        const oneDay = 24 * 60 * 60 * 1000;

        if (now - windows.minute > oneMinute) {
            counters.minute = 0;
            windows.minute = now;
        }
        if (now - windows.hour > oneHour) {
            counters.hour = 0;
            windows.hour = now;
        }
        if (now - windows.day > oneDay) {
            counters.day = 0;
            windows.day = now;
        }

        // Increment counters
        counters.minute++;
        counters.hour++;
        counters.day++;

        // Log usage
        const record = {
            timestamp: new Date().toISOString(),
            platform,
            endpoint,
            counters: { ...counters },
            responseCode: options.responseCode,
            retryAfter: options.retryAfter
        };

        this._logUsage(record);

        return record;
    }

    /**
     * Record a 429 rate limit response
     * @param {string} platform - Platform name
     * @param {string} endpoint - API endpoint
     * @param {Object} response - Response details
     */
    record429(platform, endpoint, response = {}) {
        const key = `${platform}:${endpoint}`;

        // Extract limit info from response
        const retryAfter = response.retryAfter || response.headers?.['retry-after'];
        const limitHeader = response.headers?.['x-ratelimit-limit'];
        const remainingHeader = response.headers?.['x-ratelimit-remaining'];
        const resetHeader = response.headers?.['x-ratelimit-reset'];

        // Record the event
        this.recordRequest(platform, endpoint, {
            responseCode: 429,
            retryAfter: retryAfter ? parseInt(retryAfter) : null
        });

        // Learn from the 429
        if (!this.learnedLimits[key]) {
            this.learnedLimits[key] = {
                occurrences: 0,
                lastOccurrence: null,
                inferredLimit: null,
                retryAfterValues: []
            };
        }

        const learned = this.learnedLimits[key];
        learned.occurrences++;
        learned.lastOccurrence = new Date().toISOString();

        if (retryAfter) {
            learned.retryAfterValues.push(parseInt(retryAfter));
            // Keep last 10 values
            if (learned.retryAfterValues.length > 10) {
                learned.retryAfterValues.shift();
            }
        }

        if (limitHeader) {
            learned.inferredLimit = parseInt(limitHeader);
        }

        // Save learned limits
        this._saveLearnedLimits();

        if (this.verbose) {
            console.log(`[limit-tracker] Recorded 429 for ${key}. Occurrences: ${learned.occurrences}`);
        }
    }

    /**
     * Pre-flight check before making a request
     * @param {string} platform - Platform name
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Check options
     * @returns {Object} Check result
     */
    preflightCheck(platform, endpoint, options = {}) {
        const key = `${platform}:${endpoint}`;
        const result = {
            allowed: true,
            reason: null,
            waitMs: 0,
            usage: null,
            limits: null
        };

        // Get current usage
        const counters = this.usageCounters.get(key) || { minute: 0, hour: 0, day: 0 };
        result.usage = { ...counters };

        // Get applicable limits
        const limits = this._getLimitsForEndpoint(platform, endpoint);
        result.limits = limits;

        // Check against limits
        if (limits.requestsPerMinute && counters.minute >= limits.requestsPerMinute) {
            result.allowed = false;
            result.reason = `Rate limit: ${counters.minute}/${limits.requestsPerMinute} requests/minute`;
            result.waitMs = this._getWindowRemainingMs('minute', key);
        }

        if (limits.requestsPerHour && counters.hour >= limits.requestsPerHour) {
            result.allowed = false;
            result.reason = `Rate limit: ${counters.hour}/${limits.requestsPerHour} requests/hour`;
            result.waitMs = Math.max(result.waitMs, this._getWindowRemainingMs('hour', key));
        }

        if (limits.requestsPerDay && counters.day >= limits.requestsPerDay) {
            result.allowed = false;
            result.reason = `Rate limit: ${counters.day}/${limits.requestsPerDay} requests/day`;
            result.waitMs = Math.max(result.waitMs, this._getWindowRemainingMs('day', key));
        }

        // Check header size if provided
        if (options.headerSize && limits.headerSizeBytes) {
            if (options.headerSize > limits.headerSizeBytes) {
                result.allowed = false;
                result.reason = `Header size ${options.headerSize} exceeds limit ${limits.headerSizeBytes}`;
            }
        }

        // Check recent 429s
        const learned = this.learnedLimits[key];
        if (learned && learned.occurrences > 0) {
            const lastOccurrence = new Date(learned.lastOccurrence).getTime();
            const cooldownMs = this._calculateCooldown(learned);

            if (Date.now() - lastOccurrence < cooldownMs) {
                result.allowed = false;
                result.reason = `Recent 429 - cooling down`;
                result.waitMs = Math.max(result.waitMs, cooldownMs - (Date.now() - lastOccurrence));
            }
        }

        return result;
    }

    /**
     * Validate header size
     * @param {Object} headers - Headers object
     * @param {string} platform - Platform name
     * @returns {Object} Validation result
     */
    validateHeaderSize(headers, platform = 'default') {
        const limits = this.defaultLimits[platform] || this.defaultLimits.default;
        const maxSize = limits.headerSizeBytes || 8192;

        // Calculate header size
        let totalSize = 0;
        for (const [key, value] of Object.entries(headers || {})) {
            totalSize += key.length + 2; // key + ": "
            totalSize += String(value).length + 2; // value + "\r\n"
        }

        return {
            valid: totalSize <= maxSize,
            size: totalSize,
            maxSize,
            exceeded: totalSize > maxSize ? totalSize - maxSize : 0
        };
    }

    /**
     * Calculate retry delay with exponential backoff
     * @param {number} attempt - Attempt number (0-based)
     * @param {Object} options - Options (baseDelay, maxDelay, jitter)
     * @returns {number} Delay in milliseconds
     */
    calculateRetryDelay(attempt, options = {}) {
        const baseDelay = options.baseDelay || 1000;
        const maxDelay = options.maxDelay || 60000;
        const jitter = options.jitter !== false;

        // Exponential backoff: baseDelay * 2^attempt
        let delay = baseDelay * Math.pow(2, attempt);

        // Cap at max delay
        delay = Math.min(delay, maxDelay);

        // Add jitter (±25%)
        if (jitter) {
            const jitterFactor = 0.75 + Math.random() * 0.5;
            delay = Math.floor(delay * jitterFactor);
        }

        return delay;
    }

    /**
     * Get usage summary
     * @param {string} platform - Optional platform filter
     * @returns {Object} Usage summary
     */
    getUsageSummary(platform = null) {
        const summary = {
            endpoints: {},
            totals: {
                minute: 0,
                hour: 0,
                day: 0
            },
            learnedLimits: {}
        };

        for (const [key, counters] of this.usageCounters.entries()) {
            if (platform && !key.startsWith(platform)) continue;

            summary.endpoints[key] = { ...counters };
            summary.totals.minute += counters.minute;
            summary.totals.hour += counters.hour;
            summary.totals.day += counters.day;
        }

        // Include learned limits
        for (const [key, learned] of Object.entries(this.learnedLimits)) {
            if (platform && !key.startsWith(platform)) continue;
            summary.learnedLimits[key] = learned;
        }

        return summary;
    }

    /**
     * Get capability status for a platform based on current utilization
     *
     * @param {string} platform - Platform name (salesforce, hubspot, marketo)
     * @param {string} operationType - Optional operation type to check
     * @returns {Object} Capability status with allowed operations and warnings
     */
    getCapabilityStatus(platform, operationType = null) {
        const platformLimits = this.defaultLimits[platform] || this.defaultLimits.default;
        const matrix = this.capabilityMatrix[platform] || this.capabilityMatrix.default;

        // Calculate current utilization across all endpoints for this platform
        let totalUsage = { minute: 0, hour: 0, day: 0 };

        for (const [key, counters] of this.usageCounters.entries()) {
            if (key.startsWith(platform)) {
                totalUsage.minute += counters.minute;
                totalUsage.hour += counters.hour;
                totalUsage.day += counters.day;
            }
        }

        // Calculate utilization percentages
        const utilization = {
            minute: platformLimits.requestsPerMinute
                ? (totalUsage.minute / platformLimits.requestsPerMinute) * 100
                : 0,
            hour: platformLimits.requestsPerHour
                ? (totalUsage.hour / platformLimits.requestsPerHour) * 100
                : 0,
            day: platformLimits.requestsPerDay
                ? (totalUsage.day / platformLimits.requestsPerDay) * 100
                : 0
        };

        // Get the highest utilization
        const maxUtilization = Math.max(utilization.minute, utilization.hour, utilization.day);

        // Determine capacity level
        let level, levelInfo;
        if (maxUtilization >= 90) {
            level = 'red';
            levelInfo = matrix.red;
        } else if (maxUtilization >= 70) {
            level = 'yellow';
            levelInfo = matrix.yellow;
        } else {
            level = 'green';
            levelInfo = matrix.green;
        }

        // Build result
        const result = {
            platform,
            level,
            utilization: {
                current: Math.round(maxUtilization * 10) / 10, // Round to 1 decimal
                breakdown: {
                    minute: Math.round(utilization.minute * 10) / 10,
                    hour: Math.round(utilization.hour * 10) / 10,
                    day: Math.round(utilization.day * 10) / 10
                }
            },
            usage: totalUsage,
            limits: platformLimits,
            allowedOperations: levelInfo.operations,
            restrictedOperations: levelInfo.restrictions,
            message: levelInfo.message,
            warnings: []
        };

        // Add warnings at threshold
        if (maxUtilization >= this.warningThreshold) {
            result.warnings.push({
                type: 'capacity_warning',
                severity: maxUtilization >= 90 ? 'critical' : 'warning',
                message: `${platform} API at ${Math.round(maxUtilization)}% capacity`,
                recommendation: maxUtilization >= 90
                    ? 'Pause non-essential operations immediately'
                    : 'Consider rate-limiting or queuing bulk operations'
            });
        }

        // Check if specific operation is allowed
        if (operationType) {
            const isAllowed = levelInfo.operations.includes(operationType) ||
                              levelInfo.operations.includes('all');
            const isRestricted = levelInfo.restrictions.includes(operationType);

            result.operationCheck = {
                operation: operationType,
                allowed: isAllowed && !isRestricted,
                reason: isRestricted
                    ? `Operation "${operationType}" is restricted at ${level} capacity level`
                    : isAllowed
                        ? `Operation "${operationType}" is allowed`
                        : `Operation "${operationType}" not in allowed list at ${level} capacity level`
            };
        }

        // Log warning if verbose
        if (this.verbose && result.warnings.length > 0) {
            for (const warning of result.warnings) {
                console.log(`[limit-tracker] ${warning.severity.toUpperCase()}: ${warning.message}`);
            }
        }

        return result;
    }

    /**
     * Check if a specific operation is allowed for a platform
     *
     * @param {string} platform - Platform name
     * @param {string} operationType - Operation type (query, bulk, deploy, etc.)
     * @returns {Object} Operation allowance result
     */
    isOperationAllowed(platform, operationType) {
        const status = this.getCapabilityStatus(platform, operationType);
        return {
            allowed: status.operationCheck?.allowed ?? true,
            reason: status.operationCheck?.reason ?? 'No restrictions',
            level: status.level,
            utilization: status.utilization.current,
            message: status.message
        };
    }

    /**
     * Get proactive warnings for all platforms
     *
     * @returns {Array} Array of warnings across all platforms
     */
    getAllPlatformWarnings() {
        const warnings = [];
        const platforms = ['salesforce', 'hubspot', 'marketo'];

        for (const platform of platforms) {
            const status = this.getCapabilityStatus(platform);
            if (status.warnings.length > 0) {
                warnings.push({
                    platform,
                    level: status.level,
                    utilization: status.utilization.current,
                    warnings: status.warnings,
                    restrictedOperations: status.restrictedOperations
                });
            }
        }

        return warnings;
    }

    /**
     * Reset usage counters
     * @param {string} key - Optional specific key to reset
     */
    resetCounters(key = null) {
        if (key) {
            this.usageCounters.delete(key);
            this.windowStart.delete(key);
        } else {
            this.usageCounters.clear();
            this.windowStart.clear();
        }
    }

    // === Private Methods ===

    _loadLearnedLimits() {
        try {
            if (fs.existsSync(this.limitsFile)) {
                return JSON.parse(fs.readFileSync(this.limitsFile, 'utf-8'));
            }
        } catch (e) {
            // Invalid file
        }
        return {};
    }

    _saveLearnedLimits() {
        try {
            fs.writeFileSync(this.limitsFile, JSON.stringify(this.learnedLimits, null, 2));
        } catch (e) {
            if (this.verbose) {
                console.error(`[limit-tracker] Failed to save learned limits: ${e.message}`);
            }
        }
    }

    _logUsage(record) {
        try {
            fs.appendFileSync(this.usageFile, JSON.stringify(record) + '\n');
        } catch (e) {
            // Silently fail
        }
    }

    _getLimitsForEndpoint(platform, endpoint) {
        const key = `${platform}:${endpoint}`;

        // Check learned limits first
        if (this.learnedLimits[key]?.inferredLimit) {
            return {
                ...this.defaultLimits[platform] || this.defaultLimits.default,
                requestsPerMinute: this.learnedLimits[key].inferredLimit
            };
        }

        // Return platform defaults or generic defaults
        return this.defaultLimits[platform] || this.defaultLimits.default;
    }

    _getWindowRemainingMs(window, key) {
        const windows = this.windowStart.get(key);
        if (!windows) return 0;

        const windowSizes = {
            minute: 60 * 1000,
            hour: 60 * 60 * 1000,
            day: 24 * 60 * 60 * 1000
        };

        const windowSize = windowSizes[window];
        const elapsed = Date.now() - windows[window];

        return Math.max(0, windowSize - elapsed);
    }

    _calculateCooldown(learned) {
        // Use average of recent retry-after values, or default
        if (learned.retryAfterValues.length > 0) {
            const avg = learned.retryAfterValues.reduce((a, b) => a + b, 0) / learned.retryAfterValues.length;
            return avg * 1000; // Convert to ms
        }

        // Default cooldown based on occurrence count
        const baseCooldown = 5000;
        return baseCooldown * Math.min(learned.occurrences, 10);
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const tracker = new APILimitTracker({ verbose: true });

    switch (command) {
        case 'record':
            const platform = args[1];
            const endpoint = args[2];
            if (!platform || !endpoint) {
                console.error('Usage: api-limit-tracker record <platform> <endpoint>');
                process.exit(1);
            }
            const record = tracker.recordRequest(platform, endpoint);
            console.log(JSON.stringify(record, null, 2));
            break;

        case '429':
            const p429 = args[1];
            const e429 = args[2];
            const retryAfter = args[3] ? parseInt(args[3]) : null;
            if (!p429 || !e429) {
                console.error('Usage: api-limit-tracker 429 <platform> <endpoint> [retry_after]');
                process.exit(1);
            }
            tracker.record429(p429, e429, { retryAfter });
            console.log('429 recorded');
            break;

        case 'check':
            const checkPlatform = args[1];
            const checkEndpoint = args[2];
            if (!checkPlatform || !checkEndpoint) {
                console.error('Usage: api-limit-tracker check <platform> <endpoint>');
                process.exit(1);
            }
            const checkResult = tracker.preflightCheck(checkPlatform, checkEndpoint);
            console.log(JSON.stringify(checkResult, null, 2));
            process.exit(checkResult.allowed ? 0 : 1);
            break;

        case 'summary':
            const summaryPlatform = args[1] || null;
            const summary = tracker.getUsageSummary(summaryPlatform);
            console.log(JSON.stringify(summary, null, 2));
            break;

        case 'validate-headers':
            const headerPlatform = args[1] || 'default';
            const headerSize = parseInt(args[2]) || 0;
            const validation = tracker.validateHeaderSize({ 'example': 'x'.repeat(headerSize) }, headerPlatform);
            console.log(JSON.stringify(validation, null, 2));
            break;

        case 'retry-delay':
            const attempt = parseInt(args[1]) || 0;
            const delay = tracker.calculateRetryDelay(attempt);
            console.log(`Retry delay for attempt ${attempt}: ${delay}ms`);
            break;

        case 'status':
        case 'capability':
            const statusPlatform = args[1];
            const statusOperation = args[2];
            if (!statusPlatform) {
                console.error('Usage: api-limit-tracker status <platform> [operation]');
                process.exit(1);
            }
            const capStatus = tracker.getCapabilityStatus(statusPlatform, statusOperation);
            console.log(`\n📊 Capability Status: ${statusPlatform.toUpperCase()}\n`);
            console.log(`Level: ${capStatus.level === 'green' ? '🟢' : capStatus.level === 'yellow' ? '🟡' : '🔴'} ${capStatus.level.toUpperCase()}`);
            console.log(`Utilization: ${capStatus.utilization.current}%`);
            console.log(`  - Per minute: ${capStatus.utilization.breakdown.minute}%`);
            console.log(`  - Per hour: ${capStatus.utilization.breakdown.hour}%`);
            console.log(`  - Per day: ${capStatus.utilization.breakdown.day}%`);
            console.log(`\n${capStatus.message}`);
            console.log(`\nAllowed operations: ${capStatus.allowedOperations.join(', ')}`);
            if (capStatus.restrictedOperations.length > 0) {
                console.log(`Restricted operations: ${capStatus.restrictedOperations.join(', ')}`);
            }
            if (capStatus.operationCheck) {
                console.log(`\nOperation "${statusOperation}": ${capStatus.operationCheck.allowed ? '✅ Allowed' : '❌ Blocked'}`);
                console.log(`  ${capStatus.operationCheck.reason}`);
            }
            if (capStatus.warnings.length > 0) {
                console.log('\n⚠️ Warnings:');
                for (const w of capStatus.warnings) {
                    console.log(`  ${w.severity}: ${w.message}`);
                    console.log(`  Recommendation: ${w.recommendation}`);
                }
            }
            break;

        case 'warnings':
            const allWarnings = tracker.getAllPlatformWarnings();
            if (allWarnings.length === 0) {
                console.log('✅ No capacity warnings across platforms');
            } else {
                console.log('\n⚠️ Platform Capacity Warnings:\n');
                for (const pw of allWarnings) {
                    console.log(`${pw.platform.toUpperCase()} (${pw.level}): ${pw.utilization}% capacity`);
                    for (const w of pw.warnings) {
                        console.log(`  ${w.severity}: ${w.message}`);
                    }
                    if (pw.restrictedOperations.length > 0) {
                        console.log(`  Restricted: ${pw.restrictedOperations.join(', ')}`);
                    }
                    console.log();
                }
            }
            break;

        case 'operation':
        case 'can':
            const opPlatform = args[1];
            const opType = args[2];
            if (!opPlatform || !opType) {
                console.error('Usage: api-limit-tracker operation <platform> <operation_type>');
                console.error('  Example: api-limit-tracker operation salesforce bulk');
                process.exit(1);
            }
            const opResult = tracker.isOperationAllowed(opPlatform, opType);
            if (opResult.allowed) {
                console.log(`✅ Operation "${opType}" is ALLOWED on ${opPlatform}`);
            } else {
                console.log(`❌ Operation "${opType}" is BLOCKED on ${opPlatform}`);
            }
            console.log(`   Level: ${opResult.level}, Utilization: ${opResult.utilization}%`);
            console.log(`   ${opResult.reason}`);
            process.exit(opResult.allowed ? 0 : 1);
            break;

        default:
            console.log(`
API Limit Tracker - Track and learn API rate limits

Usage:
  api-limit-tracker record <platform> <endpoint>     Record API request
  api-limit-tracker 429 <platform> <endpoint> [sec]  Record 429 response
  api-limit-tracker check <platform> <endpoint>      Pre-flight limit check
  api-limit-tracker summary [platform]               Show usage summary
  api-limit-tracker validate-headers <platform> <size>  Validate header size
  api-limit-tracker retry-delay <attempt>            Calculate retry delay
  api-limit-tracker status <platform> [operation]    Get capability status
  api-limit-tracker warnings                         Show all platform warnings
  api-limit-tracker operation <platform> <op_type>   Check if operation allowed

Default Limits (per platform):
  salesforce:  500/min, 15000/hour, 100000/day
  hubspot:     10/second, 500000/day
  marketo:     100/min, 50000/day
  default:     60/min, 1000/hour

Capability Matrix (operation restrictions by capacity level):
  Green  (<70%):  All operations allowed
  Yellow (70-90%): Bulk/deploy restricted
  Red    (>90%):  Read-only operations

Operation Types:
  salesforce: query, metadata, bulk, deploy, report, dashboard, apex
  hubspot:    read, write, bulk, workflow, import
  marketo:    lead, activity, campaign, bulk, export

Examples:
  api-limit-tracker record salesforce /query
  api-limit-tracker 429 salesforce /query 60
  api-limit-tracker check salesforce /query
  api-limit-tracker status salesforce deploy
  api-limit-tracker operation hubspot bulk
  api-limit-tracker warnings
            `);
    }
}

module.exports = { APILimitTracker };

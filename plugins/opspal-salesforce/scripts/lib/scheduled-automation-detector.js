#!/usr/bin/env node

/**
 * Scheduled Automation Detector (v3.29.0)
 *
 * Purpose: Detect and catalog all scheduled automation in Salesforce org
 * (scheduled Flows and scheduled Apex jobs) to explain "mystery overwrites"
 * that happen outside user transaction times.
 *
 * Features:
 * - Detects scheduled Flows (TriggerType = 'Scheduled')
 * - Queries CronTrigger for scheduled Apex jobs
 * - Extracts next fire time and cron expression
 * - Maps scheduled jobs to Apex classes
 * - Generates scheduled automation calendar
 *
 * Scheduled Flows:
 * - Query FlowDefinitionView WHERE TriggerType='Scheduled'
 * - Parse schedule from Flow XML (frequency, startTime)
 *
 * Scheduled Apex:
 * - Query CronTrigger for all scheduled jobs
 * - Extract CronJobDetail (class name, job type)
 * - Parse cron expression for human-readable schedule
 *
 * Usage:
 *   const detector = new ScheduledAutomationDetector(orgAlias);
 *   const flows = await detector.detectScheduledFlows();
 *   const apex = await detector.detectScheduledApex();
 *   const calendar = detector.generateCalendar(flows, apex);
 *
 * @version 1.0.0
 * @date 2025-10-22
 */

const { execSync } = require('child_process');

class ScheduledAutomationDetector {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
    }

    /**
     * Detect all scheduled Flows in org
     * @returns {Promise<Array>} Scheduled flows
     */
    async detectScheduledFlows() {
        console.log('📅 Detecting scheduled Flows...');

        try {
            // TriggerType is a field on Flow (version object), NOT on FlowDefinitionView.
            // Query the Flow object directly for scheduled trigger detection.
            const query = `
                SELECT Id, DefinitionId, ProcessType, TriggerType, Status, VersionNumber
                FROM Flow
                WHERE TriggerType = 'Scheduled'
                  AND Status = 'Active'
                ORDER BY ProcessType
            `;

            const result = this.execSfCommand(
                `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`
            );

            if (!result?.result?.records || result.result.records.length === 0) {
                console.log('  ✓ No scheduled Flows found');
                return [];
            }

            const flows = result.result.records;
            console.log(`  ✓ Found ${flows.length} scheduled Flow(s)`);

            // Enrich with schedule details
            const enriched = [];
            for (const flow of flows) {
                try {
                    const schedule = await this.getFlowSchedule(flow.ActiveVersionId || flow.DurableId);
                    enriched.push({
                        name: flow.DeveloperName,
                        label: flow.MasterLabel,
                        type: 'ScheduledFlow',
                        namespace: flow.NamespacePrefix,
                        schedule: schedule.frequency,
                        startTime: schedule.startTime,
                        cronExpression: this.flowScheduleToCron(schedule),
                        nextRun: this.calculateNextRun(schedule),
                        lastModified: flow.LastModifiedDate
                    });
                } catch (error) {
                    console.warn(`  ⚠️  Failed to get schedule for ${flow.DeveloperName}: ${error.message}`);
                    enriched.push({
                        name: flow.DeveloperName,
                        label: flow.MasterLabel,
                        type: 'ScheduledFlow',
                        namespace: flow.NamespacePrefix,
                        schedule: 'Unknown',
                        error: error.message
                    });
                }
            }

            return enriched;
        } catch (error) {
            console.error(`  ❌ Failed to detect scheduled Flows: ${error.message}`);
            return [];
        }
    }

    /**
     * Get Flow schedule details from Flow XML
     * @param {string} flowVersionId - Flow version ID
     * @returns {Promise<Object>} Schedule details
     */
    async getFlowSchedule(flowVersionId) {
        const query = `
            SELECT Id, Metadata
            FROM Flow
            WHERE Id = '${flowVersionId}'
        `;

        const result = this.execSfCommand(
            `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`
        );

        if (!result?.result?.records || result.result.records.length === 0) {
            throw new Error('Flow version not found');
        }

        const metadata = result.result.records[0].Metadata;

        // Parse schedule from metadata
        if (metadata.start && metadata.start.schedule) {
            const schedule = metadata.start.schedule;
            return {
                frequency: schedule.frequency || 'Unknown',
                startTime: schedule.startTime || null,
                dayOfWeek: schedule.dayOfWeek || null,
                dayOfMonth: schedule.dayOfMonth || null
            };
        }

        return {
            frequency: 'Unknown',
            startTime: null
        };
    }

    /**
     * Convert Flow schedule to cron expression
     * @param {Object} schedule - Flow schedule object
     * @returns {string} Cron expression
     */
    flowScheduleToCron(schedule) {
        if (!schedule.frequency) {
            return 'Unknown';
        }

        // Simplified cron generation (full implementation would be more complex)
        const freq = schedule.frequency.toLowerCase();

        if (freq.includes('daily')) {
            return `0 0 ${schedule.startTime || '00:00'} * * ?`;
        }

        if (freq.includes('weekly')) {
            const day = schedule.dayOfWeek || 'SUN';
            return `0 0 ${schedule.startTime || '00:00'} ? * ${day}`;
        }

        if (freq.includes('monthly')) {
            const day = schedule.dayOfMonth || '1';
            return `0 0 ${schedule.startTime || '00:00'} ${day} * ?`;
        }

        return `Custom: ${freq}`;
    }

    /**
     * Detect all scheduled Apex jobs in org
     * @returns {Promise<Array>} Scheduled Apex jobs
     */
    async detectScheduledApex() {
        console.log('📅 Detecting scheduled Apex jobs...');

        try {
            // Query CronTrigger for scheduled jobs
            const query = `
                SELECT Id, State, NextFireTime, PreviousFireTime, CronExpression,
                       StartTime, EndTime, CronJobDetail.Id, CronJobDetail.Name,
                       CronJobDetail.JobType
                FROM CronTrigger
                WHERE State IN ('WAITING', 'PAUSED', 'EXECUTING', 'ACQUIRED')
                ORDER BY NextFireTime
            `;

            const result = this.execSfCommand(
                `sf data query --query "${query}" --json --target-org ${this.orgAlias}`
            );

            if (!result?.result?.records || result.result.records.length === 0) {
                console.log('  ✓ No scheduled Apex jobs found');
                return [];
            }

            const jobs = result.result.records;
            console.log(`  ✓ Found ${jobs.length} scheduled Apex job(s)`);

            // Parse and enrich
            const enriched = jobs.map(job => ({
                name: job.CronJobDetail?.Name || 'Unknown',
                className: this.extractClassName(job.CronJobDetail?.Name),
                type: 'ScheduledApex',
                jobType: job.CronJobDetail?.JobType || 'Unknown',
                state: job.State,
                cronExpression: job.CronExpression,
                schedule: this.parseCronExpression(job.CronExpression),
                nextFireTime: job.NextFireTime,
                previousFireTime: job.PreviousFireTime,
                startTime: job.StartTime,
                endTime: job.EndTime,
                cronJobId: job.Id
            }));

            return enriched;
        } catch (error) {
            console.error(`  ❌ Failed to detect scheduled Apex: ${error.message}`);
            return [];
        }
    }

    /**
     * Extract Apex class name from CronJobDetail name
     * @param {string} jobName - Job name (often includes class name)
     * @returns {string} Apex class name or job name
     */
    extractClassName(jobName) {
        if (!jobName) return 'Unknown';

        // CronJobDetail.Name often includes class name
        // Example: "MyBatchClass" or "Scheduled: MyBatchClass"
        const match = jobName.match(/(?:Scheduled:\s*)?(\w+)/);
        return match ? match[1] : jobName;
    }

    /**
     * Parse cron expression into human-readable schedule
     * @param {string} cronExpression - Standard cron expression
     * @returns {string} Human-readable schedule
     */
    parseCronExpression(cronExpression) {
        if (!cronExpression) return 'Unknown';

        try {
            // Cron format: Seconds Minutes Hours Day-of-Month Month Day-of-Week Year(optional)
            const parts = cronExpression.trim().split(/\s+/);

            if (parts.length < 6) {
                return `Custom: ${cronExpression}`;
            }

            const [sec, min, hour, dayOfMonth, month, dayOfWeek] = parts;

            // Daily pattern: 0 0 [hour] * * ?
            if (dayOfMonth === '*' && month === '*' && (dayOfWeek === '?' || dayOfWeek === '*')) {
                return `Daily at ${this.formatTime(hour, min)}`;
            }

            // Weekly pattern: 0 0 [hour] ? * [day]
            if (dayOfMonth === '?' && month === '*' && dayOfWeek !== '?' && dayOfWeek !== '*') {
                const day = this.dayOfWeekToString(dayOfWeek);
                return `Weekly on ${day} at ${this.formatTime(hour, min)}`;
            }

            // Monthly pattern: 0 0 [hour] [day] * ?
            if (dayOfMonth !== '*' && dayOfMonth !== '?' && month === '*') {
                return `Monthly on day ${dayOfMonth} at ${this.formatTime(hour, min)}`;
            }

            // Hourly pattern: 0 [min] * * * ?
            if (hour === '*') {
                return `Hourly at :${min.padStart(2, '0')}`;
            }

            return `Custom: ${cronExpression}`;
        } catch (error) {
            return `Custom: ${cronExpression}`;
        }
    }

    /**
     * Format time from cron hour/minute
     * @param {string} hour - Hour (0-23)
     * @param {string} minute - Minute (0-59)
     * @returns {string} Formatted time (12-hour with AM/PM)
     */
    formatTime(hour, minute) {
        const h = parseInt(hour);
        const m = parseInt(minute);

        if (isNaN(h) || isNaN(m)) {
            return `${hour}:${minute}`;
        }

        const period = h >= 12 ? 'PM' : 'AM';
        const hour12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);

        return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
    }

    /**
     * Convert day-of-week number to name
     * @param {string} dayNum - Day number (1=SUN, 2=MON, etc.)
     * @returns {string} Day name
     */
    dayOfWeekToString(dayNum) {
        const days = {
            '1': 'Sunday',
            '2': 'Monday',
            '3': 'Tuesday',
            '4': 'Wednesday',
            '5': 'Thursday',
            '6': 'Friday',
            '7': 'Saturday',
            'SUN': 'Sunday',
            'MON': 'Monday',
            'TUE': 'Tuesday',
            'WED': 'Wednesday',
            'THU': 'Thursday',
            'FRI': 'Friday',
            'SAT': 'Saturday'
        };

        return days[dayNum.toUpperCase()] || dayNum;
    }

    /**
     * Calculate next run time from Flow schedule
     * @param {Object} schedule - Flow schedule
     * @returns {string} Next run time estimate
     */
    calculateNextRun(schedule) {
        // Simplified - actual implementation would need full date math
        return 'See Flow details for exact schedule';
    }

    /**
     * Generate scheduled automation calendar
     * @param {Array} flows - Scheduled flows
     * @param {Array} apex - Scheduled Apex jobs
     * @returns {Object} Calendar with sorted entries
     */
    generateCalendar(flows, apex) {
        const allScheduled = [
            ...flows.map(f => ({ ...f, category: 'Flow' })),
            ...apex.map(a => ({ ...a, category: 'Apex' }))
        ];

        // Sort by next fire time (Apex has actual times, Flows are estimates)
        allScheduled.sort((a, b) => {
            if (a.nextFireTime && b.nextFireTime) {
                return new Date(a.nextFireTime) - new Date(b.nextFireTime);
            }
            if (a.nextFireTime) return -1;
            if (b.nextFireTime) return 1;
            return 0;
        });

        return {
            totalScheduled: allScheduled.length,
            scheduledFlows: flows.length,
            scheduledApex: apex.length,
            entries: allScheduled,
            summary: this.generateScheduleSummary(allScheduled)
        };
    }

    /**
     * Generate summary of scheduled automation
     * @param {Array} scheduled - All scheduled automation
     * @returns {Object} Summary statistics
     */
    generateScheduleSummary(scheduled) {
        const summary = {
            daily: 0,
            weekly: 0,
            monthly: 0,
            hourly: 0,
            custom: 0
        };

        scheduled.forEach(item => {
            const schedule = item.schedule || '';

            if (schedule.includes('Daily')) summary.daily++;
            else if (schedule.includes('Weekly')) summary.weekly++;
            else if (schedule.includes('Monthly')) summary.monthly++;
            else if (schedule.includes('Hourly')) summary.hourly++;
            else summary.custom++;
        });

        return summary;
    }

    /**
     * Execute Salesforce CLI command
     * @param {string} command - SF CLI command
     * @returns {Object} JSON result
     */
    execSfCommand(command) {
        try {
            const output = execSync(command, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
            return JSON.parse(output);
        } catch (error) {
            throw new Error(`Command failed: ${error.message}`);
        }
    }
}

module.exports = ScheduledAutomationDetector;

// CLI usage
if (require.main === module) {
    const orgAlias = process.argv[2];

    if (!orgAlias) {
        console.error('Usage: node scheduled-automation-detector.js <org-alias>');
        process.exit(1);
    }

    (async () => {
        const detector = new ScheduledAutomationDetector(orgAlias);

        const flows = await detector.detectScheduledFlows();
        const apex = await detector.detectScheduledApex();
        const calendar = detector.generateCalendar(flows, apex);

        console.log('\n=== Scheduled Automation Calendar ===');
        console.log(`Total Scheduled: ${calendar.totalScheduled}`);
        console.log(`  - Flows: ${calendar.scheduledFlows}`);
        console.log(`  - Apex Jobs: ${calendar.scheduledApex}`);
        console.log('\nFrequency Breakdown:');
        console.log(`  - Daily: ${calendar.summary.daily}`);
        console.log(`  - Weekly: ${calendar.summary.weekly}`);
        console.log(`  - Monthly: ${calendar.summary.monthly}`);
        console.log(`  - Hourly: ${calendar.summary.hourly}`);
        console.log(`  - Custom: ${calendar.summary.custom}`);

        console.log('\n=== Upcoming Scheduled Automation ===');
        calendar.entries.slice(0, 10).forEach((entry, idx) => {
            console.log(`${idx + 1}. ${entry.name} (${entry.category})`);
            console.log(`   Schedule: ${entry.schedule}`);
            if (entry.nextFireTime) {
                console.log(`   Next Run: ${entry.nextFireTime}`);
            }
            console.log('');
        });

        process.exit(0);
    })().catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
    });
}

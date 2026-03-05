/**
 * Observability Scheduler
 *
 * Manages scheduled bulk export jobs for the observability layer.
 * Supports cron-like scheduling with staggered timing to avoid quota exhaustion.
 *
 * @module observability-scheduler
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Default schedule configuration
 */
const DEFAULT_SCHEDULES = {
  leads: {
    enabled: true,
    frequency: 'daily',
    hour: 2, // 2 AM UTC
    filter: 'createdAt', // or 'updatedAt' if available
    lookbackDays: 1,
    fields: ['id', 'firstName', 'lastName', 'email', 'company', 'leadScore', 'createdAt', 'updatedAt']
  },
  activities: {
    enabled: true,
    frequency: 'daily',
    hour: 3, // 3 AM UTC (staggered from leads)
    lookbackDays: 1,
    activityTypes: [6, 7, 8, 9, 10, 11, 2, 12, 13, 104] // Core engagement types
  },
  programMembers: {
    enabled: true,
    frequency: 'daily',
    hour: 4, // 4 AM UTC (staggered from activities)
    programs: 'active', // 'active', 'all', or array of IDs
    fields: ['leadId', 'firstName', 'lastName', 'email', 'program', 'programId', 'membershipDate', 'statusName', 'reachedSuccess']
  }
};

/**
 * Schedule manager class
 */
class ObservabilityScheduler {
  constructor(portal, options = {}) {
    this.portal = portal;
    this.basePath = options.basePath || `instances/${portal}/observability`;
    this.configPath = `${this.basePath}/config/schedules.json`;
    this.schedules = null;
    this.runningJobs = new Map();
  }

  /**
   * Load or initialize schedule configuration
   */
  async loadConfig() {
    try {
      const content = await fs.readFile(this.configPath, 'utf8');
      this.schedules = JSON.parse(content);
    } catch (error) {
      // Initialize with defaults
      this.schedules = {
        ...DEFAULT_SCHEDULES,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await this.saveConfig();
    }
    return this.schedules;
  }

  /**
   * Save schedule configuration
   */
  async saveConfig() {
    this.schedules.updatedAt = new Date().toISOString();
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(this.schedules, null, 2));
  }

  /**
   * Update schedule for a specific export type
   */
  async updateSchedule(type, config) {
    if (!this.schedules) await this.loadConfig();

    this.schedules[type] = {
      ...this.schedules[type],
      ...config
    };

    await this.saveConfig();
    return this.schedules[type];
  }

  /**
   * Calculate next run time for a schedule
   */
  getNextRunTime(scheduleConfig) {
    const now = new Date();
    const next = new Date(now);

    if (scheduleConfig.frequency === 'hourly') {
      next.setMinutes(0, 0, 0);
      next.setHours(next.getHours() + 1);
    } else if (scheduleConfig.frequency === 'daily') {
      next.setUTCHours(scheduleConfig.hour || 0, 0, 0, 0);
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
    } else if (scheduleConfig.frequency === 'weekly') {
      const targetDay = scheduleConfig.dayOfWeek || 0; // 0 = Sunday
      next.setUTCHours(scheduleConfig.hour || 0, 0, 0, 0);
      while (next.getUTCDay() !== targetDay || next <= now) {
        next.setDate(next.getDate() + 1);
      }
    }

    return next;
  }

  /**
   * Build export configuration for a scheduled job
   */
  buildExportConfig(type, scheduleConfig) {
    const now = new Date();
    const lookbackMs = (scheduleConfig.lookbackDays || 1) * 24 * 60 * 60 * 1000;

    const startAt = new Date(now.getTime() - lookbackMs);
    const endAt = now;

    if (type === 'leads') {
      return {
        type: 'lead',
        fields: scheduleConfig.fields,
        format: 'CSV',
        filter: {
          [scheduleConfig.filter]: {
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString()
          }
        }
      };
    } else if (type === 'activities') {
      return {
        type: 'activity',
        format: 'CSV',
        filter: {
          createdAt: {
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString()
          },
          activityTypeIds: scheduleConfig.activityTypes
        }
      };
    } else if (type === 'programMembers') {
      return {
        type: 'programMember',
        fields: scheduleConfig.fields,
        format: 'CSV',
        programs: scheduleConfig.programs
      };
    }

    throw new Error(`Unknown export type: ${type}`);
  }

  /**
   * Check if a schedule should run now
   */
  shouldRun(type, scheduleConfig) {
    if (!scheduleConfig.enabled) return false;

    const lastRun = scheduleConfig.lastRun ? new Date(scheduleConfig.lastRun) : null;
    const now = new Date();

    if (!lastRun) return true;

    if (scheduleConfig.frequency === 'hourly') {
      return (now - lastRun) >= 60 * 60 * 1000;
    } else if (scheduleConfig.frequency === 'daily') {
      return (now - lastRun) >= 24 * 60 * 60 * 1000;
    } else if (scheduleConfig.frequency === 'weekly') {
      return (now - lastRun) >= 7 * 24 * 60 * 60 * 1000;
    }

    return false;
  }

  /**
   * Get pending exports that should run
   */
  getPendingExports() {
    const pending = [];

    for (const [type, config] of Object.entries(this.schedules)) {
      if (typeof config !== 'object' || !config.enabled) continue;

      if (this.shouldRun(type, config)) {
        pending.push({
          type,
          config,
          exportConfig: this.buildExportConfig(type, config)
        });
      }
    }

    // Sort by priority (activities first, then leads, then programs)
    const priority = { activities: 1, leads: 2, programMembers: 3 };
    pending.sort((a, b) => (priority[a.type] || 99) - (priority[b.type] || 99));

    return pending;
  }

  /**
   * Record that an export ran
   */
  async recordRun(type, result) {
    if (!this.schedules[type]) return;

    this.schedules[type].lastRun = new Date().toISOString();
    this.schedules[type].lastResult = {
      success: result.success,
      exportId: result.exportId,
      recordCount: result.recordCount,
      fileSize: result.fileSize,
      error: result.error
    };

    await this.saveConfig();
  }

  /**
   * Get schedule status summary
   */
  getStatus() {
    const status = {
      portal: this.portal,
      timestamp: new Date().toISOString(),
      schedules: {}
    };

    for (const [type, config] of Object.entries(this.schedules)) {
      if (typeof config !== 'object' || type === 'createdAt' || type === 'updatedAt') continue;

      status.schedules[type] = {
        enabled: config.enabled,
        frequency: config.frequency,
        nextRun: config.enabled ? this.getNextRunTime(config).toISOString() : null,
        lastRun: config.lastRun || null,
        lastSuccess: config.lastResult?.success || null
      };
    }

    return status;
  }
}

/**
 * Stagger export times to avoid quota conflicts
 */
function calculateStaggeredSchedule(baseHour, exportTypes) {
  const staggered = {};
  let offset = 0;

  for (const type of exportTypes) {
    staggered[type] = {
      hour: (baseHour + offset) % 24,
      minute: 0
    };
    offset += 1; // 1 hour between each
  }

  return staggered;
}

/**
 * Estimate quota usage for planned exports
 */
function estimateQuotaUsage(schedules, leadCount, dailyActivityCount) {
  let estimatedBytes = 0;

  if (schedules.leads?.enabled) {
    const fieldsCount = schedules.leads.fields?.length || 8;
    estimatedBytes += leadCount * fieldsCount * 50; // ~50 bytes per field
  }

  if (schedules.activities?.enabled) {
    estimatedBytes += dailyActivityCount * 300; // ~300 bytes per activity
  }

  if (schedules.programMembers?.enabled) {
    // Estimate based on typical program sizes
    estimatedBytes += 500000; // ~500KB per day typical
  }

  return {
    estimatedBytes,
    estimatedMB: (estimatedBytes / 1024 / 1024).toFixed(2),
    percentOfQuota: ((estimatedBytes / (500 * 1024 * 1024)) * 100).toFixed(1)
  };
}

module.exports = {
  ObservabilityScheduler,
  DEFAULT_SCHEDULES,
  calculateStaggeredSchedule,
  estimateQuotaUsage
};

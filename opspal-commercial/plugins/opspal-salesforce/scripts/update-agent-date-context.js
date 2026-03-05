#!/usr/bin/env node

/**
 * Update Agent Date Context
 * 
 * This script updates the shared date context file that all agents reference
 * to maintain temporal awareness.
 * 
 * Usage:
 *   node update-agent-date-context.js              # Updates to current date
 *   node update-agent-date-context.js 2025-09-15   # Updates to specific date
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

class AgentDateContextUpdater {
    constructor() {
        this.contextFile = path.join(__dirname, '..', 'agents', 'shared', 'date-context.yaml');
    }

    /**
     * Get date components from a Date object
     */
    getDateComponents(date) {
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const quarter = Math.ceil(month / 3);
        
        // Calculate fiscal year (assuming calendar year)
        const fiscalYear = year;
        const fiscalYearLabel = `FY${year.toString().slice(-2)}`;
        
        return {
            year,
            month,
            day,
            quarter: `Q${quarter}`,
            fiscalYear: fiscalYearLabel,
            dayOfWeek: date.getDay()
        };
    }

    /**
     * Calculate relative dates
     */
    getRelativeDates(baseDate) {
        const dates = {};
        
        // Create date at midnight UTC
        const date = new Date(baseDate);
        date.setUTCHours(0, 0, 0, 0);
        
        // Today
        dates.today = this.formatDate(date);
        
        // Yesterday
        const yesterday = new Date(date);
        yesterday.setDate(date.getDate() - 1);
        dates.yesterday = this.formatDate(yesterday);
        
        // Tomorrow
        const tomorrow = new Date(date);
        tomorrow.setDate(date.getDate() + 1);
        dates.tomorrow = this.formatDate(tomorrow);
        
        // Start of week (Monday)
        const startOfWeek = new Date(date);
        const dayOfWeek = date.getDay();
        const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        startOfWeek.setDate(date.getDate() + daysToMonday);
        dates.start_of_week = this.formatDate(startOfWeek);
        
        // End of week (Sunday)
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        dates.end_of_week = this.formatDate(endOfWeek);
        
        // Start of month
        const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        dates.start_of_month = this.formatDate(startOfMonth);
        
        // End of month
        const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        dates.end_of_month = this.formatDate(endOfMonth);
        
        // Start of quarter
        const quarter = Math.floor(date.getMonth() / 3);
        const startOfQuarter = new Date(date.getFullYear(), quarter * 3, 1);
        dates.start_of_quarter = this.formatDate(startOfQuarter);
        
        // End of quarter
        const endOfQuarter = new Date(date.getFullYear(), (quarter + 1) * 3, 0);
        dates.end_of_quarter = this.formatDate(endOfQuarter);
        
        // Start of year
        const startOfYear = new Date(date.getFullYear(), 0, 1);
        dates.start_of_year = this.formatDate(startOfYear);
        
        // End of year
        const endOfYear = new Date(date.getFullYear(), 11, 31);
        dates.end_of_year = this.formatDate(endOfYear);
        
        // Last week
        const lastWeekStart = new Date(startOfWeek);
        lastWeekStart.setDate(startOfWeek.getDate() - 7);
        const lastWeekEnd = new Date(lastWeekStart);
        lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
        dates.last_week = `${this.formatDate(lastWeekStart)} to ${this.formatDate(lastWeekEnd)}`;
        
        // Last month
        const lastMonthStart = new Date(date.getFullYear(), date.getMonth() - 1, 1);
        const lastMonthEnd = new Date(date.getFullYear(), date.getMonth(), 0);
        dates.last_month = `${this.formatDate(lastMonthStart)} to ${this.formatDate(lastMonthEnd)}`;
        
        // Last quarter
        const lastQuarter = quarter === 0 ? 3 : quarter - 1;
        const lastQuarterYear = quarter === 0 ? date.getFullYear() - 1 : date.getFullYear();
        const lastQuarterStart = new Date(lastQuarterYear, lastQuarter * 3, 1);
        const lastQuarterEnd = new Date(lastQuarterYear, (lastQuarter + 1) * 3, 0);
        dates.last_quarter = `${this.formatDate(lastQuarterStart)} to ${this.formatDate(lastQuarterEnd)}`;
        
        // Last year
        const lastYearStart = new Date(date.getFullYear() - 1, 0, 1);
        const lastYearEnd = new Date(date.getFullYear() - 1, 11, 31);
        dates.last_year = `${this.formatDate(lastYearStart)} to ${this.formatDate(lastYearEnd)}`;
        
        return dates;
    }

    /**
     * Format date as YYYY-MM-DD
     */
    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Calculate business days remaining
     */
    calculateBusinessDays(startDate, endDate) {
        let count = 0;
        const current = new Date(startDate);
        
        while (current <= endDate) {
            const dayOfWeek = current.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                count++;
            }
            current.setDate(current.getDate() + 1);
        }
        
        return count;
    }

    /**
     * Generate the complete date context
     */
    generateContext(targetDate) {
        const date = targetDate ? new Date(targetDate) : new Date();
        const components = this.getDateComponents(date);
        const relativeDates = this.getRelativeDates(date);
        
        // Calculate business days
        const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        const endOfQuarter = new Date(date.getFullYear(), Math.ceil((date.getMonth() + 1) / 3) * 3, 0);
        
        const businessDaysInMonth = this.calculateBusinessDays(date, endOfMonth);
        const businessDaysInQuarter = this.calculateBusinessDays(date, endOfQuarter);
        
        const context = {
            current_date: this.formatDate(date),
            current_year: components.year,
            current_month: components.month,
            current_day: components.day,
            current_quarter: components.quarter,
            fiscal_year: components.fiscalYear,
            
            temporal_context: {
                timezone: "UTC",
                business_days_remaining_in_month: businessDaysInMonth,
                business_days_remaining_in_quarter: businessDaysInQuarter
            },
            
            date_aware_behaviors: [
                `When querying data, use date literals relative to ${this.formatDate(date)}`,
                `For 'last month' queries, reference ${this.getMonthName(date.getMonth() - 1)} ${date.getMonth() === 0 ? date.getFullYear() - 1 : date.getFullYear()}`,
                `For 'last year' queries, reference ${date.getFullYear() - 1}`,
                `For 'next month' queries, reference ${this.getMonthName(date.getMonth() + 1)} ${date.getMonth() === 11 ? date.getFullYear() + 1 : date.getFullYear()}`,
                "Consider fiscal year when dealing with financial data"
            ],
            
            relative_dates: relativeDates,
            
            soql_date_literals: {
                TODAY: relativeDates.today,
                YESTERDAY: relativeDates.yesterday,
                TOMORROW: relativeDates.tomorrow,
                THIS_WEEK: `${relativeDates.start_of_week} to ${relativeDates.end_of_week}`,
                LAST_WEEK: relativeDates.last_week,
                THIS_MONTH: `${relativeDates.start_of_month} to ${relativeDates.end_of_month}`,
                LAST_MONTH: relativeDates.last_month,
                THIS_QUARTER: `${relativeDates.start_of_quarter} to ${relativeDates.end_of_quarter}`,
                LAST_QUARTER: relativeDates.last_quarter,
                THIS_YEAR: `${relativeDates.start_of_year} to ${relativeDates.end_of_year}`,
                LAST_YEAR: relativeDates.last_year
            },
            
            date_formats: {
                iso_8601: this.formatDate(date),
                us_format: `${String(components.month).padStart(2, '0')}/${String(components.day).padStart(2, '0')}/${components.year}`,
                eu_format: `${String(components.day).padStart(2, '0')}/${String(components.month).padStart(2, '0')}/${components.year}`,
                salesforce_datetime: `${this.formatDate(date)}T00:00:00.000Z`,
                salesforce_date: this.formatDate(date),
                human_readable: `${this.getMonthName(date.getMonth())} ${components.day}, ${components.year}`,
                short_format: `${this.getMonthName(date.getMonth()).slice(0, 3)} ${components.day}, ${components.year}`
            },
            
            usage_notes: [
                "Import this context at agent initialization",
                "Use current_date for any date-aware operations",
                "Reference soql_date_literals for Salesforce queries",
                "Update this file daily or use dynamic date generation"
            ],
            
            last_updated: this.formatDate(new Date()),
            update_frequency: "Daily or as needed",
            maintained_by: "System Administrator"
        };
        
        return context;
    }

    /**
     * Get month name
     */
    getMonthName(monthIndex) {
        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        // Handle wrap-around
        const index = ((monthIndex % 12) + 12) % 12;
        return months[index];
    }

    /**
     * Update the context file
     */
    async updateContextFile(targetDate) {
        try {
            const context = this.generateContext(targetDate);
            
            // Add header comment
            const header = `# Shared Date Context for All Agents
# This file provides temporal awareness to all ClaudeSFDC agents
# Update this file to keep agents aware of the current date
# Last auto-updated: ${context.last_updated}

`;
            
            const yamlContent = yaml.dump(context, {
                indent: 2,
                lineWidth: 120,
                noRefs: true
            });
            
            await fs.writeFile(this.contextFile, header + yamlContent, 'utf8');
            
            console.log(`✅ Date context updated successfully`);
            console.log(`   Current date: ${context.current_date}`);
            console.log(`   File: ${this.contextFile}`);
            
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to update date context: ${error.message}`);
            return false;
        }
    }

    /**
     * Create initial directories if needed
     */
    async ensureDirectories() {
        const dir = path.dirname(this.contextFile);
        try {
            await fs.mkdir(dir, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }
    }
}

// CLI execution
async function main() {
    const updater = new AgentDateContextUpdater();
    
    // Get target date from command line or use current date
    const targetDate = process.argv[2] || null;
    
    if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
        console.error('❌ Invalid date format. Use YYYY-MM-DD');
        process.exit(1);
    }
    
    // Ensure directories exist
    await updater.ensureDirectories();
    
    // Update the context file
    const success = await updater.updateContextFile(targetDate);
    
    process.exit(success ? 0 : 1);
}

// Export for use as module
module.exports = AgentDateContextUpdater;

// Run if called directly
if (require.main === module) {
    main();
}
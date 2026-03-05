#!/usr/bin/env node

/**
 * User Preference Tracker
 * 
 * Tracks and enforces user preferences across all Salesforce operations
 * Maintains project-specific constraints and preference history
 * 
 * Created: 2025-09-03
 * Purpose: Address the issue of agents not respecting user preferences (e.g., "no Apex")
 */

const fs = require('fs');
const path = require('path');

class UserPreferenceTracker {
    constructor(options = {}) {
        this.preferencesFile = options.preferencesFile || 
            path.join(__dirname, '../../config/user-preferences.json');
        this.project = options.project || process.env.SFDC_PROJECT || 'default';
        this.preferences = this.loadPreferences();
    }

    /**
     * Load preferences from file
     */
    loadPreferences() {
        try {
            if (fs.existsSync(this.preferencesFile)) {
                const data = fs.readFileSync(this.preferencesFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading preferences:', error.message);
        }
        
        // Return default preferences if file doesn't exist
        return this.getDefaultPreferences();
    }

    /**
     * Save preferences to file
     */
    savePreferences() {
        try {
            const dir = path.dirname(this.preferencesFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(
                this.preferencesFile,
                JSON.stringify(this.preferences, null, 2)
            );
            return true;
        } catch (error) {
            console.error('Error saving preferences:', error.message);
            return false;
        }
    }

    /**
     * Get default preferences structure
     */
    getDefaultPreferences() {
        return {
            project: 'default',
            constraints: {
                development: {
                    no_apex: false,
                    no_code: false,
                    minimal_customization: false,
                    declarative_only: false
                },
                deployment: {
                    gradual_rollout: false,
                    big_bang: false,
                    user_pilot: false,
                    require_approval: true
                },
                testing: {
                    full_regression: true,
                    targeted_testing: false,
                    user_acceptance: true,
                    automated_testing: true
                }
            },
            preferences: {
                preserve_existing: true,
                explicit_changes_only: true,
                require_confirmation: true,
                auto_rollback: true,
                error_notifications: true
            },
            history: [],
            projects: {}
        };
    }

    /**
     * Set a preference value
     */
    setPreference(category, key, value) {
        if (!this.preferences.constraints[category]) {
            this.preferences.constraints[category] = {};
        }
        
        const oldValue = this.preferences.constraints[category][key];
        this.preferences.constraints[category][key] = value;
        
        // Add to history
        this.addToHistory({
            action: 'set_preference',
            category,
            key,
            oldValue,
            newValue: value,
            timestamp: new Date().toISOString(),
            project: this.project
        });
        
        this.savePreferences();
        return true;
    }

    /**
     * Get a preference value
     */
    getPreference(category, key) {
        // Check project-specific preferences first
        if (this.preferences.projects[this.project]) {
            const projectPrefs = this.preferences.projects[this.project];
            if (projectPrefs.constraints && 
                projectPrefs.constraints[category] && 
                projectPrefs.constraints[category][key] !== undefined) {
                return projectPrefs.constraints[category][key];
            }
        }
        
        // Fall back to global preferences
        if (this.preferences.constraints[category]) {
            return this.preferences.constraints[category][key];
        }
        
        return undefined;
    }

    /**
     * Check if a specific constraint is active
     */
    hasConstraint(constraint) {
        const constraints = {
            'no_apex': ['development', 'no_apex'],
            'no_code': ['development', 'no_code'],
            'declarative_only': ['development', 'declarative_only'],
            'require_approval': ['deployment', 'require_approval'],
            'full_regression': ['testing', 'full_regression']
        };
        
        if (constraints[constraint]) {
            const [category, key] = constraints[constraint];
            return this.getPreference(category, key) === true;
        }
        
        return false;
    }

    /**
     * Validate a plan against preferences
     */
    validatePlan(plan) {
        const violations = [];
        
        // Check for Apex usage when no_apex is set
        if (this.hasConstraint('no_apex') && plan.includes('apex')) {
            violations.push({
                constraint: 'no_apex',
                message: 'Plan includes Apex code but user preference is "no Apex"',
                suggestion: 'Use declarative tools like Flows or Process Builder instead'
            });
        }
        
        // Check for code when no_code is set
        if (this.hasConstraint('no_code') && 
            (plan.includes('trigger') || plan.includes('class'))) {
            violations.push({
                constraint: 'no_code',
                message: 'Plan includes custom code but user preference is "no code"',
                suggestion: 'Use configuration and declarative tools only'
            });
        }
        
        // Check for approval requirement
        if (this.hasConstraint('require_approval') && 
            !plan.includes('approval')) {
            violations.push({
                constraint: 'require_approval',
                message: 'Deployment requires approval but plan doesn\'t include approval step',
                suggestion: 'Add approval checkpoint before deployment'
            });
        }
        
        return {
            valid: violations.length === 0,
            violations
        };
    }

    /**
     * Set project-specific preferences
     */
    setProjectPreference(project, category, key, value) {
        if (!this.preferences.projects[project]) {
            this.preferences.projects[project] = {
                constraints: {}
            };
        }
        
        if (!this.preferences.projects[project].constraints[category]) {
            this.preferences.projects[project].constraints[category] = {};
        }
        
        this.preferences.projects[project].constraints[category][key] = value;
        
        this.addToHistory({
            action: 'set_project_preference',
            project,
            category,
            key,
            value,
            timestamp: new Date().toISOString()
        });
        
        this.savePreferences();
        return true;
    }

    /**
     * Get all active constraints for current project
     */
    getActiveConstraints() {
        const constraints = [];
        
        // Collect all active constraints
        const categories = ['development', 'deployment', 'testing'];
        
        for (const category of categories) {
            const categoryConstraints = this.preferences.constraints[category] || {};
            
            // Check project-specific overrides
            if (this.preferences.projects[this.project]) {
                const projectConstraints = 
                    this.preferences.projects[this.project].constraints[category] || {};
                Object.assign(categoryConstraints, projectConstraints);
            }
            
            // Add active constraints to list
            for (const [key, value] of Object.entries(categoryConstraints)) {
                if (value === true) {
                    constraints.push(`${category}.${key}`);
                }
            }
        }
        
        return constraints;
    }

    /**
     * Add entry to preference history
     */
    addToHistory(entry) {
        if (!this.preferences.history) {
            this.preferences.history = [];
        }
        
        this.preferences.history.push(entry);
        
        // Keep only last 100 history entries
        if (this.preferences.history.length > 100) {
            this.preferences.history = this.preferences.history.slice(-100);
        }
    }

    /**
     * Clear project-specific preferences
     */
    clearProjectPreferences(project) {
        if (this.preferences.projects[project]) {
            delete this.preferences.projects[project];
            
            this.addToHistory({
                action: 'clear_project_preferences',
                project,
                timestamp: new Date().toISOString()
            });
            
            this.savePreferences();
            return true;
        }
        
        return false;
    }

    /**
     * Export preferences for a project
     */
    exportProjectPreferences(project) {
        const projectPrefs = this.preferences.projects[project] || {};
        const globalPrefs = this.preferences.constraints;
        
        // Merge global and project preferences
        const merged = JSON.parse(JSON.stringify(globalPrefs));
        
        if (projectPrefs.constraints) {
            for (const [category, constraints] of Object.entries(projectPrefs.constraints)) {
                if (!merged[category]) {
                    merged[category] = {};
                }
                Object.assign(merged[category], constraints);
            }
        }
        
        return {
            project,
            constraints: merged,
            active_constraints: this.getActiveConstraints(),
            metadata: {
                exported_at: new Date().toISOString(),
                version: '2.0.0'
            }
        };
    }
}

// CLI Usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    const tracker = new UserPreferenceTracker();
    
    try {
        switch(command) {
            case 'set':
                const [, category, key, value] = args;
                const boolValue = value === 'true';
                tracker.setPreference(category, key, boolValue);
                console.log(`Set ${category}.${key} = ${boolValue}`);
                break;
                
            case 'get':
                const [, getCategory, getKey] = args;
                const getValue = tracker.getPreference(getCategory, getKey);
                console.log(`${getCategory}.${getKey} = ${getValue}`);
                break;
                
            case 'check':
                const [, constraint] = args;
                const hasIt = tracker.hasConstraint(constraint);
                console.log(`Constraint "${constraint}" is ${hasIt ? 'ACTIVE' : 'inactive'}`);
                break;
                
            case 'list':
                const constraints = tracker.getActiveConstraints();
                console.log('Active Constraints:');
                constraints.forEach(c => console.log(`  - ${c}`));
                break;
                
            case 'validate':
                const [, ...planWords] = args;
                const plan = planWords.join(' ');
                const validation = tracker.validatePlan(plan);
                if (validation.valid) {
                    console.log('✅ Plan is valid');
                } else {
                    console.log('❌ Plan violates preferences:');
                    validation.violations.forEach(v => {
                        console.log(`  - ${v.message}`);
                        console.log(`    Suggestion: ${v.suggestion}`);
                    });
                }
                break;
                
            case 'export':
                const [, exportProject] = args;
                const prefs = tracker.exportProjectPreferences(exportProject || tracker.project);
                console.log(JSON.stringify(prefs, null, 2));
                break;
                
            default:
                console.log(`User Preference Tracker

Usage:
  user-preference-tracker set <category> <key> <true|false>
  user-preference-tracker get <category> <key>
  user-preference-tracker check <constraint>
  user-preference-tracker list
  user-preference-tracker validate <plan description>
  user-preference-tracker export [project]

Examples:
  node user-preference-tracker.js set development no_apex true
  node user-preference-tracker.js check no_apex
  node user-preference-tracker.js list
  node user-preference-tracker.js validate "Create Apex trigger for Account"`);
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

module.exports = UserPreferenceTracker;
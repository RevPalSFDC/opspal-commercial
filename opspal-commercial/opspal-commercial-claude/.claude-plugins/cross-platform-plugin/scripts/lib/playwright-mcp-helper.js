#!/usr/bin/env node

/**
 * Playwright MCP Helper Library
 *
 * Provides utilities for Playwright MCP browser automation including:
 * - Session management (load/save browser state)
 * - Snapshot parsing utilities
 * - Element reference extraction
 * - Common wait patterns for Salesforce/HubSpot
 * - Screenshot organization
 * - Platform-specific URL builders
 *
 * @version 1.0.0
 * @date 2025-12-03
 */

const fs = require('fs');
const path = require('path');

/**
 * Session Manager - Handles browser session persistence
 */
class SessionManager {
    constructor(options = {}) {
        this.sessionDir = options.sessionDir || path.join(process.cwd(), 'instances');
        this.sessionFileName = options.sessionFileName || '.browser-session.json';
    }

    /**
     * Get session file path for an instance
     * @param {string} instanceName - Name of the instance (org alias or portal name)
     * @param {string} platform - Platform type ('salesforce' or 'hubspot')
     * @returns {string} Full path to session file
     */
    getSessionPath(instanceName, platform = 'salesforce') {
        const prefix = platform === 'hubspot' ? '.hubspot-session.json' : '.salesforce-session.json';
        return path.join(this.sessionDir, instanceName, prefix);
    }

    /**
     * Check if a valid session exists
     * @param {string} instanceName - Instance identifier
     * @param {string} platform - Platform type
     * @param {number} maxAgeHours - Maximum session age in hours (default: 24)
     * @returns {boolean} True if valid session exists
     */
    hasValidSession(instanceName, platform = 'salesforce', maxAgeHours = 24) {
        const sessionPath = this.getSessionPath(instanceName, platform);

        if (!fs.existsSync(sessionPath)) {
            return false;
        }

        try {
            const stats = fs.statSync(sessionPath);
            const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
            return ageHours < maxAgeHours;
        } catch (error) {
            return false;
        }
    }

    /**
     * Load session data
     * @param {string} instanceName - Instance identifier
     * @param {string} platform - Platform type
     * @returns {Object|null} Session data or null if not found
     */
    loadSession(instanceName, platform = 'salesforce') {
        const sessionPath = this.getSessionPath(instanceName, platform);

        if (!fs.existsSync(sessionPath)) {
            return null;
        }

        try {
            return JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
        } catch (error) {
            console.error(`Failed to load session: ${error.message}`);
            return null;
        }
    }

    /**
     * Save session data
     * @param {string} instanceName - Instance identifier
     * @param {string} platform - Platform type
     * @param {Object} sessionData - Session data to save
     */
    saveSession(instanceName, platform, sessionData) {
        const sessionPath = this.getSessionPath(instanceName, platform);
        const sessionDir = path.dirname(sessionPath);

        // Ensure directory exists
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
        console.log(`Session saved to: ${sessionPath}`);
    }

    /**
     * Clear session
     * @param {string} instanceName - Instance identifier
     * @param {string} platform - Platform type
     */
    clearSession(instanceName, platform = 'salesforce') {
        const sessionPath = this.getSessionPath(instanceName, platform);

        if (fs.existsSync(sessionPath)) {
            fs.unlinkSync(sessionPath);
            console.log(`Session cleared: ${sessionPath}`);
        }
    }
}

/**
 * Snapshot Parser - Utilities for parsing accessibility snapshots
 */
class SnapshotParser {
    /**
     * Extract element references from a snapshot
     * @param {Object} snapshot - Browser accessibility snapshot
     * @returns {Array} Array of element references with roles and text
     */
    static extractElements(snapshot) {
        const elements = [];

        function traverse(node, depth = 0) {
            if (!node) return;

            const element = {
                ref: node.ref,
                role: node.role,
                name: node.name,
                value: node.value,
                depth: depth,
                children: []
            };

            if (node.ref) {
                elements.push(element);
            }

            if (node.children && Array.isArray(node.children)) {
                for (const child of node.children) {
                    traverse(child, depth + 1);
                }
            }
        }

        traverse(snapshot);
        return elements;
    }

    /**
     * Find element by role and name
     * @param {Object} snapshot - Browser accessibility snapshot
     * @param {string} role - Element role (button, textbox, link, etc.)
     * @param {string} namePattern - Name pattern to match (can be partial)
     * @returns {Object|null} First matching element or null
     */
    static findElement(snapshot, role, namePattern) {
        const elements = this.extractElements(snapshot);
        const pattern = namePattern.toLowerCase();

        return elements.find(el =>
            el.role === role &&
            el.name &&
            el.name.toLowerCase().includes(pattern)
        ) || null;
    }

    /**
     * Find all elements by role
     * @param {Object} snapshot - Browser accessibility snapshot
     * @param {string} role - Element role to filter by
     * @returns {Array} Array of matching elements
     */
    static findAllByRole(snapshot, role) {
        const elements = this.extractElements(snapshot);
        return elements.filter(el => el.role === role);
    }

    /**
     * Find clickable elements (buttons, links)
     * @param {Object} snapshot - Browser accessibility snapshot
     * @returns {Array} Array of clickable elements
     */
    static findClickables(snapshot) {
        const elements = this.extractElements(snapshot);
        const clickableRoles = ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio'];
        return elements.filter(el => clickableRoles.includes(el.role));
    }

    /**
     * Find form inputs
     * @param {Object} snapshot - Browser accessibility snapshot
     * @returns {Array} Array of form input elements
     */
    static findFormInputs(snapshot) {
        const elements = this.extractElements(snapshot);
        const inputRoles = ['textbox', 'combobox', 'spinbutton', 'searchbox', 'checkbox', 'radio', 'slider'];
        return elements.filter(el => inputRoles.includes(el.role));
    }

    /**
     * Get text content summary from snapshot
     * @param {Object} snapshot - Browser accessibility snapshot
     * @returns {string} Concatenated text content
     */
    static getTextContent(snapshot) {
        const elements = this.extractElements(snapshot);
        return elements
            .filter(el => el.name || el.value)
            .map(el => el.name || el.value)
            .join(' ');
    }
}

/**
 * URL Builder - Platform-specific URL construction
 */
class URLBuilder {
    /**
     * Build Salesforce Setup URL
     * @param {string} baseUrl - Salesforce base URL
     * @param {string} setupPath - Setup path (e.g., 'ObjectManager/Account/FieldsAndRelationships')
     * @returns {string} Full Setup URL
     */
    static salesforceSetup(baseUrl, setupPath) {
        // Remove trailing slash from base URL
        const base = baseUrl.replace(/\/$/, '');
        return `${base}/lightning/setup/${setupPath}/home`;
    }

    /**
     * Build Salesforce record URL
     * @param {string} baseUrl - Salesforce base URL
     * @param {string} recordId - Record ID
     * @returns {string} Full record URL
     */
    static salesforceRecord(baseUrl, recordId) {
        const base = baseUrl.replace(/\/$/, '');
        return `${base}/lightning/r/${recordId}/view`;
    }

    /**
     * Build Salesforce Flow Builder URL
     * @param {string} baseUrl - Salesforce base URL
     * @param {string} flowId - Flow ID or API name
     * @returns {string} Full Flow Builder URL
     */
    static salesforceFlowBuilder(baseUrl, flowId) {
        const base = baseUrl.replace(/\/$/, '');
        return `${base}/builder_platform_interaction/flowBuilder.app?flowId=${flowId}`;
    }

    /**
     * Build HubSpot Settings URL
     * @param {string} portalId - HubSpot portal ID
     * @param {string} settingsPath - Settings path
     * @returns {string} Full settings URL
     */
    static hubspotSettings(portalId, settingsPath) {
        return `https://app.hubspot.com/settings/${portalId}/${settingsPath}`;
    }

    /**
     * Build HubSpot Workflow URL
     * @param {string} portalId - HubSpot portal ID
     * @param {string} workflowId - Workflow ID
     * @returns {string} Full workflow URL
     */
    static hubspotWorkflow(portalId, workflowId) {
        return `https://app.hubspot.com/workflows/${portalId}/platform/flow/${workflowId}/edit`;
    }

    /**
     * Build HubSpot Report URL
     * @param {string} portalId - HubSpot portal ID
     * @param {string} reportId - Report ID
     * @returns {string} Full report URL
     */
    static hubspotReport(portalId, reportId) {
        return `https://app.hubspot.com/reports-dashboard/${portalId}/view/${reportId}`;
    }
}

/**
 * Screenshot Manager - Organize and manage screenshots
 */
class ScreenshotManager {
    constructor(options = {}) {
        this.baseDir = options.baseDir || path.join(process.cwd(), 'instances');
        this.screenshotDir = options.screenshotDir || 'screenshots';
    }

    /**
     * Generate screenshot filename
     * @param {string} instanceName - Instance identifier
     * @param {string} context - Screenshot context (e.g., 'setup-permissions')
     * @param {string} format - File format ('png' or 'jpeg')
     * @returns {string} Full path for screenshot
     */
    generatePath(instanceName, context, format = 'png') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `${context}_${timestamp}.${format}`;
        return path.join(this.baseDir, instanceName, this.screenshotDir, filename);
    }

    /**
     * Ensure screenshot directory exists
     * @param {string} instanceName - Instance identifier
     */
    ensureDir(instanceName) {
        const dir = path.join(this.baseDir, instanceName, this.screenshotDir);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return dir;
    }

    /**
     * List screenshots for an instance
     * @param {string} instanceName - Instance identifier
     * @returns {Array} Array of screenshot filenames
     */
    listScreenshots(instanceName) {
        const dir = path.join(this.baseDir, instanceName, this.screenshotDir);

        if (!fs.existsSync(dir)) {
            return [];
        }

        return fs.readdirSync(dir)
            .filter(f => f.endsWith('.png') || f.endsWith('.jpeg'))
            .sort()
            .reverse(); // Most recent first
    }
}

/**
 * Wait Patterns - Common wait strategies for Salesforce/HubSpot
 */
const WaitPatterns = {
    salesforce: {
        pageLoad: {
            text: 'Loading',
            timeout: 30000,
            description: 'Wait for Salesforce page to finish loading'
        },
        setupMenu: {
            text: 'Setup',
            timeout: 15000,
            description: 'Wait for Setup menu to appear'
        },
        lightningSpinner: {
            text: 'Loading...',
            timeout: 20000,
            description: 'Wait for Lightning spinner to disappear'
        },
        toastMessage: {
            text: 'success',
            timeout: 10000,
            description: 'Wait for toast success message'
        }
    },
    hubspot: {
        pageLoad: {
            text: 'HubSpot',
            timeout: 30000,
            description: 'Wait for HubSpot page to load'
        },
        settingsLoad: {
            text: 'Settings',
            timeout: 15000,
            description: 'Wait for settings page to load'
        },
        workflowCanvas: {
            text: 'workflow',
            timeout: 20000,
            description: 'Wait for workflow canvas to load'
        },
        saveConfirm: {
            text: 'Saved',
            timeout: 10000,
            description: 'Wait for save confirmation'
        }
    }
};

/**
 * MCP Tool Helpers - Convenience wrappers for common operations
 */
const MCPHelpers = {
    /**
     * Generate navigation command
     * @param {string} url - URL to navigate to
     * @returns {Object} MCP tool call configuration
     */
    navigate(url) {
        return {
            tool: 'mcp__playwright__browser_navigate',
            params: { url }
        };
    },

    /**
     * Generate snapshot command
     * @returns {Object} MCP tool call configuration
     */
    snapshot() {
        return {
            tool: 'mcp__playwright__browser_snapshot',
            params: {}
        };
    },

    /**
     * Generate click command
     * @param {string} element - Element description or ref
     * @returns {Object} MCP tool call configuration
     */
    click(element) {
        return {
            tool: 'mcp__playwright__browser_click',
            params: { element }
        };
    },

    /**
     * Generate type command
     * @param {string} element - Element description or ref
     * @param {string} text - Text to type
     * @returns {Object} MCP tool call configuration
     */
    type(element, text) {
        return {
            tool: 'mcp__playwright__browser_type',
            params: { element, text }
        };
    },

    /**
     * Generate fill command (clears field first)
     * @param {string} element - Element description or ref
     * @param {string} value - Value to fill
     * @returns {Object} MCP tool call configuration
     */
    fill(element, value) {
        return {
            tool: 'mcp__playwright__browser_fill',
            params: { element, value }
        };
    },

    /**
     * Generate screenshot command
     * @param {string} filename - Optional filename for screenshot
     * @returns {Object} MCP tool call configuration
     */
    screenshot(filename) {
        return {
            tool: 'mcp__playwright__browser_take_screenshot',
            params: filename ? { name: filename } : {}
        };
    },

    /**
     * Generate wait command
     * @param {string} text - Text to wait for
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Object} MCP tool call configuration
     */
    waitForText(text, timeout = 30000) {
        return {
            tool: 'mcp__playwright__browser_wait',
            params: { text, timeout }
        };
    },

    /**
     * Generate PDF save command
     * @param {string} filename - PDF filename
     * @returns {Object} MCP tool call configuration
     */
    savePDF(filename) {
        return {
            tool: 'mcp__playwright__browser_save_as_pdf',
            params: { filename }
        };
    }
};

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
        case 'check-session':
            const instanceName = args[1];
            const platform = args[2] || 'salesforce';
            const sessionManager = new SessionManager();
            const hasSession = sessionManager.hasValidSession(instanceName, platform);
            console.log(JSON.stringify({
                instance: instanceName,
                platform,
                hasValidSession: hasSession
            }, null, 2));
            break;

        case 'list-screenshots':
            const instance = args[1];
            const screenshotManager = new ScreenshotManager();
            const screenshots = screenshotManager.listScreenshots(instance);
            console.log(JSON.stringify({ instance, screenshots }, null, 2));
            break;

        case 'help':
        default:
            console.log(`
Playwright MCP Helper Library

Usage:
  node playwright-mcp-helper.js <command> [options]

Commands:
  check-session <instance> [platform]  Check if valid session exists
  list-screenshots <instance>          List screenshots for instance
  help                                 Show this help message

Examples:
  node playwright-mcp-helper.js check-session myorg salesforce
  node playwright-mcp-helper.js list-screenshots myorg
`);
    }
}

module.exports = {
    SessionManager,
    SnapshotParser,
    URLBuilder,
    ScreenshotManager,
    WaitPatterns,
    MCPHelpers
};

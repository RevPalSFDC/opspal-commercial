#!/usr/bin/env node

/**
 * Tool Inventory System
 * Discovers and catalogs all tools across the ClaudeSFDC project
 * Identifies capabilities, dependencies, and usage patterns
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const PROJECT_ROOT = path.join(__dirname, '..');
const INVENTORY_FILE = path.join(PROJECT_ROOT, 'tool-inventory.json');
const LIB_DIR = path.join(PROJECT_ROOT, 'scripts', 'lib');
const UTILITIES_DIR = path.join(PROJECT_ROOT, 'scripts', 'utilities');
const MONITORING_DIR = path.join(PROJECT_ROOT, 'scripts', 'monitoring');

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m',
    red: '\x1b[31m',
    gray: '\x1b[90m'
};

// Helper functions
function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
    console.log(`${colors.green}[✓]${colors.reset} ${message}`);
}

function logWarning(message) {
    console.log(`${colors.yellow}[!]${colors.reset} ${message}`);
}

function logError(message) {
    console.log(`${colors.red}[✗]${colors.reset} ${message}`);
}

function logInfo(message) {
    console.log(`${colors.blue}[i]${colors.reset} ${message}`);
}

// Extract tool metadata from JavaScript file
function analyzeJavaScriptTool(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const fileName = path.basename(filePath);
        
        const tool = {
            name: fileName.replace('.js', ''),
            type: 'javascript',
            path: path.relative(PROJECT_ROOT, filePath),
            size: fs.statSync(filePath).size,
            lastModified: fs.statSync(filePath).mtime,
            capabilities: [],
            dependencies: [],
            operations: [],
            description: ''
        };

        // Extract description from comments
        const descMatch = content.match(/\/\*\*[\s\S]*?\*\//);
        if (descMatch) {
            const descLines = descMatch[0].split('\n')
                .filter(line => !line.includes('/**') && !line.includes('*/'))
                .map(line => line.replace(/^\s*\*\s?/, ''))
                .filter(line => line.length > 0);
            if (descLines.length > 0) {
                tool.description = descLines[0];
            }
        }

        // Extract operations/functions
        const functionMatches = content.matchAll(/(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/g);
        for (const match of functionMatches) {
            const funcName = match[1] || match[2];
            if (funcName && !funcName.startsWith('_')) {
                tool.operations.push(funcName);
            }
        }

        // Extract exports
        const exportMatches = content.matchAll(/module\.exports(?:\.\w+)?\s*=|exports\.(\w+)\s*=/g);
        for (const match of exportMatches) {
            if (match[1]) {
                tool.operations.push(match[1]);
            }
        }

        // Extract required modules
        const requireMatches = content.matchAll(/require\(['"`]([^'"`]+)['"`]\)/g);
        for (const match of requireMatches) {
            if (!match[1].startsWith('.')) {
                tool.dependencies.push(match[1]);
            }
        }

        // Detect capabilities based on content
        if (content.includes('force:data:soql:query')) tool.capabilities.push('SOQL queries');
        if (content.includes('force:source:deploy')) tool.capabilities.push('Metadata deployment');
        if (content.includes('force:source:retrieve')) tool.capabilities.push('Metadata retrieval');
        if (content.includes('bulk:') || content.includes('bulk')) tool.capabilities.push('Bulk operations');
        if (content.includes('validation')) tool.capabilities.push('Validation');
        if (content.includes('error') && content.includes('recovery')) tool.capabilities.push('Error recovery');
        if (content.includes('preflight')) tool.capabilities.push('Pre-flight checks');
        if (content.includes('rollback')) tool.capabilities.push('Rollback support');
        if (content.includes('parse') || content.includes('parser')) tool.capabilities.push('Output parsing');
        if (content.includes('field')) tool.capabilities.push('Field operations');
        if (content.includes('picklist')) tool.capabilities.push('Picklist management');
        if (content.includes('flow')) tool.capabilities.push('Flow operations');
        if (content.includes('template')) tool.capabilities.push('Template generation');

        return tool;
    } catch (error) {
        logError(`Failed to analyze ${filePath}: ${error.message}`);
        return null;
    }
}

// Extract tool metadata from Shell script
function analyzeShellTool(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const fileName = path.basename(filePath);
        
        const tool = {
            name: fileName.replace('.sh', ''),
            type: 'shell',
            path: path.relative(PROJECT_ROOT, filePath),
            size: fs.statSync(filePath).size,
            lastModified: fs.statSync(filePath).mtime,
            capabilities: [],
            functions: [],
            description: ''
        };

        // Extract description from header comments
        const descMatch = content.match(/^#\s+(.+?)(?:\n#\s+(.+?))?/m);
        if (descMatch) {
            tool.description = descMatch[1];
        }

        // Extract functions
        const functionMatches = content.matchAll(/^(?:function\s+)?(\w+)\s*\(\)/gm);
        for (const match of functionMatches) {
            tool.functions.push(match[1]);
        }

        // Detect capabilities
        if (content.includes('sf ')) tool.capabilities.push('SF CLI operations');
        if (content.includes('deploy')) tool.capabilities.push('Deployment');
        if (content.includes('validate')) tool.capabilities.push('Validation');
        if (content.includes('rollback')) tool.capabilities.push('Rollback');
        if (content.includes('cleanup')) tool.capabilities.push('Cleanup operations');
        if (content.includes('bulk')) tool.capabilities.push('Bulk operations');
        if (content.includes('test')) tool.capabilities.push('Testing');

        return tool;
    } catch (error) {
        logError(`Failed to analyze ${filePath}: ${error.message}`);
        return null;
    }
}

// Find all tool files
function findTools(directory) {
    const tools = [];
    
    if (!fs.existsSync(directory)) {
        return tools;
    }

    try {
        const items = fs.readdirSync(directory, { withFileTypes: true });
        
        for (const item of items) {
            const fullPath = path.join(directory, item.name);
            
            if (item.isFile()) {
                if (item.name.endsWith('.js')) {
                    const tool = analyzeJavaScriptTool(fullPath);
                    if (tool) tools.push(tool);
                } else if (item.name.endsWith('.sh')) {
                    const tool = analyzeShellTool(fullPath);
                    if (tool) tools.push(tool);
                }
            }
        }
    } catch (error) {
        logError(`Error scanning directory ${directory}: ${error.message}`);
    }
    
    return tools;
}

// Categorize tools by functionality
function categorizeTools(tools) {
    const categories = {
        'Data Operations': [],
        'Metadata Management': [],
        'Validation & Testing': [],
        'Deployment & Release': [],
        'Field & Schema': [],
        'Flow & Automation': [],
        'Error Handling': [],
        'Monitoring & Analytics': [],
        'Utilities': []
    };

    for (const tool of tools) {
        // Categorize based on name and capabilities
        if (tool.name.includes('data') || tool.name.includes('bulk') || 
            tool.capabilities.includes('Bulk operations') || tool.capabilities.includes('SOQL queries')) {
            categories['Data Operations'].push(tool.name);
        }
        if (tool.name.includes('metadata') || tool.name.includes('deploy') || 
            tool.capabilities.includes('Metadata deployment')) {
            categories['Metadata Management'].push(tool.name);
        }
        if (tool.name.includes('valid') || tool.name.includes('test') || tool.name.includes('preflight') ||
            tool.capabilities.includes('Validation')) {
            categories['Validation & Testing'].push(tool.name);
        }
        if (tool.name.includes('deploy') || tool.name.includes('release') || tool.name.includes('rollback')) {
            categories['Deployment & Release'].push(tool.name);
        }
        if (tool.name.includes('field') || tool.name.includes('schema') || tool.name.includes('picklist')) {
            categories['Field & Schema'].push(tool.name);
        }
        if (tool.name.includes('flow') || tool.name.includes('automation')) {
            categories['Flow & Automation'].push(tool.name);
        }
        if (tool.name.includes('error') || tool.name.includes('recovery')) {
            categories['Error Handling'].push(tool.name);
        }
        if (tool.name.includes('monitor') || tool.name.includes('analyz')) {
            categories['Monitoring & Analytics'].push(tool.name);
        }
        
        // Default category
        if (!Object.values(categories).some(cat => cat.includes(tool.name))) {
            categories['Utilities'].push(tool.name);
        }
    }

    // Remove duplicates
    for (const category in categories) {
        categories[category] = [...new Set(categories[category])];
    }

    return categories;
}

// Identify duplicate or overlapping tools
function findDuplicates(tools) {
    const duplicates = [];
    const capabilities = {};

    // Group tools by capabilities
    for (const tool of tools) {
        for (const capability of tool.capabilities) {
            if (!capabilities[capability]) {
                capabilities[capability] = [];
            }
            capabilities[capability].push(tool.name);
        }
    }

    // Find overlapping tools
    for (const [capability, toolNames] of Object.entries(capabilities)) {
        if (toolNames.length > 1) {
            duplicates.push({
                capability,
                tools: toolNames
            });
        }
    }

    return duplicates;
}

// Main inventory function
async function createToolInventory() {
    log('\n========================================', 'bright');
    log('Tool Inventory System', 'bright');
    log('========================================\n', 'bright');

    const inventory = {
        version: '1.0.0',
        generated: new Date().toISOString(),
        statistics: {},
        tools: [],
        categories: {},
        duplicates: [],
        recommendations: []
    };

    // Scan directories
    log('Scanning for tools...', 'blue');
    
    const directories = [
        { name: 'Library', path: LIB_DIR },
        { name: 'Utilities', path: UTILITIES_DIR },
        { name: 'Monitoring', path: MONITORING_DIR },
        { name: 'Scripts Root', path: path.join(PROJECT_ROOT, 'scripts') }
    ];

    for (const dir of directories) {
        log(`\nScanning ${dir.name}...`, 'blue');
        const tools = findTools(dir.path);
        
        if (tools.length > 0) {
            logSuccess(`Found ${tools.length} tools in ${dir.name}`);
            inventory.tools.push(...tools);
        } else {
            logWarning(`No tools found in ${dir.name}`);
        }
    }

    // Remove duplicates from inventory
    const uniqueTools = [];
    const seenPaths = new Set();
    for (const tool of inventory.tools) {
        if (!seenPaths.has(tool.path)) {
            uniqueTools.push(tool);
            seenPaths.add(tool.path);
        }
    }
    inventory.tools = uniqueTools;

    // Categorize tools
    inventory.categories = categorizeTools(inventory.tools);

    // Find duplicates
    inventory.duplicates = findDuplicates(inventory.tools);

    // Calculate statistics
    inventory.statistics = {
        totalTools: inventory.tools.length,
        javascriptTools: inventory.tools.filter(t => t.type === 'javascript').length,
        shellTools: inventory.tools.filter(t => t.type === 'shell').length,
        totalOperations: inventory.tools.reduce((sum, t) => sum + (t.operations?.length || 0), 0),
        categoriesCount: Object.keys(inventory.categories).length,
        duplicatesFound: inventory.duplicates.length
    };

    // Generate recommendations
    if (inventory.duplicates.length > 0) {
        inventory.recommendations.push({
            type: 'consolidation',
            message: `Found ${inventory.duplicates.length} capabilities with multiple implementations. Consider consolidating.`,
            details: inventory.duplicates
        });
    }

    const underutilized = inventory.tools.filter(t => 
        (!t.operations || t.operations.length === 0) && 
        (!t.functions || t.functions.length === 0)
    );
    if (underutilized.length > 0) {
        inventory.recommendations.push({
            type: 'review',
            message: `${underutilized.length} tools have no exported operations. Review for removal or documentation.`,
            tools: underutilized.map(t => t.name)
        });
    }

    // Save inventory
    fs.writeFileSync(INVENTORY_FILE, JSON.stringify(inventory, null, 2));
    logSuccess(`\nTool inventory saved to ${path.relative(PROJECT_ROOT, INVENTORY_FILE)}`);

    // Print summary
    log('\n========================================', 'bright');
    log('Inventory Summary', 'bright');
    log('========================================\n', 'bright');

    console.log(`Total tools discovered: ${colors.green}${inventory.statistics.totalTools}${colors.reset}`);
    console.log(`  JavaScript tools: ${inventory.statistics.javascriptTools}`);
    console.log(`  Shell scripts: ${inventory.statistics.shellTools}`);
    console.log(`  Total operations: ${inventory.statistics.totalOperations}`);

    console.log('\nTools by category:');
    for (const [category, tools] of Object.entries(inventory.categories)) {
        if (tools.length > 0) {
            console.log(`  ${colors.blue}${category}${colors.reset}: ${tools.length} tools`);
        }
    }

    if (inventory.duplicates.length > 0) {
        console.log('\n' + colors.yellow + 'Overlapping capabilities detected:' + colors.reset);
        for (const dup of inventory.duplicates.slice(0, 5)) {
            console.log(`  ${dup.capability}: ${dup.tools.join(', ')}`);
        }
        if (inventory.duplicates.length > 5) {
            console.log(`  ... and ${inventory.duplicates.length - 5} more`);
        }
    }

    if (inventory.recommendations.length > 0) {
        console.log('\n' + colors.blue + 'Recommendations:' + colors.reset);
        for (const rec of inventory.recommendations) {
            console.log(`  • ${rec.message}`);
        }
    }

    logSuccess('\nTool inventory complete!');
    
    return inventory;
}

// Export functions for use in other scripts
module.exports = {
    createToolInventory,
    analyzeJavaScriptTool,
    analyzeShellTool,
    findTools,
    categorizeTools,
    findDuplicates
};

// Run if executed directly
if (require.main === module) {
    createToolInventory().catch(error => {
        logError(`Inventory creation failed: ${error.message}`);
        process.exit(1);
    });
}

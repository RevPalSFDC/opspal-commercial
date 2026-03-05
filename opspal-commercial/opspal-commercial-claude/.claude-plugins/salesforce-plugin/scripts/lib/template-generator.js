#!/usr/bin/env node

/**
 * Template Generator for Salesforce Reports and Dashboards
 * Generates valid metadata from templates
 */

const fs = require('fs');
const path = require('path');

// Load templates
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const dashboardTemplates = require(path.join(TEMPLATES_DIR, 'dashboard-components.json'));
const reportTemplates = require(path.join(TEMPLATES_DIR, 'report-formats.json'));

class TemplateGenerator {
    constructor(apiVersion = '64.0') {
        this.apiVersion = apiVersion;
    }

    // Generate dashboard component from template
    generateDashboardComponent(type, options = {}) {
        const template = dashboardTemplates.componentTemplates[type];
        if (!template) {
            throw new Error(`Unknown component type: ${type}`);
        }

        const component = JSON.parse(JSON.stringify(template.template));
        
        // Apply options
        Object.assign(component, options);
        
        // Validate required fields
        for (const field of template.requiredFields) {
            if (!component[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
        
        return component;
    }

    // Generate complete dashboard metadata
    generateDashboard(name, components = [], options = {}) {
        const settings = dashboardTemplates.dashboardSettings.standard;
        
        const dashboard = {
            ...settings,
            ...options,
            dashboardGridLayout: {
                dashboardGridComponents: components.map((comp, index) => ({
                    colSpan: comp.colSpan || 6,
                    columnIndex: comp.columnIndex || (index % 2) * 6,
                    rowIndex: comp.rowIndex || Math.floor(index / 2) * 8,
                    rowSpan: comp.rowSpan || 8,
                    dashboardComponent: this.generateDashboardComponent(comp.type, comp.options)
                })),
                numberOfColumns: 12,
                rowHeight: 'Medium'
            }
        };
        
        return this.toXML('Dashboard', dashboard);
    }

    // Generate report from template
    generateReport(format, options = {}) {
        const template = reportTemplates.reportTypes[format.toLowerCase()];
        if (!template) {
            throw new Error(`Unknown report format: ${format}`);
        }

        const report = {
            ...template.template,
            ...options,
            reportApiVersion: this.apiVersion
        };
        
        return this.toXML('Report', report);
    }

    // Convert JavaScript object to XML
    toXML(rootElement, obj) {
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<${rootElement} xmlns="http://soap.sforce.com/2006/04/metadata">\n`;
        xml += this.objectToXML(obj, 1);
        xml += `</${rootElement}>`;
        return xml;
    }

    objectToXML(obj, indent = 0) {
        let xml = '';
        const spaces = '    '.repeat(indent);
        
        for (const [key, value] of Object.entries(obj)) {
            if (value === null || value === undefined) continue;
            
            if (Array.isArray(value)) {
                for (const item of value) {
                    xml += `${spaces}<${key}>${this.valueToXML(item, indent)}</${key}>\n`;
                }
            } else if (typeof value === 'object') {
                xml += `${spaces}<${key}>\n`;
                xml += this.objectToXML(value, indent + 1);
                xml += `${spaces}</${key}>\n`;
            } else {
                xml += `${spaces}<${key}>${this.escapeXML(value)}</${key}>\n`;
            }
        }
        
        return xml;
    }

    valueToXML(value, indent) {
        if (typeof value === 'object') {
            return '\n' + this.objectToXML(value, indent + 1) + '    '.repeat(indent);
        }
        return this.escapeXML(value);
    }

    escapeXML(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    // Apply fixes for common issues
    applyAutoFixes(metadata) {
        // Fix color palettes
        metadata = metadata.replace(/>wildflowers</g, '>unity<');
        
        // Fix chart types
        metadata = metadata.replace(/>Column</g, '>VerticalColumn<');
        
        // Fix date intervals
        metadata = metadata.replace(/>THIS_YEAR</g, '>INTERVAL_CURY<');
        metadata = metadata.replace(/>LAST_YEAR</g, '>INTERVAL_PREVY<');
        
        return metadata;
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
Template Generator for Salesforce Metadata

Usage: node template-generator.js <command> [options]

Commands:
  dashboard <name>    Generate dashboard metadata
  report <format>     Generate report metadata
  component <type>    Generate dashboard component
  list-templates      List available templates

Options:
  --api <version>     API version (default: 64.0)
  --output <file>     Output file path
  --apply-fixes       Apply automatic fixes

Examples:
  node template-generator.js dashboard "Sales Dashboard" --output dashboard.xml
  node template-generator.js report summary --output report.xml
  node template-generator.js component metric
        `);
        process.exit(0);
    }
    
    const command = args[0];
    const generator = new TemplateGenerator();
    
    try {
        let result;
        
        switch(command) {
            case 'dashboard':
                result = generator.generateDashboard(args[1] || 'Dashboard');
                break;
            
            case 'report':
                result = generator.generateReport(args[1] || 'summary');
                break;
            
            case 'component':
                result = JSON.stringify(
                    generator.generateDashboardComponent(args[1] || 'metric'),
                    null, 2
                );
                break;
            
            case 'list-templates':
                console.log('\nDashboard Components:');
                Object.keys(dashboardTemplates.componentTemplates).forEach(t => 
                    console.log(`  - ${t}`));
                console.log('\nReport Formats:');
                Object.keys(reportTemplates.reportTypes).forEach(t => 
                    console.log(`  - ${t}`));
                process.exit(0);
                break;
            
            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }
        
        // Apply fixes if requested
        if (args.includes('--apply-fixes')) {
            result = generator.applyAutoFixes(result);
        }
        
        // Output result
        const outputIndex = args.indexOf('--output');
        if (outputIndex > -1 && args[outputIndex + 1]) {
            fs.writeFileSync(args[outputIndex + 1], result);
            console.log(`Generated: ${args[outputIndex + 1]}`);
        } else {
            console.log(result);
        }
        
    } catch (error) {
        console.error('Generation error:', error.message);
        process.exit(1);
    }
}

module.exports = TemplateGenerator;